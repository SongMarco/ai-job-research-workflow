export interface WantedWdlistSeed {
  readonly kind: 'wdlist';
  readonly url: string;
  readonly categoryId: string;
  readonly subcategoryId: string;
  readonly navigationJobGroupId: string;
  readonly navigationJobIds: readonly string[];
  readonly country: string;
  readonly jobSort: string;
  readonly years: readonly number[];
  readonly employmentTypes: readonly string[];
  readonly locations: readonly string[];
}

export interface WantedNamedQuery {
  readonly key: string;
  readonly profile: string;
  readonly years: number;
  readonly maxCandidates: number;
  readonly pageSize: number;
  readonly urlSeeds: readonly WantedWdlistSeed[];
  readonly apiQueries: readonly string[];
  readonly notes: string;
}

export interface WantedSearchPosition {
  readonly id: number;
  readonly position?: string;
  readonly company?: { readonly name?: string };
  readonly annual_from?: number | null;
  readonly annual_to?: number | null;
}

export interface WantedSearchResponse {
  readonly total_count?: number;
  readonly data?: readonly WantedSearchPosition[];
  readonly links?: {
    readonly next?: string | null;
  };
}

export interface WantedDetailJob {
  readonly id: number;
  readonly position?: string;
  readonly company?: { readonly name?: string };
  readonly annual_from?: number | null;
  readonly annual_to?: number | null;
  readonly address?: { readonly location?: string; readonly full_location?: string };
  readonly due_time?: string | null;
  readonly detail?: {
    readonly intro?: string;
    readonly main_tasks?: string;
    readonly requirements?: string;
    readonly preferred_points?: string;
    readonly benefits?: string;
  };
  readonly skill_tags?: readonly { readonly title?: string }[];
  readonly category_tag?: { readonly parent_id?: number; readonly id?: number; readonly text?: string };
}

export interface WantedDetailResponse {
  readonly job?: WantedDetailJob | null;
}
