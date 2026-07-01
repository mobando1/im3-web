// Asistente IA del editor CMS. Mirror del patrón de proposal-brief-chat.ts.
//
// Modelo de seguridad: las tools de escritura SOLO tocan el BORRADOR
// (draft_content / SEO), nunca publican, y pasan por los MISMOS guards que el
// formulario (whitelist de campos, anti-XSS, maxLen, URLs de imagen seguras).
// Nada sale en vivo hasta que un humano pulsa "Publicar".

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getModelGeneration } from "./config";
import { cmsPages, cmsChatMessages, type CmsPage } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { log } from "./index";
import { isEditableKey, sanitizeContentValue, validateSeoField } from "./cms-editor-guards";
import { setAtPath, getAtPath, cloneJson } from "@shared/cms-path";
import { deepMerge } from "@shared/cms-merge";
import { translations, type Language, type Translations } from "@shared/landing-defaults";
import { CMS_MANIFEST, EDITABLE_LISTS } from "@shared/cms-field-manifest";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = () => getModelGeneration();
const MAX_ITERATIONS = 10;
const MAX_HISTORY = 20;
const LANGS: Language[] = ["es", "en"];

type ToolCallSummary = { tool: string; summary: string };

// Lock por página — serializa turnos concurrentes
const pageLocks = new Map<string, Promise<unknown>>();
async function withPageLock<T>(pageId: string, fn: () => Promise<T>): Promise<T> {
  const prev = pageLocks.get(pageId) || Promise.resolve();
  let releaseDone: () => void;
  const done = new Promise<void>((resolve) => { releaseDone = resolve; });
  pageLocks.set(pageId, prev.then(() => done));
  await prev;
  try {
    return await fn();
  } finally {
    releaseDone!();
    if (pageLocks.get(pageId) === prev.then(() => done)) pageLocks.delete(pageId);
  }
}

// Todas las paths editables (campos simples + ítems de lista según el largo default).
function enumeratePaths(): string[] {
  const out: string[] = [];
  for (const s of CMS_MANIFEST) {
    for (const f of s.fields ?? []) out.push(f.path);
  }
  for (const list of EDITABLE_LISTS) {
    const arr = getAtPath(translations.es, list.path);
    const count = Array.isArray(arr) ? arr.length : 0;
    for (let i = 0; i < count; i++) {
      for (const f of list.fields) out.push(`${list.path}.${i}.${f.path}`);
    }
  }
  return out;
}

function fieldsSummary(): string {
  const lines: string[] = [];
  for (const s of CMS_MANIFEST) {
    const fieldList = (s.fields ?? []).map((f) => `${f.path} (${f.kind})`);
    for (const list of s.lists ?? []) {
      const arr = getAtPath(translations.es, list.path);
      const count = Array.isArray(arr) ? arr.length : 0;
      fieldList.push(`${list.path}.[0..${Math.max(0, count - 1)}].{${list.fields.map((f) => f.path).join(",")}}`);
    }
    lines.push(`• ${s.label}: ${fieldList.join(", ")}`);
  }
  return lines.join("\n");
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_page_content",
    description: "Devuelve los valores actuales (borrador mergeado sobre los defaults) de los campos editables para un idioma. Úsalo antes de editar.",
    input_schema: {
      type: "object",
      properties: { lang: { type: "string", enum: ["es", "en"], description: "Idioma a leer" } },
      required: ["lang"],
    },
  },
  {
    name: "propose_content_edit",
    description: "Edita un campo de contenido en el BORRADOR (no en vivo). Falla si la key no es editable, contiene HTML/JS, o excede el largo.",
    input_schema: {
      type: "object",
      properties: {
        lang: { type: "string", enum: ["es", "en"] },
        path: { type: "string", description: "Path del campo, p.ej. hero.headline o testimonials.reviews.0.quote" },
        value: { type: "string", description: "Nuevo valor de texto" },
      },
      required: ["lang", "path", "value"],
    },
  },
  {
    name: "propose_seo_edit",
    description: "Edita un campo SEO de la página en el BORRADOR: keyphrase, metaTitle, metaDescription u ogImageUrl.",
    input_schema: {
      type: "object",
      properties: {
        field: { type: "string", enum: ["keyphrase", "metaTitle", "metaDescription", "ogImageUrl"] },
        value: { type: "string" },
      },
      required: ["field", "value"],
    },
  },
];

