// Generates the brand image fixtures for image/01, image/03 and techniques/03 once, with the demo's image model. Run: npx tsx scripts/make-fixtures.ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { buildRegistry, generate, loadAiEnv } from 'cypress-ai-vitals/providers';

const root = path.resolve(import.meta.dirname, '..');
const registry = buildRegistry(loadAiEnv(root));
const image = registry.get('flux-schnell');
if (!image) throw new Error('Add AI_MODEL_FLUX_SCHNELL to ai.env first.');

async function make(prompt: string, file: string): Promise<Buffer> {
  const result = await generate(image!, { task: 'image', prompt });
  if (!result.media) throw new Error(`No image for: ${prompt}`);
  const out = await sharp(result.media.data).resize(512, 512).jpeg({ quality: 85 }).toBuffer();
  writeFileSync(path.join(root, file), out);
  console.log(`${file}  ${Math.round(result.latencyMs)}ms`);
  return out;
}

/** Most common saturated colour, bucketed, as a hex string. */
async function brandColour(images: Buffer[]): Promise<string> {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (const img of images) {
    const { data } = await sharp(img).resize(96, 96).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 3) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 60 || (max - min) / max < 0.45) continue; // skip dark, grey and white pixels
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  return `#${[top.r, top.g, top.b].map((v) => Math.round(v / top.n).toString(16).padStart(2, '0')).join('')}`;
}

const STYLE = 'flat vector illustration, bold outlines, plain light background';
const onBrand = [
  await make(`A friendly orange fox mascot waving, ${STYLE}`, 'cypress/fixtures/brand/on-brand-1.jpg'),
  await make(`A friendly orange fox mascot holding a laptop, ${STYLE}`, 'cypress/fixtures/brand/on-brand-2.jpg'),
  await make(`A friendly orange fox mascot giving a thumbs up, ${STYLE}`, 'cypress/fixtures/brand/on-brand-3.jpg'),
];
await make('A photorealistic wildlife photograph of a red fox in a snowy forest, DSLR, shallow depth of field', 'cypress/fixtures/brand/off-brand-1.jpg');
await make('A photorealistic close-up photograph of a red fox face, natural light, telephoto lens', 'cypress/fixtures/brand/off-brand-2.jpg');
await make('A photograph of exactly two cats sitting side by side on a grey sofa', 'app/public/stubs/two-cats.jpg');

const brand = {
  palette: [{ hex: await brandColour(onBrand), minCoverage: 0.03 }],
  tolerance: 14,
  forbidden: [{ hex: '#1e3a8a', maxCoverage: 0.15 }],
  onBrand: ['brand/on-brand-1.jpg', 'brand/on-brand-2.jpg', 'brand/on-brand-3.jpg'],
  offBrand: ['brand/off-brand-1.jpg', 'brand/off-brand-2.jpg'],
};
writeFileSync(path.join(root, 'cypress/fixtures/brand/fox.json'), `${JSON.stringify(brand, null, 2)}\n`);
console.log('brand palette', brand.palette[0].hex);
