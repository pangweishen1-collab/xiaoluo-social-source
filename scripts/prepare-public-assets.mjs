import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const bytes = await readFile(new URL('public/optimized/home-hero-research.webp', root));
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const src = `/versioned/home-hero-research.${hash}.webp`;
await mkdir(new URL('public/versioned/', root), { recursive: true });
await writeFile(new URL(`public${src}`, root), bytes);
await writeFile(new URL('app/hero-media.generated.json', root), JSON.stringify({ src }) + '\n');
// Publish only completed releases; development drafts stay in the source record.
const updates = JSON.parse(await readFile(new URL('app/site-updates.json', root), 'utf8'));
await writeFile(new URL('public/release-history.json', root), JSON.stringify(updates.filter(item => item.status === 'published'), null, 2) + '\n');
console.log(`Prepared versioned hero media: ${src}`);
