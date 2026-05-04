import { describe, expect, it } from 'vitest';
import {
  classifyRememberPosting,
  detectRememberNodeSignals,
  extractTextDeep,
  REQUIRED_REMEMBER_NODE_SIGNALS,
} from '../src/remember/filter.js';

describe('Remember Node detail filter', () => {
  it('uses only node, nest, and typescript as required signals', () => {
    expect(REQUIRED_REMEMBER_NODE_SIGNALS).toEqual(['node', 'nest', 'typescript']);
  });

  it.each([
    ['Node'],
    ['Node.js'],
    ['NodeJS'],
    ['Nest'],
    ['Nest.js'],
    ['NestJS'],
    ['TypeScript'],
  ])('includes postings with required signal %s', (keyword) => {
    expect(
      classifyRememberPosting({
        title: '백엔드 개발자',
        detail: { responsibilities: [`${keyword} 기반 API 서버 개발`] },
      }),
    ).toBe('include');
  });

  it('recursively scans deeply nested Remember detail payloads', () => {
    const payload = {
      title: '서버 개발자',
      company: { name: '예시회사' },
      detail: {
        sections: [
          { heading: '주요업무', items: ['API 개발', { description: 'NestJS 기반 서비스 고도화' }] },
        ],
      },
    };

    expect(extractTextDeep(payload)).toContain('NestJS 기반 서비스 고도화');
    expect([...detectRememberNodeSignals(payload)]).toEqual(['nest']);
    expect(classifyRememberPosting(payload)).toBe('include');
  });

  it.each([
    ['generic backend', { title: '백엔드 개발자', detail: '대규모 서버 API 개발' }],
    ['server only', { title: '서버 개발자', detail: 'MSA 환경의 서버 개발 및 운영' }],
    ['java spring only', { title: '백엔드 개발자', detail: 'Java Spring Kotlin JPA MyBatis 개발' }],
    ['python go backend', { title: 'Backend Engineer', detail: 'Python, Go 기반 백엔드 플랫폼 개발' }],
    ['endpoint security', { title: 'Endpoint Security Engineer', detail: 'EDR 보안 솔루션 운영' }],
    ['sales engineer', { title: 'Sales Engineer', detail: '기술영업 및 고객사 PoC 지원' }],
    ['manager business', { title: 'Business Manager / MD', detail: '사업 전략 및 매출 관리' }],
    ['javascript only', { title: '프론트엔드 개발자', detail: 'JavaScript 기반 웹 화면 개발' }],
    ['express only', { title: '백엔드 개발자', detail: 'Express 기반 API 운영 경험' }],
    ['fastify only', { title: '백엔드 개발자', detail: 'Fastify 기반 API 운영 경험' }],
  ])('excludes non-node-only fixture: %s', (_name, payload) => {
    expect(classifyRememberPosting(payload)).toBe('exclude');
  });

  it('does not treat JavaScript as Java or as a required Node-family signal', () => {
    expect([...detectRememberNodeSignals('JavaScript Java Spring')]).toEqual([]);
    expect(classifyRememberPosting('JavaScript Java Spring')).toBe('exclude');
  });
});
