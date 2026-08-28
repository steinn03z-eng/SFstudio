import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as database from './database.js';

const DEFAULT_MUSIC = {
  enabled: true,
  commandPrefix: '!',
  requestCommand: 'musica',
  pointCost: 100,
  maxDurationSeconds: 300,
  maxQueue: 10,
  showNext: true,
  showProgress: true,
  showRequester: true,
  allowModeratorCommands: false,
  admins: { tiktok: [], twitch: [] },
  adminCommandPrefixes: { pause: '!', stop: '!', skip: '!', repeat: '!', volume: '!' },
  adminCommands: {
    pause: 'pausa', stop: 'detener', skip: 'siguiente', repeat: 'repetir', volume: 'vol'
  },
  volume: 100,
  style: { scale: 1, accent: '#8b5cf6', accent2: '#ec4899', progressMode: 'gradient2', progressColor: '#8b5cf6', progressColor2: '#ec4899', progressColor3: '#22d3ee', textColor: '#ffffff', secondaryTextColor: '#b9b9c8', titleFont: 'Inter', artistFont: 'Inter', titleSize: 28, artistSize: 15, vinylSize: 170, design: 'vinyl-glow', showVinyl: true }
};

const PREFIXES = ['!', '/', '.', '-'];
const REQUEST_COMMANDS = ['S', 'song', 'm', 'musica'];
const ADMIN_COMMANDS = {
  pause: ['pausar', 'pausa', 'pause'],
  stop: ['stop', 'detener'],
  skip: ['skip', 'saltar', 'siguiente', 'next'],
  repeat: ['repeat', 'repetir'],
  volume: ['volumen', 'audio', 'vol', 'v']
};

const queues = new Map();
const previewStates = new Map();
const previewSettings = new Map();

function clone(v) { return structuredClone(v); }
function norm(v) { return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,''); }
function clean(v,max=500) { return String(v ?? '').trim().slice(0,max); }
function platformOf(v) { return String(v||'tiktok').toLowerCase()==='twitch'?'twitch':'tiktok'; }
function clamp(n,min,max,fallback){ const x=Number(n); return Number.isFinite(x)?Math.min(max,Math.max(min,x)):fallback; }

