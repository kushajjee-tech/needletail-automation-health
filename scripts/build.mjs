// Builds one self-contained page: dist/index.html (no runtime dependencies).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, 'src', f), 'utf8');

const html = read('index.template.html')
  .replace('/*__STYLES__*/', () => read('styles.css'))
  .replace('/*__MODEL__*/', () => read('model.js'))
  .replace('/*__APP__*/', () => read('app.js'));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html);
writeFileSync(join(root, 'dist', '.nojekyll'), '');
console.log(`Built dist/index.html (${Math.round(html.length / 1024)} KB)`);
