import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalJobListing, RunStatus, SearchRunCounts, SourceId } from './types.js';

export interface MarkdownFailure {
  readonly stage: string;
  readonly message: string;
}

export interface MarkdownInput {
  readonly runId: string;
  readonly profile: string;
  readonly source: SourceId;
  readonly queryKey: string | null;
  readonly wantedUrl: string | null;
  readonly status: RunStatus;
  readonly dbPath: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly counts: SearchRunCounts;
  readonly failures: readonly MarkdownFailure[];
  readonly listings: readonly CanonicalJobListing[];
}

function yamlScalar(value: string | null): string {
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function renderFrontmatterCounts(counts: SearchRunCounts): string[] {
  return ['counts:', ...Object.entries(counts).map(([key, value]) => `  ${key}: ${value}`)];
}

function renderFrontmatterFailures(failures: readonly MarkdownFailure[]): string[] {
  if (failures.length === 0) return ['failures:', '  []'];

  return [
    'failures:',
    ...failures.flatMap((failure) => [
      `  - stage: ${yamlScalar(failure.stage)}`,
      `    message: ${yamlScalar(failure.message)}`,
    ]),
  ];
}

function renderFrontmatter(input: MarkdownInput): string {
  return [
    '---',
    `skill: ${yamlScalar('search-jobs')}`,
    `runId: ${yamlScalar(input.runId)}`,
    `profile: ${yamlScalar(input.profile)}`,
    `source: ${yamlScalar(input.source)}`,
    `queryKey: ${yamlScalar(input.queryKey)}`,
    `wantedUrl: ${yamlScalar(input.wantedUrl)}`,
    `status: ${yamlScalar(input.status)}`,
    `dbPath: ${yamlScalar(input.dbPath)}`,
    `startedAt: ${yamlScalar(input.startedAt)}`,
    `finishedAt: ${yamlScalar(input.finishedAt)}`,
    ...renderFrontmatterCounts(input.counts),
    ...renderFrontmatterFailures(input.failures),
    '---',
  ].join('\n');
}

function renderCounts(counts: SearchRunCounts): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function renderFailures(failures: readonly MarkdownFailure[]): string {
  if (failures.length === 0) return '- none';

  return failures.map((failure) => `- ${failure.stage}: ${failure.message}`).join('\n');
}

function renderListingRow(listing: CanonicalJobListing): string {
  const skills = listing.requiredSkills.length > 0 ? listing.requiredSkills.join(', ') : 'skills unknown';
  const deadline = listing.deadlineText ? `deadline ${listing.deadlineText}` : 'deadline unknown';

  return [
    `- [${listing.sourceMarker}] ${listing.title} · ${listing.company} · ${listing.location} · ${listing.experienceText} · ${skills} · ${deadline}`,
    `  ${listing.url}`,
  ].join('\n');
}

function renderListings(listings: readonly CanonicalJobListing[]): string {
  if (listings.length === 0) return '검색 결과가 없습니다.';

  return listings.map(renderListingRow).join('\n');
}

export function renderSearchMarkdown(input: MarkdownInput): string {
  return [
    renderFrontmatter(input),
    '',
    '# Search Jobs Results',
    '',
    '## Counts',
    '',
    renderCounts(input.counts),
    '',
    '## Failures',
    '',
    renderFailures(input.failures),
    '',
    '## Listings',
    '',
    renderListings(input.listings),
    '',
  ].join('\n');
}

export function writeSearchMarkdown(resultsDir: string, input: MarkdownInput): string {
  mkdirSync(resultsDir, { recursive: true });
  const path = join(resultsDir, `${input.runId}-${input.source}.md`);
  writeFileSync(path, renderSearchMarkdown(input), 'utf8');
  return path;
}
