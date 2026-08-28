/* StreamFusion Points Widget */
(() => {
  const root=document.getElementById('pointsOverlay');
  if(!root) return;
  const params=new URLSearchParams(location.search);
  const overlayKey=params.get('overlayKey')||'';
  const owner=params.get('owner')||'';
  const socket=typeof io==='function' ? io({auth:{overlayKey,widget:'points'},transports:['websocket','polling'],reconnection:true,reconnectionAttempts:Infinity}) : null;
  let config={enabled:true,commandPrefix:'!',commandWords:['point'],displaySeconds:5,cooldownMinutes:5,queueEnabled:true};
  let queue=[];
  let active=false;
  const localLastByUser=new Map();

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function mergedConfig(value){
    const incoming=value&&typeof value==='object'?value:{};
    config={...config,...incoming,commandWords:Array.isArray(incoming.commandWords)?incoming.commandWords:config.commandWords};
    config.displaySeconds=Math.max(1,Math.min(30,Number(config.displaySeconds)||5));
    config.cooldownMinutes=Math.max(0,Math.min(1440,Number(config.cooldownMinutes)||0));
  }
  function userKey(item){return `${String(item?.platform||'tiktok').toLowerCase()}:${String(item?.username||'').trim().toLowerCase()}`;}
  function renderItem(item){
    const username=String(item?.username||'').trim();
    const displayName=String(item?.displayName||username||'Usuario').trim();
    const avatar=String(item?.avatarUrl||'').trim();
    const initials=(displayName||username||'U').slice(0,2).toUpperCase();
    const platformKey=String(item?.platform||'tiktok').toLowerCase()==='twitch'?'twitch':'tiktok';
    const platform=platformKey==='twitch'?'Twitch':'TikTok';
    const accent=platformKey==='twitch'?'#9146ff':'#fe2c55';
    const accentSoft=platformKey==='twitch'?'rgba(145,70,255,.18)':'rgba(254,44,85,.18)';
    const command=String(item?.command||`${config.commandPrefix||'!'}${config.commandWords?.[0]||'point'}`);
    const points=Number(item?.points||0).toLocaleString('es-PE');
    const wrap=document.createElement('div');
    wrap.className='points-item';
    wrap.style.setProperty('--points-platform',accent);
    wrap.style.setProperty('--points-platform-soft',accentSoft);
    wrap.innerHTML=`<div class="points-card"><div class="points-avatar">${avatar?`<img src="${esc(avatar)}" alt="">`:`<span>${esc(initials)}</span>`}</div><div class="points-copy"><strong>${esc(displayName)}</strong><small>${esc(platform)} · @${esc(username||'usuario')}</small><div class="points-comment"><span>comentó</span> <b>${esc(command)}</b></div><span>Tienes <b>${points}pts</b></span></div><div class="points-amount"><strong>${points}</strong><small>PTS</small></div></div>`;
    return wrap;
  }
  async function showNext(){
    if(active||!queue.length) return;
    active=true;
    const item=queue.shift();
    if(!config.queueEnabled && root.firstElementChild) root.replaceChildren();
    const node=renderItem(item);
    root.appendChild(node);
    const seconds=Math.max(1,Number(item?.displaySeconds||config.displaySeconds||5));
    setTimeout(()=>{
      node.classList.add('is-leaving');
      setTimeout(()=>{node.remove();active=false;showNext();},300);
    },seconds*1000);
  }
  function acceptTrigger(item){
    if(!config.enabled || !item) return;
    if(owner && String(item.ownerId||'') !== String(owner)) return;
    const key=userKey(item);
    if(!key || !item.username) return;
    const cd=Math.max(0,Number(config.cooldownMinutes||item.cooldownMinutes||0))*60000;
    const now=Date.now();
    const last=Number(localLastByUser.get(key)||0);
    if(cd>0 && now-last<cd) return;
    localLastByUser.set(key,now);
    if(!config.queueEnabled){queue=[item];}
    else queue.push(item);
    showNext();
  }
  socket?.on('settings',(settings)=>{
    mergedConfig(settings?.points?.widget);
  });
  socket?.on('chat',(data)=>{
    if(!data?.pointsWidgetTrigger) return;
    acceptTrigger(data.pointsWidgetTrigger);
  });
  socket?.on('pointsWidgetTrigger',(data)=>{
    if(!data?.simulated) return;
    acceptTrigger(data);
  });
  socket?.on('liveEnded',()=>{});
})();
