import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchJobsRepo } from '../../src/db/search-jobs-repo.js';
import type { CanonicalJobListing } from '../../src/search-jobs/types.js';

let tempDirs: string[] = [];

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-job-research-workflow-'));
  tempDirs.push(dir);
  return join(dir, 'headhunter.db');
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
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
    requiredSkills: ['Node.js'],
    preferredSkills: ['NestJS'],
    detailText: 'REST API 서버 개발',
    backendFilterStatus: 'pass',
    backendFilterReason: 'role_text_backend_evidence',
    raw: { id: 111 },
    ...overrides,
  };
}

describe('SearchJobsRepo', () => {
  it('migrates schema and stores a completed run transaction', () => {
    const repo = new SearchJobsRepo(tempDb());
    try {
      repo.recordRunResult({
        runId: 'run-1',
        source: 'wanted',
        profile: 'Node-family backend research profile',
        queryKey: 'node_backend_public_demo',
        wantedUrl: null,
        status: 'completed',
        startedAt: '2026-05-01T00:00:00.000Z',
        finishedAt: '2026-05-01T00:01:00.000Z',
        markdownPath: 'results/search-jobs/run-1.md',
        counts: { filteredIn: 1 },
        errorReason: null,
        listings: [listing()],
        observations: [
          {
            runId: 'run-1',
            sourceMarker: 'wanted:111',
            queryKey: 'node_backend_public_demo',
            rowIndex: 0,
            observedAt: '2026-05-01T00:01:00.000Z',
            contentHash: 'hash-1',
            rawMetadata: { seedKeys: ['url:0'] },
          },
        ],
      });

      expect(repo.lookupListing('wanted:111')).toMatchObject({
        title: 'Node.js 백엔드 개발자',
        categoryText: '서버 개발자',
      });
      expect(repo.lookupCompanyProfile('alpha labs')?.jobplanetStatus).toBe('not_collected');
      expect(repo.lookupRun('run-1')?.status).toBe('completed');
    } finally {
      repo.close();
    }
  });

  it('upserts listing by source_marker and keeps one observation per run/listing', () => {
    const repo = new SearchJobsRepo(tempDb());
    try {
      const base = listing();
      repo.recordRunResult({
        runId: 'run-1',
        source: 'wanted',
        profile: 'Node-family backend research profile',
        queryKey: 'node_backend_public_demo',
        wantedUrl: null,
        status: 'completed',
        startedAt: '2026-05-01T00:00:00.000Z',
        finishedAt: '2026-05-01T00:01:00.000Z',
        markdownPath: 'results/search-jobs/run-1.md',
        counts: { filteredIn: 1 },
        errorReason: null,
        listings: [base, { ...base, title: 'Updated Backend Engineer' }],
        observations: [
          {
            runId: 'run-1',
            sourceMarker: 'wanted:111',
            queryKey: 'node_backend_public_demo',
            rowIndex: 0,
            observedAt: '2026-05-01T00:01:00.000Z',
            contentHash: 'hash-1',
            rawMetadata: {},
          },
          {
            runId: 'run-1',
            sourceMarker: 'wanted:111',
            queryKey: 'node_backend_public_demo',
            rowIndex: 1,
            observedAt: '2026-05-01T00:01:00.000Z',
            contentHash: 'hash-2',
            rawMetadata: {},
          },
        ],
      });

      expect(repo.lookupListing('wanted:111')?.title).toBe('Updated Backend Engineer');
      expect(repo.countObservations()).toBe(1);
    } finally {
      repo.close();
    }
  });

  it('lists and updates JobPlanet fields on company profiles', () => {
    const repo = new SearchJobsRepo(tempDb());
    const now = '2026-05-02T00:00:00.000Z';

    try {
      repo.recordRunResult({
        runId: 'run-1',
        source: 'wanted',
        profile: 'Node-family backend research profile',
        queryKey: 'node_backend_public_demo',
        wantedUrl: null,
        status: 'completed',
        startedAt: now,
        finishedAt: now,
        markdownPath: 'results/search-jobs/run-1-wanted.md',
        counts: { filteredIn: 1 },
        errorReason: null,
        listings: [listing()],
        observations: [],
      });

      expect(repo.listCompanyProfilesForJobPlanet()).toEqual([
        {
          normalizedCompany: 'alpha labs',
          companyDisplay: 'Alpha Labs',
          jobplanetStatus: 'not_collected',
          jobplanetRating: null,
          jobplanetReviewCount: null,
          jobplanetUrl: null,
          jobplanetObservedAt: null,
          rawMetadata: {},
        },
      ]);

      repo.updateCompanyJobPlanetProfile({
        normalizedCompany: 'alpha labs',
        companyDisplay: 'Alpha Labs Inc.',
        jobplanetStatus: 'ok',
        jobplanetRating: 4.2,
        jobplanetReviewCount: 17,
        jobplanetUrl: 'https://www.jobplanet.co.kr/companies/123',
        jobplanetObservedAt: '2026-05-02T01:00:00.000Z',
        rawMetadata: { source: 'legacy-db', legacyNormalizedCompany: 'alpha labs' },
        updatedAt: '2026-05-02T01:00:00.000Z',
      });

      expect(repo.listCompanyProfilesForJobPlanet()).toEqual([
        {
          normalizedCompany: 'alpha labs',
          companyDisplay: 'Alpha Labs Inc.',
          jobplanetStatus: 'ok',
          jobplanetRating: 4.2,
          jobplanetReviewCount: 17,
          jobplanetUrl: 'https://www.jobplanet.co.kr/companies/123',
          jobplanetObservedAt: '2026-05-02T01:00:00.000Z',
          rawMetadata: { legacyNormalizedCompany: 'alpha labs', source: 'legacy-db' },
        },
      ]);
    } finally {
      repo.close();
    }
  });
});
