import { build } from 'esbuild';
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
  external: ['fastify', '@fastify/static'],
  sourcemap: true,
});
