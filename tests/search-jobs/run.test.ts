import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchJobsRepo } from '../../src/db/search-jobs-repo.js';
import { parseSearchPlanArgs } from '../../src/search-jobs/search-plan.js';
import { runSearchJobs } from '../../src/search-jobs/run.js';
import type { SearchPlan } from '../../src/search-jobs/types.js';
import type { WantedCollectionResult } from '../../src/sources/wanted/collector.js';
import type { WantedDetailResponse, WantedNamedQuery } from '../../src/sources/wanted/types.js';

let tempDirs: string[] = [];

function makeTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'search-jobs-run-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function tempPlan(): SearchPlan {
  const root = makeTempRoot();
  return {
    ...parseSearchPlanArgs([]),
    dbPath: join(root, 'headhunter.db'),
    resultsDir: join(root, 'results'),
  };
}

function query(): WantedNamedQuery {
  return {
    key: 'node_backend_public_demo',
    profile: 'Node-family backend research profile',
    years: 7,
    maxCandidates: 10,
    pageSize: 100,
    urlSeeds: [],
    apiQueries: ['Backend'],
    notes: 'test',
  };
}

function detail(overrides: Partial<NonNullable<WantedDetailResponse['job']>> = {}): WantedDetailResponse {
  return {
    job: {
      id: 111,
      position: 'Node.js 백엔드 개발자',
      company: { name: 'Alpha Labs' },
      annual_from: 5,
      annual_to: 10,
      address: { location: '서울', full_location: '서울 강남구' },
      due_time: '2026-06-30',
      category_tag: { parent_id: 518, id: 895, text: '서버 개발자' },
      skill_tags: [{ title: 'Node.js' }, { title: 'TypeScript' }],
      detail: {
        intro: 'Alpha Labs는 API 플랫폼을 만듭니다.',
        main_tasks: 'Node.js 기반 서버 개발',
        requirements: '백엔드 개발 5년 이상',
        preferred_points: 'NestJS 경험',
      },
      ...overrides,
    },
  };
}

function collection(details: WantedCollectionResult['details']): WantedCollectionResult {
  return {
    status: 'ok',
    details,
    seedFailures: [],
    detailFailures: [],
  };
}

