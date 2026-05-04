export interface RememberSearchRequest {
  readonly keyword: string;
  readonly page: number;
  readonly per: number;
  readonly sort?: string;
}

export interface RememberSearchPosting {
  readonly id: number;
  readonly title?: string;
  readonly organization?: { readonly name?: string };
  readonly company?: { readonly name?: string };
}

export interface RememberSearchResponse {
  readonly data: readonly RememberSearchPosting[];
  readonly meta: {
    readonly total_count?: number;
    readonly total_pages?: number;
    readonly total_page?: number;
    readonly page?: number;
    readonly per?: number;
  };
}

export interface RememberSkill {
  readonly name?: string;
  readonly title?: string;
}

export interface RememberDetailPosting {
  readonly id: number;
  readonly title?: string;
  readonly organization?: {
    readonly id?: number;
    readonly name?: string;
  };
  readonly company?: {
    readonly id?: number;
    readonly name?: string;
  };
  readonly address?: string;
  readonly location?: string;
  readonly locations?: readonly string[];
  readonly minCareer?: number | null;
  readonly maxCareer?: number | null;
  readonly careerMin?: number | null;
  readonly careerMax?: number | null;
  readonly minExperience?: number | null;
  readonly maxExperience?: number | null;
  readonly dueDate?: string | null;
  readonly endDate?: string | null;
  readonly deadline?: string | null;
  readonly jobCategories?: readonly { readonly name?: string; readonly title?: string }[];
  readonly desiredProfileCondition?: {
    readonly skills?: readonly RememberSkill[];
  };
  readonly skills?: readonly RememberSkill[];
  readonly mainTasks?: string;
  readonly requirements?: string;
  readonly preferredQualifications?: string;
  readonly benefits?: string;
  readonly description?: string;
  readonly detail?: unknown;
  readonly [key: string]: unknown;
}

export interface RememberDetailResponse {
  readonly data: RememberDetailPosting;
  readonly raw: unknown;
}
