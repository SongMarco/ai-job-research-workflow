import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/search-jobs/cli.js';

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
});
