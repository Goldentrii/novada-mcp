# Changelog

## [0.6.0] - 2026-04-10

### Added
- **novada_map** tool — fast URL discovery via BFS crawl without content extraction. Filter results by search term.
- **Zod validation** — all tool parameters validated with Zod schemas. Clear error messages for invalid inputs.
- **cheerio HTML parsing** — replaced regex-based HTML extraction with cheerio for reliable content extraction from complex pages.
- **Structured error classification** — errors categorized as INVALID_API_KEY, RATE_LIMITED, URL_UNREACHABLE, API_DOWN with retry guidance.
- **Rich tool descriptions** — each tool now includes "Best for", "Not recommended for", "Common mistakes", usage examples, and return descriptions.
- **cleanParams utility** — removes empty values before API calls.
- **extractLinks function** — cheerio-based link extraction with deduplication and relative URL resolution.
- **CHANGELOG.md** and **.env.example** files.
- 51 new tests (117 total, up from 66).
- **Tool function tests** — mocked axios tests for novadaSearch, novadaExtract, novadaResearch covering success, error, and edge case paths.
- **URL scheme validation** — only HTTP/HTTPS URLs accepted. Blocks file://, ftp://, localhost, and RFC 1918 private IP ranges (SSRF protection).
- **Input schemas generated from Zod** — tool inputSchema now auto-generated via zod-to-json-schema, eliminating schema drift.
- **Failure reporting** — research tool now reports failed search count in output.

### Changed
- Tool descriptions rewritten to follow Firecrawl pattern with agent guidance.
- Validation errors now return Zod's structured error messages instead of generic strings.
- HTML content extraction now handles tables, blockquotes, and code blocks correctly.
- Error responses include error code, retry guidance, and documentation URL.
- SIGINT handler for graceful shutdown.
- Proxy fallback now logs a warning when falling back to direct fetch.
- HTML content selector threshold raised from 100 to 200 chars (reduces false matches).
- HTML truncation for `format: "html"` now cuts at tag boundaries instead of mid-tag.
- Relative URL resolution now uses `new URL(href, base)` for all path types.

### Fixed
- **SECURITY**: Upgraded axios to >= 1.15.0 to patch critical SSRF vulnerability (GHSA-3p68-rc4w-qgx5).
- **SECURITY**: API keys stripped from all error messages via `sanitizeMessage()` — prevents credential leaks in error responses.
- **SECURITY**: Proxy 401/403 errors no longer silently swallowed — auth failures are now re-thrown instead of falling back to direct fetch.
- HTML parser no longer fails on deeply nested divs or encoded entities.
- Link extraction now handles relative URLs and protocol-relative URLs (`//`) correctly.
- Table cell content no longer duplicated in markdown output.
- Map tool seed URL now normalized in dedup set (prevents duplicate seed in output).
- Map and crawl tools now filter discovered links through `isContentLink` (skip assets, auth pages).
- cleanParams utility now actually wired into search tool (was previously dead code).

## [0.5.0] - 2026-03-29

### Added
- Initial release with novada_search, novada_extract, novada_crawl, novada_research tools.
- Proxy infrastructure integration (100M+ IPs, 195 countries).
- Multi-engine search (Google, Bing, DuckDuckGo, Yahoo, Yandex).
- BFS/DFS crawling with concurrent page fetching.
- Exponential backoff retry logic.
- 66 unit tests.
