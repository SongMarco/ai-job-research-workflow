import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DB_PATH,
  DEFAULT_PROFILE,
  DEFAULT_QUERY_KEY,
  DEFAULT_YEARS,
  DEFAULT_REMEMBER_QUERY_KEY,
  DEFAULT_WANTED_URL,
  parseSearchPlanArgs,
} from '../../src/search-jobs/search-plan.js';

describe('parseSearchPlanArgs', () => {
  it('uses the fixed Wanted Node backend defaults for no args', () => {
    const plan = parseSearchPlanArgs([]);

    expect(plan).toMatchObject({
      source: 'wanted',
      profile: DEFAULT_PROFILE,
      years: DEFAULT_YEARS,
      queryKey: DEFAULT_QUERY_KEY,
      wantedUrl: undefined,
      includeDetail: true,
      dbPath: DEFAULT_DB_PATH,
      resultsDir: 'results/search-jobs',
      outputs: ['sqlite', 'markdown'],
    });
  });

  it('accepts the default named query override', () => {
    const plan = parseSearchPlanArgs(['wanted', '--query', DEFAULT_QUERY_KEY]);

    expect(plan.source).toBe('wanted');
    expect(plan.queryKey).toBe(DEFAULT_QUERY_KEY);
    expect(plan.wantedUrl).toBeUndefined();
  });

  it('accepts a one-off Wanted URL override', () => {
    const plan = parseSearchPlanArgs(['wanted', '--url', DEFAULT_WANTED_URL]);

    expect(plan.source).toBe('wanted');
    expect(plan.queryKey).toBeUndefined();
    expect(plan.wantedUrl).toBe(DEFAULT_WANTED_URL);
  });

  it('rejects unsupported platforms', () => {
    expect(() => parseSearchPlanArgs(['saramin'])).toThrow('Supported sources: wanted, remember.');
  });

  it('accepts Remember backend Node detail filtering source', () => {
    const plan = parseSearchPlanArgs(['remember']);

    expect(plan).toMatchObject({
      source: 'remember',
      profile: DEFAULT_PROFILE,
      years: DEFAULT_YEARS,
      queryKey: DEFAULT_REMEMBER_QUERY_KEY,
      includeDetail: true,
      dbPath: DEFAULT_DB_PATH,
      resultsDir: 'results/search-jobs',
      outputs: ['sqlite', 'markdown'],
    });
  });

  it('rejects broad arbitrary profile input', () => {
    expect(() => parseSearchPlanArgs(['wanted', '백엔드', '5년'])).toThrow(
      'wanted accepts only --query <key> or --url <Wanted wdlist URL>.',
    );
  });

  it('rejects repeated wanted command tokens', () => {
    expect(() => parseSearchPlanArgs(['wanted', 'wanted'])).toThrow(
      'wanted accepts only --query <key> or --url <Wanted wdlist URL>.',
    );
  });

  it('rejects duplicate query options', () => {
    expect(() => parseSearchPlanArgs(['wanted', '--query', 'a', '--query', 'b'])).toThrow(
      '--query can only be provided once.',
    );
  });

  it('rejects non-Wanted URL overrides', () => {
    expect(() => parseSearchPlanArgs(['wanted', '--url', 'https://example.com/jobs'])).toThrow(
      'Wanted URL must use https://www.wanted.co.kr.',
    );
  });

  it('rejects malformed URL overrides with a stable message', () => {
    expect(() => parseSearchPlanArgs(['wanted', '--url', 'not-a-url'])).toThrow(
      '--url must be a Wanted wdlist URL.',
    );
  });

  it('rejects non-https Wanted URL overrides with the canonical parser message', () => {
    expect(() => parseSearchPlanArgs(['wanted', '--url', 'http://www.wanted.co.kr/wdlist/518/895'])).toThrow(
      'Wanted URL must use https://www.wanted.co.kr.',
    );
  });

  it('rejects invalid Wanted URL years with the canonical parser message', () => {
    expect(() =>
      parseSearchPlanArgs(['wanted', '--url', 'https://www.wanted.co.kr/wdlist/518/895?years=']),
    ).toThrow('Wanted URL years must be non-negative integers.');
  });
});
