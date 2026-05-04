#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseSearchPlanArgs } from './search-plan.js';
import { runSearchJobs } from './run.js';

export interface SearchJobsCliIo {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

const consoleIo: SearchJobsCliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withoutDryRunFlag(argv: readonly string[]): { readonly dryRun: boolean; readonly args: string[] } {
  const args: string[] = [];
  let dryRun = false;
  for (const [index, arg] of argv.entries()) {
    if (index === 0 && arg === '--') {
      continue;
    }
    if (arg === '--dry-run-plan') {
      dryRun = true;
      continue;
    }
    args.push(arg);
  }
  return { dryRun, args };
}

export async function runCli(argv: readonly string[], io: SearchJobsCliIo = consoleIo): Promise<number> {
  try {
    const parsed = withoutDryRunFlag(argv);
    const plan = parseSearchPlanArgs(parsed.args);

    if (parsed.dryRun) {
      io.log(JSON.stringify(plan, null, 2));
      return 0;
    }

    const result = await runSearchJobs(plan);
    io.log(`status: ${result.status}`);
    io.log(`run_id: ${result.runId}`);
    io.log(`markdown: ${result.markdownPath}`);
    io.log(`filtered_in: ${result.counts.filteredIn}`);
    return result.status === 'failed' || result.status === 'blocked' ? 1 : 0;
  } catch (error) {
    io.error(messageFrom(error));
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry ? import.meta.url === pathToFileURL(entry).href : false;
}

if (isDirectRun()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
