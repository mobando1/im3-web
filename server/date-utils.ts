/**
 * Parse fechaCita + horaCita into a Date object.
 * Uses Colombia timezone offset (UTC-5, no daylight saving).
 */
export function parseFechaCita(fecha: string, hora: string): Date {
  let hours = 0;
  let minutes = 0;

  const ampmMatch = hora.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1]);
    minutes = parseInt(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  } else {
    const h24Match = hora.match(/(\d{1,2}):(\d{2})/);
    if (h24Match) {
      hours = parseInt(h24Match[1]);
      minutes = parseInt(h24Match[2]);
    }
  }

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return new Date(`${fecha}T${hh}:${mm}:00-05:00`);
}
