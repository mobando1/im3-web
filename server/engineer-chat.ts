import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, pool } from "./db";
import { getModelGeneration, getConfig, setConfig } from "./config";
import { engineerChatSessions, engineerChatMessages, agentRuns, pendingAdminActions, adminActionAudit } from "@shared/schema";
import { and, asc, desc, eq, gte, gt, isNull, or } from "drizzle-orm";
import { findAgent } from "./agents/registry";
import { runAgent } from "./agents/runner";
import { openPullRequest, isGithubWriteConfigured, type CodeChangeFile } from "./github-write";
import {
  resolveSafe,
  checkReadOnlySql,
  checkDbWriteSql,
  isVaultTable,
  REPO_ROOT,
  MAX_FILE_CHARS,
  MAX_GREP_LINES,
  MAX_DB_ROWS,
  DENY_DIR,
} from "./engineer-chat-guards";

const execFileAsync = promisify(execFile);

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = () => getModelGeneration();
const MAX_ITERATIONS = 10;
const MAX_HISTORY = 30;
const RETRY_TIMEOUT_MS = 30_000;
const ACTION_TTL_MS = 24 * 60 * 60 * 1000; // las propuestas expiran a las 24h
// Flags conocidos (whitelist) — el agente solo puede proponer toggles de estos.
// Mantener en sync con los flags cableados en server/email-scheduler.ts.
const KNOWN_FLAGS = ["gmail-sync", "whatsapp-send", "newsletter"];

type ToolCallSummary = { tool: string; summary: string };

// ───────────────────────────────────────────────────────────────
// Tools (TODAS de solo lectura)
// ───────────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_agent_runs",
    description:
      "Lista ejecuciones recientes de agentes (tabla agent_runs) para diagnosticar fallas. Filtra por agentName, status (running|success|error) y ventana de tiempo. Úsalo primero cuando algo 'falla' o 'dejó de funcionar'.",
    input_schema: {
      type: "object",
      properties: {
        agentName: { type: "string", description: "Nombre del agente (ej. 'proposal-ai', 'gmail-sync'). Omitir para todos." },
        status: { type: "string", description: "Filtro: running | success | error" },
        sinceHours: { type: "number", description: "Solo runs de las últimas N horas (default 24)" },
        limit: { type: "number", description: "Máximo de filas (default 20, máx 50)" },
      },
    },
  },
  {
    name: "view_agent_run",
    description:
      "Devuelve el detalle COMPLETO de una ejecución de agente por id: errorMessage, errorStack, metadata (incluye supervisorAnalysis del error-supervisor si ya lo analizó). Úsalo tras read_agent_runs para ver el stack trace real.",
    input_schema: {
      type: "object",
      properties: { runId: { type: "string", description: "id del agent_run" } },
      required: ["runId"],
    },
  },
  {
    name: "read_source_file",
    description:
      "Lee un archivo del código fuente del proyecto (ruta relativa a la raíz del repo, ej. 'server/proposal-ai.ts'). Solo lectura. Bloqueado para .env, secretos, node_modules, .git, dist.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Ruta relativa al repo, ej. 'server/routes.ts' o 'shared/schema.ts'" } },
      required: ["path"],
    },
  },
  {
    name: "search_code",
    description:
      "Busca un patrón (regex) en el código del repo (grep recursivo, excluye node_modules/.git/dist). Devuelve archivo:línea: contenido. Úsalo para localizar dónde está definido algo (ej. un model ID, una función, un string de error).",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Patrón regex a buscar, ej. 'claude-sonnet' o 'createCalendarEvent'" },
        pathGlob: { type: "string", description: "Filtro opcional de archivos, ej. '*.ts' o '*.tsx'" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "list_dir",
    description: "Lista archivos y subdirectorios de una carpeta del repo (ruta relativa). Solo lectura.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Ruta relativa, ej. 'server' o 'server/agents'. Vacío = raíz." } },
    },
  },
  {
    name: "get_db_schema",
    description:
      "Devuelve el esquema de la base de datos (tablas y columnas) desde information_schema. Pasa 'table' para una sola tabla, u omítelo para listar todas las tablas. Úsalo antes de query_db_readonly para saber qué consultar.",
    input_schema: {
      type: "object",
      properties: { table: { type: "string", description: "Nombre de tabla opcional para ver sus columnas" } },
    },
  },
  {
    name: "query_db_readonly",
    description:
      "Ejecuta una consulta SQL de SOLO LECTURA (una sola sentencia SELECT/WITH) contra la base de datos de producción. Corre dentro de una transacción READ ONLY con timeout. Úsalo para diagnosticar datos inconsistentes. Devuelve hasta 100 filas.",
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "Una sentencia SELECT/WITH. Sin ';' ni múltiples statements." } },
      required: ["sql"],
    },
  },
  {
    name: "check_env",
    description:
      "Verifica si ciertas variables de entorno están definidas (presente/ausente). NUNCA devuelve el valor, solo booleano. Úsalo para diagnosticar 'falta API key' o 'credencial rotada'.",
    input_schema: {
      type: "object",
      properties: { keys: { type: "array", items: { type: "string" }, description: "Nombres de env vars a verificar, ej. ['ANTHROPIC_API_KEY','GOOGLE_PRIVATE_KEY']" } },
      required: ["keys"],
    },
  },
  // ── Tools de ACCIÓN (Fase B): NO ejecutan; PROPONEN una acción que el admin
  //    confirma firmando responsabilidad. Cada una registra una acción pendiente.
  {
    name: "propose_set_config",
    description:
      "PROPONE cambiar un valor de configuración editable en runtime (sin redeploy). Para 'model.generation'/'model.classification' valida el model ID contra Anthropic ANTES de proponer. NO aplica el cambio: queda pendiente de que el admin lo confirme.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Clave de config, ej. 'model.generation' o 'model.classification'" },
        value: { type: "string", description: "Nuevo valor, ej. 'claude-opus-4-8'" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "propose_toggle_flag",
    description:
      "PROPONE encender/apagar un feature flag (ej. 'gmail-sync', 'whatsapp-send', 'newsletter') sin redeploy. NO aplica: queda pendiente de confirmación del admin.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Nombre del flag (con o sin prefijo 'flag.'), ej. 'gmail-sync'" },
        value: { type: "boolean", description: "true = encender, false = apagar" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "propose_retry_agent",
    description:
      "PROPONE reintentar la ejecución de un agente del sistema que está fallando (debe tener runnable, ej. 'gmail-sync', 'email-queue', 'error-supervisor'). NO lo ejecuta: queda pendiente de confirmación.",
    input_schema: {
      type: "object",
      properties: { agentName: { type: "string", description: "Nombre del agente del registry, ej. 'gmail-sync'" } },
      required: ["agentName"],
    },
  },
  {
    name: "propose_db_write",
    description:
      "PROPONE un arreglo de datos (INSERT/UPDATE/DELETE; UPDATE/DELETE requieren WHERE). Hace un dry-run en transacción que se revierte para mostrar cuántas filas afectaría. NO commitea: queda pendiente de confirmación del admin.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Una sentencia INSERT/UPDATE/DELETE con WHERE. Sin ';'." },
        rationale: { type: "string", description: "Por qué es necesario este arreglo (para el registro de auditoría)" },
      },
      required: ["sql", "rationale"],
    },
  },
  {
    name: "propose_code_change",
    description:
      "PROPONE un cambio de código fuente que se abrirá como Pull Request (NO se mergea solo: el admin revisa el diff en GitHub y mergea, lo que dispara el redeploy). Para cada archivo entrega su CONTENIDO COMPLETO nuevo (no un diff). Primero lee el archivo actual con read_source_file. Úsalo solo para bugs reales que requieren tocar el código.",
    input_schema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          description: "Archivos a cambiar, cada uno con su contenido completo nuevo",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Ruta relativa al repo, ej. 'server/config.ts'" },
              newContent: { type: "string", description: "Contenido COMPLETO del archivo tras el cambio" },
            },
            required: ["path", "newContent"],
          },
        },
        title: { type: "string", description: "Título del PR (corto, imperativo)" },
        body: { type: "string", description: "Descripción del PR: qué arregla y por qué" },
      },
      required: ["files", "title", "body"],
    },
  },
];

