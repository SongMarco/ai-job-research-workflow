import { describe, expect, it } from 'vitest';
import { collectRememberNodeDetails } from '../../../src/sources/remember/collector.js';
import type { RememberDetailResponse, RememberSearchResponse } from '../../../src/sources/remember/types.js';

function searchPage(ids: readonly number[], page: number, totalPages: number, totalCount = 210): RememberSearchResponse {
  return {
    data: ids.map((id) => ({ id, title: `백엔드 ${id}` })),
    meta: { page, per: 30, total_pages: totalPages, total_count: totalCount },
  };
}

function detail(id: number, text: string): RememberDetailResponse {
  return {
    data: {
      id,
      title: `백엔드 개발자 ${id}`,
      organization: { name: `Company ${id}` },
      desiredProfileCondition: { skills: [{ name: text }] },
      requirements: text,
    },
    raw: { id, text },
  };
}

describe('collectRememberNodeDetails', () => {
  it('paginates the full Remember backend result set and keeps only detail payloads with required Node-family signals', async () => {
    const allIds = Array.from({ length: 210 }, (_, index) => index + 1);
    const pages = Array.from({ length: 7 }, (_, index) =>
      searchPage(allIds.slice(index * 30, index * 30 + 30), index + 1, 7),
    );
    const searchCalls: Array<{ readonly keyword: string; readonly page: number; readonly per: number }> = [];
    const detailCalls: number[] = [];

    const result = await collectRememberNodeDetails(
      { key: 'node_backend_remember', keyword: '백엔드', maxCandidates: 500, pageSize: 30, notes: 'test' },
      {
        searchClient: {
          async searchKeyword(options) {
            searchCalls.push(options);
            return pages[options.page - 1];
          },
        },
        detailClient: {
          async getDetail(id) {
            detailCalls.push(id);
            if (id === 1) return detail(id, 'Node.js 기반 API 개발');
            if (id === 2) return detail(id, 'NestJS 백엔드 개발');
            if (id === 3) return detail(id, 'TypeScript 서버 개발');
            if (id === 4) return detail(id, 'JavaScript 프론트엔드');
            if (id === 5) return detail(id, 'Express REST API');
            if (id === 6) return detail(id, 'Fastify 서버 운영');
            return detail(id, 'Java Spring 백엔드 개발');
          },
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(searchCalls).toHaveLength(7);
    expect(searchCalls.map((call) => call.page)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(detailCalls).toHaveLength(210);
    expect(result.listCandidateTotal).toBe(210);
    expect(result.rememberSearchPages).toBe(7);
    expect(result.detailFilteredOut).toBe(207);
    expect(result.detailFailures).toHaveLength(0);
    expect(result.details.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(result.details.map((item) => item.signals)).toEqual([['node'], ['nest'], ['typescript']]);
  });
});
