import type { LegacyImportInput, LegacyImportResult } from './types.js';

type LegacyStatus = 'ok' | 'not_found' | 'blocked' | 'failed';

interface LegacyProfileRow {
  readonly normalized_company: string;
  readonly company_display: string;
  readonly jobplanet_status: LegacyStatus;
  readonly jobplanet_rating: number | null;
  readonly jobplanet_review_count: number | null;
  readonly jobplanet_url: string | null;
  readonly jobplanet_match_confidence: string | null;
  readonly jobplanet_observed_at: string | null;
  readonly raw_metadata: string;
}

function countRows(db: LegacyImportInput['currentDb'], table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { readonly count: number };
  return row.count;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringifyMetadata(row: LegacyProfileRow): string {
  return JSON.stringify({
    source: 'legacy-job-finder-db',
    legacyNormalizedCompany: row.normalized_company,
    legacyCompanyDisplay: row.company_display,
    legacyMatchConfidence: row.jobplanet_match_confidence,
    legacyRawMetadata: parseJsonObject(row.raw_metadata),
  });
}

function shouldImport(row: LegacyProfileRow): boolean {
  return row.jobplanet_status !== 'ok' || row.jobplanet_match_confidence === 'exact';
}

export function importLegacyJobPlanetProfiles(input: LegacyImportInput): LegacyImportResult {
  const currentCompanyTotal = countRows(input.currentDb, 'company_profiles');
  const legacyProfileTotal = countRows(input.legacyDb, 'company_profiles');
  const currentKeys = new Set(
    (
      input.currentDb
        .prepare('SELECT normalized_company AS normalizedCompany FROM company_profiles')
        .all() as { readonly normalizedCompany: string }[]
    ).map((row) => row.normalizedCompany),
  );
  const legacyRows = input.legacyDb
    .prepare(`
      SELECT
        normalized_company,
        company_display,
        jobplanet_status,
        jobplanet_rating,
        jobplanet_review_count,
        jobplanet_url,
        jobplanet_match_confidence,
        jobplanet_observed_at,
        raw_metadata
      FROM company_profiles
      WHERE jobplanet_status IN ('ok', 'not_found', 'blocked', 'failed')
    `)
    .all() as LegacyProfileRow[];

  const overlappingRows = legacyRows.filter((row) => currentKeys.has(row.normalized_company));
  const matchedRows = overlappingRows.filter(shouldImport);
  const skippedPartialTotal = overlappingRows.length - matchedRows.length;

  if (!input.dryRun) {
    const update = input.currentDb.prepare(`
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

    const updateProfiles = input.currentDb.transaction(() => {
      for (const row of matchedRows) {
        update.run({
          normalized_company: row.normalized_company,
          company_display: row.company_display,
          jobplanet_status: row.jobplanet_status,
          jobplanet_rating: row.jobplanet_rating,
          jobplanet_review_count: row.jobplanet_review_count,
          jobplanet_url: row.jobplanet_url,
          jobplanet_observed_at: row.jobplanet_observed_at ?? input.observedAt,
          raw_metadata_json: stringifyMetadata(row),
          updated_at: input.observedAt,
        });
      }
    });
    updateProfiles();
  }

  return {
    currentCompanyTotal,
    legacyProfileTotal,
    matchedTotal: matchedRows.length,
    importedTotal: input.dryRun ? 0 : matchedRows.length,
    skippedPartialTotal,
  };
}
