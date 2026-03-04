import { useState, useMemo, useEffect, useRef } from "react";
import { UseFormReturn } from "react-hook-form";
import { CalendarDays, Clock, Check, ChevronLeft, ChevronRight, Mail, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  format, addDays, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth,
  isBefore, isAfter, isWeekend, startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const SESSION_MIN = 45;
const BUFFER_MIN = 20;
const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

// 1pm-5pm with 45 min sessions + 20 min buffer = 4 slots
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  let totalMin = 13 * 60; // start at 1:00 PM
  const endMin = 17 * 60;  // end by 5:00 PM
  while (totalMin + SESSION_MIN <= endMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    totalMin += SESSION_MIN + BUFFER_MIN;
  }
  return slots;
}

export default function StepBooking({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const email = watch("email");
  const fechaCita = watch("fechaCita");
  const horaCita = watch("horaCita");

  // Email is valid if it matches basic email pattern
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");

  // Track email for abandonment detection
  const trackedEmailRef = useRef<string>("");
  useEffect(() => {
    if (emailValid && email && email !== trackedEmailRef.current) {
      trackedEmailRef.current = email;
      fetch("/api/track-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => {});
    }
  }, [emailValid, email]);

  const today = startOfDay(new Date());
  const maxDate = addDays(today, 90);
  const [viewMonth, setViewMonth] = useState(startOfMonth(today));

  const timeSlots = useMemo(generateTimeSlots, []);

  const selectedDate = fechaCita ? new Date(fechaCita + "T12:00:00") : undefined;

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const canGoPrev = isAfter(startOfMonth(viewMonth), startOfMonth(today));
  const canGoNext = isBefore(endOfMonth(viewMonth), maxDate);

  const handleDateSelect = (date: Date) => {
    setValue("fechaCita", format(date, "yyyy-MM-dd"), { shouldValidate: true });
    setValue("horaCita", "", { shouldValidate: true });
  };

  const handleTimeSelect = (time: string) => {
    setValue("horaCita", time, { shouldValidate: true });
  };

  const isDayDisabled = (date: Date) => {
    return isBefore(date, today) || isWeekend(date) || isAfter(date, maxDate);
  };

  return (
    <div className="space-y-6">
      {/* Step header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 1 de 9</p>
          <h2 className="text-lg font-medium text-foreground">Agendar Cita</h2>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Ingrese su correo electrónico para agendar su sesión de diagnóstico.
      </p>

      {/* Email gate */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          Correo electrónico
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="Ej: juan@empresa.com"
          {...register("email")}
          className="max-w-md"
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {/* Scarcity badge */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-sm">
        <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Disponibilidad limitada</span> — Solo realizamos 2 auditorías por semana para garantizar un análisis profundo y personalizado de cada empresa.
        </p>
      </div>

      {/* Calendar — visible only when email is valid */}
      <AnimatePresence>
        {emailValid && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease }}
          >
            <p className="text-xs text-muted-foreground mb-3">
              Seleccione una fecha y horario disponible.
            </p>

      {/* Main card — side by side on md+ */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">

          {/* Left: Custom Calendar */}
          <div className="p-5 md:p-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-5">
              <button
                type="button"
                onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                disabled={!canGoPrev}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <h3 className="text-lg font-semibold tracking-tight capitalize">
                {format(viewMonth, "MMMM yyyy", { locale: es })}
              </h3>

              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                disabled={!canGoNext}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-[11px] font-mono uppercase tracking-wider text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map((day) => {
                const disabled = isDayDisabled(day);
                const isCurrentMonth = isSameMonth(day, viewMonth);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const isToday = isSameDay(day, today);
                const isWeekendDay = isWeekend(day);

                return (
                  <div key={day.toISOString()} className="flex items-center justify-center py-0.5">
                    <button
                      type="button"
                      onClick={() => handleDateSelect(day)}
                      disabled={disabled || !isCurrentMonth}
                      className={[
                        "w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center",
                        "text-sm transition-all duration-200 select-none",
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/25"
                          : isToday
                          ? "font-semibold text-primary ring-2 ring-primary/30"
                          : !isCurrentMonth
                          ? "text-muted-foreground/25 cursor-default"
                          : disabled
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : isWeekendDay
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : "text-foreground font-medium hover:bg-primary/10 cursor-pointer",
                      ].join(" ")}
                    >
                      {format(day, "d")}
                    </button>
                  </div>
                );
              })}
            </div>

            {errors.fechaCita && <p className="text-xs text-destructive mt-3">{errors.fechaCita.message}</p>}
          </div>

          {/* Right: Time slots */}
          <AnimatePresence>
            {fechaCita && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease }}
                className="border-t md:border-t-0 md:border-l border-border bg-muted/30"
              >
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Horario</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 capitalize">
                    {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                  </p>

                  <div className="space-y-1.5 max-h-[380px] md:max-h-[400px] overflow-y-auto pr-1">
                    {timeSlots.map((time, i) => {
                      const isSelected = horaCita === time;
                      return (
                        <motion.button
                          key={time}
                          type="button"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02, duration: 0.2 }}
                          onClick={() => handleTimeSelect(time)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-sm transition-all cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card hover:border-primary/50 hover:bg-primary/5 text-foreground"
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-4 h-4 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="font-mono text-sm font-medium">{time}</span>
                          <span className={`text-[10px] ml-auto ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            45 min
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {errors.horaCita && <p className="text-xs text-destructive mt-2">{errors.horaCita.message}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Confirmation bar */}
      <AnimatePresence>
        {fechaCita && horaCita && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease }}
            className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-sm"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate capitalize">
                {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-mono text-primary font-medium">{horaCita}</span>
                <span className="text-[10px] text-muted-foreground">· 45 min · Sesión de diagnóstico</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
