import { describe, expect, it } from 'vitest';
import { PROJECT_NAME } from '../src/index.js';

describe('project bootstrap', () => {
  it('has the expected project name', () => {
    expect(PROJECT_NAME).toBe('ai-job-research-workflow');
  });
});
