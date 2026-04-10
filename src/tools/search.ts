import { fetchWithRetry, USER_AGENT, cleanParams } from "../utils/index.js";
import { SCRAPER_API_BASE } from "../config.js";
import type { SearchParams, NovadaApiResponse, NovadaSearchResult } from "./types.js";

export async function novadaSearch(params: SearchParams, apiKey: string): Promise<string> {
  const engine = params.engine || "google";

  // Build params, then clean empty values before sending
  const rawParams: Record<string, string> = {
    q: params.query,
    api_key: apiKey,
    engine,
    num: String(params.num || 10),
    country: params.country || "",
    language: params.language || "",
  };

  // Bing: set locale-specific params
  if (engine === "bing") {
    if (!rawParams.country) rawParams.country = "us";
    if (!rawParams.language) rawParams.language = "en";
    rawParams.mkt = `${rawParams.language}-${rawParams.country.toUpperCase()}`;
  }

  // Remove empty strings — don't send blank country/language to API
  const cleaned = cleanParams(rawParams) as Record<string, string>;
  const searchParams = new URLSearchParams(cleaned);

  const response = await fetchWithRetry(
    `${SCRAPER_API_BASE}/search?${searchParams.toString()}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Origin: "https://www.novada.com",
        Referer: "https://www.novada.com/",
      },
    }
  );

  const data: NovadaApiResponse = response.data;

  if (data.code && data.code !== 200 && data.code !== 0) {
    throw new Error(
      `Novada API error (code ${data.code}): ${data.msg || "Unknown error"}`
    );
  }

  const results: NovadaSearchResult[] = data.data?.organic_results || data.organic_results || [];
  if (results.length === 0) {
    return "No results found for this query.";
  }

  // Structured metadata header for agent decision-making
  const meta = `[Results: ${results.length} | Engine: ${engine}${params.country ? ` | Country: ${params.country}` : ""} | Via: Novada proxy]`;

  const formatted = results
    .map((r: NovadaSearchResult, i: number) => {
      let url: string = r.url || r.link || "N/A";
      url = unwrapBingUrl(url);
      return `${i + 1}. **${r.title || "Untitled"}**\n   URL: ${url}\n   ${r.description || r.snippet || "No description"}`;
    })
    .join("\n\n");

  return `${meta}\n\n${formatted}`;
}

/** Unwrap Bing redirect/base64 encoded URLs */
function unwrapBingUrl(url: string): string {
  // Bing redirect wrapper
  if (url.includes("bing.com/ck/a") || url.includes("r.bing.com")) {
    try {
      const u = new URL(url);
      const realUrl = u.searchParams.get("r") || u.searchParams.get("u");
      if (realUrl) {
        const cleaned = realUrl.replace(/^a1/, "");
        try {
          const decoded = Buffer.from(cleaned, "base64").toString("utf8");
          if (decoded.startsWith("http")) return decoded;
        } catch { /* not base64 */ }
        return decodeURIComponent(cleaned);
      }
    } catch { /* keep original */ }
  }
  // Raw base64-encoded URL
  if (!url.startsWith("http") && /^[A-Za-z0-9+/=]+$/.test(url) && url.length > 20) {
    try {
      const decoded = Buffer.from(url, "base64").toString("utf8");
      if (decoded.startsWith("http")) return decoded;
    } catch { /* keep original */ }
  }
  return url;
}
