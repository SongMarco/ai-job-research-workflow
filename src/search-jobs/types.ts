export type SourceId = 'wanted' | 'remember';
export type SearchOutput = 'sqlite' | 'markdown';
export type RunStatus = 'running' | 'completed' | 'completed_empty' | 'partial' | 'blocked' | 'failed';

export interface SearchPlan {
  readonly source: SourceId;
  readonly profile: string;
  readonly years: number;
  readonly queryKey?: string;
  readonly wantedUrl?: string;
  readonly includeDetail: true;
  readonly dbPath: string;
  readonly resultsDir: string;
  readonly outputs: readonly SearchOutput[];
}

export interface CanonicalJobListing {
  readonly sourceMarker: string;
  readonly platform: SourceId;
  readonly sourceJobId: string;
  readonly url: string;
  readonly title: string;
  readonly categoryText: string;
  readonly company: string;
  readonly normalizedCompany: string;
  readonly location: string;
  readonly experienceText: string;
  readonly experienceMin: number | null;
  readonly experienceMax: number | null;
  readonly experienceParseConfidence: 'exact' | 'partial' | 'unknown';
  readonly deadlineText: string | null;
  readonly deadlineDate: string | null;
  readonly requiredSkills: readonly string[];
  readonly preferredSkills: readonly string[];
  readonly detailText: string;
  readonly backendFilterStatus: 'pending' | 'pass' | 'reject';
  readonly backendFilterReason: string;
  readonly raw: unknown;
}

export interface SearchRunCounts {
  readonly searchSeedTotal: number;
  readonly searchSeedFailed: number;
  readonly listCandidateTotal?: number;
  readonly wantedNavigationPages?: number;
  readonly candidateTotal: number;
  readonly detailTotal: number;
  readonly detailFailed: number;
  readonly normalizedTotal: number;
  readonly filteredIn: number;
  readonly filteredOut: number;
}
