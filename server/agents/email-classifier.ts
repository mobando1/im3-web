import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { gmailEmails, contacts, notifications } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "../index";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

type ClassificationResult = {
  relevant: boolean;
  reason: string;
};

/**
 * Classify whether a synced Gmail email is relevant to the matched contact.
 * Called inline during Gmail sync for non-exact matches.
 * Returns true if the email should stay linked, false if it should be unlinked.
 */
export async function classifyEmailRelevance(params: {
  gmailEmailId: string;
  contactId: string;
  subject: string | null;
  bodyText: string | null;
  fromEmail: string;
  toEmails: string[];
  matchMethod: "associated" | "domain";
}): Promise<{ kept: boolean; reason: string }> {
  if (!db) return { kept: true, reason: "DB not available" };

  const anthropic = getClient();
  if (!anthropic) {
    log("[email-classifier] ANTHROPIC_API_KEY not set — skipping classification");
    return { kept: true, reason: "No API key" };
  }

  // Fetch contact info for context
  const [contact] = await db
    .select({
      id: contacts.id,
      nombre: contacts.nombre,
      empresa: contacts.empresa,
      email: contacts.email,
    })
    .from(contacts)
    .where(eq(contacts.id, params.contactId))
    .limit(1);

  if (!contact) return { kept: true, reason: "Contact not found" };

  // Skip classification if no company info to compare against
  if (!contact.empresa) return { kept: true, reason: "No company info for comparison" };

  const truncatedBody = (params.bodyText || "").substring(0, 800);

  const prompt = `Eres un clasificador de emails para un CRM de consultoría. Determina si este email es relevante para el contacto asignado.

CONTACTO:
- Nombre: ${contact.nombre || "Desconocido"}
- Empresa: ${contact.empresa}
- Email: ${contact.email}

EMAIL:
- De: ${params.fromEmail}
- Para: ${params.toEmails.join(", ")}
- Asunto: ${params.subject || "(sin asunto)"}
- Contenido: ${truncatedBody || "(sin contenido)"}
- Método de match: ${params.matchMethod} (${params.matchMethod === "domain" ? "coincidencia por dominio, NO por email directo" : "email asociado al contacto"})

CRITERIOS:
- RELEVANTE: el email trata sobre la empresa del contacto, sus proyectos, servicios, o comunicación directa con esa persona
- IRRELEVANTE: el email es sobre otra empresa, otro tema, o fue reenviado/CC sin relación con el contacto
- Si el asunto o contenido menciona la empresa del contacto o temas claramente relacionados → relevante
- Si el email es claramente sobre otra empresa u organización diferente → irrelevante
- En caso de duda, marca como relevante (es mejor mostrar un email de más que perder uno importante)

Responde SOLO con JSON válido, sin markdown:
{"relevant": true/false, "reason": "explicación breve en español"}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed: ClassificationResult = JSON.parse(cleaned);

    if (!parsed.relevant) {
      // Auto-unlink: set contactId to null and mark as manually unlinked
      await db
        .update(gmailEmails)
        .set({ contactId: null, matchMethod: null, manuallyUnlinked: true })
        .where(eq(gmailEmails.id, params.gmailEmailId));

      // Create notification for admin
      await db.insert(notifications).values({
        type: "email_unlinked",
        title: `Email desvinculado: "${(params.subject || "Sin asunto").substring(0, 60)}"`,
        description: `Desvinculado de ${contact.nombre || contact.email} (${contact.empresa}). Razón: ${parsed.reason}`.substring(0, 500),
        contactId: params.contactId,
      });

      log(`[email-classifier] Unlinked "${params.subject}" from ${contact.empresa}: ${parsed.reason}`);
      return { kept: false, reason: parsed.reason };
    }

    return { kept: true, reason: parsed.reason };
  } catch (err) {
    log(`[email-classifier] Classification failed: ${(err as Error).message}`);
    // On error, keep the email linked (safer than removing)
    return { kept: true, reason: "Classification error, keeping linked" };
  }
}
