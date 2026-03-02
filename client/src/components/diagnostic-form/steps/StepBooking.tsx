import { useMemo } from "react";
import { UseFormReturn } from "react-hook-form";
import { CalendarDays, Clock, Check } from "lucide-react";
import { format, addDays, isBefore, startOfDay, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "@/components/ui/calendar";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const BUSINESS_HOURS = { start: 9, end: 17 };
const SLOT_DURATION = 30;

interface TimeGroup {
  label: string;
  slots: string[];
}

function generateTimeGroups(): TimeGroup[] {
  const morning: string[] = [];
  const afternoon: string[] = [];

  for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
    for (let min = 0; min < 60; min += SLOT_DURATION) {
      const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      if (hour < 12) {
        morning.push(time);
      } else {
        afternoon.push(time);
      }
    }
  }

  return [
    { label: "Mañana", slots: morning },
    { label: "Tarde", slots: afternoon },
  ];
}

export default function StepBooking({ form }: StepProps) {
  const { setValue, watch, formState: { errors } } = form;
  const fechaCita = watch("fechaCita");
  const horaCita = watch("horaCita");

  const timeGroups = useMemo(generateTimeGroups, []);

  const selectedDate = fechaCita ? new Date(fechaCita + "T12:00:00") : undefined;
  const today = startOfDay(new Date());
  const maxDate = addDays(today, 90);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setValue("fechaCita", format(date, "yyyy-MM-dd"), { shouldValidate: true });
    setValue("horaCita", "", { shouldValidate: true });
  };

  const handleTimeSelect = (time: string) => {
    setValue("horaCita", time, { shouldValidate: true });
  };

  const disabledDays = (date: Date) => {
    return isBefore(date, today) || isWeekend(date) || isBefore(maxDate, date);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Paso 1 de 9</p>
          <h2 className="text-lg font-medium text-foreground">Agendar Cita</h2>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Seleccione una fecha y horario para su sesión de diagnóstico (30 minutos).
      </p>

      {/* Calendar card */}
      <div className="border border-border rounded-sm overflow-hidden bg-card">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Seleccione una fecha</span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Lun – Vie
          </span>
        </div>

        <div className="p-4 flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={disabledDays}
            locale={es}
            fromDate={today}
            toDate={maxDate}
            className="[--cell-size:2.5rem]"
          />
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Horario de oficina · 9:00 – 17:00
          </span>
        </div>
      </div>
      {errors.fechaCita && <p className="text-xs text-destructive">{errors.fechaCita.message}</p>}

      {/* Time slots — grouped by morning/afternoon */}
      <AnimatePresence>
        {fechaCita && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border border-border rounded-sm overflow-hidden bg-card">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Seleccione un horario</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                </span>
              </div>

              <div className="p-4 space-y-5">
                {timeGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2.5">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {group.slots.map((time, i) => {
                        const isSelected = horaCita === time;
                        return (
                          <motion.button
                            key={time}
                            type="button"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02, duration: 0.2 }}
                            onClick={() => handleTimeSelect(time)}
                            className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-sm font-mono text-sm transition-all cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground bg-background"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            {time}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {errors.horaCita && <p className="text-xs text-destructive mt-2">{errors.horaCita.message}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation card */}
      <AnimatePresence>
        {fechaCita && horaCita && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="bg-gradient-to-r from-primary/5 to-transparent border-l-2 border-primary rounded-sm px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                  {" · "}{horaCita}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  30 min · Sesión de diagnóstico
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
