import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { contacts, diagnostics, sentEmails, contactNotes, activityLog, aiInsightsCache, gmailEmails, contactFiles } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { log } from "./index";
import { readGoogleDriveContent } from "./google-drive";
import { getIndustriaLabel } from "@shared/industrias";
import { proposalDataSchema, type ProposalData, type ProposalSectionKey, type ProposalSourcesReport } from "@shared/proposal-template/types";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load voice guide and cost reference once at module load time (not per call)
let VOICE_GUIDE = "";
let COST_REFERENCE = "";
try {
  VOICE_GUIDE = readFileSync(resolve(process.cwd(), "shared/proposal-voice-guide.md"), "utf-8");
} catch (err) {
  log(`[proposal-ai] could not load voice guide: ${err}`);
}
try {
  COST_REFERENCE = readFileSync(resolve(process.cwd(), "shared/proposal-cost-reference.md"), "utf-8");
} catch (err) {
  log(`[proposal-ai] could not load cost reference: ${err}`);
}

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
      const industriaLabel = getIndustriaLabel(diag.industria);
      const industriaExtra = diag.industria === "otro" && diag.industriaOtro ? ` (${diag.industriaOtro})` : "";
      const diagLines = [
        `DIAGNÓSTICO TECNOLÓGICO:`,
        `- Empresa: ${diag.empresa}`,
        `- Industria: ${industriaLabel}${industriaExtra}`,
        `- Empleados: ${diag.empleados}`,
        `- Área prioritaria: ${(diag.areaPrioridad as string[] | null)?.join(", ") || "N/A"}`,
        `- Presupuesto: ${diag.presupuesto}`,
      ];
      if (diag.objetivos) diagLines.push(`- Objetivos: ${(diag.objetivos as string[]).join(", ")}`);
      if (diag.productos) diagLines.push(`- Productos: ${diag.productos}`);
      if (diag.volumenMensual) diagLines.push(`- Volumen mensual: ${diag.volumenMensual}`);
      if (diag.herramientas) diagLines.push(`- Herramientas actuales: ${diag.herramientas}`);
      if (diag.conectadas) diagLines.push(`- Herramientas conectadas: ${diag.conectadas}`);
      if (diag.nivelTech) diagLines.push(`- Madurez tech: ${diag.nivelTech}`);
      if (diag.usaIA) diagLines.push(`- Usa IA: ${diag.usaIA}`);
      // Campos legacy: si existen en diagData, los incluimos por si hay registros viejos
      if (diagData.frustraciones) diagLines.push(`- Frustraciones: ${diagData.frustraciones}`);
      if (diagData.expectativas) diagLines.push(`- Expectativas: ${diagData.expectativas}`);
      if (diagData.timeline) diagLines.push(`- Timeline deseado: ${diagData.timeline}`);
      if (diagData.tomadorDecision) diagLines.push(`- Decisor: ${diagData.tomadorDecision}`);
      parts.push(diagLines.join("\n"));
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
      `- [${m.direction === "inbound" ? "RECIBIDO" : "ENVIADO"}] ${m.subject || "Sin asunto"} (${m.gmailDate.toLocaleDateString("es-CO")})\n  ${m.bodyText || m.snippet || ""}`
    ).join("\n")}`);
  }

  // Contact documents/files — auto-sync from Drive before reading
  const docs = await db.select().from(contactFiles).where(eq(contactFiles.contactId, contactId));
  if (docs.length > 0) {
    const docParts: string[] = [];
    for (const d of docs) {
      let content = d.content || "";

      // Auto-sync from Google Drive if: no content yet, or re-sync to get latest version
      const isGoogleUrl = d.url && (d.url.includes("google.com") || d.url.includes("docs.google"));
      if (isGoogleUrl) {
        try {
          const result = await readGoogleDriveContent(d.url);
          if (result.content && result.content.length > 0) {
            content = result.content;
            // Update DB with latest content
            await db.update(contactFiles).set({
              content: result.content,
              driveFileId: result.fileId,
            }).where(eq(contactFiles.id, d.id));
            log(`[Proposal] Drive auto-sync for "${d.name}": ${result.content.length} chars`);
          }
        } catch (err) {
          log(`[Proposal] Drive sync failed for "${d.name}": ${(err as Error).message}`);
        }
      }

      if (content) {
        docParts.push(`- [${d.type}] ${d.name}:\n  ${content}`);
      } else {
        docParts.push(`- [${d.type}] ${d.name} (sin contenido extraíble)`);
      }
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
 * Generate a complete ProposalData object matching shared/proposal-template/types.ts.
 * Uses Claude Sonnet 4 with a strict schema-matching prompt.
 */
export async function generateProposal(contactId: string, adminNotes?: string): Promise<{
  proposalData: ProposalData;
  sourcesReport: ProposalSourcesReport;
} | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const context = await gatherContactContext(contactId);
  if (!context) return null;

  // Resolve dates for meta
  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 días
  const todayStr = today.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const validUntilStr = validUntil.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 10000,
    temperature: 0.35,
    system: `Eres un consultor senior de IM3 Systems, agencia de tecnología especializada en IA, automatización y desarrollo de software para empresas en Latinoamérica.

