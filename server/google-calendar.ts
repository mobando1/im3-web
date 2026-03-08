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

  const date = new Date(`${fecha}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Create a Google Calendar event with Google Meet link.
 * Uses domain-wide delegation to impersonate info@im3systems.com.
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

  const event = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Diagnóstico IM3 — ${data.empresa}`,
      description: `Sesión de diagnóstico tecnológico con ${data.participante} de ${data.empresa}.\n\nAgendado automáticamente desde im3systems.com`,
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
          requestId: data.diagnosticId,
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

  const meetLink = event.data.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  )?.uri;

  const eventId = event.data.id;

  log(`[Calendar] Evento creado: ${data.empresa} — Meet: ${meetLink}`);

  return {
    meetLink: meetLink || "",
    eventId: eventId || "",
  };
}
