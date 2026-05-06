import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { proposals, proposalBriefs, proposalBriefChatMessages, proposalBriefSnapshots, contacts } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { log } from "./index";
import { listFolderFilesRecursive, readGoogleDriveContent } from "./google-drive";
import {
  briefModuleSchema,
  briefIntroSchema,
  briefFAQSchema,
  briefGlossaryTermSchema,
  proposalBriefDataSchema,
  type ProposalBriefData,
  type BriefModule,
  type BriefFAQ,
  type BriefGlossaryTerm,
  type ProposalData,
} from "@shared/proposal-template/types";
import { VOICE_GUIDE, gatherContactContext } from "./proposal-ai";
import { z } from "zod";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = "claude-sonnet-4-20250514";
const MAX_HISTORY = 30;
const MAX_ITERATIONS = 12;

// Lock por briefId — serializa mensajes concurrentes al mismo brief
const briefLocks = new Map<string, Promise<unknown>>();
async function withBriefLock<T>(briefId: string, fn: () => Promise<T>): Promise<T> {
  const prev = briefLocks.get(briefId) || Promise.resolve();
  let releaseDone: () => void;
  const done = new Promise<void>((resolve) => { releaseDone = resolve; });
  briefLocks.set(briefId, prev.then(() => done));
  await prev;
  try {
    return await fn();
  } finally {
    releaseDone!();
    if (briefLocks.get(briefId) === prev.then(() => done)) briefLocks.delete(briefId);
  }
}

// Cache del contexto del contacto (TTL 5 min)
const contactContextCache = new Map<string, { value: string; ts: number }>();
async function getCachedContactContext(contactId: string): Promise<string> {
  const TTL = 5 * 60 * 1000;
  const hit = contactContextCache.get(contactId);
  if (hit && Date.now() - hit.ts < TTL) return hit.value;
  const value = await gatherContactContext(contactId);
  contactContextCache.set(contactId, { value, ts: Date.now() });
  return value;
}

type ToolCallSummary = { tool: string; module?: string; summary: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "view_brief",
    description: "Lee el estado actual del brief completo (intro + lista de módulos + FAQs + glosario). Úsalo para ver qué hay antes de modificar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "view_module",
    description: "Lee un módulo específico del brief por su key.",
    input_schema: {
      type: "object",
      properties: {
        moduleKey: { type: "string", description: "Key del módulo (slug)" },
      },
      required: ["moduleKey"],
    },
  },
  {
    name: "update_module",
    description: "Reescribe un módulo del brief. Para cambios pequeños (1 módulo), usa mode='apply'. Para cascadas grandes (varios módulos), primero llama todos con mode='preview' y espera confirmación del usuario antes de mode='apply'.",
    input_schema: {
      type: "object",
      properties: {
        moduleKey: { type: "string", description: "Key del módulo a actualizar (debe existir en el brief)" },
        newContent: {
          type: "object",
          description: "Objeto JSON completo del módulo: { key, title, problemSolved, howItWorks, meetingContext, whyThisChoice, withoutThis, examples (array), technicalDetails (opcional) }",
        },
        changeSummary: { type: "string", description: "Resumen breve (1 oración) del cambio en español" },
        mode: {
          type: "string",
          enum: ["preview", "apply"],
          description: "preview = solo simular y devolver diff. apply = guardar de verdad. Default: apply.",
        },
      },
      required: ["moduleKey", "newContent", "changeSummary"],
    },
  },
  {
    name: "update_intro",
    description: "Actualiza el bloque de introducción del brief (context + howToRead).",
    input_schema: {
      type: "object",
      properties: {
        newContent: {
          type: "object",
          description: "Objeto { context: string, howToRead: string }",
        },
        changeSummary: { type: "string", description: "Resumen breve del cambio" },
      },
      required: ["newContent", "changeSummary"],
    },
  },
  {
    name: "update_faqs",
    description: "Reescribe el array completo de FAQs del brief. Pasa todas las FAQs (las nuevas + las que conservas).",
    input_schema: {
      type: "object",
      properties: {
        faqs: {
          type: "array",
          description: "Array completo de { question, answer }",
        },
        changeSummary: { type: "string", description: "Resumen breve del cambio" },
      },
      required: ["faqs", "changeSummary"],
    },
  },
  {
    name: "update_glossary",
    description: "Reescribe el array completo del glosario. Pasa todos los términos.",
    input_schema: {
      type: "object",
      properties: {
        glossary: {
          type: "array",
          description: "Array completo de { term, definition }",
        },
        changeSummary: { type: "string", description: "Resumen breve del cambio" },
      },
      required: ["glossary", "changeSummary"],
    },
  },
  {
    name: "add_module",
    description: "Agrega un módulo NUEVO al brief (raro — normalmente los módulos vienen de la propuesta inicial). Solo úsalo si el usuario pide explícitamente añadir uno.",
    input_schema: {
      type: "object",
      properties: {
        newContent: {
          type: "object",
          description: "Módulo completo nuevo (mismo schema que update_module)",
        },
        changeSummary: { type: "string" },
      },
      required: ["newContent", "changeSummary"],
    },
  },
  {
    name: "remove_module",
    description: "Elimina un módulo del brief. Confirma con el usuario antes de hacerlo.",
    input_schema: {
      type: "object",
      properties: {
        moduleKey: { type: "string" },
        changeSummary: { type: "string" },
      },
      required: ["moduleKey", "changeSummary"],
    },
  },
  {
    name: "audit_brief",
    description: "Análisis global del brief: detecta módulos que están demasiado cortos, falta de ejemplos concretos, incoherencias con la propuesta inicial, repeticiones entre módulos, oportunidades de añadir FAQs/glosario.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_drive_folder",
    description: "Lista archivos en la carpeta Drive del cliente.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_drive_file",
    description: "Lee el contenido de un archivo Drive por fileId.",
    input_schema: {
      type: "object",
      properties: {
        fileId: { type: "string" },
      },
      required: ["fileId"],
    },
  },
];

