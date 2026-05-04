import { DEFAULT_WANTED_URL } from '../../search-jobs/search-plan.js';
import { WantedApiBlockedError, WantedDetailClient, WantedSearchClient } from './client.js';
import type {
  WantedDetailResponse,
  WantedNamedQuery,
  WantedSearchResponse,
  WantedWdlistSeed,
} from './types.js';
import { parseWantedWdlistUrl } from './url.js';

export interface WantedSearchClientLike {
  searchQuery(query: string, options: { readonly limit: number; readonly offset: number }): Promise<WantedSearchResponse>;
  searchWdlist(seed: WantedWdlistSeed, options: { readonly limit: number; readonly offset: number }): Promise<WantedSearchResponse>;
}

export interface WantedDetailClientLike {
  getDetail(id: number): Promise<WantedDetailResponse>;
}

export interface WantedCollectorDeps {
  readonly searchClient?: WantedSearchClientLike;
  readonly detailClient?: WantedDetailClientLike;
}

export interface CollectedWantedDetail {
  readonly id: number;
  readonly key: string;
  readonly seedKeys: readonly string[];
  readonly detail: WantedDetailResponse;
}

export interface WantedCollectionFailure {
  readonly key: string;
  readonly kind: 'blocked' | 'failed';
  readonly message: string;
}

export interface WantedDetailFailure extends WantedCollectionFailure {
  readonly id: number;
}

export interface WantedCollectionResult {
  readonly status: 'ok' | 'partial' | 'blocked' | 'failed';
  readonly details: readonly CollectedWantedDetail[];
  readonly seedFailures: readonly WantedCollectionFailure[];
  readonly detailFailures: readonly WantedDetailFailure[];
  readonly listCandidateTotal?: number;
  readonly wantedNavigationPages?: number;
}

type Seed =
  | { readonly kind: 'url'; readonly key: string; readonly value: WantedWdlistSeed }
  | { readonly kind: 'query'; readonly key: string; readonly value: string };

interface Candidate {
  readonly id: number;
  readonly key: string;
  readonly seedKeys: string[];
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failureKind(error: unknown): WantedCollectionFailure['kind'] {
  return error instanceof WantedApiBlockedError ? 'blocked' : 'failed';
}

function buildSeeds(query: WantedNamedQuery): Seed[] {
  const urlSeeds = query.urlSeeds.length > 0 ? query.urlSeeds : [parseWantedWdlistUrl(DEFAULT_WANTED_URL)];
  return [
    ...urlSeeds.map((seed) => ({
      kind: 'url' as const,
      key: `url:${seed.categoryId}/${seed.subcategoryId}`,
      value: seed,
    })),
    ...query.apiQueries.map((apiQuery) => ({
      kind: 'query' as const,
      key: `query:${apiQuery}`,
      value: apiQuery,
    })),
  ];
}

function rememberCandidate(candidates: Candidate[], candidateById: Map<number, Candidate>, id: number, seedKey: string): void {
  const existing = candidateById.get(id);
  if (existing) {
    if (!existing.seedKeys.includes(seedKey)) existing.seedKeys.push(seedKey);
    return;
  }

  const candidate = { id, key: `wanted:${id}`, seedKeys: [seedKey] };
  candidateById.set(id, candidate);
  candidates.push(candidate);
}

function nextOffsetFrom(link: string, fallback: number): number {
  try {
    const value = new URL(link, 'https://www.wanted.co.kr').searchParams.get('offset');
    if (value && /^(0|[1-9]\d*)$/.test(value)) {
      const offset = Number(value);
      if (Number.isSafeInteger(offset)) return offset;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function collectSeedCandidates(
  seed: Seed,
  query: WantedNamedQuery,
  searchClient: WantedSearchClientLike,
  candidates: Candidate[],
  candidateById: Map<number, Candidate>,
): Promise<number> {
  let pages = 0;
  let offset = 0;

  for (;;) {
    const response =
      seed.kind === 'url'
        ? await searchClient.searchWdlist(seed.value, { limit: query.pageSize, offset })
        : await searchClient.searchQuery(seed.value, { limit: query.pageSize, offset });
    const page = response.data ?? [];
    pages += 1;

    if (page.length === 0) return pages;

    for (const position of page) {
      rememberCandidate(candidates, candidateById, position.id, seed.key);
    }

    if (seed.kind === 'url') {
      if (!response.links?.next) return pages;
      offset = nextOffsetFrom(response.links.next, offset + query.pageSize);
      continue;
    }

    const totalCount = response.total_count;
    if (typeof totalCount === 'number' && offset + page.length >= totalCount) return pages;
    offset += query.pageSize;
  }
}

function resultStatus(
  details: readonly CollectedWantedDetail[],
  seedFailures: readonly WantedCollectionFailure[],
  detailFailures: readonly WantedDetailFailure[],
): WantedCollectionResult['status'] {
  if (details.length > 0) {
    return seedFailures.length > 0 || detailFailures.length > 0 ? 'partial' : 'ok';
  }

  const failures = [...seedFailures, ...detailFailures];
  if (failures.some((failure) => failure.kind === 'blocked')) return 'blocked';
  if (failures.length > 0) return 'failed';
  return 'ok';
}

export async function collectWantedDetails(
  query: WantedNamedQuery,
  deps: WantedCollectorDeps = {},
): Promise<WantedCollectionResult> {
  const searchClient = deps.searchClient ?? new WantedSearchClient();
  const detailClient = deps.detailClient ?? new WantedDetailClient();
  const candidates: Candidate[] = [];
  const candidateById = new Map<number, Candidate>();
  const seedFailures: WantedCollectionFailure[] = [];
  const detailFailures: WantedDetailFailure[] = [];
  let wantedNavigationPages = 0;

  for (const seed of buildSeeds(query)) {
    try {
      const pages = await collectSeedCandidates(seed, query, searchClient, candidates, candidateById);
      if (seed.kind === 'url') wantedNavigationPages += pages;
    } catch (error) {
      seedFailures.push({ key: seed.key, kind: failureKind(error), message: messageFrom(error) });
    }
  }

  const details: CollectedWantedDetail[] = [];
  for (const candidate of candidates.slice(0, query.maxCandidates)) {
    try {
      details.push({
        id: candidate.id,
        key: candidate.key,
        seedKeys: [...candidate.seedKeys],
        detail: await detailClient.getDetail(candidate.id),
      });
    } catch (error) {
      detailFailures.push({
        id: candidate.id,
        key: candidate.key,
        kind: failureKind(error),
        message: messageFrom(error),
      });
    }
  }

  return {
    status: resultStatus(details, seedFailures, detailFailures),
    details,
    seedFailures,
    detailFailures,
    listCandidateTotal: candidates.length,
    wantedNavigationPages,
  };
}