export async function runCmsEditorChat(params: { pageId: string; userMessage: string }): Promise<{
  assistantMessage: string;
  toolCalls: ToolCallSummary[];
  page: CmsPage | null;
}> {
  if (!db) return { assistantMessage: "DB no disponible.", toolCalls: [], page: null };
  const anthropic = getClient();
  if (!anthropic) return { assistantMessage: "El asistente IA no está configurado (falta ANTHROPIC_API_KEY).", toolCalls: [], page: null };

  return withPageLock(params.pageId, async () => {
    const [page] = await db!.select().from(cmsPages).where(eq(cmsPages.id, params.pageId)).limit(1);
    if (!page || page.deletedAt) return { assistantMessage: "Página no encontrada.", toolCalls: [], page: null };

    // Estado de trabajo (se persiste una sola vez al final si hubo cambios)
    const dc = (cloneJson(page.draftContent as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    if (!dc.es || typeof dc.es !== "object") dc.es = {};
    if (!dc.en || typeof dc.en !== "object") dc.en = {};
    const seo = {
      keyphrase: page.keyphrase ?? "",
      metaTitle: page.metaTitle ?? "",
      metaDescription: page.metaDescription ?? "",
      ogImageUrl: page.ogImageUrl ?? "",
    };
    let changed = false;
    const toolCalls: ToolCallSummary[] = [];

    // Persistir mensaje del usuario
    await db!.insert(cmsChatMessages).values({ pageId: params.pageId, role: "user", content: params.userMessage });

    // Historial → mensajes de Claude
    const history = await db!.select().from(cmsChatMessages)
      .where(eq(cmsChatMessages.pageId, params.pageId))
      .orderBy(asc(cmsChatMessages.createdAt));
    const recent = history.slice(-MAX_HISTORY);
    const claudeMessages: Anthropic.MessageParam[] = recent.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const system = `Eres el asistente de edición del sitio web de IM3 Systems (landing público).
Ayudas a un editor a cambiar COPY, IMÁGENES y SEO mediante tools. Reglas:
- SOLO puedes editar los campos de la lista de abajo (whitelist). Nada de estructura, layout ni código.
- Tus ediciones van al BORRADOR, NUNCA en vivo. No existe forma de publicar desde aquí: un humano revisa y publica.
- Idiomas: "es" (default) y "en". Si el usuario no especifica, asume "es".
- Antes de editar algo dudoso, llama get_page_content para ver el valor actual.
- Sé conciso. Responde en español. Al terminar, resume en 1-2 frases qué cambiaste (o por qué no).
- Si una edición es rechazada por un guard, explica el motivo y propone una alternativa.

CAMPOS EDITABLES (path (tipo)):
${fieldsSummary()}

CAMPOS SEO: keyphrase, metaTitle (≤60-70), metaDescription (≤160-200), ogImageUrl.`;

    const executeTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      if (name === "get_page_content") {
        const lang = (input.lang === "en" ? "en" : "es") as Language;
        const merged = deepMerge(translations[lang], dc[lang]) as Translations;
        const values: Record<string, string> = {};
        for (const p of enumeratePaths()) {
          const v = getAtPath(merged, p);
          if (typeof v === "string") values[p] = v;
        }
        return JSON.stringify({ lang, seo, values });
      }
      if (name === "propose_content_edit") {
        const lang = (input.lang === "en" ? "en" : "es") as Language;
        const path = String(input.path || "");
        if (!isEditableKey(path)) return `RECHAZADO: "${path}" no es un campo editable.`;
        const v = sanitizeContentValue(path, input.value);
        if (!v.ok) return `RECHAZADO: ${v.reason}`;
        setAtPath(dc[lang] as Record<string, unknown>, path, v.value);
        changed = true;
        toolCalls.push({ tool: "propose_content_edit", summary: `${path} (${lang})` });
        return `OK: actualicé ${path} (${lang}) en el borrador.`;
      }
      if (name === "propose_seo_edit") {
        const field = String(input.field || "");
        const v = validateSeoField(field, input.value);
        if (!v.ok) return `RECHAZADO: ${v.reason}`;
        (seo as Record<string, string>)[field] = v.value;
        changed = true;
        toolCalls.push({ tool: "propose_seo_edit", summary: `SEO ${field}` });
        return `OK: actualicé SEO ${field} en el borrador.`;
      }
      return `Tool "${name}" no reconocida.`;
    };

    let assistantText = "";
    let iteration = 0;
    while (iteration < MAX_ITERATIONS) {
      iteration++;
      const response = await anthropic.messages.create({
        model: MODEL(),
        max_tokens: 4096,
        system,
        tools: TOOLS,
        messages: claudeMessages,
      });

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
      if (assistantContent.length > 0) claudeMessages.push({ role: "assistant", content: assistantContent });
      if (toolUseBlocks.length === 0) break;

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: await executeTool(b.name, b.input as Record<string, unknown>),
        })),
      );
      claudeMessages.push({ role: "user", content: toolResults });
    }

    const finalText = assistantText.trim() || "(El asistente no devolvió texto)";

    // Persistir cambios al borrador (una sola escritura)
    let updatedPage: CmsPage | null = page;
    if (changed) {
      const [updated] = await db!.update(cmsPages).set({
        draftContent: dc,
        keyphrase: seo.keyphrase || null,
        metaTitle: seo.metaTitle || null,
        metaDescription: seo.metaDescription || null,
        ogImageUrl: seo.ogImageUrl || null,
        updatedAt: new Date(),
      }).where(eq(cmsPages.id, params.pageId)).returning();
      updatedPage = updated ?? page;
    }

    await db!.insert(cmsChatMessages).values({
      pageId: params.pageId,
      role: "assistant",
      content: finalText,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
    });

    return { assistantMessage: finalText, toolCalls, page: updatedPage };
  });
}

export async function getCmsChatHistory(pageId: string): Promise<Array<{ id: string; role: string; content: string; toolCalls: ToolCallSummary[] | null; createdAt: Date }>> {
  if (!db) return [];
  const rows = await db.select().from(cmsChatMessages)
    .where(eq(cmsChatMessages.pageId, pageId))
    .orderBy(asc(cmsChatMessages.createdAt));
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, toolCalls: (r.toolCalls as ToolCallSummary[] | null), createdAt: r.createdAt }));
}

export async function clearCmsChatHistory(pageId: string): Promise<void> {
  if (!db) return;
  await db.delete(cmsChatMessages).where(eq(cmsChatMessages.pageId, pageId)).catch((e) => log(`[cms-chat] clear failed: ${e}`));
}
