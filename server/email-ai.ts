import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";
import type { EmailTemplate, Diagnostic, Contact, SentEmail, ContactNote } from "@shared/schema";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `Eres el equipo de IM3 Systems, una empresa de tecnología especializada en inteligencia artificial, automatización y desarrollo de software para empresas en Latinoamérica.

Tu tarea es generar emails profesionales y personalizados para clientes que agendaron una sesión de diagnóstico tecnológico.

Reglas:
- Tono: profesional pero cercano, como un consultor tech que sabe lo que hace. NO corporativo genérico.
- Idioma: español latinoamericano (tuteo, no voseo)
- Largo: sigue las instrucciones específicas de cada prompt
- No uses emojis excesivos (máximo 1-2 si aplica)
- Personaliza usando los datos reales del cliente — menciona su industria, herramientas, objetivos
- No inventes datos que no tengas — si no hay dato, omite esa mención
- El email debe ser HTML con estilos inline simples (sin CSS externo)
- Estructura: wrapper div con max-width:600px, font-family:sans-serif
- Color primario: #2B7A78 (teal) — úsalo para headers y links
- Firma: "— Equipo IM3 Systems"
- NO incluyas footer de unsubscribe — se agrega automáticamente
- NO uses placeholders como {empresa} — usa los datos reales del contexto`;

function buildContext(data: Partial<Diagnostic> | null): string {
  if (!data || !data.empresa) {
    return "CONTEXTO: Email genérico de IM3 Systems (sin datos específicos de cliente).";
  }

  const lines: string[] = ["DATOS DEL CLIENTE:"];
  if (data.empresa) lines.push(`- Empresa: ${data.empresa}`);
  if (data.industria) lines.push(`- Industria: ${data.industria}`);
  if (data.anosOperacion) lines.push(`- Años de operación: ${data.anosOperacion}`);
  if (data.empleados) lines.push(`- Empleados: ${data.empleados}`);
  if (data.ciudades) lines.push(`- Ciudades: ${data.ciudades}`);
  if (data.participante) lines.push(`- Participante: ${data.participante}`);
  if (data.fechaCita) lines.push(`- Fecha de cita: ${data.fechaCita}`);
  if (data.horaCita) lines.push(`- Hora de cita: ${data.horaCita}`);
  if (data.objetivos) lines.push(`- Objetivos: ${Array.isArray(data.objetivos) ? data.objetivos.join(", ") : data.objetivos}`);
  if (data.resultadoEsperado) lines.push(`- Resultado esperado: ${data.resultadoEsperado}`);
  if (data.productos) lines.push(`- Productos/Servicios: ${data.productos}`);
  if (data.volumenMensual) lines.push(`- Volumen mensual: ${data.volumenMensual}`);
  if (data.clientePrincipal) lines.push(`- Cliente principal: ${data.clientePrincipal}`);
  if (data.herramientas) lines.push(`- Herramientas actuales: ${data.herramientas}`);
  if (data.conectadas) lines.push(`- Herramientas conectadas: ${data.conectadas}`);
  if (data.nivelTech) lines.push(`- Nivel tecnológico: ${data.nivelTech}`);
  if (data.usaIA) lines.push(`- Usa IA: ${data.usaIA}`);
  if (data.usaIAParaQue) lines.push(`- Para qué usa IA: ${data.usaIAParaQue}`);
  if (data.comodidadTech) lines.push(`- Comodidad con tecnología: ${data.comodidadTech}`);
  if (data.areaPrioridad) lines.push(`- Áreas prioritarias: ${Array.isArray(data.areaPrioridad) ? data.areaPrioridad.join(", ") : data.areaPrioridad}`);
  if (data.presupuesto) lines.push(`- Presupuesto: ${data.presupuesto}`);
  if (data.familiaridad && typeof data.familiaridad === "object") {
    const f = data.familiaridad as any;
    lines.push(`- Familiaridad — Automatización: ${f.automatizacion}, CRM: ${f.crm}, IA: ${f.ia}, Integración: ${f.integracion}, Desarrollo: ${f.desarrollo}`);
  }
  if (data.meetLink) lines.push(`- Link de reunión (Google Meet): ${data.meetLink}`);
  return lines.join("\n");
}

