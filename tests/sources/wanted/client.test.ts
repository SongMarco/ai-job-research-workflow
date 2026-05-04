import { describe, expect, it, vi } from 'vitest';
import fixture from '../../fixtures/wanted/search-response.json' with { type: 'json' };
import navigationFixture from '../../fixtures/wanted/navigation-page-1.json' with { type: 'json' };
import navigationRegressionFixture from '../../fixtures/wanted/navigation-regression-offset-40.json' with { type: 'json' };
import {
  WantedApiBlockedError,
  WantedApiFailedError,
  WantedDetailClient,
  WantedSearchClient,
} from '../../../src/sources/wanted/client.js';
import { parseWantedWdlistUrl } from '../../../src/sources/wanted/url.js';

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function textResponse(body: string, contentType: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function expectSameIdsIgnoringOrder(actual: readonly number[] | undefined, expected: readonly number[]): void {
  expect(actual).toBeDefined();
  expect(actual).toHaveLength(expected.length);
  expect(new Set(actual)).toEqual(new Set(expected));
}

describe('WantedSearchClient', () => {
  it('builds search query URLs and returns parsed search responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixture));
    const client = new WantedSearchClient(fetchMock);

    const result = await client.searchQuery('node backend', { limit: 20, offset: 40 });

    expect(result).toEqual(fixture);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://www.wanted.co.kr/api/chaos/search/v1/position',
    );
    expect(parsed.searchParams.get('query')).toBe('node backend');
    expect(parsed.searchParams.get('limit')).toBe('20');
    expect(parsed.searchParams.get('offset')).toBe('40');
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
    });
  });

  it('builds wdlist navigation URLs from parsed seed fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(navigationFixture));
    const client = new WantedSearchClient(fetchMock);
    const seed = parseWantedWdlistUrl(
      'https://www.wanted.co.kr/wdlist/518/895?country=kr&job_sort=job.latest_order&years=5&years=10&locations=all',
    );

    const result = await client.searchWdlist(seed, { limit: 10, offset: 30 });

    expect(result).toEqual(navigationFixture);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://www.wanted.co.kr/api/chaos/navigation/v1/results',
    );
    expect(parsed.searchParams.get('job_group_id')).toBe('518');
    expect(parsed.searchParams.get('job_ids')).toBe('895');
    expect(parsed.searchParams.has('category_tags')).toBe(false);
    expect(parsed.searchParams.get('country')).toBe('kr');
    expect(parsed.searchParams.get('job_sort')).toBe('job.latest_order');
    expect(parsed.searchParams.getAll('years')).toEqual(['5', '10']);
    expect(parsed.searchParams.getAll('locations')).toEqual(['all']);
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.get('offset')).toBe('30');
  });

  it('classifies 429 responses as blocked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'slow down' }, { ok: false, status: 429 }));
    const client = new WantedSearchClient(fetchMock);

    await expect(client.searchQuery('node', { limit: 10, offset: 0 })).rejects.toMatchObject({
      name: 'WantedApiBlockedError',
      status: 429,
    });
  });

  it('preserves blocked HTTP status for 403 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'forbidden' }, { ok: false, status: 403 }));
    const client = new WantedSearchClient(fetchMock);

    await expect(client.searchQuery('node', { limit: 10, offset: 0 })).rejects.toMatchObject({
      name: 'WantedApiBlockedError',
      status: 403,
    });
  });

  it('classifies invalid JSON as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);
    const client = new WantedSearchClient(fetchMock);

    await expect(client.searchQuery('node', { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      WantedApiFailedError,
    );
  });

  it('classifies 200 html authwall-like responses as blocked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(textResponse('<html><title>login authwall cloudflare captcha</title></html>', 'text/html'));
    const client = new WantedSearchClient(fetchMock);

    await expect(client.searchQuery('node', { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      WantedApiBlockedError,
    );
  });

  it('classifies search responses without data as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ total_count: 1 }));
    const client = new WantedSearchClient(fetchMock);

    await expect(client.searchQuery('node', { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      WantedApiFailedError,
    );
  });

  it('classifies query search responses without total_count as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new WantedSearchClient(fetchMock);

    await expect(client.searchQuery('node', { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      WantedApiFailedError,
    );
  });

  it('accepts wdlist navigation responses without total_count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new WantedSearchClient(fetchMock);
    const seed = parseWantedWdlistUrl('https://www.wanted.co.kr/wdlist/518/895?years=5');

    await expect(client.searchWdlist(seed, { limit: 10, offset: 0 })).resolves.toEqual({ data: [] });
  });

  it('parses the captured Wanted navigation regression page with the same listing ids and next link', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(navigationRegressionFixture));
    const client = new WantedSearchClient(fetchMock);
    const seed = parseWantedWdlistUrl(
      'https://www.wanted.co.kr/wdlist/518/895?country=kr&job_sort=job.latest_order&years=5&years=10&locations=all',
    );

    const result = await client.searchWdlist(seed, { limit: 20, offset: 40 });

    expectSameIdsIgnoringOrder(
      result.data?.map((position) => position.id),
      Array.from({ length: 20 }, (_, index) => 1001 + index),
    );
    expect(result.links?.next).toBe(
      '/api/chaos/navigation/v1/results?job_group_id=518&job_ids=895&country=kr&job_sort=job.latest_order&years=5&years=10&locations=all&limit=20&offset=60',
    );
  });
});

describe('WantedDetailClient', () => {
  it('fetches job detail responses by id', async () => {
    const detail = {
      job: {
        id: 111,
        position: 'Senior Backend Engineer',
        company: { name: 'Backend Labs' },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(detail));
    const client = new WantedDetailClient(fetchMock);

    await expect(client.fetchDetail(111)).resolves.toEqual(detail);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.wanted.co.kr/api/v4/jobs/111');
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
    });
  });

  it('classifies null detail jobs as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ job: null }));
    const client = new WantedDetailClient(fetchMock);

    await expect(client.fetchDetail(111)).rejects.toBeInstanceOf(WantedApiFailedError);
  });

  it('classifies missing detail jobs as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = new WantedDetailClient(fetchMock);

    await expect(client.fetchDetail(111)).rejects.toBeInstanceOf(WantedApiFailedError);
  });

  it('classifies mismatched detail job ids as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ job: { id: 999 } }));
    const client = new WantedDetailClient(fetchMock);

    await expect(client.fetchDetail(111)).rejects.toBeInstanceOf(WantedApiFailedError);
  });
});
