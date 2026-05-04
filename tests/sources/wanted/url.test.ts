import { describe, expect, it } from 'vitest';
import { parseWantedWdlistUrl } from '../../../src/sources/wanted/url.js';
import { DEFAULT_WANTED_URL } from '../../../src/search-jobs/search-plan.js';

describe('parseWantedWdlistUrl', () => {
  const query = '?country=kr&job_sort=job.popularity_order&years=5';

  it('extracts category, subcategory, years, sort, employment type, and location', () => {
    expect(parseWantedWdlistUrl(DEFAULT_WANTED_URL)).toEqual({
      kind: 'wdlist',
      url: DEFAULT_WANTED_URL,
      categoryId: '518',
      subcategoryId: '895',
      navigationJobGroupId: '518',
      navigationJobIds: ['895'],
      country: 'kr',
      jobSort: 'job.popularity_order',
      years: [5, 10],
      employmentTypes: ['job.employment_type.regular'],
      locations: ['all'],
    });
  });

  it('maps wdlist path fields to Wanted navigation parameters', () => {
    const seed = parseWantedWdlistUrl(
      'https://www.wanted.co.kr/wdlist/518/895?country=kr&job_sort=job.latest_order&years=5&years=10&locations=all',
    );

    expect(seed.navigationJobGroupId).toBe('518');
    expect(seed.navigationJobIds).toEqual(['895']);
  });

  it('rejects non-wdlist Wanted URLs', () => {
    expect(() => parseWantedWdlistUrl('https://www.wanted.co.kr/wd/123')).toThrow(
      'Wanted URL must use /wdlist/{category}/{subcategory}.',
    );
  });

  it('rejects non-Wanted hosts', () => {
    expect(() => parseWantedWdlistUrl(`https://example.com/wdlist/518/895${query}`)).toThrow(
      'Wanted URL must use https://www.wanted.co.kr.',
    );
  });

  it('rejects non-https Wanted URLs', () => {
    expect(() => parseWantedWdlistUrl(`http://www.wanted.co.kr/wdlist/518/895${query}`)).toThrow(
      'Wanted URL must use https://www.wanted.co.kr.',
    );
  });

  it('rejects non-numeric years', () => {
    expect(() => parseWantedWdlistUrl('https://www.wanted.co.kr/wdlist/518/895?years=abc')).toThrow(
      'Wanted URL years must be non-negative integers.',
    );
  });

  it('rejects empty years', () => {
    expect(() => parseWantedWdlistUrl('https://www.wanted.co.kr/wdlist/518/895?years=')).toThrow(
      'Wanted URL years must be non-negative integers.',
    );
  });

  it('rejects negative years', () => {
    expect(() => parseWantedWdlistUrl('https://www.wanted.co.kr/wdlist/518/895?years=-1')).toThrow(
      'Wanted URL years must be non-negative integers.',
    );
  });
});
