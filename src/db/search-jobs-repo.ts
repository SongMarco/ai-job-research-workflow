import type Database from 'better-sqlite3';
import type { CanonicalJobListing, RunStatus, SourceId } from '../search-jobs/types.js';
import { openSearchJobsDatabase } from './connection.js';
import { ensureSchema } from './schema.js';

export interface ObservationInput {
  readonly runId: string;
  readonly sourceMarker: string;
  readonly queryKey: string | null;
  readonly rowIndex: number;
  readonly observedAt: string;
  readonly contentHash: string;
  readonly rawMetadata: Record<string, unknown>;
}

export interface RunResultInput {
  readonly runId: string;
  readonly source: SourceId;
  readonly profile: string;
  readonly queryKey: string | null;
  readonly wantedUrl: string | null;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly markdownPath: string | null;
  readonly counts: Record<string, unknown>;
  readonly errorReason: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly listings: readonly CanonicalJobListing[];
  readonly observations: readonly ObservationInput[];
}

export type JobPlanetProfileStatus = 'not_collected' | 'ok' | 'not_found' | 'blocked' | 'failed';

export interface CompanyJobPlanetProfile {
  readonly normalizedCompany: string;
  readonly companyDisplay: string;
  readonly jobplanetStatus: JobPlanetProfileStatus;
  readonly jobplanetRating: number | null;
  readonly jobplanetReviewCount: number | null;
  readonly jobplanetUrl: string | null;
  readonly jobplanetObservedAt: string | null;
  readonly rawMetadata: Record<string, unknown>;
}

export interface CompanyJobPlanetProfileUpdate extends CompanyJobPlanetProfile {
  readonly updatedAt: string;
}

interface CompanyProfileRow {
  readonly normalized_company: string;
  readonly company_display: string;
  readonly jobplanet_status: JobPlanetProfileStatus;
  readonly jobplanet_rating: number | null;
  readonly jobplanet_review_count: number | null;
  readonly jobplanet_url: string | null;
  readonly jobplanet_observed_at: string | null;
  readonly raw_metadata_json: string;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return null;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

export class SearchJobsRepo {
  private readonly db: Database.Database;
  private readonly closeOnFinish: boolean;
  private readonly recordRunResultTx: (input: RunResultInput) => void;
  private readonly listCompanyProfilesStmt: Database.Statement;
  private readonly updateCompanyJobPlanetProfileStmt: Database.Statement;

