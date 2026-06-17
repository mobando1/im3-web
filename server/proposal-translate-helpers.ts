// Helpers PUROS de la traducción de propuestas (sin imports con efectos secundarios) →
// testeables sin levantar el server. Usados por server/proposal-ai.ts y por los tests.

// Claves cuyo valor NUNCA se traduce: SOLO las que romperían la UI o son códigos/
// nombres propios. Deliberadamente acotado: muchos campos "de monto" (painAmount,
// value, amount, paybackMonths, cost, *USD, rangos…) en la práctica llevan PROSA o
// UNIDADES ("4 semanas", "$50/mes", "y cada semana sin un sistema…") que SÍ deben
// traducirse. Los dígitos y el formato numérico se preservan vía instrucción al
// modelo, no reimponiéndolos. Los valores numéricos/booleanos JS se preservan
// automáticamente (ver reimposeImmutable).
export const IMMUTABLE_TRANSLATION_KEYS = new Set<string>([
  "paidBy", "billingModel", // enums que controlan lógica/renderizado de la UI — deben quedar exactos
  "icon",                   // identificadores/emoji de íconos
  "currency",               // código de moneda (COP/USD)
  "clientName", "contactName", // nombres propios
]);

/**
 * Reconstruye `translated` sobre la forma de `original`, reimponiendo los
 * campos no traducibles. Para cada clave del original:
 *  - números/booleanos/null → se conservan tal cual
 *  - claves en IMMUTABLE_TRANSLATION_KEYS → se conservan del original
 *  - claves ausentes en la traducción → se conservan del original (no se pierde nada)
 *  - el resto (texto legible) → se toma de la traducción
 * Arrays se recorren por índice; objetos recursivamente.
 */
export function reimposeImmutable(original: unknown, translated: unknown): unknown {
  if (Array.isArray(original)) {
    if (!Array.isArray(translated)) return original;
    return original.map((item, i) =>
      reimposeImmutable(item, i < translated.length ? translated[i] : item)
    );
  }
  if (original !== null && typeof original === "object") {
    if (translated === null || typeof translated !== "object" || Array.isArray(translated)) {
      return original;
    }
    const o = original as Record<string, unknown>;
    const t = translated as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      const ov = o[key];
      if (typeof ov === "number" || typeof ov === "boolean" || ov === null) {
        out[key] = ov;
      } else if (IMMUTABLE_TRANSLATION_KEYS.has(key)) {
        out[key] = ov;
      } else if (!(key in t)) {
        out[key] = ov;
      } else {
        out[key] = reimposeImmutable(ov, t[key]);
      }
    }
    return out;
  }
  // Primitivo traducible (string): usar la traducción si vino.
  return translated !== undefined ? translated : original;
}

// Caché de traducciones: por idioma, las sections traducidas + el fingerprint del contenido-fuente
// del que se derivaron. Si el contenido activo cambia, el fingerprint deja de coincidir → se rehace.
export type TranslationCache = Record<string, { sections: Record<string, unknown>; srcFingerprint: string }>;

// Serialización canónica (claves ordenadas) → mismo contenido produce el mismo string sin importar
// el orden de las claves. Base para el fingerprint.
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// Versión de la lógica/prompt de traducción. Va dentro del fingerprint para que, al cambiar el
// prompt o el set de campos traducibles, TODAS las cachés viejas dejen de coincidir y se re-traduzcan
// solas (en vez de servir una traducción obsoleta). Subir este número al cambiar calidad/forma.
export const TRANSLATION_LOGIC_VERSION = "2"; // v2: traduce prosa/unidades en painAmount/value/etc.

// Fingerprint determinista (djb2) del contenido de una propuesta. Identifica de forma estable
// el contenido activo para saber si una traducción cacheada sigue vigente.
export function fingerprintSections(obj: unknown): string {
  const s = stableStringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `v${TRANSLATION_LOGIC_VERSION}:${s.length}:${(h >>> 0).toString(36)}`;
}