/**
 * Build the fixed HTML for the micro-reminder email (E5).
 * No AI needed — just a simple template with variables.
 */
export function buildMicroReminderEmail(
  participante: string,
  horaCita: string,
  meetLink: string | null,
  contactId: string
): { subject: string; body: string } {
  const subject = `En 1 hora: tu diagnóstico IM3`;

  const meetSection = meetLink
    ? `<p style="margin:0 0 16px"><a href="${meetLink}" style="color:#2B7A78;font-weight:bold;font-size:16px">Unirse a la reunión</a></p>`
    : "";

  const body = `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
  <div style="background:#2B7A78;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems</h1>
  </div>
  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">${participante}, tu sesión de diagnóstico es en <strong>1 hora</strong> (${horaCita}).</p>
    ${meetSection}
    <p style="margin:0 0 16px;color:#666">Responde "confirmado" a este email si nos vemos. Si necesitas reagendar, también responde y lo coordinamos.</p>
    <p style="margin:0;color:#999">— Equipo IM3 Systems</p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${process.env.BASE_URL || "https://im3systems.com"}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">No recibir más emails</a>
  </div>
</div>`;

  return { subject, body };
}

/**
 * Add unsubscribe footer to AI-generated email HTML.
 */
function addUnsubscribeFooter(html: string, contactId: string): string {
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
  const footer = `<div style="max-width:600px;margin:8px auto 0;text-align:center;padding:8px">
  <a href="${baseUrl}/api/unsubscribe/${contactId}" style="color:#999;font-size:11px;text-decoration:none">No recibir más emails de esta secuencia</a>
</div>`;

  // Try to insert before closing </div> or append
  if (html.includes("</div>")) {
    const lastDiv = html.lastIndexOf("</div>");
    return html.substring(0, lastDiv + 6) + footer;
  }
  return html + footer;
}

export async function generateEmailContent(
  template: EmailTemplate,
  diagnosticData: Partial<Diagnostic> | null,
  contactId?: string
): Promise<{ subject: string; body: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const context = buildContext(diagnosticData);

  // Generate subject
  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: "Genera SOLO el texto del subject de un email. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres.",
    messages: [
      {
        role: "user",
        content: `${template.subjectPrompt}\n\n${context}`,
      },
    ],
  });

  const subject =
    subjectResponse.content?.[0]?.type === "text"
      ? subjectResponse.content[0].text.trim()
      : "Diagnóstico IM3 Systems";

  // Generate body
  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${template.bodyPrompt}\n\n${context}\n\nGenera el email completo en HTML con estilos inline. Wrapper: max-width:600px, font-family:sans-serif. Header con background #2B7A78 y título blanco.`,
      },
    ],
  });

  let body =
    bodyResponse.content?.[0]?.type === "text"
      ? bodyResponse.content[0].text.trim()
      : "<p>Error generando contenido</p>";

  // Add unsubscribe footer if we have a contactId
  if (contactId) {
    body = addUnsubscribeFooter(body, contactId);
  }

  log(`Email AI generado: "${subject}" para ${diagnosticData?.empresa || "suscriptor"}`);

  return { subject, body };
}

/**
 * Generate AI insight for a contact — sales intelligence analysis.
 */
