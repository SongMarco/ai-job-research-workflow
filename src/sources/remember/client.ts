import type { RememberDetailResponse, RememberSearchResponse } from './types.js';

const SEARCH_ENDPOINT = 'https://career-api.rememberapp.co.kr/job_postings/search';
const DETAIL_PAGE_ENDPOINT = 'https://career.rememberapp.co.kr/job/posting';
const BLOCKED_STATUSES = new Set([401, 403, 429]);
const BLOCKED_BODY_PATTERNS = ['cloudflare', 'captcha', 'access denied', 'rate limit', 'blocked'];

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: 'https://career.rememberapp.co.kr',
  Referer: 'https://career.rememberapp.co.kr/job/board/hiring-postings',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

export class RememberApiBlockedError extends Error {
  readonly status?: number;

  constructor(message: string);
  constructor(status: number, message: string);
  constructor(statusOrMessage: number | string, message?: string) {
    super(typeof statusOrMessage === 'number' ? (message ?? String(statusOrMessage)) : statusOrMessage);
    if (typeof statusOrMessage === 'number') this.status = statusOrMessage;
    this.name = 'RememberApiBlockedError';
  }
}

export class RememberApiFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RememberApiFailedError';
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSearchResponse(value: unknown): RememberSearchResponse {
  if (!isRecord(value)) throw new RememberApiFailedError('Remember search response must be an object.');
  if (!Array.isArray(value.data)) throw new RememberApiFailedError('Remember search response data must be an array.');
  if (!isRecord(value.meta)) throw new RememberApiFailedError('Remember search response meta must be an object.');
  for (const posting of value.data) {
    if (!isRecord(posting) || typeof posting.id !== 'number' || !Number.isSafeInteger(posting.id)) {
      throw new RememberApiFailedError('Remember search response data must contain numeric posting ids.');
    }
  }
  return value as unknown as RememberSearchResponse;
}

function findPostingInNextData(value: unknown, expectedId: number): unknown {
  if (!isRecord(value)) return null;
  const queries = (value.props as { pageProps?: { dehydratedState?: { queries?: unknown } } } | undefined)?.pageProps
    ?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return null;

  for (const query of queries) {
    const data = (query as { state?: { data?: { data?: unknown } } }).state?.data?.data;
    if (isRecord(data) && data.id === expectedId) return data;
  }
  return null;
}

function extractNextData(html: string, expectedId: number): RememberDetailResponse {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new RememberApiFailedError('Remember detail page did not include __NEXT_DATA__.');

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch (error) {
    throw new RememberApiFailedError(`Remember detail __NEXT_DATA__ was invalid JSON: ${messageFrom(error)}`);
  }

  const posting = findPostingInNextData(raw, expectedId);
  if (!isRecord(posting) || posting.id !== expectedId) {
    throw new RememberApiFailedError(`Remember detail response did not contain posting id ${expectedId}.`);
  }

  return { data: posting as RememberDetailResponse['data'], raw };
}

async function checkedResponse(response: Response, source: string): Promise<Response> {
  if (BLOCKED_STATUSES.has(response.status)) {
    throw new RememberApiBlockedError(response.status, `Remember ${source} blocked with HTTP ${response.status}.`);
  }
  if (!response.ok) throw new RememberApiFailedError(`Remember ${source} failed with HTTP ${response.status}.`);
  return response;
}

export class RememberSearchClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async searchKeyword(options: { readonly keyword: string; readonly page: number; readonly per: number }): Promise<RememberSearchResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: BROWSER_HEADERS,
        body: JSON.stringify({
          search: { keywords: [options.keyword], includeAppliedJobPosting: false },
          page: options.page,
          per: options.per,
          sort: 'starts_at_desc',
        }),
      });
    } catch (error) {
      throw new RememberApiFailedError(`Remember search request failed: ${messageFrom(error)}`);
    }

    await checkedResponse(response, 'search');
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) {
      const body = (await response.text()).toLowerCase();
      if (BLOCKED_BODY_PATTERNS.some((pattern) => body.includes(pattern))) {
        throw new RememberApiBlockedError(response.status, 'Remember search returned a blocked HTML response.');
      }
      throw new RememberApiFailedError('Remember search returned HTML instead of JSON.');
    }

    try {
      return parseSearchResponse(await response.json());
    } catch (error) {
      if (error instanceof RememberApiFailedError) throw error;
      throw new RememberApiFailedError(`Remember search returned invalid JSON: ${messageFrom(error)}`);
    }
  }
}

export class RememberDetailClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async getDetail(id: number): Promise<RememberDetailResponse> {
    const url = `${DETAIL_PAGE_ENDPOINT}/${id}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { ...BROWSER_HEADERS, Accept: 'text/html,*/*' } });
    } catch (error) {
      throw new RememberApiFailedError(`Remember detail request failed: ${messageFrom(error)}`);
    }
    await checkedResponse(response, 'detail');
    const body = await response.text();
    const lowered = body.slice(0, 2000).toLowerCase();
    if (BLOCKED_BODY_PATTERNS.some((pattern) => lowered.includes(pattern))) {
      throw new RememberApiBlockedError(response.status, 'Remember detail returned a blocked HTML response.');
    }
    return extractNextData(body, id);
  }
}
