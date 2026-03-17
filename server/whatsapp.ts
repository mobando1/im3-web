/**
 * WhatsApp Business API Integration (Meta Cloud API)
 *
 * Sends automated WhatsApp messages as part of the warming sequence.
 * Supports template messages (approved by Meta) and session messages.
 *
 * Required env vars:
 *   WHATSAPP_TOKEN        — Meta Cloud API access token
 *   WHATSAPP_PHONE_ID     — WhatsApp Business phone number ID
 *   WHATSAPP_VERIFY_TOKEN — Webhook verification token (custom string)
 *
 * Setup guide:
 * 1. Create Meta Business account at business.facebook.com
 * 2. Add WhatsApp product to your app at developers.facebook.com
 * 3. Get a test phone number or register your own
 * 4. Create message templates in WhatsApp Manager
 * 5. Set webhook URL to https://yourdomain.com/api/whatsapp/webhook
 */

import { log } from "./index";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

interface WhatsAppSendResult {
  messageId: string;
  status: "sent" | "failed";
  error?: string;
}

/**
 * Check if WhatsApp is configured
 */
export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

/**
 * Format phone number for WhatsApp API (E.164 format without +)
 * Handles Colombian numbers (+57) by default
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Strip everything except digits and +
  let cleaned = phone.replace(/[^0-9+]/g, "");

  // Remove leading +
  cleaned = cleaned.replace(/^\+/, "");

  // If starts with 57 and has 12 digits total, it's already Colombian
  if (cleaned.startsWith("57") && cleaned.length === 12) {
    return cleaned;
  }

  // If 10 digits, assume Colombian mobile (add 57 prefix)
  if (cleaned.length === 10 && cleaned.startsWith("3")) {
    return `57${cleaned}`;
  }

  // If 7 digits (Colombian landline), add 57 + area code assumption
  if (cleaned.length === 7) {
    return `571${cleaned}`; // Bogota area code default
  }

  // Return as-is if already has country code
  return cleaned;
}

/**
 * Send a text message via WhatsApp Business API
 */
export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    return { messageId: "", status: "failed", error: "WhatsApp not configured" };
  }

  const phone = formatPhoneForWhatsApp(to);

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    const data = await res.json() as any;

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      log(`[WhatsApp] Error sending to ${phone}: ${errMsg}`);
      return { messageId: "", status: "failed", error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id || "";
    log(`[WhatsApp] Sent to ${phone} — ID: ${messageId}`);
    return { messageId, status: "sent" };
  } catch (err: any) {
    log(`[WhatsApp] Network error sending to ${phone}: ${err?.message}`);
    return { messageId: "", status: "failed", error: err?.message || "Network error" };
  }
}

/**
 * Send a template message via WhatsApp Business API
 * Templates must be pre-approved by Meta in WhatsApp Manager
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: Record<string, string>,
  language: string = "es"
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    return { messageId: "", status: "failed", error: "WhatsApp not configured" };
  }

  const phone = formatPhoneForWhatsApp(to);

  // Build template components from params
  const components: any[] = [];
  const paramValues = Object.values(params);
  if (paramValues.length > 0) {
    components.push({
      type: "body",
      parameters: paramValues.map(val => ({ type: "text", text: val })),
    });
  }

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: components.length > 0 ? components : undefined,
        },
      }),
    });

    const data = await res.json() as any;

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      log(`[WhatsApp] Template error to ${phone}: ${errMsg}`);
      return { messageId: "", status: "failed", error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id || "";
    log(`[WhatsApp] Template "${templateName}" sent to ${phone} — ID: ${messageId}`);
    return { messageId, status: "sent" };
  } catch (err: any) {
    log(`[WhatsApp] Network error sending template to ${phone}: ${err?.message}`);
    return { messageId: "", status: "failed", error: err?.message || "Network error" };
  }
}

/**
 * Send a voice note (audio) via WhatsApp Business API
 * audioUrl must be a publicly accessible URL
 */
