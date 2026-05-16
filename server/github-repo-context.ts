import { log } from "./index";

const GH_API = "https://api.github.com";
const MAX_README_CHARS = 4000;
const MAX_DOC_CHARS = 1500;
const MAX_SCHEMA_CHARS = 2000;
const MAX_TOTAL_CHARS = 12000;

function ghHeaders(oauthToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "IM3-Systems-CRM",
  };
  // Prefer the admin's OAuth token (has scope on their private repos) over the
  // server-wide PAT (limited to public/explicitly granted repos).
  const token = oauthToken || process.env.GITHUB_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m = cleaned.match(/github\.com[:/]([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

type DirEntry = { name: string; path: string; type: string; size: number };

async function fetchFileContent(owner: string, repo: string, path: string, token?: string): Promise<string | null> {
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const data = await res.json() as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

async function listDir(owner: string, repo: string, path: string, token?: string): Promise<DirEntry[]> {
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, { headers: ghHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchFirstAvailable(owner: string, repo: string, paths: string[], token?: string): Promise<{ path: string; content: string } | null> {
  for (const p of paths) {
    const content = await fetchFileContent(owner, repo, p, token);
    if (content) return { path: p, content };
  }
  return null;
}

/**
 * Light recursive listing of a directory: returns up to `maxEntries` files,
 * walking up to `depth` levels deep. Stops early once the cap is reached so
 * a huge repo does not exhaust the GitHub API.
 */
async function listFileTree(
  owner: string,
  repo: string,
  path: string,
  depth: number,
  token: string | undefined,
  maxEntries = 60,
): Promise<string[]> {
  const collected: string[] = [];
  async function walk(p: string, level: number): Promise<void> {
    if (collected.length >= maxEntries || level > depth) return;
    const entries = await listDir(owner, repo, p, token);
    // Files first so Claude sees concrete handlers, dirs second
    const files = entries.filter(e => e.type === "file");
    const dirs = entries.filter(e => e.type === "dir");
    for (const f of files) {
      if (collected.length >= maxEntries) return;
      collected.push(f.path);
    }
    for (const d of dirs) {
      if (collected.length >= maxEntries) return;
      // Skip noisy folders that never carry signal
      if (/^(node_modules|\.git|\.next|dist|build|coverage|\.cache|public)$/i.test(d.name)) continue;
      await walk(d.path, level + 1);
    }
  }
  await walk(path, 0);
  return collected;
}

/**
 * Reads README, manifest, file tree, key implementation files (API routes,
 * DB schema) and recent commits so Claude can judge what is already built.
 * Returns null if the repo is inaccessible or empty — caller should continue
 * with whatever brief it already has.
 *
 * `oauthToken` (optional) is the admin's GitHub OAuth access token. When passed
 * it gives access to the admin's private repos. Falls back to GITHUB_TOKEN env
 * (a global PAT) when no OAuth is provided. If a private repo can't be reached
 * with the provided token, GitHub returns 404 (not 403) by design.
 */
export async function fetchRepoContext(repoUrl: string, oauthToken?: string): Promise<string | null> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;
  const { owner, repo } = parsed;

  try {
    const meta = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers: ghHeaders(oauthToken) });
    if (!meta.ok) {
      log(`fetchRepoContext: repo not accessible ${owner}/${repo} (${meta.status}) using ${oauthToken ? "OAuth token" : "PAT/anonymous"}`);
      return null;
    }
    const repoMeta = await meta.json() as { description?: string; language?: string; default_branch?: string; stargazers_count?: number; pushed_at?: string };

    const sections: string[] = [];
    sections.push(`Repositorio: ${owner}/${repo}`);
    if (repoMeta.description) sections.push(`Descripción GitHub: ${repoMeta.description}`);
    if (repoMeta.language) sections.push(`Lenguaje principal: ${repoMeta.language}`);
    if (repoMeta.pushed_at) sections.push(`Último push: ${new Date(repoMeta.pushed_at).toISOString().slice(0, 10)}`);

    // README
    const readme = await fetchFirstAvailable(owner, repo, ["README.md", "README.MD", "Readme.md", "readme.md"], oauthToken);
    if (readme) {
      sections.push(`\n## README\n${readme.content.slice(0, MAX_README_CHARS)}${readme.content.length > MAX_README_CHARS ? "\n…(truncado)" : ""}`);
    }

    // Manifest (stack inference)
    const manifest = await fetchFirstAvailable(owner, repo, ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "composer.json"], oauthToken);
    if (manifest) {
      sections.push(`\n## Manifest (${manifest.path})\n${manifest.content.slice(0, 1200)}`);
    }

    // Top-level structure — tells Claude which modules exist (auth, db, api, etc.)
    const root = await listDir(owner, repo, "", oauthToken);
    const candidateDirs = ["app", "src", "server", "pages", "lib", "components", "prisma", "drizzle", "api"];
    const presentDirs = root.filter(e => e.type === "dir" && candidateDirs.includes(e.name));
    if (presentDirs.length > 0) {
      const treeLines: string[] = [];
      for (const d of presentDirs) {
        const files = await listFileTree(owner, repo, d.path, 2, oauthToken, 40);
        if (files.length > 0) {
          treeLines.push(`### ${d.path}/`);
          treeLines.push(files.map(f => `- ${f}`).join("\n"));
        }
      }
      if (treeLines.length > 0) {
        sections.push(`\n## Estructura del repositorio (resumen)\n${treeLines.join("\n")}`);
      }
    }

    // API endpoints — Next.js (app router or pages router) or Express-like
    const apiPaths = ["app/api", "src/app/api", "pages/api", "src/pages/api"];
    for (const apiPath of apiPaths) {
      const apiFiles = await listFileTree(owner, repo, apiPath, 3, oauthToken, 40);
      if (apiFiles.length > 0) {
        sections.push(`\n## Endpoints detectados (${apiPath})\n${apiFiles.map(f => `- ${f}`).join("\n")}`);
        break;
      }
    }

    // DB schema — gives Claude the data model in one shot
    const schema = await fetchFirstAvailable(
      owner,
      repo,
      [
        "prisma/schema.prisma",
        "drizzle/schema.ts",
        "src/db/schema.ts",
        "src/lib/db/schema.ts",
        "server/db/schema.ts",
        "shared/schema.ts",
        "db/schema.ts",
        "src/schema.ts",
      ],
      oauthToken,
    );
    if (schema) {
      sections.push(`\n## Schema de base de datos (${schema.path})\n${schema.content.slice(0, MAX_SCHEMA_CHARS)}${schema.content.length > MAX_SCHEMA_CHARS ? "\n…(truncado)" : ""}`);
    }

    // Top-level docs/
    const docsListing = await listDir(owner, repo, "docs", oauthToken);
    if (docsListing.length > 0) {
      const priorityNames = ["ARCHITECTURE.md", "ROADMAP.md", "VISION.md", "DESIGN.md", "OVERVIEW.md"];
      const priority = docsListing.filter(d => d.type === "file" && priorityNames.some(n => d.name.toLowerCase() === n.toLowerCase()));
      const others = docsListing.filter(d => d.type === "file" && d.name.endsWith(".md") && !priority.includes(d));
      const picks = [...priority, ...others.sort((a, b) => b.size - a.size)].slice(0, 3);

      for (const doc of picks) {
        const content = await fetchFileContent(owner, repo, doc.path, oauthToken);
        if (content) {
          sections.push(`\n## docs/${doc.name}\n${content.slice(0, MAX_DOC_CHARS)}${content.length > MAX_DOC_CHARS ? "\n…(truncado)" : ""}`);
        }
      }
    }

    // Recent commits — gives a sense of momentum
    try {
      const commitsRes = await fetch(`${GH_API}/repos/${owner}/${repo}/commits?per_page=30`, { headers: ghHeaders(oauthToken) });
      if (commitsRes.ok) {
        const commits = await commitsRes.json() as Array<{ commit: { message: string; author: { date: string } } }>;
        if (Array.isArray(commits) && commits.length > 0) {
          const lines = commits.slice(0, 30).map(c => {
            const msg = (c.commit.message || "").split("\n")[0].slice(0, 100);
            const date = c.commit.author?.date?.slice(0, 10) || "";
            return `- ${date} — ${msg}`;
          });
          sections.push(`\n## Últimos ${lines.length} commits\n${lines.join("\n")}`);
        }
      }
    } catch {/* ignore */}

    const result = sections.join("\n");
    return result.length > MAX_TOTAL_CHARS ? result.slice(0, MAX_TOTAL_CHARS) + "\n…(contexto truncado)" : result;
  } catch (err) {
    log(`fetchRepoContext error for ${owner}/${repo}: ${err}`);
    return null;
  }
}

/**
 * Wrapper for multi-repo projects. Calls fetchRepoContext for each repo and
 * merges the result, prefixed with the repo's label or fullName so Claude can
 * tell them apart. Failures on a single repo don't block the others.
 */
export async function fetchMultiRepoContext(
  repos: Array<{ repoUrl: string; label?: string | null }>,
  oauthToken?: string,
): Promise<string | null> {
  if (repos.length === 0) return null;

  const sections: string[] = [];
  for (const r of repos) {
    const parsed = parseRepoUrl(r.repoUrl);
    const heading = r.label?.trim() || (parsed ? `${parsed.owner}/${parsed.repo}` : r.repoUrl);
    try {
      const ctx = await fetchRepoContext(r.repoUrl, oauthToken);
      if (ctx) {
        sections.push(`# Repositorio: ${heading}\n\n${ctx}`);
      } else {
        sections.push(`# Repositorio: ${heading}\n\n(no fue posible cargar contexto — el repo puede ser privado o no existir)`);
      }
    } catch (err) {
      log(`fetchMultiRepoContext error for ${heading}: ${err}`);
    }
  }

  if (sections.length === 0) return null;
  return sections.join("\n\n---\n\n");
}
