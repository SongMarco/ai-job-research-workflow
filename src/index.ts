export const PROJECT_NAME = 'codex-job-finder';

export {
  classifyRememberPosting,
  detectRememberNodeSignals,
  extractTextDeep,
  REQUIRED_REMEMBER_NODE_SIGNALS,
} from './remember/filter.js';
export type { RememberNodeSignal, RememberPostingClassification } from './remember/filter.js';
