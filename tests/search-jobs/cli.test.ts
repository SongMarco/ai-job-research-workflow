import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/search-jobs/cli.js';

const runSearchJobs = vi.fn();

vi.mock('../../src/search-jobs/run.js', () => ({
  runSearchJobs: (...args: unknown[]) => runSearchJobs(...args),
}));

function io() {
  let stdout = '';
  let stderr = '';
  return {
    adapter: {
      log: (message: string) => {
        stdout += `${message}\n`;
      },
      error: (message: string) => {
        stderr += `${message}\n`;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

describe('search-jobs cli', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prints the parsed plan as JSON without running the networked search in dry-run mode', async () => {
    const testIo = io();

    const code = await runCli(['--dry-run-plan'], testIo.adapter);

    expect(code).toBe(0);
    expect(testIo.stdout()).toContain('"queryKey": "node_backend_public_demo"');
    expect(testIo.stderr()).toBe('');
  });

  it('ignores a leading package-manager argv separator before dry-run parsing', async () => {
    const testIo = io();

    const code = await runCli(['--', '--dry-run-plan'], testIo.adapter);

    expect(code).toBe(0);
    expect(testIo.stdout()).toContain('"queryKey": "node_backend_public_demo"');
    expect(testIo.stderr()).toBe('');
  });

  it('rejects unsupported sources', async () => {
    const testIo = io();

    const code = await runCli(['saramin', '--dry-run-plan'], testIo.adapter);

    expect(code).toBe(1);
    expect(testIo.stderr()).toContain('Supported sources: wanted, remember.');
  });

  it('rejects --print because search-jobs no longer owns result querying', async () => {
    const testIo = io();

    const code = await runCli(['wanted', '--query', 'node_backend_public_demo', '--print'], testIo.adapter);

    expect(code).toBe(1);
    expect(runSearchJobs).not.toHaveBeenCalled();
    expect(testIo.stderr()).toContain('wanted accepts only --query <key> or --url <Wanted wdlist URL>.');
  });
});
