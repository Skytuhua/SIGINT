import { canonicalizeUrl } from "../../../news/engine/dedupe";
import { isBlockedHost } from "../../ssrf";
import { cachedFetch, type UpstreamPolicy } from "../upstream";

export type ArticleSummaryEngine = "openai" | "extractive" | "none";

export type ArticleSummaryUnavailableReason =
  | "unsupported_url"
  | "fetch_failed"
  | "empty_content"
  | "invalid_url"
  | "low_relevance";

export interface ArticleSummaryResult {
  summary: string | null;
  engine: ArticleSummaryEngine;
  degraded: boolean;
  cacheHit: "fresh" | "stale" | "miss";
  latencyMs: number;
  sourceUrl: string;
  model?: string;
  unavailableReason?: ArticleSummaryUnavailableReason;
  error?: string;
}

interface ArticleSummaryPayload {
  summary: string | null;
  engine: ArticleSummaryEngine;
  sourceUrl: string;
  model?: string;
  unavailableReason?: ArticleSummaryUnavailableReason;
  error?: string;
  degraded?: boolean;
}

export interface GetArticleSummaryParams {
  url: string;
  headline?: string;
  source?: string;
  backend?: string;
}

const SUMMARY_POLICY: UpstreamPolicy = {
  key: "news-article-summary",
  ttlMs: 20 * 60_000,
  staleTtlMs: 2 * 60 * 60_000,
  timeoutMs: 18_000,
  maxRetries: 1,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 90_000,
  rateLimit: { capacity: 3, refillPerSec: 2, minIntervalMs: 200 },
};

const OPENAI_SUMMARY_URL = "https://api.openai.com/v1/chat/completions";
const SUMMARY_FORMAT_VERSION = "single-paragraph-v2";
const MAX_HTML_CHARS = 2_500_000;
const MAX_SOURCE_WORDS = 1_800;
const MIN_SOURCE_WORDS = 55;
const MIN_OPENAI_SOURCE_WORDS = 120;
const SUMMARY_MIN_WORDS = 90;
const SUMMARY_MAX_WORDS = 130;
const MIN_HEADLINE_OVERLAP_RATIO = 0.16;
const AI_FAST_PATH_BUDGET_MS = 2_200;
const EXTRACTED_TEXT_CACHE_MAX = 160;
const EXTRACTED_TEXT_CACHE = new Map<string, string>();

const UNSUPPORTED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "twitch.tv",
];

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const BOILERPLATE_HINTS = [
  "subscribe",
  "sign up",
  "cookie",
  "all rights reserved",
  "privacy policy",
  "terms of use",
  "advertisement",
  "ad choices",
  "newsletter",
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from",
  "has", "have", "he", "her", "hers", "him", "his", "if", "in", "into", "is", "it", "its",
  "itself", "of", "on", "or", "our", "ours", "she", "that", "the", "their", "theirs", "them",
  "themselves", "there", "these", "they", "this", "those", "to", "too", "was", "we", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "you", "your", "yours",
]);

function toUnavailable(
  sourceUrl: string,
  unavailableReason: ArticleSummaryUnavailableReason,
  extras: Partial<Omit<ArticleSummaryPayload, "engine" | "sourceUrl" | "unavailableReason" | "summary">> = {}
): ArticleSummaryPayload {
  return {
    summary: null,
    engine: "none",
    sourceUrl,
    unavailableReason,
    model: extras.model,
    error: extras.error,
    degraded: extras.degraded,
  };
}

function toResult(
  payload: ArticleSummaryPayload,
  meta: { degraded: boolean; cacheHit: "fresh" | "stale" | "miss"; latencyMs: number; error?: string }
): ArticleSummaryResult {
  return {
    summary: payload.summary,
    engine: payload.engine,
    degraded: meta.degraded || Boolean(payload.degraded),
    cacheHit: meta.cacheHit,
    latencyMs: Math.round(meta.latencyMs),
    sourceUrl: payload.sourceUrl,
    model: payload.model,
    unavailableReason: payload.unavailableReason,
    error: payload.error ?? meta.error,
  };
}

