import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'playwright', 'playwright-core', 'chromium-bidi', 'docx', 'exceljs', 'pdfkit', 'pdf-parse', 'mammoth', 'jszip', 'screenshot-desktop'],
  format: 'cjs',
  platform: 'node',
  sourcemap: !isProduction,
  minify: isProduction,
});

if (isWatch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();

  // screenshot-desktop removed from extension bundle — native .bat/.exe files
  // were triggering Microsoft's malware scanner. Desktop automation lives in
  // the IDE only, not in the extension.

  console.log('Extension built successfully.');
}
