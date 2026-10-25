import { expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { bundleNasTransport } from './nas-transport';

it('私有运输模块携带同目录运行时配置，脱离源目录后可独立加载', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-nas-transport-'));
  const source = join(dir, 'source');
  const target = join(dir, 'private');
  mkdirSync(source);
  writeFileSync(
    join(source, 'public-protocol.json'),
    JSON.stringify({ version: 'synthetic-v1' }),
  );
  writeFileSync(
    join(source, 'sync-target.json'),
    JSON.stringify({ target: 'synthetic-target' }),
  );
  writeFileSync(join(source, 'unrelated-secret.json'), 'synthetic-do-not-copy');
  writeFileSync(
    join(source, 'transport.mjs'),
    `import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('./public-protocol.json',import.meta.url),'utf8'));
export const version=data.version;
export function createWriter(){return JSON.parse(readFileSync(new URL('./sync-target.json',import.meta.url),'utf8')).target;}`,
  );
  const { build } = createRequire(resolve('apps/api/package.json'))('esbuild');
  try {
    await bundleNasTransport(join(source, 'transport.mjs'), target, build);
    rmSync(source, { recursive: true });
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const m=await import('./transport.mjs');console.log(m.version+':'+m.createWriter())",
      ],
      { cwd: target, encoding: 'utf8' },
    );
    expect(result.trim()).toBe('synthetic-v1:synthetic-target');
    expect(statSync(join(target, 'sync-target.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(target, 'public-protocol.json')).mode & 0o777).toBe(
      0o600,
    );
    expect(existsSync(join(target, 'unrelated-secret.json'))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
