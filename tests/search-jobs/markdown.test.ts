import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSearchMarkdown, writeSearchMarkdown, type MarkdownInput } from '../../src/search-jobs/markdown.js';
import type { CanonicalJobListing } from '../../src/search-jobs/types.js';

let tempRoot: string | undefined;

function makeTempRoot(): string {
  tempRoot = mkdtempSync(join(tmpdir(), 'search-jobs-markdown-'));
  return tempRoot;
}

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { force: true, recursive: true });
    tempRoot = undefined;
  }
});

function listing(overrides: Partial<CanonicalJobListing> = {}): CanonicalJobListing {
  return {
    sourceMarker: 'wanted:111',
    platform: 'wanted',
    sourceJobId: '111',
    url: 'https://www.wanted.co.kr/wd/111',
    title: 'Node.js 백엔드 개발자',
    categoryText: '서버 개발자',
    company: 'Alpha Labs',
    normalizedCompany: 'alpha labs',
    location: '서울',
    experienceText: '경력 5-10년',
    experienceMin: 5,
    experienceMax: 10,
    experienceParseConfidence: 'exact',
    deadlineText: '2026-06-30',
    deadlineDate: '2026-06-30',
    requiredSkills: ['Node.js', 'TypeScript'],
    preferredSkills: [],
    detailText: 'Node.js API 서버를 개발합니다.',
    backendFilterStatus: 'pass',
    backendFilterReason: 'role_text:title',
    raw: {},
    ...overrides,
  };
}

function input(overrides: Partial<MarkdownInput> = {}): MarkdownInput {
  return {
    runId: 'run-20260501-000001',
    profile: 'Node-family backend research profile',
    source: 'wanted',
    queryKey: 'node_backend_public_demo',
    wantedUrl: 'https://www.wanted.co.kr/wdlist/518/895?years=7',
    status: 'completed',
    dbPath: 'data/search-jobs.sqlite',
    startedAt: '2026-05-01T00:00:00.000Z',
    finishedAt: '2026-05-01T00:01:00.000Z',
    counts: {
      searchSeedTotal: 1,
      searchSeedFailed: 0,
      candidateTotal: 2,
      detailTotal: 2,
      detailFailed: 0,
      normalizedTotal: 2,
      filteredIn: 1,
      filteredOut: 1,
    },
    failures: [{ stage: 'detail', message: 'wanted detail failed for 222' }],
    listings: [listing()],
    ...overrides,
  };
}

function frontmatter(markdown: string): string {
  const closingIndex = markdown.indexOf('\n---\n', 4);
  expect(closingIndex).toBeGreaterThan(0);
  return markdown.slice(0, closingIndex + '\n---'.length);
}

describe('search jobs markdown renderer', () => {
  it('renders frontmatter, counts, failures, and Wanted listing rows', () => {
    makeTempRoot();

    const markdown = renderSearchMarkdown(input());
    const yaml = frontmatter(markdown);

    expect(yaml).toContain('skill: "search-jobs"');
    expect(yaml).toContain('runId: "run-20260501-000001"');
    expect(yaml).toContain('profile: "Node-family backend research profile"');
    expect(yaml).toContain('source: "wanted"');
    expect(yaml).toContain('queryKey: "node_backend_public_demo"');
    expect(yaml).toContain('wantedUrl: "https://www.wanted.co.kr/wdlist/518/895?years=7"');
    expect(yaml).toContain('status: "completed"');
    expect(yaml).toContain('dbPath: "data/search-jobs.sqlite"');
    expect(yaml).toContain('startedAt: "2026-05-01T00:00:00.000Z"');
    expect(yaml).toContain('finishedAt: "2026-05-01T00:01:00.000Z"');
    expect(yaml).toContain('counts:\n  searchSeedTotal: 1');
    expect(yaml).toContain('  filteredIn: 1');
    expect(yaml).toContain('failures:\n  - stage: "detail"\n    message: "wanted detail failed for 222"');
    expect(markdown).toContain('## Counts');
    expect(markdown).toContain('filteredIn: 1');
    expect(markdown).toContain('## Failures');
    expect(markdown).toContain('- detail: wanted detail failed for 222');
    expect(markdown).toContain(
      '[wanted:111] Node.js 백엔드 개발자 · Alpha Labs · 서울 · 경력 5-10년 · Node.js, TypeScript · deadline 2026-06-30',
    );
    expect(markdown).toContain('  https://www.wanted.co.kr/wd/111');
  });

  it('writes markdown to the requested results directory', () => {
    const resultsDir = join(makeTempRoot(), 'nested', 'results');

    const path = writeSearchMarkdown(resultsDir, input({ failures: [], listings: [] }));

    expect(path).toBe(join(resultsDir, 'run-20260501-000001-wanted.md'));
    expect(existsSync(resultsDir)).toBe(true);
    const markdown = readFileSync(path, 'utf8');
    expect(frontmatter(markdown)).toContain('failures:\n  []');
    expect(markdown).toContain('검색 결과가 없습니다.');
  });
});