describe('runSearchJobs', () => {
  it('orchestrates collection, filtering, markdown, and db persistence for a completed Wanted run', async () => {
    const plan = tempPlan();

    const result = await runSearchJobs(plan, {
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      runId: 'run-1',
      query: query(),
      collection: collection([
        {
          id: 111,
          key: 'wanted:111',
          seedKeys: ['query:Backend'],
          detail: detail(),
        },
      ]),
    });

    expect(result.status).toBe('completed');
    expect(result.runId).toBe('run-1');
    expect(result.markdownPath.endsWith('run-1-wanted.md')).toBe(true);
    expect(result.counts.listCandidateTotal).toBe(1);
    expect(result.counts.detailTotal).toBe(1);
    expect(result.counts.filteredIn).toBe(1);
    expect(existsSync(result.markdownPath)).toBe(true);
    expect(readFileSync(result.markdownPath, 'utf8')).toContain('[wanted:111] Node.js 백엔드 개발자');

    const repo = new SearchJobsRepo(plan.dbPath);
    try {
      expect(repo.lookupRun('run-1')?.status).toBe('completed');
      expect(repo.lookupListing('wanted:111')?.title).toBe('Node.js 백엔드 개발자');
      expect(repo.countObservations()).toBe(1);
    } finally {
      repo.close();
    }
  });

  it('returns completed_empty when collected details are rejected by the backend filter', async () => {
    const plan = tempPlan();

    const result = await runSearchJobs(plan, {
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      runId: 'run-1',
      query: query(),
      collection: collection([
        {
          id: 111,
          key: 'wanted:111',
          seedKeys: ['query:Backend'],
          detail: detail({
            position: 'Frontend Engineer',
            category_tag: { parent_id: 518, id: 873, text: '프론트엔드 개발자' },
            skill_tags: [{ title: 'React' }],
            detail: {
              intro: '사용자 화면을 만듭니다.',
              main_tasks: 'React UI 개발',
              requirements: '프론트엔드 개발 경험',
            },
          }),
        },
      ]),
    });

    expect(result.status).toBe('completed_empty');
    expect(result.counts.filteredIn).toBe(0);
    expect(result.counts.filteredOut).toBe(1);
  });

  it('returns completed_empty when collection has failures but no listing passes the filter', async () => {
    const plan = tempPlan();

    const result = await runSearchJobs(plan, {
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      runId: 'run-1',
      query: query(),
      collection: {
        status: 'partial',
        details: [
          {
            id: 111,
            key: 'wanted:111',
            seedKeys: ['query:Frontend'],
            detail: detail({
              position: '프론트엔드 개발자',
              category_tag: { parent_id: 518, id: 873, text: '프론트엔드 개발자' },
              skill_tags: [{ title: 'React' }],
              detail: {
                intro: '사용자 화면을 만듭니다.',
                main_tasks: 'React UI 개발',
                requirements: '프론트엔드 개발 경험',
              },
            }),
          },
        ],
        seedFailures: [{ key: 'query:Backend', kind: 'failed', message: 'network failed' }],
        detailFailures: [],
      },
    });

    expect(result.status).toBe('completed_empty');
    expect(result.counts.searchSeedFailed).toBe(1);
    expect(result.counts.filteredIn).toBe(0);
    expect(result.errorReason).toContain('query:Backend');
  });

  it('generates distinct default run ids and markdown paths for runs in the same millisecond', async () => {
    const plan = tempPlan();
    const deps = {
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      query: query(),
      collection: collection([
        {
          id: 111,
          key: 'wanted:111',
          seedKeys: ['query:Backend'],
          detail: detail(),
        },
      ]),
    };

    const first = await runSearchJobs(plan, deps);
    const second = await runSearchJobs(plan, deps);

    expect(first.runId).not.toBe(second.runId);
    expect(first.markdownPath).not.toBe(second.markdownPath);
    expect(existsSync(first.markdownPath)).toBe(true);
    expect(existsSync(second.markdownPath)).toBe(true);
  });

  it('returns and persists a failed run when normalization fails after collection', async () => {
    const plan = tempPlan();

    const result = await runSearchJobs(plan, {
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      runId: 'run-1',
      query: query(),
      collection: collection([
        {
          id: 111,
          key: 'wanted:111',
          seedKeys: ['query:Backend'],
          detail: { job: null },
        },
      ]),
    });

    expect(result.status).toBe('failed');
    expect(result.runId).toBe('run-1');
    expect(result.counts.detailTotal).toBe(1);
    expect(result.counts.normalizedTotal).toBe(0);
    expect(result.counts.filteredIn).toBe(0);
    expect(result.errorReason).toContain('Wanted detail payload has no job for wanted:111');

    const db = new Database(plan.dbPath, { readonly: true });
    try {
      const row = db
        .prepare('SELECT status, error_reason AS errorReason FROM search_runs WHERE run_id = ?')
        .get('run-1') as { readonly status: string; readonly errorReason: string } | undefined;
      expect(row?.status).toBe('failed');
      expect(row?.errorReason).toContain('Wanted detail payload has no job for wanted:111');
    } finally {
      db.close();
    }
  });

  it('keeps collection failures when a later pipeline failure marks the run failed', async () => {
    const plan = tempPlan();

    const result = await runSearchJobs(plan, {
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      runId: 'run-1',
      query: query(),
      collection: {
        status: 'partial',
        details: [
          {
            id: 111,
            key: 'wanted:111',
            seedKeys: ['query:Backend'],
            detail: { job: null },
          },
        ],
        seedFailures: [{ key: 'query:Backend', kind: 'failed', message: 'seed timeout' }],
        detailFailures: [],
      },
    });

    expect(result.status).toBe('failed');
    expect(result.errorReason).toContain('search:query:Backend:seed timeout');
    expect(result.errorReason).toContain('pipeline:pipeline:Wanted detail payload has no job for wanted:111');
    expect(readFileSync(result.markdownPath, 'utf8')).toContain('query:Backend: seed timeout');
    expect(readFileSync(result.markdownPath, 'utf8')).toContain(
      'pipeline: Wanted detail payload has no job for wanted:111',
    );

    const db = new Database(plan.dbPath, { readonly: true });
    try {
      const row = db
        .prepare('SELECT error_reason AS errorReason FROM search_runs WHERE run_id = ?')
        .get('run-1') as { readonly errorReason: string } | undefined;
      expect(row?.errorReason).toContain('search:query:Backend:seed timeout');
      expect(row?.errorReason).toContain('pipeline:pipeline:Wanted detail payload has no job for wanted:111');
    } finally {
      db.close();
    }
  });
});
