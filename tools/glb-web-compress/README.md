# glb-web-compress

Reusable tool to turn a heavy export GLB (straight from Blender, 30+ MB) into a
**web-ready GLB** for the Innate dining-table configurator.

This is the saved version of the process that produced `Totara_Crossroads_web.glb`
(4.9 MB → 835 KB). Use it every time the 3D artist sends a new model.

## What it does (and why)

The configurator's Three.js loader uses a plain `GLTFLoader` with **no Draco,
Meshopt, or KTX2 decoder**. So we cannot compress geometry — the file must load
with a vanilla loader. Luckily these models are ~100% texture bytes (geometry is
trivial), so texture optimisation alone does all the work.

- **Colour (baseColor) textures → JPEG** at quality 82. This is the entire size win.
- **Normal & roughness maps → left untouched.** Lossy JPEG ruins normal maps, and
  they're tiny anyway.
- **Textures capped at 4096 px** on the longest side.
- **`KHR_materials_variants` preserved.** The artist bakes the per-species switch
  (e.g. Northland Totara / Cyclone Salvaged Rimu / West Coast Beech) into the model
  as material variants. We register `ALL_EXTENSIONS` and never merge meshes or
  materials, so that switch survives. The script aborts if variants are lost.

## Setup (once)

```bash
cd ~/innate-mission-control/tools/glb-web-compress
npm install
```

## Run

```bash
node compress-glb.mjs "<input.glb>" "<output_web.glb>" [--quality 82] [--max 4096]
```

Example:

```bash
node compress-glb.mjs \
  ~/Library/Mobile\ Documents/com~apple~CloudDocs/Configurator/"Crossroads 3 Species.glb" \
  ~/innate-mission-control/tools/glb-web-compress/out/Crossroads_3_Species_web.glb
```

The script prints the before/after size, % reduction, and confirms the species
variants are still present. **Do not ship a file where it reports variants NOT
preserved.**

## Inspect the result

```bash
npx --yes @gltf-transform/cli@latest inspect "<output_web.glb>"
```

## Deploy reminder

The compressed GLB goes into the live theme as a Shopify **theme asset**, and the
`table-configurator.liquid` section references it via `{{ '<file>.glb' | asset_url }}`.
**Never push to the live theme without Guido's explicit approval** (see
`docs/current/shopify-workflow.md`).
