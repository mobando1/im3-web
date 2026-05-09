/**
 * Bulk import de proyectos legacy al CRM IM3.
 *
 * Lee la lista hardcoded de proyectos en `/Users/mateoobandoangel/projects/claude code projects/`,
 * extrae el brief del .md principal de cada uno, detecta el git remote, y POST a
 * /api/admin/projects/from-brief con createdFrom='import'. Espera 3s entre proyectos
 * para respetar rate limits de Claude.
 *
 * Pre-requisitos:
 *   - Server local corriendo en BASE_URL (default http://localhost:3000)
 *   - .env con ADMIN_USERNAME y ADMIN_PASSWORD
 *   - .env con ANTHROPIC_API_KEY (lo usa el server al disparar phase-generator)
 *
 * Uso:
 *   npx tsx scripts/import-legacy-projects.ts                      # los 17 proyectos
 *   npx tsx scripts/import-legacy-projects.ts --only="Sirius"      # filtra por substring
 *   npx tsx scripts/import-legacy-projects.ts --dry-run            # log payload sin POST
 *   npx tsx scripts/import-legacy-projects.ts --tier=1             # solo Tier 1
 */

import { execSync } from "child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "fs";
import { resolve, join } from "path";

// ── env loader (sin dotenv) ──
try {
  const envPath = resolve(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch (_) { /* .env optional */ }

const BASE_URL = process.env.IMPORT_BASE_URL || "http://localhost:3000";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PROJECTS_ROOT = "/Users/mateoobandoangel/projects/claude code projects";

// ── CLI flags ──
const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith("--only="))?.slice("--only=".length);
const tierArg = args.find(a => a.startsWith("--tier="))?.slice("--tier=".length);
const dryRun = args.includes("--dry-run");

type ProjectEntry = {
  path: string;                       // path absoluto a la carpeta del proyecto
  displayName: string;                // nombre que aparece en el CRM
  projectType: "client" | "internal"; // client = cliente externo, internal = producto IM3
  preferredMd?: string;               // .md específico a usar como brief (override del auto-detect)
  tier: 1 | 2;                        // 1 = git + brief, 2 = brief sin git (repo se crea después)
};

const PROJECTS: ProjectEntry[] = [
  // ── Tier 1: con git + brief decente ──
  { path: `${PROJECTS_ROOT}/AMJ-solutions-website`, displayName: "AMJ Solutions — Website", projectType: "client", tier: 1 },
  { path: `${PROJECTS_ROOT}/Sirius-consultora`, displayName: "Sirius Consultora — Web + CRM", projectType: "client", preferredMd: "SIRIUS.MD", tier: 1 },
  { path: `${PROJECTS_ROOT}/Scrapper-Secop-ii-`, displayName: "Scrapper SECOP II", projectType: "internal", tier: 1 },
  { path: `${PROJECTS_ROOT}/Scrapper-newspaper`, displayName: "WorldPress Digest — Scrapper Newspaper", projectType: "internal", tier: 1 },
  { path: `${PROJECTS_ROOT}/APP Logistics/APP Logistics Website`, displayName: "APP Logistics — Website", projectType: "client", tier: 1 },
  { path: `${PROJECTS_ROOT}/APP Logistics/App logistics APP RASTREO`, displayName: "APP Logistics — APP Rastreo", projectType: "client", tier: 1 },
  { path: `${PROJECTS_ROOT}/Alamo Angels/Alamo Angels OS`, displayName: "Alamo Angels — OS", projectType: "client", tier: 1 },
  { path: `${PROJECTS_ROOT}/Alamo Angels/Alamo Angels — Deal Flow OS`, displayName: "Alamo Angels — Deal Flow OS", projectType: "client", tier: 1 },
  { path: `${PROJECTS_ROOT}/P2F/P2F---Portal`, displayName: "Passport2Fluency — Portal", projectType: "internal", tier: 1 },
  { path: `${PROJECTS_ROOT}/P2F/P2F-Website`, displayName: "Passport2Fluency — Website", projectType: "internal", tier: 1 },
  { path: `${PROJECTS_ROOT}/Restaurants/APP de contratacion `, displayName: "La Glorieta — Sistema de Contratación", projectType: "client", tier: 1 },
  { path: `${PROJECTS_ROOT}/IM3/IM3-TUTOR-PROJECT`, displayName: "IM3 Tutor — Tutor Virtual IA", projectType: "internal", tier: 1 },

  // ── Tier 2: brief sin git (repos se crean después con scripts/create-github-repos.ts) ──
  { path: `${PROJECTS_ROOT}/Commander AI`, displayName: "Commander AI — Asistente WhatsApp", projectType: "internal", tier: 2 },
  { path: `${PROJECTS_ROOT}/Voice Agent`, displayName: "VozIA — Voice Agents para Negocios", projectType: "internal", tier: 2 },
  { path: `${PROJECTS_ROOT}/P2F/DMV Drive licence`, displayName: "Passport2Fluency — DMV Drive License", projectType: "internal", tier: 2 },
  { path: `${PROJECTS_ROOT}/Alamo Angels/Catalina`, displayName: "Alamo Angels — Catalina", projectType: "client", tier: 2 },
  { path: `${PROJECTS_ROOT}/Restaurants/Cierre de caja con CC in VS`, displayName: "Restaurantes — Cierre de Caja", projectType: "client", tier: 2 },
];

const MD_BUDGET_BYTES = 8 * 1024;

function findBriefMd(projectPath: string, preferred?: string): { filename: string; content: string; truncated: boolean } | null {
  if (!existsSync(projectPath)) return null;
  let entries: string[];
  try {
    entries = readdirSync(projectPath);
  } catch {
    return null;
  }
  const mdFiles = entries.filter(f => /\.(md|MD)$/.test(f));
  if (mdFiles.length === 0) return null;

  const sorted = [...mdFiles].sort((a, b) => {
    if (preferred) {
      if (a === preferred) return -1;
      if (b === preferred) return 1;
    }
    const score = (f: string) => {
      const lower = f.toLowerCase();
      if (lower === "readme.md") return 100;
      if (lower === "claude.md") return 90;
      if (lower.includes("spec")) return 85;
      if (lower.includes("design")) return 70;
      return 50;
    };
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sb - sa;
    const sizeA = statSync(join(projectPath, a)).size;
    const sizeB = statSync(join(projectPath, b)).size;
    return sizeB - sizeA;
  });

  const chosen = sorted[0];
  const fullPath = join(projectPath, chosen);
  const raw = readFileSync(fullPath, "utf-8");
  const truncated = raw.length > MD_BUDGET_BYTES;
  const content = truncated ? raw.slice(0, MD_BUDGET_BYTES) + "\n\n[...truncated por bulk-import]" : raw;
  return { filename: chosen, content, truncated };
}

function getGitRepoUrl(projectPath: string): string | null {
  try {
    const url = execSync(`git -C "${projectPath}" remote get-url origin 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (!url) return null;
    if (url.startsWith("git@github.com:")) {
      return "https://github.com/" + url.slice("git@github.com:".length).replace(/\.git$/, "");
    }
    return url.replace(/\.git$/, "");
  } catch {
    return null;
  }
}

let sessionCookie: string | null = null;

async function login(): Promise<void> {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_USERNAME y ADMIN_PASSWORD requeridos en .env");
  }
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login response sin set-cookie");
  sessionCookie = setCookie.split(";")[0];
  console.log("✓ Login OK");
}

async function postWithRetry(url: string, payload: unknown, attempts = 2): Promise<{ status: number; body: any }> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": sessionCookie || "",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let body: any;
      try { body = JSON.parse(text); } catch { body = text; }
      if (res.status >= 500 && i < attempts - 1) {
        console.log(`  ↺ ${res.status} — retry en 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      return { status: res.status, body };
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.log(`  ↺ network error — retry en 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
    }
  }
  throw lastErr;
}

type ImportResult = {
  name: string;
  path: string;
  ok: boolean;
  projectId?: string;
  metadata?: any;
  error?: string;
};

async function importProject(entry: ProjectEntry): Promise<ImportResult> {
  const base = { name: entry.displayName, path: entry.path };

  if (!existsSync(entry.path)) {
    return { ...base, ok: false, error: "folder no existe" };
  }
  const brief = findBriefMd(entry.path, entry.preferredMd);
  if (!brief) {
    return { ...base, ok: false, error: "no se encontró .md con brief" };
  }

  const githubRepoUrl = getGitRepoUrl(entry.path);

  const payload: Record<string, unknown> = {
    name: entry.displayName,
    brief: brief.content,
    projectType: entry.projectType,
    githubRepoUrl,
    createdFrom: "import",
  };

  console.log(`\n[T${entry.tier}] ${entry.displayName}`);
  console.log(`  path:   ${entry.path}`);
  console.log(`  brief:  ${brief.filename} (${(brief.content.length / 1024).toFixed(1)}KB${brief.truncated ? ", truncated" : ""})`);
  console.log(`  type:   ${entry.projectType}`);
  console.log(`  github: ${githubRepoUrl || "(sin remote)"}`);

  if (dryRun) {
    console.log("  [DRY-RUN] no POST");
    return { ...base, ok: true };
  }

  try {
    const { status, body } = await postWithRetry(`${BASE_URL}/api/admin/projects/from-brief`, payload);
    if (status >= 400) {
      const msg = typeof body === "object" ? (body.message || body.error || JSON.stringify(body)) : String(body);
      console.log(`  ✗ ${status}: ${msg}`);
      return { ...base, ok: false, error: `${status}: ${msg}` };
    }
    const meta = body.metadata || {};
    console.log(`  ✓ projectId=${body.projectId}`);
    console.log(`    phases=${body.phasesCreated} tasks=${body.tasksCreated} deliverables=${body.deliverablesCreated}`);
    console.log(`    score: phases=${meta.phasesScore ?? "-"} tasks=${meta.tasksScore ?? "-"} | retries=${meta.phasesRetries}/${meta.tasksRetries}`);
    if (meta.fallbackUsed) console.log(`    ⚠ FALLBACK USED — marcar para review`);
    if (meta.alreadyExists) console.log(`    ℹ already exists (idempotent)`);
    return { ...base, ok: true, projectId: body.projectId, metadata: meta };
  } catch (err: any) {
    console.log(`  ✗ exception: ${err?.message || err}`);
    return { ...base, ok: false, error: err?.message || String(err) };
  }
}

async function main() {
  console.log("=== IM3 CRM — Bulk Import de Proyectos Legacy ===");
  console.log(`Base URL:  ${BASE_URL}`);
  console.log(`Dry run:   ${dryRun}`);
  console.log(`Filter:    ${onlyArg || "(none)"}`);
  console.log(`Tier:      ${tierArg || "all"}`);
  console.log();

  let filtered = PROJECTS;
  if (tierArg) {
    const t = parseInt(tierArg, 10) as 1 | 2;
    filtered = filtered.filter(p => p.tier === t);
  }
  if (onlyArg) {
    const q = onlyArg.toLowerCase();
    filtered = filtered.filter(p => p.displayName.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    console.error(`✗ Ningún proyecto matchea con los filtros`);
    process.exit(1);
  }
  console.log(`Procesando ${filtered.length} proyecto(s)`);

  if (!dryRun) await login();

  const results: ImportResult[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const r = await importProject(entry);
    results.push(r);
    if (i < filtered.length - 1 && !dryRun) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log("\n=== Summary ===");
  const ok = results.filter(r => r.ok);
  const fail = results.filter(r => !r.ok);
  console.log(`✓ OK:     ${ok.length}/${results.length}`);
  console.log(`✗ Fail:   ${fail.length}/${results.length}`);
  const fallbacks = ok.filter(r => r.metadata?.fallbackUsed);
  if (fallbacks.length > 0) {
    console.log(`⚠ Fallback used (review): ${fallbacks.length}`);
    for (const r of fallbacks) console.log(`    - ${r.name}`);
  }
  const noGithub = ok.filter(r => !r.metadata?.alreadyExists).filter(r => {
    const entry = PROJECTS.find(p => p.displayName === r.name);
    return entry && getGitRepoUrl(entry.path) === null;
  });
  if (noGithub.length > 0) {
    console.log(`\nProyectos importados SIN GitHub repo (correr scripts/create-github-repos.ts después):`);
    for (const r of noGithub) console.log(`    - ${r.name} (projectId=${r.projectId})`);
  }
  if (fail.length > 0) {
    console.log("\nFailures:");
    for (const r of fail) console.log(`    - ${r.name}: ${r.error}`);
  }

  if (!dryRun) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = `imports-${ts}.json`;
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\nReporte guardado: ${reportPath}`);
  }

  process.exit(fail.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\nFATAL: ${err?.message || err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
