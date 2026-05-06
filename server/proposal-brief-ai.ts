import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { proposals, proposalBriefs, contacts, diagnostics } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./index";
import { getIndustriaLabel } from "@shared/industrias";
import {
  proposalBriefDataSchema,
  type ProposalBriefData,
  type ProposalData,
  type BriefModule,
} from "@shared/proposal-template/types";
import { gatherContactContext, VOICE_GUIDE } from "./proposal-ai";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const VALID_MODULE_KEY_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function summarizeProposalForBrief(proposalData: Partial<ProposalData>): string {
  const lines: string[] = [];
  if (proposalData.meta) {
    lines.push(`CLIENTE: ${proposalData.meta.clientName} — Contacto: ${proposalData.meta.contactName} — Industria: ${proposalData.meta.industry}`);
  }
  if (proposalData.hero) {
    lines.push(`\nDOLOR PRINCIPAL: ${proposalData.hero.painHeadline}`);
    lines.push(`Subtitle: ${proposalData.hero.subtitle}`);
  }
  if (proposalData.problem) {
    lines.push(`\nPROBLEMAS IDENTIFICADOS:`);
    lines.push(proposalData.problem.intro || "");
    for (const c of proposalData.problem.problemCards || []) {
      lines.push(`  • ${c.title}: ${c.description}`);
    }
  }
  if (proposalData.solution) {
    lines.push(`\nSOLUCIÓN — MÓDULOS (FUENTE PRIMARIA del brief):`);
    for (const m of proposalData.solution.modules || []) {
      lines.push(`  [Módulo ${m.number}] ${m.title}`);
      lines.push(`    Descripción: ${m.description}`);
      lines.push(`    Resuelve: ${m.solves}`);
    }
  }
  if (proposalData.tech) {
    lines.push(`\nSTACK: ${proposalData.tech.stack}`);
    lines.push(`Features incluidas: ${(proposalData.tech.features || []).join(" · ")}`);
  }
  if (proposalData.timeline) {
    lines.push(`\nFASES DEL CRONOGRAMA:`);
    for (const p of proposalData.timeline.phases || []) {
      lines.push(`  Fase ${p.number} (${p.durationWeeks} semanas) — ${p.title}`);
      lines.push(`    Items: ${(p.items || []).join("; ")}`);
      if (p.outcome) lines.push(`    Outcome: ${p.outcome}`);
    }
  }
  if (proposalData.pricing) {
    lines.push(`\nINVERSIÓN: ${proposalData.pricing.amountPrefix}${proposalData.pricing.amount} ${proposalData.pricing.amountSuffix}`);
    lines.push(`Incluye: ${(proposalData.pricing.includes || []).join(" · ")}`);
  }
  return lines.join("\n");
}

/**
 * Genera el Brief Técnico Detallado a partir de una propuesta inicial ya generada.
 * El brief profundiza cada módulo con problema/funcionamiento/contexto/ejemplos.
 * Se persiste en proposal_briefs.sections.
 */
