import type { CompanyJobPlanetProfile, JobPlanetProfileStatus, SearchJobsRepo } from '../db/search-jobs-repo.js';
import { normalizeCompanyName } from './company-name.js';
import type { JobPlanetCollectionResult } from './live-collect.js';

export interface JobPlanetProfileCollectionService {
  collect(names: readonly string[]): Promise<ReadonlyMap<string, JobPlanetCollectionResult>>;
}

export interface LiveJobPlanetProfilesInput {
  readonly repo: Pick<SearchJobsRepo, 'listCompanyProfilesForJobPlanet' | 'updateCompanyJobPlanetProfile'>;
  readonly service: JobPlanetProfileCollectionService;
  readonly limit: number | null;
  readonly retryStatus?: 'not_collected' | 'not_found';
  readonly now: () => Date;
  readonly dryRun?: boolean;
}

export interface LiveJobPlanetProfilesResult {
  readonly targetTotal: number;
  readonly attemptedTotal: number;
  readonly upsertedTotal: number;
  readonly okTotal: number;
  readonly notFoundTotal: number;
  readonly blockedTotal: number;
  readonly failedTotal: number;
}

function emptyResult(targetTotal: number): LiveJobPlanetProfilesResult {
  return {
    targetTotal,
    attemptedTotal: 0,
    upsertedTotal: 0,
    okTotal: 0,
    notFoundTotal: 0,
    blockedTotal: 0,
    failedTotal: 0,
  };
}

function countStatus(result: LiveJobPlanetProfilesResult, status: JobPlanetProfileStatus): LiveJobPlanetProfilesResult {
  if (status === 'ok') return { ...result, okTotal: result.okTotal + 1 };
  if (status === 'not_found') return { ...result, notFoundTotal: result.notFoundTotal + 1 };
  if (status === 'blocked') return { ...result, blockedTotal: result.blockedTotal + 1 };
  if (status === 'failed') return { ...result, failedTotal: result.failedTotal + 1 };
  return result;
}

function collectionStatus(result: JobPlanetCollectionResult | undefined): Exclude<JobPlanetProfileStatus, 'not_collected'> {
  if (!result) return 'failed';
  if (result.status !== 'ok') return result.status;
  return result.companyInfo.matchConfidence === 'exact' ? 'ok' : 'not_found';
}

function metadataFor(result: JobPlanetCollectionResult | undefined): Record<string, unknown> {
  if (!result) return { source: 'jobplanet-live', reason: 'collector_result_missing' };
  if (result.status !== 'ok') return { source: 'jobplanet-live', reason: result.reason };
  if (result.companyInfo.matchConfidence !== 'exact') {
    return {
      source: 'jobplanet-live',
      reason: 'partial_match_not_imported',
      candidate: result.companyInfo,
    };
  }
  return { source: 'jobplanet-live', companyInfo: result.companyInfo };
}

export async function runLiveJobPlanetProfiles(input: LiveJobPlanetProfilesInput): Promise<LiveJobPlanetProfilesResult> {
  const retryStatus = input.retryStatus ?? 'not_collected';
  const targets = input.repo
    .listCompanyProfilesForJobPlanet()
    .filter((profile) => profile.jobplanetStatus === retryStatus);
  const limitedTargets = input.limit === null ? targets : targets.slice(0, input.limit);
  if (input.dryRun) return emptyResult(limitedTargets.length);

  const observedAt = input.now().toISOString();
  const collected = await input.service.collect(limitedTargets.map((target) => target.normalizedCompany));
  let result: LiveJobPlanetProfilesResult = {
    ...emptyResult(limitedTargets.length),
    attemptedTotal: limitedTargets.length,
  };

  for (const target of limitedTargets) {
    const collectedResult = collected.get(target.normalizedCompany) ?? collected.get(normalizeCompanyName(target.normalizedCompany));
    const status = collectionStatus(collectedResult);
    const exactInfo = collectedResult?.status === 'ok' && collectedResult.companyInfo.matchConfidence === 'exact'
      ? collectedResult.companyInfo
      : null;
    const updated: CompanyJobPlanetProfile & { readonly updatedAt: string } = {
      normalizedCompany: target.normalizedCompany,
      companyDisplay: exactInfo?.name ?? target.companyDisplay,
      jobplanetStatus: status,
      jobplanetRating: exactInfo?.rating ?? null,
      jobplanetReviewCount: exactInfo?.reviewCount ?? null,
      jobplanetUrl: exactInfo?.jobplanetUrl ?? null,
      jobplanetObservedAt: observedAt,
      rawMetadata: metadataFor(collectedResult),
      updatedAt: observedAt,
    };
    if (input.repo.updateCompanyJobPlanetProfile(updated)) {
      result = { ...result, upsertedTotal: result.upsertedTotal + 1 };
    }
    result = countStatus(result, status);
  }

  return result;
}
