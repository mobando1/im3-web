import { Resend } from "resend";
import { log } from "./index";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.ANTHROPIC_API_KEY);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ messageId: string } | null> {
  const client = getResend();
  if (!client) {
    log("Resend not configured — email not sent");
    return null;
  }

  const from = process.env.EMAIL_FROM || "IM3 Systems <onboarding@resend.dev>";

  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    log(`Error enviando email a ${to}: ${error.message}`);
    throw new Error(error.message);
  }

  log(`Email enviado a ${to}: "${subject}" (${data?.id})`);
  return { messageId: data?.id || "" };
}