export async function generateProposalBrief(proposalId: string): Promise<{
  briefData: ProposalBriefData;
  sourcesReport: Record<string, string[]>;
} | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta no encontrada" };

  const proposalData = (proposal.sections as Partial<ProposalData> | null) || {};
  if (!proposalData.solution?.modules?.length) {
    return { error: "La propuesta no tiene módulos en solution. Genera primero la propuesta inicial." };
  }

  const contactContext = await gatherContactContext(proposal.contactId);
  if (!contactContext) return { error: "No se pudo reunir contexto del contacto" };

  const proposalSummary = summarizeProposalForBrief(proposalData);

  // Lista de keys esperadas: una por módulo de solution + una por fase (opcional)
  const expectedModuleKeys = (proposalData.solution.modules || []).map((m, i) => {
    const slug = (m.title || `modulo-${i + 1}`)
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || `modulo-${i + 1}`;
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      temperature: 0.4,
      system: `Eres un consultor senior de IM3 Systems. Tu tarea: generar el BRIEF TÉCNICO DETALLADO que se envía al cliente DESPUÉS de la reunión donde se presentó la propuesta inicial.

═══════════════════════════════════════════════════════════════
CONTEXTO DEL DOCUMENTO
═══════════════════════════════════════════════════════════════

Hay DOS documentos comerciales:

1. **Propuesta inicial** (ya entregada en reunión) — corta, vendedora, fácil de digerir. El cliente ya la vio.
2. **Brief Técnico Detallado** (este documento, lo que vas a generar AHORA) — material de soporte post-reunión que profundiza cada pieza para resolver dudas, justificar el precio, y servir de referencia técnica accesible.

Este brief NO repite la propuesta inicial. La COMPLEMENTA explicando con detalle cada módulo, cada elección, cada implicación. Debe ser el documento que cualquier persona del equipo del cliente pueda leer y entender exactamente qué se va a hacer y por qué.

═══════════════════════════════════════════════════════════════
VOICE GUIDE (aplica el mismo tono que la propuesta inicial):
═══════════════════════════════════════════════════════════════

${VOICE_GUIDE}

═══════════════════════════════════════════════════════════════
INSTRUCCIONES DE GENERACIÓN
═══════════════════════════════════════════════════════════════

REGLAS CRÍTICAS:
- Tono: profesional pero didáctico. El cliente puede no ser técnico — explica como si fuera un colega inteligente que no es del área.
- NO inventes datos del cliente. Si no hay base, usa fraseología honesta ("según las conversaciones iniciales", "basado en el contexto de tu industria").
- Español latinoamericano (Colombia).
- Cada módulo del brief debe tener AL MENOS 3-5 oraciones por campo de texto largo (problemSolved, howItWorks, meetingContext, whyThisChoice, withoutThis). NO seas escueto — el propósito DEL DOCUMENTO es profundizar.
- Examples: 2-4 ejemplos concretos por módulo, idealmente aterrizados en el negocio del cliente.

ESTRUCTURA DE SALIDA — JSON estricto, SIN markdown wrapper, SIN comentarios, SIN texto antes ni después:

{
  "briefData": {
    "intro": {
      "context": "<3-5 oraciones explicando QUÉ es este documento, POR QUÉ lo enviamos como complemento, y A QUIÉN está dirigido (cualquier persona del equipo del cliente que necesite entender el alcance técnico)>",
      "howToRead": "<2-4 oraciones explicando cómo está estructurado: una sección por módulo, un FAQ al final, un glosario opcional. Invitar a saltar a lo que más interese>"
    },
    "modules": [
      // UN OBJETO POR CADA MÓDULO de solution.modules de la propuesta inicial
      // Las keys esperadas son: ${JSON.stringify(expectedModuleKeys)}
      {
        "key": "<slug del módulo, debe ser uno de la lista de keys esperadas>",
        "title": "<título del módulo, idéntico o muy similar al de la propuesta inicial>",
        "problemSolved": "<3-5 oraciones. Qué problema CONCRETO del cliente resuelve este módulo. Aterrizado en SU negocio. Si la propuesta inicial menciona el problema en problem.problemCards, retoma ese hilo>",
        "howItWorks": "<4-6 oraciones. Cómo funciona técnicamente, en lenguaje accesible. Mencionar partes (UI, IA, integraciones, base de datos, automatizaciones) sin caer en jerga. Decir el FLUJO típico de uso>",
        "meetingContext": "<2-4 oraciones. De qué momento o tema de las conversaciones surgió este requerimiento. Si hay notas/emails que lo soporten en el contexto, REFERENCIARLAS de forma honesta. Si no hay base explícita, usa fraseología tipo 'durante las conversaciones iniciales sobre X' — nunca inventes una reunión específica>",
        "whyThisChoice": "<3-5 oraciones. Por qué elegimos esta solución y no otra. Mencionar 1-2 alternativas que se descartaron y POR QUÉ. Honestidad técnica>",
        "withoutThis": "<3-5 oraciones. Qué pasa si NO se hace este módulo. Costo de oportunidad concreto. Conectar con métricas del problem si aplica>",
        "examples": [
          "<Ejemplo 1 concreto: una situación específica del negocio del cliente donde este módulo se usa>",
          "<Ejemplo 2: otro caso de uso típico>",
          "<Ejemplo 3 (opcional)>"
        ],
        "technicalDetails": "<OPCIONAL. 2-4 oraciones con detalles técnicos relevantes (stack específico, integraciones, modelos de IA usados, etc.). Si no aporta, OMITIR esta key completamente>"
      }
      // ... un módulo más por cada de la propuesta inicial
    ],
    "faqs": [
      // 5-8 preguntas frecuentes que un cliente realmente preguntaría tras leer el brief
      // Ejemplos típicos: "¿Qué pasa si después quiero agregar un módulo?", "¿Cómo es el soporte tras la entrega?",
      // "¿Puedo cambiar el alcance a mitad de proyecto?", "¿Qué información necesitan de nosotros para arrancar?"
      { "question": "<pregunta>", "answer": "<respuesta clara, 2-4 oraciones>" }
    ],
    "glossary": [
      // OPCIONAL. 4-8 términos técnicos clave del proyecto, definidos para alguien no técnico.
      // Solo incluir si hay términos que valgan la pena explicar. Si no, OMITIR la key glossary.
      { "term": "<término>", "definition": "<definición clara, 1-2 oraciones>" }
    ]
  },
  "sourcesReport": {
    "modules": ["<para cada módulo, qué fuentes del contexto usaste para construirlo. Ej: 'diagnostic.objetivos', 'email del 12-04', 'nota de reunión X'>"],
    "faqs": ["<fuentes de las preguntas — pueden ser emails con dudas previas, conversaciones, etc.>"],
    "glossary": ["<por qué incluiste estos términos>"]
  }
}`,
      messages: [{
        role: "user",
        content: `═══ PROPUESTA INICIAL YA APROBADA POR EL CLIENTE ═══

A continuación tienes el resumen de la propuesta inicial que presentamos en reunión. Tu brief debe COMPLEMENTAR este contenido, NO repetirlo. Cada módulo del brief debe corresponder a un módulo de la solución de abajo, profundizando su explicación.

${proposalSummary}

═══ CONTEXTO DEL CLIENTE (diagnóstico, emails, notas, documentos) ═══

${contactContext.substring(0, 60000)}

═══ TAREA ═══

Genera el JSON del brief técnico detallado siguiendo EXACTAMENTE la estructura del system prompt. Las keys de los módulos deben ser ${JSON.stringify(expectedModuleKeys)} (en ese orden o con orden lógico).

Devuelve SOLO el JSON. Sin wrapper de markdown.`,
      }],
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
      log(`[generateProposalBrief] JSON parse failed: ${err}. Raw start: ${cleaned.substring(0, 300)}`);
      return { error: "Claude devolvió JSON inválido" };
    }

    const root = parsed as { briefData?: unknown; sourcesReport?: unknown };
    if (!root.briefData) return { error: "Respuesta sin briefData" };

    const validation = proposalBriefDataSchema.safeParse(root.briefData);
    if (!validation.success) {
      log(`[generateProposalBrief] zod validation failed: ${validation.error.toString().substring(0, 500)}`);
      return { error: "El JSON no cumple el schema del brief" };
    }

    const briefData = validation.data;
    const sourcesReport = (root.sourcesReport && typeof root.sourcesReport === "object")
      ? (root.sourcesReport as Record<string, string[]>)
      : {};

    return { briefData, sourcesReport };
  } catch (err: any) {
    log(`Error generating proposal brief: ${err?.message || err}`);
    return { error: err?.message || "Error generando brief" };
  }
}

