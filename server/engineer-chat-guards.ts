import path from "path";

// ───────────────────────────────────────────────────────────────
// Guards de seguridad del agente "Ingeniero IM3" (Fase A, read-only).
// Aislados en su propio módulo (sin dependencias de runtime) para poder
// testearlos de forma determinista sin bootear el servidor.
// ───────────────────────────────────────────────────────────────

// Raíz del repo en runtime. En dev (tsx) y en el contenedor (WORKDIR + COPY . .)
// el proceso arranca desde la raíz del proyecto.
export const REPO_ROOT = process.cwd();

// Límites para no devolver payloads gigantes a Claude
export const MAX_FILE_CHARS = 60_000;
export const MAX_GREP_LINES = 200;
export const MAX_DB_ROWS = 100;

// Directorios y archivos prohibidos para las tools de filesystem
export const DENY_DIR = ["node_modules", ".git", "dist", "build", ".next"];
export const DENY_FILE_RE = /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$|(secret|credential|private[-_]?key)/i;

export type SafePath = { ok: true; abs: string; rel: string } | { ok: false; reason: string };

// Resuelve una ruta del usuario contra REPO_ROOT y la valida:
// bloquea path traversal, directorios protegidos y archivos sensibles.
export function resolveSafe(userPath: string): SafePath {
  // Vacío = raíz del repo (lo usa list_dir para listar la raíz)
  const raw = (userPath || "").trim() || ".";
  // Rechazar rutas absolutas (ej. /etc/passwd) — el agente usa rutas relativas al repo
  if (path.isAbsolute(raw)) {
    return { ok: false, reason: `Usa una ruta relativa al repo, no absoluta: ${userPath}` };
  }
  const abs = path.resolve(REPO_ROOT, raw);
  const rel = path.relative(REPO_ROOT, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, reason: `Ruta fuera del repositorio: ${userPath}` };
  }
  const segments = rel.split(path.sep);
  if (segments.some((s) => DENY_DIR.includes(s))) {
    return { ok: false, reason: `Acceso denegado a directorio protegido en: ${userPath}` };
  }
  if (DENY_FILE_RE.test(rel)) {
    return { ok: false, reason: `Acceso denegado a archivo sensible (secretos/credenciales): ${userPath}` };
  }
  return { ok: true, abs, rel: rel || "." };
}

// Valida que un SQL sea de SOLO LECTURA (defensa adicional a la transacción READ ONLY).
export function checkReadOnlySql(raw: string): { ok: boolean; reason?: string } {
  const trimmed = (raw || "").trim().replace(/;+\s*$/, "");
  if (!trimmed) return { ok: false, reason: "SQL vacío" };
  if (trimmed.includes(";")) return { ok: false, reason: "Solo se permite UNA sentencia (sin ';')" };
  if (!/^(select|with)\b/i.test(trimmed)) return { ok: false, reason: "Solo se permiten SELECT / WITH" };
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i.test(trimmed)) {
    return { ok: false, reason: "La sentencia contiene una palabra de escritura/DDL prohibida" };
  }
  return { ok: true };
}

// Valida un SQL de ESCRITURA controlado (Fase B, db_write): una sola sentencia
// INSERT/UPDATE/DELETE, NUNCA DDL, y WHERE obligatorio en UPDATE/DELETE para no
// tocar toda la tabla por accidente.
export function checkDbWriteSql(raw: string): { ok: boolean; reason?: string } {
  const trimmed = (raw || "").trim().replace(/;+\s*$/, "");
  if (!trimmed) return { ok: false, reason: "SQL vacío" };
  if (trimmed.includes(";")) return { ok: false, reason: "Solo se permite UNA sentencia (sin ';')" };
  if (!/^(insert|update|delete)\b/i.test(trimmed)) {
    return { ok: false, reason: "Solo INSERT / UPDATE / DELETE (para lecturas usa query_db_readonly)" };
  }
  if (/\b(drop|alter|truncate|grant|revoke|create)\b/i.test(trimmed)) {
    return { ok: false, reason: "DDL prohibido (drop/alter/truncate/create/grant/revoke)" };
  }
  if (/^(update|delete)\b/i.test(trimmed) && !/\bwhere\b/i.test(trimmed)) {
    return { ok: false, reason: "UPDATE/DELETE requieren WHERE (no se permite afectar toda la tabla)" };
  }
  // Rechazar WHERE trivial que afecta toda la tabla (1=1 / true)
  if (/\bwhere\s+(1\s*=\s*1|'?true'?|0\s*=\s*0)\b/i.test(trimmed)) {
    return { ok: false, reason: "WHERE trivial (1=1 / true) no permitido: acota la condición a filas concretas" };
  }
  return { ok: true };
}
