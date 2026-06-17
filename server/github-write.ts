// GitHub write (Fase C agente ingeniero): crea un branch + commitea archivos +
// abre un Pull Request en el repo PROPIO. Nunca mergea — el admin revisa el diff
// en GitHub y mergea (eso dispara el redeploy). Usa la API REST con fetch (mismo
// patrón que server/github-repo-context.ts; scope `repo` del OAuth ya lo permite).

const GH_API = "https://api.github.com";

export function getRepoSlug(): { owner: string; repo: string } | null {
  const slug = (process.env.IM3_REPO || process.env.GITHUB_REPO || "").trim();
  const m = slug.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function isGithubWriteConfigured(token?: string | null): boolean {
  return !!getRepoSlug() && !!(token || process.env.GITHUB_TOKEN);
}

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "IM3-Systems-CRM",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function gh(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${GH_API}${path}`, { ...init, headers: headers(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${init?.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "fix";
}

export type CodeChangeFile = { path: string; newContent: string };

// Abre un PR con los archivos dados. `oauthToken` = token OAuth del admin (preferido),
// si no, cae a process.env.GITHUB_TOKEN. `stamp` es un sufijo único para el branch
// (pásalo desde el caller, ej. Date.now(), para no colisionar).
export async function openPullRequest(params: {
  files: CodeChangeFile[];
  title: string;
  body: string;
  oauthToken?: string | null;
  stamp: string;
}): Promise<{ url: string; number: number; branch: string }> {
  const slug = getRepoSlug();
  if (!slug) throw new Error("Falta la variable de entorno IM3_REPO (formato owner/repo) para abrir PRs.");
  const token = params.oauthToken || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Falta token de GitHub: conecta GitHub en el admin o define GITHUB_TOKEN con scope repo.");
  if (!params.files.length) throw new Error("No hay archivos en la propuesta de cambio.");
  const { owner, repo } = slug;

  // 1. Branch base (default) + su sha
  const repoInfo = await gh(`/repos/${owner}/${repo}`, token);
  const base: string = repoInfo.default_branch;
  const baseRef = await gh(`/repos/${owner}/${repo}/git/ref/heads/${base}`, token);
  const baseSha: string = baseRef.object.sha;

  // 2. Crear branch nuevo
  const branch = `engineer-im3/${slugify(params.title)}-${params.stamp}`;
  await gh(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });

  // 3. Commitear cada archivo (Contents API: requiere sha si el archivo ya existe)
  for (const f of params.files) {
    let existingSha: string | undefined;
    try {
      const cur = await gh(`/repos/${owner}/${repo}/contents/${f.path}?ref=${base}`, token);
      existingSha = cur.sha;
    } catch {
      existingSha = undefined; // archivo nuevo
    }
    await gh(`/repos/${owner}/${repo}/contents/${f.path}`, token, {
      method: "PUT",
      body: JSON.stringify({
        message: `${params.title}\n\n${params.body}`.slice(0, 2000),
        content: Buffer.from(f.newContent, "utf-8").toString("base64"),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
  }

  // 4. Abrir el PR (nunca se mergea automáticamente)
  const pr = await gh(`/repos/${owner}/${repo}/pulls`, token, {
    method: "POST",
    body: JSON.stringify({ title: params.title, body: params.body, head: branch, base }),
  });

  return { url: pr.html_url, number: pr.number, branch };
}
