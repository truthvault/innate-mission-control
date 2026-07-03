#!/usr/bin/env node
/**
 * glb-web-compress
 * -----------------
 * Turn a heavy export GLB (e.g. straight out of Blender, 30+ MB) into a
 * web-ready GLB for the Innate dining-table configurator.
 *
 * WHY THIS APPROACH (matches what worked for Totara_Crossroads_web.glb):
 *   - The configurator's Three.js loader has NO Draco / Meshopt / KTX2 decoder.
 *     So we must NOT compress geometry or use GPU texture formats — the file
 *     has to load with a plain GLTFLoader. The entire size win comes from
 *     textures (these models are ~100% texture bytes, geometry is trivial).
 *   - Only COLOUR (baseColor) textures are converted to JPEG. Normal and
 *     roughness maps are left untouched: lossy JPEG wrecks normal maps and
 *     they are tiny anyway.
 *   - KHR_materials_variants (the per-species switch baked in by the 3D
 *     artist) and KHR_texture_transform are preserved by registering
 *     ALL_EXTENSIONS on the IO. Geometry, meshes and materials are never
 *     merged, so the variant mapping stays intact.
 *
 * USAGE:
 *   node compress-glb.mjs <input.glb> <output.glb> [--quality 82] [--max 4096]
 *
 * EXAMPLE:
 *   node compress-glb.mjs "in.glb" "Crossroads_3_Species_web.glb"
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const [inPath, outPath] = positional;
const getFlag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const quality = Number(getFlag('quality', '82'));
const maxSize = Number(getFlag('max', '4096'));

if (!inPath || !outPath) {
  console.error('Usage: node compress-glb.mjs <input.glb> <output.glb> [--quality 82] [--max 4096]');
  process.exit(1);
}

const mb = (n) => (n / 1e6).toFixed(2) + ' MB';
const fs = await import('node:fs');
const beforeBytes = fs.statSync(inPath).size;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);

// Report the variants we must preserve, as a sanity check.
const root = doc.getRoot();
const variantExt = root.listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_variants');
console.log('Input:', inPath, '(' + mb(beforeBytes) + ')');
console.log('Extensions:', root.listExtensionsUsed().map((e) => e.extensionName).join(', ') || '(none)');

await doc.transform(
  // Colour maps only → JPEG. Normal / roughness maps are excluded (kept lossless).
  textureCompress({
    encoder: sharp,
    targetFormat: 'jpeg',
    slots: /baseColor|emissive|diffuse/i,
    quality,
    resize: [maxSize, maxSize],
  }),
  dedup(),
  prune(),
);

await io.write(outPath, doc);
const afterBytes = fs.statSync(outPath).size;

// Re-read to confirm variants survived.
const check = await io.read(outPath);
const variantsAfter = check
  .getRoot()
  .listExtensionsUsed()
  .find((e) => e.extensionName === 'KHR_materials_variants');

console.log('Output:', outPath, '(' + mb(afterBytes) + ')');
console.log('Reduction:', ((1 - afterBytes / beforeBytes) * 100).toFixed(1) + '%');
console.log('Material variants preserved:', variantsAfter ? 'YES' : 'NO  ⚠️');
if (variantExt && !variantsAfter) {
  console.error('ERROR: species variants were lost in compression — do not ship this file.');
  process.exit(2);
}