Tu tarea: generar una propuesta comercial ESTRUCTURADA que se va a renderizar en un template React premium (secciones Hero, Summary, Problem, Solution, Tech, Timeline, ROI, Authority, Testimonials, Pricing, OperationalCosts, CTA).

═══════════════════════════════════════════════════════════════
VOICE GUIDE — aplica TODAS estas reglas al escribir cada sección:
═══════════════════════════════════════════════════════════════

${VOICE_GUIDE}

═══════════════════════════════════════════════════════════════
COST REFERENCE — úsalo para calcular la sección operationalCosts:
═══════════════════════════════════════════════════════════════

${COST_REFERENCE}

═══════════════════════════════════════════════════════════════
INSTRUCCIONES DE GENERACIÓN:
═══════════════════════════════════════════════════════════════

REGLAS CRÍTICAS:
- ANALIZA TODO el contexto: diagnóstico, emails, documentos, notas, auditoría, actividad. Cada fuente es relevante.
- Tono: profesional, confiado, orientado a resultados. Como consultor que sabe cerrar deals.
- NO inventes datos clave del cliente (nombres, cifras específicas) que no estén en el contexto. Si no hay dato, omítelo o usa rangos plausibles.
- Los precios en formato "$X.XXX USD" o equivalente en pesos colombianos.
- Los montos monetarios que muestras al cliente usan formato visual ("$12.500.000 COP" o "$3.500 USD"), NO números crudos.
- monthlyLossCOP es un NÚMERO entero (ej: 12500000) — el template lo anima en pantalla.
- Escribe en español latinoamericano (Colombia).
- Usa tags HTML simples SOLO si el schema lo permite. La mayoría de campos son strings planos — NO metas HTML en ellos.

SOBRE IM3 SYSTEMS (usa esto donde el schema lo pida):
- Agencia LATAM de IA + automatización + desarrollo
- Sede Colombia, operación LATAM + España
- Stack: React, Node.js, PostgreSQL, Claude AI, integraciones Google Workspace, Stripe
- Diferenciadores clave:
  * IA integrada en cada entregable (no es "agregado")
  * Portal de seguimiento en tiempo real (github commits → resúmenes para el cliente)
  * Tutor virtual post-entrega que entrena al equipo del cliente
  * Acompañamiento sin tiempo límite mientras el cliente crece
- Casos recientes: Passport2Fluency (plataforma idiomas + IA), CRM con IA y automatización email+WhatsApp, Auditorías automatizadas con IA.

ESTRUCTURA EXACTA QUE DEBES DEVOLVER (JSON estricto, sin markdown wrapper, sin comentarios, sin texto antes ni después):

