// Render del HTML para bots/crawlers del landing, DB-driven.
//
// El sitio es un SPA: los crawlers y los "unfurlers" sociales (WhatsApp,
// LinkedIn) NO ejecutan JS. server/static.ts ya les sirve HTML pre-renderizado;
// este módulo hace que ese HTML (título, meta, OG, JSON-LD y cuerpo) salga del
// CONTENIDO PUBLICADO en el CMS (mergeado sobre los defaults), no de strings
// hardcodeados. Así el SEO y los previews reflejan las ediciones.
//
// Caché en memoria con TTL corto + invalidación al publicar (invalidateCmsBotCache).
// Si algo falla, el caller (static.ts) cae al HTML hardcodeado: nunca rompe el home.

import { db } from "./db";
import { cmsSites, cmsPages } from "@shared/schema";
import { translations, type Language, type Translations } from "@shared/landing-defaults";
import { deepMerge } from "@shared/cms-merge";
import { eq, and, isNull, asc } from "drizzle-orm";

const SITE_URL = "https://www.im3systems.com";
const DEFAULT_OG = `${SITE_URL}/opengraph.jpg`;

type Seo = { metaTitle?: string | null; metaDescription?: string | null; ogImageUrl?: string | null };

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${SITE_URL}${u}`;
  return null;
}

function buildBody(t: Translations): string {
  const sv = t.services;
  const steps = (t.process.steps || []).map((s, i) => `<li><strong>${escapeHtml(s.title)}</strong> — ${escapeHtml(s.text)}</li>`).join("\n");
  const fits = (t.targetAudience.fitsItems || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("\n");
  const reviews = (t.testimonials.reviews || []).map((r) =>
    `<blockquote><p>${escapeHtml(r.quote)}</p><cite>— ${escapeHtml(r.author)}, ${escapeHtml(r.role)}</cite></blockquote>`).join("\n");
  const faqs = (t.faq.items || []).map((f) => `<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`).join("\n");
  const cases = (t.caseStudies.cases || []).map((c) =>
    `<li><strong>${escapeHtml(c.empresa)}</strong> (${escapeHtml(c.industria)}): ${escapeHtml(c.solucion)} → ${escapeHtml(c.resultado)}</li>`).join("\n");

  return `
    <main>
      <article>
        <h1>${escapeHtml(t.hero.headline)}</h1>
        <p>${escapeHtml(t.hero.subheadline)}</p>

        <section>
          <h2>${escapeHtml(sv.title)}</h2>
          <h3>${escapeHtml(sv.internalApps)}</h3><p>${escapeHtml(sv.internalAppsDesc)}</p>
          <h3>${escapeHtml(sv.automation)}</h3><p>${escapeHtml(sv.automationDesc)}</p>
          <h3>${escapeHtml(sv.controlSystems)}</h3><p>${escapeHtml(sv.controlSystemsDesc)}</p>
        </section>

        <section>
          <h2>${escapeHtml(t.process.title)}</h2>
          <ol>${steps}</ol>
        </section>

        <section>
          <h2>${escapeHtml(t.targetAudience.title)}</h2>
          <ul>${fits}</ul>
        </section>

        <section>
          <h2>${escapeHtml(t.testimonials.title)}</h2>
          ${reviews}
        </section>

        <section>
          <h2>${escapeHtml(t.caseStudies.title)}</h2>
          <ul>${cases}</ul>
        </section>

        <section id="faq">
          <h2>${escapeHtml(t.faq.title)}</h2>
          ${faqs}
        </section>

        <section>
          <h2>${escapeHtml(t.contact.title)}</h2>
          <p>Email: info@im3systems.com</p>
          <p><a href="${SITE_URL}/booking">${escapeHtml(t.leadMagnet.cta)}</a></p>
          <p><a href="https://www.linkedin.com/company/im3-systems">LinkedIn</a></p>
        </section>
      </article>
    </main>`;
}

function buildJsonLd(t: Translations, description: string, canonicalUrl: string): string {
  const reviews = (t.testimonials.reviews || []).map((r) => ({
    "@type": "Review",
    reviewBody: r.quote,
    author: { "@type": "Person", name: r.author },
  }));
  const faqEntities = (t.faq.items || []).map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  }));
  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "IM3 Systems",
      url: SITE_URL,
      description,
      sameAs: ["https://www.linkedin.com/company/im3-systems"],
      ...(reviews.length ? { review: reviews } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "IM3 Systems",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    ...(faqEntities.length
      ? [{ "@type": "FAQPage", "@id": `${canonicalUrl}#faq`, mainEntity: faqEntities }]
      : []),
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function wrapHtml(opts: { body: string; title: string; description: string; ogImage: string; canonicalUrl: string; jsonLd: string; lang: Language }): string {
  return `<!DOCTYPE html>
<html lang="${opts.lang}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${opts.canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(opts.title)}">
  <meta property="og:description" content="${escapeHtml(opts.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${opts.canonicalUrl}">
  <meta property="og:image" content="${escapeHtml(opts.ogImage)}">
  <meta property="og:site_name" content="IM3 Systems">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(opts.title)}">
  <meta name="twitter:description" content="${escapeHtml(opts.description)}">
  <meta name="twitter:image" content="${escapeHtml(opts.ogImage)}">
  <script type="application/ld+json">${opts.jsonLd}</script>
</head>
<body>
  ${opts.body}
</body>
</html>`;
}