function getCachedExtractedText(cacheKey: string): string | null {
  const cached = EXTRACTED_TEXT_CACHE.get(cacheKey);
  return typeof cached === "string" ? cached : null;
}

function putExtractedTextCache(cacheKey: string, value: string): void {
  if (EXTRACTED_TEXT_CACHE.size >= EXTRACTED_TEXT_CACHE_MAX) {
    const oldestKey = EXTRACTED_TEXT_CACHE.keys().next().value;
    if (oldestKey) EXTRACTED_TEXT_CACHE.delete(oldestKey);
  }
  EXTRACTED_TEXT_CACHE.set(cacheKey, value);
}

function normalizeSpaces(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string): number {
  if (!value) return 0;
  return value.trim().split(/\s+/g).filter(Boolean).length;
}

function clipWords(value: string, maxWords: number): string {
  if (!value) return value;
  const words = value.trim().split(/\s+/g);
  if (words.length <= maxWords) return value.trim();
  const clipped = words.slice(0, maxWords).join(" ").trim();
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCharCode(code) : " ";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : " ";
    })
    .replace(/&([a-zA-Z]+);/g, (token, named) => ENTITY_MAP[named.toLowerCase()] ?? token);
}

function sanitizeHtml(html: string): string {
  let value = html;
  value = value.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "iframe", "form", "nav", "footer", "header", "aside", "button"]) {
    value = value.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  return value;
}