{
  "proposalData": {
    "meta": {
      "clientName": "<nombre de la empresa>",
      "contactName": "<nombre del contacto principal>",
      "proposalDate": "${todayStr}",
      "validUntil": "${validUntilStr}",
      "industry": "<industria del cliente según el diagnóstico>"
    },
    "hero": {
      "painHeadline": "<1 oración impactante sobre el dolor principal del cliente, usando SUS palabras cuando sea posible. Ej: 'Estás perdiendo ventas cada semana por falta de seguimiento'>",
      "painAmount": "<cifra grande y dramática. Ej: '$12.5M COP/mes perdidos' o '480 horas/año desperdiciadas'>",
      "subtitle": "<2 líneas. Transición del dolor a la promesa: 'Te mostramos exactamente cómo recuperarlo en los próximos X meses.'>",
      "diagnosisRef": "<1 línea que valida que leímos su diagnóstico. Ej: 'Basado en el diagnóstico tecnológico que completaste el DD/MM'>"
    },
    "summary": {
      "commitmentQuote": "<quote fuerte de 1-2 líneas. Ej: 'No vendemos software. Vendemos tiempo, escala y control.' Debe sonar a IM3, no genérico>",
      "paragraphs": [
        "<Párrafo 1: contexto del cliente (2-3 líneas, personalizado)>",
        "<Párrafo 2: qué vamos a lograr juntos (2-3 líneas)>",
        "<Párrafo 3 (opcional): por qué ahora es el momento>"
      ],
      "stats": [
        { "label": "Tiempo de desarrollo", "value": "<ej: 12 semanas>" },
        { "label": "Ahorro estimado/mes", "value": "<ej: $8M COP>" },
        { "label": "ROI proyectado", "value": "<ej: 320% año 1>" }
      ]
    },
    "problem": {
      "intro": "<Intro de 2-3 líneas: 'Identificamos estos puntos críticos que están frenando a <empresa>:'>",
      "monthlyLossCOP": <NÚMERO ENTERO en COP, estimación del costo mensual de no actuar. Ej: 12500000 NO: "12.500.000">,
      "counterDescription": "<Leyenda de ese número: 'Por mes en ineficiencia y oportunidades perdidas.'>",
      "problemCards": [
        { "icon": "<emoji, ej: ⏰>", "title": "<título corto del problema>", "description": "<1-2 líneas describiendo el impacto concreto en SU negocio>" },
        { "icon": "<emoji>", "title": "...", "description": "..." },
        { "icon": "<emoji>", "title": "...", "description": "..." }
      ]
    },
    "solution": {
      "heading": "<ej: 'Tu plataforma integrada de crecimiento'>",
      "intro": "<2-3 líneas explicando la filosofía de la solución>",
      "modules": [
        { "number": 1, "title": "<nombre del módulo>", "description": "<qué hace>", "solves": "<qué problema de los anteriores resuelve específicamente>" },
        { "number": 2, "title": "...", "description": "...", "solves": "..." },
        { "number": 3, "title": "...", "description": "...", "solves": "..." }
      ]
    },
    "tech": {
      "heading": "<ej: 'Tecnología de punta, lista para escalar'>",
      "intro": "<2-3 líneas. Explica el stack EN LENGUAJE DE NEGOCIO, no de programador.>",
      "features": [
        "<4-6 features concretas, ej: 'Automatización de emails con IA que se adapta a cada cliente', 'Dashboard en tiempo real con métricas que importan'>"
      ],
      "stack": "<lista corta de tecnologías: 'React · Node.js · PostgreSQL · Claude AI · Google Workspace'>"
    },
    "timeline": {
      "heading": "<ej: 'Tu implementación en 3 fases'>",
      "phases": [
        { "number": 1, "title": "<nombre de la fase>", "durationWeeks": <entero>, "items": ["<tarea>", "<tarea>", "<tarea>"], "outcome": "<qué tienen al terminar esta fase>" },
        { "number": 2, "title": "...", "durationWeeks": 0, "items": ["..."], "outcome": "..." },
        { "number": 3, "title": "...", "durationWeeks": 0, "items": ["..."], "outcome": "..." }
      ]
    },
    "roi": {
      "heading": "<ej: 'Retorno de inversión proyectado'>",
      "recoveries": [
        { "amount": "<ej: $15M>", "currency": "COP", "label": "<ej: Ahorro anual en horas>" },
        { "amount": "...", "currency": "COP", "label": "..." },
        { "amount": "...", "currency": "COP", "label": "..." }
      ],
      "comparison": {
        "withoutLabel": "Sin IM3",
        "withoutAmount": "<monto anual de pérdidas actuales en formato $>",
        "withoutWeight": 100,
        "investmentLabel": "Con IM3",
        "investmentAmount": "<monto de la inversión en formato $>",
        "investmentWeight": <número 0-100 proporcional al monto vs el withoutAmount>,
        "caption": "<1 línea conectando inversión vs costo de no actuar>"
      },
      "heroTitle": "<ej: 'Se paga en 4 meses'>",
      "heroDescription": "<2-3 líneas explicando la matemática del payback>",
      "roiPercent": "<ej: '340%'>",
      "paybackMonths": "<ej: '4 meses'>"
    },
    "authority": {
      "heading": "<ej: 'Por qué IM3'>",
      "intro": "<2 líneas>",
      "stats": [
        { "num": "<ej: 15+>", "label": "Proyectos entregados" },
        { "num": "<ej: 100%>", "label": "Con IA integrada" },
        { "num": "<ej: 3>", "label": "Países de operación" },
        { "num": "<ej: 24/7>", "label": "Portal de seguimiento" }
      ],
      "differentiators": [
        { "icon": "<emoji>", "title": "<diferenciador>", "description": "<2 líneas explicándolo>" },
        { "icon": "<emoji>", "title": "...", "description": "..." },
        { "icon": "<emoji>", "title": "...", "description": "..." }
      ]
    },
    "testimonials": [
      { "text": "<quote relevante de un cliente ficticio pero plausible, máx 2 líneas>", "author": "<nombre>", "role": "<cargo, empresa>" },
      { "text": "...", "author": "...", "role": "..." }
    ],
    "pricing": {
      "label": "<ej: 'Tu inversión'>",
      "amount": "<ej: '12.500'>",
      "amountPrefix": "$",
      "amountSuffix": "USD",
      "priceFootnote": "<ej: 'Pago único. Sin mensualidades ocultas.'>",
      "scarcityMessage": "<1 línea de urgencia honesta, ej: 'Disponibilidad limitada: solo tomamos 3 proyectos nuevos este trimestre.'>",
      "milestones": [
        { "step": 1, "name": "Al firmar", "desc": "<qué se entrega>", "amount": "<ej: $3.750 USD (30%)>" },
        { "step": 2, "name": "Mitad del proyecto", "desc": "<...>", "amount": "<ej: $5.000 USD (40%)>" },
        { "step": 3, "name": "Entrega final", "desc": "<...>", "amount": "<ej: $3.750 USD (30%)>" }
      ],
      "includes": [
        "<8-10 bullets de qué incluye la inversión>"
      ]
    },
    "operationalCosts": {
      "heading": "<ej: 'Costos operativos mensuales'>",
      "intro": "<2-3 líneas explicando que estos son los gastos recurrentes que paga el cliente directamente a cada proveedor después del lanzamiento. Mencionar transparencia y que IM3 no agrega margen>",
      "categories": [
        {
          "name": "Infraestructura",
          "items": [
            { "service": "<ej: Railway (hosting + base de datos)>", "cost": "<ej: $25-40 USD/mes>", "note": "<explicación breve, ej: 'Escala con usuarios activos'>" }
          ]
        },
        {
          "name": "Comunicación",
          "items": [
            { "service": "<ej: Resend (envío de emails)>", "cost": "<ej: $0-20 USD/mes>", "note": "<ej: 'Gratis hasta 3.000 emails/mes'>" }
          ]
        },
        {
          "name": "IA y automatización",
          "items": [
            { "service": "<ej: Anthropic Claude>", "cost": "<ej: $30-100 USD/mes>", "note": "<ej: 'Uso estimado según volumen proyectado'>" }
          ]
        }
      ],
      "monthlyRangeLow": "<suma mínima en formato '$XX USD/mes'>",
      "monthlyRangeHigh": "<suma máxima en formato '$XXX USD/mes'>",
      "annualEstimate": "<ej: '$1.500 USD/año aprox'>",
      "paidBy": "cliente-directo",
      "managedServicesUpsell": "<Oferta opcional de managed services, ej: '¿Prefieres no preocuparte por esto? Por $150 USD/mes adicionales administramos todo (hosting, APIs, actualizaciones, soporte 24/7).'>",
      "disclaimer": "<ej: 'Estos costos los pagas directamente a cada proveedor. IM3 no agrega margen aquí.'>"
    },
    "cta": {
      "heading": "<ej: '¿Listo para recuperar tu tiempo?'>",
      "painHighlight": "<ej: 'Cada mes sin esto son $X COP que no vuelven.'>",
      "description": "<2-3 líneas cerrando, invitando a actuar hoy>",
      "acceptLabel": "Aceptar propuesta",
      "fallbackCtaLabel": "Hablemos 15 min",
      "deadlineMessage": "<ej: 'Esta propuesta es válida hasta el ${validUntilStr}'>",
      "guarantees": [
        "<ej: 'Si no entregamos en tiempo, devolvemos 20% del valor'>",
        "<...>"
      ]
    }
  },
  "sourcesReport": {
    "hero": ["Diagnóstico: campo X", "Email del DD/MM: asunto Y"],
    "problem": ["Diagnóstico: presupuesto, empleados, herramientas", "Documento: nombre"],
    "solution": ["..."],
    "timeline": ["..."],
    "roi": ["..."],
    "pricing": ["..."]
  }
}`,
    messages: [{
      role: "user",
      content: `Genera la propuesta comercial estructurada para este cliente.

