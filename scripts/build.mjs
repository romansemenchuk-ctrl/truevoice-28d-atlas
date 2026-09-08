import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const source='https://d2ol7oe51mr4n9.cloudfront.net/user_2wfLw0ZIROPkyh8m20FzqBXAQ46/c70e3a40-8b87-45ef-a1cf-60b1e3458395.json';
const expected='c333edc10d3440ff9b5e94ed9a0226e9a51c600d3da6baedd5bda6ee77cb9b8e';
const hash=b=>createHash('sha256').update(b).digest('hex');
const cache=process.env.ARTWORK_PACK?path.resolve(process.env.ARTWORK_PACK):path.join(root,'.cache','atlas-artwork.json');
let bytes;
try{bytes=await readFile(cache);}catch{}
if(!bytes||hash(bytes)!==expected){
 if(process.env.ARTWORK_PACK)throw new Error('ARTWORK_PACK is missing or fails SHA-256 verification.');
 const response=await fetch(source,{signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Artwork download failed: HTTP ${response.status}. Supply ARTWORK_PACK for an offline build.`);
 bytes=Buffer.from(await response.arrayBuffer());
 if(hash(bytes)!==expected)throw new Error('Artwork pack integrity verification failed.');
 await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,bytes);
}
const pack=JSON.parse(bytes.toString('utf8'));
await rm(out,{recursive:true,force:true});await mkdir(path.join(out,'assets','anatomy'),{recursive:true});
for(const folder of ['js','css'])await cp(path.join(root,folder),path.join(out,folder),{recursive:true});
for(const name of ['tract','breath','larynx','body']){
 const asset=pack[name];if(!asset||asset.width!==1122||asset.height!==1402)throw new Error(`Invalid artwork metadata: ${name}`);
 const image=Buffer.from(asset.base64,'base64');
 if(hash(image)!==asset.sha256||image.toString('ascii',8,12)!=='WEBP')throw new Error(`Invalid artwork: ${name}`);
 await writeFile(path.join(out,'assets','anatomy',`${name}.webp`),image);
}
let html=await readFile(path.join(root,'index.html'),'utf8');
for(const match of [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+\.(?:js|css))"/g)]){
 const version=hash(await readFile(path.join(root,match[1]))).slice(0,12);html=html.replaceAll(`"${match[1]}"`,`"${match[1]}?v=${version}"`);
}
const links=[];
for(const file of ['atlas-upgrade.css','accessibility.css']){const version=hash(await readFile(path.join(root,'css',file))).slice(0,12);links.push(`<link rel="stylesheet" href="css/${file}?v=${version}"/>`);}
html=html.replace('</head>',links.join('\n')+'\n</head>');
await writeFile(path.join(out,'index.html'),html);
await writeFile(path.join(out,'version.json'),JSON.stringify({version:'3.0.0',artworkSha256:expected,course:'28 lessons; source content preserved',artwork:'AI-generated artistic anatomy, not clinically validated'},null,2));
console.log('Built dist/: 28 lessons, 4 verified WebP plates, no runtime asset CDN dependency.');
