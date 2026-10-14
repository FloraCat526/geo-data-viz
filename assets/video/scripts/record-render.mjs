import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const output = resolve('out/story.mp4');
const metadata = await stat(output);
if (!metadata.isFile() || metadata.size === 0) throw new Error('The renderer produced no MP4.');
const path = resolve('video-manifest.json');
const manifest = JSON.parse(await readFile(path,'utf8'));
manifest.verification = 'rendered-awaiting-visual-review';
manifest.bytes = metadata.size;
await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
console.log(`Rendered ${manifest.duration}s video. Visual review remains required.`);
