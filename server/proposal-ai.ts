import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { contacts, diagnostics, sentEmails, contactNotes, activityLog, aiInsightsCache, gmailEmails, contactFiles } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { log } from "./index";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Gather ALL available context for a contact to feed to the proposal AI.
 */
async function gatherContactContext(contactId: string): Promise<string> {
  if (!db) return "";

  const parts: string[] = [];

  // Contact info
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (contact) {
    parts.push(`CONTACTO:\n- Nombre: ${contact.nombre}\n- Empresa: ${contact.empresa}\n- Email: ${contact.email}\n- Teléfono: ${contact.telefono || "N/A"}\n- Lead Score: ${contact.leadScore}`);
  }

  // Diagnostic
  if (contact?.diagnosticId) {
    const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
    if (diag) {
      const diagData = diag as Record<string, unknown>;
      parts.push(`DIAGNÓSTICO TECNOLÓGICO:\n- Empresa: ${diag.empresa}\n- Industria: ${diag.industria}\n- Años operación: ${diag.anosOperacion}\n- Empleados: ${diag.empleados}\n- Ciudades: ${diag.ciudades}\n- Área prioritaria: ${diag.areaPrioridad}\n- Objetivos: ${diag.objetivos}\n- Herramientas actuales: ${diag.herramientas}\n- Presupuesto: ${diag.presupuesto}\n- Nivel digitalización: ${diagData.nivelDigitalizacion || "N/A"}\n- Procesos manuales: ${diagData.procesosManuales || "N/A"}\n- Frustraciones: ${diagData.frustraciones || "N/A"}\n- Expectativas: ${diagData.expectativas || "N/A"}\n- Timeline deseado: ${diagData.timeline || "N/A"}\n- Decisor: ${diagData.tomadorDecision || "N/A"}`);
    }
  }

  // Notes from meetings
  const notes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, contactId)).orderBy(desc(contactNotes.createdAt)).limit(10);
  if (notes.length > 0) {
    parts.push(`NOTAS DE REUNIONES (${notes.length}):\n${notes.map(n => `- ${n.content}`).join("\n")}`);
  }

  // AI insights / mini audit
  const [insights] = await db.select().from(aiInsightsCache).where(eq(aiInsightsCache.contactId, contactId)).limit(1);
  if (insights) {
    parts.push(`MINI AUDITORÍA IA:\n${JSON.stringify(insights.insight, null, 2)}`);
  }

  // Email history
  const emails = await db.select().from(sentEmails).where(eq(sentEmails.contactId, contactId)).orderBy(desc(sentEmails.sentAt)).limit(10);
  if (emails.length > 0) {
    parts.push(`EMAILS ENVIADOS (${emails.length}):\n${emails.map(e => `- [${e.status}] ${e.subject || "Sin asunto"}`).join("\n")}`);
  }

  // Gmail conversation history
  const gmailMessages = await db.select().from(gmailEmails).where(eq(gmailEmails.contactId, contactId)).orderBy(desc(gmailEmails.gmailDate)).limit(15);
  if (gmailMessages.length > 0) {
    parts.push(`HISTORIAL DE EMAILS GMAIL (${gmailMessages.length}):\n${gmailMessages.map(m =>
      `- [${m.direction === "inbound" ? "RECIBIDO" : "ENVIADO"}] ${m.subject || "Sin asunto"} (${m.gmailDate.toLocaleDateString("es-CO")})\n  ${(m.bodyText || m.snippet || "").substring(0, 300)}`
    ).join("\n")}`);
  }

  // Contact documents/files with content
  const docs = await db.select().from(contactFiles).where(eq(contactFiles.contactId, contactId)).limit(10);
  if (docs.length > 0) {
    const docsWithContent = docs.filter(d => d.content);
    const docsWithoutContent = docs.filter(d => !d.content);
    const docParts: string[] = [];
    for (const d of docsWithContent) {
      docParts.push(`- [${d.type}] ${d.name}:\n  ${(d.content || "").substring(0, 500)}`);
    }
    for (const d of docsWithoutContent) {
      docParts.push(`- [${d.type}] ${d.name} (sin contenido extraído)`);
    }
    parts.push(`DOCUMENTOS DEL CLIENTE (${docs.length}):\n${docParts.join("\n")}`);
  }

  // Activity log
  const activity = await db.select().from(activityLog).where(eq(activityLog.contactId, contactId)).orderBy(desc(activityLog.createdAt)).limit(15);
  if (activity.length > 0) {
    parts.push(`ACTIVIDAD RECIENTE (${activity.length}):\n${activity.map(a => `- [${a.type}] ${a.description}`).join("\n")}`);
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Generate all proposal sections using Claude AI.
 */
export async function generateProposal(contactId: string, adminNotes?: string): Promise<{
  sections: Record<string, string>;
  pricing: { total: number; currency: string; includes: string[]; paymentOptions: string[] };
  timelineData: { phases: Array<{ name: string; weeks: number; deliverables: string[] }>; totalWeeks: number };
  alcanceDetallado: Array<{ fase: string; areas: Array<{ nombre: string; tareas: string[] }> }>;
} | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const context = await gatherContactContext(contactId);
  if (!context) return null;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    temperature: 0.4,
    system: `Eres un consultor senior de IM3 Systems, una agencia de tecnología especializada en IA, automatización y desarrollo de software para empresas en Latinoamérica.

Genera una propuesta comercial PROFESIONAL, PERSUASIVA y PERSONALIZADA basada en los datos reales del cliente.

REGLAS:
- Tono: profesional, confiado, orientado a resultados. Como un consultor que sabe lo que hace.
- NO inventes datos que no estén en el contexto. Si no tienes un dato, omítelo.
- Los precios deben ser realistas para el mercado latinoamericano de desarrollo de software.
- El ROI debe ser calculado con lógica (no inventado).
- Escribe en español latinoamericano.
- Cada sección debe ser HTML listo para renderizar (con tags básicos: p, strong, ul, li, h3).
- NO uses markdown. Usa HTML.

SOBRE IM3 SYSTEMS:
- Agencia de tecnología especializada en IA, automatización y desarrollo de software
- Sede en Colombia, operación en toda Latinoamérica
- Stack: React, Node.js, PostgreSQL, Claude AI, Stripe, Google Cloud
- Diferenciadores: IA integrada en cada proyecto, portal de seguimiento en tiempo real, tutor virtual post-entrega
- Proyectos anteriores: plataformas SaaS, apps móviles, automatización de procesos, CRMs personalizados`,
    messages: [{
      role: "user",
      content: `Genera una propuesta comercial completa para este cliente.

${adminNotes ? `INSTRUCCIONES ADICIONALES DEL ADMIN:\n${adminNotes}\n\n` : ""}

CONTEXTO DEL CLIENTE:
${context}

SOBRE EL PRICING:
- Un SOLO precio fijo. IM3 ofrece servicio premium completo — NO hay versión light.
- El precio incluye SIEMPRE: desarrollo completo, acompañamiento, tutor virtual IA post-entrega, portal de seguimiento, soporte post-implementación.
- Precio realista para Latinoamérica basado en la complejidad del proyecto.

SOBRE EL ALCANCE:
- Genera el alcance con PROFUNDIDAD: cada fase tiene sub-áreas, y cada sub-área tiene tareas específicas.
- Esto permite que el cliente haga drill-down para ver el detalle sin sentirse abrumado.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`json) con esta estructura exacta:
{
  "sections": {
    "resumen": "<HTML del resumen ejecutivo — 2-3 párrafos impactantes>",
    "problema": "<HTML describiendo los dolores/problemas del cliente usando SUS palabras del diagnóstico>",
    "costo_inaccion": "<HTML cuantificando qué pierde el cliente cada mes si NO actúa: horas desperdiciadas, ventas perdidas, ineficiencia. Usa datos reales del diagnóstico para estimar. Ejemplo: 'Si tu equipo pierde 15 horas/semana en procesos manuales a $X/hora, estás perdiendo $Y/mes — $Z/año.'>",
    "solucion": "<HTML describiendo qué vamos a construir y por qué resuelve cada problema>",
    "alcance": "<HTML resumen general del alcance — las fases a alto nivel>",
    "tecnologia": "<HTML simplificado del stack técnico — en lenguaje de negocios, no de programador>",
    "casos_exito": "<HTML con 2-3 proyectos anteriores de IM3: Passport2Fluency (plataforma de idiomas con tutores + IA), sistema CRM personalizado con IA y automatización de emails. Para cada uno: qué se construyó, resultado clave, tecnologías usadas.>",
    "inversion": "<HTML explicando el valor de la inversión: por qué es una inversión y no un gasto. Conectar con el costo de inacción.>",
    "roi": "<HTML con cálculo de ROI: en cuántos meses se recupera la inversión basado en ahorro de tiempo, aumento de ventas, o eficiencia ganada>",
    "equipo": "<HTML sobre IM3 Systems — equipo, experiencia, diferenciadores>",
    "siguientes_pasos": "<HTML: 1. Aceptar propuesta 2. Reunión de kickoff 3. Inicio del desarrollo. Incluir que el primer entregable visible será en las primeras 2-3 semanas.>"
  },
  "pricing": {
    "total": 0,
    "currency": "USD",
    "includes": ["Desarrollo completo del proyecto", "Portal de seguimiento en tiempo real", "Tutor virtual IA post-entrega", "Soporte y acompañamiento continuo", "Manuales y documentación completa", "Capacitación del equipo"]
  },
  "timelineData": {
    "phases": [
      { "name": "Fase 1: ...", "weeks": 0, "deliverables": ["..."] }
    ],
    "totalWeeks": 0
  },
  "alcanceDetallado": [
    {
      "fase": "Fase 1: Nombre",
      "areas": [
        { "nombre": "Área 1", "tareas": ["Tarea específica 1", "Tarea específica 2"] },
        { "nombre": "Área 2", "tareas": ["Tarea 1", "Tarea 2"] }
      ]
    }
  ]
}`
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : null;
  if (!text) return null;

  try {
    // Clean JSON (remove possible markdown wrappers)
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      sections: parsed.sections || {},
      pricing: parsed.pricing || { total: 0, currency: "USD", includes: [], paymentOptions: [] },
      timelineData: parsed.timelineData || { phases: [], totalWeeks: 0 },
      alcanceDetallado: parsed.alcanceDetallado || [],
    };
  } catch (err) {
    log(`Error parsing proposal AI response: ${err}`);
    return null;
  }
}
