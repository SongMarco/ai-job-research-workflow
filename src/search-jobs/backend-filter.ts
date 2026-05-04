import type { CanonicalJobListing } from './types.js';

export interface BackendFilterResult {
  readonly status: 'pass' | 'reject';
  readonly listing: CanonicalJobListing;
  readonly reason: string;
}

const STRONG_BACKEND_EVIDENCE = /백엔드|서버|backend|back-end|server|\bapi\b/i;
const BROAD_ROLE_EVIDENCE = /platform|sre|devops|infrastructure|distributed system|cloud/i;
const TITLE_STOPLIST =
  /frontend|front-end|프론트엔드|ios|android|모바일|qa|테스터|designer|디자이너|product\s*manager|프로덕트\s*매니저|\bpm\b/i;

function roleText(listing: CanonicalJobListing): string {
  return [listing.title, listing.categoryText, ...listing.requiredSkills, ...listing.preferredSkills].join(' ');
}

function withFilterMetadata(
  listing: CanonicalJobListing,
  status: BackendFilterResult['status'],
  reason: string,
): BackendFilterResult {
  return {
    status,
    reason,
    listing: {
      ...listing,
      backendFilterStatus: status,
      backendFilterReason: reason,
    },
  };
}

export function applyBackendFilter(listing: CanonicalJobListing): BackendFilterResult {
  const title = listing.title;
  const role = roleText(listing);

  if (TITLE_STOPLIST.test(title)) {
    return withFilterMetadata(listing, 'reject', 'title_stoplist');
  }

  if (STRONG_BACKEND_EVIDENCE.test(role)) {
    return withFilterMetadata(listing, 'pass', 'role_text_strong_backend_evidence');
  }

  if (BROAD_ROLE_EVIDENCE.test(role)) {
    return withFilterMetadata(listing, 'pass', 'role_text_broad_backend_evidence');
  }

  if (STRONG_BACKEND_EVIDENCE.test(listing.detailText)) {
    return withFilterMetadata(listing, 'pass', 'supporting_text_strong_backend_evidence');
  }

  return withFilterMetadata(listing, 'reject', 'no_backend_evidence');
}