/**
 * Regenera UN módulo del brief con instrucción libre del admin.
 * Persiste el cambio en proposal_briefs.sections.
 */
export async function regenerateBriefModule(
  briefId: string,
  moduleKey: string,
  instruction: string,
): Promise<{ module: BriefModule; moduleKey: string } | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  if (!VALID_MODULE_KEY_RE.test(moduleKey)) {
    return { error: "Module key inválido" };
  }

  const [brief] = await db.select().from(proposalBriefs).where(eq(proposalBriefs.id, briefId)).limit(1);
  if (!brief) return { error: "Brief no encontrado" };

  const briefData = (brief.sections as Partial<ProposalBriefData> | null) || {};
  const currentModule = (briefData.modules || []).find(m => m.key === moduleKey);
  if (!currentModule) return { error: `Módulo "${moduleKey}" no existe en este brief` };

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, brief.proposalId)).limit(1);
  if (!proposal) return { error: "Propuesta padre no encontrada" };
  const proposalData = (proposal.sections as Partial<ProposalData> | null) || {};
  const proposalSummary = summarizeProposalForBrief(proposalData);

  // Otros módulos del brief para coherencia
  const otherModules = (briefData.modules || []).filter(m => m.key !== moduleKey);

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, brief.contactId)).limit(1);
  let contactBrief = "";
  if (contact) {
    contactBrief = `CLIENTE: ${contact.nombre} — ${contact.empresa}`;
    if (contact.diagnosticId) {
      const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
      if (diag) contactBrief += ` · ${getIndustriaLabel(diag.industria)} · ${diag.empleados} empleados`;
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      temperature: 0.4,
      system: `Eres un consultor senior de IM3 Systems reescribiendo UN módulo del brief técnico detallado.

REGLAS:
- Devuelve SOLO el objeto JSON del módulo (sin wrapper de markdown).
- MANTÉN exactamente los mismos campos que el módulo actual: key, title, problemSolved, howItWorks, meetingContext, whyThisChoice, withoutThis, examples (array), technicalDetails (opcional).
- NO cambies la "key" del módulo bajo ninguna circunstancia.
- Mantén coherencia con la propuesta inicial y con los otros módulos del brief.
- Tono profesional, didáctico, español latinoamericano.
- No inventes datos del cliente.

${VOICE_GUIDE}`,
      messages: [{
        role: "user",
        content: `${contactBrief}

═══ PROPUESTA INICIAL (referencia) ═══
${proposalSummary}

═══ MÓDULO ACTUAL DEL BRIEF (a reescribir) ═══
${JSON.stringify(currentModule, null, 2)}

═══ OTROS MÓDULOS DEL BRIEF (solo referencia, NO modificar) ═══
${JSON.stringify(otherModules.map(m => ({ key: m.key, title: m.title })), null, 2)}

═══ INSTRUCCIÓN DEL ADMIN ═══
${instruction}

Devuelve el JSON del módulo aplicando la instrucción. Mantén "key" = "${moduleKey}" y conserva la estructura.`,
      }],
    });

    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return { error: "Respuesta vacía de Claude" };

    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      log(`[regenerateBriefModule] JSON parse failed: ${err}. Raw: ${cleaned.substring(0, 200)}`);
      return { error: "Claude devolvió JSON inválido" };
    }

    // Forzar la key correcta (defensa contra Claude renombrándola)
    const candidate = { ...(parsed as Record<string, unknown>), key: moduleKey };

    // Validar con schema parcial — usamos el schema del módulo individual a través del array schema
    const moduleValidation = proposalBriefDataSchema.shape.modules.element.safeParse(candidate);
    if (!moduleValidation.success) {
      log(`[regenerateBriefModule] zod validation failed: ${moduleValidation.error.toString().substring(0, 500)}`);
      return { error: "El JSON del módulo no cumple el schema" };
    }

    const newModule = moduleValidation.data;

    // Persistir
    const newModules = (briefData.modules || []).map(m => m.key === moduleKey ? newModule : m);
    const newBriefData: ProposalBriefData = {
      intro: briefData.intro || { context: "", howToRead: "" },
      modules: newModules,
      faqs: briefData.faqs,
      glossary: briefData.glossary,
    };

    await db.update(proposalBriefs)
      .set({ sections: newBriefData as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(proposalBriefs.id, briefId));

    return { module: newModule, moduleKey };
  } catch (err: any) {
    log(`Error regenerating brief module ${moduleKey}: ${err?.message || err}`);
    return { error: err?.message || "Error regenerando módulo" };
  }
}

