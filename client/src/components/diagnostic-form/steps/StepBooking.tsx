import { useMemo } from "react";
import { UseFormReturn } from "react-hook-form";
import { CalendarDays, Clock } from "lucide-react";
import { format, addDays, isBefore, startOfDay, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const BUSINESS_HOURS = { start: 9, end: 17 };
const SLOT_DURATION = 30;

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

  const selectedDate = fechaCita ? new Date(fechaCita) : undefined;
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

      {/* Date selector */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          Fecha
        </label>
        <div className="border border-border rounded-sm p-4 bg-card flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={disabledDays}
            locale={es}
            fromDate={today}
            toDate={maxDate}
          />
        </div>
        {errors.fechaCita && <p className="text-xs text-destructive">{errors.fechaCita.message}</p>}
      </div>

      {/* Time slot selector — only shows after date is selected */}
      {fechaCita && (
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Horario disponible — {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
          </label>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {timeSlots.map((time) => (
              <Button
                key={time}
                type="button"
                variant={horaCita === time ? "default" : "outline"}
                size="sm"
                onClick={() => handleTimeSelect(time)}
                className="font-mono text-sm"
              >
                {time}
              </Button>
            ))}
          </div>
          {errors.horaCita && <p className="text-xs text-destructive">{errors.horaCita.message}</p>}
        </div>
      )}

      {/* Confirmation preview */}
      {fechaCita && horaCita && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-sm">
          <CalendarDays className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
            <p className="text-xs text-muted-foreground">
              {horaCita} — Sesión de diagnóstico (30 min)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
