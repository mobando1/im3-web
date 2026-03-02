import { useMemo, useCallback, MouseEvent } from "react";
import { UseFormReturn } from "react-hook-form";
import { CalendarDays, Clock } from "lucide-react";
import { format, addDays, isBefore, startOfDay, isWeekend } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from "framer-motion";
import { Calendar } from "@/components/ui/calendar";
import type { DiagnosticFormData } from "../schema";

interface StepProps {
  form: UseFormReturn<DiagnosticFormData>;
}

const BUSINESS_HOURS = { start: 9, end: 17 };
const SLOT_DURATION = 30;
const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

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

/* --- Animated SVG Checkmark (same pattern as confirmed.tsx hero) --- */
function AnimatedCheck({ size = 48 }: { size?: number }) {
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <motion.circle
        cx={cx} cy={cy} r={r}
        stroke="currentColor"
        strokeWidth="1"
        className="text-border"
      />
      <motion.circle
        cx={cx} cy={cy} r={r}
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
        initial={{ pathLength: 0, rotate: -90 }}
        animate={{ pathLength: 1, rotate: -90 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        style={{ transformOrigin: "center" }}
      />
      <motion.path
        d={`M${size * 0.32} ${size * 0.52} L${size * 0.44} ${size * 0.64} L${size * 0.68} ${size * 0.38}`}
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        className="text-primary"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* --- Time Slot with mouse-tracking radial gradient (TechCard pattern) --- */
function TimeSlot({
  time,
  isSelected,
  onSelect,
  index,
}: {
  time: string;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = useCallback(
    ({ currentTarget, clientX, clientY }: MouseEvent) => {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    },
    [mouseX, mouseY]
  );

  const gradientBg = useMotionTemplate`
    radial-gradient(
      120px circle at ${mouseX}px ${mouseY}px,
      hsl(var(--teal) / 0.08),
      transparent 80%
    )
  `;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25, ease }}
      onClick={onSelect}
      onMouseMove={handleMouseMove}
      className={`time-slot relative flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-sm font-mono text-sm cursor-pointer group ${
        isSelected
          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "border-border text-muted-foreground bg-card hover:text-foreground hover:border-foreground/20"
      }`}
    >
      {/* Mouse-tracking gradient overlay (only on unselected) */}
      {!isSelected && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: gradientBg }}
        />
      )}

      {/* Checkmark for selected */}
      {isSelected && (
        <motion.svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
        >
          <motion.path
            d="M3 7.5L5.5 10L11 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          />
        </motion.svg>
      )}

      <span className="relative z-10">{time}</span>
    </motion.button>
  );
}

/* --- Mini Progress Indicator --- */
function StepProgress({ hasDate, hasTime }: { hasDate: boolean; hasTime: boolean }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {/* Step 1: Fecha */}
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono font-medium transition-all duration-300 ${
          hasDate
            ? "bg-primary text-primary-foreground"
            : "border-2 border-primary text-primary"
        }`}>
          {hasDate ? (
            <motion.svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          ) : "1"}
        </div>
        <span className={`text-[10px] font-mono uppercase tracking-widest transition-colors duration-300 ${
          hasDate ? "text-primary" : "text-foreground"
        }`}>
          Fecha
        </span>
      </div>

      {/* Connecting line */}
      <div className="w-12 sm:w-16 h-px mx-3 relative">
        <div className="absolute inset-0 bg-border" />
        <motion.div
          className="absolute inset-0 bg-primary origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: hasDate ? 1 : 0 }}
          transition={{ duration: 0.4, ease }}
        />
      </div>

      {/* Step 2: Horario */}
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono font-medium transition-all duration-300 ${
          hasTime
            ? "bg-primary text-primary-foreground"
            : hasDate
            ? "border-2 border-primary text-primary"
            : "border-2 border-border text-muted-foreground"
        }`}>
          {hasTime ? (
            <motion.svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          ) : "2"}
        </div>
        <span className={`text-[10px] font-mono uppercase tracking-widest transition-colors duration-300 ${
          hasTime ? "text-primary" : hasDate ? "text-foreground" : "text-muted-foreground"
        }`}>
          Horario
        </span>
      </div>
    </div>
  );
}

/* === Main Component === */
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
    <div className="space-y-6 relative">
      {/* Decorative floating element */}
      <div className="absolute -right-8 top-4 text-foreground/5 font-mono text-xs animate-float hidden sm:block select-none pointer-events-none" aria-hidden="true">
        //
      </div>

      {/* Step header */}
      <div className="flex items-center gap-3 mb-4">
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

      {/* Mini progress indicator */}
      <StepProgress hasDate={!!fechaCita} hasTime={!!horaCita} />

      {/* Calendar card — booking-card style with corner brackets */}
      <div className="booking-card rounded-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Seleccione una fecha</span>
          </div>
          <div className="flex items-center gap-2">
            {fechaCita && (
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"
              />
            )}
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Lun – Vie
            </span>
          </div>
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
            classNames={{
              weekday: "text-muted-foreground flex-1 select-none text-[10px] font-mono uppercase tracking-wider",
            }}
          />
        </div>

        <div className="animated-dashed-border" />
        <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-center gap-2">
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
            transition={{ duration: 0.4, ease }}
            className="overflow-hidden"
          >
            <div className="booking-card rounded-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Seleccione un horario</span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                </span>
              </div>

              <div className="p-4 space-y-5">
                {timeGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-2">
                      <span className="w-4 h-px bg-border" />
                      {group.label}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {group.slots.map((time, i) => (
                        <TimeSlot
                          key={time}
                          time={time}
                          isSelected={horaCita === time}
                          onSelect={() => handleTimeSelect(time)}
                          index={i}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {errors.horaCita && <p className="text-xs text-destructive mt-2">{errors.horaCita.message}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation card with animated SVG + marching ants */}
      <AnimatePresence>
        {fechaCita && horaCita && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.4, ease }}
            className="animated-dashed-border rounded-sm"
          >
            <div className="p-5 bg-card flex items-center gap-4">
              {/* Animated SVG checkmark */}
              <div className="shrink-0 relative">
                <AnimatedCheck size={48} />
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.8, type: "spring" }}
                  className="absolute -bottom-1 -right-2 bg-card border border-border px-1.5 py-0.5 shadow-sm flex items-center gap-1"
                >
                  <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[7px] font-mono font-medium tracking-widest text-muted-foreground uppercase">OK</span>
                </motion.div>
              </div>

              {/* Details */}
              <div className="min-w-0">
                <motion.p
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="text-sm font-medium text-foreground truncate"
                >
                  {format(new Date(fechaCita + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="flex items-center gap-2 mt-1"
                >
                  <span className="text-xs font-mono text-primary font-medium">{horaCita}</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">30 min · Sesión de diagnóstico</span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