${adminNotes ? `INSTRUCCIONES ADICIONALES DEL ADMIN:\n${adminNotes}\n\n` : ""}

CONTEXTO DEL CLIENTE:
${context}

Recuerda:
- Devuelve SOLO el JSON con las claves "proposalData" y "sourcesReport"
- Sin markdown, sin \`\`\`, sin texto fuera del JSON
- monthlyLossCOP es un NÚMERO entero sin formato
- Los campos "amount" de pricing y ROI son STRINGS con formato visual (ej: "12.500")
- Rellena TODOS los campos requeridos — no uses null ni omitas claves`
    }],
  });

  const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : null;
  if (!text) return null;

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.proposalData) {
      log(`Proposal AI response missing proposalData key`);
      return null;
    }

    // Validar con Zod — si falla, log pero no rechaces (mejor un parcial que nada)
    const validation = proposalDataSchema.safeParse(parsed.proposalData);
    if (!validation.success) {
      log(`Proposal AI validation failed: ${JSON.stringify(validation.error.issues.slice(0, 5))}`);
      // Aún así devolvemos lo que tenemos — el admin puede editar manualmente lo incompleto
    }

    return {
      proposalData: (validation.success ? validation.data : parsed.proposalData) as ProposalData,
      sourcesReport: (parsed.sourcesReport || {}) as ProposalSourcesReport,
    };
  } catch (err) {
    log(`Error parsing proposal AI response: ${err}`);
    return null;
  }
}

