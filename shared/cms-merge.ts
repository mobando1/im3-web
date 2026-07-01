// Deep-merge del contenido del CMS sobre los defaults del landing.
//
// INVARIANTE CENTRAL: un campo ausente o null en `overrides` SIEMPRE cae al
// default. Es lo que garantiza que nada se rompa aunque el contenido publicado
// esté incompleto o vacío. Con publishedContent = {} la salida es idéntica a
// los defaults (cero cambio de comportamiento).
//
// Puro, sin imports de runtime → usable en cliente (I18nProvider) y servidor
// (bot-prerender de static.ts), y testeable sin bootear nada.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Superpone `overrides` sobre `defaults`, recursivamente.
 * - Primitivo en override → gana.
 * - `undefined` / `null` en override → se conserva el default (la invariante).
 * - Objetos planos → merge llave por llave.
 * - Arrays → merge por índice (override[i] sobre default[i]); ítems extra del
 *   override (más allá del largo del default) se agregan. En V1 las filas
 *   (testimonials, FAQ, etc.) no se agregan/eliminan desde el editor, así que el
 *   merge por índice equivale a edición en sitio. La semántica de borrado de
 *   filas es un tema del manifiesto en una fase posterior.
 * - Mismatch de tipo (override no coincide con la forma del default) → se
 *   conserva el default (defensivo contra contenido corrupto).
 */
export function deepMerge<T>(defaults: T, overrides: unknown): T {
  if (overrides === undefined || overrides === null) return defaults;

  if (Array.isArray(defaults)) {
    if (!Array.isArray(overrides)) return defaults;
    const out = defaults.map((d, i) =>
      i < overrides.length ? deepMerge(d, overrides[i]) : d,
    );
    for (let i = defaults.length; i < overrides.length; i++) {
      const extra = overrides[i];
      if (extra !== undefined && extra !== null) out.push(extra);
    }
    return out as unknown as T;
  }

  if (isPlainObject(defaults)) {
    if (!isPlainObject(overrides)) return defaults;
    const out: Record<string, unknown> = { ...defaults };
    for (const key of Object.keys(overrides)) {
      if (key in (defaults as Record<string, unknown>)) {
        out[key] = deepMerge((defaults as Record<string, unknown>)[key], overrides[key]);
      } else {
        const extra = overrides[key];
        if (extra !== undefined && extra !== null) out[key] = extra;
      }
    }
    return out as T;
  }

  // Default primitivo: el override gana (null/undefined ya retornaron arriba).
  return overrides as T;
}
