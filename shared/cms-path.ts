// Lectura/escritura de valores en el árbol de contenido por dot-path.
// Soporta segmentos numéricos para arrays: "testimonials.reviews.0.quote".
// Puro y testeable; usado por el servidor (aplicar edits al draft) y el cliente
// (leer el valor actual mergeado para poblar el formulario).

function isIndex(s: string): boolean {
  return /^\d+$/.test(s);
}

/** Lee el valor en `path`, o undefined si algún tramo no existe. */
export function getAtPath(root: unknown, path: string): unknown {
  if (root == null) return undefined;
  const parts = path.split(".");
  let cur: any = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Escribe `value` en `path`, creando objetos/arrays intermedios según el tipo
 * del siguiente segmento (numérico → array, si no → objeto). Muta `root`.
 * Pensado para correr sobre un CLON del draft (no sobre el objeto de la DB).
 */
export function setAtPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: any = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextIsIndex = isIndex(parts[i + 1]);
    const existing = cur[part];
    if (existing == null || typeof existing !== "object") {
      cur[part] = nextIsIndex ? [] : {};
    }
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Clon profundo simple vía JSON (el contenido siempre es JSON-serializable). */
export function cloneJson<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T);
}
