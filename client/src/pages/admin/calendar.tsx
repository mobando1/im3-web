import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, ExternalLink, Video, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";

type Appointment = {
  id: string;
  fechaCita: string;
  horaCita: string;
  contactName: string;
  contactCompany: string;
  contactId: string;
  meetLink: string | null;
  googleDriveUrl: string | null;
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

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const apt of appointments) {
      const date = parseDateString(apt.fechaCita);
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(apt);
    }
    return map;
  }, [appointments]);

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
    return appointments
      .filter((a) => {
        const d = parseDateString(a.fechaCita);
        return d && d.getTime() >= now.getTime() - 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const da = parseDateString(a.fechaCita)?.getTime() || 0;
        const db = parseDateString(b.fechaCita)?.getTime() || 0;
        return da - db;
      })
      .slice(0, 10);
  }, [appointments]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Calendario</h2>

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
                        className={`bg-white min-h-[80px] p-1.5 ${isToday ? "ring-2 ring-[#2FA4A9] ring-inset" : ""}`}
                      >
                        <span
                          className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                            isToday ? "bg-[#2FA4A9] text-white" : "text-gray-600"
                          }`}
                        >
                          {cell.day}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {apts.slice(0, 2).map((apt) => (
                            <button
                              key={apt.id}
                              onClick={() => apt.contactId && navigate(`/admin/contacts/${apt.contactId}`)}
                              className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#2FA4A9]/10 text-[#2FA4A9] hover:bg-[#2FA4A9]/20 transition-colors truncate block"
                            >
                              {apt.horaCita} {apt.contactName}
                            </button>
                          ))}
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
              upcoming.map((apt) => (
                <div
                  key={apt.id}
                  className="rounded-lg border border-gray-100 p-3 hover:border-[#2FA4A9]/30 transition-colors cursor-pointer"
                  onClick={() => apt.contactId && navigate(`/admin/contacts/${apt.contactId}`)}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{apt.contactName}</p>
                  <p className="text-xs text-gray-500 truncate">{apt.contactCompany}</p>
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
                  {apt.meetLink && (
                    <a
                      href={apt.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 mt-2 text-xs text-[#2FA4A9] hover:underline"
                    >
                      <Video className="w-3 h-3" />
                      Google Meet
                    </a>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
