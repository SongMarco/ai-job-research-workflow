import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parseWantedWdlistUrl } from '../sources/wanted/url.js';
import type { WantedNamedQuery } from '../sources/wanted/types.js';

const DEFAULT_CONFIG_PATH = 'config/search-jobs/wanted.json';

const RawWantedUrlSeedSchema = z
  .object({
    url: z.string().url(),
  })
  .strict();

const RawWantedQuerySchema = z
  .object({
    key: z.string().min(1),
    profile: z.string().min(1),
    years: z.number().int().min(0),
    maxCandidates: z.number().int().min(1).max(500),
    pageSize: z.number().int().min(1).max(100),
    urlSeeds: z.array(RawWantedUrlSeedSchema).min(1),
    apiQueries: z.array(z.string().min(1)).default([]),
    notes: z.string(),
  })
  .strict();

const RawWantedQueryConfigSchema = z
  .object({
    queries: z.array(RawWantedQuerySchema).min(1),
  })
  .strict();

export interface WantedQueryConfig {
  readonly queries: readonly WantedNamedQuery[];
}

export function loadWantedQueryConfig(path = DEFAULT_CONFIG_PATH): WantedQueryConfig {
  const parsed = RawWantedQueryConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const seenKeys = new Set<string>();
  for (const query of parsed.queries) {
    if (seenKeys.has(query.key)) {
      throw new Error(`Duplicate Wanted query key '${query.key}'.`);
    }
    seenKeys.add(query.key);
  }

  return {
    queries: parsed.queries.map((query) => ({
      ...query,
      urlSeeds: query.urlSeeds.map((seed) => parseWantedWdlistUrl(seed.url)),
    })),
  };
}

export function resolveWantedQuery(config: WantedQueryConfig, key: string): WantedNamedQuery {
  const query = config.queries.find((item) => item.key === key);
  if (!query) {
    throw new Error(`Unknown Wanted query key '${key}'.`);
  }
  return query;
}
