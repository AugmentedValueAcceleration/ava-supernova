import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'playwright', 'playwright-core', 'chromium-bidi'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: false,
});

if (isWatch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Extension built successfully.');
}