const SYSTEM_PROMPT = `Eres "Ingeniero IM3", un ingeniero de software senior embebido en el panel admin del CRM de IM3 Systems. Tu trabajo es DIAGNOSTICAR problemas técnicos del sistema (fallas de agentes, errores de IA, datos inconsistentes, configs, bugs de código) y explicarle al admin la causa raíz y cómo arreglarlo.

═══════════════════════════════════════════════════════
DIAGNOSTICAR vs PROPONER — REGLA ABSOLUTA
═══════════════════════════════════════════════════════
- Tus tools de diagnóstico (read_*, search_code, query_db_readonly, check_env, etc.) son de SOLO LECTURA.
- Tus tools de acción (propose_set_config, propose_toggle_flag, propose_retry_agent, propose_db_write, propose_code_change) NO ejecutan nada: solo REGISTRAN una propuesta que el admin debe confirmar firmando responsabilidad. TÚ NUNCA aplicas un cambio.
- Antes de proponer cualquier acción, DIAGNOSTICA primero (lee la evidencia). Solo propón cuando estés seguro de la causa raíz.
- Tras proponer, dile al admin en una frase qué propusiste y que lo confirme en la tarjeta de abajo. NO afirmes que ya quedó aplicado.
- Para arreglos de datos (propose_db_write): SIEMPRE UPDATE/DELETE con WHERE acotado; primero verifica con query_db_readonly cuántas/ cuáles filas tocarías.
- Para bugs de CÓDIGO (propose_code_change): primero lee el archivo actual completo con read_source_file, luego entrega su CONTENIDO COMPLETO nuevo (no un diff). Se abrirá un Pull Request que el admin revisa y mergea (eso dispara el redeploy). Úsalo solo cuando el fix requiere tocar el código, no para config/datos.

═══════════════════════════════════════════════════════
CÓMO TRABAJAS
═══════════════════════════════════════════════════════
1. VERIFICA ANTES DE AFIRMAR. Nunca adivines. Usa tus tools para confirmar cada afirmación: lee los errores reales (read_agent_runs / view_agent_run), localiza el código (search_code), léelo (read_source_file), revisa datos (query_db_readonly), comprueba configs (check_env).
2. CITA SIEMPRE la evidencia con \`archivo:línea\` o el id del agent_run / la fila de DB. Si no lo verificaste, dilo explícitamente como hipótesis.
3. Cuando algo "falla" o "dejó de funcionar", empieza por read_agent_runs (status='error') para ver el error real antes de teorizar.
4. Sé conciso y directo. Español latinoamericano.

═══════════════════════════════════════════════════════
FORMATO OBLIGATORIO DE TODO DIAGNÓSTICO
═══════════════════════════════════════════════════════
Termina cada diagnóstico con estas tres secciones:
**Causa raíz:** (qué está pasando exactamente, con evidencia citada)
**Cómo arreglarlo:** (pasos concretos y accionables para que el admin lo aplique; incluye archivo:línea, comandos, o el valor a cambiar)
**Confianza:** (un número 1-10 + qué podría fallar o qué no pudiste verificar)

═══════════════════════════════════════════════════════
ORIENTACIÓN DEL CÓDIGO (lee CLAUDE.md con read_source_file para el detalle completo)
═══════════════════════════════════════════════════════
- server/routes.ts — todos los endpoints (>7000 líneas)
- server/db.ts — setup de DB + runMigrations() con SQL crudo
- shared/schema.ts — esquema Drizzle de todas las tablas
- server/agents/ — registry.ts (catálogo), runner.ts (runAgent), error-supervisor.ts
- server/email-scheduler.ts — cron jobs
- server/*-ai.ts — funciones de IA con Claude (proposal-ai, email-ai, project-ai, blog-ai)
- Los model IDs de Anthropic viven en la tabla system_config (claves 'model.generation' y 'model.classification'), editables en runtime vía server/config.ts. Si un modelo fue retirado (404), propón el nuevo con propose_set_config (valida contra Anthropic antes).
- Los feature flags (gmail-sync, whatsapp-send, newsletter) también están en system_config; puedes apagar un agente que falla con propose_toggle_flag.
- La observabilidad de fallas vive en la tabla agent_runs (errorMessage, errorStack, metadata.supervisorAnalysis).`;

