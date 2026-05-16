/**
 * Crear repos GitHub para los proyectos importados que no tienen `githubRepoUrl`.
 *
 * Lee del CRM los proyectos con createdFrom='import' y githubRepoUrl=null,
 * y para cada uno: pregunta interactivamente si crear el repo, ejecuta `gh repo create`
 * desde la carpeta local (que hace git init + remote add + commit inicial + push),
 * y actualiza el proyecto en el CRM con la URL del nuevo repo.
 *
 * Pre-requisitos:
 *   - Server local corriendo en BASE_URL
 *   - .env con ADMIN_USERNAME y ADMIN_PASSWORD
 *   - `gh` CLI instalado y autenticado (`gh auth status` debe pasar)
 *   - Las carpetas locales de los 5 proyectos deben existir
 *
 * Uso:
 *   npx tsx scripts/create-github-repos.ts                 # interactivo
 *   npx tsx scripts/create-github-repos.ts --yes           # no-interactivo, usa --visibility para todos
 *   npx tsx scripts/create-github-repos.ts --dry-run       # solo lista, no ejecuta
 *   npx tsx scripts/create-github-repos.ts --owner=OWNER   # default mobando1
 *   npx tsx scripts/create-github-repos.ts --visibility=private  # default private
 *
 * Notas:
 *   - Folders sin git: este script invoca gh repo create --source --push. Pero gh
 *     NO hace git init + commit automaticamente — si la carpeta no tiene commits,
 *     el push falla. Para folders nuevos, primero hacer `cd <folder> && git init &&
 *     git add . && git commit -m "Initial commit"` antes de correr este script.
 *   - Folders con .env: VERIFICA que el .gitignore los excluya antes de correr.
 *     gh repo create --push respeta .gitignore pero si el .env ya esta en un commit
 *     anterior, se va a pushear.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as readline from "readline";

// ── env loader ──
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
    if (!process.env[key]) process.env[key] = value;
  }
} catch (_) { /* .env optional */ }

const BASE_URL = process.env.IMPORT_BASE_URL || "http://localhost:3000";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "im3admin2024";
const PROJECTS_ROOT = "/Users/mateoobandoangel/projects/claude code projects";

// ── CLI flags ──
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const autoYes = args.includes("--yes") || args.includes("-y");  // skip prompts, usa defaults
const ownerArg = args.find(a => a.startsWith("--owner="))?.slice("--owner=".length);
const visibilityArg = args.find(a => a.startsWith("--visibility="))?.slice("--visibility=".length);
const OWNER = ownerArg || "mobando1";
const DEFAULT_VISIBILITY = (visibilityArg === "public" ? "public" : "private") as "public" | "private";

// Mapeo display name → folder local. Tiene que matchear el del script de import.
// Si el import script cambia, este también.
const PROJECT_FOLDERS: Record<string, string> = {
  "Commander AI — Asistente WhatsApp": `${PROJECTS_ROOT}/Commander AI`,
  "VozIA — Voice Agents para Negocios": `${PROJECTS_ROOT}/Voice Agent`,
  "Passport2Fluency — DMV Drive License": `${PROJECTS_ROOT}/P2F/DMV Drive licence`,
  "Alamo Angels — Catalina": `${PROJECTS_ROOT}/Alamo Angels/Catalina`,
  "Restaurantes — Cierre de Caja": `${PROJECTS_ROOT}/Restaurants/Cierre de caja con CC in VS`,
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/[ñ]/g, "n")
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
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
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login response sin set-cookie");
  sessionCookie = setCookie.split(";")[0];
  console.log("✓ Login OK");
}

type ProjectFromCRM = {
  id: string;
  name: string;
  githubRepoUrl: string | null;
  createdFrom: string;
};

async function fetchImportedNoGithub(): Promise<ProjectFromCRM[]> {
  const res = await fetch(`${BASE_URL}/api/admin/projects`, {
    headers: { "Cookie": sessionCookie || "" },
  });
  if (!res.ok) throw new Error(`GET /projects failed: ${res.status}`);
  const list = await res.json() as ProjectFromCRM[];
  return list.filter(p => p.createdFrom === "import" && !p.githubRepoUrl);
}

async function patchProject(id: string, githubRepoUrl: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Cookie": sessionCookie || "",
    },
    body: JSON.stringify({ githubRepoUrl }),
  });
  if (!res.ok) throw new Error(`PATCH /projects/${id} failed: ${res.status} ${await res.text()}`);
}

function checkGhAuth(): void {
  try {
    const out = execSync("gh auth status 2>&1", { encoding: "utf-8" });
    console.log("✓ gh CLI autenticado");
    const lines = out.split("\n").filter(l => l.includes("Logged in"));
    if (lines.length > 0) console.log(`  ${lines[0].trim()}`);
  } catch {
    throw new Error("gh CLI no autenticado. Corre `gh auth login` primero.");
  }
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, ans => resolve(ans.trim())));
}

