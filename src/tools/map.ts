import { fetchViaProxy, extractLinks, normalizeUrl, isContentLink } from "../utils/index.js";
import type { MapParams } from "./types.js";

/**
 * Map a website to discover all URLs on the site.
 * BFS crawl that only collects links without extracting content.
 * Much faster than crawl — use this to discover pages before scraping.
 */
export async function novadaMap(params: MapParams, apiKey?: string): Promise<string> {
  const maxUrls = Math.min(params.limit || 50, 100);
  const visited = new Set<string>();
  const discovered = new Set<string>();
  const queue: string[] = [params.url];
  const baseHostname = new URL(params.url).hostname.replace(/^www\./, "");

  // Add seed URL (normalized for consistent dedup)
  discovered.add(normalizeUrl(params.url));

  while (queue.length > 0 && discovered.size < maxUrls) {
    const url = queue.shift()!;
    const normalized = normalizeUrl(url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      const response = await fetchViaProxy(url, apiKey, { timeout: 10000 });
      if (typeof response.data !== "string") continue;

      const links = extractLinks(response.data, url);
      for (const link of links) {
        if (discovered.size >= maxUrls) break;
        try {
          const linkHostname = new URL(link).hostname.replace(/^www\./, "");
          const isSameDomain = linkHostname === baseHostname;
          const isSubdomain = linkHostname.endsWith(`.${baseHostname}`);

          if ((isSameDomain || (params.include_subdomains && isSubdomain)) && isContentLink(link)) {
            const normalizedLink = normalizeUrl(link);
            if (!discovered.has(normalizedLink) && !visited.has(normalizedLink)) {
              discovered.add(normalizedLink);
              queue.push(link);
            }
          }
        } catch {
          // Invalid URL, skip
        }
      }
    } catch {
      // Failed to fetch, skip
    }
  }

  const urls = [...discovered];

  // Filter by search term if provided
  let filtered = urls;
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filtered = urls.filter(u => u.toLowerCase().includes(searchLower));
  }

  if (filtered.length === 0) {
    return `No URLs found on ${params.url}${params.search ? ` matching "${params.search}"` : ""}.`;
  }

  return [
    `# Site Map: ${params.url}`,
    `\nURLs discovered: ${filtered.length}${params.search ? ` (filtered by "${params.search}" from ${urls.length} total)` : ""}`,
    `\n## URLs\n`,
    ...filtered.map((u, i) => `${i + 1}. ${u}`),
  ].join("\n");
}
