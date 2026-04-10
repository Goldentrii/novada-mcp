import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { SCRAPER_API_BASE } from "../config.js";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** HTTP GET with exponential backoff retry on 429/503/network errors */
export async function fetchWithRetry(
  url: string,
  options: Partial<AxiosRequestConfig> = {},
  retries: number = MAX_RETRIES
): Promise<AxiosResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 30000,
        maxRedirects: 5,
        ...options,
      });
    } catch (error) {
      if (attempt === retries) throw error;
      const isRetryable =
        error instanceof AxiosError &&
        (error.response?.status === 429 ||
          error.response?.status === 503 ||
          !error.response);
      if (!isRetryable) throw error;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url}`);
}

/**
 * Fetch a URL through Novada's proxy infrastructure.
 * Falls back to direct fetch if no API key or proxy fails.
 */
export async function fetchViaProxy(
  url: string,
  apiKey: string | undefined,
  options: Partial<AxiosRequestConfig> = {}
): Promise<AxiosResponse> {
  if (apiKey) {
    try {
      const proxyParams = new URLSearchParams({
        api_key: apiKey,
        url,
        render: "false",
      });
      const response = await fetchWithRetry(
        `${SCRAPER_API_BASE}?${proxyParams.toString()}`,
        {
          headers: {
            "User-Agent": USER_AGENT,
            Origin: "https://www.novada.com",
            Referer: "https://www.novada.com/",
          },
          timeout: 45000,
          ...options,
        }
      );
      return response;
    } catch (error) {
      // Re-throw auth errors — don't mask invalid API keys
      if (
        error instanceof AxiosError &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        throw error;
      }
      // Other proxy errors: fall back to direct fetch with warning
      console.error(`[novada-mcp] Proxy failed for ${url}, falling back to direct fetch`);
    }
  }
  return fetchWithRetry(url, options);
}
