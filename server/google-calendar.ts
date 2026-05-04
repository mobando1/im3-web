import { google } from "googleapis";
import { log } from "./index";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) return null;

  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
  });
}

interface CalendarEventData {
  diagnosticId: string;
  empresa: string;
  participante: string;
  email: string;
  fechaCita: string; // e.g. "2026-03-15"
  horaCita: string;  // e.g. "10:00 AM" or "14:00"
  rescheduleUrl?: string;
  cancelUrl?: string;
}

/**
 * Parse date + time strings into an ISO datetime.
 * Handles formats like "10:00 AM", "2:30 PM", "14:00".
 */
function parseDateTime(fecha: string, hora: string): Date {
  // Parse the time
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

  // Use Colombia timezone offset (UTC-5, no daylight saving)
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return new Date(`${fecha}T${hh}:${mm}:00-05:00`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a Google Calendar event with Google Meet link.
 * Uses domain-wide delegation to impersonate info@im3systems.com.
 * Polls for conference readiness to avoid "invalid video call name" errors.
 */
export async function createCalendarEvent(
  data: CalendarEventData
): Promise<{ meetLink: string; eventId: string } | null> {
  const auth = getAuth();
  if (!auth) {
    log("[Calendar] Google auth not configured");
    return null;
  }

  const calendar = google.calendar({ version: "v3", auth });

  const startDate = parseDateTime(data.fechaCita, data.horaCita);
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + 45); // 45-minute session

  const timeZone = "America/Bogota";

  // Build description with reschedule/cancel links if available
  let description = `Sesión de diagnóstico tecnológico con ${data.participante} de ${data.empresa}.`;
  if (data.rescheduleUrl || data.cancelUrl) {
    description += "\n";
    if (data.rescheduleUrl) description += `\n¿Necesitas cambiar la fecha? Reagendar: ${data.rescheduleUrl}`;
    if (data.cancelUrl) description += `\nCancelar reunión: ${data.cancelUrl}`;
  }
  description += "\n\nAgendado automáticamente desde im3systems.com";

  const event = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Diagnóstico IM3 — ${data.empresa}`,
      description,
      start: {
        dateTime: startDate.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone,
      },
      attendees: [{ email: data.email }],
      conferenceData: {
        createRequest: {
          requestId: `im3-${data.diagnosticId}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
    },
  });

  const eventId = event.data.id || "";

  // Check if conference is ready or still pending
  let meetLink = event.data.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  )?.uri || "";

  const confStatus = event.data.conferenceData?.createRequest?.status?.statusCode;

  if ((!meetLink || confStatus === "pending") && eventId) {
    log(`[Calendar] Conferencia pendiente para ${data.empresa}, haciendo polling...`);

    const backoffMs = [1000, 2000, 4000]; // exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sleep(backoffMs[attempt - 1]);

      try {
        const updated = await calendar.events.get({
          calendarId: "primary",
          eventId,
        });

        const updatedLink = updated.data.conferenceData?.entryPoints?.find(
          (e) => e.entryPointType === "video"
        )?.uri || "";

        const updatedStatus = updated.data.conferenceData?.createRequest?.status?.statusCode;

        if (updatedLink && updatedLink.includes("meet.google.com")) {
          meetLink = updatedLink;
          log(`[Calendar] Meet link listo (intento ${attempt}): ${meetLink}`);
          break;
        }

        if (updatedStatus === "success" && updatedLink) {
          meetLink = updatedLink;
          break;
        }

        log(`[Calendar] Intento ${attempt}/3 — status: ${updatedStatus}`);
      } catch (pollErr) {
        log(`[Calendar] Error polling intento ${attempt}: ${pollErr}`);
      }
    }
  }

  // Validate Meet link format
  if (meetLink && !meetLink.includes("meet.google.com")) {
    log(`[Calendar] Meet link inválido descartado: ${meetLink}`);
    meetLink = "";
  }

  log(`[Calendar] Evento creado: ${data.empresa} — Meet: ${meetLink || "(sin link)"}`);

  return {
    meetLink,
    eventId,
  };
}

/**
 * Crea un evento de Google Calendar para una reunión de proyecto recurrente
 * (no es un diagnóstico). Genera Meet link y agrega al cliente como attendee.
 * Más genérico que createCalendarEvent — toma title/description directos.
 */
export async function createProjectMeetingEvent(opts: {
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h) o HH:MM AM/PM
  durationMinutes: number;
  attendeeEmail?: string;
  meetingId: string; // ID interno (appointment.id) para idempotencia
}): Promise<{ meetLink: string; eventId: string } | null> {
  const auth = getAuth();
  if (!auth) {
    log("[Calendar] Google auth not configured");
    return null;
  }
  const calendar = google.calendar({ version: "v3", auth });
  const startDate = parseDateTime(opts.date, opts.time);
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + opts.durationMinutes);
  const timeZone = "America/Bogota";

  const event = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: opts.title,
      description: opts.description || "",
      start: { dateTime: startDate.toISOString(), timeZone },
      end: { dateTime: endDate.toISOString(), timeZone },
      attendees: opts.attendeeEmail ? [{ email: opts.attendeeEmail }] : undefined,
      conferenceData: {
        createRequest: {
          requestId: `im3-mtg-${opts.meetingId}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
    },
  });

  const eventId = event.data.id || "";
  let meetLink = event.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || "";

  // Polling para Meet link si está pendiente
  if ((!meetLink || event.data.conferenceData?.createRequest?.status?.statusCode === "pending") && eventId) {
    const backoff = [1000, 2000, 4000];
    for (let i = 0; i < 3; i++) {
      await sleep(backoff[i]);
      try {
        const updated = await calendar.events.get({ calendarId: "primary", eventId });
        const link = updated.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || "";
        if (link && link.includes("meet.google.com")) { meetLink = link; break; }
      } catch (e) { /* continue */ }
    }
  }
  if (meetLink && !meetLink.includes("meet.google.com")) meetLink = "";

  log(`[Calendar] Reunión de proyecto creada: ${opts.title} — Meet: ${meetLink || "(sin link)"}`);
  return { meetLink, eventId };
}

/**
 * Delete a Google Calendar event (used when canceling/rescheduling meetings).
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const auth = getAuth();
  if (!auth || !eventId) return false;

  const calendar = google.calendar({ version: "v3", auth });

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
    log(`[Calendar] Evento eliminado: ${eventId}`);
    return true;
  } catch (err) {
    log(`[Calendar] Error eliminando evento ${eventId}: ${err}`);
    return false;
  }
}