  constructor(pathOrDb: string | Database.Database) {
    if (typeof pathOrDb === 'string') {
      this.db = openSearchJobsDatabase(pathOrDb);
      this.closeOnFinish = true;
    } else {
      this.db = pathOrDb;
      this.db.pragma('foreign_keys = ON');
      ensureSchema(this.db);
      this.closeOnFinish = false;
    }

    const upsertRun = this.db.prepare(`
      INSERT INTO search_runs (
        run_id, source, profile, query_key, wanted_url, status, started_at, finished_at,
        markdown_path, counts_json, error_reason, metadata_json
      ) VALUES (
        @run_id, @source, @profile, @query_key, @wanted_url, @status, @started_at, @finished_at,
        @markdown_path, @counts_json, @error_reason, @metadata_json
      )
      ON CONFLICT(run_id) DO UPDATE SET
        source = excluded.source,
        profile = excluded.profile,
        query_key = excluded.query_key,
        wanted_url = excluded.wanted_url,
        status = excluded.status,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        markdown_path = excluded.markdown_path,
        counts_json = excluded.counts_json,
        error_reason = excluded.error_reason,
        metadata_json = excluded.metadata_json
    `);

    const upsertListing = this.db.prepare(`
      INSERT INTO job_listings (
        source_marker, platform, source_job_id, url, title, category_text, company, normalized_company,
        location, experience_text, experience_min, experience_max, experience_parse_confidence,
        deadline_text, deadline_date, required_skills_json, preferred_skills_json, detail_text,
        backend_filter_status, backend_filter_reason, raw_json, first_seen_at, last_seen_at
      ) VALUES (
        @source_marker, @platform, @source_job_id, @url, @title, @category_text, @company,
        @normalized_company, @location, @experience_text, @experience_min, @experience_max,
        @experience_parse_confidence, @deadline_text, @deadline_date, @required_skills_json,
        @preferred_skills_json, @detail_text, @backend_filter_status, @backend_filter_reason,
        @raw_json, @first_seen_at, @last_seen_at
      )
      ON CONFLICT(source_marker) DO UPDATE SET
        platform = excluded.platform,
        source_job_id = excluded.source_job_id,
        url = excluded.url,
        title = excluded.title,
        category_text = excluded.category_text,
        company = excluded.company,
        normalized_company = excluded.normalized_company,
        location = excluded.location,
        experience_text = excluded.experience_text,
        experience_min = excluded.experience_min,
        experience_max = excluded.experience_max,
        experience_parse_confidence = excluded.experience_parse_confidence,
        deadline_text = excluded.deadline_text,
        deadline_date = excluded.deadline_date,
        required_skills_json = excluded.required_skills_json,
        preferred_skills_json = excluded.preferred_skills_json,
        detail_text = excluded.detail_text,
        backend_filter_status = excluded.backend_filter_status,
        backend_filter_reason = excluded.backend_filter_reason,
        raw_json = excluded.raw_json,
        last_seen_at = excluded.last_seen_at
    `);

    const upsertCompany = this.db.prepare(`
      INSERT INTO company_profiles (
        normalized_company, company_display, jobplanet_status, raw_metadata_json, updated_at
      ) VALUES (
        @normalized_company, @company_display, 'not_collected', '{}', @updated_at
      )
      ON CONFLICT(normalized_company) DO UPDATE SET
        company_display = excluded.company_display,
        updated_at = excluded.updated_at
    `);

    const upsertObservation = this.db.prepare(`
      INSERT INTO job_listing_observations (
        run_id, source_marker, query_key, row_index, observed_at, content_hash, raw_metadata_json
      ) VALUES (
        @run_id, @source_marker, @query_key, @row_index, @observed_at, @content_hash, @raw_metadata_json
      )
      ON CONFLICT(run_id, source_marker) DO UPDATE SET
        query_key = excluded.query_key,
        row_index = excluded.row_index,
        observed_at = excluded.observed_at,
        content_hash = excluded.content_hash,
        raw_metadata_json = excluded.raw_metadata_json
    `);

    this.listCompanyProfilesStmt = this.db.prepare(`
      SELECT
        normalized_company,
        company_display,
        jobplanet_status,
        jobplanet_rating,
        jobplanet_review_count,
        jobplanet_url,
        jobplanet_observed_at,
        raw_metadata_json
      FROM company_profiles
      ORDER BY normalized_company
    `);

    this.updateCompanyJobPlanetProfileStmt = this.db.prepare(`
      UPDATE company_profiles
      SET
        company_display = @company_display,
        jobplanet_status = @jobplanet_status,
        jobplanet_rating = @jobplanet_rating,
        jobplanet_review_count = @jobplanet_review_count,
        jobplanet_url = @jobplanet_url,
        jobplanet_observed_at = @jobplanet_observed_at,
        raw_metadata_json = @raw_metadata_json,
        updated_at = @updated_at
      WHERE normalized_company = @normalized_company
    `);

    this.recordRunResultTx = this.db.transaction((input: RunResultInput) => {
      upsertRun.run({
        run_id: input.runId,
        source: input.source,
        profile: input.profile,
        query_key: input.queryKey,
        wanted_url: input.wantedUrl,
        status: input.status,
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        markdown_path: input.markdownPath,
        counts_json: stringifyJson(input.counts),
        error_reason: input.errorReason,
        metadata_json: stringifyJson(input.metadata ?? {}),
      });

      const seenAt = input.finishedAt ?? input.startedAt;
      for (const listing of input.listings) {
        upsertListing.run({
          source_marker: listing.sourceMarker,
          platform: listing.platform,
          source_job_id: listing.sourceJobId,
          url: listing.url,
          title: listing.title,
          category_text: listing.categoryText,
          company: listing.company,
          normalized_company: listing.normalizedCompany,
          location: listing.location,
          experience_text: listing.experienceText,
          experience_min: listing.experienceMin,
          experience_max: listing.experienceMax,
          experience_parse_confidence: listing.experienceParseConfidence,
          deadline_text: listing.deadlineText,
          deadline_date: listing.deadlineDate,
          required_skills_json: stringifyJson(listing.requiredSkills),
          preferred_skills_json: stringifyJson(listing.preferredSkills),
          detail_text: listing.detailText,
          backend_filter_status: listing.backendFilterStatus,
          backend_filter_reason: listing.backendFilterReason,
          raw_json: stringifyJson(listing.raw),
          first_seen_at: seenAt,
          last_seen_at: seenAt,
        });
        upsertCompany.run({
          normalized_company: listing.normalizedCompany,
          company_display: listing.company,
          updated_at: seenAt,
        });
      }

      for (const observation of input.observations) {
        upsertObservation.run({
          run_id: observation.runId,
          source_marker: observation.sourceMarker,
          query_key: observation.queryKey,
          row_index: observation.rowIndex,
          observed_at: observation.observedAt,
          content_hash: observation.contentHash,
          raw_metadata_json: stringifyJson(observation.rawMetadata),
        });
      }
    });
  }

