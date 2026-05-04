import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { SearchJobsRepo } from '../../src/db/search-jobs-repo.js';
import { runLiveJobPlanetProfiles } from '../../src/jobplanet-company-profiles/live-run.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE search_runs (
      run_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      profile TEXT NOT NULL,
      query_key TEXT,
      wanted_url TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      markdown_path TEXT,
      counts_json TEXT NOT NULL DEFAULT '{}',
      error_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE job_listings (
      source_marker TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      source_job_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      category_text TEXT NOT NULL,
      company TEXT NOT NULL,
      normalized_company TEXT NOT NULL,
      location TEXT NOT NULL,
      experience_text TEXT NOT NULL,
      experience_min INTEGER,
      experience_max INTEGER,
      experience_parse_confidence TEXT NOT NULL,
      deadline_text TEXT NOT NULL,
      deadline_date TEXT,
      required_skills_json TEXT NOT NULL DEFAULT '[]',
      preferred_skills_json TEXT NOT NULL DEFAULT '[]',
      detail_text TEXT NOT NULL,
      backend_filter_status TEXT NOT NULL,
      backend_filter_reason TEXT NOT NULL,
      raw_json TEXT NOT NULL DEFAULT '{}',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE job_listing_observations (
      run_id TEXT NOT NULL,
      source_marker TEXT NOT NULL,
      query_key TEXT,
      row_index INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      raw_metadata_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (run_id, source_marker)
    );
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
    INSERT INTO company_profiles (
      normalized_company, company_display, jobplanet_status, updated_at
    ) VALUES
      ('alpha labs', 'Alpha Labs', 'not_collected', '2026-05-02T00:00:00.000Z'),
      ('beta studio', 'Beta Studio', 'not_collected', '2026-05-02T00:00:00.000Z'),
      ('done corp', 'Done Corp', 'ok', '2026-05-02T00:00:00.000Z');
  `);
  return db;
}

describe('runLiveJobPlanetProfiles', () => {
  it('updates only not_collected targets and stores exact matches as ok', async () => {
    const db = createDb();
    const repo = new SearchJobsRepo(db);

    const result = await runLiveJobPlanetProfiles({
      repo,
      limit: null,
      retryStatus: 'not_collected',
      now: () => new Date('2026-05-02T02:00:00.000Z'),
      service: {
        async collect(names) {
          expect(names).toEqual(['alpha labs', 'beta studio']);
          return new Map([
            [
              'alpha labs',
              {
                status: 'ok',
                companyInfo: {
                  name: 'Alpha Labs',
                  normalizedName: 'alpha labs',
                  rating: 4.3,
                  reviewCount: 42,
                  jobplanetUrl: 'https://www.jobplanet.co.kr/companies/1',
                  matchConfidence: 'exact',
                },
              },
            ],
            [
              'beta studio',
              {
                status: 'ok',
                companyInfo: {
                  name: 'Beta Studio Seoul',
                  normalizedName: 'beta studio',
                  rating: 4.8,
                  reviewCount: 7,
                  jobplanetUrl: 'https://www.jobplanet.co.kr/companies/2',
                  matchConfidence: 'partial',
                },
              },
            ],
          ]);
        },
      },
    });

    expect(result).toEqual({
      targetTotal: 2,
      attemptedTotal: 2,
      upsertedTotal: 2,
      okTotal: 1,
      notFoundTotal: 1,
      blockedTotal: 0,
      failedTotal: 0,
    });
    expect(
      db
        .prepare(
          'SELECT jobplanet_status, jobplanet_rating, jobplanet_review_count, jobplanet_url FROM company_profiles WHERE normalized_company = ?',
        )
        .get('alpha labs'),
    ).toEqual({
      jobplanet_status: 'ok',
      jobplanet_rating: 4.3,
      jobplanet_review_count: 42,
      jobplanet_url: 'https://www.jobplanet.co.kr/companies/1',
    });
    expect(
      db
        .prepare(
          'SELECT jobplanet_status, jobplanet_rating, jobplanet_review_count, jobplanet_url FROM company_profiles WHERE normalized_company = ?',
        )
        .get('beta studio'),
    ).toEqual({
      jobplanet_status: 'not_found',
      jobplanet_rating: null,
      jobplanet_review_count: null,
      jobplanet_url: null,
    });

    repo.close();
    db.close();
  });

  it('looks up collector results by normalized search key while updating the original DB key', async () => {
    const db = createDb();
    db.prepare(
      `INSERT INTO company_profiles (
        normalized_company, company_display, jobplanet_status, updated_at
      ) VALUES (?, ?, 'not_collected', ?)`
    ).run('(주)example labs', '(주)Example Labs', '2026-05-02T00:00:00.000Z');
    const repo = new SearchJobsRepo(db);

    const result = await runLiveJobPlanetProfiles({
      repo,
      limit: 1,
      retryStatus: 'not_collected',
      now: () => new Date('2026-05-02T02:00:00.000Z'),
      service: {
        async collect(names) {
          expect(names).toEqual(['(주)example labs']);
          return new Map([
            [
              'example labs',
              {
                status: 'ok',
                companyInfo: {
                  name: 'Example Labs',
                  normalizedName: 'example labs',
                  rating: 4.4,
                  reviewCount: 9,
                  jobplanetUrl: 'https://www.jobplanet.co.kr/companies/9',
                  matchConfidence: 'exact',
                },
              },
            ],
          ]);
        },
      },
    });

    expect(result.okTotal).toBe(1);
    expect(
      db
        .prepare('SELECT jobplanet_status, jobplanet_rating FROM company_profiles WHERE normalized_company = ?')
        .get('(주)example labs'),
    ).toEqual({
      jobplanet_status: 'ok',
      jobplanet_rating: 4.4,
    });

    repo.close();
    db.close();
  });

  it('can retry not_found targets without resetting the DB first', async () => {
    const db = createDb();
    db.prepare("UPDATE company_profiles SET jobplanet_status='not_found' WHERE normalized_company='beta studio'").run();
    const repo = new SearchJobsRepo(db);

    const result = await runLiveJobPlanetProfiles({
      repo,
      limit: null,
      retryStatus: 'not_found',
      now: () => new Date('2026-05-02T02:00:00.000Z'),
      service: {
        async collect(names) {
          expect(names).toEqual(['beta studio']);
          return new Map([
            [
              'beta studio',
              {
                status: 'ok',
                companyInfo: {
                  name: 'Beta Studio',
                  normalizedName: 'beta studio',
                  rating: 4.1,
                  reviewCount: 11,
                  jobplanetUrl: 'https://www.jobplanet.co.kr/companies/22',
                  matchConfidence: 'exact',
                },
              },
            ],
          ]);
        },
      },
    });

    expect(result.okTotal).toBe(1);
    expect(
      db
        .prepare('SELECT jobplanet_status, jobplanet_rating FROM company_profiles WHERE normalized_company = ?')
        .get('beta studio'),
    ).toEqual({
      jobplanet_status: 'ok',
      jobplanet_rating: 4.1,
    });

    repo.close();
    db.close();
  });
});
