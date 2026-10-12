// Inlines the Vite build (JS + CSS) into a single self-contained HTML file.
// Usage: node tools/inline-build.mjs <distDir> <outFile>
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const [dist, out] = process.argv.slice(2);
if (!dist || !out) {
  console.error('usage: node tools/inline-build.mjs <distDir> <outFile>');
  process.exit(1);
}
let html = await readFile(join(dist, 'index.html'), 'utf8');
const assets = await readdir(join(dist, 'assets'));
for (const f of assets) {
  const path = join(dist, 'assets', f);
  if (f.endsWith('.css')) {
    const css = await readFile(path, 'utf8');
    html = html.replace(new RegExp(`<link[^>]+href="\\./assets/${f.replace('.', '\\.')}"[^>]*>`), () => `<style>${css}</style>`);
  } else if (f.endsWith('.js')) {
    const js = (await readFile(path, 'utf8')).replace(/\/\/# sourceMappingURL=.*$/m, '').replace(/<\/script/gi, '<\\/script');
    html = html.replace(new RegExp(`<script[^>]+src="\\./assets/${f.replace('.', '\\.')}"[^>]*></script>`), () => `<script type="module">${js}</script>`);
  }
}
if (/src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html)) throw new Error('Some assets were not inlined');
await writeFile(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KiB)`);
