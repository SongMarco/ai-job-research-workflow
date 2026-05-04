import type Database from 'better-sqlite3';
import { runMigrations, type Migration } from './migrations.js';

const v1: Migration = {
  version: 1,
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_runs (
        run_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        profile TEXT NOT NULL,
        query_key TEXT,
        wanted_url TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_empty', 'partial', 'blocked', 'failed')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        markdown_path TEXT,
        counts_json TEXT NOT NULL DEFAULT '{}',
        error_reason TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS job_listings (
        source_marker TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        category_text TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL,
        normalized_company TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        experience_text TEXT NOT NULL DEFAULT '',
        experience_min INTEGER,
        experience_max INTEGER,
        experience_parse_confidence TEXT,
        deadline_text TEXT,
        deadline_date TEXT,
        required_skills_json TEXT NOT NULL DEFAULT '[]',
        preferred_skills_json TEXT NOT NULL DEFAULT '[]',
        detail_text TEXT NOT NULL DEFAULT '',
        backend_filter_status TEXT NOT NULL,
        backend_filter_reason TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        UNIQUE(platform, source_job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_job_listings_company ON job_listings(normalized_company);
      CREATE INDEX IF NOT EXISTS idx_job_listings_last_seen ON job_listings(last_seen_at);
      CREATE INDEX IF NOT EXISTS idx_job_listings_deadline ON job_listings(deadline_date);

      CREATE TABLE IF NOT EXISTS job_listing_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        source_marker TEXT NOT NULL,
        query_key TEXT,
        row_index INTEGER NOT NULL,
        observed_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        raw_metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(run_id) REFERENCES search_runs(run_id) ON DELETE CASCADE,
        FOREIGN KEY(source_marker) REFERENCES job_listings(source_marker) ON DELETE CASCADE,
        UNIQUE(run_id, source_marker)
      );

      CREATE INDEX IF NOT EXISTS idx_job_observations_source_marker ON job_listing_observations(source_marker);

      CREATE TABLE IF NOT EXISTS company_profiles (
        normalized_company TEXT PRIMARY KEY,
        company_display TEXT NOT NULL,
        jobplanet_status TEXT NOT NULL DEFAULT 'not_collected' CHECK (jobplanet_status IN ('not_collected', 'ok', 'not_found', 'blocked', 'failed')),
        jobplanet_rating REAL,
        jobplanet_review_count INTEGER,
        jobplanet_url TEXT,
        jobplanet_observed_at TEXT,
        raw_metadata_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );
    `);
  },
};

export const MIGRATIONS: readonly Migration[] = [v1];

export function ensureSchema(db: Database.Database): void {
  runMigrations(db, MIGRATIONS);
}
