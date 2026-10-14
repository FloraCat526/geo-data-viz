import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
const args=process.argv.slice(2);
let port=8000,portSpecified=false;
const usage=()=>{console.error('Usage: npm run examples -- [--port 8000]');process.exit(1);};
for(let i=0;i<args.length;i++){
 if(args[i]==='--port'&&!portSpecified&&i+1<args.length){port=Number(args[++i]);portSpecified=true;}
 else usage();
}
if(!Number.isInteger(port)||port<1||port>65535){console.error('Port must be 1–65535');process.exit(1);}
let root;
try{root=await realpath(fileURLToPath(new URL('../examples/',import.meta.url)));}
catch{console.error('Examples directory is missing.');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=await realpath(resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname)));
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
  if(!(await stat(path)).isFile())throw Error('Not a file');
  const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Try npm run examples -- --port ${port+1}`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Geo Data Viz examples: http://127.0.0.1:${port}/\nPress Ctrl+C to stop. Maps need internet; no key required.`));
