export type RememberNodeSignal = 'node' | 'nest' | 'typescript';
export type RememberPostingClassification = 'include' | 'exclude';

export const REQUIRED_REMEMBER_NODE_SIGNALS = ['node', 'nest', 'typescript'] as const satisfies readonly RememberNodeSignal[];

const REMEMBER_NODE_SIGNAL_PATTERNS: ReadonlyArray<readonly [RememberNodeSignal, RegExp]> = [
  ['node', /\bnode(?:\.js|js)?\b/i],
  ['nest', /\bnest(?:\.js|js)?\b/i],
  ['typescript', /\btypescript\b/i],
];

export function extractTextDeep(input: unknown): string[] {
  const texts: string[] = [];
  const seen = new WeakSet<object>();

  function visit(value: unknown): void {
    if (typeof value === 'string') {
      texts.push(value);
      return;
    }

    if (value == null || typeof value !== 'object') {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (value instanceof Map) {
      for (const [key, mapValue] of Array.from(value.entries())) {
        visit(key);
        visit(mapValue);
      }
      return;
    }

    if (value instanceof Set) {
      for (const item of Array.from(value.values())) {
        visit(item);
      }
      return;
    }

    for (const objectValue of Object.values(value as Record<string, unknown>)) {
      visit(objectValue);
    }
  }

  visit(input);
  return texts;
}

export function detectRememberNodeSignals(input: unknown): Set<RememberNodeSignal> {
  const haystack = extractTextDeep(input).join('\n');
  const signals = new Set<RememberNodeSignal>();

  for (const [signal, pattern] of REMEMBER_NODE_SIGNAL_PATTERNS) {
    if (pattern.test(haystack)) {
      signals.add(signal);
    }
  }

  return signals;
}

export function classifyRememberPosting(input: unknown): RememberPostingClassification {
  return detectRememberNodeSignals(input).size > 0 ? 'include' : 'exclude';
}
