import { createHash } from 'node:crypto';
import { SearchJobsRepo, type ObservationInput } from '../db/search-jobs-repo.js';
import {
  collectRememberNodeDetails,
  type RememberCollectionResult,
  type RememberQuery,
} from '../sources/remember/collector.js';
import { normalizeRememberDetail } from '../sources/remember/normalize.js';
import { collectWantedDetails, type WantedCollectionResult } from '../sources/wanted/collector.js';
import { normalizeWantedDetail } from '../sources/wanted/normalize.js';
import type { WantedNamedQuery } from '../sources/wanted/types.js';
import { parseWantedWdlistUrl } from '../sources/wanted/url.js';
import { applyBackendFilter } from './backend-filter.js';
import { writeSearchMarkdown, type MarkdownFailure } from './markdown.js';
import { loadWantedQueryConfig, resolveWantedQuery } from './query-config.js';
import { DEFAULT_QUERY_KEY, DEFAULT_REMEMBER_KEYWORD, DEFAULT_REMEMBER_QUERY_KEY } from './search-plan.js';
import type { CanonicalJobListing, RunStatus, SearchPlan, SearchRunCounts } from './types.js';

export interface SearchJobsRunResult {
  readonly runId: string;
  readonly status: RunStatus;
  readonly markdownPath: string;
  readonly counts: SearchRunCounts;
  readonly errorReason: string | null;
}

export interface SearchJobsRunDeps {
  readonly now?: () => Date;
  readonly runId?: string;
  readonly query?: WantedNamedQuery | RememberQuery;
  readonly collection?:
    | WantedCollectionResult
    | RememberCollectionResult
    | (() => Promise<WantedCollectionResult | RememberCollectionResult>);
}

interface RunFailure {
  readonly stage: 'search' | 'detail' | 'pipeline';
  readonly key: string;
  readonly message: string;
}

let generatedRunIdCounter = 0;

function defaultRunId(now: Date): string {
  generatedRunIdCounter += 1;
  const timestamp = now.toISOString().replace(/\D/g, '').slice(0, 17);
  return `run-${timestamp}-${process.pid}-${generatedRunIdCounter.toString(36)}`;
}

function wantedUrlFromPlan(plan: SearchPlan): string | null {
  return plan.wantedUrl ?? null;
}

function queryKeyFromPlan(plan: SearchPlan, query: WantedNamedQuery | RememberQuery): string {
  return plan.queryKey ?? query.key;
}

function resolveQuery(plan: SearchPlan, injectedQuery: WantedNamedQuery | RememberQuery | undefined): WantedNamedQuery | RememberQuery {
  if (injectedQuery) return injectedQuery;

  if (plan.source === 'remember') {
    return {
      key: plan.queryKey ?? DEFAULT_REMEMBER_QUERY_KEY,
      keyword: DEFAULT_REMEMBER_KEYWORD,
      maxCandidates: 500,
      pageSize: 30,
      notes: 'Remember backend keyword search followed by detail Node/Nest/TypeScript filtering.',
    };
  }

  if (plan.wantedUrl) {
    return {
      key: 'url_override',
      profile: plan.profile,
      years: plan.years,
      maxCandidates: 300,
      pageSize: 100,
      urlSeeds: [parseWantedWdlistUrl(plan.wantedUrl)],
      apiQueries: [],
      notes: 'Ad hoc Wanted wdlist URL override.',
    };
  }

  const config = loadWantedQueryConfig();
  return resolveWantedQuery(config, plan.queryKey ?? DEFAULT_QUERY_KEY);
}

