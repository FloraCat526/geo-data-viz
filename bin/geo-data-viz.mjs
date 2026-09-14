#!/usr/bin/env node
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const help = `Geo Data Viz — install the independent skill

Usage:
  geo-data-viz install [--project | --dir <skills-directory>] [--dry-run] [--force]
  geo-data-viz --version

Default: ~/.agents/skills/geo-data-viz
--project  Install into ./.agents/skills/geo-data-viz
--dir      Choose the parent skills directory (geo-data-viz is appended)
--dry-run  List the destination and files without writing
--force    Back up an existing skill before replacing it

No map keys, Python packages, or SDKs are installed by this command.
`;
async function stat(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function listFiles() {
  const files = ['SKILL.md', 'requirements-excel.txt'];
  async function walk(rel, extension) {
    for (const entry of await readdir(join(root, rel), {withFileTypes:true})) {
      const path = join(rel, entry.name);
      if (entry.isDirectory()) await walk(path, extension);
      else if (entry.isFile() && extname(entry.name) === extension) files.push(path);
      else if (entry.isSymbolicLink()) throw Error(`Unexpected symbolic link in package: ${path}`);
    }
  }
  await walk('agents', '.yaml'); await walk('scripts', '.py');
  await walk('references', '.md'); await walk('assets/adapters', '.mjs');
  await walk('assets/recipes', '.mjs');
  return files.sort();
}
async function main(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  if (args.length === 1 && ['--version','-v'].includes(args[0])) {
    console.log(JSON.parse(await readFile(join(root,'package.json'),'utf8')).version); return;
  }
  if (args.shift() !== 'install') throw Error('Unknown command. Use --help.');
  let base = join(homedir(), '.agents', 'skills'), chosen = false, dry = false, force = false;
  for (let i=0; i<args.length; i++) {
    if (args[i] === '--dry-run') dry = true;
    else if (args[i] === '--force') force = true;
    else if (args[i] === '--project' || args[i] === '--dir') {
      if (chosen) throw Error('Choose only one of --project and --dir.');
      chosen = true;
      if (args[i] === '--project') base = resolve('.agents/skills');
      else {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw Error('--dir requires a skills directory.');
        base = resolve(value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(),value.slice(2)) : value);
      }
    } else throw Error(`Unknown option: ${args[i]}`);
  }
  base = resolve(base);
  const destination = join(base,'geo-data-viz');
  const packageRoot = resolve(root);
  if (packageRoot === destination || packageRoot.startsWith(destination+sep) || destination.startsWith(packageRoot+sep)) {
    throw Error('The destination must be outside this package directory.');
  }
  const existing = await stat(destination);
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw Error('The destination is not a regular directory.');
  if (existing && !force) throw Error(`Already installed: ${destination}\nUse --force to back it up before replacing it.`);
  const files = await listFiles();
  console.log(`Destination: ${destination}`);
  if (dry) { console.log(files.join('\n')); console.log(`Dry run: ${files.length} files; no changes.`); return; }
  await mkdir(base,{recursive:true});
  const stage = await mkdtemp(join(base,'.geo-data-viz-stage-'));
  let backup;
  try {
    for (const rel of files) {
      const target = join(stage,rel); await mkdir(dirname(target),{recursive:true});
      await cp(join(root,rel),target,{errorOnExist:true,force:false});
    }
    if (existing) {
      const backupRoot = join(dirname(base),'.geo-data-viz-backups');
      await mkdir(backupRoot,{recursive:true});
      const holder = await mkdtemp(join(backupRoot,`${Date.now()}-`));
      backup = join(holder,basename(destination)); await rename(destination,backup);
    } else if (await stat(destination)) throw Error('Destination appeared during installation; retry after checking it.');
    await rename(stage,destination);
  } catch (error) {
    if (backup && !await stat(destination)) await rename(backup,destination);
    throw error;
  } finally { await rm(stage,{recursive:true,force:true}); }
  console.log(`Installed ${files.length} skill files.`);
  if (backup) console.log(`Previous version preserved: ${backup}`);
  console.log('Invoke $geo-data-viz with your data and authorized map key. Restart the agent if the skill is not listed.');
}
main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
