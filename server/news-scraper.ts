import { log } from "./index";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  description: string;
  pubDate: Date;
}

// ── RSS Feeds (standard XML) ──────────────────────────────────────
const RSS_FEEDS: { url: string; source: string }[] = [
  // Major tech/AI news
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
  { url: "https://www.technologyreview.com/feed/", source: "MIT Technology Review" },
  { url: "https://www.wired.com/feed/tag/ai/latest/rss", source: "Wired" },
  { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
  // Company blogs
  { url: "https://openai.com/blog/rss.xml", source: "OpenAI Blog" },
  { url: "https://blog.google/technology/ai/rss/", source: "Google AI" },
  { url: "https://blogs.microsoft.com/ai/feed/", source: "Microsoft AI" },
  // Hacker News (curated)
  { url: "https://hnrss.org/best?count=15&q=AI+OR+automation+OR+LLM", source: "Hacker News" },
  // Latam / Spanish tech
  { url: "https://www.xataka.com/tag/inteligencia-artificial/feed", source: "Xataka" },
  { url: "https://www.fayerwayer.com/feed/", source: "FayerWayer" },
];

// ── YouTube Channels (Atom feeds, free, no API key) ───────────────
const YOUTUBE_CHANNELS: { channelId: string; source: string }[] = [
  { channelId: "UCbfYPyITQ-7l4upoX8nvctg", source: "Two Minute Papers" },
  { channelId: "UCsBjURrPoezykLs9EqgamOA", source: "Fireship" },
  { channelId: "UCJIfeSCssxSC_Dhc5s7woww", source: "Matt Wolfe AI" },
];

// ── Reddit Subreddits (JSON API, free, no auth) ───────────────────
const REDDIT_SUBS = ["artificial", "MachineLearning", "automation"];

// ── RSS Parser ────────────────────────────────────────────────────
function extractRssItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];

  // Standard RSS <item> tags
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
      || block.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s)?.[1]
      || block.match(/<description>(.*?)<\/description>/s)?.[1] || "";
    const pubDateStr = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

    if (title && link) {
      const cleanDesc = desc.replace(/<[^>]+>/g, "").trim().substring(0, 300);
      items.push({ title: title.trim(), link: link.trim(), source, description: cleanDesc, pubDate });
    }
  }

  // Atom <entry> tags (YouTube, some blogs)
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = block.match(/<title[^>]*>(.*?)<\/title>/)?.[1] || "";
      const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
      const pubDateStr = block.match(/<published>(.*?)<\/published>/)?.[1]
        || block.match(/<updated>(.*?)<\/updated>/)?.[1] || "";
      const desc = block.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]
        || block.match(/<summary[^>]*>(.*?)<\/summary>/s)?.[1] || "";
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

      if (title && link) {
        const cleanDesc = desc.replace(/<[^>]+>/g, "").trim().substring(0, 300);
        items.push({ title: title.trim(), link: link.trim(), source, description: cleanDesc, pubDate });
      }
    }
  }

  return items;
}

// ── Fetch a single RSS/Atom feed ──────────────────────────────────
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
    return extractRssItems(xml, source);
  } catch (err: any) {
    log(`Error fetching RSS from ${source}: ${err?.message || err}`);
    return [];
  }
}

// ── Fetch Reddit top posts (JSON, no auth) ────────────────────────
async function fetchRedditPosts(): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  for (const sub of REDDIT_SUBS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `https://www.reddit.com/r/${sub}/top.json?t=week&limit=8`,
        {
          signal: controller.signal,
          headers: { "User-Agent": "IM3Systems-Newsletter/1.0" },
        }
      );
      clearTimeout(timeout);

      if (!res.ok) continue;

      const json = await res.json() as any;
      const posts = json?.data?.children || [];

      for (const post of posts) {
        const d = post.data;
        if (!d || d.stickied || d.score < 50) continue;

        items.push({
          title: d.title || "",
          link: d.url || `https://www.reddit.com${d.permalink}`,
          source: `Reddit r/${sub}`,
          description: (d.selftext || "").substring(0, 300),
          pubDate: new Date(d.created_utc * 1000),
        });
      }
    } catch (err: any) {
      log(`Error fetching Reddit r/${sub}: ${err?.message || err}`);
    }
  }

  return items;
}

// ── Main: Fetch all sources ───────────────────────────────────────
export async function fetchTechNews(): Promise<NewsItem[]> {
  // Build all YouTube feed URLs
  const youtubeFeedUrls = YOUTUBE_CHANNELS.map(ch => ({
    url: `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`,
    source: ch.source,
  }));

  // Fetch RSS + YouTube + Reddit in parallel
  const [rssResults, youtubeResults, redditResults] = await Promise.all([
    Promise.all(RSS_FEEDS.map(f => fetchFeed(f.url, f.source))),
    Promise.all(youtubeFeedUrls.map(f => fetchFeed(f.url, f.source))),
    fetchRedditPosts(),
  ]);

  const allItems = [...rssResults.flat(), ...youtubeResults.flat(), ...redditResults];

  // Filter to last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = allItems.filter(item => item.pubDate >= sevenDaysAgo);

  // Sort by date (newest first)
  recent.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  // Deduplicate by similar titles (lowercase, first 50 chars)
  const seen = new Set<string>();
  const unique = recent.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rssCount = rssResults.flat().length;
  const ytCount = youtubeResults.flat().length;
  log(`News scraper: ${rssCount} RSS + ${ytCount} YouTube + ${redditResults.length} Reddit → ${recent.length} recent → ${unique.length} unique`);

  // Return top 20 (more variety for Claude to pick from)
  return unique.slice(0, 20);
}