/**
 * Regenerate ONE section of a ProposalData with a natural-language instruction.
 * Works with the new schema (hero, summary, problem, solution, tech, timeline, roi,
 * authority, testimonials, pricing, cta). Returns a structured section object
 * that matches the corresponding sub-schema of ProposalData.
 */
export async function regenerateProposalSection(
  proposalId: string,
  sectionKey: string,
  instruction: string
): Promise<{ section: unknown; sectionKey: string } | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  const validKeys: ProposalSectionKey[] = [
    "meta", "hero", "summary", "problem", "solution", "tech",
    "timeline", "roi", "authority", "testimonials", "pricing", "operationalCosts", "cta"
  ];
  if (!validKeys.includes(sectionKey as ProposalSectionKey)) {
    return { error: `Sección inválida. Debe ser una de: ${validKeys.join(", ")}` };
  }

  const { proposals } = await import("@shared/schema");

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  const currentData = (proposal.sections as Partial<ProposalData> | null) || {};
  const currentSection = (currentData as Record<string, unknown>)[sectionKey];

  // Resumen de otras secciones (JSON truncado) para coherencia
  const otherSections: Record<string, unknown> = {};
  for (const key of validKeys) {
    if (key === sectionKey) continue;
    const val = (currentData as Record<string, unknown>)[key];
    if (val !== undefined) otherSections[key] = val;
  }
  const otherSummary = JSON.stringify(otherSections).substring(0, 3000);

  // Contact brief para personalización
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
  let contactBrief = "";
  if (contact) {
    contactBrief = `CLIENTE: ${contact.nombre} — ${contact.empresa}`;
    if (contact.diagnosticId) {
      const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
      if (diag) {
        contactBrief += ` · ${getIndustriaLabel(diag.industria)} · ${diag.empleados} empleados · Presupuesto ${diag.presupuesto}`;
      }
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.4,
      system: `Eres un consultor senior de IM3 Systems reescribiendo UNA sección estructurada de una propuesta comercial.

Tu tarea: devolver la sección "${sectionKey}" en JSON, con EXACTAMENTE los mismos campos que tiene actualmente, aplicando la instrucción del admin.

REGLAS:
- Devuelve SOLO el objeto JSON de esta sección (sin wrapper \`\`\`, sin markdown, sin explicaciones, sin texto antes o después).
- Mantén EXACTAMENTE la misma forma (keys, tipos de datos) que la versión actual.
- NO cambies tipos: si un campo es número, que siga siendo número. Si es array, array. Etc.
- Mantén coherencia con las otras secciones.
- Español latinoamericano.
- No inventes datos del cliente que contradigan el contexto.`,
      messages: [{
        role: "user",
        content: `${contactBrief}

SECCIÓN A REESCRIBIR (key="${sectionKey}"):
${JSON.stringify(currentSection, null, 2)}

OTRAS SECCIONES (solo referencia, NO modificar):
${otherSummary}

INSTRUCCIÓN DEL ADMIN:
${instruction}

Devuelve el JSON del objeto "${sectionKey}" aplicando la instrucción. Mismos campos, misma forma.`
      }]
    });

    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return { error: "Respuesta vacía de Claude" };

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      log(`[regenerateProposalSection] JSON parse failed: ${err}. Raw: ${cleaned.substring(0, 200)}`);
      return { error: "Claude devolvió JSON inválido" };
    }

    // Persistir en DB
    const newData = { ...currentData, [sectionKey]: parsed };
    await db.update(proposals)
      .set({ sections: newData as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(proposals.id, proposalId));

    return { section: parsed, sectionKey };
  } catch (err: any) {
    log(`Error regenerating section ${sectionKey}: ${err?.message || err}`);
    return { error: err?.message || "Error regenerando sección" };
  }
}