const SCHEMA_DOCS = `
SCHEMA DEL BRIEF — RESPETA estas estructuras:

intro: { context: string, howToRead: string }

module (un objeto dentro del array modules): {
  key: string,             // slug, NO cambies la key existente
  title: string,
  problemSolved: string,    // 3-5 oraciones
  howItWorks: string,       // 4-6 oraciones, accesible
  meetingContext: string,   // de qué momento de la reunión surgió
  whyThisChoice: string,    // 3-5 oraciones, alternativas descartadas
  withoutThis: string,      // 3-5 oraciones, costo de oportunidad
  examples: string[],       // 2-4 ejemplos concretos
  technicalDetails?: string // opcional
}

faq: { question: string, answer: string }
glossaryTerm: { term: string, definition: string }

REGLAS:
- NUNCA cambies la key de un módulo existente.
- El brief COMPLEMENTA la propuesta inicial — no la repite literal. Profundiza.
- Mismo tono que la propuesta inicial (VOICE_GUIDE).
- Cada campo de texto largo debe tener al menos 3-5 oraciones — el brief vive para profundizar.
- Examples son strings descriptivos, no objetos.`;

const SYSTEM_PROMPT_BASE = `Eres un consultor senior de IM3 Systems. Tu trabajo: ayudar al admin a refinar el BRIEF TÉCNICO DETALLADO de una propuesta comercial.

═══════════════════════════════════════════════════════
CONTEXTO DEL DOCUMENTO
═══════════════════════════════════════════════════════

Este NO es la propuesta inicial. La propuesta inicial es corta, vendedora, y se presenta en reunión. Este brief técnico es el documento que se envía DESPUÉS de la reunión como material de soporte. Profundiza cada módulo: qué problema resuelve, cómo funciona, en qué parte de la reunión surgió, alternativas descartadas, ejemplos, qué pasa si no se hace.

Cuando el admin te pida cambios, piensa en cómo afectan la coherencia INTERNA del brief y la coherencia con la propuesta inicial.

═══════════════════════════════════════════════════════
PRINCIPIO #1 — DENSIDAD INFORMATIVA
═══════════════════════════════════════════════════════

El brief existe para profundizar. Si un campo tiene solo 1-2 oraciones, está mal — debe tener al menos 3-5. Si los ejemplos son genéricos ("una empresa típica"), están mal — deben aterrizarse al cliente. Sé exigente con la riqueza del contenido.

═══════════════════════════════════════════════════════
PRINCIPIO #2 — COHERENCIA CON LA PROPUESTA INICIAL
═══════════════════════════════════════════════════════

La propuesta inicial está disponible como referencia (en el contexto). Cada módulo del brief corresponde a un módulo de la propuesta. NO contradigas la inicial — complementa. Si el cliente cambió la inicial, el brief puede quedar desactualizado: detéctalo y avisa.

═══════════════════════════════════════════════════════
PRINCIPIO #3 — TONO IM3
═══════════════════════════════════════════════════════

Aplica VOICE_GUIDE (tono profesional, didáctico, español latinoamericano). El cliente puede no ser técnico — escribe para "un colega inteligente que no es del área".

═══════════════════════════════════════════════════════
CAPACIDADES (TOOLS)
═══════════════════════════════════════════════════════

• view_brief / view_module — leer estado actual
• update_module — actualizar UN módulo (mode preview/apply)
• update_intro / update_faqs / update_glossary — actualizar otros bloques
• add_module / remove_module — añadir o quitar módulos (raro)
• audit_brief — análisis global
• list_drive_folder / read_drive_file — acceso a documentos del cliente

═══════════════════════════════════════════════════════
ESTILO
═══════════════════════════════════════════════════════

- Español, conciso pero claro.
- update_module exige el OBJETO COMPLETO del módulo, no diff. Lee primero con view_module si necesitas la estructura.
- Mantén la "key" del módulo. Nunca la renombres.
- Si propones cascadas (afectar varios módulos), avisa primero y aplica solo después de confirmación.

${SCHEMA_DOCS}`;

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolName: string; module?: string; summary: string }
  | { type: "tool_error"; toolName: string; error: string }
  | { type: "done"; assistantMessage: string; toolCalls: ToolCallSummary[] }
  | { type: "error"; error: string };

