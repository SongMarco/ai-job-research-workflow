import type { BrowserPage, BrowserPoolLike } from './browser-pool.js';
import { matchCompanyName, normalizeCompanyName, primaryCompanyNameForSearch } from './company-name.js';

export type JobPlanetCollectionStatus = 'ok' | 'not_found' | 'blocked' | 'failed';
export type JobPlanetMatchConfidence = 'exact' | 'partial';

export interface JobPlanetCompanyInfo {
  readonly name: string;
  readonly normalizedName: string;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly jobplanetUrl: string;
  readonly matchConfidence: JobPlanetMatchConfidence;
}

export type JobPlanetCollectionResult =
  | { readonly status: 'ok'; readonly companyInfo: JobPlanetCompanyInfo }
  | { readonly status: Exclude<JobPlanetCollectionStatus, 'ok'>; readonly reason?: string };

interface SearchCandidate {
  readonly name: string;
  readonly url: string;
  readonly texts: readonly string[];
}

interface JobPlanetCompanyProfileServiceOptions {
  readonly browserPool: Pick<BrowserPoolLike, 'acquirePage' | 'releasePage'>;
  readonly delayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRating(texts: readonly string[]): number | null {
  for (const text of texts) {
    const match = text.match(/(^|[^0-9.])([0-4]\.\d|5\.0)(?![0-9.])/);
    if (match) return Number.parseFloat(match[2]);
  }

  for (const text of texts) {
    const match = text.match(/(^|[^0-9.])([0-4]|5)(?![0-9.])/);
    if (match) return Number.parseFloat(match[2]);
  }

  return null;
}

function parseReviewCount(title: string): number | null {
  const match = title.match(/기업리뷰\s*([\d,]+)건/);
  if (!match) return null;
  return Number.parseInt(match[1].replace(/,/g, ''), 10);
}

function isBlockedStatus(status: number | undefined): boolean {
  return status === 403 || status === 429;
}

class JobPlanetBlockedError extends Error {
  constructor(readonly statusCode: number) {
    super(`JobPlanet blocked request with HTTP ${statusCode}`);
    this.name = 'JobPlanetBlockedError';
  }
}

function pickBestCandidate(normalizedName: string, candidates: readonly SearchCandidate[]): {
  readonly candidate: SearchCandidate;
  readonly matchConfidence: JobPlanetMatchConfidence;
} | null {
  let partialMatch: SearchCandidate | null = null;

  for (const candidate of candidates) {
    const confidence = matchCompanyName(normalizedName, candidate.name);
    if (confidence === 'exact') return { candidate, matchConfidence: 'exact' };
    if (confidence === 'partial' && !partialMatch) partialMatch = candidate;
  }

  return partialMatch ? { candidate: partialMatch, matchConfidence: 'partial' } : null;
}

async function extractSearchCandidates(page: BrowserPage): Promise<readonly SearchCandidate[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('h4.line-clamp-1'));

    return nodes.map((node) => {
      const anchor = node.closest('a');
      const texts = anchor
        ? Array.from(anchor.querySelectorAll('*'))
          .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter((text) => text.length > 0 && text.length < 100)
        : [];

      return {
        name: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        url: anchor instanceof HTMLAnchorElement ? anchor.href : '',
        texts: [...new Set(texts)].slice(0, 15),
      };
    });
  });
}

export class JobPlanetCompanyProfileService {
  private readonly browserPool: Pick<BrowserPoolLike, 'acquirePage' | 'releasePage'>;
  private readonly delayMs: number;

  constructor(options: JobPlanetCompanyProfileServiceOptions) {
    this.browserPool = options.browserPool;
    this.delayMs = options.delayMs ?? 3000;
  }

  async collect(names: readonly string[]): Promise<ReadonlyMap<string, JobPlanetCollectionResult>> {
    const normalizedNames = [...new Set(names.map(normalizeCompanyName).filter(Boolean))];
    const results = new Map<string, JobPlanetCollectionResult>();
    let isFirstRequest = true;

    for (const normalizedName of normalizedNames) {
      if (!isFirstRequest && this.delayMs > 0) await sleep(this.delayMs);

      let page: BrowserPage | undefined;
      try {
        page = await this.browserPool.acquirePage();
        const companyInfo = await this.fetchCompanyInfo(normalizedName, page);
        results.set(normalizedName, companyInfo ? { status: 'ok', companyInfo } : { status: 'not_found' });
      } catch (error) {
        results.set(
          normalizedName,
          error instanceof JobPlanetBlockedError
            ? { status: 'blocked', reason: error.message }
            : { status: 'failed', reason: error instanceof Error ? error.message : String(error) },
        );
      } finally {
        if (page) await this.browserPool.releasePage(page);
      }

      isFirstRequest = false;
    }

    return results;
  }

  private async fetchCompanyInfo(normalizedName: string, page: BrowserPage): Promise<JobPlanetCompanyInfo | null> {
    const searchName = primaryCompanyNameForSearch(normalizedName);
    const searchResponse = await page.goto(
      `https://www.jobplanet.co.kr/search?query=${encodeURIComponent(searchName)}`,
      { waitUntil: 'domcontentloaded', timeout: 15000 },
    );
    if (isBlockedStatus(searchResponse?.status())) {
      throw new JobPlanetBlockedError(searchResponse?.status() ?? 403);
    }

    await page.waitForSelector('h4.line-clamp-1', { timeout: 8000 }).catch(() => undefined);
    const candidates = await extractSearchCandidates(page);
    const bestMatch = pickBestCandidate(searchName, candidates);
    if (!bestMatch) return null;

    const detailResponse = await page.goto(bestMatch.candidate.url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    if (isBlockedStatus(detailResponse?.status())) {
      throw new JobPlanetBlockedError(detailResponse?.status() ?? 403);
    }

    await page.waitForSelector('h1, [class*="company"]', { timeout: 8000 });
    const title = await page.title();

    return {
      name: bestMatch.candidate.name,
      normalizedName,
      rating: parseRating(bestMatch.candidate.texts),
      reviewCount: parseReviewCount(title),
      jobplanetUrl: bestMatch.candidate.url,
      matchConfidence: bestMatch.matchConfidence,
    };
  }
}