  recordRunResult(input: RunResultInput): void {
    this.recordRunResultTx(input);
  }

  lookupListing(sourceMarker: string): { readonly title: string; readonly categoryText: string } | undefined {
    return this.db
      .prepare('SELECT title, category_text AS categoryText FROM job_listings WHERE source_marker = ?')
      .get(sourceMarker) as { readonly title: string; readonly categoryText: string } | undefined;
  }

  lookupCompanyProfile(normalizedCompany: string): { readonly jobplanetStatus: string } | undefined {
    return this.db
      .prepare(
        'SELECT jobplanet_status AS jobplanetStatus FROM company_profiles WHERE normalized_company = ?',
      )
      .get(normalizedCompany) as { readonly jobplanetStatus: string } | undefined;
  }

  lookupRun(runId: string): { readonly status: RunStatus } | undefined {
    return this.db.prepare('SELECT status FROM search_runs WHERE run_id = ?').get(runId) as
      | { readonly status: RunStatus }
      | undefined;
  }

  countObservations(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM job_listing_observations').get() as {
      readonly count: number;
    };
    return row.count;
  }

  listCompanyProfilesForJobPlanet(): CompanyJobPlanetProfile[] {
    return (this.listCompanyProfilesStmt.all() as CompanyProfileRow[]).map((row) => ({
      normalizedCompany: row.normalized_company,
      companyDisplay: row.company_display,
      jobplanetStatus: row.jobplanet_status,
      jobplanetRating: row.jobplanet_rating,
      jobplanetReviewCount: row.jobplanet_review_count,
      jobplanetUrl: row.jobplanet_url,
      jobplanetObservedAt: row.jobplanet_observed_at,
      rawMetadata: parseJsonObject(row.raw_metadata_json),
    }));
  }

  updateCompanyJobPlanetProfile(input: CompanyJobPlanetProfileUpdate): boolean {
    const result = this.updateCompanyJobPlanetProfileStmt.run({
      normalized_company: input.normalizedCompany,
      company_display: input.companyDisplay,
      jobplanet_status: input.jobplanetStatus,
      jobplanet_rating: input.jobplanetRating,
      jobplanet_review_count: input.jobplanetReviewCount,
      jobplanet_url: input.jobplanetUrl,
      jobplanet_observed_at: input.jobplanetObservedAt,
      raw_metadata_json: stringifyJson(input.rawMetadata),
      updated_at: input.updatedAt,
    });
    return result.changes > 0;
  }

  close(): void {
    if (this.closeOnFinish) this.db.close();
  }
}
