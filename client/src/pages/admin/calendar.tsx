import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, Clock, ExternalLink, Video, ChevronLeft, ChevronRight, Plus, Trash2, X, Check, UserX } from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";

type Appointment = {
  id: string;
  fechaCita: string;
  horaCita: string;
  contactName: string;
  contactCompany: string;
  contactId: string;
  meetLink: string | null;
  googleDriveUrl: string | null;
  meetingStatus?: string;
  source?: "diagnostic" | "manual" | "google_calendar";
  htmlLink?: string | null;
};

type ExternalCalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  start: string | null;
  end: string | null;
  startDate: string | null;
  startTime: string | null;
  isAllDay: boolean;
  meetLink: string | null;
  htmlLink: string | null;
  organizerEmail: string | null;
  attendees: Array<{ email: string; displayName: string | null; responseStatus: string | null }>;
  status: string | null;
  source: "google_calendar";
  matchedContact?: { id: string; nombre: string; empresa: string; email: string } | null;
};

type ManualAppointment = {
  id: string;
  contactId: string | null;
  title: string;
  date: string;
  time: string;
  duration: number;
  notes: string | null;
  meetLink: string | null;
  status: string | null;
  createdAt: string;
};

const meetingStatusColors: Record<string, string> = {
  scheduled: "bg-[#2FA4A9]/10 text-[#2FA4A9]",
  completed: "bg-emerald-100 text-emerald-700",
  no_show: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function parseDateString(fechaCita: string): Date | null {
  // Handles formats like "2026-03-15", "15/03/2026", "marzo 15, 2026"
  const d = new Date(fechaCita);
  if (!isNaN(d.getTime())) return d;

  // Try dd/mm/yyyy
  const parts = fechaCita.split("/");
  if (parts.length === 3) {
    const parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_NAMES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

export default function CalendarPage() {
  const [, navigate] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/admin/calendar"],
  });

  const { data: manualAppointments = [] } = useQuery<ManualAppointment[]>({
    queryKey: ["/api/admin/appointments"],
  });

  // Phase 3: External Google Calendar events (info@im3systems.com primary)
  const [showExternalEvents, setShowExternalEvents] = useState(true);
  const { data: externalEvents = [] } = useQuery<ExternalCalendarEvent[]>({
    queryKey: ["/api/admin/calendar/external-events"],
    enabled: showExternalEvents,
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newDuration, setNewDuration] = useState("45");
  const [newNotes, setNewNotes] = useState("");
  const [newContactId, setNewContactId] = useState("");

  // Contacts list for the selector
  const { data: contactsList = [] } = useQuery<Array<{ id: string; nombre: string; empresa: string; email: string; telefono: string | null }>>({
    queryKey: ["/api/admin/contacts"],
  });

  // Auto-fill title when contact is selected
  const handleContactSelect = (contactId: string) => {
    setNewContactId(contactId);
    if (contactId) {
      const contact = contactsList.find((c: any) => c.id === contactId);
      if (contact && !newTitle) {
        setNewTitle(`Reunión con ${contact.nombre} — ${contact.empresa}`);
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/appointments", {
        contactId: newContactId || undefined,
        title: newTitle,
        date: newDate,
        time: newTime,
        duration: parseInt(newDuration),
        notes: newNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar"] });
      setShowCreate(false);
      setNewTitle("");
      setNewDate("");
      setNewTime("10:00");
      setNewDuration("45");
      setNewNotes("");
      setNewContactId("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/appointments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
    },
  });

  // Status mutations for both diagnostic and manual appointments
  const diagnosticStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/diagnostics/${id}/meeting-status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar"] });
    },
  });

  const appointmentStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/appointments/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
    },
  });

  // Track CRM-known meetLinks so we skip the same event when it shows up via Google
  const crmMeetLinks = useMemo(() => {
    const set = new Set<string>();
    for (const a of appointments) if (a.meetLink) set.add(a.meetLink);
    for (const m of manualAppointments) if (m.meetLink) set.add(m.meetLink);
    return set;
  }, [appointments, manualAppointments]);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const apt of appointments) {
      const date = parseDateString(apt.fechaCita);
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push({ ...apt, source: "diagnostic" });
    }
    for (const ma of manualAppointments) {
      const key = ma.date;
      if (!map[key]) map[key] = [];
      map[key].push({
        id: `manual-${ma.id}`,
        fechaCita: ma.date,
        horaCita: ma.time,
        contactName: ma.title,
        contactCompany: "",
        contactId: ma.contactId || "",
        meetLink: ma.meetLink,
        googleDriveUrl: null,
        meetingStatus: ma.status || "scheduled",
        source: "manual",
      });
    }
    if (showExternalEvents) {
      for (const ev of externalEvents) {
        if (!ev.startDate) continue;
        // Skip events already created from the CRM (same Meet link)
        if (ev.meetLink && crmMeetLinks.has(ev.meetLink)) continue;
        if (!map[ev.startDate]) map[ev.startDate] = [];
        map[ev.startDate].push({
          id: `gcal-${ev.id}`,
          fechaCita: ev.startDate,
          horaCita: ev.startTime || (ev.isAllDay ? "Todo el día" : "—"),
          contactName: ev.matchedContact ? ev.matchedContact.nombre : ev.summary,
          contactCompany: ev.matchedContact?.empresa || (ev.organizerEmail || ""),
          contactId: ev.matchedContact?.id || "",
          meetLink: ev.meetLink,
          googleDriveUrl: null,
          meetingStatus: ev.status === "cancelled" ? "cancelled" : "scheduled",
          source: "google_calendar",
          htmlLink: ev.htmlLink,
        });
      }
    }
    return map;
  }, [appointments, manualAppointments, externalEvents, showExternalEvents, crmMeetLinks]);

  // Calendar grid
  const firstDay = new Date(currentMonth.year, currentMonth.month, 1);
  const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday=0
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const calendarDays: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendarDays.push({ day: d, key });
  }

  const prevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { ...prev, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  // Upcoming appointments for the sidebar
  const upcoming = useMemo(() => {
    const now = new Date();
    const converted: Appointment[] = manualAppointments.map((ma) => ({
      id: `manual-${ma.id}`,
      fechaCita: ma.date,
      horaCita: ma.time,
      contactName: ma.title,
      contactCompany: "",
      contactId: ma.contactId || "",
      meetLink: ma.meetLink,
      googleDriveUrl: null,
      meetingStatus: ma.status || "scheduled",
      source: "manual" as const,
    }));
    const externals: Appointment[] = showExternalEvents
      ? externalEvents
          .filter((ev) => ev.startDate && (!ev.meetLink || !crmMeetLinks.has(ev.meetLink)))
          .map((ev) => ({
            id: `gcal-${ev.id}`,
            fechaCita: ev.startDate || "",
            horaCita: ev.startTime || (ev.isAllDay ? "Todo el día" : "—"),
            contactName: ev.matchedContact ? ev.matchedContact.nombre : ev.summary,
            contactCompany: ev.matchedContact?.empresa || (ev.organizerEmail || ""),
            contactId: ev.matchedContact?.id || "",
            meetLink: ev.meetLink,
            googleDriveUrl: null,
            meetingStatus: ev.status === "cancelled" ? "cancelled" : "scheduled",
            source: "google_calendar" as const,
            htmlLink: ev.htmlLink,
          }))
      : [];
    const taggedDiagnostics: Appointment[] = appointments.map((a) => ({ ...a, source: "diagnostic" as const }));
    return [...taggedDiagnostics, ...converted, ...externals]
      .filter((a) => {
        const d = parseDateString(a.fechaCita);
        return d && d.getTime() >= now.getTime() - 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const da = parseDateString(a.fechaCita)?.getTime() || 0;
        const db = parseDateString(b.fechaCita)?.getTime() || 0;
        return da - db;
      })
      .slice(0, 15);
  }, [appointments, manualAppointments, externalEvents, showExternalEvents, crmMeetLinks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900">Calendario</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExternalEvents((v) => !v)}
            className="text-xs h-8"
            data-testid="toggle-external-events"
          >
            <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
            {showExternalEvents ? "Ocultar Google Calendar" : "Mostrar Google Calendar"}
            {showExternalEvents && externalEvents.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0 rounded-full">
                {externalEvents.length}
              </span>
            )}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white gap-1.5">
            <Plus className="w-4 h-4" /> Nueva Cita
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-700">Nueva Cita</CardTitle>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Selector de contacto */}
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Cliente (opcional)</label>
                <select
                  value={newContactId}
                  onChange={(e) => handleContactSelect(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]"
                >
                  <option value="">— Sin cliente asociado —</option>
                  {contactsList.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {c.empresa} ({c.email})
                    </option>
                  ))}
                </select>
                {newContactId && (() => {
                  const selected = contactsList.find((c: any) => c.id === newContactId);
                  if (!selected) return null;
                  return (
                    <div className="mt-1.5 bg-[#2FA4A9]/5 border border-[#2FA4A9]/20 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-0.5">
                      <p><strong className="text-gray-800">{selected.nombre}</strong> · {selected.empresa}</p>
                      <p>📧 {selected.email}{selected.telefono ? ` · 📱 ${selected.telefono}` : ""}</p>
                    </div>
                  );
                })()}
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Titulo</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Reunion de seguimiento..." className="bg-white border-gray-200 text-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="bg-white border-gray-200 text-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="bg-white border-gray-200 text-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Duracion (min)</label>
                <Input type="number" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className="bg-white border-gray-200 text-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notas</label>
                <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Opcional..." className="bg-white border-gray-200 text-gray-900" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={!newTitle.trim() || !newDate || createMutation.isPending} className="bg-[#2FA4A9] hover:bg-[#238b8f] text-white">
                {createMutation.isPending ? "Creando..." : "Crear Cita"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} className="border-gray-200 text-gray-600">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <Card className="bg-white border-gray-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900">
                {MONTH_NAMES[currentMonth.month]} {currentMonth.year}
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={prevMonth} className="text-gray-500 hover:text-gray-900">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={nextMonth} className="text-gray-500 hover:text-gray-900">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 bg-gray-50 rounded animate-pulse" />
            ) : (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-2">
                  {DAY_NAMES.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Calendar cells */}
                <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
                  {calendarDays.map((cell, i) => {
                    if (!cell) {
                      return <div key={`empty-${i}`} className="bg-white min-h-[80px] p-1" />;
                    }
                    const apts = appointmentsByDate[cell.key] || [];
                    const isToday = cell.key === todayKey;

                    return (
                      <div
                        key={cell.key}
                        className={`bg-white min-h-[80px] p-1.5 cursor-pointer hover:bg-gray-50 transition-colors ${isToday ? "ring-2 ring-[#2FA4A9] ring-inset" : ""}`}
                        onClick={() => {
                          setNewDate(cell.key);
                          setShowCreate(true);
                        }}
                      >
                        <span
                          className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                            isToday ? "bg-[#2FA4A9] text-white" : "text-gray-600"
                          }`}
                        >
                          {cell.day}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {apts.slice(0, 2).map((apt) => {
                            const isExternal = apt.source === "google_calendar";
                            const statusClass = isExternal
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : (meetingStatusColors[apt.meetingStatus || "scheduled"] || meetingStatusColors.scheduled);
                            const handleClick = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (apt.contactId) navigate(`/admin/contacts/${apt.contactId}`);
                              else if (isExternal && apt.htmlLink) window.open(apt.htmlLink, "_blank", "noopener,noreferrer");
                            };
                            return (
                              <button
                                key={apt.id}
                                onClick={handleClick}
                                className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium ${statusClass} hover:opacity-80 transition-colors truncate block`}
                                title={isExternal ? "Evento de Google Calendar" : undefined}
                              >
                                {isExternal && <span className="mr-0.5">🗓</span>}
                                {apt.horaCita} {apt.contactName}
                              </button>
                            );
                          })}
                          {apts.length > 2 && (
                            <p className="text-[10px] text-gray-400 px-1.5">
                              +{apts.length - 2} mas
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Upcoming appointments sidebar */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Proximas Citas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-50 rounded animate-pulse" />
              ))
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Sin citas proximas</p>
            ) : (
              upcoming.map((apt) => {
                const status = apt.meetingStatus || "scheduled";
                const isManual = apt.id.startsWith("manual-");
                const isExternal = apt.source === "google_calendar";
                const realId = isManual ? apt.id.replace("manual-", "") : apt.id;

                return (
                  <div
                    key={apt.id}
                    className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                      isExternal ? "border-blue-200 bg-blue-50/20 hover:border-blue-300" :
                      status === "completed" ? "border-emerald-200 bg-emerald-50/30" :
                      status === "no_show" ? "border-red-200 bg-red-50/30" :
                      "border-gray-100 hover:border-[#2FA4A9]/30"
                    }`}
                    onClick={() => {
                      if (apt.contactId) navigate(`/admin/contacts/${apt.contactId}`);
                      else if (isExternal && apt.htmlLink) window.open(apt.htmlLink, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{apt.contactName}</p>
                        <p className="text-xs text-gray-500 truncate">{apt.contactCompany}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isExternal && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-blue-50 text-blue-700 border-blue-200" title="Evento de Google Calendar">
                            🗓 Google
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${
                          status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          status === "no_show" ? "bg-red-50 text-red-700 border-red-200" :
                          status === "cancelled" ? "bg-gray-100 text-gray-500 border-gray-200" :
                          "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {status === "completed" ? "Completada" : status === "no_show" ? "No show" : status === "cancelled" ? "Cancelada" : "Agendada"}
                        </Badge>
                        {isManual && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(realId);
                            }}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" />
                        {apt.fechaCita}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {apt.horaCita}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {apt.meetLink && (
                        <a
                          href={apt.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-[#2FA4A9] hover:underline"
                        >
                          <Video className="w-3 h-3" />
                          Meet
                        </a>
                      )}
                      {status === "scheduled" && !isExternal && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isManual) {
                                appointmentStatusMutation.mutate({ id: realId, status: "completed" });
                              } else {
                                diagnosticStatusMutation.mutate({ id: realId, status: "completed" });
                              }
                            }}
                            className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 hover:text-emerald-800 font-medium"
                          >
                            <Check className="w-3 h-3" /> Completada
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isManual) {
                                appointmentStatusMutation.mutate({ id: realId, status: "no_show" });
                              } else {
                                diagnosticStatusMutation.mutate({ id: realId, status: "no_show" });
                              }
                            }}
                            className="inline-flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700 font-medium"
                          >
                            <UserX className="w-3 h-3" /> No show
                          </button>
                        </>
                      )}
                      {isExternal && apt.htmlLink && (
                        <a
                          href={apt.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" /> Abrir en Google
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
