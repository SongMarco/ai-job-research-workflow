const WRAPPER_PATTERNS = [
  /^\(주\)\s*/i,
  /\s*\(주\)$/i,
  /^\(유\)\s*/i,
  /\s*\(유\)$/i,
  /^\(사\)\s*/i,
  /\s*\(사\)$/i,
  /^주식회사\s*/i,
  /^유한책임회사\s*/i,
  /^유한회사\s*/i,
  /\s+inc\.?$/i,
  /\s+corp\.?$/i,
  /\s+ltd\.?$/i,
  /\s+co\.?$/i,
  /\s+llc\.?$/i,
  /\s*,\s*inc\.?$/i,
  /\s*,\s*corp\.?$/i,
  /\s*,\s*ltd\.?$/i,
  /\s*,\s*co\.?$/i,
  /\s*,\s*llc\.?$/i,
];

function stripWrappers(value: string): string {
  let current = value;
  let previous = '';

  while (current !== previous) {
    previous = current;
    for (const pattern of WRAPPER_PATTERNS) {
      current = current.replace(pattern, ' ');
    }
    current = current.replace(/[.,]+$/g, ' ');
    current = current.replace(/\s+/g, ' ').trim();
  }

  return current;
}

export function normalizeCompanyName(raw: string): string {
  const normalizedWhitespace = raw.replace(/\s+/g, ' ').trim();
  if (!normalizedWhitespace) return '';
  return stripWrappers(normalizedWhitespace).toLowerCase();
}

function stripKoreaSuffix(value: string): string {
  return value.endsWith('코리아') && value.length > '코리아'.length
    ? value.slice(0, -'코리아'.length).trim()
    : value;
}

export function primaryCompanyNameForSearch(raw: string): string {
  const normalizedName = normalizeCompanyName(raw);
  const withoutParenthesizedAlias = normalizedName.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  return withoutParenthesizedAlias || normalizedName;
}

export function matchCompanyName(input: string, candidate: string): 'exact' | 'partial' | 'none' {
  const normalizedInput = normalizeCompanyName(input);
  const normalizedCandidate = normalizeCompanyName(candidate);

  if (!normalizedInput || !normalizedCandidate) return 'none';
  if (normalizedInput === normalizedCandidate) return 'exact';
  if (stripKoreaSuffix(normalizedInput) === stripKoreaSuffix(normalizedCandidate)) return 'exact';

  const shorterLength = Math.min(normalizedInput.length, normalizedCandidate.length);
  if (
    shorterLength >= 2 &&
    (normalizedInput.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedInput))
  ) {
    return 'partial';
  }

  return 'none';
}
