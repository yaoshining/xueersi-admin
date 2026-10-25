import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Bundler = (options: {
  entryPoints: string[];
  outfile: string;
  bundle: boolean;
  platform: 'node';
  target: string;
  format: 'esm';
  logLevel: 'silent';
}) => Promise<unknown>;

export async function bundleNasTransport(
  entry: string,
  destination: string,
  build: Bundler,
) {
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  await build({
    entryPoints: [entry],
    outfile: join(destination, 'transport.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    logLevel: 'silent',
  });
  // 只复制已知运行时资产，不递归携带源目录中的凭据或诊断文件。
  for (const name of ['public-protocol.json', 'sync-target.json']) {
    const asset = join(destination, name);
    copyFileSync(join(dirname(entry), name), asset);
    chmodSync(asset, 0o600);
  }
  chmodSync(join(destination, 'transport.mjs'), 0o600);
}
