import { describe, expect, it, vi } from 'vitest';
import navigationRegressionFixture from '../../fixtures/wanted/navigation-regression-offset-40.json' with { type: 'json' };
import { WantedApiBlockedError, WantedApiFailedError } from '../../../src/sources/wanted/client.js';
import { collectWantedDetails } from '../../../src/sources/wanted/collector.js';
import { parseWantedWdlistUrl } from '../../../src/sources/wanted/url.js';
import type {
  WantedDetailResponse,
  WantedNamedQuery,
  WantedSearchResponse,
} from '../../../src/sources/wanted/types.js';

const wdlistSeed = parseWantedWdlistUrl(
  'https://www.wanted.co.kr/wdlist/518/895?country=kr&job_sort=job.popularity_order&years=5&years=10&employment_types=job.employment_type.regular&locations=all',
);

function query(overrides: Partial<WantedNamedQuery> = {}): WantedNamedQuery {
  return {
    key: 'node_backend_public_demo',
    profile: 'Node.js backend',
    years: 7,
    maxCandidates: 10,
    pageSize: 2,
    urlSeeds: [wdlistSeed],
    apiQueries: ['node backend'],
    notes: '',
    ...overrides,
  };
}

function searchResponse(ids: readonly number[], totalCount = ids.length): WantedSearchResponse {
  return {
    total_count: totalCount,
    data: ids.map((id) => ({
      id,
      position: id === 222 ? 'Frontend Engineer' : 'Backend Engineer',
      company: { name: `Company ${id}` },
    })),
  };
}

function detailResponse(id: number): WantedDetailResponse {
  return {
    job: {
      id,
      position: id === 222 ? 'Frontend Engineer' : 'Backend Engineer',
      company: { name: `Company ${id}` },
    },
  };
}

function expectSameIdsIgnoringOrder(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expect(new Set(actual)).toEqual(new Set(expected));
}

