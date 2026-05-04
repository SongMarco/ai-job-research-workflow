import type {
  WantedDetailResponse,
  WantedSearchPosition,
  WantedSearchResponse,
  WantedWdlistSeed,
} from './types.js';

const SEARCH_ENDPOINT = 'https://www.wanted.co.kr/api/chaos/search/v1/position';
const NAVIGATION_ENDPOINT = 'https://www.wanted.co.kr/api/chaos/navigation/v1/results';
const DETAIL_ENDPOINT = 'https://www.wanted.co.kr/api/v4/jobs';
const BLOCKED_STATUSES = new Set([401, 403, 429]);
const BLOCKED_BODY_PATTERNS = ['login', 'authwall', 'cloudflare', 'captcha', 'rate limit', 'access denied'];

export class WantedApiBlockedError extends Error {
  readonly status?: number;

  constructor(message: string);
  constructor(status: number, message: string);
  constructor(statusOrMessage: number | string, message?: string) {
    const resolvedMessage = typeof statusOrMessage === 'number' ? (message ?? String(statusOrMessage)) : statusOrMessage;
    super(resolvedMessage);
    if (typeof statusOrMessage === 'number') {
      this.status = statusOrMessage;
    }
    this.name = 'WantedApiBlockedError';
  }
}

export class WantedApiFailedError extends Error {
  readonly source?: string;

  constructor(message: string, source?: string) {
    super(message);
    this.source = source;
    this.name = 'WantedApiFailedError';
  }
}

export interface WantedPageOptions {
  readonly limit: number;
  readonly offset: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendAll(params: URLSearchParams, name: string, values: readonly (string | number)[]): void {
  for (const value of values) {
    params.append(name, String(value));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSearchPosition(value: unknown): value is WantedSearchPosition {
  return isRecord(value) && typeof value.id === 'number' && Number.isSafeInteger(value.id);
}

function parseSearchResponse(value: unknown): WantedSearchResponse {
  if (!isRecord(value)) {
    throw new WantedApiFailedError('Wanted search response must be an object.');
  }

  const totalCount = value.total_count;
  if (typeof totalCount !== 'number' || !Number.isFinite(totalCount)) {
    throw new WantedApiFailedError('Wanted search response total_count must be a number.');
  }

  const data = value.data;
  if (!Array.isArray(data) || !data.every(isSearchPosition)) {
    throw new WantedApiFailedError('Wanted search response data must contain positions with numeric ids.');
  }

  return value as WantedSearchResponse;
}

function parseNavigationResponse(value: unknown): WantedSearchResponse {
  if (!isRecord(value)) {
    throw new WantedApiFailedError('Wanted navigation response must be an object.');
  }

  const data = value.data;
  if (!Array.isArray(data) || !data.every(isSearchPosition)) {
    throw new WantedApiFailedError('Wanted navigation response data must contain positions with numeric ids.');
  }

  const links = value.links;
  if (
    links !== undefined &&
    (!isRecord(links) || (links.next !== undefined && links.next !== null && typeof links.next !== 'string'))
  ) {
    throw new WantedApiFailedError('Wanted navigation response links.next must be a string when present.');
  }

  return value as WantedSearchResponse;
}

function parseDetailResponse(value: unknown, expectedId: number): WantedDetailResponse {
  if (!isRecord(value)) {
    throw new WantedApiFailedError('Wanted detail response must be an object.');
  }

  const job = value.job;
  if (!isRecord(job) || typeof job.id !== 'number' || !Number.isSafeInteger(job.id)) {
    throw new WantedApiFailedError('Wanted detail response job must contain a numeric id.');
  }

  if (job.id !== expectedId) {
    throw new WantedApiFailedError(`Wanted detail response id ${job.id} did not match requested id ${expectedId}.`);
  }

  return value as WantedDetailResponse;
}

async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  parse: (value: unknown) => T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: JSON_HEADERS });
  } catch (error) {
    throw new WantedApiFailedError(`Wanted API request failed: ${errorMessage(error)}`);
  }

  if (BLOCKED_STATUSES.has(response.status)) {
    throw new WantedApiBlockedError(response.status, `Wanted API blocked with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new WantedApiFailedError(`Wanted API failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers?.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html')) {
    const body = (await response.text()).toLowerCase();
    if (BLOCKED_BODY_PATTERNS.some((pattern) => body.includes(pattern))) {
      throw new WantedApiBlockedError(response.status, 'Wanted API returned a blocked HTML response.');
    }
    throw new WantedApiFailedError('Wanted API returned HTML instead of JSON.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new WantedApiFailedError(`Wanted API returned invalid JSON: ${errorMessage(error)}`);
  }

  try {
    return parse(body);
  } catch (error) {
    if (error instanceof WantedApiFailedError) throw error;
    throw new WantedApiFailedError(`Wanted API response schema is invalid: ${errorMessage(error)}`);
  }
}

export class WantedSearchClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async searchQuery(query: string, options: WantedPageOptions): Promise<WantedSearchResponse> {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(options.limit));
    url.searchParams.set('offset', String(options.offset));
    return requestJson(this.fetchImpl, url.toString(), parseSearchResponse);
  }

  async searchWdlist(seed: WantedWdlistSeed, options: WantedPageOptions): Promise<WantedSearchResponse> {
    const url = new URL(NAVIGATION_ENDPOINT);
    url.searchParams.set('job_group_id', seed.navigationJobGroupId);
    appendAll(url.searchParams, 'job_ids', seed.navigationJobIds);
    url.searchParams.set('country', seed.country);
    url.searchParams.set('job_sort', seed.jobSort);
    appendAll(url.searchParams, 'years', seed.years);
    appendAll(url.searchParams, 'employment_types', seed.employmentTypes);
    appendAll(url.searchParams, 'locations', seed.locations);
    url.searchParams.set('limit', String(options.limit));
    url.searchParams.set('offset', String(options.offset));
    return requestJson(this.fetchImpl, url.toString(), parseNavigationResponse);
  }
}

export class WantedDetailClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async fetchDetail(id: number): Promise<WantedDetailResponse> {
    return requestJson(this.fetchImpl, `${DETAIL_ENDPOINT}/${id}`, (value) => parseDetailResponse(value, id));
  }

  async getDetail(id: number): Promise<WantedDetailResponse> {
    return this.fetchDetail(id);
  }
}
