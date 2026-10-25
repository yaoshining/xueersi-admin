import { cp } from 'node:fs/promises';
import { build } from 'esbuild';
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
  external: ['fastify', '@fastify/static', 'better-sqlite3'],
  sourcemap: true,
});

await cp('../../packages/db/migrations', 'dist/migrations', {
  recursive: true,
});
