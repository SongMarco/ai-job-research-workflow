import { describe, expect, it } from 'vitest';
import { JobPlanetCompanyProfileService } from '../../src/jobplanet-company-profiles/live-collect.js';

class FakePage {
  readonly urls: string[] = [];

  constructor(
    private readonly candidates: readonly {
      readonly name: string;
      readonly url: string;
      readonly texts: readonly string[];
    }[],
    private readonly pageTitle: string,
    private readonly status = 200,
  ) {}

  async goto(url: string): Promise<{ status: () => number }> {
    this.urls.push(url);
    return { status: () => this.status };
  }

  async waitForSelector(): Promise<void> {}

  async evaluate<T>(): Promise<T> {
    return this.candidates as T;
  }

  async title(): Promise<string> {
    return this.pageTitle;
  }

  async close(): Promise<void> {}

  context(): { close(): Promise<void> } {
    return {
      async close() {},
    };
  }
}

class FakeBrowserPool {
  readonly released: FakePage[] = [];

  constructor(private readonly page: FakePage) {}

  async acquirePage(): Promise<FakePage> {
    return this.page;
  }

  async releasePage(page: FakePage): Promise<void> {
    this.released.push(page);
  }
}

describe('JobPlanetCompanyProfileService', () => {
  it('collects exact JobPlanet matches using the legacy parser rules', async () => {
    const page = new FakePage(
      [
        {
          name: 'Alpha Labs',
          url: 'https://www.jobplanet.co.kr/companies/1001',
          texts: ['기업 평점', '4.2', '서울 서초구'],
        },
      ],
      'Alpha Labs 기업리뷰 1,234건',
    );
    const pool = new FakeBrowserPool(page);
    const service = new JobPlanetCompanyProfileService({ browserPool: pool, delayMs: 0 });

    const result = await service.collect(['Alpha Labs']);

    expect(result.get('alpha labs')).toEqual({
      status: 'ok',
      companyInfo: {
        name: 'Alpha Labs',
        normalizedName: 'alpha labs',
        rating: 4.2,
        reviewCount: 1234,
        jobplanetUrl: 'https://www.jobplanet.co.kr/companies/1001',
        matchConfidence: 'exact',
      },
    });
    expect(page.urls).toEqual([
      'https://www.jobplanet.co.kr/search?query=alpha%20labs',
      'https://www.jobplanet.co.kr/companies/1001',
    ]);
    expect(pool.released).toEqual([page]);
  });

  it('returns blocked when JobPlanet blocks public access', async () => {
    const page = new FakePage([], 'blocked', 403);
    const service = new JobPlanetCompanyProfileService({
      browserPool: new FakeBrowserPool(page),
      delayMs: 0,
    });

    const result = await service.collect(['Blocked Labs']);

    expect(result.get('blocked labs')).toEqual({
      status: 'blocked',
      reason: 'JobPlanet blocked request with HTTP 403',
    });
  });

  it('searches with the primary company name before parenthesized aliases', async () => {
    const page = new FakePage(
      [
        {
          name: 'Beta Health',
          url: 'https://www.jobplanet.co.kr/companies/1002',
          texts: ['3.1'],
        },
      ],
      'Beta Health 기업리뷰 312건',
    );
    const service = new JobPlanetCompanyProfileService({
      browserPool: new FakeBrowserPool(page),
      delayMs: 0,
    });

    const result = await service.collect(['Beta Health(Beta App)']);

    expect(page.urls[0]).toBe(
      'https://www.jobplanet.co.kr/search?query=beta%20health',
    );
    expect(result.get('beta health(beta app)')).toEqual({
      status: 'ok',
      companyInfo: {
        name: 'Beta Health',
        normalizedName: 'beta health(beta app)',
        rating: 3.1,
        reviewCount: 312,
        jobplanetUrl: 'https://www.jobplanet.co.kr/companies/1002',
        matchConfidence: 'exact',
      },
    });
  });

  it('treats legal prefixes and Korea suffixes as exact legacy-compatible matches', async () => {
    const page = new FakePage(
      [
        {
          name: '유한책임회사감마랩스코리아',
          url: 'https://www.jobplanet.co.kr/companies/1003',
          texts: ['2.8'],
        },
      ],
      '유한책임회사감마랩스코리아 기업리뷰 171건',
    );
    const service = new JobPlanetCompanyProfileService({
      browserPool: new FakeBrowserPool(page),
      delayMs: 0,
    });

    const result = await service.collect(['감마랩스코리아']);

    expect(result.get('감마랩스코리아')).toEqual({
      status: 'ok',
      companyInfo: {
        name: '유한책임회사감마랩스코리아',
        normalizedName: '감마랩스코리아',
        rating: 2.8,
        reviewCount: 171,
        jobplanetUrl: 'https://www.jobplanet.co.kr/companies/1003',
        matchConfidence: 'exact',
      },
    });
  });

  it('matches Latin letters case-insensitively against Wanted normalized company keys', async () => {
    const page = new FakePage(
      [
        {
          name: '(주)DeltaAI',
          url: 'https://www.jobplanet.co.kr/companies/1004',
          texts: ['2.9'],
        },
      ],
      '(주)DeltaAI 기업리뷰 31건',
    );
    const service = new JobPlanetCompanyProfileService({
      browserPool: new FakeBrowserPool(page),
      delayMs: 0,
    });

    const result = await service.collect(['deltaai']);

    expect(result.get('deltaai')).toEqual({
      status: 'ok',
      companyInfo: {
        name: '(주)DeltaAI',
        normalizedName: 'deltaai',
        rating: 2.9,
        reviewCount: 31,
        jobplanetUrl: 'https://www.jobplanet.co.kr/companies/1004',
        matchConfidence: 'exact',
      },
    });
  });
});
