import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from '../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js';

const root = path.resolve('public');
const out = path.join(root, 'optimized');
await fs.mkdir(out, { recursive: true });
async function walk(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(items.filter(e => e.name !== 'optimized').map(e => e.isDirectory() ? walk(path.join(dir,e.name)) : path.join(dir,e.name)))).flat();
}
const mapping = {};
const report = [];
for (const file of await walk(root)) {
  if (!/\.(png|jpe?g|webp|ico)$/i.test(file)) continue;
  const rel = path.relative(root, file);
  const input = await fs.readFile(file);
  let bytes = input;
  if (input.readUInt16LE(0) === 0 && input.readUInt16LE(2) === 1) {
    // ICO can contain PNG or BMP frames. Preserve PNG frames without modification.
    const frames = Array.from({length:input.readUInt16LE(4)},(_,i)=>{
      const p=6+i*16; return {size:input.readUInt32LE(p+8),offset:input.readUInt32LE(p+12)};
    }).sort((a,b)=>b.size-a.size);
    const frame=frames.find(f=>input.subarray(f.offset,f.offset+8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    if (!frame) { report.push({file:rel,skipped:'ICO bitmap requires platform decoder'}); continue; }
    bytes=input.subarray(frame.offset,frame.offset+frame.size);
  }
  const metadata = await sharp(bytes).metadata();
  const isReference = rel.includes('-reference');
  const lossless = /qr/i.test(rel);
  const max = rel.startsWith('logos/tools/') ? 96 : rel.startsWith('logos/') ? 256 : /avatar/.test(rel) ? 640 : 1200;
  let pipeline = sharp(bytes);
  // Screenshot-based company logo positioning depends on original dimensions.
  if (!isReference && !lossless) pipeline=pipeline.resize({width:max,height:max,fit:'inside',withoutEnlargement:true});
  const result=await pipeline.webp({quality:82,effort:6,lossless}).toBuffer();
  const output = rel.replace(/\.(png|jpe?g|webp|ico)$/i,'.webp');
  const target=path.join(out,output);
  await fs.mkdir(path.dirname(target),{recursive:true});
  const selected=metadata.format==='webp' && input.length<result.length ? input : result;
  await fs.writeFile(target,selected);
  mapping['/'+rel]='/optimized/'+output;
  report.push({file:rel,before:input.length,after:selected.length,width:metadata.width,height:metadata.height});
}
console.log(JSON.stringify({mapping,report},null,2));
