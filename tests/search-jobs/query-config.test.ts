import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY_KEY, DEFAULT_WANTED_URL } from '../../src/search-jobs/search-plan.js';
import { loadWantedQueryConfig, resolveWantedQuery } from '../../src/search-jobs/query-config.js';

describe('Wanted query config', () => {
  function writeConfig(value: unknown): string {
    const path = join(mkdtempSync(join(tmpdir(), 'wanted-query-config-')), 'wanted.json');
    writeFileSync(path, JSON.stringify(value), 'utf8');
    return path;
  }

  function validRawQuery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      key: DEFAULT_QUERY_KEY,
      profile: 'Node-family backend research profile',
      years: 7,
      maxCandidates: 300,
      pageSize: 100,
      urlSeeds: [{ url: DEFAULT_WANTED_URL }],
      notes: 'test config',
      ...overrides,
    };
  }

  it('loads the default deterministic named query', () => {
    const config = loadWantedQueryConfig();
    const query = resolveWantedQuery(config, DEFAULT_QUERY_KEY);

    expect(query.key).toBe(DEFAULT_QUERY_KEY);
    expect(query.urlSeeds[0]?.url).toBe(DEFAULT_WANTED_URL);
    expect(query.apiQueries).toEqual([]);
    expect(query.maxCandidates).toBe(300);
  });

  it('rejects unknown query keys before network use', () => {
    const config = loadWantedQueryConfig();

    expect(() => resolveWantedQuery(config, 'unknown')).toThrow("Unknown Wanted query key 'unknown'.");
  });

  it('rejects duplicate query keys when loading config', () => {
    const path = writeConfig({
      queries: [validRawQuery(), validRawQuery({ profile: 'duplicate profile' })],
    });

    expect(() => loadWantedQueryConfig(path)).toThrow("Duplicate Wanted query key 'node_backend_public_demo'.");
  });

  it('rejects empty url seeds when loading config', () => {
    const path = writeConfig({
      queries: [validRawQuery({ urlSeeds: [] })],
    });

    expect(() => loadWantedQueryConfig(path)).toThrow();
  });

  it('defaults omitted API queries to an empty list for URL-only collection', () => {
    const path = writeConfig({
      queries: [validRawQuery()],
    });

    const query = resolveWantedQuery(loadWantedQueryConfig(path), DEFAULT_QUERY_KEY);

    expect(query.apiQueries).toEqual([]);
  });

  it('accepts empty API queries for URL-only collection', () => {
    const path = writeConfig({
      queries: [validRawQuery({ apiQueries: [] })],
    });

    const query = resolveWantedQuery(loadWantedQueryConfig(path), DEFAULT_QUERY_KEY);

    expect(query.apiQueries).toEqual([]);
  });

  it('rejects unknown root config keys when loading config', () => {
    const path = writeConfig({
      queries: [validRawQuery()],
      extra: true,
    });

    expect(() => loadWantedQueryConfig(path)).toThrow();
  });

  it('rejects unknown query object keys when loading config', () => {
    const path = writeConfig({
      queries: [validRawQuery({ extra: true })],
    });

    expect(() => loadWantedQueryConfig(path)).toThrow();
  });

  it('rejects unknown url seed keys when loading config', () => {
    const path = writeConfig({
      queries: [validRawQuery({ urlSeeds: [{ url: DEFAULT_WANTED_URL, extra: true }] })],
    });

    expect(() => loadWantedQueryConfig(path)).toThrow();
  });
});