// Caché en memoria por idioma. TTL corto; se invalida al publicar.
const cache = new Map<string, { html: string; exp: number }>();
const TTL_MS = 60 * 1000;

export function invalidateCmsBotCache(): void {
  cache.clear();
}

/**
 * HTML completo para bots del landing, DB-driven. Lanza si la DB falla
 * (el caller cae al HTML hardcodeado). Cacheado por idioma.
 */
export async function getLandingBotHtml(lang: Language): Promise<string> {
  const cached = cache.get(lang);
  if (cached && cached.exp > Date.now()) return cached.html;
  if (!db) throw new Error("DB not configured");

  const [site] = await db.select().from(cmsSites)
    .where(eq(cmsSites.status, "active"))
    .orderBy(asc(cmsSites.createdAt))
    .limit(1);
  if (!site) throw new Error("No CMS site");

  const [page] = await db.select().from(cmsPages)
    .where(and(eq(cmsPages.siteId, site.id), eq(cmsPages.slug, ""), isNull(cmsPages.deletedAt)))
    .limit(1);
  if (!page) throw new Error("No landing page");

  const published = (page.publishedContent ?? {}) as Record<string, unknown>;
  const overrides = published[lang];
  const merged = deepMerge(translations[lang], overrides) as Translations;

  // SEO: seo[lang] (JSONB) → columnas planas → defaults derivados del contenido
  const seoByLang = ((page.seo ?? {}) as Record<string, Seo>)[lang] ?? {};
  const title =
    seoByLang.metaTitle ||
    page.metaTitle ||
    `${merged.hero.headline} — IM3 Systems`;
  const description =
    seoByLang.metaDescription ||
    page.metaDescription ||
    merged.hero.subheadline;
  const ogImage = absUrl(seoByLang.ogImageUrl || page.ogImageUrl) || DEFAULT_OG;
  const canonicalUrl = `${SITE_URL}/`;

  const html = wrapHtml({
    body: buildBody(merged),
    title,
    description,
    ogImage,
    canonicalUrl,
    jsonLd: buildJsonLd(merged, description, canonicalUrl),
    lang,
  });

  cache.set(lang, { html, exp: Date.now() + TTL_MS });
  return html;
}

/** Idioma para el bot: 'en' si Accept-Language empieza por en, si no 'es'. */
export function pickBotLang(acceptLanguage: string | undefined): Language {
  return /^en\b|,\s*en\b/i.test(acceptLanguage || "") && !/^es/i.test(acceptLanguage || "") ? "en" : "es";
}
