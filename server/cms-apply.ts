// Helper compartido por el PATCH de admin y el de cliente: valida los edits de
// contenido + SEO (mismos guards) y construye el objeto de updates para cms_pages.
// Mantener una sola ruta de validación evita divergencias entre superficies.

import { isEditableKey, sanitizeContentValue, validateSeoField } from "./cms-editor-guards";
import { setAtPath, cloneJson } from "@shared/cms-path";

type PageLike = { draftContent: Record<string, unknown> | null };

export function buildCmsDraftUpdate(
  page: PageLike,
  body: any,
): { ok: true; updates: Record<string, unknown> } | { ok: false; error: string } {
  const rawEdits = Array.isArray(body?.contentEdits) ? body.contentEdits : [];
  const seoEdits = body?.seo && typeof body.seo === "object" ? body.seo : null;

  const valid: Array<{ lang: "es" | "en"; path: string; value: string }> = [];
  for (const e of rawEdits) {
    if (!e || (e.lang !== "es" && e.lang !== "en") || typeof e.path !== "string") {
      return { ok: false, error: "Edit inválido (lang/path)" };
    }
    if (!isEditableKey(e.path)) return { ok: false, error: `Campo no editable: ${e.path}` };
    const v = sanitizeContentValue(e.path, e.value);
    if (!v.ok) return { ok: false, error: v.reason };
    valid.push({ lang: e.lang, path: e.path, value: v.value });
  }

  const seoUpdate: Record<string, string> = {};
  if (seoEdits) {
    for (const key of Object.keys(seoEdits)) {
      const v = validateSeoField(key, seoEdits[key]);
      if (!v.ok) return { ok: false, error: v.reason };
      seoUpdate[key] = v.value;
    }
  }

  const draft = (cloneJson(page.draftContent as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  for (const e of valid) {
    if (!draft[e.lang] || typeof draft[e.lang] !== "object") draft[e.lang] = {};
    setAtPath(draft[e.lang] as Record<string, unknown>, e.path, e.value);
  }

  const updates: Record<string, unknown> = { draftContent: draft, updatedAt: new Date() };
  if ("keyphrase" in seoUpdate) updates.keyphrase = seoUpdate.keyphrase;
  if ("metaTitle" in seoUpdate) updates.metaTitle = seoUpdate.metaTitle;
  if ("metaDescription" in seoUpdate) updates.metaDescription = seoUpdate.metaDescription;
  if ("ogImageUrl" in seoUpdate) updates.ogImageUrl = seoUpdate.ogImageUrl;
  return { ok: true, updates };
}
