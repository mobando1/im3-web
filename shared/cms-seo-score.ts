// Scorer SEO heurístico — puro, determinista, sin IA ni llamadas externas.
// Estilo Yoast: una lista de chequeos con semáforo (good/warn/bad) y un score 0-100.
// Usado en el editor (feedback en vivo, client-side) y al publicar (registro server-side).

export type CheckStatus = "good" | "warn" | "bad";

export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Puntos obtenidos / posibles, para transparencia. */
  points: number;
  max: number;
}

export interface SeoScoreInput {
  keyphrase?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** H1 de la página (normalmente hero.headline del contenido mergeado). */
  h1?: string | null;
  /** Texto del cuerpo (leafs concatenados) para densidad y posición temprana. */
  bodyText?: string | null;
}

export interface SeoScoreResult {
  score: number; // 0-100
  checks: SeoCheck[];
}

/**
 * Minúsculas + sin diacríticos. Clave en español ("automatización" ≈ "automatizacion").
 * Filtra marcas diacríticas combinantes (U+0300–U+036F) por charCode para no
 * incrustar bytes/regex frágiles en la fuente.
 */
export function normalize(s: string): string {
  const lowered = (s || "").toLowerCase().normalize("NFD");
  let out = "";
  for (let i = 0; i < lowered.length; i++) {
    const c = lowered.charCodeAt(i);
    if (c >= 0x300 && c <= 0x36f) continue;
    out += lowered[i];
  }
  return out.trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function scoreSeo(input: SeoScoreInput): SeoScoreResult {
  const keyphrase = (input.keyphrase || "").trim();
  const kp = normalize(keyphrase);
  const title = (input.metaTitle || "").trim();
  const desc = (input.metaDescription || "").trim();
  const h1 = (input.h1 || "").trim();
  const body = (input.bodyText || "").trim();

  const nTitle = normalize(title);
  const nDesc = normalize(desc);
  const nH1 = normalize(h1);
  const nBody = normalize(body);

  const checks: SeoCheck[] = [];
  const push = (id: string, label: string, status: CheckStatus, detail: string, points: number, max: number) =>
    checks.push({ id, label, status, detail, points, max });

  // 1) Keyphrase definida (10)
  if (kp) push("keyphrase", "Frase clave definida", "good", `Frase clave: "${keyphrase}".`, 10, 10);
  else push("keyphrase", "Frase clave definida", "bad", "Define una frase clave para evaluar el resto.", 0, 10);

  // 2) Keyphrase en el título (15)
  if (!kp) push("kp-title", "Frase clave en el título", "bad", "Falta la frase clave.", 0, 15);
  else if (nTitle.includes(kp)) push("kp-title", "Frase clave en el título", "good", "El título incluye la frase clave.", 15, 15);
  else push("kp-title", "Frase clave en el título", "bad", "Añade la frase clave al meta-título.", 0, 15);

  // 3) Keyphrase en la meta descripción (15)
  if (!kp) push("kp-desc", "Frase clave en la descripción", "bad", "Falta la frase clave.", 0, 15);
  else if (nDesc.includes(kp)) push("kp-desc", "Frase clave en la descripción", "good", "La descripción incluye la frase clave.", 15, 15);
  else push("kp-desc", "Frase clave en la descripción", "bad", "Añade la frase clave a la meta-descripción.", 0, 15);

  // 4) Keyphrase en el H1 (15)
  if (!kp) push("kp-h1", "Frase clave en el H1", "bad", "Falta la frase clave.", 0, 15);
  else if (nH1.includes(kp)) push("kp-h1", "Frase clave en el H1", "good", "El titular (H1) incluye la frase clave.", 15, 15);
  else push("kp-h1", "Frase clave en el H1", "warn", "Considera incluir la frase clave en el titular.", 0, 15);

  // 5) Largo del título 30-60 (warn 60-65) (12)
  const tl = title.length;
  if (tl === 0) push("title-len", "Largo del meta-título", "bad", "El meta-título está vacío.", 0, 12);
  else if (tl >= 30 && tl <= 60) push("title-len", "Largo del meta-título", "good", `${tl} caracteres (ideal 30-60).`, 12, 12);
  else if (tl > 60 && tl <= 65) push("title-len", "Largo del meta-título", "warn", `${tl} caracteres (algo largo; ideal 30-60).`, 6, 12);
  else push("title-len", "Largo del meta-título", "bad", `${tl} caracteres (ideal 30-60).`, 0, 12);

  // 6) Largo de la descripción 120-160 (warn 110-170) (12)
  const dl = desc.length;
  if (dl === 0) push("desc-len", "Largo de la meta-descripción", "bad", "La meta-descripción está vacía.", 0, 12);
  else if (dl >= 120 && dl <= 160) push("desc-len", "Largo de la meta-descripción", "good", `${dl} caracteres (ideal 120-160).`, 12, 12);
  else if (dl >= 110 && dl <= 170) push("desc-len", "Largo de la meta-descripción", "warn", `${dl} caracteres (cerca; ideal 120-160).`, 6, 12);
  else push("desc-len", "Largo de la meta-descripción", "bad", `${dl} caracteres (ideal 120-160).`, 0, 12);

  // 7) Densidad de keyphrase 0.5%-2.5% (11)
  const words = nBody ? nBody.split(/\s+/).filter(Boolean).length : 0;
  if (!kp || words === 0) {
    push("density", "Densidad de la frase clave", "bad", "Sin frase clave o sin texto de cuerpo.", 0, 11);
  } else {
    const occ = countOccurrences(nBody, kp);
    const density = (occ * kp.split(/\s+/).length) / words * 100;
    if (density >= 0.5 && density <= 2.5) push("density", "Densidad de la frase clave", "good", `${density.toFixed(1)}% (ideal 0.5-2.5%).`, 11, 11);
    else if (density > 0 && density < 0.5) push("density", "Densidad de la frase clave", "warn", `${density.toFixed(1)}% (baja; ideal 0.5-2.5%).`, 5, 11);
    else if (density > 2.5) push("density", "Densidad de la frase clave", "warn", `${density.toFixed(1)}% (alta; riesgo keyword stuffing).`, 5, 11);
    else push("density", "Densidad de la frase clave", "bad", "La frase clave no aparece en el cuerpo.", 0, 11);
  }

  // 8) Keyphrase en las primeras 100 palabras (5)
  if (!kp || words === 0) {
    push("kp-early", "Frase clave temprana", "bad", "Sin frase clave o sin cuerpo.", 0, 5);
  } else {
    const first100 = nBody.split(/\s+/).slice(0, 100).join(" ");
    if (first100.includes(kp)) push("kp-early", "Frase clave temprana", "good", "Aparece en las primeras 100 palabras.", 5, 5);
    else push("kp-early", "Frase clave temprana", "warn", "Intenta usar la frase clave al inicio del contenido.", 0, 5);
  }

  const score = Math.round(checks.reduce((acc, c) => acc + c.points, 0));
  // Los pesos aquí suman 95; el check de imagen OG (5) lo añade scoreSeoWithOg → 100.
  return { score, checks };
}

/** Variante que incluye el chequeo de imagen OG (5 pts) para llegar a 100. */
export function scoreSeoWithOg(input: SeoScoreInput & { ogImageUrl?: string | null }): SeoScoreResult {
  const base = scoreSeo(input);
  const og = (input.ogImageUrl || "").trim();
  const ogOk = !!og && (og.startsWith("/") || /^https?:\/\//i.test(og));
  const ogCheck: SeoCheck = ogOk
    ? { id: "og-image", label: "Imagen para redes (OG)", status: "good", detail: "Imagen OG configurada.", points: 5, max: 5 }
    : { id: "og-image", label: "Imagen para redes (OG)", status: "warn", detail: "Añade una imagen para previews en WhatsApp/LinkedIn.", points: 0, max: 5 };
  return { score: base.score + ogCheck.points, checks: [...base.checks, ogCheck] };
}
