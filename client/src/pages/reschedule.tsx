import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { CalendarDays, Check, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import BookingCalendar from "@/components/BookingCalendar";

interface RescheduleInfo {
  contactId: string;
  nombre: string;
  empresa: string;
  email: string;
  fechaCita: string | null;
  horaCita: string | null;
  meetingStatus: string | null;
}

interface RescheduleResult {
  success: boolean;
  meetLink: string | null;
  calendarAddUrl: string | null;
  fechaCita: string;
  horaCita: string;
}

type PageState = "loading" | "form" | "submitting" | "success" | "error";

export default function ReschedulePage() {
  const { contactId } = useParams<{ contactId: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [info, setInfo] = useState<RescheduleInfo | null>(null);
  const [result, setResult] = useState<RescheduleResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  useEffect(() => {
    document.title = "Reagendar Sesión | IM3 Systems";
    return () => { document.title = "IM3 Systems | Desarrollo de software, automatización e inteligencia artificial para empresas"; };
  }, []);

  useEffect(() => {
    if (!contactId) return;
    fetch(`/api/reschedule-info/${contactId}`)
      .then((r) => {
        if (!r.ok) throw new Error("No encontrado");
        return r.json();
      })
      .then((data: RescheduleInfo) => {
        setInfo(data);
        setState("form");
      })
      .catch(() => {
        setErrorMsg("No pudimos encontrar tu información. El enlace puede haber expirado.");
        setState("error");
      });
  }, [contactId]);

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime || !contactId) return;
    setState("submitting");

    try {
      const res = await fetch(`/api/reschedule/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaCita: selectedDate, horaCita: selectedTime }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error procesando reagendamiento");
      }

      const data: RescheduleResult = await res.json();
      setResult(data);
      setState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado");
      setState("error");
    }
  };

  const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

  return (
    <div className="min-h-screen text-foreground font-sans selection:bg-primary/20 relative overflow-hidden flex flex-col bg-background">
      {/* Top bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-foreground z-50" />
      <div className="w-full border-b border-border bg-background/80 backdrop-blur-sm z-40 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/assets/im3-logo.png" alt="IM3 Systems" className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span>Reschedule</span>
          </div>
        </div>
      </div>

      <div className="flex-grow flex items-start justify-center">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-10 md:py-16">

          {/* Loading */}
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Cargando tu información...</p>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              className="text-center py-16"
            >
              <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl">!</span>
              </div>
              <h2 className="text-xl font-medium text-foreground mb-3">Algo salió mal</h2>
              <p className="text-sm text-muted-foreground mb-6">{errorMsg}</p>
              <Link href="/booking" className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors">
                Agendar nueva sesión
              </Link>
            </motion.div>
          )}

          {/* Form */}
          {(state === "form" || state === "submitting") && info && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Reagendar</p>
                  <h1 className="text-lg font-medium text-foreground">Elige una nueva fecha</h1>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-2">
                {info.nombre}, selecciona una nueva fecha y horario para tu sesión de diagnóstico{info.empresa ? ` de ${info.empresa}` : ""}.
              </p>

              {info.fechaCita && info.horaCita && info.meetingStatus !== "cancelled" && (
                <p className="text-xs text-muted-foreground mb-6 px-3 py-2 bg-muted/50 border border-border rounded-sm">
                  Fecha actual: <span className="font-medium text-foreground capitalize">
                    {format(new Date(info.fechaCita + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                  </span> a las <span className="font-medium text-foreground font-mono">{info.horaCita}</span>
                </p>
              )}

              <div className="mb-6">
                <BookingCalendar
                  selectedDate={selectedDate}
                  selectedTime={selectedTime}
                  onDateChange={setSelectedDate}
                  onTimeChange={setSelectedTime}
                />
              </div>

              {/* Confirmation bar + submit */}
              <AnimatePresence>
                {selectedDate && selectedTime && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-sm">
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate capitalize">
                          {format(new Date(selectedDate + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-mono text-primary font-medium">{selectedTime}</span>
                          <span className="text-[10px] text-muted-foreground">· 45 min · Sesión de diagnóstico</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={state === "submitting"}
                      className="w-full bg-primary text-primary-foreground py-3.5 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {state === "submitting" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Reagendando...
                        </>
                      ) : (
                        "Confirmar nueva fecha"
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Success */}
          {state === "success" && result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-green-500" />
              </div>

              <h2 className="text-xl font-medium text-foreground mb-2">Sesión reagendada</h2>
              <p className="text-sm text-muted-foreground mb-8">
                Tu nueva sesión de diagnóstico está confirmada.
              </p>

              <div className="bg-card border border-border rounded-lg p-6 mb-8 text-left">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Nueva fecha</span>
                </div>
                <p className="text-lg font-medium text-foreground capitalize mb-1">
                  {format(new Date(result.fechaCita + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </p>
                <p className="text-sm font-mono text-primary font-medium mb-4">{result.horaCita} · 45 min</p>

                <div className="flex flex-col sm:flex-row gap-3">
                  {result.meetLink && (
                    <a
                      href={result.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
                    >
                      Unirse a la reunión
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {result.calendarAddUrl && (
                    <a
                      href={result.calendarAddUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 border border-border px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-muted transition-colors text-foreground"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      Agregar al calendario
                    </a>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Recibirás un correo de confirmación con los detalles actualizados.
              </p>
            </motion.div>
          )}

        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border py-3 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-1 sm:flex-row sm:justify-between text-[10px] text-muted-foreground font-mono uppercase">
          <span>IM3 Systems</span>
          <span>IM3 © 2026</span>
        </div>
      </div>
    </div>
  );
}
