import { db } from "../db";
import { repoProjectSuggestions, projectGithubRepos, clientProjects, notifications, users } from "@shared/schema";
import { eq, isNotNull, inArray } from "drizzle-orm";
import { log } from "../index";

export type GithubRepoLite = {
  fullName: string; // owner/repo
  url: string;
  description: string | null;
  isPrivate: boolean;
};

/**
 * Normaliza un repo full-name o URL a la forma canónica `owner/repo` en minúsculas:
 * quita el host de GitHub, el sufijo `.git` y la barra final. Se usa en AMBOS lados de
 * la comparación (repos vinculados vs repos de GitHub) para evitar falsos negativos
 * (ej. un legacy guardado como `https://github.com/owner/repo.git`).
 */
export function normalizeRepoFullName(value: string): string {
  return value
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/**
 * Lista TODOS los repos accesibles por el token (paginado, hasta 2000). Usa el token
 * dado (GITHUB_TOKEN por defecto, o el OAuth del admin en el scan on-demand).
 *
 * Devuelve `{ repos, complete }`. `complete=false` indica que el listado quedó parcial
 * (una página falló, o se alcanzó el tope de páginas) — el caller NO debe borrar
 * sugerencias en ese caso, porque los repos de las páginas faltantes se verían como
 * "ya no existen" y sus sugerencias se borrarían por error.
 */
export async function listAllGithubRepos(token: string): Promise<{ repos: GithubRepoLite[]; complete: boolean }> {
  if (!token) return { repos: [], complete: false };
  const repos: GithubRepoLite[] = [];
  const MAX_PAGES = 20; // tope defensivo: 20 × 100 = 2000 repos
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "IM3-Systems-CRM" } },
    );
    if (!res.ok) {
      log(`repo-discovery: GitHub /user/repos error ${res.status} (page ${page}) — listado parcial`);
      return { repos, complete: false };
    }
    const batch = (await res.json()) as Array<{ full_name: string; html_url: string; description: string | null; private: boolean }>;
    if (!Array.isArray(batch) || batch.length === 0) return { repos, complete: true };
    for (const r of batch) {
      repos.push({ fullName: r.full_name, url: r.html_url, description: r.description, isPrivate: r.private });
    }
    if (batch.length < 100) return { repos, complete: true }; // última página
  }
  // Salimos por el tope de páginas: puede haber más repos sin listar.
  log("repo-discovery: alcanzado el tope de paginación — listado posiblemente incompleto");
  return { repos, complete: false };
}

/**
 * Conjunto de repos (normalizados) que YA tienen proyecto en el CRM, vía la tabla
 * multi-repo (activos E inactivos) o la columna legacy `client_projects.github_repo_url`.
 *
 * Se cuentan también las filas inactivas (soft-deleted): borrar UN repo de un proyecto
 * que sigue existiendo no debería re-sugerirlo (eso crearía un segundo proyecto y
 * partiría el historial del repo). Borrar el proyecto completo SÍ hard-deletea sus
 * filas de project_github_repos, así que el repo vuelve a aparecer — comportamiento
 * intencional.
 */
async function getLinkedRepoFullNames(): Promise<Set<string>> {
  const linked = new Set<string>();
  const all = await db!.select({ repoFullName: projectGithubRepos.repoFullName }).from(projectGithubRepos);
  for (const r of all) linked.add(normalizeRepoFullName(r.repoFullName));

  const legacy = await db!
    .select({ url: clientProjects.githubRepoUrl })
    .from(clientProjects)
    .where(isNotNull(clientProjects.githubRepoUrl));
  for (const r of legacy) {
    if (r.url) linked.add(normalizeRepoFullName(r.url));
  }
  return linked;
}

/**
 * Reconcilia la tabla de sugerencias con el estado actual de GitHub + CRM.
 *
 * Regla (definida con el usuario): un repo es sugerencia si existe en GitHub y NO
 * tiene proyecto en el CRM. NO hay estado "descartado" — para excluir un repo se
 * borra de GitHub. Por eso:
 *   - repo nuevo sin proyecto        → se crea la sugerencia
 *   - sugerencia que ya se vinculó    → se elimina (ya no aplica)
 *   - repo borrado de GitHub          → se elimina (no aparece en la lista de GitHub)
 *   - proyecto borrado, repo intacto  → reaparece como sugerencia en el próximo scan
 *
 * Salvaguardas: si GitHub devuelve 0 repos o el listado quedó incompleto (rate limit /
 * página caída), NO se borra ninguna sugerencia. El insert usa onConflictDoNothing para
 * tolerar scans concurrentes (cron + botón "Escanear ahora") sin abortar por el UNIQUE.
 */
