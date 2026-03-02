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
const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
    for (let min = 0; min < 60; min += SLOT_DURATION) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
    }
  }
  return slots;
}

export default function StepBooking({ form }: StepProps) {
  const { setValue, watch, formState: { errors } } = form;
  const fechaCita = watch("fechaCita");
  const horaCita = watch("horaCita");

  const timeSlots = useMemo(generateTimeSlots, []);

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
        Seleccione una fecha y horario para su sesión de diagnóstico.
      </p>

      {/* Main card — side by side on md+ */}
      <div className="border border-border rounded-sm bg-card overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
          {/* Left: Calendar */}
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Fecha</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground ml-auto">
                Lun – Vie
              </span>
            </div>

            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={disabledDays}
                locale={es}
                fromDate={today}
                toDate={maxDate}
                className="[--cell-size:3rem]"
                classNames={{
                  weekday: "text-muted-foreground flex-1 select-none text-[10px] font-mono uppercase tracking-wider",
                  caption_label: "select-none font-medium text-base",
                  today: "ring-1 ring-primary/30 rounded-full",
                  day: "group/day relative aspect-square h-full w-full select-none p-0 text-center",
                }}
              />
            </div>

            {errors.fechaCita && <p className="text-xs text-destructive mt-3">{errors.fechaCita.message}</p>}
          </div>

          {/* Right: Time slots (visible after date selected) */}
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

                  <div className="space-y-1.5 max-h-[380px] md:max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
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
                            30 min
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
                <span className="text-[10px] text-muted-foreground">· 30 min · Sesión de diagnóstico</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