export type StreamCallback = (event: StreamEvent) => void;

export async function runBriefChat(params: {
  briefId: string;
  userMessage: string;
  onEvent?: StreamCallback;
}): Promise<{ assistantMessage: string; toolCalls: ToolCallSummary[] }> {
  return withBriefLock(params.briefId, () => runBriefChatInner(params));
}

async function runBriefChatInner(params: {
  briefId: string;
  userMessage: string;
  onEvent?: StreamCallback;
}): Promise<{ assistantMessage: string; toolCalls: ToolCallSummary[] }> {
  if (!db) throw new Error("DB no disponible");
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no configurada");

  const [brief] = await db.select().from(proposalBriefs).where(eq(proposalBriefs.id, params.briefId)).limit(1);
  if (!brief) throw new Error("Brief no encontrado");

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, brief.proposalId)).limit(1);
  if (!proposal) throw new Error("Propuesta padre no encontrada");

  const history = await db.select().from(proposalBriefChatMessages)
    .where(eq(proposalBriefChatMessages.briefId, params.briefId))
    .orderBy(asc(proposalBriefChatMessages.createdAt))
    .limit(MAX_HISTORY);

  // Guardar mensaje del usuario
  await db.insert(proposalBriefChatMessages).values({
    briefId: params.briefId,
    role: "user",
    content: params.userMessage,
  });

  const claudeMessages: Anthropic.MessageParam[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
  claudeMessages.push({ role: "user", content: params.userMessage });

  // Snapshots y mutación in-memory
  let currentBriefData: ProposalBriefData = (brief.sections as ProposalBriefData) || { intro: { context: "", howToRead: "" }, modules: [] };

  // Asegurar estructura
  if (!currentBriefData.modules) currentBriefData = { ...currentBriefData, modules: [] };
  if (!currentBriefData.intro) currentBriefData = { ...currentBriefData, intro: { context: "", howToRead: "" } };

  const proposalData = (proposal.sections as Partial<ProposalData> | null) || {};

  // Resumen compacto de la propuesta inicial (para coherencia)
  const proposalRefSummary = (() => {
    const lines: string[] = [];
    if (proposalData.solution?.modules) {
      lines.push("MÓDULOS DE LA PROPUESTA INICIAL (referencia):");
      for (const m of proposalData.solution.modules) {
        lines.push(`  [${m.number}] ${m.title} → resuelve: ${m.solves}`);
      }
    }
    if (proposalData.timeline?.phases) {
      lines.push("\nFASES:");
      for (const p of proposalData.timeline.phases) {
        lines.push(`  Fase ${p.number}: ${p.title} (${p.durationWeeks} sem)`);
      }
    }
    if (proposalData.pricing) {
      lines.push(`\nINVERSIÓN: ${proposalData.pricing.amountPrefix}${proposalData.pricing.amount} ${proposalData.pricing.amountSuffix}`);
    }
    return lines.join("\n");
  })();

  let clientContext = "";
  try {
    clientContext = await getCachedContactContext(brief.contactId);
  } catch (err) {
    log(`[brief-chat] could not gather client context: ${(err as Error).message}`);
  }

  const briefSnapshot = JSON.stringify(currentBriefData, null, 2).substring(0, 30000);

  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    {
      type: "text",
      text: SYSTEM_PROMPT_BASE,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `═══════════════════════════════════════════════════════
VOICE GUIDE (tono y estilo de IM3)
═══════════════════════════════════════════════════════

${VOICE_GUIDE.substring(0, 8000)}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `═══════════════════════════════════════════════════════
PROPUESTA INICIAL (referencia — el brief la complementa)
═══════════════════════════════════════════════════════

${proposalRefSummary}

═══════════════════════════════════════════════════════
CONTEXTO DEL CLIENTE (diagnóstico, emails, docs)
═══════════════════════════════════════════════════════

${clientContext.substring(0, 25000)}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `═══════════════════════════════════════════════════════
ESTADO ACTUAL DEL BRIEF (JSON)
═══════════════════════════════════════════════════════

Título: ${brief.title || "(sin título)"}
Status: ${brief.status}

CONTENIDO:
${briefSnapshot}`,
    },
  ];

  const dbRef = db;
  const toolCalls: ToolCallSummary[] = [];
  let assistantText = "";
  let iteration = 0;

  const persist = async (newData: ProposalBriefData, summary: string, moduleKey?: string) => {
    // Snapshot ANTES del cambio
    try {
      await dbRef.insert(proposalBriefSnapshots).values({
        briefId: params.briefId,
        sections: currentBriefData as Record<string, unknown>,
        changeSummary: summary,
        moduleKey: moduleKey || null,
      });
    } catch (err) {
      log(`[brief-chat] could not snapshot: ${(err as Error).message}`);
    }
    currentBriefData = newData;
    await dbRef.update(proposalBriefs)
      .set({
        sections: currentBriefData as Record<string, unknown>,
        outdatedSinceProposalUpdate: null,
        updatedAt: new Date(),
      })
      .where(eq(proposalBriefs.id, params.briefId));
  };

  const executeTool = async (toolName: string, input: Record<string, unknown>): Promise<string> => {
    if (toolName === "view_brief") {
      return JSON.stringify(currentBriefData, null, 2).substring(0, 12000);
    }
    if (toolName === "view_module") {
      const moduleKey = input.moduleKey as string;
      const m = currentBriefData.modules.find(mm => mm.key === moduleKey);
      return m ? JSON.stringify(m, null, 2) : `Módulo "${moduleKey}" no existe. Módulos disponibles: ${currentBriefData.modules.map(mm => mm.key).join(", ")}`;
    }
    if (toolName === "update_module") {
      const moduleKey = input.moduleKey as string;
      const newContent = input.newContent as Record<string, unknown>;
      const changeSummary = (input.changeSummary as string) || "Módulo actualizado";
      const mode = (input.mode as "preview" | "apply" | undefined) ?? "apply";

      const existing = currentBriefData.modules.find(m => m.key === moduleKey);
      if (!existing) return `ERROR: módulo "${moduleKey}" no existe. Módulos disponibles: ${currentBriefData.modules.map(m => m.key).join(", ")}`;

      // Forzar key correcta
      const candidate = { ...newContent, key: moduleKey };
      const validation = briefModuleSchema.safeParse(candidate);
      if (!validation.success) {
        const errs = validation.error.errors.slice(0, 5).map(e => `- ${e.path.join(".") || "(root)"}: ${e.message}`).join("\n");
        return `ERROR DE VALIDACIÓN — el módulo no se guardó. Schema esperado: { key, title, problemSolved, howItWorks, meetingContext, whyThisChoice, withoutThis, examples (array de strings), technicalDetails (opcional) }.\n\nErrores:\n${errs}`;
      }

      if (mode === "preview") {
        const beforeStr = JSON.stringify(existing, null, 2).substring(0, 2500);
        const afterStr = JSON.stringify(validation.data, null, 2).substring(0, 2500);
        toolCalls.push({ tool: "update_module", module: moduleKey, summary: `[PREVIEW] ${changeSummary}` });
        return `MODO PREVIEW — cambio NO guardado.\n\nMódulo: ${moduleKey}\nResumen: ${changeSummary}\n\nANTES:\n${beforeStr}\n\nDESPUÉS:\n${afterStr}\n\nPresenta el resumen al usuario y espera confirmación. Cuando confirme, vuelve a llamar update_module con mode="apply".`;
      }

      const newData: ProposalBriefData = {
        ...currentBriefData,
        modules: currentBriefData.modules.map(m => m.key === moduleKey ? validation.data : m),
      };
      await persist(newData, changeSummary, moduleKey);
      toolCalls.push({ tool: "update_module", module: moduleKey, summary: changeSummary });
      return `Módulo "${moduleKey}" actualizado y guardado.`;
    }
    if (toolName === "update_intro") {
      const newContent = input.newContent as Record<string, unknown>;
      const changeSummary = (input.changeSummary as string) || "Intro actualizada";
      const validation = briefIntroSchema.safeParse(newContent);
      if (!validation.success) {
        return `ERROR: intro inválida. Schema: { context: string, howToRead: string }`;
      }
      const newData: ProposalBriefData = { ...currentBriefData, intro: validation.data };
      await persist(newData, changeSummary, "__intro__");
      toolCalls.push({ tool: "update_intro", summary: changeSummary });
      return "Intro actualizada y guardada.";
    }
    if (toolName === "update_faqs") {
      const faqs = input.faqs as unknown[];
      const changeSummary = (input.changeSummary as string) || "FAQs actualizadas";
      const validation = z.array(briefFAQSchema).safeParse(faqs);
      if (!validation.success) {
        return `ERROR: faqs inválidas. Schema: array de { question, answer }`;
      }
      const newData: ProposalBriefData = { ...currentBriefData, faqs: validation.data as BriefFAQ[] };
      await persist(newData, changeSummary, "__faqs__");
      toolCalls.push({ tool: "update_faqs", summary: changeSummary });
      return `FAQs actualizadas (${validation.data.length} preguntas).`;
    }
    if (toolName === "update_glossary") {
      const glossary = input.glossary as unknown[];
      const changeSummary = (input.changeSummary as string) || "Glosario actualizado";
      const validation = z.array(briefGlossaryTermSchema).safeParse(glossary);
      if (!validation.success) {
        return `ERROR: glossary inválido. Schema: array de { term, definition }`;
      }
      const newData: ProposalBriefData = { ...currentBriefData, glossary: validation.data as BriefGlossaryTerm[] };
      await persist(newData, changeSummary, "__glossary__");
      toolCalls.push({ tool: "update_glossary", summary: changeSummary });
      return `Glosario actualizado (${validation.data.length} términos).`;
    }
    if (toolName === "add_module") {
      const newContent = input.newContent as Record<string, unknown>;
      const changeSummary = (input.changeSummary as string) || "Módulo agregado";
      const validation = briefModuleSchema.safeParse(newContent);
      if (!validation.success) return `ERROR: módulo inválido`;
      if (currentBriefData.modules.find(m => m.key === validation.data.key)) {
        return `ERROR: ya existe un módulo con key "${validation.data.key}". Usa update_module en su lugar.`;
      }
      const newData: ProposalBriefData = {
        ...currentBriefData,
        modules: [...currentBriefData.modules, validation.data],
      };
      await persist(newData, changeSummary, validation.data.key);
      toolCalls.push({ tool: "add_module", module: validation.data.key, summary: changeSummary });
      return `Módulo "${validation.data.key}" agregado.`;
    }
    if (toolName === "remove_module") {
      const moduleKey = input.moduleKey as string;
      const changeSummary = (input.changeSummary as string) || `Módulo eliminado: ${moduleKey}`;
      if (!currentBriefData.modules.find(m => m.key === moduleKey)) {
        return `ERROR: módulo "${moduleKey}" no existe.`;
      }
      const newData: ProposalBriefData = {
        ...currentBriefData,
        modules: currentBriefData.modules.filter(m => m.key !== moduleKey),
      };
      await persist(newData, changeSummary, moduleKey);
      toolCalls.push({ tool: "remove_module", module: moduleKey, summary: changeSummary });
      return `Módulo "${moduleKey}" eliminado.`;
    }
    if (toolName === "audit_brief") {
      const issues: string[] = [];
      // Validaciones simples (no Claude): largo de campos
      for (const m of currentBriefData.modules) {
        const shortFields: string[] = [];
        if ((m.problemSolved || "").length < 80) shortFields.push("problemSolved");
        if ((m.howItWorks || "").length < 100) shortFields.push("howItWorks");
        if ((m.whyThisChoice || "").length < 80) shortFields.push("whyThisChoice");
        if ((m.withoutThis || "").length < 80) shortFields.push("withoutThis");
        if (!m.examples || m.examples.length < 2) shortFields.push("examples (<2)");
        if (shortFields.length) {
          issues.push(`🟡 Módulo "${m.title}" (${m.key}) — campos cortos: ${shortFields.join(", ")}`);
        }
      }
      // Coherencia con la propuesta inicial: cada módulo de la propuesta debe tener un módulo en el brief
      const proposalModuleTitles = (proposalData.solution?.modules || []).map(m => m.title.toLowerCase());
      const briefModuleTitles = currentBriefData.modules.map(m => m.title.toLowerCase());
      for (const t of proposalModuleTitles) {
        if (!briefModuleTitles.some(bt => bt.includes(t.substring(0, 15)) || t.includes(bt.substring(0, 15)))) {
          issues.push(`🔴 La propuesta menciona el módulo "${t}" pero el brief no lo cubre`);
        }
      }
      // Cantidad de FAQs y glossary
      if (!currentBriefData.faqs || currentBriefData.faqs.length < 3) {
        issues.push(`🟡 Solo ${currentBriefData.faqs?.length || 0} FAQs — recomendado mínimo 5`);
      }

      const dump = JSON.stringify(currentBriefData, null, 2).substring(0, 8000);
      toolCalls.push({ tool: "audit_brief", summary: issues.length > 0 ? `Auditoría — ${issues.length} hallazgos` : "Auditoría — sin issues" });
      return `AUDIT REPORT DEL BRIEF\n\n═══════════════════════════════\n1. CHECK MECÁNICOS\n═══════════════════════════════\n${issues.length === 0 ? "✓ Sin problemas mecánicos detectados." : issues.join("\n")}\n\n═══════════════════════════════\n2. ANÁLISIS CUALITATIVO (te toca a ti)\n═══════════════════════════════\nContenido del brief:\n\n${dump}\n\nINSTRUCCIONES:\n- Detecta repeticiones entre módulos.\n- Detecta ejemplos genéricos (que no aterrizan al cliente).\n- Detecta contradicciones con la propuesta inicial (ver referencia arriba).\n- Sugiere FAQs faltantes que el cliente pediría.\n- Reporta hallazgos al usuario y propón fixes (puedes aplicarlos con update_module si son obvios).`;
    }
    if (toolName === "list_drive_folder") {
      const [contact] = await dbRef.select({ driveFolderId: contacts.driveFolderId, empresa: contacts.empresa })
        .from(contacts).where(eq(contacts.id, brief.contactId)).limit(1);
      if (!contact?.driveFolderId) return "El cliente no tiene carpeta de Drive asociada.";
      try {
        const files = await listFolderFilesRecursive(contact.driveFolderId, { maxFiles: 50 });
        toolCalls.push({ tool: "list_drive_folder", summary: `Listé ${files.length} archivo(s)` });
        if (!files.length) return `Carpeta de "${contact.empresa}" vacía.`;
        return `Archivos en "${contact.empresa}" (${files.length}):\n` + files.map(f => `- ${f.name} [${f.mimeType}] (id: ${f.id})`).join("\n");
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    }
    if (toolName === "read_drive_file") {
      const fileId = input.fileId as string;
      const READ_TIMEOUT_MS = 30000;
      try {
        const result = await Promise.race([
          readGoogleDriveContent(`https://drive.google.com/file/d/${fileId}/view`),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), READ_TIMEOUT_MS)),
        ]);
        const content = result.content.substring(0, 20000);
        toolCalls.push({ tool: "read_drive_file", summary: `Leí archivo (${result.content.length} chars)` });
        return `Contenido (${result.mimeType}):\n\n${content}${result.content.length > 20000 ? "\n[...truncado]" : ""}`;
      } catch (err) {
        return `Error leyendo ${fileId}: ${(err as Error).message}`;
      }
    }
    return `Tool "${toolName}" no reconocida.`;
  };

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      system: systemBlocks,
      tools: TOOLS,
      messages: claudeMessages,
    });

    if (params.onEvent) {
      stream.on("text", (textChunk) => {
        params.onEvent!({ type: "text_delta", text: textChunk });
      });
    }

    const response = await stream.finalMessage();

    const assistantContent: Anthropic.ContentBlockParam[] = [];
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        assistantText += (assistantText ? "\n\n" : "") + block.text;
        assistantContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        assistantContent.push(block);
        toolUseBlocks.push(block);
      }
    }

    if (assistantContent.length > 0) {
      claudeMessages.push({ role: "assistant", content: assistantContent });
    }

    if (toolUseBlocks.length === 0) break;

    const before = toolCalls.length;
    const toolResults = await Promise.all(toolUseBlocks.map(async (b) => ({
      type: "tool_result" as const,
      tool_use_id: b.id,
      content: await executeTool(b.name, b.input as Record<string, unknown>),
    })));

    if (params.onEvent) {
      for (let i = before; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        params.onEvent({ type: "tool_call", toolName: tc.tool, module: tc.module, summary: tc.summary });
      }
    }

    claudeMessages.push({ role: "user", content: toolResults });
  }

  const finalText = assistantText.trim() || "(El asistente no devolvió texto)";

  await db.insert(proposalBriefChatMessages).values({
    briefId: params.briefId,
    role: "assistant",
    content: finalText,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
  });

  // Si hubo cambios, actualizar status del brief de "not_generated" a "draft"
  if (toolCalls.some(tc => ["update_module", "update_intro", "update_faqs", "update_glossary", "add_module", "remove_module"].includes(tc.tool))) {
    await db.update(proposalBriefs)
      .set({ status: brief.status === "not_generated" ? "draft" : brief.status })
      .where(eq(proposalBriefs.id, params.briefId))
      .catch(() => {});
  }

  return { assistantMessage: finalText, toolCalls };
}

export async function getBriefChatHistory(briefId: string): Promise<Array<{
  id: string;
  role: string;
  content: string;
  toolCalls: ToolCallSummary[] | null;
  createdAt: Date;
}>> {
  if (!db) return [];
  const rows = await db.select().from(proposalBriefChatMessages)
    .where(eq(proposalBriefChatMessages.briefId, briefId))
    .orderBy(asc(proposalBriefChatMessages.createdAt));
  return rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    toolCalls: r.toolCalls as ToolCallSummary[] | null,
    createdAt: r.createdAt,
  }));
}

export async function clearBriefChatHistory(briefId: string): Promise<void> {
  if (!db) return;
  await db.delete(proposalBriefChatMessages).where(eq(proposalBriefChatMessages.briefId, briefId));
}
