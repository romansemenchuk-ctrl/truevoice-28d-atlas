import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'dist'),privateOut=path.join(root,'_server');
const source='https://d2ol7oe51mr4n9.cloudfront.net/user_2wfLw0ZIROPkyh8m20FzqBXAQ46/c70e3a40-8b87-45ef-a1cf-60b1e3458395.json',expected='c333edc10d3440ff9b5e94ed9a0226e9a51c600d3da6baedd5bda6ee77cb9b8e';
const hash=b=>createHash('sha256').update(b).digest('hex'),cache=process.env.ARTWORK_PACK?path.resolve(process.env.ARTWORK_PACK):path.join(root,'.cache','atlas-artwork.json');
let bytes;try{bytes=await readFile(cache);}catch{}
if(!bytes||hash(bytes)!==expected){if(process.env.ARTWORK_PACK)throw Error('Invalid ARTWORK_PACK');const r=await fetch(source,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Artwork unavailable: '+r.status);bytes=Buffer.from(await r.arrayBuffer());if(hash(bytes)!==expected)throw Error('Artwork integrity failed');await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,bytes);}
const pack=JSON.parse(bytes.toString('utf8'));
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await mkdir(path.join(privateOut,'anatomy'),{recursive:true});
for(const folder of ['js','css'])await cp(path.join(root,folder),path.join(out,folder),{recursive:true});
await rm(path.join(out,'js','data'),{recursive:true,force:true});
const context={window:{}};vm.runInNewContext(await readFile(path.join(root,'js','data','lessons.js'),'utf8'),context);
if(context.window.LESSONS_DATA.length!==28)throw Error('Expected 28 source lessons');
await writeFile(path.join(privateOut,'course.json'),JSON.stringify({weeks:context.window.WEEKS_DATA,lessons:context.window.LESSONS_DATA}));
for(const key of ['tract','breath','larynx','body']){const a=pack[key],b=Buffer.from(a.base64,'base64');if(a.width!==1122||a.height!==1402||hash(b)!==a.sha256||b.toString('ascii',8,12)!=='WEBP')throw Error('Invalid image '+key);await writeFile(path.join(privateOut,'anatomy',key+'.webp'),b);}
// Version-checked compatibility transforms keep the original lesson content and controller intact.
async function replaceIn(file,from,to){const p=path.join(out,file),s=await readFile(p,'utf8');if(!s.includes(from))throw Error('Compatibility contract missing: '+file);await writeFile(p,s.replaceAll(from,to));}
await replaceIn('js/modules/anatomy-viewer.js','`assets/anatomy/${this.view}.webp`','`/api/academy?action=art&key=${this.view}`');
await replaceIn('js/modules/voice-recorder.js',"indexedDB.open('TrueVoiceRecordings',1)","indexedDB.open('TrueVoiceRecordings:'+window.ATLAS_MEMBER.id,1)");
await replaceIn('js/app.js','maxlength="100000"','maxlength="30000"');
await replaceIn('js/app.js',"window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});","window.scrollTo({top:0,behavior:'instant'});");
await replaceIn('js/app.js','Лише в цьому браузері. Експортуй резервну копію.','Прогрес і нотатки синхронізуються з кабінетом. Аудіозаписи — лише на пристрої.');
const focusPath=path.join(out,'js/modules/focus-mode.js');await writeFile(focusPath,(await readFile(focusPath,'utf8'))+'\nwindow.pauseAtlasClocks=()=>atlasClocks.forEach(c=>c.pause());\n');
await mkdir(path.join(out,'assets','brand'),{recursive:true});await cp(path.join(root,'assets','brand','logo.svg'),path.join(out,'assets','brand','logo.svg'));
let html=await readFile(path.join(root,'index.html'),'utf8');html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<html lang="uk"','<html data-member-state="gate" lang="uk"').replace('100% OFFLINE','ПРОГРЕС У КАБІНЕТІ');
const extra=['atlas-upgrade.css','accessibility.css','academy.css','academy-interaction.css'].map(f=>`<link rel="stylesheet" href="css/${f}">`).join('\n');
html=html.replace('</head>',extra+'\n</head>').replace('<body>','<body>\n'+await readFile(path.join(root,'academy-shell.html'),'utf8')).replace('</body>','<script src="js/academy.js"></script>\n</body>');
for(const m of [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+\.(?:js|css))"/g)])html=html.replaceAll(`"${m[1]}"`,`"${m[1]}?v=${hash(await readFile(path.join(out,m[1]))).slice(0,12)}"`);
await writeFile(path.join(out,'index.html'),html);
await writeFile(path.join(out,'version.json'),JSON.stringify({version:'4.0.0-core',course:'28 original lessons preserved server-side',auth:'Supabase; purchase-gated; no browser service-role key',artworkSha256:expected},null,2));
console.log('Built Academy Core: private lessons/art in _server, public sign-in shell in dist.');
