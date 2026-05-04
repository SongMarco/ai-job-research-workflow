import { classifyRememberPosting, detectRememberNodeSignals, extractTextDeep } from '../../remember/filter.js';
import type { CanonicalJobListing } from '../../search-jobs/types.js';
import type { RememberDetailResponse, RememberSkill } from './types.js';

export interface RememberNormalizeContext {
  readonly sourceMarker: string;
  readonly seedKeys: readonly string[];
  readonly filterReason?: string;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeCompany(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeYear(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 80) return null;
  return value;
}

function pickYear(payload: RememberDetailResponse['data'], keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = normalizeYear(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function formatExperience(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return min === max ? `경력 ${min}년` : `경력 ${min}-${max}년`;
  if (min !== null) return `경력 ${min}년 이상`;
  if (max !== null) return `경력 ${max}년 이하`;
  return '';
}

function skillName(skill: RememberSkill): string {
  return normalizeText(skill.name ?? skill.title);
}

function uniq(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractSkills(payload: RememberDetailResponse['data']): string[] {
  const direct = Array.isArray(payload.skills) ? payload.skills.map(skillName) : [];
  const desired = Array.isArray(payload.desiredProfileCondition?.skills)
    ? payload.desiredProfileCondition.skills.map(skillName)
    : [];
  return uniq([...direct, ...desired]);
}

function extractCategoryText(payload: RememberDetailResponse['data']): string {
  const categories = Array.isArray(payload.jobCategories)
    ? payload.jobCategories.map((category) => normalizeText(category.name ?? category.title)).filter(Boolean)
    : [];
  return categories.join(', ');
}

function extractLocation(payload: RememberDetailResponse['data']): string {
  if (Array.isArray(payload.locations)) return payload.locations.map(normalizeText).filter(Boolean).join(', ');
  return normalizeText(payload.location ?? payload.address);
}

function extractDeadline(payload: RememberDetailResponse['data']): { readonly text: string | null; readonly date: string | null } {
  const text = normalizeText(payload.dueDate ?? payload.endDate ?? payload.deadline);
  if (!text) return { text: null, date: null };
  return { text, date: text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null };
}

function detailText(payload: RememberDetailResponse['data']): string {
  const parts = [
    payload.title,
    payload.description,
    payload.mainTasks,
    payload.requirements,
    payload.preferredQualifications,
    payload.benefits,
    payload.detail,
  ];
  return parts
    .flatMap(extractTextDeep)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function normalizeRememberDetail(
  payload: RememberDetailResponse,
  context: RememberNormalizeContext,
): CanonicalJobListing {
  const data = payload.data;
  const sourceJobId = String(data.id);
  const title = normalizeText(data.title);
  const company = normalizeText(data.organization?.name ?? data.company?.name);
  const min = pickYear(data, ['minCareer', 'careerMin', 'minExperience']);
  const max = pickYear(data, ['maxCareer', 'careerMax', 'maxExperience']);
  const deadline = extractDeadline(data);
  const requiredSkills = extractSkills(data);
  const signals = Array.from(detectRememberNodeSignals(data));
  const filterStatus = classifyRememberPosting(data) === 'include' ? 'pass' : 'reject';

  return {
    sourceMarker: context.sourceMarker,
    platform: 'remember',
    sourceJobId,
    url: `https://career.rememberapp.co.kr/job/posting/${sourceJobId}`,
    title,
    categoryText: extractCategoryText(data),
    company,
    normalizedCompany: normalizeCompany(company),
    location: extractLocation(data),
    experienceText: formatExperience(min, max),
    experienceMin: min,
    experienceMax: max,
    experienceParseConfidence: min === null && max === null ? 'unknown' : 'exact',
    deadlineText: deadline.text,
    deadlineDate: deadline.date,
    requiredSkills,
    preferredSkills: [],
    detailText: detailText(data),
    backendFilterStatus: filterStatus,
    backendFilterReason: context.filterReason ?? `remember node signals: ${signals.join(', ')}`,
    raw: payload.raw,
  };
}
