import type { WantedWdlistSeed } from './types.js';

function parseYears(params: URLSearchParams): number[] {
  return params.getAll('years').map((value) => {
    if (!/^(0|[1-9]\d*)$/.test(value)) {
      throw new Error('Wanted URL years must be non-negative integers.');
    }

    const year = Number(value);
    if (!Number.isSafeInteger(year)) {
      throw new Error('Wanted URL years must be non-negative integers.');
    }
    return year;
  });
}

export function parseWantedWdlistUrl(value: string): WantedWdlistSeed {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.wanted.co.kr') {
    throw new Error('Wanted URL must use https://www.wanted.co.kr.');
  }

  const match = url.pathname.match(/^\/wdlist\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error('Wanted URL must use /wdlist/{category}/{subcategory}.');
  }

  return {
    kind: 'wdlist',
    url: url.toString(),
    categoryId: match[1],
    subcategoryId: match[2],
    navigationJobGroupId: match[1],
    navigationJobIds: [match[2]],
    country: url.searchParams.get('country') ?? 'kr',
    jobSort: url.searchParams.get('job_sort') ?? 'job.popularity_order',
    years: parseYears(url.searchParams),
    employmentTypes: url.searchParams.getAll('employment_types'),
    locations: url.searchParams.getAll('locations'),
  };
}