export async function generateContactInsight(
  contact: Contact,
  diagnostic: Partial<Diagnostic> | null,
  emails: SentEmail[],
  notes: ContactNote[]
): Promise<{
  summary: string;
  nextActions: string[];
  talkingPoints: string[];
  riskLevel: string;
  riskReason: string;
  estimatedValue: string;
}> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const context = buildContext(diagnostic);

  // Build engagement summary
  const emailStats = {
    total: emails.length,
    sent: emails.filter(e => ["sent", "opened", "clicked"].includes(e.status)).length,
    opened: emails.filter(e => e.status === "opened").length,
    clicked: emails.filter(e => e.status === "clicked").length,
    pending: emails.filter(e => e.status === "pending").length,
    bounced: emails.filter(e => e.status === "bounced" || e.status === "failed").length,
  };

  const notesText = notes.length > 0
    ? `NOTAS INTERNAS:\n${notes.map(n => `- ${n.content}`).join("\n")}`
    : "Sin notas internas.";

  const prompt = `Eres un analista de inteligencia comercial para IM3 Systems, consultora de automatización e IA en Latinoamérica.

Analiza este lead y responde SOLO con un JSON válido (sin markdown, sin backticks, sin texto adicional).

${context}

ESTADO ACTUAL:
- Status: ${contact.status}
- Lead Score: ${contact.leadScore}/100
- Opted out: ${contact.optedOut ? "Sí" : "No"}
- Fecha de registro: ${contact.createdAt}

ENGAGEMENT DE EMAILS:
- Total programados: ${emailStats.total}
- Enviados: ${emailStats.sent}
- Abiertos: ${emailStats.opened}
- Clicks: ${emailStats.clicked}
- Pendientes: ${emailStats.pending}
- Rebotados/fallidos: ${emailStats.bounced}

${notesText}

Responde con este JSON exacto:
{
  "summary": "Resumen de 2-3 oraciones del perfil del lead y su potencial",
  "nextActions": ["Acción 1", "Acción 2", "Acción 3"],
  "talkingPoints": ["Punto de conversación 1 personalizado", "Punto 2", "Punto 3"],
  "riskLevel": "low|medium|high",
  "riskReason": "Razón del nivel de riesgo en 1 oración",
  "estimatedValue": "Estimación cualitativa del valor potencial (ej: 'Alto - empresa mediana con presupuesto significativo')"
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || "Sin análisis disponible",
      nextActions: parsed.nextActions || [],
      talkingPoints: parsed.talkingPoints || [],
      riskLevel: parsed.riskLevel || "medium",
      riskReason: parsed.riskReason || "",
      estimatedValue: parsed.estimatedValue || "",
    };
  } catch {
    log(`Error parsing AI insight JSON: ${text.substring(0, 200)}`);
    return {
      summary: "Error generando análisis. Intenta regenerar.",
      nextActions: [],
      talkingPoints: [],
      riskLevel: "medium",
      riskReason: "No se pudo analizar",
      estimatedValue: "Desconocido",
    };
  }
}

/**
 * Generate a personalized WhatsApp message for a contact.
 */
export async function generateWhatsAppMessage(
  contact: Contact,
  diagnostic: Partial<Diagnostic> | null
): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) {
    // Fallback message
    return `Hola ${contact.nombre}, soy del equipo de IM3 Systems. Queria hacer seguimiento sobre tu diagnostico tecnologico. ¿Tienes un momento para conversar?`;
  }

  const context = buildContext(diagnostic);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: `Genera un mensaje corto de WhatsApp (máximo 3 oraciones) en español latinoamericano. Tono: profesional pero cercano, como un consultor tech amigable. NO uses emojis excesivos (máximo 1). NO uses formato HTML. Texto plano solamente. Empieza con "Hola {nombre}". Firma como "— Equipo IM3 Systems". El mensaje debe ser relevante al status actual del contacto y sus datos.`,
    messages: [{
      role: "user",
      content: `Genera un mensaje de WhatsApp para este contacto.\n\nStatus: ${contact.status}\nSubstatus: ${contact.substatus || "ninguno"}\n\n${context}`,
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
  return text || `Hola ${contact.nombre}, soy del equipo de IM3 Systems. Queria hacer seguimiento. ¿Tienes un momento?`;
}
