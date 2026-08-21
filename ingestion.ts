import { load } from "cheerio";
import { env } from "./env";
import { replaceKnowledgeSource } from "./knowledge";

export async function ingestApprovedWebsite(startUrl: string) {
  const rootUrl = new URL(startUrl);
  if (!/^https?:$/.test(rootUrl.protocol)) throw new Error("Approved source URL must use HTTP or HTTPS.");
  const visited = new Set<string>();
  const pending = [normalizeUrl(rootUrl.toString(), rootUrl)];
  let indexed = 0;

  while (pending.length && visited.size < env.maxKnowledgePages) {
    const url = pending.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    let response: Response;
    try {
      response = await fetch(url, { headers: { "User-Agent": "SupportKnowledgeIndexer/1.0" }, signal: AbortSignal.timeout(15000) });
    } catch {
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) continue;
    const html = await response.text();
    const $ = load(html);
    $("script, style, noscript, svg, nav, footer").remove();
    const title = $("title").first().text().trim() || url;
    const text = $("body").text().replace(/\s+/g, " ").trim();
    if (text.length >= 100) {
      const result = await replaceKnowledgeSource({ url, title, text });
      if (result.changed) indexed += 1;
    }
    $("a[href]").each((_index, anchor) => {
      const href = $(anchor).attr("href");
      if (!href) return;
      try {
        const candidate = normalizeUrl(href, rootUrl);
        if (new URL(candidate).hostname === rootUrl.hostname && !visited.has(candidate) && !pending.includes(candidate)) pending.push(candidate);
      } catch {
        // Ignore malformed links, downloads, and non-HTTP navigation targets.
      }
    });
  }
  return { visited: visited.size, indexed };
}

function normalizeUrl(raw: string, rootUrl: URL) {
  const url = new URL(raw, rootUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported URL protocol.");
  url.hash = "";
  url.search = "";
  return url.toString();
}
