#!/usr/bin/env node
import Database from 'better-sqlite3';
import { basename } from 'node:path';
import { SearchJobsRepo } from '../db/search-jobs-repo.js';
import { BrowserPool } from './browser-pool.js';
import { importLegacyJobPlanetProfiles } from './legacy-import.js';
import { JobPlanetCompanyProfileService } from './live-collect.js';
import { runLiveJobPlanetProfiles } from './live-run.js';

const DEFAULT_DB_PATH = 'data/headhunter.db';
const DEFAULT_LEGACY_DB_PATH = '/Users/youngchansong/Documents/projects/job-finder/data/lineage-catalog.db';

export interface JobPlanetCompanyProfilesArgs {
  readonly dbPath: string;
  readonly legacyDbPath: string;
  readonly dryRun: boolean;
  readonly headless: boolean;
  readonly limit: number | null;
  readonly live: boolean;
  readonly retryStatus: 'not_collected' | 'not_found';
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

export function parseJobPlanetCompanyProfilesArgs(args: readonly string[]): JobPlanetCompanyProfilesArgs {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const allowed = new Set([
    '--db-path',
    '--legacy-db-path',
    '--dry-run',
    '--live',
    '--limit',
    '--headed',
    '--retry-status',
  ]);
  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (!allowed.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (!['--dry-run', '--live', '--headed'].includes(arg)) index += 1;
  }

  const limitValue = readOption(normalizedArgs, '--limit');
  const limit = limitValue === undefined ? null : Number(limitValue);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('--limit requires a positive integer.');
  }
  const retryStatus = readOption(normalizedArgs, '--retry-status') ?? 'not_collected';
  if (!['not_collected', 'not_found'].includes(retryStatus)) {
    throw new Error('--retry-status must be not_collected or not_found.');
  }

  return {
    dbPath: readOption(normalizedArgs, '--db-path') ?? DEFAULT_DB_PATH,
    legacyDbPath: readOption(normalizedArgs, '--legacy-db-path') ?? DEFAULT_LEGACY_DB_PATH,
    dryRun: normalizedArgs.includes('--dry-run'),
    headless: !normalizedArgs.includes('--headed'),
    limit,
    live: normalizedArgs.includes('--live'),
    retryStatus: retryStatus as 'not_collected' | 'not_found',
  };
}

export async function runJobPlanetCompanyProfiles(
  args: JobPlanetCompanyProfilesArgs,
): Promise<ReturnType<typeof importLegacyJobPlanetProfiles> | Awaited<ReturnType<typeof runLiveJobPlanetProfiles>>> {
  if (args.live) {
    const repo = new SearchJobsRepo(args.dbPath);
    const browserPool = new BrowserPool({ headless: args.headless });
    try {
      return await runLiveJobPlanetProfiles({
        repo,
        service: new JobPlanetCompanyProfileService({ browserPool }),
        limit: args.limit,
        retryStatus: args.retryStatus,
        now: () => new Date(),
        dryRun: args.dryRun,
      });
    } finally {
      await browserPool.close();
      repo.close();
    }
  }

  const currentDb = new Database(args.dbPath, { fileMustExist: true });
  const legacyDb = new Database(args.legacyDbPath, { readonly: true, fileMustExist: true });
  try {
    currentDb.pragma('foreign_keys = ON');
    return importLegacyJobPlanetProfiles({
      currentDb,
      legacyDb,
      observedAt: new Date().toISOString(),
      dryRun: args.dryRun,
    });
  } finally {
    legacyDb.close();
    currentDb.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const args = parseJobPlanetCompanyProfilesArgs(argv.slice(2));
  const result = await runJobPlanetCompanyProfiles(args);
  if ('currentCompanyTotal' in result) {
    console.log(`current_companies: ${result.currentCompanyTotal}`);
    console.log(`legacy_profiles: ${result.legacyProfileTotal}`);
    console.log(`matched_profiles: ${result.matchedTotal}`);
    console.log(`imported_profiles: ${result.importedTotal}`);
    console.log(`skipped_partial_profiles: ${result.skippedPartialTotal}`);
  } else {
    console.log(`target_companies: ${result.targetTotal}`);
    console.log(`attempted_companies: ${result.attemptedTotal}`);
    console.log(`upserted_profiles: ${result.upsertedTotal}`);
    console.log(`ok_profiles: ${result.okTotal}`);
    console.log(`not_found_profiles: ${result.notFoundTotal}`);
    console.log(`blocked_profiles: ${result.blockedTotal}`);
    console.log(`failed_profiles: ${result.failedTotal}`);
  }
  console.log(`db_path: ${args.dbPath}`);
  return 0;
}

if (['cli.ts', 'cli.js'].includes(basename(process.argv[1] ?? ''))) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