/**
 * Genera 3 variantes de un módulo del brief (conservative, bold, didactic).
 * NO persiste. El admin elige cuál aplicar con applyBriefModuleOption.
 */
export async function generateBriefModuleOptions(
  briefId: string,
  moduleKey: string,
  instruction: string,
): Promise<{ options: Array<{ label: string; description: string; module: BriefModule }> } | { error: string }> {
  if (!db) return { error: "DB not configured" };
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  const [brief] = await db.select().from(proposalBriefs).where(eq(proposalBriefs.id, briefId)).limit(1);
  if (!brief) return { error: "Brief no encontrado" };

  const briefData = (brief.sections as Partial<ProposalBriefData> | null) || {};
  const currentModule = (briefData.modules || []).find(m => m.key === moduleKey);
  if (!currentModule) return { error: `Módulo "${moduleKey}" no existe` };

  const angles: Array<{ label: string; description: string; instruction: string }> = [
    { label: "Conservador", description: "Versión sobria, factual, sin adornos.", instruction: `${instruction}\n\nÁNGULO: conservador, factual, mínimo adorno. Profesional sobrio.` },
    { label: "Vendedor", description: "Versión más persuasiva, conectada al ROI.", instruction: `${instruction}\n\nÁNGULO: persuasivo, conecta cada explicación con valor de negocio y ROI. Sin caer en marketing barato.` },
    { label: "Didáctico", description: "Versión con más pedagogía y ejemplos.", instruction: `${instruction}\n\nÁNGULO: pedagógico, con más ejemplos concretos, analogías, y explicación paso a paso para alguien no técnico.` },
  ];

  const results = await Promise.all(angles.map(async (a) => {
    const r = await regenerateBriefModuleNoPersist(briefId, moduleKey, a.instruction, currentModule, briefData);
    return { ...a, module: r };
  }));

  // Si alguno falló, devolver error
  const failed = results.find(r => "error" in (r.module as any));
  if (failed) return { error: (failed.module as any).error };

  return {
    options: results.map(r => ({ label: r.label, description: r.description, module: r.module as BriefModule })),
  };
}

