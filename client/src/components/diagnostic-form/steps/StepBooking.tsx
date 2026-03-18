import { useEffect, useRef } from "react";
import { UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import BookingCalendar from "@/components/BookingCalendar";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

export default function StepBooking({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;
  const email = watch("email");
  const fechaCita = watch("fechaCita");
  const horaCita = watch("horaCita");

  // Email is valid if it matches basic email pattern
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");

  // Fetch booked slots for selected date
  const { data: bookedSlots = [] } = useQuery<string[]>({
    queryKey: ["/api/booked-slots", fechaCita],
    queryFn: () => fetch(`/api/booked-slots?date=${fechaCita}`).then(r => r.json()),
    enabled: !!fechaCita,
  });

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

            <BookingCalendar
              selectedDate={fechaCita || ""}
              selectedTime={horaCita || ""}
              onDateChange={(date) => setValue("fechaCita", date, { shouldValidate: true })}
              onTimeChange={(time) => setValue("horaCita", time, { shouldValidate: true })}
              bookedSlots={bookedSlots}
              errors={{
                date: errors.fechaCita?.message,
                time: errors.horaCita?.message,
              }}
            />

            {/* Confirmation bar */}
            <AnimatePresence>
              {fechaCita && horaCita && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease }}
                  className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-sm mt-4"
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
