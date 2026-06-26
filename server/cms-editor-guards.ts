// Guards del editor CMS — módulo PURO y testeable (sin imports de runtime/db).
// Espeja el patrón de server/engineer-chat-guards.ts.
//
// Es la ÚNICA ruta de escritura validada: la corren tanto el PATCH del formulario
// como (más adelante) la tool de IA. Garantiza que toda edición:
//   - apunte a una key whitelisted (manifiesto) — nada de estructura/layout,
//   - no inyecte HTML/scripts (anti-XSS almacenado),
//   - respete el largo máximo (rechaza, no recorta),
//   - use URLs de imagen seguras (mismo origen o https; no Drive viewer, no data:).

import {
  kindForPath,
  maxLenForPath,
  type FieldKind,
} from "@shared/cms-field-manifest";

export type GuardOk = { ok: true };
export type GuardFail = { ok: false; reason: string };
export type GuardResult = GuardOk | GuardFail;
export type SanitizeResult = { ok: true; value: string } | GuardFail;

const SCRIPTY_RE = /<\s*\/?\s*(script|iframe|style|object|embed|link|meta)\b/i;
const EVENT_HANDLER_RE = /\bon[a-z]+\s*=/i;
const JS_PROTO_RE = /javascript\s*:/i;

// Rechaza caracteres de control (0-31 y DEL 127), permitiendo solo tab (9) y
// salto de linea (10). Sin regex literal para evitar bytes de control en fuente.
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 32 && c !== 9 && c !== 10) || c === 127) return true;
  }
  return false;
}

/** ¿La path es editable según el manifiesto? (campo simple o "<lista>.<i>.<campo>"). */
export function isEditableKey(path: string): boolean {
  return kindForPath(path) !== undefined;
}

/**
 * Valida + sanea un valor de contenido contra la path de destino.
 * No muta el valor (no recorta): si excede el máximo, rechaza.
 */
export function sanitizeContentValue(path: string, raw: unknown): SanitizeResult {
  const kind = kindForPath(path);
  if (!kind) return { ok: false, reason: `Campo no editable: ${path}` };

  if (typeof raw !== "string") {
    return { ok: false, reason: `El valor de ${path} debe ser texto` };
  }

  if (kind === "image") {
    const img = validateImageUrl(raw);
    if (!img.ok) return img;
    return { ok: true, value: raw.trim() };
  }

  // Texto / textarea
  if (hasControlChars(raw)) {
    return { ok: false, reason: `El valor de ${path} contiene caracteres de control no permitidos` };
  }
  if (SCRIPTY_RE.test(raw) || EVENT_HANDLER_RE.test(raw) || JS_PROTO_RE.test(raw)) {
    return { ok: false, reason: `El valor de ${path} contiene HTML/JS no permitido` };
  }
  if (raw.includes("<") || raw.includes(">")) {
    return { ok: false, reason: `El valor de ${path} no puede contener '<' ni '>'` };
  }
  if (kind === "text" && raw.includes("\n")) {
    return { ok: false, reason: `El campo ${path} es de una sola línea` };
  }

  const max = maxLenForPath(path);
  if (max !== undefined && raw.length > max) {
    return { ok: false, reason: `El valor de ${path} excede el máximo de ${max} caracteres (tiene ${raw.length})` };
  }

  return { ok: true, value: raw };
}

/**
 * URL de imagen segura: solo mismo origen (path que empieza con "/") o https://.
 * Rechaza data:, http:, javascript: y los enlaces "viewer" de Google Drive
 * (no embebibles como <img src>).
 */
export function validateImageUrl(url: unknown): GuardResult {
  if (typeof url !== "string") return { ok: false, reason: "La URL de imagen debe ser texto" };
  const u = url.trim();
  if (!u) return { ok: true }; // vacío = usar default (la invariante del merge lo maneja)

  if (JS_PROTO_RE.test(u) || /^data:/i.test(u)) {
    return { ok: false, reason: "Esquema de URL no permitido (javascript:/data:)" };
  }
  if (u.startsWith("/")) {
    if (u.startsWith("//")) return { ok: false, reason: "URL protocolo-relativa no permitida" };
    return { ok: true }; // mismo origen (ej. /assets/... o /api/cms/media/:id)
  }
  if (/^https:\/\//i.test(u)) {
    if (/^https:\/\/drive\.google\.com\/file\//i.test(u)) {
      return { ok: false, reason: "El enlace de Drive (viewer) no es embebible como imagen; usa una URL directa o sube el archivo" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "La URL debe empezar con '/' (mismo origen) o 'https://'" };
}

const SEO_LIMITS: Record<string, { max: number; kind: FieldKind }> = {
  keyphrase: { max: 80, kind: "text" },
  metaTitle: { max: 70, kind: "text" },
  metaDescription: { max: 200, kind: "textarea" },
  ogImageUrl: { max: 300, kind: "image" },
};

/** Valida un campo SEO a nivel página (keyphrase / metaTitle / metaDescription / ogImageUrl). */
export function validateSeoField(key: string, value: unknown): SanitizeResult {
  const def = SEO_LIMITS[key];
  if (!def) return { ok: false, reason: `Campo SEO no editable: ${key}` };
  if (typeof value !== "string") return { ok: false, reason: `El valor de ${key} debe ser texto` };

  if (def.kind === "image") {
    const img = validateImageUrl(value);
    if (!img.ok) return img;
    return { ok: true, value: value.trim() };
  }

  if (hasControlChars(value) || value.includes("<") || value.includes(">")) {
    return { ok: false, reason: `El valor de ${key} contiene caracteres no permitidos` };
  }
  if (value.length > def.max) {
    return { ok: false, reason: `El valor de ${key} excede el máximo de ${def.max} caracteres` };
  }
  return { ok: true, value };
}
