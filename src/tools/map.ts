import { fetchViaProxy, extractLinks, normalizeUrl, isContentLink } from "../utils/index.js";
import type { MapParams } from "./types.js";

/**
 * Map a website to discover all URLs on the site.
 * BFS crawl that only collects links without extracting content.
 * Uses path-diverse queuing: limits URLs per path prefix to ensure
 * the map covers the full site structure, not just one deep section.
 */
export async function novadaMap(params: MapParams, apiKey?: string): Promise<string> {
  const maxUrls = Math.min(params.limit || 50, 100);
  const visited = new Set<string>();
  const discovered = new Set<string>();
  const queue: string[] = [params.url];
  const baseHostname = new URL(params.url).hostname.replace(/^www\./, "");

  // Track how many URLs discovered per top-level path prefix
  // This prevents /locations/* from consuming the entire limit
  const prefixCounts = new Map<string, number>();
  const MAX_PER_PREFIX = Math.max(3, Math.floor(maxUrls / 5));

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
          const linkUrl = new URL(link);
          const linkHostname = linkUrl.hostname.replace(/^www\./, "");
          const isSameDomain = linkHostname === baseHostname;
          const isSubdomain = linkHostname.endsWith(`.${baseHostname}`);

          if ((isSameDomain || (params.include_subdomains && isSubdomain)) && isContentLink(link)) {
            const normalizedLink = normalizeUrl(link);
            if (!discovered.has(normalizedLink) && !visited.has(normalizedLink)) {
              // Path diversity: limit URLs per prefix
              const pathParts = linkUrl.pathname.split("/").filter(Boolean);
              const prefix = pathParts.length > 0 ? `/${pathParts[0]}` : "/";
              const count = prefixCounts.get(prefix) || 0;

              if (count < MAX_PER_PREFIX) {
                prefixCounts.set(prefix, count + 1);
                discovered.add(normalizedLink);
                queue.push(link);
              }
              // If prefix is full, skip this URL but don't stop — other prefixes may have room
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