async function regenerateBriefModuleNoPersist(
  _briefId: string,
  moduleKey: string,
  instruction: string,
  currentModule: BriefModule,
  briefData: Partial<ProposalBriefData>,
): Promise<BriefModule | { error: string }> {
  const anthropic = getClient();
  if (!anthropic) return { error: "ANTHROPIC_API_KEY not set" };

  const otherModules = (briefData.modules || []).filter(m => m.key !== moduleKey);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      temperature: 0.5,
      system: `Eres un consultor senior de IM3 Systems generando UNA variante de un módulo del brief técnico. Devuelve SOLO el JSON del módulo, mismos campos. La "key" debe ser "${moduleKey}". ${VOICE_GUIDE}`,
      messages: [{
        role: "user",
        content: `MÓDULO ACTUAL:
${JSON.stringify(currentModule, null, 2)}

OTROS MÓDULOS (referencia):
${JSON.stringify(otherModules.map(m => ({ key: m.key, title: m.title })), null, 2)}

INSTRUCCIÓN:
${instruction}

Devuelve el JSON del módulo.`,
      }],
    });

    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return { error: "Respuesta vacía" };

    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const candidate = { ...(parsed as Record<string, unknown>), key: moduleKey };
    const validation = proposalBriefDataSchema.shape.modules.element.safeParse(candidate);
    if (!validation.success) return { error: "JSON inválido" };
    return validation.data;
  } catch (err: any) {
    return { error: err?.message || "Error generando variante" };
  }
}

/**
 * Aplica una opción elegida (módulo) al brief — persiste en DB.
 */
export async function applyBriefModuleOption(
  briefId: string,
  moduleKey: string,
  module: BriefModule,
): Promise<{ success: true } | { error: string }> {
  if (!db) return { error: "DB not configured" };

  const candidate = { ...module, key: moduleKey };
  const validation = proposalBriefDataSchema.shape.modules.element.safeParse(candidate);
  if (!validation.success) return { error: "Módulo inválido" };

  const [brief] = await db.select().from(proposalBriefs).where(eq(proposalBriefs.id, briefId)).limit(1);
  if (!brief) return { error: "Brief no encontrado" };

  const briefData = (brief.sections as Partial<ProposalBriefData> | null) || {};
  const newModules = (briefData.modules || []).map(m => m.key === moduleKey ? validation.data : m);
  const newBriefData: ProposalBriefData = {
    intro: briefData.intro || { context: "", howToRead: "" },
    modules: newModules,
    faqs: briefData.faqs,
    glossary: briefData.glossary,
  };

  await db.update(proposalBriefs)
    .set({ sections: newBriefData as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(proposalBriefs.id, briefId));

  return { success: true };
}
