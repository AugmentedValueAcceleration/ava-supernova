import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'playwright', 'playwright-core', 'chromium-bidi', 'docx', 'exceljs', 'pdfkit', 'pdf-parse', 'mammoth', 'pptxgenjs', 'jszip'],
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

  // Copy screenshot-desktop native files to dist (Windows .bat + manifest)
  import('fs').then(fs => {
    import('path').then(path => {
      const srcDir = path.default.resolve('../../node_modules/.pnpm/screenshot-desktop@1.15.3/node_modules/screenshot-desktop/lib/win32');
      const dstDir = path.default.resolve('dist');
      for (const file of ['screenCapture_1.3.2.bat', 'app.manifest']) {
        const src = path.default.join(srcDir, file);
        const dst = path.default.join(dstDir, file);
        if (fs.default.existsSync(src)) {
          fs.default.copyFileSync(src, dst);
        }
      }
    });
  });

  console.log('Extension built successfully.');
}
