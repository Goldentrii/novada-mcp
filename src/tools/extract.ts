import { fetchViaProxy, extractMainContent, extractTitle, extractDescription, extractLinks } from "../utils/index.js";
import type { ExtractParams } from "./types.js";

export async function novadaExtract(params: ExtractParams, apiKey?: string): Promise<string> {
  const response = await fetchViaProxy(params.url, apiKey);
  const html: string = response.data;

  if (typeof html !== "string") {
    throw new Error("Response is not HTML. The URL may return JSON or binary data.");
  }

  const title = extractTitle(html);
  const description = extractDescription(html);

  if (params.format === "html") {
    if (html.length <= 10000) return html;
    // Truncate at a tag boundary to avoid invalid HTML
    const truncated = html.slice(0, 10000);
    const lastTagClose = truncated.lastIndexOf(">");
    return (lastTagClose > 9000 ? truncated.slice(0, lastTagClose + 1) : truncated) +
      "\n<!-- Content truncated at 10,000 characters -->";
  }

  const mainContent = extractMainContent(html);
  const links = extractLinks(html, params.url);

  // Plain text output
  if (params.format === "text") {
    const plainContent = mainContent
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\- /gm, "  * ")
      .replace(/\*\*([^*]+)\*\*/g, "$1");
    const linksText = links.length > 0
      ? `\nLinks:\n${links.map((l) => `  ${l}`).join("\n")}`
      : "";
    return `${title}\n${description ? description + "\n" : ""}\n${plainContent}${linksText}`;
  }

  // Markdown output (default)
  const contentLen = mainContent.length;
  const meta = `[Extracted: ${params.url} | Format: ${params.format || "markdown"} | Content: ${contentLen} chars | Links: ${links.length} | Via: Novada proxy]`;

  return [
    meta,
    `\n# ${title}`,
    description ? `\n> ${description}` : "",
    `\n## Content\n\n${mainContent}`,
    links.length > 0
      ? `\n## Links (${links.length})\n\n${links.map((l) => `- ${l}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
