import { classifyRememberPosting, detectRememberNodeSignals } from '../../remember/filter.js';
import { RememberApiBlockedError, RememberDetailClient, RememberSearchClient } from './client.js';
import type { RememberDetailResponse, RememberSearchResponse } from './types.js';

export interface RememberSearchClientLike {
  searchKeyword(options: { readonly keyword: string; readonly page: number; readonly per: number }): Promise<RememberSearchResponse>;
}

export interface RememberDetailClientLike {
  getDetail(id: number): Promise<RememberDetailResponse>;
}

export interface RememberCollectorDeps {
  readonly searchClient?: RememberSearchClientLike;
  readonly detailClient?: RememberDetailClientLike;
}

export interface RememberQuery {
  readonly key: string;
  readonly keyword: string;
  readonly maxCandidates: number;
  readonly pageSize: number;
  readonly notes: string;
}

export interface CollectedRememberDetail {
  readonly id: number;
  readonly key: string;
  readonly seedKeys: readonly string[];
  readonly detail: RememberDetailResponse;
  readonly signals: readonly string[];
}

export interface RememberCollectionFailure {
  readonly key: string;
  readonly kind: 'blocked' | 'failed';
  readonly message: string;
}

export interface RememberDetailFailure extends RememberCollectionFailure {
  readonly id: number;
}

export interface RememberCollectionResult {
  readonly status: 'ok' | 'partial' | 'blocked' | 'failed';
  readonly details: readonly CollectedRememberDetail[];
  readonly seedFailures: readonly RememberCollectionFailure[];
  readonly detailFailures: readonly RememberDetailFailure[];
  readonly listCandidateTotal: number;
  readonly rememberSearchPages: number;
  readonly detailFilteredOut: number;
}

interface Candidate {
  readonly id: number;
  readonly key: string;
  readonly seedKeys: readonly string[];
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failureKind(error: unknown): RememberCollectionFailure['kind'] {
  return error instanceof RememberApiBlockedError ? 'blocked' : 'failed';
}

function totalPages(response: RememberSearchResponse, currentPage: number): number {
  return response.meta.total_pages ?? response.meta.total_page ?? currentPage;
}

function rememberCandidate(candidates: Candidate[], candidateById: Map<number, Candidate>, id: number, seedKey: string): void {
  if (candidateById.has(id)) return;
  const candidate = { id, key: `remember:${id}`, seedKeys: [seedKey] };
  candidateById.set(id, candidate);
  candidates.push(candidate);
}

async function collectCandidates(
  query: RememberQuery,
  searchClient: RememberSearchClientLike,
  candidates: Candidate[],
  candidateById: Map<number, Candidate>,
): Promise<number> {
  let page = 1;
  let pagesSeen = 0;
  for (;;) {
    const response = await searchClient.searchKeyword({ keyword: query.keyword, page, per: query.pageSize });
    pagesSeen += 1;
    for (const posting of response.data) rememberCandidate(candidates, candidateById, posting.id, `keyword:${query.keyword}`);
    if (response.data.length === 0 || page >= totalPages(response, page)) return pagesSeen;
    page += 1;
  }
}

function resultStatus(
  details: readonly CollectedRememberDetail[],
  seedFailures: readonly RememberCollectionFailure[],
  detailFailures: readonly RememberDetailFailure[],
): RememberCollectionResult['status'] {
  if (details.length > 0) return seedFailures.length > 0 || detailFailures.length > 0 ? 'partial' : 'ok';
  const failures = [...seedFailures, ...detailFailures];
  if (failures.some((failure) => failure.kind === 'blocked')) return 'blocked';
  if (failures.length > 0) return 'failed';
  return 'ok';
}

export async function collectRememberNodeDetails(
  query: RememberQuery,
  deps: RememberCollectorDeps = {},
): Promise<RememberCollectionResult> {
  const searchClient = deps.searchClient ?? new RememberSearchClient();
  const detailClient = deps.detailClient ?? new RememberDetailClient();
  const candidates: Candidate[] = [];
  const candidateById = new Map<number, Candidate>();
  const seedFailures: RememberCollectionFailure[] = [];
  const detailFailures: RememberDetailFailure[] = [];
  let rememberSearchPages = 0;

  try {
    rememberSearchPages = await collectCandidates(query, searchClient, candidates, candidateById);
  } catch (error) {
    seedFailures.push({ key: `keyword:${query.keyword}`, kind: failureKind(error), message: messageFrom(error) });
  }

  const details: CollectedRememberDetail[] = [];
  let detailFilteredOut = 0;
  for (const candidate of candidates.slice(0, query.maxCandidates)) {
    try {
      const detail = await detailClient.getDetail(candidate.id);
      if (classifyRememberPosting(detail.data) !== 'include') {
        detailFilteredOut += 1;
        continue;
      }
      details.push({
        id: candidate.id,
        key: candidate.key,
        seedKeys: candidate.seedKeys,
        detail,
        signals: Array.from(detectRememberNodeSignals(detail.data)),
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
    rememberSearchPages,
    detailFilteredOut,
  };
}