// Defensa anti-symlink: confirma que el path real (resuelto) sigue dentro del repo.
async function realPathInsideRepo(abs: string): Promise<boolean> {
  try {
    const real = await fs.realpath(abs);
    const rel = path.relative(REPO_ROOT, real);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  } catch {
    return true; // no existe aún (archivo nuevo): resolveSafe ya validó la ruta lógica
  }
}

// ───────────────────────────────────────────────────────────────
// Ejecución de tools
// ───────────────────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  toolCalls: ToolCallSummary[],
  ctx: { sessionId: string; username: string | null; githubToken?: string | null },
): Promise<string> {
  try {
    if (toolName === "read_agent_runs") {
      if (!db) return "DB no disponible.";
      const agentName = typeof input.agentName === "string" ? input.agentName : undefined;
      const status = typeof input.status === "string" ? input.status : undefined;
      const sinceHours = typeof input.sinceHours === "number" ? input.sinceHours : 24;
      const limit = Math.min(typeof input.limit === "number" ? input.limit : 20, 50);
      const since = new Date(Date.now() - sinceHours * 3600_000);
      const conds = [gte(agentRuns.startedAt, since)];
      if (agentName) conds.push(eq(agentRuns.agentName, agentName));
      if (status) conds.push(eq(agentRuns.status, status));
      const rows = await db
        .select({
          id: agentRuns.id,
          agentName: agentRuns.agentName,
          status: agentRuns.status,
          startedAt: agentRuns.startedAt,
          durationMs: agentRuns.durationMs,
          errorMessage: agentRuns.errorMessage,
          triggeredBy: agentRuns.triggeredBy,
        })
        .from(agentRuns)
        .where(and(...conds))
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit);
      toolCalls.push({ tool: "read_agent_runs", summary: `${rows.length} run(s)${agentName ? ` de ${agentName}` : ""}${status ? ` [${status}]` : ""}` });
      if (rows.length === 0) return "(Sin ejecuciones que coincidan con el filtro.)";
      return rows
        .map((r) => `[${r.id}] ${r.agentName} · ${r.status} · ${r.startedAt?.toISOString?.() ?? r.startedAt} · ${r.durationMs ?? "?"}ms · trigger=${r.triggeredBy}${r.errorMessage ? `\n   error: ${r.errorMessage}` : ""}`)
        .join("\n");
    }

    if (toolName === "view_agent_run") {
      if (!db) return "DB no disponible.";
      const runId = String(input.runId);
      const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
      if (!row) return `No se encontró agent_run con id ${runId}.`;
      toolCalls.push({ tool: "view_agent_run", summary: `Detalle de ${row.agentName} (${row.status})` });
      return JSON.stringify(
        {
          id: row.id,
          agentName: row.agentName,
          status: row.status,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          durationMs: row.durationMs,
          recordsProcessed: row.recordsProcessed,
          triggeredBy: row.triggeredBy,
          errorMessage: row.errorMessage,
          errorStack: row.errorStack,
          metadata: row.metadata,
          supervisorAnalyzedAt: row.supervisorAnalyzedAt,
        },
        null,
        2,
      ).slice(0, MAX_FILE_CHARS);
    }

    if (toolName === "read_source_file") {
      const safe = resolveSafe(String(input.path));
      if (!safe.ok) return `BLOQUEADO: ${safe.reason}`;
      if (!(await realPathInsideRepo(safe.abs))) return "BLOQUEADO: la ruta resuelve (symlink) fuera del repositorio.";
      let content: string;
      try {
        content = await fs.readFile(safe.abs, "utf-8");
      } catch (err) {
        return `No se pudo leer "${safe.rel}": ${(err as Error).message}. (¿Existe el archivo en runtime? Verifica con list_dir.)`;
      }
      toolCalls.push({ tool: "read_source_file", summary: safe.rel });
      const lines = content.split("\n");
      const numbered = lines.map((l, i) => `${i + 1}\t${l}`).join("\n");
      if (numbered.length > MAX_FILE_CHARS) {
        return numbered.slice(0, MAX_FILE_CHARS) + `\n\n[... truncado: ${lines.length} líneas en total. Usa search_code para ir a una parte específica.]`;
      }
      return numbered;
    }

    if (toolName === "search_code") {
      const pattern = String(input.pattern);
      const pathGlob = typeof input.pathGlob === "string" && input.pathGlob ? input.pathGlob : undefined;
      const args = ["-rInE", "--exclude-dir=node_modules", "--exclude-dir=.git", "--exclude-dir=dist", "--exclude-dir=build"];
      if (pathGlob) args.push(`--include=${pathGlob}`);
      args.push(pattern, ".");
      try {
        const { stdout } = await execFileAsync("grep", args, { cwd: REPO_ROOT, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
        const allLines = stdout.split("\n").filter(Boolean);
        toolCalls.push({ tool: "search_code", summary: `"${pattern}" → ${allLines.length} match(es)` });
        if (allLines.length === 0) return "(Sin coincidencias.)";
        const shown = allLines.slice(0, MAX_GREP_LINES).join("\n");
        return allLines.length > MAX_GREP_LINES ? `${shown}\n\n[... ${allLines.length - MAX_GREP_LINES} coincidencias más; refina el patrón o usa pathGlob.]` : shown;
      } catch (err) {
        const e = err as { code?: number; message?: string };
        // grep devuelve exit code 1 cuando no hay coincidencias (no es un error real)
        if (e.code === 1) {
          toolCalls.push({ tool: "search_code", summary: `"${pattern}" → 0 matches` });
          return "(Sin coincidencias.)";
        }
        return `Error en search_code: ${e.message ?? String(err)}`;
      }
    }

    if (toolName === "list_dir") {
      const safe = resolveSafe(typeof input.path === "string" ? input.path : "");
      if (!safe.ok) return `BLOQUEADO: ${safe.reason}`;
      if (!(await realPathInsideRepo(safe.abs))) return "BLOQUEADO: la ruta resuelve (symlink) fuera del repositorio.";
      let entries: import("fs").Dirent[];
      try {
        entries = await fs.readdir(safe.abs, { withFileTypes: true });
      } catch (err) {
        return `No se pudo listar "${safe.rel}": ${(err as Error).message}`;
      }
      toolCalls.push({ tool: "list_dir", summary: safe.rel });
      const visible = entries
        .filter((e) => !DENY_DIR.includes(e.name) && !e.name.startsWith(".env"))
        .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return visible.join("\n") || "(Carpeta vacía.)";
    }

    if (toolName === "get_db_schema") {
      if (!pool) return "DB no disponible.";
      const table = typeof input.table === "string" ? input.table : undefined;
      if (table) {
        // Las tablas de la bóveda (credenciales) están ocultas al agente.
        if (isVaultTable(table)) {
          toolCalls.push({ tool: "get_db_schema", summary: `tabla protegida (${table})` });
          return `La tabla "${table}" pertenece a la bóveda de credenciales y no es accesible desde aquí.`;
        }
        const { rows } = await pool.query(
          `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
          [table],
        );
        toolCalls.push({ tool: "get_db_schema", summary: `columnas de ${table}` });
        if (rows.length === 0) return `No existe la tabla "${table}" (o no tiene columnas).`;
        return rows.map((r: { column_name: string; data_type: string; is_nullable: string }) => `${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}`).join("\n");
      }
      const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
      const visible = rows.filter((r: { table_name: string }) => !isVaultTable(r.table_name));
      toolCalls.push({ tool: "get_db_schema", summary: `${visible.length} tablas` });
      return visible.map((r: { table_name: string }) => r.table_name).join("\n");
    }

    if (toolName === "query_db_readonly") {
      if (!pool) return "DB no disponible.";
      const rawSql = String(input.sql);
      const guard = checkReadOnlySql(rawSql);
      if (!guard.ok) return `BLOQUEADO: ${guard.reason}`;
      const conn = await pool.connect();
      try {
        await conn.query("BEGIN TRANSACTION READ ONLY");
        await conn.query("SET LOCAL statement_timeout = '8s'");
        const result = await conn.query(rawSql);
        await conn.query("ROLLBACK");
        const rows = result.rows.slice(0, MAX_DB_ROWS);
        toolCalls.push({ tool: "query_db_readonly", summary: `${result.rowCount ?? rows.length} fila(s)` });
        const out = JSON.stringify(rows, null, 2);
        const note = (result.rowCount ?? 0) > MAX_DB_ROWS ? `\n\n[... ${result.rowCount} filas en total, mostrando ${MAX_DB_ROWS}.]` : "";
        return out.slice(0, MAX_FILE_CHARS) + note;
      } catch (err) {
        try { await conn.query("ROLLBACK"); } catch { /* noop */ }
        return `Error SQL (la transacción es READ ONLY): ${(err as Error).message}`;
      } finally {
        conn.release();
      }
    }

    if (toolName === "check_env") {
      const keys = Array.isArray(input.keys) ? (input.keys as unknown[]).map(String) : [];
      toolCalls.push({ tool: "check_env", summary: `${keys.length} var(s)` });
      const result: Record<string, boolean> = {};
      for (const k of keys) {
        const v = process.env[k];
        result[k] = typeof v === "string" && v.length > 0;
      }
      return JSON.stringify(result, null, 2);
    }

    // ── Tools de ACCIÓN: registran una propuesta pendiente (no ejecutan) ──
    if (toolName === "propose_set_config") {
      if (!db) return "DB no disponible.";
      const key = String(input.key);
      const value = String(input.value);
      const isFlag = key.startsWith("flag.");
      if (!["model.generation", "model.classification"].includes(key) && !isFlag) {
        return `Clave no permitida: "${key}". Usa 'model.generation', 'model.classification' o un flag conocido.`;
      }
      if (isFlag && !KNOWN_FLAGS.includes(key.slice(5))) {
        return `Flag desconocido: "${key}". Flags válidos: ${KNOWN_FLAGS.join(", ")}.`;
      }
      let preview = `${key}: "${getConfig(key)}" → "${value}"`;
      if (key.startsWith("model.")) {
        // Validación ligera (formato) al proponer; la validación real contra Anthropic
        // ocurre en apply (tras confirmación), para no gastar tokens en propuestas descartadas.
        if (!/^claude-[a-z0-9][a-z0-9.\-]*$/i.test(value)) {
          return `"${value}" no parece un model ID de Claude válido (formato esperado: claude-...). No registro la propuesta.`;
        }
        preview += " · formato ok (se valida contra Anthropic al aplicar)";
      }
      const id = await registerPendingAction(ctx, "set_config", `Cambiar config ${key} → ${value}`, { key, value }, preview);
      toolCalls.push({ tool: "propose_set_config", summary: `Propuesta ${key} → ${value}` });
      return `Propuesta registrada (id ${id}). ${preview}. El admin debe confirmarla en la tarjeta de acción (firmando responsabilidad).`;
    }

    if (toolName === "propose_toggle_flag") {
      if (!db) return "DB no disponible.";
      const bare = String(input.key).replace(/^flag\./, "");
      if (!KNOWN_FLAGS.includes(bare)) {
        return `Flag desconocido: "${bare}". Flags válidos: ${KNOWN_FLAGS.join(", ")}.`;
      }
      const key = `flag.${bare}`;
      const value = input.value === true || input.value === "true" ? "true" : "false";
      const preview = `${key}: "${getConfig(key) || "(sin valor)"}" → "${value}"`;
      const id = await registerPendingAction(ctx, "set_config", `${value === "true" ? "Encender" : "Apagar"} flag ${key}`, { key, value }, preview);
      toolCalls.push({ tool: "propose_toggle_flag", summary: `Propuesta ${key} = ${value}` });
      return `Propuesta registrada (id ${id}). ${preview}. El admin debe confirmarla en la tarjeta de acción.`;
    }

    if (toolName === "propose_retry_agent") {
      if (!db) return "DB no disponible.";
      const agentName = String(input.agentName);
      const def = findAgent(agentName);
      if (!def) return `No existe un agente llamado "${agentName}" en el registry.`;
      if (!def.runnable) return `El agente "${agentName}" no tiene runnable (se dispara con parámetros), no se puede reintentar genéricamente.`;
      const id = await registerPendingAction(ctx, "retry_agent", `Reintentar agente ${agentName}`, { agentName }, `Ejecutará runAgent("${agentName}") manualmente`);
      toolCalls.push({ tool: "propose_retry_agent", summary: `Propuesta retry ${agentName}` });
      return `Propuesta registrada (id ${id}). Reintentar "${agentName}". El admin debe confirmarla.`;
    }

    if (toolName === "propose_db_write") {
      if (!pool || !db) return "DB no disponible.";
      const rawSql = String(input.sql);
      const rationale = String(input.rationale || "");
      const guard = checkDbWriteSql(rawSql);
      if (!guard.ok) return `BLOQUEADO: ${guard.reason}`;
      // dry-run: ejecuta dentro de una transacción y la revierte para contar filas
      let affected = 0;
      const conn = await pool.connect();
      try {
        await conn.query("BEGIN");
        await conn.query("SET LOCAL statement_timeout = '8s'");
        const r = await conn.query(rawSql);
        affected = r.rowCount ?? 0;
        await conn.query("ROLLBACK");
      } catch (err) {
        try { await conn.query("ROLLBACK"); } catch { /* noop */ }
        return `El dry-run del SQL falló (no se registró la propuesta): ${(err as Error).message}`;
      } finally {
        conn.release();
      }
      const preview = `Afectaría ${affected} fila(s). Motivo: ${rationale}`;
      const id = await registerPendingAction(ctx, "db_write", `Arreglo de datos (${affected} fila/s)`, { sql: rawSql, rationale, affected }, preview);
      toolCalls.push({ tool: "propose_db_write", summary: `Propuesta SQL → ${affected} fila(s)` });
      return `Propuesta registrada (id ${id}). ${preview}. El admin debe confirmarla en la tarjeta de acción (firmando responsabilidad). En el dry-run NO se escribió nada.`;
    }

    if (toolName === "propose_code_change") {
      if (!db) return "DB no disponible.";
      const rawFiles = Array.isArray(input.files) ? (input.files as unknown[]) : [];
      const title = String(input.title || "").trim();
      const body = String(input.body || "").trim();
      if (!rawFiles.length) return "No hay archivos en la propuesta.";
      if (!title) return "Falta el título del PR.";
      const files: CodeChangeFile[] = [];
      const summaries: string[] = [];
      for (const rf of rawFiles) {
        const o = rf as Record<string, unknown>;
        const filePath = String(o.path || "");
        const newContent = typeof o.newContent === "string" ? o.newContent : "";
        const safe = resolveSafe(filePath);
        if (!safe.ok) return `BLOQUEADO: ${safe.reason}`;
        let churn: string;
        try {
          const current = await fs.readFile(safe.abs, "utf-8");
          const { added, removed } = lineChurn(current, newContent);
          churn = `+${added}/-${removed}`;
        } catch {
          churn = `nuevo, +${newContent.split("\n").length}`;
        }
        files.push({ path: safe.rel, newContent });
        summaries.push(`${safe.rel} (${churn})`);
      }
      const configured = isGithubWriteConfigured(ctx.githubToken);
      const preview = `${files.length} archivo(s): ${summaries.join(", ")}${configured ? "" : " · ⚠ falta configurar IM3_REPO/GITHUB_TOKEN para abrir el PR"}`;
      const id = await registerPendingAction(ctx, "code_change", `PR: ${title}`, { files, title, body }, preview);
      toolCalls.push({ tool: "propose_code_change", summary: `Propuesta PR (${files.length} archivo/s)` });
      return `Propuesta de código registrada (id ${id}). ${preview}. Al confirmar se abrirá un Pull Request para que lo revises y mergees (eso dispara el redeploy). No se aplica nada solo.`;
    }

    return `Tool "${toolName}" no reconocida.`;
  } catch (err) {
    return `Error ejecutando ${toolName}: ${(err as Error).message}`;
  }
}

// Valida un model ID haciendo una llamada mínima a Anthropic (1 token).
export async function validateModelId(modelId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, error: "ANTHROPIC_API_KEY no configurada" };
  try {
    await anthropic.messages.create({ model: modelId, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Estima líneas agregadas/eliminadas entre dos versiones de un archivo (multiset, naive).
function lineChurn(oldText: string, newText: string): { added: number; removed: number } {
  const count = new Map<string, number>();
  for (const l of oldText.split("\n")) count.set(l, (count.get(l) || 0) + 1);
  let added = 0;
  for (const l of newText.split("\n")) {
    const c = count.get(l) || 0;
    if (c > 0) count.set(l, c - 1);
    else added++;
  }
  let removed = 0;
  for (const c of count.values()) removed += c;
  return { added, removed };
}

// Registra una acción pendiente y devuelve su id.
async function registerPendingAction(
  ctx: { sessionId: string; username: string | null },
  actionType: string,
  title: string,
  payload: Record<string, unknown>,
  preview: string,
): Promise<string> {
  if (!db) throw new Error("DB no disponible");
  const [row] = await db
    .insert(pendingAdminActions)
    .values({ sessionId: ctx.sessionId, actionType, title, payload, preview, createdBy: ctx.username, expiresAt: new Date(Date.now() + ACTION_TTL_MS) })
    .returning({ id: pendingAdminActions.id });
  return row.id;
}

// ───────────────────────────────────────────────────────────────
// API pública
// ───────────────────────────────────────────────────────────────
export async function listEngineerSessions(): Promise<Array<{ id: string; title: string; createdAt: Date }>> {
  if (!db) return [];
  const rows = await db
    .select({ id: engineerChatSessions.id, title: engineerChatSessions.title, createdAt: engineerChatSessions.createdAt })
    .from(engineerChatSessions)
    .orderBy(desc(engineerChatSessions.createdAt))
    .limit(100);
  return rows;
}

export async function createEngineerSession(createdBy?: string | null): Promise<{ id: string; title: string; createdAt: Date }> {
  if (!db) throw new Error("DB no disponible");
  const [row] = await db
    .insert(engineerChatSessions)
    .values({ createdBy: createdBy ?? null })
    .returning({ id: engineerChatSessions.id, title: engineerChatSessions.title, createdAt: engineerChatSessions.createdAt });
  return row;
}

export async function getEngineerChatHistory(sessionId: string): Promise<Array<{
  id: string;
  role: string;
  content: string;
  toolCalls: ToolCallSummary[] | null;
  createdAt: Date;
}>> {
  if (!db) return [];
  const rows = await db
    .select()
    .from(engineerChatMessages)
    .where(eq(engineerChatMessages.sessionId, sessionId))
    .orderBy(asc(engineerChatMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    toolCalls: (r.toolCalls as ToolCallSummary[] | null) ?? null,
    createdAt: r.createdAt,
  }));
}

export async function runEngineerChat(params: {
  sessionId: string;
  userMessage: string;
  username?: string | null;
  githubToken?: string | null;
}): Promise<{ assistantMessage: string; toolCalls: ToolCallSummary[]; recordsProcessed: number; metadata: Record<string, unknown> }> {
  if (!db) throw new Error("DB no disponible");
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no configurada");

  const { sessionId, userMessage } = params;
  const ctx = { sessionId, username: params.username ?? null, githubToken: params.githubToken ?? null };

  // Historial de la sesión (para continuidad conversacional): los MAX_HISTORY mensajes
  // MÁS RECIENTES (desc + limit), reordenados cronológicamente para Claude.
  const history = (await db
    .select()
    .from(engineerChatMessages)
    .where(eq(engineerChatMessages.sessionId, sessionId))
    .orderBy(desc(engineerChatMessages.createdAt))
    .limit(MAX_HISTORY)).reverse();

  await db.insert(engineerChatMessages).values({ sessionId, role: "user", content: userMessage });

  const claudeMessages: Anthropic.MessageParam[] = history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
  claudeMessages.push({ role: "user", content: userMessage });

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];

  const toolCalls: ToolCallSummary[] = [];
  let assistantText = "";
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const response = await anthropic.messages.create({
      model: MODEL(),
      max_tokens: 4096,
      system: systemBlocks,
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

    if (assistantContent.length > 0) {
      claudeMessages.push({ role: "assistant", content: assistantContent });
    }

    if (toolUseBlocks.length === 0) break;

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (b) => ({
        type: "tool_result" as const,
        tool_use_id: b.id,
        content: await executeTool(b.name, b.input as Record<string, unknown>, toolCalls, ctx),
      })),
    );
    claudeMessages.push({ role: "user", content: toolResults });
  }

  const finalText = assistantText.trim() || "(El agente no devolvió texto)";

  await db.insert(engineerChatMessages).values({
    sessionId,
    role: "assistant",
    content: finalText,
    toolCalls: toolCalls.length > 0 ? toolCalls : [],
  });

  // Auto-titular la sesión con el primer mensaje del usuario
  if (history.length === 0) {
    const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "");
    await db.update(engineerChatSessions).set({ title }).where(eq(engineerChatSessions.id, sessionId)).catch(() => {});
  }

  // recordsProcessed + metadata se persisten en agent_runs vía runAgent (trazabilidad)
  return {
    assistantMessage: finalText,
    toolCalls,
    recordsProcessed: toolCalls.length,
    metadata: { sessionId, tools: toolCalls.map((t) => t.tool), iterations: iteration },
  };
}

// ───────────────────────────────────────────────────────────────
// Acciones pendientes + apply con consentimiento (Fase B)
// ───────────────────────────────────────────────────────────────
export async function listPendingActions(sessionId?: string): Promise<Array<{
  id: string; sessionId: string | null; actionType: string; title: string; preview: string | null; status: string; createdAt: Date;
}>> {
  if (!db) return [];
  // Solo pendientes y no expiradas (las expiradas/aplicadas/descartadas no son accionables)
  const notExpired = or(isNull(pendingAdminActions.expiresAt), gt(pendingAdminActions.expiresAt, new Date()));
  const where = sessionId
    ? and(eq(pendingAdminActions.sessionId, sessionId), eq(pendingAdminActions.status, "pending"), notExpired)
    : and(eq(pendingAdminActions.status, "pending"), notExpired);
  const rows = await db.select().from(pendingAdminActions).where(where).orderBy(desc(pendingAdminActions.createdAt)).limit(100);
  return rows.map((r) => ({ id: r.id, sessionId: r.sessionId, actionType: r.actionType, title: r.title, preview: r.preview, status: r.status, createdAt: r.createdAt }));
}

export async function listActionAudit(): Promise<Array<{
  id: string; actionType: string; target: string | null; performedBy: string; reason: string | null; result: string | null; createdAt: Date;
}>> {
  if (!db) return [];
  const rows = await db.select().from(adminActionAudit).orderBy(desc(adminActionAudit.createdAt)).limit(100);
  return rows.map((r) => ({ id: r.id, actionType: r.actionType, target: r.target, performedBy: r.performedBy, reason: r.reason, result: r.result, createdAt: r.createdAt }));
}

// Ejecuta EXACTAMENTE el payload guardado de una acción pendiente (anti-tamper),
// audita en admin_action_audit y marca la acción como aplicada. Requiere consentimiento.
export async function applyPendingAction(
  actionId: string,
  username: string,
  reason: string,
  githubToken?: string | null,
): Promise<{ ok: boolean; message: string }> {
  if (!db || !pool) return { ok: false, message: "DB no disponible" };
  const { log } = await import("./index");

  // Reclamo ATÓMICO: solo gana si estaba 'pending' (anti doble-apply concurrente).
  const claimed = await db
    .update(pendingAdminActions)
    .set({ status: "processing" })
    .where(and(eq(pendingAdminActions.id, actionId), eq(pendingAdminActions.status, "pending")))
    .returning();
  if (claimed.length === 0) {
    const [cur] = await db.select({ status: pendingAdminActions.status }).from(pendingAdminActions).where(eq(pendingAdminActions.id, actionId)).limit(1);
    return { ok: false, message: cur ? `La acción ya está '${cur.status}' (no re-aplicable)` : "Acción no encontrada" };
  }
  const action = claimed[0];

  // Expiración (no aplicar propuestas viejas fuera de contexto)
  if (action.expiresAt && action.expiresAt.getTime() < Date.now()) {
    await db.update(pendingAdminActions).set({ status: "expired" }).where(eq(pendingAdminActions.id, actionId)).catch((e) => log(`[engineer-chat] no se pudo marcar expirada ${actionId}: ${e}`));
    return { ok: false, message: "La propuesta expiró; pídele al agente que la regenere." };
  }

  const payload = action.payload as Record<string, unknown>;
  let target: string | null = null;
  let result = "";
  let ok = true;

  try {
    if (action.actionType === "set_config") {
      const key = String(payload.key);
      const value = String(payload.value);
      target = key;
      // Validación profunda del modelo SOLO al aplicar (tras confirmación)
      if (key.startsWith("model.")) {
        const check = await validateModelId(value);
        if (!check.ok) throw new Error(`El model ID "${value}" no es válido contra Anthropic: ${check.error}`);
      }
      const res = await setConfig(key, value, username);
      if (!res.ok) { ok = false; result = `Error: ${res.error}`; }
      else result = `${key}: "${res.oldValue ?? ""}" → "${value}" (aplicado, sin redeploy)`;
    } else if (action.actionType === "retry_agent") {
      const agentName = String(payload.agentName);
      target = agentName;
      const def = findAgent(agentName);
      if (!def?.runnable) { ok = false; result = `El agente "${agentName}" no es reintentable`; }
      else {
        // Timeout: no colgar la request si el agente tarda; sigue en background.
        const runP = runAgent(agentName, def.runnable, { triggeredBy: "manual" });
        runP.catch((e) => log(`[engineer-chat] retry ${agentName} terminó con error: ${e}`)); // evita unhandled rejection tardío
        try {
          await Promise.race([runP, new Promise((_, rej) => setTimeout(() => rej(new Error("__timeout__")), RETRY_TIMEOUT_MS))]);
          result = `Agente "${agentName}" reintentado (ver agent_runs)`;
        } catch (e) {
          if ((e as Error).message === "__timeout__") result = `Agente "${agentName}" disparado; sigue corriendo en background (ver agent_runs).`;
          else throw e;
        }
      }
    } else if (action.actionType === "db_write") {
      const sql = String(payload.sql);
      target = "db";
      const guard = checkDbWriteSql(sql);
      if (!guard.ok) { ok = false; result = `BLOQUEADO: ${guard.reason}`; }
      else {
        const conn = await pool.connect();
        try {
          await conn.query("BEGIN");
          await conn.query("SET LOCAL statement_timeout = '15s'");
          const r = await conn.query(sql);
          await conn.query("COMMIT");
          result = `Ejecutado: ${r.rowCount ?? 0} fila(s) afectada(s)`;
        } catch (err) {
          try { await conn.query("ROLLBACK"); } catch { /* noop */ }
          ok = false; result = `Error SQL: ${(err as Error).message}`;
        } finally {
          conn.release();
        }
      }
    } else if (action.actionType === "code_change") {
      target = "github-pr";
      const files = (payload.files as CodeChangeFile[]) || [];
      const title = String(payload.title || "Cambio propuesto por Ingeniero IM3");
      const body = `${String(payload.body || "")}\n\n---\nPropuesto por el agente Ingeniero IM3 y aprobado por ${username}.\nMotivo: ${reason || "(sin especificar)"}`;
      const pr = await openPullRequest({ files, title, body, oauthToken: githubToken, stamp: Date.now().toString(36) });
      result = `PR abierto para revisión: ${pr.url}`;
    } else {
      ok = false; result = `Tipo de acción desconocido: ${action.actionType}`;
    }
  } catch (err) {
    ok = false; result = `Error: ${(err as Error).message}`;
  }

  // Auditoría unificada (siempre). NO se silencia: si falla, se loguea como crítico
  // porque rompe el no-repudio de un agente con poderes de escritura.
  try {
    await db.insert(adminActionAudit).values({ actionType: action.actionType, target, payload, performedBy: username, reason, result });
  } catch (auditErr) {
    log(`[engineer-chat] ⚠ CRÍTICO: falló la auditoría de la acción ${actionId} (${action.actionType}): ${(auditErr as Error).message}`);
  }

  // Estado final: 'applied' o 'failed' (las fallidas NO quedan re-aplicables)
  try {
    await db.update(pendingAdminActions).set({ status: ok ? "applied" : "failed" }).where(eq(pendingAdminActions.id, actionId));
  } catch (stErr) {
    log(`[engineer-chat] ⚠ no se pudo marcar estado final de ${actionId}: ${(stErr as Error).message}`);
  }

  if (!ok) log(`[engineer-chat] ⚠ acción ${action.actionType} (${actionId}) FALLÓ: ${result}`);
  return { ok, message: result };
}

export async function discardPendingAction(actionId: string): Promise<void> {
  if (!db) return;
  const { log } = await import("./index");
  await db.update(pendingAdminActions).set({ status: "discarded" }).where(and(eq(pendingAdminActions.id, actionId), eq(pendingAdminActions.status, "pending"))).catch((e) => log(`[engineer-chat] no se pudo descartar ${actionId}: ${e}`));
}

// Log de orientación al boot: ¿están los .ts en disco para read_source_file?
// Import lazy de `log` para no acoplar este módulo al bootstrap de index.ts
// (permite testear runEngineerChat sin arrancar el servidor).
export async function logSourceAvailability(): Promise<void> {
  const { log } = await import("./index");
  try {
    await fs.access(path.join(REPO_ROOT, "server", "routes.ts"));
    log(`[engineer-chat] código fuente disponible en runtime (REPO_ROOT=${REPO_ROOT})`);
  } catch {
    log(`[engineer-chat] ⚠ código fuente NO disponible en disco (REPO_ROOT=${REPO_ROOT}); read_source_file fallará. Considera fallback a GitHub.`);
  }
}
