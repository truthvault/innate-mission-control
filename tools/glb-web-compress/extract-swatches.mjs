import fs from 'node:fs';
import sharp from 'sharp';
const GLB = process.argv[2], OUT = process.argv[3];
const buf = fs.readFileSync(GLB);
const clen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20+clen).toString('utf8'));
const bin = buf.slice(20+clen+8);
const bvs = json.bufferViews;
const WANT = { board_ext:'totara', rimu_ext:'rimu', beech_ext:'beech' };
fs.mkdirSync(OUT, {recursive:true});
for (let i=0;i<json.images.length;i++){
  const img = json.images[i]; const key = WANT[img.name]; if (!key) continue;
  const bv = bvs[img.bufferView]; const off = bv.byteOffset||0, len = bv.byteLength;
  const data = bin.slice(off, off+len);
  const outPath = `${OUT}/innate-dining-swatch-${key}.jpg`;
  const meta = await sharp(data).metadata();
  const side = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width-side)/2), top = Math.floor((meta.height-side)/2);
  await sharp(data).extract({left, top, width:side, height:side}).resize(320,320,{fit:'cover'}).jpeg({quality:86}).toFile(outPath);
  console.log(`${img.name} (${meta.width}x${meta.height}) -> ${key} (${Math.round(fs.statSync(outPath).size/1024)}KB)`);
}