describe('collectWantedDetails', () => {
  it('dedupes candidates in first-seen order and keeps seed provenance', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockResolvedValueOnce(searchResponse([111, 222], 2)),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([222, 333], 2)),
    };
    const detailClient = {
      getDetail: vi.fn().mockImplementation((id: number) => Promise.resolve(detailResponse(id))),
    };

    const result = await collectWantedDetails(query(), { searchClient, detailClient });

    expect(result.status).toBe('ok');
    expect(result.details.map((detail) => detail.id)).toEqual([111, 222, 333]);
    expect(result.details.map((detail) => detail.key)).toEqual(['wanted:111', 'wanted:222', 'wanted:333']);
    expect(result.details[0].seedKeys).toEqual(['url:518/895']);
    expect(result.details[1].seedKeys).toEqual(['url:518/895', 'query:node backend']);
    expect(result.details[2].seedKeys).toEqual(['query:node backend']);
    expect(searchClient.searchWdlist).toHaveBeenCalledBefore(searchClient.searchQuery);
    expect(detailClient.getDetail).toHaveBeenNthCalledWith(1, 111);
    expect(detailClient.getDetail).toHaveBeenNthCalledWith(2, 222);
    expect(detailClient.getDetail).toHaveBeenNthCalledWith(3, 333);
  });

  it('runs later seeds for provenance even when the first seed reaches maxCandidates', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockResolvedValueOnce(searchResponse([111, 222], 2)),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([222, 333], 2)),
    };
    const detailClient = {
      getDetail: vi.fn().mockImplementation((id: number) => Promise.resolve(detailResponse(id))),
    };

    const result = await collectWantedDetails(query({ maxCandidates: 2 }), { searchClient, detailClient });

    expect(searchClient.searchWdlist).toHaveBeenCalledTimes(1);
    expect(searchClient.searchQuery).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    expect(result.details.map((detail) => detail.id)).toEqual([111, 222]);
    expect(result.details[0].seedKeys).toEqual(['url:518/895']);
    expect(result.details[1].seedKeys).toEqual(['url:518/895', 'query:node backend']);
    expect(detailClient.getDetail).toHaveBeenCalledTimes(2);
    expect(detailClient.getDetail).toHaveBeenNthCalledWith(1, 111);
    expect(detailClient.getDetail).toHaveBeenNthCalledWith(2, 222);
  });

  it('returns partial when one seed fails but another seed produces usable details', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockRejectedValueOnce(new Error('seed unavailable')),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([222], 1)),
    };
    const detailClient = {
      getDetail: vi.fn().mockResolvedValueOnce(detailResponse(222)),
    };

    const result = await collectWantedDetails(query(), { searchClient, detailClient });

    expect(result.status).toBe('partial');
    expect(result.details.map((detail) => detail.id)).toEqual([222]);
    expect(result.seedFailures).toHaveLength(1);
    expect(result.detailFailures).toHaveLength(0);
  });

  it('returns partial when one detail fails but another detail is usable', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockResolvedValueOnce(searchResponse([111, 222], 2)),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([], 0)),
    };
    const detailClient = {
      getDetail: vi
        .fn()
        .mockRejectedValueOnce(new Error('detail unavailable'))
        .mockResolvedValueOnce(detailResponse(222)),
    };

    const result = await collectWantedDetails(query(), { searchClient, detailClient });

    expect(result.status).toBe('partial');
    expect(result.details.map((detail) => detail.id)).toEqual([222]);
    expect(result.seedFailures).toHaveLength(0);
    expect(result.detailFailures).toEqual([
      { id: 111, key: 'wanted:111', kind: 'failed', message: 'detail unavailable' },
    ]);
  });

  it('returns blocked when seed failures leave no details', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockRejectedValueOnce(new WantedApiBlockedError(429, 'url')),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([], 0)),
    };
    const detailClient = {
      getDetail: vi.fn(),
    };

    const result = await collectWantedDetails(query(), { searchClient, detailClient });

    expect(result.status).toBe('blocked');
    expect(result.details).toEqual([]);
    expect(result.seedFailures).toEqual([{ key: 'url:518/895', kind: 'blocked', message: 'url' }]);
    expect(detailClient.getDetail).not.toHaveBeenCalled();
  });

  it('returns failed when non-blocked seed failures leave no details', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockRejectedValueOnce(new WantedApiFailedError('boom', 'url')),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([], 0)),
    };
    const detailClient = {
      getDetail: vi.fn(),
    };

    const result = await collectWantedDetails(query(), { searchClient, detailClient });

    expect(result.status).toBe('failed');
    expect(result.details).toEqual([]);
    expect(result.seedFailures).toEqual([{ key: 'url:518/895', kind: 'failed', message: 'boom' }]);
    expect(detailClient.getDetail).not.toHaveBeenCalled();
  });

  it('returns failed when only detail failures leave no details', async () => {
    const searchClient = {
      searchWdlist: vi.fn().mockResolvedValueOnce(searchResponse([111], 1)),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([], 0)),
    };
    const detailClient = {
      getDetail: vi.fn().mockRejectedValueOnce(new Error('detail unavailable')),
    };

    const result = await collectWantedDetails(query(), { searchClient, detailClient });

    expect(result.status).toBe('failed');
    expect(result.details).toEqual([]);
    expect(result.seedFailures).toEqual([]);
    expect(result.detailFailures).toEqual([
      { id: 111, key: 'wanted:111', kind: 'failed', message: 'detail unavailable' },
    ]);
  });

  it('follows wdlist navigation next links, dedupes candidates, and reports discovery counts', async () => {
    const searchClient = {
      searchWdlist: vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: 111 }, { id: 222 }],
          links: { next: 'https://www.wanted.co.kr/api/chaos/navigation/v1/results?limit=2&offset=40' },
        })
        .mockResolvedValueOnce({ data: [{ id: 222 }, { id: 333 }], links: {} }),
      searchQuery: vi.fn().mockResolvedValueOnce(searchResponse([], 0)),
    };
    const detailClient = {
      getDetail: vi.fn().mockImplementation((id: number) => Promise.resolve(detailResponse(id))),
    };

    const result = await collectWantedDetails(query({ apiQueries: [], pageSize: 2 }), { searchClient, detailClient });

    expect(searchClient.searchWdlist).toHaveBeenNthCalledWith(1, wdlistSeed, { limit: 2, offset: 0 });
    expect(searchClient.searchWdlist).toHaveBeenNthCalledWith(2, wdlistSeed, { limit: 2, offset: 40 });
    expect(result.details.map((detail) => detail.id)).toEqual([111, 222, 333]);
    expect(result.listCandidateTotal).toBe(3);
    expect(result.wantedNavigationPages).toBe(2);
  });

  it('collects the same listing ids from the captured Wanted navigation regression page and follows its next offset', async () => {
    const searchClient = {
      searchWdlist: vi
        .fn()
        .mockResolvedValueOnce(navigationRegressionFixture)
        .mockResolvedValueOnce({ data: [], links: {} }),
      searchQuery: vi.fn(),
    };
    const detailClient = {
      getDetail: vi.fn().mockImplementation((id: number) => Promise.resolve(detailResponse(id))),
    };

    const result = await collectWantedDetails(query({ apiQueries: [], maxCandidates: 20, pageSize: 20 }), {
      searchClient,
      detailClient,
    });

    expect(searchClient.searchWdlist).toHaveBeenNthCalledWith(1, wdlistSeed, { limit: 20, offset: 0 });
    expect(searchClient.searchWdlist).toHaveBeenNthCalledWith(2, wdlistSeed, { limit: 20, offset: 60 });
    expectSameIdsIgnoringOrder(
      result.details.map((detail) => detail.id),
      Array.from({ length: 20 }, (_, index) => 1001 + index),
    );
    expect(result.listCandidateTotal).toBe(20);
    expect(result.wantedNavigationPages).toBe(2);
    expect(detailClient.getDetail).toHaveBeenCalledTimes(20);
  });
});