export function normalizeMusicConfig(input={}) {
  const r=input&&typeof input==='object'?input:{};
  const c={...DEFAULT_MUSIC,...r,
    admins:{...DEFAULT_MUSIC.admins,...(r.admins||{})},
    adminCommandPrefixes:{...DEFAULT_MUSIC.adminCommandPrefixes,...(r.adminCommandPrefixes||{})},
    adminCommands:{...DEFAULT_MUSIC.adminCommands,...(r.adminCommands||{})},
    style:{...DEFAULT_MUSIC.style,...(r.style||{})}
  };
  c.enabled=c.enabled!==false;
  c.commandPrefix=PREFIXES.includes(String(c.commandPrefix))?String(c.commandPrefix):'!';
  const requested=clean(c.requestCommand||'musica',32).replace(/[^\p{L}\p{N}_-]/gu,'').toLowerCase(); const matchReq=REQUEST_COMMANDS.find(v=>String(v).toLowerCase()===requested); c.requestCommand=matchReq||'musica';
  c.pointCost=clamp(c.pointCost,0,1000000,100);
  c.maxDurationSeconds=clamp(c.maxDurationSeconds,15,3600,300);
  c.maxQueue=clamp(c.maxQueue,1,10,10);
  c.showNext=c.showNext!==false; c.showProgress=c.showProgress!==false; c.showRequester=c.showRequester!==false; c.allowModeratorCommands=c.allowModeratorCommands===true;
  c.volume=clamp(c.volume,0,100,100);
  c.admins={tiktok:Array.isArray(c.admins?.tiktok)?c.admins.tiktok.map(v=>cleanUser(v)).filter(Boolean).slice(0,10):[],twitch:Array.isArray(c.admins?.twitch)?c.admins.twitch.map(v=>cleanUser(v)).filter(Boolean).slice(0,10):[]};
  for(const k of Object.keys(ADMIN_COMMANDS)) {
    c.adminCommandPrefixes[k]=PREFIXES.includes(String(c.adminCommandPrefixes[k]))?String(c.adminCommandPrefixes[k]):c.commandPrefix;
    const custom=clean(c.adminCommands[k]||ADMIN_COMMANDS[k][0],32).toLowerCase();
    const selected=ADMIN_COMMANDS[k].find(v=>String(v).toLowerCase()===custom);
    c.adminCommands[k]=selected||ADMIN_COMMANDS[k][0];
  }
  c.style.scale=clamp(c.style.scale,.45,2,1); c.style.accent=/^#[0-9a-f]{6}$/i.test(c.style.accent)?c.style.accent:'#8b5cf6'; c.style.accent2=/^#[0-9a-f]{6}$/i.test(c.style.accent2)?c.style.accent2:'#ec4899'; c.style.progressMode=['single','gradient2','gradient3'].includes(String(c.style.progressMode))?String(c.style.progressMode):'gradient2'; c.style.progressColor=/^#[0-9a-f]{6}$/i.test(c.style.progressColor)?c.style.progressColor:c.style.accent; c.style.progressColor2=/^#[0-9a-f]{6}$/i.test(c.style.progressColor2)?c.style.progressColor2:c.style.accent2; c.style.progressColor3=/^#[0-9a-f]{6}$/i.test(c.style.progressColor3)?c.style.progressColor3:'#22d3ee'; c.style.textColor=/^#[0-9a-f]{6}$/i.test(c.style.textColor)?c.style.textColor:'#ffffff'; c.style.secondaryTextColor=/^#[0-9a-f]{6}$/i.test(c.style.secondaryTextColor)?c.style.secondaryTextColor:'#b9b9c8'; c.style.titleFont=clean(c.style.titleFont||'Inter',60); c.style.artistFont=clean(c.style.artistFont||'Inter',60); c.style.titleSize=clamp(c.style.titleSize,16,72,28); c.style.artistSize=clamp(c.style.artistSize,10,36,15); c.style.vinylSize=clamp(c.style.vinylSize,90,280,170); c.style.design=['vinyl-glow','minimal','neon-ring','retro','mono','glass','cyber','sunset','arcade','arcade-glass','aurora','synthwave','hologram','matrix','oceanic','fire','candy','monochrome-glow','blueprint','terminal','crystal-glass','rose-aurora','midnight-luxe','plasma-core','mint-mist','ice-chrome','golden-hour','ruby-noir','vapor-dream','cosmic-bloom','glow-wave','rgb-pulse','chrome-neon','rose-glass','electric-lime','violet-wave','pixel-glass','infrared','spectrum','liquid-glass'].includes(c.style.design)?c.style.design:'vinyl-glow'; c.style.showVinyl=c.style.showVinyl!==false;
  return c;
}
function cleanUser(v){return String(v??'').trim().replace(/^[@#]+/,'').replace(/^https?:\/\/(www\.)?(tiktok\.com\/@|twitch\.tv\/)/i,'').split(/[/?#]/)[0].trim().toLowerCase();}
function getSettings(ownerId){ return database.getUserSettings(ownerId)||{}; }
export function getMusicConfig(ownerId){ return normalizeMusicConfig(getSettings(ownerId).musicWidget||{}); }
export function setMusicConfig(ownerId,cfg){ const current=getSettings(ownerId); const merged={...current,musicWidget:normalizeMusicConfig(cfg)}; database.saveUserSettings(ownerId,merged); return merged.musicWidget; }
function qFor(ownerId){ const key=String(ownerId||''); if(!queues.has(key)) queues.set(key,{items:[],current:null,previous:null,history:[],paused:false,repeating:false,repeatOnce:false,version:0,startedAt:0,pausedElapsed:0,volume:100,simulationActive:false,simulationOverlayEnabled:false,simulationQueue:[],simulationPrevious:null,simulationResume:null,controlLockUntil:0}); const q=queues.get(key); if(!Array.isArray(q.history)) q.history=[]; if(!Array.isArray(q.simulationQueue)) q.simulationQueue=[]; if(!Number.isFinite(Number(q.controlLockUntil))) q.controlLockUntil=0; return q; }
function makeTrackId(){return `m_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;}
function formatDuration(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
function publicTrack(t){if(!t)return null; return {id:t.id,title:t.title,artist:t.artist,thumbnail:t.thumbnail,duration:t.duration,requester:t.requester,pointsCost:Number(t.pointsCost||0),platform:t.platform,url:t.url,sourceType:t.sourceType||'youtube-iframe',sourceId:t.sourceId||extractYouTubeId(t.url||''),source:t.source||((String(t.requester||'').toLowerCase()==='simulación')?'simulation':'direct')};}
function snapshot(ownerId){const q=qFor(ownerId);const elapsed=q.current?(q.paused?Number(q.pausedElapsed||0):Math.max(0,(Date.now()-Number(q.startedAt||Date.now()))/1000)):0;return {current:publicTrack(q.current),queue:q.items.map(publicTrack),previous:publicTrack(q.previous),history:q.history.slice(0,50).map(publicTrack),paused:Boolean(q.paused),repeating:Boolean(q.repeating),repeatOnce:Boolean(q.repeatOnce),elapsed,playing:Boolean(q.current&&!q.paused),startedAt:Number(q.startedAt||0),pausedElapsed:Number(q.pausedElapsed||0),volume:clamp(q.volume,0,100,100),version:q.version,serverNow:Date.now(),simulationActive:Boolean(q.simulationActive),simulationOverlayEnabled:Boolean(q.simulationOverlayEnabled),simulationCurrent:publicTrack(q.simulationActive && q.current?.source==='simulation'?q.current:null),simulationQueue:q.simulationQueue.map(publicTrack),simulationPrevious:publicTrack(q.simulationPrevious),simulationResume:q.simulationResume?{hasCurrent:Boolean(q.simulationResume.current),elapsed:Number(q.simulationResume.elapsed||0),playing:Boolean(q.simulationResume.playing),paused:Boolean(q.simulationResume.paused)}:null};}
function emit(ownerId,io,event,payload){io?.to?.(`user:${ownerId}`).emit(event,payload);}
function authorizeAdmin(ownerId,platform,identity,payload={}){
  const cfg=getMusicConfig(ownerId); const key=cleanUser(identity); if(!key)return false;
  const platformKey=platformOf(platform); const settings=getSettings(ownerId);
  const connected=settings.connectionProfiles?.[platformKey]; const connectedKey=cleanUser(connected?.username||'');
  if(connectedKey && connectedKey===key)return true;
  // Additional manually entered admins are intentionally ignored. The account
  // currently connected to StreamFusion is the sole owner/admin identity.
  if(!cfg.allowModeratorCommands)return false;
  const badges=Array.isArray(payload?.badges)?payload.badges:[];
  const isModerator=badges.some(b=>/moderator|mod(erator)?/i.test(String(typeof b==='object'?(b.name||b.type||b.label||b.id||''):b)));
  return isModerator;
}
function parseCommand(message,cfg){
  const text=String(message||'').trim();
  if(!text)return null;
  const matchCommand=(prefix,names,type)=>{
    if(!prefix || !text.startsWith(prefix))return null;
    const pieces=text.slice(prefix.length).trim().split(/\s+/);
    const command=norm(pieces.shift()||'');
    const list=Array.isArray(names)?names:names?[names]:[];
    if(!list.some(name=>command===norm(name)))return null;
    return {type,arg:pieces.join(' ').trim(),word:command};
  };
  const request=matchCommand(cfg.commandPrefix,cfg.requestCommand,'request'); if(request)return request;
  for(const type of Object.keys(ADMIN_COMMANDS)){
    const prefix=cfg.adminCommandPrefixes?.[type]||cfg.commandPrefix;
    const preferred=cfg.adminCommands?.[type]||ADMIN_COMMANDS[type][0];
    const found=matchCommand(prefix,preferred,type);
    if(found)return found;
    if(type==='volume'){
      const aliases=ADMIN_COMMANDS.volume.some(name=>Boolean(matchCommand(prefix,name,type)));
      if(aliases){ const pieces=text.startsWith(prefix)?text.slice(prefix.length).trim().split(/\s+/):[]; const command=norm(pieces.shift()||''); if(ADMIN_COMMANDS.volume.some(name=>command===norm(name))) return {type,arg:pieces.join(' ').trim(),word:command}; }
    }
  }
  return null;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Music resolution intentionally uses YouTube Music metadata only.
// No direct audio extraction is used; playback is delegated to the YouTube IFrame Player.
// Playback is delegated to the official YouTube IFrame Player in the browser/OBS overlay.
const YTMUSIC_HELPER = path.join(__dirname, '..', 'scripts', 'ytmusic-search.py');

function getPythonCommand(){
  const configured=String(process.env.PYTHON_BIN||'').trim();
  if(configured) return configured;
  // Railway/Linux normally exposes python3; Windows commonly exposes python.
  return process.platform === 'win32' ? 'python' : 'python3';
}


function extractYouTubeId(value){
  const input=String(value||'').trim();
  if(!input)return '';
  const m=input.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/|(?:^|[?&])v=)([A-Za-z0-9_-]{11})/i);
  return m?.[1] || (/^[A-Za-z0-9_-]{11}$/.test(input)?input:'');
}

async function runYtMusicHelper(mode, value){
  const input=String(value||'').trim();
  if(!input) throw new Error('Escribe el nombre o URL de la canción.');
  return await new Promise((resolve,reject)=>{
    const child=spawn(getPythonCommand(),[YTMUSIC_HELPER,mode,input],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    let stdout=''; let stderr=''; let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;try{child.kill('SIGKILL')}catch{};reject(new Error('YouTube Music tardó demasiado en responder.'));},15000);
    child.stdout.on('data',d=>stdout+=d.toString());
    child.stderr.on('data',d=>stderr+=d.toString());
    child.once('error',e=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(e?.code==='ENOENT') reject(new Error(`No se encontró Python (${getPythonCommand()}). Instala Python 3.10+ y ytmusicapi, o define PYTHON_BIN.`));
      else reject(e);
    });
    child.once('close',code=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      if(code!==0){reject(new Error(stderr.trim()||'No se pudo consultar YouTube Music.'));return;}
      try{
        const parsed=JSON.parse(stdout);
        if(!parsed?.ok) throw new Error(parsed?.error||'No se encontró la canción.');
        resolve(parsed);
      }catch(e){reject(e instanceof Error?e:new Error('Respuesta inválida de YouTube Music.'));}
    });
  });
}

function trackFromYtMusic(item,requester){
  const videoId=String(item?.videoId||item?.id||'').trim();
  if(!videoId) throw new Error('YouTube Music no devolvió un videoId reproducible.');
  const artists=Array.isArray(item?.artists)?item.artists.map(a=>String(a?.name||'').trim()).filter(Boolean):[];
  const title=clean(item?.title||'Sin título',200);
  const artist=clean(artists.join(', ')||item?.artist||'Artista desconocido',120);
  const duration=Math.max(1,Math.floor(Number(item?.duration_seconds||item?.duration||0)||1));
  const thumbnail=clean(item?.thumbnail||item?.thumbnails?.[0]?.url||`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,2000);
  return {
    id:makeTrackId(), title, artist, thumbnail, duration,
    requester:clean(requester||'Usuario',80), platform:'youtube',
    url:`https://www.youtube.com/watch?v=${videoId}`,
    sourceType:'youtube-iframe', sourceId:videoId
  };
}

async function youtubeWebFallback(query, requester){
  const input=String(query||'').trim();
  const directId=extractYouTubeId(input);
  const headers={
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36',
    'accept-language':'es-ES,es;q=0.9,en;q=0.8'
  };

  if(directId){
    try{
      const u=`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${directId}`)}&format=json`;
      const r=await fetch(u,{headers,signal:AbortSignal.timeout(8000)});
      if(r.ok){
        const d=await r.json();
        return {
          videoId:directId,
          title:d.title||'Canción de YouTube',
          artists:[{name:d.author_name||'Artista desconocido'}],
          duration_seconds:1,
          thumbnail:`https://i.ytimg.com/vi/${directId}/hqdefault.jpg`
        };
      }
    }catch{}
    return {videoId:directId,title:'Canción de YouTube',artists:[{name:'Artista desconocido'}],duration_seconds:1,thumbnail:`https://i.ytimg.com/vi/${directId}/hqdefault.jpg`};
  }

  const url=`https://www.youtube.com/results?search_query=${encodeURIComponent(input)}`;
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`YouTube respondió con HTTP ${response.status}.`);
  const html=await response.text();
  const marker='var ytInitialData = ';
  const start=html.indexOf(marker);
  if(start<0) throw new Error('YouTube no devolvió resultados de búsqueda.');
  const jsonStart=start+marker.length;
  let depth=0,inString=false,esc=false,end=-1;
  for(let i=jsonStart;i<html.length;i++){
    const c=html[i];
    if(inString){
      if(esc) esc=false;
      else if(c==='\\') esc=true;
      else if(c==='"') inString=false;
      continue;
    }
    if(c==='"'){inString=true;continue;}
    if(c==='{') depth++;
    else if(c==='}'){depth--;if(depth===0){end=i+1;break;}}
  }
  if(end<0) throw new Error('No se pudo leer la respuesta de YouTube.');
  let data;
  try{data=JSON.parse(html.slice(jsonStart,end));}catch{throw new Error('YouTube devolvió una respuesta no válida.');}

  const videos=[];
  const walk=(node)=>{
    if(!node||videos.length>=8)return;
    if(Array.isArray(node)){for(const x of node)walk(x);return;}
    if(typeof node!=='object')return;
    const v=node.videoRenderer;
    if(v?.videoId){
      const title=(v.title?.runs?.map(x=>x?.text||'').join('')||v.title?.simpleText||'').trim();
      const artist=(v.ownerText?.runs?.map(x=>x?.text||'').join('')||v.longBylineText?.runs?.map(x=>x?.text||'').join('')||'Artista desconocido').trim();
      const thumb=Array.isArray(v.thumbnail?.thumbnails)&&v.thumbnail.thumbnails.length?v.thumbnail.thumbnails.at(-1)?.url:`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const length=v.lengthText?.simpleText||'';
      videos.push({videoId:v.videoId,title:title||'Sin título',artists:[{name:artist}],duration:length,duration_seconds:1,thumbnail:thumb});
    }
    for(const value of Object.values(node))walk(value);
  };
  walk(data);
  const unique=[]; const seen=new Set();
  for(const item of videos){if(!seen.has(item.videoId)){seen.add(item.videoId);unique.push(item);}}
  if(!unique.length) throw new Error('No encontré una canción con ese nombre.');
  return unique[0];
}

async function resolveViaYtMusic(query,requester){
  const directId=extractYouTubeId(query);
  try{
    const result=await runYtMusicHelper(directId?'video':'search',directId||query);
    const item=result?.track || result?.results?.[0];
    if(item) return trackFromYtMusic(item,requester);
  }catch(primaryError){
    // Public YouTube search is a fallback for Railway/hosting environments
    // where the unofficial YouTube Music endpoint is temporarily blocked or
    // changed. Playback still uses the official IFrame Player.
    try{
      const fallback=await youtubeWebFallback(query,requester);
      return trackFromYtMusic(fallback,requester);
    }catch(fallbackError){
      const detail=String(primaryError?.message||fallbackError?.message||'');
      throw new Error(detail||'No se pudo consultar YouTube.');
    }
  }
  try{
    const fallback=await youtubeWebFallback(query,requester);
    return trackFromYtMusic(fallback,requester);
  }catch(e){
    throw new Error(e?.message||'No encontré una canción con ese nombre.');
  }
}

async function resolveTrack(query,requester){
  const input=String(query||'').trim();
  if(!input) throw new Error('Escribe el nombre o URL de la canción.');
  return await resolveViaYtMusic(input,requester);
}

function killStream(trackId){ /* Audio is owned by the YouTube IFrame Player; nothing server-side to kill. */ }
function rememberHistory(q, track){
  if(!track) return;
  const item=publicTrack(track);
  if(!item) return;
  q.history=[item,...(Array.isArray(q.history)?q.history:[]).filter(x=>String(x?.id)!==String(item.id))].slice(0,50);
}
function setCurrent(q, track, {autoplay=true, rememberPrevious=true}={}){
  if(rememberPrevious && q.current) rememberHistory(q,q.current);
  q.current=track||null;
  q.paused=false;
  q.pausedElapsed=0;
  q.startedAt=q.current?Date.now():0;
  if(!autoplay && q.current) q.paused=true;
}
function bridgeSimulation(ownerId, track, io, simQueue=[], simPrevious=null, meta={}){
  const q=qFor(ownerId);
  if(!q.simulationActive){
    const liveSnapshot=snapshot(ownerId);
    q.simulationResume={current:q.current?clone(q.current):null,previous:q.previous?clone(q.previous):null,elapsed:Number(liveSnapshot.elapsed||0),playing:Boolean(liveSnapshot.playing),paused:Boolean(liveSnapshot.paused),startedAt:Number(q.startedAt||0),pausedElapsed:Number(q.pausedElapsed||0)};
  }
  const currentSource=String(q.current?.sourceId||'');
  const nextSource=String(track?.sourceId||'');
  if(q.simulationActive && currentSource && currentSource!==nextSource && q.current) { q.previous=q.current; rememberHistory(q,q.current); }
  const simulated={...clone(track), id:(q.simulationActive && q.current && currentSource===nextSource)?q.current.id:makeTrackId(), requester:'Simulación', requesterPlatform:'simulation', requesterIdentity:'simulation', source:'simulation'};
  q.simulationActive=true; q.simulationOverlayEnabled=true;
  q.simulationQueue=(Array.isArray(simQueue)?simQueue:[]).map(v=>({...clone(v),requester:'Simulación',requesterPlatform:'simulation',requesterIdentity:'simulation',source:'simulation'})).filter(v=>v?.sourceId);
  q.simulationPrevious=simPrevious?{...clone(simPrevious),requester:'Simulación',source:'simulation'}:null;
  q.current=simulated;
  q.paused=meta.playing===false || Boolean(meta.paused); q.pausedElapsed=Math.max(0,Number(meta.elapsed||0)); q.startedAt=q.paused?0:(Date.now()-q.pausedElapsed*1000); if(!q.paused && !meta.elapsed) q.startedAt=Date.now(); q.repeatOnce=false; q.version++;
  emit(ownerId,io,'musicState',snapshot(ownerId));
  return snapshot(ownerId);
}
export function playTrack(ownerId,trackId,io){
  const q=qFor(ownerId), id=String(trackId||''); if(!id) return snapshot(ownerId);
  const simIdx=q.simulationQueue.findIndex(t=>String(t.id)===id);
  if(simIdx>=0){
    if(!q.simulationActive){
      const liveSnapshot=snapshot(ownerId);
      q.simulationResume={current:q.current?clone(q.current):null,previous:q.previous?clone(q.previous):null,elapsed:Number(liveSnapshot.elapsed||0),playing:Boolean(liveSnapshot.playing),paused:Boolean(liveSnapshot.paused),startedAt:Number(q.startedAt||0),pausedElapsed:Number(q.pausedElapsed||0)};
    }
    if(q.simulationActive && q.current) { q.simulationPrevious=q.current; rememberHistory(q,q.current); }
    const target=clone(q.simulationQueue.splice(simIdx,1)[0]);
    q.simulationActive=true; q.simulationOverlayEnabled=true; q.current={...target,requester:'Simulación',source:'simulation'}; q.paused=false; q.pausedElapsed=0; q.startedAt=Date.now(); q.version++;
    emit(ownerId,io,'musicState',snapshot(ownerId));
    return snapshot(ownerId);
  }
  if(q.simulationActive){ q.simulationOverlayEnabled=false; q.previous=null; }
  let idx=q.items.findIndex(t=>String(t.id)===id);
  let target=idx>=0?q.items[idx]:null;
  if(target) q.items.splice(idx,1);
  if(!target){
    const hi=q.history.findIndex(t=>String(t.id)===id);
    if(hi>=0) { target=clone(q.history[hi]); q.history.splice(hi,1); }
  }
  if(!target) return snapshot(ownerId);
  if(q.current) { q.previous=q.current; rememberHistory(q,q.current); }
  q.current=target; q.paused=false; q.pausedElapsed=0; q.startedAt=Date.now(); q.version++;
  emit(ownerId,io,'musicState',snapshot(ownerId));
  return snapshot(ownerId);
}
export function clearHistory(ownerId,io){
  const q=qFor(ownerId); q.history=[]; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId);
}
function advance(ownerId,io,reason='finished'){
  const q=qFor(ownerId); const prev=q.current; if(prev)killStream(prev.id);
  if(prev){ q.previous=prev; rememberHistory(q,prev); }
  if(reason==='repeat' || q.repeating){ if(prev){q.items.unshift({...prev,id:makeTrackId()});} }
  q.current=q.items.shift()||null; q.paused=false; q.pausedElapsed=0; q.startedAt=q.current?Date.now():0; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId));
}
export function getPublicSnapshot(ownerId){return snapshot(ownerId);}
export function getPreviewTrack(ownerId){ const st=previewStates.get(String(ownerId||'')); return st?.current ? clone(st.current) : null; }
export function processChat(ownerId,payload,io){
  const cfg=getMusicConfig(ownerId); if(!cfg.enabled)return {handled:false,payload};
  const msg=payload?.message||payload?.comment||''; const cmd=parseCommand(msg,cfg); if(!cmd)return {handled:false,payload};
  const platform=platformOf(payload?.platform); const identity=payload?.uniqueId||payload?.username||payload?.user||payload?.displayName||'';
  if(cmd.type==='request'){
    const q=qFor(ownerId); const query=cmd.arg;
    const currentPoints=Number(database.getPoints(ownerId,platform,identity)?.points||0); const cost=Number(cfg.pointCost||0);
    if(!query){emit(ownerId,io,'musicNotice',{type:'error',message:`Usa ${cfg.commandPrefix}${cfg.requestCommand} <canción o URL>.`}); return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'request',skipVoiceBot:true}};}
    if(q.items.length>=cfg.maxQueue){emit(ownerId,io,'musicNotice',{type:'error',message:'La cola de música está llena.'}); return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'request',skipVoiceBot:true}};}
    if(cost>0 && currentPoints<cost){emit(ownerId,io,'musicNotice',{type:'error',message:`Necesitas ${cost.toLocaleString('es-PE')} puntos para solicitar una canción.`}); return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'request',skipVoiceBot:true}};}
    resolveTrack(query,payload?.displayName||identity||'Usuario').then(track=>{
      const max=Number(cfg.maxDurationSeconds||300); if(track.duration>max)track.duration=max;
      const qq=qFor(ownerId);
      if(qq.items.length>=cfg.maxQueue){ emit(ownerId,io,'musicNotice',{type:'error',message:'La cola se llenó mientras se resolvía la solicitud. Tus puntos no fueron descontados.'}); return; }
      if(cost>0){
        const charged=database.spendPointsIfEnough(ownerId,platform,identity,cost);
        if(!charged.ok){ emit(ownerId,io,'musicNotice',{type:'error',message:`Necesitas ${cost.toLocaleString('es-PE')} puntos para solicitar una canción.`}); return; }
      }
      track.pointsCost=cost; track.requesterPlatform=platform; track.requesterIdentity=identity; qq.items.push(track); emit(ownerId,io,'musicState',snapshot(ownerId));
      if(!qq.current) advance(ownerId,io,'finished');
    }).catch(err=>emit(ownerId,io,'musicNotice',{type:'error',message:err?.message||'No se pudo encontrar la canción. Tus puntos no fueron descontados.'}));
    return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'request',musicPointsCost:cost,skipVoiceBot:true}};
  }
  if(authorizeAdmin(ownerId,platform,identity,payload)){
    const q=qFor(ownerId);
    if(cmd.type==='pause'){q.paused=!q.paused;emit(ownerId,io,'musicCommand',{action:q.paused?'pause':'resume'});emit(ownerId,io,'musicState',snapshot(ownerId));}
    else if(cmd.type==='stop'){killStream(q.current?.id);q.current=null;q.paused=false;q.version++;emit(ownerId,io,'musicCommand',{action:'stop'});emit(ownerId,io,'musicState',snapshot(ownerId));}
    else if(cmd.type==='skip'){advance(ownerId,io,'finished');}
    else if(cmd.type==='repeat'){if(q.current){q.repeatOnce=true;q.version++;emit(ownerId,io,'musicState',snapshot(ownerId));}}
    else if(cmd.type==='volume'){
      const raw=String(cmd.arg||'').trim();
      if(!raw){ emit(ownerId,io,'musicNotice',{type:'error',message:`Usa ${cfg.adminCommandPrefixes?.volume||cfg.commandPrefix}${cfg.adminCommands?.volume||'vol'} <0-100>.`}); return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'volume',skipVoiceBot:true}}; }
      const value=Number(raw.replace(',','.'));
      if(!Number.isFinite(value)||value<0||value>100){ emit(ownerId,io,'musicNotice',{type:'error',message:'El volumen debe ser un número entre 0 y 100.'}); return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'volume',skipVoiceBot:true}}; }
      const next=Math.round(value);
      if(q.volume!==next){ q.volume=next; q.version++; emit(ownerId,io,'musicVolume',{volume:next}); emit(ownerId,io,'musicState',snapshot(ownerId)); }
    }
    return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:cmd.type,skipVoiceBot:true}};
  }
  return {handled:true,payload:{...payload,musicCommand:true,musicCommandType:'admin-denied',skipVoiceBot:true}};
}


export async function addPlaylistTrack(ownerId, query, requester='Panel', io) {
  const cfg=getMusicConfig(ownerId);
  const q=qFor(ownerId);
  const limit=Math.min(10, Number(cfg.maxQueue||10));
  if(q.items.length >= limit) throw new Error(`La playlist está llena (${limit}/10).`);
  const track=await resolveTrack(query, requester);
  const max=Number(cfg.maxDurationSeconds||300);
  if(track.duration>max) track.duration=max;
  if(q.current && (String(q.current.sourceId)===String(track.sourceId) || q.items.some(x=>String(x.sourceId)===String(track.sourceId)))) throw new Error('Esa canción ya está en la playlist.');
  track.pointsCost=0;
  track.requester=requester;
  track.requesterPlatform='panel';
  track.requesterIdentity='panel';
  q.items.push(track);
  if(!q.current) advance(ownerId,io,'finished');
  return snapshot(ownerId);
}
export function reorderPlaylistTrack(ownerId, trackId, targetIndex, io){
  const q=qFor(ownerId); const id=String(trackId||'');
  const targetList=q.items.some(t=>String(t.id)===id)?q.items:(q.simulationQueue.some(t=>String(t.id)===id)?q.simulationQueue:null);
  if(!targetList) throw new Error('Canción no encontrada en la cola.');
  const from=targetList.findIndex(t=>String(t.id)===id);
  let to=Math.max(0,Math.min(targetList.length-1,Math.floor(Number(targetIndex))));
  if(!Number.isFinite(to)) to=from;
  if(from===to) return snapshot(ownerId);
  const [item]=targetList.splice(from,1);
  // targetIndex is the final index in the list *after* removing the dragged item.
  // This keeps upward and downward moves symmetric (A→D, D→A, etc.).
  const finalIndex=Math.max(0,Math.min(targetList.length,Math.floor(to)));
  targetList.splice(finalIndex,0,item);
  q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId);
}
export function removePlaylistTrack(ownerId, trackId, io){
  const q=qFor(ownerId);
  const idx=q.items.findIndex(t=>String(t.id)===String(trackId));
  if(idx>=0){ q.items.splice(idx,1); q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return true; }
  const simIdx=q.simulationQueue.findIndex(t=>String(t.id)===String(trackId));
  if(simIdx>=0){ q.simulationQueue.splice(simIdx,1); q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return true; }
  return false;
}

export function getCurrentTrack(ownerId){ const q=qFor(ownerId); return q.current ? structuredClone(q.current) : null; }
export function isCurrentTrack(ownerId,trackId){ const q=qFor(ownerId); return Boolean(q.current && String(q.current.id)===String(trackId)); }
export function finish(ownerId,io,trackId){ const q=qFor(ownerId); if(!q.current || String(q.current.id)!==String(trackId)) return snapshot(ownerId); if(q.simulationActive && String(q.current.source||'')==='simulation'){ const prev=q.current; rememberHistory(q,prev); q.simulationPrevious=prev; const next=q.simulationQueue.shift()||null; if(next){ q.current={...next,requester:'Simulación',source:'simulation'}; q.paused=false; q.pausedElapsed=0; q.startedAt=Date.now(); } else { q.current=prev; q.paused=true; q.pausedElapsed=Math.max(0,Number(prev.duration||0)); q.startedAt=0; } q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId); } const repeat=q.repeating || q.repeatOnce; const prev=q.current; rememberHistory(q,prev); q.previous=prev; if(repeat){ q.items.unshift({...prev,id:makeTrackId()}); q.repeatOnce=false; } q.current=q.items.shift()||null; q.paused=false; q.pausedElapsed=0; q.startedAt=q.current?Date.now():0; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId); }
export function togglePause(ownerId,paused){ const q=qFor(ownerId); const next=paused===undefined?!q.paused:Boolean(paused); if(next && q.current && !q.paused){ q.pausedElapsed=Math.max(0,(Date.now()-Number(q.startedAt||Date.now()))/1000); } if(!next && q.current && q.paused){ q.startedAt=Date.now()-Number(q.pausedElapsed||0)*1000; } q.paused=next; q.controlLockUntil=Date.now()+1400; q.version++; return snapshot(ownerId); }
export function stop(ownerId){ const q=qFor(ownerId); if(q.current) rememberHistory(q,q.current); q.current=null; q.previous=null; q.paused=false; q.repeating=false; q.repeatOnce=false; q.startedAt=0; q.pausedElapsed=0; q.controlLockUntil=Date.now()+700; q.version++; return snapshot(ownerId); }
export function previous(ownerId,io){ const q=qFor(ownerId); if(q.simulationActive && q.simulationPrevious){ const current=q.current; const back=q.simulationPrevious; if(current) rememberHistory(q,current); q.simulationQueue.unshift(current); q.current={...back,requester:'Simulación',source:'simulation'}; q.simulationPrevious=null; q.paused=false; q.pausedElapsed=0; q.startedAt=Date.now(); q.controlLockUntil=Date.now()+900; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId); } if(!q.previous) return snapshot(ownerId); const current=q.current; const back=q.previous; if(current){ rememberHistory(q,current); q.items.unshift(current); if(q.items.length>10) q.items.length=10; } q.current=back; q.previous=null; q.paused=false; q.pausedElapsed=0; q.startedAt=Date.now(); q.controlLockUntil=Date.now()+900; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId); }
export function skip(ownerId,io){ const q=qFor(ownerId); if(q.simulationActive && String(q.current?.source||'')==='simulation'){ const prev=q.current; rememberHistory(q,prev); q.simulationPrevious=prev; const next=q.simulationQueue.shift()||null; if(next){q.current={...next,requester:'Simulación',source:'simulation'};q.paused=false;q.pausedElapsed=0;q.startedAt=Date.now();}else{q.current=null;q.paused=false;q.pausedElapsed=0;q.startedAt=0;}q.version++;emit(ownerId,io,'musicState',snapshot(ownerId));return snapshot(ownerId);} if(q.current){ /* Player is owned by browser/OBS YouTube iframe. */ q.previous=q.current; rememberHistory(q,q.current); } q.current=q.items.shift()||null; if(!q.current) q.previous=null; q.paused=false; q.pausedElapsed=0; q.startedAt=q.current?Date.now():0; q.controlLockUntil=Date.now()+900; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); return snapshot(ownerId); }
export function toggleRepeat(ownerId){ const q=qFor(ownerId); q.repeating=!q.repeating; q.version++; return snapshot(ownerId); }
export function setVolume(ownerId,value,io){ const q=qFor(ownerId); const next=clamp(value,0,100,100); if(q.volume!==next){ q.volume=next; q.version++; emit(ownerId,io,'musicVolume',{volume:next}); emit(ownerId,io,'musicState',snapshot(ownerId)); } return snapshot(ownerId); }

export function attachSocketHandlers(io,socket){
  const ownerId=String(socket.user?.id||'').trim(); if(!ownerId)return;
  socket.emit('musicSettings',getMusicConfig(ownerId));
  socket.emit('musicState',snapshot(ownerId));
  if (previewSettings.has(String(ownerId))) socket.emit('musicPreviewSettings',previewSettings.get(String(ownerId)));
  if (!socket.isOverlay && previewStates.has(String(ownerId))) socket.emit('musicEditorPreviewState',previewStates.get(String(ownerId)));
  if (socket.isOverlay) {
    socket.on('music:ended',(payload={})=>{
      const trackId=String(payload?.trackId||'').trim();
      if(trackId) finish(ownerId,io,trackId);
    });
    socket.on('music:telemetry',(payload={})=>{
      const q=qFor(ownerId), trackId=String(payload?.trackId||'').trim();
      if(!q.current || !trackId || String(q.current.id)!==trackId) return;
      // Ignore telemetry briefly after a control action so the old player state
      // cannot immediately undo a pause/resume command while YouTube settles.
      if(Date.now() < Number(q.controlLockUntil||0)) return;
      const elapsed=Math.max(0,Number(payload?.elapsed||0));
      const playing=Boolean(payload?.playing); const paused=Boolean(payload?.paused);
      q.paused=paused || !playing; q.pausedElapsed=elapsed; q.startedAt=q.paused?0:(Date.now()-elapsed*1000);
      q.version++; emit(ownerId,io,'musicState',snapshot(ownerId));
    });
    return;
  }
  socket.on('music:getState',()=>socket.emit('musicState',snapshot(ownerId)));
  socket.on('music:playTrack',(trackId,ack)=>{try{const st=playTrack(ownerId,trackId,io);if(typeof ack==='function')ack({ok:true,state:st});}catch(error){if(typeof ack==='function')ack({ok:false,error:error?.message||'No se pudo seleccionar la canción.'});}});
  socket.on('music:clearHistory',(ack)=>{try{const st=clearHistory(ownerId,io);if(typeof ack==='function')ack({ok:true,state:st});}catch(error){if(typeof ack==='function')ack({ok:false,error:error?.message||'No se pudo limpiar la playlist.'});}});
  socket.on('music:previewSettings',(cfg={})=>{ const safe=normalizeMusicConfig(cfg); previewSettings.set(String(ownerId),safe); io?.to?.(`user:${ownerId}`).emit('musicPreviewSettings',safe); });
  socket.on('music:appearanceSync',(cfg={})=>{ const safe=normalizeMusicConfig(cfg); previewSettings.set(String(ownerId),safe); io?.to?.(`user:${ownerId}`).emit('musicAppearanceSync',safe); io?.to?.(`user:${ownerId}`).emit('musicPreviewSettings',safe); });
  socket.on('music:previewControl',(payload={})=>{ io?.to?.(`user:${ownerId}`).emit('musicPreviewControl',{action:String(payload?.action||'').toLowerCase(),elapsed:Math.max(0,Number(payload?.elapsed||0))}); });
  socket.on('music:previewState',(payload={})=>{
    const current=payload?.current||null;
    const safe={current:current?publicTrack({...current,requester:current.requester||'Simulación',source:'simulation'}):null,queue:Array.isArray(payload?.queue)?payload.queue.slice(0,10).map(v=>publicTrack({...v,requester:v?.requester||'Simulación',source:'simulation'})).filter(Boolean):[],previous:payload?.previous?publicTrack({...payload.previous,requester:payload.previous.requester||'Simulación',source:'simulation'}):null,elapsed:Math.max(0,Number(payload?.elapsed||0)),playing:Boolean(payload?.playing),paused:Boolean(payload?.paused),simulated:true,version:Date.now()};
    previewStates.set(String(ownerId),safe);
    const q=qFor(ownerId);
    if(current){
      if(!q.simulationActive || q.simulationOverlayEnabled) bridgeSimulation(ownerId,current,io,safe.queue,safe.previous,{elapsed:safe.elapsed,playing:safe.playing,paused:safe.paused});
      else { q.simulationQueue=safe.queue; q.simulationPrevious=safe.previous; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId)); }
    }else{
      q.simulationQueue=safe.queue; q.simulationPrevious=safe.previous; q.version++; emit(ownerId,io,'musicState',snapshot(ownerId));
    }
    io?.to?.(`user:${ownerId}`).emit('musicEditorPreviewState',safe);
  });
  socket.on('music:simulate',(payload={})=>{
    const t={id:'preview-simulated',title:clean(payload.title||'Blinding Lights',120),artist:clean(payload.artist||'The Weeknd',100),thumbnail:clean(payload.thumbnail||'',2000),duration:Math.max(1,Number(payload.duration||214)),requester:'Simulación',platform:'youtube',url:clean(payload.url||'',2000),sourceType:'youtube-iframe',sourceId:clean(payload.sourceId||'',32),source:'simulation'};
    const preview={current:t,queue:Array.isArray(payload.queue)?payload.queue.slice(0,10).map(v=>publicTrack({...v,requester:'Simulación',source:'simulation'})).filter(Boolean):[],previous:payload.previous?publicTrack({...payload.previous,requester:'Simulación',source:'simulation'}):null,elapsed:Math.max(0,Number(payload.elapsed||0)),playing:payload.playing!==false,paused:Boolean(payload.paused),version:Date.now(),simulated:true};
    previewStates.set(String(ownerId),preview);
    bridgeSimulation(ownerId,t,io,preview.queue,preview.previous,{elapsed:preview.elapsed,playing:preview.playing,paused:preview.paused});
    io?.to?.(`user:${ownerId}`).emit('musicEditorPreviewState',preview);
  });
  socket.on('music:simulateStop',()=>{
    previewStates.delete(String(ownerId));
    const q=qFor(ownerId);
    if(q.simulationActive){
      const overlayOwned=Boolean(q.simulationOverlayEnabled);
      if(q.current?.source==='simulation') rememberHistory(q,q.current);
      const r=q.simulationResume;
      q.simulationActive=false; q.simulationOverlayEnabled=false; q.simulationQueue=[]; q.simulationPrevious=null; q.simulationResume=null;
      if(overlayOwned && r?.current){
        q.current=clone(r.current); q.previous=r.previous?clone(r.previous):null; q.paused=Boolean(r.paused); q.pausedElapsed=Math.max(0,Number(r.elapsed||0)); q.startedAt=q.paused?0:(Date.now()-q.pausedElapsed*1000);
      } else if(overlayOwned){
        q.current=q.items.shift()||null; q.previous=null; q.paused=false; q.pausedElapsed=0; q.startedAt=q.current?Date.now():0;
      }
      q.version++; emit(ownerId,io,'musicState',snapshot(ownerId));
    }
    io?.to?.(`user:${ownerId}`).emit('musicEditorPreviewState',{current:null,queue:[],elapsed:0,playing:false,paused:false,version:Date.now(),simulated:true});
  });

}
export async function resolveMusicPreview(query, maxDurationSeconds=300) {
  const track = await resolveTrack(query, 'Simulación');
  const limit = clamp(maxDurationSeconds, 15, 3600, 300);
  if (track.duration > limit) track.duration = limit;
  return publicTrack(track);
}

export { DEFAULT_MUSIC, REQUEST_COMMANDS, ADMIN_COMMANDS, PREFIXES, resolveTrack, formatDuration };
export function getMusicRuntimeStatus(){ return {mode:'youtube-iframe', ytmusicapi:true, pythonCommand:getPythonCommand(), ytDlp:false, poToken:false, cookies:false, youtubeApiKeyRequired:false}; }
