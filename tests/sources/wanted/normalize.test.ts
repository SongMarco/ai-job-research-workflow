import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/wanted/detail-backend-node.json' with { type: 'json' };
import { normalizeWantedDetail } from '../../../src/sources/wanted/normalize.js';

describe('normalizeWantedDetail', () => {
  it('extracts canonical listing fields from a Wanted backend detail fixture', () => {
    const listing = normalizeWantedDetail(fixture, {
      sourceMarker: 'wanted:111',
      seedKeys: ['url:518/895', 'query:Node.js'],
    });

    expect(listing).toMatchObject({
      sourceMarker: 'wanted:111',
      platform: 'wanted',
      sourceJobId: '111',
      url: 'https://www.wanted.co.kr/wd/111',
      title: 'Node.js 백엔드 개발자',
      categoryText: '서버 개발자',
      company: 'Alpha Labs',
      normalizedCompany: 'alpha labs',
      location: '서울 강남구',
      experienceText: '경력 5-10년',
      experienceMin: 5,
      experienceMax: 10,
      experienceParseConfidence: 'exact',
      deadlineText: '2026-06-30',
      deadlineDate: '2026-06-30',
      requiredSkills: ['Node.js', 'TypeScript'],
      preferredSkills: ['NestJS'],
    });
    expect(listing.detailText).toContain('REST API 설계');
    expect(listing.raw).toBe(fixture);
  });
});
