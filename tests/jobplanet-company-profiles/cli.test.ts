import { describe, expect, it } from 'vitest';
import { parseJobPlanetCompanyProfilesArgs } from '../../src/jobplanet-company-profiles/cli.js';

describe('parseJobPlanetCompanyProfilesArgs', () => {
  it('defaults to the current and legacy DB paths', () => {
    expect(parseJobPlanetCompanyProfilesArgs([])).toEqual({
      dbPath: 'data/headhunter.db',
      legacyDbPath: '/Users/youngchansong/Documents/projects/job-finder/data/lineage-catalog.db',
      dryRun: false,
      headless: true,
      limit: null,
      live: false,
      retryStatus: 'not_collected',
    });
  });

  it('parses dry-run and path overrides', () => {
    expect(
      parseJobPlanetCompanyProfilesArgs([
        '--',
        '--dry-run',
        '--db-path',
        'tmp/current.db',
        '--legacy-db-path',
        'tmp/legacy.db',
      ]),
    ).toEqual({
      dbPath: 'tmp/current.db',
      legacyDbPath: 'tmp/legacy.db',
      dryRun: true,
      headless: true,
      limit: null,
      live: false,
      retryStatus: 'not_collected',
    });
  });

  it('parses live collection options', () => {
    expect(parseJobPlanetCompanyProfilesArgs(['--live', '--limit', '10', '--headed', '--retry-status', 'not_found'])).toEqual({
      dbPath: 'data/headhunter.db',
      legacyDbPath: '/Users/youngchansong/Documents/projects/job-finder/data/lineage-catalog.db',
      dryRun: false,
      headless: false,
      limit: 10,
      live: true,
      retryStatus: 'not_found',
    });
  });

  it('rejects unknown args', () => {
    expect(() => parseJobPlanetCompanyProfilesArgs(['--cdp-url', 'http://127.0.0.1:9222'])).toThrow(
      'Unknown argument: --cdp-url',
    );
  });
});
