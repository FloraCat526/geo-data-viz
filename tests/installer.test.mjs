import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, access, rm, symlink, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const cli=fileURLToPath(new URL('../bin/geo-data-viz.mjs',import.meta.url));
async function fixture(t){const path=await mkdtemp(join(tmpdir(),'geo-install-test-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
const run=(cwd,...args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});
test('installs a complete standalone skill into a custom parent',async t=>{
 const cwd=await fixture(t),r=run(cwd,'install','--dir','custom skills');assert.equal(r.status,0,r.stderr);
 const dest=join(cwd,'custom skills/geo-data-viz');
 for(const file of ['SKILL.md','scripts/profile_geo.py','scripts/build_mapbox_html.py','references/mapbox-recipes.md','references/capabilities/amap.md','assets/adapters/providers.mjs','assets/recipes/mapbox-layers.mjs','agents/openai.yaml','requirements-excel.txt'])await access(join(dest,file));
 assert.match(await readFile(join(dest,'SKILL.md'),'utf8'),/name: geo-data-viz/);
 for(const excluded of ['.env.local','bin','assets/screenshots','.git','node_modules'])await assert.rejects(access(join(dest,excluded)));
});
test('refuses existing files by default and preserves them in a backup with force',async t=>{
 const cwd=await fixture(t);assert.equal(run(cwd,'install','--project').status,0);
 const dest=join(cwd,'.agents/skills/geo-data-viz');await writeFile(join(dest,'custom-note.txt'),'keep me');
 assert.equal(run(cwd,'install','--project').status,1);assert.equal(await readFile(join(dest,'custom-note.txt'),'utf8'),'keep me');
 const r=run(cwd,'install','--project','--force');assert.equal(r.status,0,r.stderr);
 const base=join(cwd,'.agents/.geo-data-viz-backups'),folders=await readdir(base);assert.equal(folders.length,1);
 assert.equal(await readFile(join(base,folders[0],'geo-data-viz/custom-note.txt'),'utf8'),'keep me');
 await access(join(dest,'SKILL.md'));await assert.rejects(access(join(dest,'custom-note.txt')));
});
test('dry run does not create directories',async t=>{
 const cwd=await fixture(t),r=run(cwd,'install','--project','--dry-run');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Dry run/);assert.deepEqual(await readdir(cwd),[]);
});
test('rejects conflicting or incomplete options without writing',async t=>{
 const cwd=await fixture(t);
 for(const args of [['install','--dir'],['install','--project','--dir','foo'],['install','--unknown']])assert.equal(run(cwd,...args).status,1);
 assert.deepEqual(await readdir(cwd),[]);
});
test('force does not follow a destination symlink',async t=>{
 const cwd=await fixture(t);await mkdir(join(cwd,'elsewhere'));await mkdir(join(cwd,'skills'));await writeFile(join(cwd,'elsewhere/keep'),'untouched');
 await symlink(join(cwd,'elsewhere'),join(cwd,'skills/geo-data-viz'),'dir');
 assert.equal(run(cwd,'install','--dir','skills','--force').status,1);assert.equal(await readFile(join(cwd,'elsewhere/keep'),'utf8'),'untouched');
});
