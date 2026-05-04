import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { importLegacyJobPlanetProfiles } from '../../src/jobplanet-company-profiles/legacy-import.js';

function createCurrentDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE company_profiles (
      normalized_company TEXT PRIMARY KEY,
      company_display TEXT NOT NULL,
      jobplanet_status TEXT NOT NULL DEFAULT 'not_collected',
      jobplanet_rating REAL,
      jobplanet_review_count INTEGER,
      jobplanet_url TEXT,
      jobplanet_observed_at TEXT,
      raw_metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    INSERT INTO company_profiles (normalized_company, company_display, updated_at)
    VALUES
      ('alpha labs', 'Alpha Labs', '2026-05-02T00:00:00.000Z'),
      ('beta studio', 'Beta Studio', '2026-05-02T00:00:00.000Z'),
      ('gamma', 'Gamma', '2026-05-02T00:00:00.000Z');
  `);
  return db;
}

function createLegacyDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE company_profiles (
      normalized_company TEXT PRIMARY KEY,
      company_display TEXT NOT NULL,
      jobplanet_status TEXT NOT NULL,
      jobplanet_rating REAL,
      jobplanet_review_count INTEGER,
      jobplanet_url TEXT,
      jobplanet_match_confidence TEXT,
      jobplanet_observed_at TEXT,
      raw_metadata TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    INSERT INTO company_profiles (
      normalized_company, company_display, jobplanet_status, jobplanet_rating,
      jobplanet_review_count, jobplanet_url, jobplanet_match_confidence,
      jobplanet_observed_at, raw_metadata, updated_at
    ) VALUES
      ('alpha labs', '(주)Alpha Labs', 'ok', 4.1, 12, 'https://www.jobplanet.co.kr/companies/1', 'exact', '2026-04-30T00:00:00.000Z', '{"legacy":true}', '2026-04-30T00:00:00.000Z'),
      ('beta studio', 'Beta Studio', 'not_found', NULL, NULL, NULL, NULL, '2026-04-30T00:00:00.000Z', '{"reason":"none"}', '2026-04-30T00:00:00.000Z'),
      ('gamma', 'Wrong Gamma', 'ok', 5.0, 1, 'https://www.jobplanet.co.kr/companies/2', 'partial', '2026-04-30T00:00:00.000Z', '{}', '2026-04-30T00:00:00.000Z'),
      ('legacy only', 'Legacy Only', 'ok', 4.9, 3, 'https://www.jobplanet.co.kr/companies/3', 'exact', '2026-04-30T00:00:00.000Z', '{}', '2026-04-30T00:00:00.000Z');
  `);
  return db;
}

describe('importLegacyJobPlanetProfiles', () => {
  it('imports exact normalized-company matches and preserves non-ok statuses', () => {
    const current = createCurrentDb();
    const legacy = createLegacyDb();

    const result = importLegacyJobPlanetProfiles({
      currentDb: current,
      legacyDb: legacy,
      observedAt: '2026-05-02T01:00:00.000Z',
      dryRun: false,
    });

    expect(result).toEqual({
      currentCompanyTotal: 3,
      legacyProfileTotal: 4,
      matchedTotal: 2,
      importedTotal: 2,
      skippedPartialTotal: 1,
    });
    expect(
      current
        .prepare(
          'SELECT jobplanet_status, jobplanet_rating, jobplanet_review_count FROM company_profiles WHERE normalized_company = ?',
        )
        .get('alpha labs'),
    ).toEqual({
      jobplanet_status: 'ok',
      jobplanet_rating: 4.1,
      jobplanet_review_count: 12,
    });
    expect(
      current.prepare('SELECT jobplanet_status FROM company_profiles WHERE normalized_company = ?').get('beta studio'),
    ).toEqual({
      jobplanet_status: 'not_found',
    });
    expect(current.prepare('SELECT jobplanet_status FROM company_profiles WHERE normalized_company = ?').get('gamma'))
      .toEqual({
        jobplanet_status: 'not_collected',
      });

    current.close();
    legacy.close();
  });

  it('does not modify current DB in dry-run mode', () => {
    const current = createCurrentDb();
    const legacy = createLegacyDb();

    const result = importLegacyJobPlanetProfiles({
      currentDb: current,
      legacyDb: legacy,
      observedAt: '2026-05-02T01:00:00.000Z',
      dryRun: true,
    });

    expect(result.importedTotal).toBe(0);
    expect(result.matchedTotal).toBe(2);
    expect(current.prepare('SELECT COUNT(*) AS count FROM company_profiles WHERE jobplanet_status <> ?').get('not_collected'))
      .toEqual({
        count: 0,
      });

    current.close();
    legacy.close();
  });
});
