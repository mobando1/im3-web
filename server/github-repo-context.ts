import { log } from "./index";

const GH_API = "https://api.github.com";
const MAX_README_CHARS = 4000;
const MAX_DOC_CHARS = 1500;
const MAX_TOTAL_CHARS = 8000;

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "IM3-Systems-CRM",
  };
  if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m = cleaned.match(/github\.com[:/]([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function fetchFileContent(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, { headers: ghHeaders() });
    if (!res.ok) return null;
    const data = await res.json() as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

async function listDir(owner: string, repo: string, path: string): Promise<Array<{ name: string; path: string; type: string; size: number }>> {
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, { headers: ghHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchFirstAvailable(owner: string, repo: string, paths: string[]): Promise<{ path: string; content: string } | null> {
  for (const p of paths) {
    const content = await fetchFileContent(owner, repo, p);
    if (content) return { path: p, content };
  }
  return null;
}

/**
 * Reads README, manifest and a few docs from a public/private repo and returns
 * a concatenated text summary suitable to feed Claude as project context.
 * Returns null if the repo is inaccessible or empty — caller should continue
 * with whatever brief it already has.
 */
export async function fetchRepoContext(repoUrl: string): Promise<string | null> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;
  const { owner, repo } = parsed;

  try {
    const meta = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers: ghHeaders() });
    if (!meta.ok) {
      log(`fetchRepoContext: repo not accessible ${owner}/${repo} (${meta.status})`);
      return null;
    }
    const repoMeta = await meta.json() as { description?: string; language?: string; default_branch?: string; stargazers_count?: number; pushed_at?: string };

    const sections: string[] = [];
    sections.push(`Repositorio: ${owner}/${repo}`);
    if (repoMeta.description) sections.push(`Descripción GitHub: ${repoMeta.description}`);
    if (repoMeta.language) sections.push(`Lenguaje principal: ${repoMeta.language}`);
    if (repoMeta.pushed_at) sections.push(`Último push: ${new Date(repoMeta.pushed_at).toISOString().slice(0, 10)}`);

    // README
    const readme = await fetchFirstAvailable(owner, repo, ["README.md", "README.MD", "Readme.md", "readme.md"]);
    if (readme) {
      sections.push(`\n## README\n${readme.content.slice(0, MAX_README_CHARS)}${readme.content.length > MAX_README_CHARS ? "\n…(truncado)" : ""}`);
    }

    // Manifest (stack inference)
    const manifest = await fetchFirstAvailable(owner, repo, ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "composer.json"]);
    if (manifest) {
      sections.push(`\n## Manifest (${manifest.path})\n${manifest.content.slice(0, 1200)}`);
    }

    // Top-level docs/
    const docsListing = await listDir(owner, repo, "docs");
    if (docsListing.length > 0) {
      const priorityNames = ["ARCHITECTURE.md", "ROADMAP.md", "VISION.md", "DESIGN.md", "OVERVIEW.md"];
      const priority = docsListing.filter(d => d.type === "file" && priorityNames.some(n => d.name.toLowerCase() === n.toLowerCase()));
      const others = docsListing.filter(d => d.type === "file" && d.name.endsWith(".md") && !priority.includes(d));
      const picks = [...priority, ...others.sort((a, b) => b.size - a.size)].slice(0, 3);

      for (const doc of picks) {
        const content = await fetchFileContent(owner, repo, doc.path);
        if (content) {
          sections.push(`\n## docs/${doc.name}\n${content.slice(0, MAX_DOC_CHARS)}${content.length > MAX_DOC_CHARS ? "\n…(truncado)" : ""}`);
        }
      }
    }

    // Recent commits — gives a sense of momentum
    try {
      const commitsRes = await fetch(`${GH_API}/repos/${owner}/${repo}/commits?per_page=10`, { headers: ghHeaders() });
      if (commitsRes.ok) {
        const commits = await commitsRes.json() as Array<{ commit: { message: string; author: { date: string } } }>;
        if (Array.isArray(commits) && commits.length > 0) {
          const lines = commits.slice(0, 10).map(c => {
            const msg = (c.commit.message || "").split("\n")[0].slice(0, 100);
            const date = c.commit.author?.date?.slice(0, 10) || "";
            return `- ${date} — ${msg}`;
          });
          sections.push(`\n## Últimos 10 commits\n${lines.join("\n")}`);
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
