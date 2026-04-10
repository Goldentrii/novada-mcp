#!/usr/bin/env node

/**
 * nova CLI — Direct command-line access to Novada web data tools.
 *
 * Usage:
 *   nova search "best AI frameworks 2025"
 *   nova extract https://example.com
 *   nova crawl https://docs.example.com --pages 10
 *   nova map https://example.com --search "api"
 *   nova research "How do AI agents use web scraping?"
 */

import { novadaSearch, novadaExtract, novadaCrawl, novadaResearch, novadaMap } from "./tools/index.js";
import { validateSearchParams, validateExtractParams, validateCrawlParams, validateResearchParams, validateMapParams } from "./tools/index.js";
import { VERSION } from "./config.js";

const API_KEY = process.env.NOVADA_API_KEY;

const HELP = `nova v${VERSION} — Novada web data CLI

Usage:
  nova search <query> [--engine google] [--num 10] [--country us]
  nova extract <url> [--format markdown|text|html]
  nova crawl <url> [--pages 5] [--strategy bfs|dfs]
  nova map <url> [--search <term>] [--limit 50]
  nova research <question> [--depth quick|deep]

Environment:
  NOVADA_API_KEY  Your API key (required). Get one at https://www.novada.com

Examples:
  nova search "best AI agent frameworks 2025"
  nova extract https://example.com --format markdown
  nova crawl https://docs.example.com --pages 10
  nova map https://example.com --search "pricing"
  nova research "How do AI agents use web scraping?" --depth deep
`;

function parseArgs(args: string[]): { positional: string; flags: Record<string, string> } {
  let positional = "";
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else if (!positional) {
      positional = args[i];
    }
  }
  return { positional, flags };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(`nova v${VERSION}`);
    process.exit(0);
  }

  if (!API_KEY) {
    console.error("Error: NOVADA_API_KEY not set. Get your key at https://www.novada.com");
    process.exit(1);
  }

  const { positional, flags } = parseArgs(rest);

  if (!positional) {
    console.error(`Error: ${command} requires an argument. Run 'nova --help' for usage.`);
    process.exit(1);
  }

  try {
    let result: string;

    switch (command) {
      case "search":
        result = await novadaSearch(
          validateSearchParams({
            query: positional,
            engine: flags.engine || "google",
            num: flags.num ? parseInt(flags.num) : 10,
            country: flags.country || "",
            language: flags.language || "",
          }),
          API_KEY
        );
        break;

      case "extract":
        result = await novadaExtract(
          validateExtractParams({
            url: positional,
            format: (flags.format as "markdown" | "text" | "html") || "markdown",
          }),
          API_KEY
        );
        break;

      case "crawl":
        result = await novadaCrawl(
          validateCrawlParams({
            url: positional,
            max_pages: flags.pages ? parseInt(flags.pages) : 5,
            strategy: (flags.strategy as "bfs" | "dfs") || "bfs",
          }),
          API_KEY
        );
        break;

      case "map":
        result = await novadaMap(
          validateMapParams({
            url: positional,
            search: flags.search,
            limit: flags.limit ? parseInt(flags.limit) : 50,
          }),
          API_KEY
        );
        break;

      case "research":
        result = await novadaResearch(
          validateResearchParams({
            question: positional,
            depth: (flags.depth as "quick" | "deep") || "quick",
          }),
          API_KEY
        );
        break;

      default:
        console.error(`Unknown command: ${command}. Run 'nova --help' for usage.`);
        process.exit(1);
    }

    console.log(result);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
