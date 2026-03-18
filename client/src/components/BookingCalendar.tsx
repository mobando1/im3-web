import { useState, useMemo } from "react";
import { CalendarDays, Clock, Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  format, addDays, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth,
  isBefore, isAfter, isWeekend, startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

const TIME_SLOTS = ["13:00", "14:00", "15:00", "16:00", "17:00"];
const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

interface BookingCalendarProps {
  selectedDate: string; // "yyyy-MM-dd" or ""
  selectedTime: string; // "HH:00" or ""
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  bookedSlots?: string[];
  errors?: { date?: string; time?: string };
}

export default function BookingCalendar({
  selectedDate,
  selectedTime,
  onDateChange,
  onTimeChange,
  bookedSlots = [],
  errors,
}: BookingCalendarProps) {
  const today = startOfDay(new Date());
  const maxDate = addDays(today, 90);
  const minDate = addDays(today, 1);
  const [viewMonth, setViewMonth] = useState(startOfMonth(today));

  const parsedDate = selectedDate ? new Date(selectedDate + "T12:00:00") : undefined;

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const canGoPrev = isAfter(startOfMonth(viewMonth), startOfMonth(today));
  const canGoNext = isBefore(endOfMonth(viewMonth), maxDate);

  const isDayDisabled = (date: Date) => {
    return isBefore(date, minDate) || isWeekend(date) || isAfter(date, maxDate);
  };

  const handleDateSelect = (date: Date) => {
    onDateChange(format(date, "yyyy-MM-dd"));
    onTimeChange("");
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">

        {/* Left: Calendar */}
        <div className="p-5 md:p-6">
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

          <div className="grid grid-cols-7 gap-px">
            {calendarDays.map((day) => {
              const disabled = isDayDisabled(day);
              const isCurrentMonth = isSameMonth(day, viewMonth);
              const isSelected = parsedDate ? isSameDay(day, parsedDate) : false;
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

          {errors?.date && <p className="text-xs text-destructive mt-3">{errors.date}</p>}
        </div>

        {/* Right: Time slots */}
        <AnimatePresence>
          {selectedDate && (
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
                  {format(new Date(selectedDate + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                </p>

                <div className="space-y-1.5 max-h-[380px] md:max-h-[400px] overflow-y-auto pr-1">
                  {bookedSlots.length >= TIME_SLOTS.length ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      No hay horarios disponibles para este día.
                      <br />
                      <span className="text-xs">Selecciona otra fecha.</span>
                    </div>
                  ) : (
                    TIME_SLOTS.map((time, i) => {
                      const isSelected = selectedTime === time;
                      const isBooked = bookedSlots.includes(time);
                      return (
                        <motion.button
                          key={time}
                          type="button"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02, duration: 0.2 }}
                          onClick={() => !isBooked && onTimeChange(time)}
                          disabled={isBooked}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-sm transition-all ${
                            isBooked
                              ? "border-border bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
                              : isSelected
                              ? "border-primary bg-primary text-primary-foreground cursor-pointer"
                              : "border-border bg-card hover:border-primary/50 hover:bg-primary/5 text-foreground cursor-pointer"
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-4 h-4 shrink-0" />
                          ) : (
                            <Clock className={`w-3.5 h-3.5 shrink-0 ${isBooked ? "text-muted-foreground/30" : "text-muted-foreground"}`} />
                          )}
                          <span className={`font-mono text-sm font-medium ${isBooked ? "line-through" : ""}`}>{time}</span>
                          <span className={`text-[10px] ml-auto ${isBooked ? "text-muted-foreground/40" : isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {isBooked ? "Reservado" : "45 min"}
                          </span>
                        </motion.button>
                      );
                    })
                  )}
                </div>

                {errors?.time && <p className="text-xs text-destructive mt-2">{errors.time}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
