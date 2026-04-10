#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  novadaSearch,
  novadaExtract,
  novadaCrawl,
  novadaResearch,
  novadaMap,
  validateSearchParams,
  validateExtractParams,
  validateCrawlParams,
  validateResearchParams,
  validateMapParams,
  classifyError,
} from "./tools/index.js";
import { ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  SearchParamsSchema,
  ExtractParamsSchema,
  CrawlParamsSchema,
  ResearchParamsSchema,
  MapParamsSchema,
} from "./tools/types.js";

// ─── Configuration ───────────────────────────────────────────────────────────

import { VERSION } from "./config.js";

const API_KEY = process.env.NOVADA_API_KEY;

/** Convert a Zod schema to MCP-compatible JSON Schema (strips $schema wrapper) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToMcpSchema(schema: any): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  // Remove $schema key that MCP doesn't need
  const { $schema, ...rest } = jsonSchema as Record<string, unknown>;
  return rest;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────
// Descriptions follow the Firecrawl pattern:
//   Best for → Not recommended for → Common mistakes → Usage Example → Returns

const TOOLS = [
  {
    name: "novada_search",
    description: `Search the web via Google, Bing, or 3 other engines. Returns structured results with titles, URLs, and snippets. Routed through proxy infrastructure for anti-bot bypass.

**Best for:** Factual queries, news, current events, finding specific pages. Google recommended for best relevance. Supports geo-targeted results from 195 countries.
**Not recommended for:** Complex questions needing multiple perspectives (use novada_research), reading a specific URL's content (use novada_extract), or discovering all pages on a site (use novada_map).
**Common mistakes:** Using search when you already have the URL (use extract instead), not specifying country/language for localized results.

**Usage Example:**
\`\`\`json
{
  "name": "novada_search",
  "arguments": {
    "query": "best AI agent frameworks 2025",
    "engine": "google",
    "num": 10,
    "country": "us"
  }
}
\`\`\`
**Returns:** Numbered list of results with title, URL, and description snippet.`,
    inputSchema: zodToMcpSchema(SearchParamsSchema),
  },
  {
    name: "novada_extract",
    description: `Extract the main content from any URL. Returns page title, description, body text (markdown/text/html), and discovered links. Routed through proxy infrastructure for anti-bot bypass.

**Best for:** Reading a specific page's content, extracting article text, getting page metadata. Works with most server-rendered pages.
**Not recommended for:** JavaScript-heavy SPAs where content is rendered client-side only, discovering URLs on a site (use novada_map first), or getting structured data in a specific schema.
**Common mistakes:** Trying to extract content from a URL that requires JavaScript rendering (results will be incomplete).

**Usage Example (markdown — default, best for reading):**
\`\`\`json
{
  "name": "novada_extract",
  "arguments": {
    "url": "https://example.com/blog/article",
    "format": "markdown"
  }
}
\`\`\`
**Usage Example (html — for raw structure):**
\`\`\`json
{
  "name": "novada_extract",
  "arguments": {
    "url": "https://example.com",
    "format": "html"
  }
}
\`\`\`
**Returns:** Page title, meta description, main content (in chosen format), and up to 50 links found on the page.`,
    inputSchema: zodToMcpSchema(ExtractParamsSchema),
  },
  {
    name: "novada_crawl",
    description: `Crawl a website starting from a seed URL. Extracts content from multiple same-domain pages concurrently (up to 3 at a time). Returns title and body text for each page.

**Best for:** Extracting content from multiple related pages, building a local knowledge base, competitive analysis.
**Not recommended for:** Single page extraction (use novada_extract), discovering URLs without content (use novada_map — faster), or when token limits are a concern (limit max_pages).
**Common mistakes:** Setting max_pages too high (causes large responses), using crawl to discover URLs (use novada_map first, then extract specific pages).

**Optimal workflow:** Use novada_map to discover URLs → pick the relevant ones → use novada_extract on each.

**Usage Example:**
\`\`\`json
{
  "name": "novada_crawl",
  "arguments": {
    "url": "https://docs.example.com",
    "max_pages": 10,
    "strategy": "bfs"
  }
}
\`\`\`
**Returns:** Crawl report with page count, total words, and extracted content from each page.`,
    inputSchema: zodToMcpSchema(CrawlParamsSchema),
  },
  {
    name: "novada_research",
    description: `Multi-angle web research. Generates 3-6 diverse search queries, executes them in parallel, deduplicates sources, and returns a structured report with citations.

**Best for:** Complex questions needing multiple perspectives, competitive analysis, topic overviews, literature surveys. One tool call replaces 3-6 manual searches.
**Not recommended for:** Simple factual lookups (use novada_search), reading a specific URL (use novada_extract).
**Common mistakes:** Using 'deep' mode for simple questions (wastes API calls), not following up with novada_extract on the most relevant sources.

**Usage Example:**
\`\`\`json
{
  "name": "novada_research",
  "arguments": {
    "question": "How do AI agents use web scraping APIs in production?",
    "depth": "deep"
  }
}
\`\`\`
**Returns:** Research report with search queries used, key findings with URLs and snippets, and a deduplicated source list. Follow up with novada_extract on specific sources for deeper analysis.`,
    inputSchema: zodToMcpSchema(ResearchParamsSchema),
  },
  {
    name: "novada_map",
    description: `Discover all URLs on a website. Fast BFS crawl that collects links without extracting content — much faster than crawl for URL discovery.

**Best for:** Discovering what pages exist on a site before deciding what to scrape, finding specific sections within a large site, locating the correct page when extract returns incomplete results.
**Not recommended for:** When you already know the URL (use novada_extract), when you need page content (use novada_extract or novada_crawl after mapping).
**Common mistakes:** Using novada_crawl to discover URLs (map is much faster since it doesn't extract content).

**IMPORTANT:** If novada_extract returns incomplete content, use novada_map with the 'search' parameter to find the specific page URL containing your target content. This is faster than crawling.

**Usage Example (discover all URLs):**
\`\`\`json
{
  "name": "novada_map",
  "arguments": {
    "url": "https://docs.example.com"
  }
}
\`\`\`
**Usage Example (search for specific content):**
\`\`\`json
{
  "name": "novada_map",
  "arguments": {
    "url": "https://docs.example.com",
    "search": "webhook",
    "limit": 20
  }
}
\`\`\`
**Returns:** Numbered list of discovered URLs, optionally filtered by search term.`,
    inputSchema: zodToMcpSchema(MapParamsSchema),
  },
];

// ─── MCP Server ──────────────────────────────────────────────────────────────

class NovadaMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "novada-mcp", version: VERSION },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: unknown) => {
      console.error("[novada-mcp]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!API_KEY) {
        return {
          content: [{
            type: "text" as const,
            text: "Error: NOVADA_API_KEY is not set. Get your API key at https://www.novada.com and set it as an environment variable.\n\nSetup: claude mcp add novada -e NOVADA_API_KEY=your-key -- npx -y novada-mcp",
          }],
          isError: true,
        };
      }

      try {
        let result: string;

        switch (name) {
          case "novada_search":
            result = await novadaSearch(validateSearchParams(args as Record<string, unknown>), API_KEY);
            break;
          case "novada_extract":
            result = await novadaExtract(validateExtractParams(args as Record<string, unknown>), API_KEY);
            break;
          case "novada_crawl":
            result = await novadaCrawl(validateCrawlParams(args as Record<string, unknown>), API_KEY);
            break;
          case "novada_research":
            result = await novadaResearch(validateResearchParams(args as Record<string, unknown>), API_KEY);
            break;
          case "novada_map":
            result = await novadaMap(validateMapParams(args as Record<string, unknown>), API_KEY);
            break;
          default:
            return {
              content: [{
                type: "text" as const,
                text: `Unknown tool: ${name}. Available: novada_search, novada_extract, novada_crawl, novada_research, novada_map`,
              }],
              isError: true,
            };
        }

        return { content: [{ type: "text" as const, text: result }] };
      } catch (error) {
        // Zod validation errors → clear message for the agent
        if (error instanceof ZodError) {
          const issues = error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n");
          return {
            content: [{
              type: "text" as const,
              text: `Invalid parameters for ${name}:\n${issues}`,
            }],
            isError: true,
          };
        }

        // Classified API/network errors with retry guidance
        const classified = classifyError(error);
        return {
          content: [{
            type: "text" as const,
            text: `Error [${classified.code}]: ${classified.message}${classified.retryable ? "\n(This error is retryable)" : ""}${classified.docsUrl ? `\nDocs: ${classified.docsUrl}` : ""}`,
          }],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Novada MCP server v${VERSION} running on stdio`);
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);

if (cliArgs.includes("--list-tools")) {
  for (const tool of TOOLS) {
    const firstLine = tool.description.trim().split("\n")[0];
    console.log(`  ${tool.name} — ${firstLine}`);
  }
  process.exit(0);
}

if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
  console.log(`novada-mcp v${VERSION} — MCP Server for Novada web data API

Usage:
  npx novada-mcp              Start the MCP server (stdio transport)
  npx novada-mcp --list-tools Show available tools
  npx novada-mcp --help       Show this help

Environment:
  NOVADA_API_KEY  Your Novada API key (required)
                  Get one at https://www.novada.com

Connect to Claude Code:
  claude mcp add novada -e NOVADA_API_KEY=your_key -- npx -y novada-mcp

Tools:
  novada_search    Search the web via Google, Bing, and 3 more engines
  novada_extract   Extract content from any URL (via proxy)
  novada_crawl     Crawl a website (BFS/DFS, up to 20 pages)
  novada_research  Multi-step web research with synthesis
  novada_map       Discover all URLs on a website (fast)
`);
  process.exit(0);
}

const server = new NovadaMCPServer();
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