export async function sendWhatsAppAudio(
  to: string,
  audioUrl: string
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    return { messageId: "", status: "failed", error: "WhatsApp not configured" };
  }

  const phone = formatPhoneForWhatsApp(to);

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "audio",
        audio: { link: audioUrl },
      }),
    });

    const data = await res.json() as any;

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      log(`[WhatsApp] Audio error to ${phone}: ${errMsg}`);
      return { messageId: "", status: "failed", error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id || "";
    log(`[WhatsApp] Audio sent to ${phone} — ID: ${messageId}`);
    return { messageId, status: "sent" };
  } catch (err: any) {
    log(`[WhatsApp] Network error sending audio to ${phone}: ${err?.message}`);
    return { messageId: "", status: "failed", error: err?.message || "Network error" };
  }
}

/**
 * WhatsApp sequence templates mapped to the email warming sequence.
 * These define WHEN to send WhatsApp messages relative to appointment.
 *
 * Note: Template names must match templates created in Meta WhatsApp Manager.
 * Use text messages (non-template) only within the 24h customer service window.
 */
export const WHATSAPP_SEQUENCE = [
  {
    name: "wa_bienvenida",
    description: "Welcome message after form submission",
    timing: "immediate", // Send 30 min after email confirmation (E0)
    delayMinutes: 30,
    useTemplate: true, // Must use approved template (no prior conversation)
    templateName: "im3_bienvenida",
    buildParams: (nombre: string, empresa: string) => ({
      "1": nombre,
      "2": empresa,
    }),
  },
  {
    name: "wa_recordatorio_dia",
    description: "Day-before meeting reminder",
    timing: "before_appointment", // 24h before appointment
    hoursBeforeAppointment: 20, // Morning of the day before
    useTemplate: true,
    templateName: "im3_recordatorio",
    buildParams: (nombre: string, _empresa: string, horaCita?: string) => ({
      "1": nombre,
      "2": horaCita || "tu cita programada",
    }),
  },
  {
    name: "wa_recordatorio_hora",
    description: "1h before meeting - quick reminder",
    timing: "before_appointment",
    hoursBeforeAppointment: 1,
    useTemplate: true,
    templateName: "im3_recordatorio_hora",
    buildParams: (nombre: string) => ({
      "1": nombre,
    }),
  },
  {
    name: "wa_post_reunion",
    description: "Post-meeting follow-up with AI-generated message",
    timing: "after_appointment", // 2h after appointment
    hoursAfterAppointment: 2,
    useTemplate: false, // Use AI-generated text (within 24h service window)
  },
] as const;

/**
 * Calculate when to send each WhatsApp message based on appointment time
 */
export function calculateWhatsAppSchedule(
  appointmentDate: Date,
  now: Date = new Date()
): Array<{ name: string; scheduledFor: Date; templateName?: string; useTemplate: boolean }> {
  const schedule: Array<{ name: string; scheduledFor: Date; templateName?: string; useTemplate: boolean }> = [];

  for (const wa of WHATSAPP_SEQUENCE) {
    let scheduledFor: Date;

    if (wa.timing === "immediate") {
      // Send X minutes after now
      scheduledFor = new Date(now.getTime() + wa.delayMinutes * 60 * 1000);
    } else if (wa.timing === "before_appointment") {
      scheduledFor = new Date(appointmentDate.getTime() - wa.hoursBeforeAppointment * 60 * 60 * 1000);
      // Skip if already past
      if (scheduledFor <= now) continue;
    } else if (wa.timing === "after_appointment") {
      scheduledFor = new Date(appointmentDate.getTime() + wa.hoursAfterAppointment * 60 * 60 * 1000);
      // Skip if appointment already passed > 24h ago
      if (scheduledFor < new Date(now.getTime() - 24 * 60 * 60 * 1000)) continue;
    } else {
      continue;
    }

    schedule.push({
      name: wa.name,
      scheduledFor,
      templateName: wa.useTemplate ? wa.templateName : undefined,
      useTemplate: wa.useTemplate,
    });
  }

  return schedule;
}