export async function runRepoDiscovery(opts?: { token?: string }): Promise<{
  recordsProcessed: number;
  created: number;
  removed: number;
  candidates: number;
}> {
  if (!db) return { recordsProcessed: 0, created: 0, removed: 0, candidates: 0 };

  let token = opts?.token || process.env.GITHUB_TOKEN || "";
  if (!token) {
    // Fallback: cualquier admin con OAuth conectado (mismo patrón que auto-analyze).
    const [adminWithOAuth] = await db
      .select({ token: users.githubAccessToken })
      .from(users)
      .where(isNotNull(users.githubAccessToken))
      .limit(1);
    token = adminWithOAuth?.token || "";
  }
  if (!token) {
    log("repo-discovery: sin token de GitHub (ni GITHUB_TOKEN ni OAuth de admin) — skip");
    return { recordsProcessed: 0, created: 0, removed: 0, candidates: 0 };
  }

  const { repos: allRepos, complete } = await listAllGithubRepos(token);
  if (allRepos.length === 0) {
    log("repo-discovery: 0 repos devueltos por GitHub — skip (no se borran sugerencias por seguridad)");
    return { recordsProcessed: 0, created: 0, removed: 0, candidates: 0 };
  }

  const linked = await getLinkedRepoFullNames();
  const candidates = allRepos.filter((r) => !linked.has(normalizeRepoFullName(r.fullName)));
  const candidateNames = new Set(candidates.map((c) => normalizeRepoFullName(c.fullName)));

  const existing = await db.select().from(repoProjectSuggestions);
  const existingByName = new Map(existing.map((s) => [normalizeRepoFullName(s.repoFullName), s]));

  let created = 0;
  for (const c of candidates) {
    const prev = existingByName.get(normalizeRepoFullName(c.fullName));
    if (prev) {
      await db
        .update(repoProjectSuggestions)
        .set({ repoUrl: c.url, description: c.description ?? null, isPrivate: c.isPrivate, lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(repoProjectSuggestions.id, prev.id));
    } else {
      // onConflictDoNothing: si un scan concurrente ya lo insertó, no aborta el loop.
      const inserted = await db
        .insert(repoProjectSuggestions)
        .values({ repoFullName: c.fullName, repoUrl: c.url, description: c.description ?? null, isPrivate: c.isPrivate })
        .onConflictDoNothing({ target: repoProjectSuggestions.repoFullName })
        .returning({ id: repoProjectSuggestions.id });
      if (inserted.length > 0) created++;
    }
  }

  // Eliminar sugerencias que ya no son candidatas (ahora vinculadas, o repo borrado de
  // GitHub) — SOLO si el listado de GitHub fue completo (si no, podríamos borrar
  // sugerencias válidas de páginas que no alcanzamos a traer).
  let removed = 0;
  if (complete) {
    const staleIds = existing.filter((s) => !candidateNames.has(normalizeRepoFullName(s.repoFullName))).map((s) => s.id);
    if (staleIds.length > 0) {
      await db.delete(repoProjectSuggestions).where(inArray(repoProjectSuggestions.id, staleIds));
      removed = staleIds.length;
    }
  } else {
    log("repo-discovery: listado incompleto — se omite el borrado de sugerencias obsoletas");
  }

  // Notificación proactiva solo cuando aparecen repos nuevos (best-effort).
  if (created > 0) {
    await db
      .insert(notifications)
      .values({
        type: "repos_detected",
        title: created === 1 ? "1 repo nuevo sin proyecto" : `${created} repos nuevos sin proyecto`,
        description: "Revisá Proyectos para crear los proyectos correspondientes.",
      })
      .catch(() => {});
  }

  log(`repo-discovery: ${candidates.length} candidato(s), ${created} nuevo(s), ${removed} removido(s)${complete ? "" : " [parcial]"}`);
  return { recordsProcessed: created + removed, created, removed, candidates: candidates.length };
}
