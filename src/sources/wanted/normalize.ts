import type { CanonicalJobListing } from '../../search-jobs/types.js';
import type { WantedDetailResponse } from './types.js';

export interface WantedNormalizeContext {
  readonly sourceMarker: string;
  readonly seedKeys: readonly string[];
}

const PREFERRED_SKILL_PATTERNS = [
  /Node\.?js/gi,
  /TypeScript/gi,
  /JavaScript/gi,
  /NestJS/gi,
  /Express/gi,
  /REST API/gi,
  /GraphQL/gi,
  /AWS/gi,
  /GCP/gi,
  /Kubernetes/gi,
  /Docker/gi,
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeCompany(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeYear(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 80) {
    return null;
  }
  return value;
}

function formatExperience(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return min === max ? `경력 ${min}년` : `경력 ${min}-${max}년`;
  }
  if (min !== null) return `경력 ${min}년 이상`;
  if (max !== null) return `경력 ${max}년 이하`;
  return '';
}

function parseDeadline(value: string | null | undefined): { readonly text: string | null; readonly date: string | null } {
  const text = normalizeText(value);
  if (!text) return { text: null, date: null };

  const date = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  return { text, date };
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function extractPreferredSkills(value: string | null | undefined): string[] {
  const text = normalizeText(value);
  if (!text) return [];

  const matches: string[] = [];
  for (const pattern of PREFERRED_SKILL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      matches.push(match[0]);
    }
  }
  return uniq(matches);
}

function joinDetailText(parts: readonly (string | null | undefined)[]): string {
  return parts.map(normalizeText).filter(Boolean).join('\n');
}

export function normalizeWantedDetail(
  payload: WantedDetailResponse,
  context: WantedNormalizeContext,
): CanonicalJobListing {
  const job = payload.job;
  if (!job) {
    throw new Error(`Wanted detail payload has no job for ${context.sourceMarker}.`);
  }

  const sourceJobId = String(job.id);
  const title = normalizeText(job.position);
  const categoryText = normalizeText(job.category_tag?.text);
  const company = normalizeText(job.company?.name);
  const experienceMin = normalizeYear(job.annual_from);
  const experienceMax = normalizeYear(job.annual_to);
  const deadline = parseDeadline(job.due_time);

  return {
    sourceMarker: context.sourceMarker,
    platform: 'wanted',
    sourceJobId,
    url: `https://www.wanted.co.kr/wd/${sourceJobId}`,
    title,
    categoryText,
    company,
    normalizedCompany: normalizeCompany(company),
    location: normalizeText(job.address?.full_location ?? job.address?.location),
    experienceText: formatExperience(experienceMin, experienceMax),
    experienceMin,
    experienceMax,
    experienceParseConfidence: experienceMin === null && experienceMax === null ? 'unknown' : 'exact',
    deadlineText: deadline.text,
    deadlineDate: deadline.date,
    requiredSkills: uniq((job.skill_tags ?? []).map((tag) => normalizeText(tag.title)).filter(Boolean)),
    preferredSkills: extractPreferredSkills(job.detail?.preferred_points),
    detailText: joinDetailText([
      job.detail?.intro,
      job.detail?.main_tasks,
      job.detail?.requirements,
      job.detail?.preferred_points,
      job.detail?.benefits,
    ]),
    backendFilterStatus: 'pending',
    backendFilterReason: '',
    raw: payload,
  };
}