async function resolveCollection(
  plan: SearchPlan,
  query: WantedNamedQuery | RememberQuery,
  injectedCollection: SearchJobsRunDeps['collection'],
): Promise<WantedCollectionResult | RememberCollectionResult> {
  if (typeof injectedCollection === 'function') return injectedCollection();
  if (injectedCollection) return injectedCollection;
  if (plan.source === 'remember') return collectRememberNodeDetails(query as RememberQuery);
  return collectWantedDetails(query as WantedNamedQuery);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusFromCollection(
  collection: WantedCollectionResult | RememberCollectionResult,
  keptListings: readonly CanonicalJobListing[],
): RunStatus {
  if (collection.status === 'blocked') return 'blocked';
  if (collection.status === 'failed') return 'failed';
  if (keptListings.length === 0) return 'completed_empty';
  if (collection.status === 'partial' || collection.seedFailures.length > 0 || collection.detailFailures.length > 0) {
    return 'partial';
  }
  return 'completed';
}

function failuresFromCollection(collection: WantedCollectionResult | RememberCollectionResult): RunFailure[] {
  return [
    ...collection.seedFailures.map((failure) => ({
      stage: 'search' as const,
      key: failure.key,
      message: failure.message,
    })),
    ...collection.detailFailures.map((failure) => ({
      stage: 'detail' as const,
      key: failure.key,
      message: failure.message,
    })),
  ];
}

function markdownFailures(failures: readonly RunFailure[]): MarkdownFailure[] {
  return failures.map((failure) => ({
    stage: failure.stage,
    message: `${failure.key}: ${failure.message}`,
  }));
}

function errorReason(failures: readonly RunFailure[]): string | null {
  if (failures.length === 0) return null;
  return failures.map((failure) => `${failure.stage}:${failure.key}:${failure.message}`).join('\n');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function contentHash(listing: CanonicalJobListing): string {
  return createHash('sha256')
    .update(
      stableJson({
        sourceMarker: listing.sourceMarker,
        sourceJobId: listing.sourceJobId,
        title: listing.title,
        company: listing.company,
        location: listing.location,
        experienceText: listing.experienceText,
        requiredSkills: listing.requiredSkills,
        deadlineDate: listing.deadlineDate,
      }),
    )
    .digest('hex');
}

function buildCounts(
  query: WantedNamedQuery | RememberQuery,
  collection: WantedCollectionResult | RememberCollectionResult,
  normalized: readonly CanonicalJobListing[],
  filtered: readonly ReturnType<typeof applyBackendFilter>[],
  keptListings: readonly CanonicalJobListing[],
): SearchRunCounts {
  return {
    searchSeedTotal: 'urlSeeds' in query ? query.urlSeeds.length + query.apiQueries.length : 1,
    searchSeedFailed: collection.seedFailures.length,
    listCandidateTotal: collection.listCandidateTotal ?? collection.details.length + collection.detailFailures.length,
    wantedNavigationPages: collection && 'wantedNavigationPages' in collection ? (collection.wantedNavigationPages ?? 0) : 0,
    candidateTotal:
      'detailFilteredOut' in collection
        ? collection.listCandidateTotal
        : collection.details.length + collection.detailFailures.length,
    detailTotal: 'detailFilteredOut' in collection ? collection.details.length + collection.detailFilteredOut : collection.details.length,
    detailFailed: collection.detailFailures.length,
    normalizedTotal: normalized.length,
    filteredIn: keptListings.length,
    filteredOut:
      'detailFilteredOut' in collection ? collection.detailFilteredOut : filtered.length - keptListings.length,
  };
}

function buildFailedCounts(
  query: WantedNamedQuery | RememberQuery,
  collection: WantedCollectionResult | RememberCollectionResult | undefined,
  normalizedTotal: number,
  filteredTotal: number,
  filteredIn: number,
): SearchRunCounts {
  return {
    searchSeedTotal: 'urlSeeds' in query ? query.urlSeeds.length + query.apiQueries.length : 1,
    searchSeedFailed: collection?.seedFailures.length ?? 0,
    listCandidateTotal: collection?.listCandidateTotal ?? 0,
    wantedNavigationPages: collection && 'wantedNavigationPages' in collection ? (collection.wantedNavigationPages ?? 0) : 0,
    candidateTotal: collection ? collection.details.length + collection.detailFailures.length : 0,
    detailTotal: collection?.details.length ?? 0,
    detailFailed: collection?.detailFailures.length ?? 0,
    normalizedTotal,
    filteredIn,
    filteredOut: filteredTotal - filteredIn,
  };
}

function buildObservations(
  runId: string,
  queryKey: string,
  observedAt: string,
  listings: readonly CanonicalJobListing[],
  seedKeysBySourceMarker: ReadonlyMap<string, readonly string[]>,
): ObservationInput[] {
  return listings.map((listing, rowIndex) => ({
    runId,
    sourceMarker: listing.sourceMarker,
    queryKey,
    rowIndex,
    observedAt,
    contentHash: contentHash(listing),
    rawMetadata: {
      seedKeys: seedKeysBySourceMarker.get(listing.sourceMarker) ?? [],
    },
  }));
}

function persistRunResult(input: {
  readonly plan: SearchPlan;
  readonly query: WantedNamedQuery | RememberQuery;
  readonly queryKey: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: RunStatus;
  readonly markdownPath: string | null;
  readonly counts: SearchRunCounts;
  readonly errorReason: string | null;
  readonly listings: readonly CanonicalJobListing[];
  readonly observations: readonly ObservationInput[];
}): void {
  const repo = new SearchJobsRepo(input.plan.dbPath);
  try {
    repo.recordRunResult({
      runId: input.runId,
      source: input.plan.source,
      profile: input.plan.profile,
      queryKey: input.queryKey,
      wantedUrl: wantedUrlFromPlan(input.plan),
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      markdownPath: input.markdownPath,
      counts: { ...input.counts },
      errorReason: input.errorReason,
      metadata: { queryNotes: input.query.notes },
      listings: input.listings,
      observations: input.observations,
    });
  } finally {
    repo.close();
  }
}

function writeRunMarkdown(input: {
  readonly plan: SearchPlan;
  readonly runId: string;
  readonly queryKey: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly counts: SearchRunCounts;
  readonly failures: readonly MarkdownFailure[];
  readonly listings: readonly CanonicalJobListing[];
}): string {
  return writeSearchMarkdown(input.plan.resultsDir, {
    runId: input.runId,
    profile: input.plan.profile,
    source: input.plan.source,
    queryKey: input.queryKey,
    wantedUrl: wantedUrlFromPlan(input.plan),
    status: input.status,
    dbPath: input.plan.dbPath,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    counts: input.counts,
    failures: input.failures,
    listings: input.listings,
  });
}

export async function runSearchJobs(plan: SearchPlan, deps: SearchJobsRunDeps = {}): Promise<SearchJobsRunResult> {
  const startedAtDate = deps.now?.() ?? new Date();
  const startedAt = startedAtDate.toISOString();
  const runId = deps.runId ?? defaultRunId(startedAtDate);
  const query = resolveQuery(plan, deps.query);
  const queryKey = queryKeyFromPlan(plan, query);
  let collection: WantedCollectionResult | RememberCollectionResult | undefined;
  const seedKeysBySourceMarker = new Map<string, readonly string[]>();
  const normalized: CanonicalJobListing[] = [];
  let filtered: ReturnType<typeof applyBackendFilter>[] = [];
  let listings: CanonicalJobListing[] = [];

  try {
    collection = await resolveCollection(plan, query, deps.collection);

    for (const item of collection.details) {
      seedKeysBySourceMarker.set(item.key, item.seedKeys);
      if (plan.source === 'remember') {
        normalized.push(
          normalizeRememberDetail((item as RememberCollectionResult['details'][number]).detail, {
            sourceMarker: item.key,
            seedKeys: item.seedKeys,
            filterReason: `remember node signals: ${(item as RememberCollectionResult['details'][number]).signals.join(', ')}`,
          }),
        );
      } else {
        normalized.push(
          normalizeWantedDetail((item as WantedCollectionResult['details'][number]).detail, {
            sourceMarker: item.key,
            seedKeys: item.seedKeys,
          }),
        );
      }
    }
    if (plan.source === 'remember') {
      filtered = normalized.map((listing) => ({ status: 'pass' as const, listing, reason: listing.backendFilterReason }));
      listings = normalized;
    } else {
      filtered = normalized.map((listing) => applyBackendFilter(listing));
      listings = filtered.filter((result) => result.status === 'pass').map((result) => result.listing);
    }
    const status = statusFromCollection(collection, listings);
    const counts = buildCounts(query, collection, normalized, filtered, listings);
    const failures = failuresFromCollection(collection);
    const runErrorReason = errorReason(failures);
    const finishedAt = (deps.now?.() ?? new Date()).toISOString();

    const markdownPath = writeRunMarkdown({
      plan,
      runId,
      queryKey,
      status,
      startedAt,
      finishedAt,
      counts,
      failures: markdownFailures(failures),
      listings,
    });

    persistRunResult({
      plan,
      query,
      queryKey,
      runId,
      startedAt,
      finishedAt,
      status,
      markdownPath,
      counts,
      errorReason: runErrorReason,
      listings,
      observations: buildObservations(runId, queryKey, finishedAt, listings, seedKeysBySourceMarker),
    });

    return { runId, status, markdownPath, counts, errorReason: runErrorReason };
  } catch (error) {
    const originalErrorReason = messageFrom(error);
    const mergedFailures: RunFailure[] = [
      ...(collection ? failuresFromCollection(collection) : []),
      { stage: 'pipeline', key: 'pipeline', message: originalErrorReason },
    ];
    const mergedErrorReason = errorReason(mergedFailures);
    const status: RunStatus = 'failed';
    const finishedAt = (deps.now?.() ?? new Date()).toISOString();
    const counts = buildFailedCounts(query, collection, normalized.length, filtered.length, listings.length);
    let markdownPath: string | null = null;

    try {
      markdownPath = writeRunMarkdown({
        plan,
        runId,
        queryKey,
        status,
        startedAt,
        finishedAt,
        counts,
        failures: markdownFailures(mergedFailures),
        listings: [],
      });
    } catch {
      markdownPath = null;
    }

    try {
      persistRunResult({
        plan,
        query,
        queryKey,
        runId,
        startedAt,
        finishedAt,
        status,
        markdownPath,
        counts,
        errorReason: mergedErrorReason,
        listings: [],
        observations: [],
      });
    } catch {
      return { runId, status, markdownPath: markdownPath ?? '', counts, errorReason: mergedErrorReason };
    }

    return { runId, status, markdownPath: markdownPath ?? '', counts, errorReason: mergedErrorReason };
  }
}

