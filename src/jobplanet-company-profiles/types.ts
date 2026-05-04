import type Database from 'better-sqlite3';

export interface LegacyImportInput {
  readonly currentDb: Database.Database;
  readonly legacyDb: Database.Database;
  readonly observedAt: string;
  readonly dryRun: boolean;
}

export interface LegacyImportResult {
  readonly currentCompanyTotal: number;
  readonly legacyProfileTotal: number;
  readonly matchedTotal: number;
  readonly importedTotal: number;
  readonly skippedPartialTotal: number;
}
