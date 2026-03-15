import { log } from "./index";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  description: string;
  pubDate: Date;
}

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
  { url: "https://www.technologyreview.com/feed/", source: "MIT Technology Review" },
  { url: "https://hnrss.org/best?count=15&q=AI+OR+automation+OR+LLM", source: "Hacker News" },
];

function extractItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      || block.match(/<title>(.*?)<\/title>/)?.[1]
      || "";

    const link = block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
      || block.match(/<link>(.*?)<\/link>/)?.[1]
      || "";

    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s)?.[1]
      || block.match(/<description>(.*?)<\/description>/s)?.[1]
      || "";

    const pubDateStr = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

    if (title && link) {
      // Strip HTML tags from description
      const cleanDesc = desc.replace(/<[^>]+>/g, "").trim().substring(0, 300);
      items.push({ title: title.trim(), link: link.trim(), source, description: cleanDesc, pubDate });
    }
  }

  return items;
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "IM3Systems-Newsletter/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      log(`RSS feed ${source} returned ${res.status}`);
      return [];
    }

    const xml = await res.text();
    return extractItems(xml, source);
  } catch (err: any) {
    log(`Error fetching RSS from ${source}: ${err?.message || err}`);
    return [];
  }
}

export async function fetchTechNews(): Promise<NewsItem[]> {
  // Fetch all feeds in parallel
  const results = await Promise.all(
    RSS_FEEDS.map(f => fetchFeed(f.url, f.source))
  );

  const allItems = results.flat();

  // Filter to last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = allItems.filter(item => item.pubDate >= sevenDaysAgo);

  // Sort by date (newest first)
  recent.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  // Deduplicate by similar titles (lowercase, first 40 chars)
  const seen = new Set<string>();
  const unique = recent.filter(item => {
    const key = item.title.toLowerCase().substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  log(`News scraper: ${allItems.length} total → ${recent.length} recent → ${unique.length} unique headlines`);

  // Return top 15
  return unique.slice(0, 15);
}
