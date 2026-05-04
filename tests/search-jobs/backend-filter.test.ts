import { describe, expect, it } from 'vitest';
import { applyBackendFilter } from '../../src/search-jobs/backend-filter.js';
import type { CanonicalJobListing } from '../../src/search-jobs/types.js';

function listing(overrides: Partial<CanonicalJobListing> = {}): CanonicalJobListing {
  return {
    sourceMarker: 'wanted:1',
    platform: 'wanted',
    sourceJobId: '1',
    url: 'https://www.wanted.co.kr/wd/1',
    title: 'Software Engineer',
    categoryText: '',
    company: 'Alpha',
    normalizedCompany: 'alpha',
    location: '서울',
    experienceText: '경력 5-10년',
    experienceMin: 5,
    experienceMax: 10,
    experienceParseConfidence: 'exact',
    deadlineText: null,
    deadlineDate: null,
    requiredSkills: [],
    preferredSkills: [],
    detailText: '',
    backendFilterStatus: 'pending',
    backendFilterReason: '',
    raw: {},
    ...overrides,
  };
}

describe('applyBackendFilter', () => {
  it('passes title backend evidence', () => {
    const result = applyBackendFilter(listing({ title: '서버 개발자' }));

    expect(result.status).toBe('pass');
    expect(result.listing.backendFilterStatus).toBe('pass');
    expect(result.listing.backendFilterReason).toContain('role_text');
  });

  it('passes strong supporting backend evidence when title is neutral', () => {
    const result = applyBackendFilter(
      listing({
        title: 'Software Engineer',
        detailText: '백엔드 REST API 서버 개발을 담당합니다.',
      }),
    );

    expect(result.status).toBe('pass');
    expect(result.listing.backendFilterReason).toContain('supporting_text');
  });

  it('passes standalone API evidence without matching api inside other words', () => {
    const rapidResult = applyBackendFilter(
      listing({
        title: 'Software Engineer',
        detailText: 'We rapidly improve Capital planning tools.',
      }),
    );
    const apiResult = applyBackendFilter(
      listing({
        title: 'Software Engineer',
        detailText: 'REST API 설계를 담당합니다.',
      }),
    );

    expect(rapidResult.status).toBe('reject');
    expect(rapidResult.listing.backendFilterReason).toContain('no_backend_evidence');
    expect(apiResult.status).toBe('pass');
    expect(apiResult.listing.backendFilterReason).toContain('supporting_text');
  });

  it('passes category backend evidence when title and skills are neutral', () => {
    const result = applyBackendFilter(
      listing({
        title: 'Software Engineer',
        categoryText: '서버 개발자',
        requiredSkills: [],
        preferredSkills: [],
        detailText: '',
      }),
    );

    expect(result.status).toBe('pass');
    expect(result.listing.backendFilterReason).toContain('role_text');
  });

  it('rejects frontend title noise even if body mentions API', () => {
    const result = applyBackendFilter(
      listing({
        title: '프론트엔드 개발자',
        requiredSkills: ['React'],
        detailText: 'API 연동과 UI 개발을 담당합니다.',
      }),
    );

    expect(result.status).toBe('reject');
    expect(result.listing.backendFilterStatus).toBe('reject');
    expect(result.listing.backendFilterReason).toContain('title_stoplist');
  });

  it('rejects broad infra evidence when it appears only in body text', () => {
    const result = applyBackendFilter(
      listing({
        title: 'Software Engineer',
        detailText: 'cloud infrastructure team과 협업합니다.',
      }),
    );

    expect(result.status).toBe('reject');
    expect(result.listing.backendFilterReason).toContain('no_backend_evidence');
  });
});