function htmlToText(html: string): string {
  return normalizeSpaces(
    decodeEntities(
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function safeJsonParse(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectJsonLdBodies(node: unknown, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdBodies(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const rawType = record["@type"];
  const typeValues = Array.isArray(rawType) ? rawType : rawType != null ? [rawType] : [];
  const hasArticleType = typeValues.some((value) => String(value).toLowerCase().includes("article"));
  const body = record.articleBody;
  if (typeof body === "string") {
    const text = normalizeSpaces(decodeEntities(body));
    if (text && (hasArticleType || countWords(text) >= 80)) {
      out.push(text);
    }
  }
  for (const value of Object.values(record)) {
    collectJsonLdBodies(value, out);
  }
}

function extractFromJsonLd(html: string): string {
  const bodies: string[] = [];
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = scriptRegex.exec(html);
  while (match) {
    const parsed = safeJsonParse(match[1] ?? "");
    collectJsonLdBodies(parsed, bodies);
    match = scriptRegex.exec(html);
  }
  return bodies.sort((a, b) => countWords(b) - countWords(a))[0] ?? "";
}

function extractFromTag(html: string, tag: "article" | "main"): string {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let best = "";
  let bestWords = 0;
  let match: RegExpExecArray | null = regex.exec(html);
  while (match) {
    const text = htmlToText(match[1] ?? "");
    const words = countWords(text);
    if (words > bestWords) {
      bestWords = words;
      best = text;
    }
    match = regex.exec(html);
  }
  return best;
}

function extractFromDenseContainers(html: string): string {
  const regex = /<(section|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let best = "";
  let bestScore = 0;
  let scanned = 0;
  let match: RegExpExecArray | null = regex.exec(html);
  while (match && scanned < 320) {
    scanned += 1;
    const attrs = (match[2] ?? "").toLowerCase();
    if (!/(article|content|story|post|entry|body|main|text)/.test(attrs)) {
      match = regex.exec(html);
      continue;
    }
    const raw = match[3] ?? "";
    const text = htmlToText(raw);
    const words = countWords(text);
    if (words < 90) {
      match = regex.exec(html);
      continue;
    }
    const paragraphCount = (raw.match(/<p\b/gi) ?? []).length;
    const linkCount = (raw.match(/<a\b/gi) ?? []).length;
    const score = words + paragraphCount * 24 - linkCount * 8;
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
    match = regex.exec(html);
  }
  return best;
}

function isBoilerplateParagraph(value: string): boolean {
  const lower = value.toLowerCase();
  if (countWords(lower) < 6) return true;
  return BOILERPLATE_HINTS.some((hint) => lower.includes(hint));
}

function extractFromParagraphs(html: string): string {
  const paragraphs: string[] = [];
  const regex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null = regex.exec(html);
  while (match && paragraphs.length < 60) {
    const text = htmlToText(match[1] ?? "");
    if (countWords(text) >= 8 && !isBoilerplateParagraph(text)) {
      paragraphs.push(text);
    }
    match = regex.exec(html);
  }
  return normalizeSpaces(paragraphs.join(" "));
}

function extractArticleText(html: string): string {
  const sanitized = sanitizeHtml(html);

  const fromJsonLd = extractFromJsonLd(sanitized);
  if (countWords(fromJsonLd) >= MIN_SOURCE_WORDS) {
    return clipWords(fromJsonLd, MAX_SOURCE_WORDS);
  }

  const fromArticle = extractFromTag(sanitized, "article");
  if (countWords(fromArticle) >= MIN_SOURCE_WORDS) {
    return clipWords(fromArticle, MAX_SOURCE_WORDS);
  }

  const fromDense = extractFromDenseContainers(sanitized);
  if (countWords(fromDense) >= MIN_SOURCE_WORDS) {
    return clipWords(fromDense, MAX_SOURCE_WORDS);
  }

  const fromMain = extractFromTag(sanitized, "main");
  if (countWords(fromMain) >= MIN_SOURCE_WORDS) {
    return clipWords(fromMain, MAX_SOURCE_WORDS);
  }

  const fromParagraphs = extractFromParagraphs(sanitized);
  if (countWords(fromParagraphs) >= MIN_SOURCE_WORDS) {
    return clipWords(fromParagraphs, MAX_SOURCE_WORDS);
  }

  return clipWords(htmlToText(sanitized), MAX_SOURCE_WORDS);
}

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function headlineOverlapRatio(headline: string, articleText: string): number {
  const headlineTokens = new Set(tokenize(headline));
  if (!headlineTokens.size) return 1;
  const articleTokens = new Set(tokenize(clipWords(articleText, 900)));
  if (!articleTokens.size) return 0;
  let overlap = 0;
  headlineTokens.forEach((token) => {
    if (articleTokens.has(token)) overlap += 1;
  });
  return overlap / headlineTokens.size;
}

function isCodeHeavyContent(value: string): boolean {
  const sample = clipWords(value, 700);
  const words = countWords(sample);
  if (!words) return false;

  const markerMatches = sample.match(
    /#include|printf\(|console\.log|function\s*\(|const\s+\w+\s*=|=>|return\s+|int\s+\w+|uint\d+_t|<\/?[a-z]+[^>]*>/gi
  );
  const markerCount = markerMatches?.length ?? 0;
  const punctuationCount = (sample.match(/[{}()[\];<>_=|]/g) ?? []).length;
  const punctuationDensity = punctuationCount / Math.max(words, 1);

  return markerCount >= 4 || punctuationDensity > 0.28;
}

function passesRelevanceGuard(articleText: string, headline: string): boolean {
  const trimmedHeadline = normalizeSpaces(headline);
  if (!trimmedHeadline) return true;
  const overlap = headlineOverlapRatio(trimmedHeadline, articleText);
  if (overlap >= MIN_HEADLINE_OVERLAP_RATIO) return true;
  if (overlap >= 0.12 && !isCodeHeavyContent(articleText)) return true;
  return false;
}

function splitSentences(text: string): string[] {
  const normalized = normalizeSpaces(text);
  if (!normalized) return [];
  const pieces = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  return pieces
    .map((sentence) => normalizeSpaces(sentence))
    .filter((sentence) => countWords(sentence) >= 6);
}

function tightenSummary(value: string): string {
  const normalized = normalizeSpaces(value.replace(/\n+/g, " "));
  if (!normalized) return normalized;
  const words = normalized.split(/\s+/g);
  if (words.length <= SUMMARY_MAX_WORDS) {
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }
  const clipped = words.slice(0, SUMMARY_MAX_WORDS).join(" ").trim();
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

function buildExtractiveSummary(articleText: string, headline: string): string | null {
  const clippedSource = clipWords(articleText, MAX_SOURCE_WORDS);
  const sentences = splitSentences(clippedSource);
  if (!sentences.length) return null;

  const freq = new Map<string, number>();
  for (const token of tokenize(clippedSource)) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  const maxFreq = Math.max(1, ...Array.from(freq.values()));
  const headlineTokens = new Set(tokenize(headline));

  const scored = sentences.map((sentence, index) => {
    const words = countWords(sentence);
    const tokens = Array.from(new Set(tokenize(sentence)));
    const keywordScore = tokens.reduce((acc, token) => acc + (freq.get(token) ?? 0) / maxFreq, 0);
    const overlap = tokens.reduce((acc, token) => acc + (headlineTokens.has(token) ? 1 : 0), 0);
    const positionBoost = index === 0 ? 1.2 : index < 3 ? 0.7 : index < 6 ? 0.35 : 0;
    const lengthPenalty = words < 8 ? 0.55 : words > 48 ? 0.2 : 0;
    const score = keywordScore * 0.85 + overlap * 2.2 + positionBoost - lengthPenalty;
    return { index, sentence, words, score };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set<number>();
  let totalWords = 0;

  for (const candidate of ranked) {
    if (selected.has(candidate.index)) continue;
    if (candidate.words < 6) continue;
    if (totalWords >= SUMMARY_MIN_WORDS && selected.size >= 2) break;
    if (totalWords + candidate.words > SUMMARY_MAX_WORDS + 8 && selected.size >= 2) continue;
    selected.add(candidate.index);
    totalWords += candidate.words;
    if (selected.size >= 6) break;
  }

  if (!selected.size) {
    selected.add(0);
    totalWords = scored[0]?.words ?? 0;
  }

  if (totalWords < SUMMARY_MIN_WORDS) {
    for (const candidate of scored) {
      if (selected.has(candidate.index)) continue;
      if (totalWords + candidate.words > SUMMARY_MAX_WORDS + 8) continue;
      selected.add(candidate.index);
      totalWords += candidate.words;
      if (totalWords >= SUMMARY_MIN_WORDS) break;
    }
  }

  const ordered = Array.from(selected).sort((a, b) => a - b);
  let summary = ordered.map((index) => sentences[index]).join(" ");
  summary = tightenSummary(summary);

  if (countWords(summary) < 35) {
    const fallback = clipWords(clippedSource, SUMMARY_MAX_WORDS);
    return tightenSummary(fallback);
  }

  return summary;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`fetch-timeout:${timeoutMs}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArticleHtml(url: string): Promise<string> {
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "SIGINT/0.1 (article-summary)",
        Accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.5",
      },
    },
    8_000
  );

  if (!response.ok) {
    throw new Error(`fetch-status:${response.status}`);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`fetch-non-html:${contentType}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error("fetch-empty-body");
  }

  return text.length > MAX_HTML_CHARS ? text.slice(0, MAX_HTML_CHARS) : text;
}

async function getExtractedArticleText(cacheKey: string, url: string): Promise<string> {
  const cached = getCachedExtractedText(cacheKey);
  if (cached != null) return cached;

  const html = await fetchArticleHtml(url);
  const extracted = extractArticleText(html);
  putExtractedTextCache(cacheKey, extracted);
  return extracted;
}

function sanitizeAiSummary(value: string): string {
  const singleLine = normalizeSpaces(value.replace(/\n+/g, " "));
  return tightenSummary(singleLine);
}

async function summarizeWithOpenAI(
  articleText: string,
  headline: string,
  timeoutMs = 9_000
): Promise<{ summary: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("openai-key-missing");
  }

  const model = process.env.OPENAI_SUMMARY_MODEL?.trim() || "gpt-4o-mini";
  const clippedText = clipWords(articleText, 900);

  const response = await fetchWithTimeout(
    OPENAI_SUMMARY_URL,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You summarize news articles in one neutral paragraph between 90 and 130 words. Do not use bullets. Do not mention uncertainty unless explicit in source text.",
          },
          {
            role: "user",
            content: `Headline: ${headline || "N/A"}\n\nArticle text:\n${clippedText}`,
          },
        ],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`openai-status:${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error("openai-empty");
  }
  const summary = sanitizeAiSummary(content);
  if (countWords(summary) < SUMMARY_MIN_WORDS) {
    throw new Error("openai-summary-too-short");
  }
  return { summary, model };
}

function parseAndValidateUrl(raw: string): { parsed: URL; canonicalUrl: string } | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;
    const canonicalUrl = canonicalizeUrl(parsed.toString());
    return {
      parsed,
      canonicalUrl,
    };
  } catch {
    return null;
  }
}

function normalizeBackend(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function getArticleSummary(params: GetArticleSummaryParams): Promise<ArticleSummaryResult> {
  const parsedInput = parseAndValidateUrl(params.url);
  const sourceUrl = parsedInput?.canonicalUrl ?? params.url;
  if (!parsedInput) {
    return toResult(
      toUnavailable(sourceUrl, "invalid_url"),
      { degraded: false, cacheHit: "miss", latencyMs: 0 }
    );
  }

  const hostname = parsedInput.parsed.hostname.toLowerCase().replace(/\.$/, "");
  const backend = normalizeBackend(params.backend);
  if (
    backend === "youtube" ||
    UNSUPPORTED_DOMAINS.some((domain) => domainMatches(hostname, domain))
  ) {
    return toResult(
      toUnavailable(parsedInput.canonicalUrl, "unsupported_url"),
      { degraded: false, cacheHit: "miss", latencyMs: 0 }
    );
  }

  if (await isBlockedHost(hostname)) {
    return toResult(
      toUnavailable(parsedInput.canonicalUrl, "unsupported_url"),
      { degraded: false, cacheHit: "miss", latencyMs: 0 }
    );
  }

  const fallbackValue = toUnavailable(parsedInput.canonicalUrl, "fetch_failed");
  const cacheKey = JSON.stringify({
    url: parsedInput.canonicalUrl,
    format: SUMMARY_FORMAT_VERSION,
  });

  const cached = await cachedFetch<ArticleSummaryPayload>({
    cacheKey,
    policy: SUMMARY_POLICY,
    fallbackValue,
    request: async () => {
      const extractCacheKey = `${parsedInput.canonicalUrl}::${SUMMARY_FORMAT_VERSION}`;
      const extractedText = await getExtractedArticleText(
        extractCacheKey,
        parsedInput.parsed.toString()
      );
      if (countWords(extractedText) < MIN_SOURCE_WORDS) {
        return toUnavailable(parsedInput.canonicalUrl, "empty_content");
      }
      if (!passesRelevanceGuard(extractedText, params.headline ?? "")) {
        return toUnavailable(parsedInput.canonicalUrl, "low_relevance");
      }

      const extractive = buildExtractiveSummary(extractedText, params.headline ?? "");
      if (!extractive) {
        return toUnavailable(parsedInput.canonicalUrl, "empty_content");
      }

      const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
      if (!hasOpenAiKey || countWords(extractedText) < MIN_OPENAI_SOURCE_WORDS) {
        return {
          summary: extractive,
          engine: "extractive",
          sourceUrl: parsedInput.canonicalUrl,
        };
      }

      try {
        const ai = await summarizeWithOpenAI(
          extractedText,
          params.headline ?? "",
          AI_FAST_PATH_BUDGET_MS
        );
        return {
          summary: ai.summary,
          engine: "openai",
          sourceUrl: parsedInput.canonicalUrl,
          model: ai.model,
        };
      } catch (error) {
        return {
          summary: extractive,
          engine: "extractive",
          sourceUrl: parsedInput.canonicalUrl,
          degraded: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  return toResult(cached.data, {
    degraded: cached.degraded,
    cacheHit: cached.cacheHit,
    latencyMs: cached.latencyMs,
    error: cached.error,
  });
}
