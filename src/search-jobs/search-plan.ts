import { parseWantedWdlistUrl } from '../sources/wanted/url.js';
import type { SearchPlan } from './types.js';

export const DEFAULT_PROFILE = 'Node-family backend research profile';
export const DEFAULT_YEARS = 5;
export const DEFAULT_QUERY_KEY = 'node_backend_public_demo';
export const DEFAULT_REMEMBER_QUERY_KEY = 'node_backend_remember';
export const DEFAULT_REMEMBER_KEYWORD = '백엔드';
export const DEFAULT_DB_PATH = 'data/headhunter.db';
export const DEFAULT_RESULTS_DIR = 'results/search-jobs';
export const DEFAULT_WANTED_URL =
  'https://www.wanted.co.kr/wdlist/518/895?country=kr&job_sort=job.popularity_order&years=5&years=10&employment_types=job.employment_type.regular&locations=all';

const WANTED_URL_ERROR = '--url must be a Wanted wdlist URL.';

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function assertNoUnexpectedArgs(args: readonly string[], allowed: readonly string[], message: string): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (allowed.includes(arg)) {
      index += 1;
      continue;
    }
    throw new Error(message);
  }
}

function assertOptionProvidedOnce(args: readonly string[], name: string): void {
  const count = args.filter((arg) => arg === name).length;
  if (count > 1) {
    throw new Error(`${name} can only be provided once.`);
  }
}

function validateWantedWdlistUrl(value: string): string {
  try {
    parseWantedWdlistUrl(value);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(WANTED_URL_ERROR);
    }
    throw error;
  }
  return value;
}

function defaultPlan(overrides: Partial<Pick<SearchPlan, 'queryKey' | 'wantedUrl'>> = {}): SearchPlan {
  return {
    source: 'wanted',
    profile: DEFAULT_PROFILE,
    years: DEFAULT_YEARS,
    queryKey: overrides.queryKey,
    wantedUrl: overrides.wantedUrl,
    includeDetail: true,
    dbPath: DEFAULT_DB_PATH,
    resultsDir: DEFAULT_RESULTS_DIR,
    outputs: ['sqlite', 'markdown'],
  };
}

function defaultRememberPlan(overrides: Partial<Pick<SearchPlan, 'queryKey'>> = {}): SearchPlan {
  return {
    source: 'remember',
    profile: DEFAULT_PROFILE,
    years: DEFAULT_YEARS,
    queryKey: overrides.queryKey,
    includeDetail: true,
    dbPath: DEFAULT_DB_PATH,
    resultsDir: DEFAULT_RESULTS_DIR,
    outputs: ['sqlite', 'markdown'],
  };
}

export function parseSearchPlanArgs(args: readonly string[]): SearchPlan {
  if (args.length === 0) return defaultPlan({ queryKey: DEFAULT_QUERY_KEY });

  if (args[0] !== 'wanted' && args[0] !== 'remember') {
    throw new Error('Supported sources: wanted, remember.');
  }

  if (args[0] === 'remember') {
    const optionArgs = args.slice(1);
    assertNoUnexpectedArgs(optionArgs, ['--query'], 'remember accepts only --query <key>.');
    assertOptionProvidedOnce(optionArgs, '--query');
    return defaultRememberPlan({ queryKey: readOption(optionArgs, '--query') ?? DEFAULT_REMEMBER_QUERY_KEY });
  }

  const optionArgs = args.slice(1);
  assertNoUnexpectedArgs(
    optionArgs,
    ['--query', '--url'],
    'wanted accepts only --query <key> or --url <Wanted wdlist URL>.',
  );
  assertOptionProvidedOnce(optionArgs, '--query');
  assertOptionProvidedOnce(optionArgs, '--url');

  const queryKey = readOption(optionArgs, '--query');
  const wantedUrl = readOption(optionArgs, '--url');
  if (queryKey && wantedUrl) {
    throw new Error('Use either --query or --url, not both.');
  }

  if (wantedUrl) {
    return defaultPlan({ wantedUrl: validateWantedWdlistUrl(wantedUrl) });
  }

  return defaultPlan({ queryKey: queryKey ?? DEFAULT_QUERY_KEY });
}