async function createRepo(folder: string, slug: string, visibility: "public" | "private"): Promise<string> {
  if (!existsSync(folder)) {
    throw new Error(`Folder no existe: ${folder}`);
  }
  const fullName = `${OWNER}/${slug}`;
  const cmd = `gh repo create ${fullName} --${visibility} --source "${folder}" --remote origin --push`;
  console.log(`  $ ${cmd}`);
  const result = spawnSync("gh", [
    "repo", "create", fullName,
    `--${visibility}`,
    "--source", folder,
    "--remote", "origin",
    "--push",
  ], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`gh repo create exit ${result.status}`);
  }
  return `https://github.com/${fullName}`;
}

async function main() {
  console.log("=== IM3 CRM — Crear GitHub Repos para Proyectos Importados ===");
  console.log(`Base URL:           ${BASE_URL}`);
  console.log(`Owner:              ${OWNER}`);
  console.log(`Default visibility: ${DEFAULT_VISIBILITY}`);
  console.log(`Dry run:            ${dryRun}`);
  console.log();

  if (!dryRun) checkGhAuth();
  await login();

  const candidates = await fetchImportedNoGithub();
  if (candidates.length === 0) {
    console.log("✓ No hay proyectos importados sin repo. Nada que hacer.");
    return;
  }

  console.log(`Encontré ${candidates.length} proyecto(s) sin GitHub repo:\n`);
  for (const p of candidates) {
    const folder = PROJECT_FOLDERS[p.name];
    console.log(`  - ${p.name}`);
    console.log(`      id:     ${p.id}`);
    console.log(`      folder: ${folder || "(NO MAPEADO — agrégalo en PROJECT_FOLDERS)"}`);
    console.log(`      slug:   ${slugify(p.name)}`);
  }
  console.log();

  if (dryRun) {
    console.log("[DRY-RUN] no creo repos. Re-corre sin --dry-run para ejecutar.");
    return;
  }

  // Con --yes (-y): skip readline entirely, usa DEFAULT_VISIBILITY para todos.
  // Importante: spawnSync(gh) con stdio:inherit puede dejar stdin en estado raro
  // si el script tambien usa readline para leer del mismo stdin (pipe drained,
  // readline cuelga). El modo --yes evita ese path completo y es lo que se debe
  // usar en bash scripts no-interactivos.
  const rl = autoYes ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  const results: Array<{ name: string; ok: boolean; url?: string; error?: string }> = [];

  try {
    if (autoYes) {
      console.log(`\n[--yes] modo no-interactivo: visibility=${DEFAULT_VISIBILITY} para todos\n`);
    }
    for (const p of candidates) {
      const folder = PROJECT_FOLDERS[p.name];
      if (!folder) {
        console.log(`\n✗ ${p.name}: folder no mapeado, skip`);
        results.push({ name: p.name, ok: false, error: "folder no mapeado" });
        continue;
      }

      console.log(`\n── ${p.name} ──`);
      const slug = slugify(p.name);
      let visibility: "public" | "private" = DEFAULT_VISIBILITY;

      if (!autoYes && rl) {
        const proceed = await ask(rl, `¿Crear repo ${OWNER}/${slug}? [Y/n] `);
        if (proceed.toLowerCase() === "n") {
          console.log("  skip");
          results.push({ name: p.name, ok: false, error: "skipped por usuario" });
          continue;
        }
        const visAns = await ask(rl, `Visibilidad [private/public] (default ${DEFAULT_VISIBILITY}): `);
        visibility = visAns === "public" ? "public" : visAns === "private" ? "private" : DEFAULT_VISIBILITY;
      }

      try {
        const url = await createRepo(folder, slug, visibility);
        console.log(`  ✓ Repo creado: ${url}`);
        await patchProject(p.id, url);
        console.log(`  ✓ CRM actualizado con githubRepoUrl`);
        results.push({ name: p.name, ok: true, url });
      } catch (err: any) {
        console.log(`  ✗ ${err?.message || err}`);
        results.push({ name: p.name, ok: false, error: err?.message || String(err) });
      }
    }
  } finally {
    if (rl) rl.close();
  }

  console.log("\n=== Summary ===");
  const ok = results.filter(r => r.ok);
  console.log(`✓ Creados: ${ok.length}/${results.length}`);
  for (const r of ok) console.log(`    ${r.name} → ${r.url}`);
  const fail = results.filter(r => !r.ok);
  if (fail.length > 0) {
    console.log(`✗ Fallaron/skipeados: ${fail.length}`);
    for (const r of fail) console.log(`    ${r.name}: ${r.error}`);
  }
}

main().catch(err => {
  console.error(`\nFATAL: ${err?.message || err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
