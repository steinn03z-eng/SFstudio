/* StreamFusion Announcement Widget */
(() => {
  const root=document.getElementById('announcementOverlay');
  if(!root) return;
  const params=new URLSearchParams(location.search);
  const owner=String(params.get('owner')||'').trim();
  const overlayKey=String(params.get('overlayKey')||'').trim();
  const announcementId=String(params.get('announcementId')||'').trim();
  const draftMode=params.get('draft')==='1';
  const socket=typeof io==='function' ? io({auth:{overlayKey,widget:'announcement',announcementId,draft:draftMode},transports:['websocket','polling'],reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:800,reconnectionDelayMax:5000}) : null;
  let announcement=null;
  let timer=0;
  let cycleToken=0;
  let activeSlideIndex=-1;
  let slideStartedAt=0;
  let waitingForNextCycle=false;
  let waitStartedAt=0;

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=(v,d,min=-Infinity,max=Infinity)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d;};
  const shadow=(obj,defaultColor,defaultBlur,defaultY)=>obj?.shadow===false?'none':`${num(obj?.shadowX,0,-100,100)}px ${num(obj?.shadowY,defaultY,-100,100)}px ${num(obj?.shadowBlur,defaultBlur,0,200)}px ${obj?.shadowColor||defaultColor}`;
  const cqw=(px,d=0)=>`${num(px,d,0,1000)/12.8}cqw`;

  function currentConfig(settings){
    if(draftMode){
      const draft=settings?.announcementDraft;
      if(draft && String(draft.id||'')===announcementId) return draft;
    }
    const list=Array.isArray(settings?.announcements)?settings.announcements:[];
    const found=list.find(a=>String(a?.id||'')===announcementId);
    return found||null;
  }

  function renderSlide(slide){
    if(!slide)return;
    const texts=Array.isArray(slide.texts)?slide.texts:(slide.text?[slide.text]:[]); const im=slide.image||{};
    const stage=document.createElement('div');
    stage.className='sf-announcement-stage is-visible is-transitioning';
    const card=document.createElement('div'); card.className='sf-announcement-card';
    card.style.background='transparent'; card.style.border='0'; card.style.borderRadius='0'; card.style.padding='0'; card.style.boxShadow='none';
    const safe=document.createElement('div');safe.className='sf-announcement-safe-zone';card.appendChild(safe);
    texts.slice(0,3).forEach(t=>{
      if(t?.enabled===false)return;
      const text=document.createElement('div'); text.className='sf-announcement-text'; text.textContent=String(t?.value||'');
      text.style.zIndex=String(num(t?.zIndex,20,-10000,10000)); text.style.left=`${num(t?.x,50,0,100)}%`;text.style.top=`${num(t?.y,50,0,100)}%`; const textScale=num(t?.scale,1,.25,5); text.style.width='max-content'; text.style.maxWidth='none'; text.style.height='auto'; text.style.minHeight='0'; text.style.transform=`translate(-50%,-50%) scale(${textScale})`; text.style.transformOrigin='center center';
      text.style.fontFamily=String(t?.fontFamily||'Inter'); text.style.fontSize=cqw(num(t?.fontSize,52,10,300)); text.style.fontWeight=String(num(t?.fontWeight,800,100,1000)); text.style.fontStyle=['normal','italic'].includes(t?.fontStyle)?t.fontStyle:'normal'; text.style.color=String(t?.color||'#fff'); text.style.textAlign=['left','center','right'].includes(t?.align)?t.align:'center';
      text.style.textShadow=shadow(t,'rgba(0,0,0,.55)',16,4); text.style.webkitTextStroke=`${cqw(num(t?.outlineWidth,0,0,30))} ${t?.outlineColor||'#000'}`; text.style.letterSpacing=cqw(num(t?.letterSpacing,0,-20,60));text.style.lineHeight=String(num(t?.lineHeight,1.05,.4,3));text.style.textTransform=['none','uppercase','lowercase','capitalize'].includes(t?.transform)?t.transform:'none';
      card.appendChild(text);
    });
    if(im.enabled===true && String(im.url||'').trim()){
      const wrap=document.createElement('div');wrap.className='sf-announcement-image';wrap.style.left=`${num(im.x,70,0,100)}%`;wrap.style.top=`${num(im.y,50,0,100)}%`;wrap.style.width=`${num(im.width,28,1,100)}%`;wrap.style.height='auto';wrap.style.transform='translate(-50%,-50%)';wrap.style.zIndex=String(num(im?.zIndex,10,-10000,10000));wrap.style.opacity=String(num(im.opacity,1,0,1));wrap.style.background='transparent';wrap.style.border='0';wrap.style.boxShadow='none';
      const img=document.createElement('img');img.src=String(im.url).trim();img.alt='';img.style.width='100%';img.style.height='auto';img.style.maxWidth='none';img.style.display='block';img.style.background='transparent';img.style.border='0';img.style.borderRadius=cqw(num(im.radius,18,0,100));img.style.objectFit='contain';img.style.objectPosition='center';img.style.filter=im?.shadow?`drop-shadow(${cqw(num(im.shadowX,0,-100,100))} ${cqw(num(im.shadowY,8,-100,100))} ${cqw(num(im.shadowBlur,18,0,200))} ${im.shadowColor||'rgba(0,0,0,.42)'})`:'none';
      img.onerror=()=>{wrap.style.display='none';};wrap.appendChild(img);card.appendChild(wrap);
    }
    stage.appendChild(card);root.replaceChildren(stage);
  }

  function clear(){
    if(timer){clearTimeout(timer);timer=0;}
    cycleToken+=1;
    activeSlideIndex=-1;
    slideStartedAt=0;
    waitingForNextCycle=false;
    waitStartedAt=0;
    root.replaceChildren();
  }

  function scheduleCurrentSlide(cfg, index, token){
    const slide=cfg?.slides?.[index];
    if(!slide){ activeSlideIndex=-1; return; }
    activeSlideIndex=index;
    slideStartedAt=Date.now();
    const show=Math.max(.5,num(slide?.showSeconds,8,.5,86400)*1000);
    timer=setTimeout(()=>{
      if(token!==cycleToken)return;
      const nextIndex=index+1;
      if(nextIndex>=cfg.slides.length){
        root.replaceChildren();
        waitingForNextCycle=true;
        waitStartedAt=Date.now();
        activeSlideIndex=-1;
        const wait=Math.max(0,num(cfg.repeatEvery,180,0,86400)*1000);
        timer=setTimeout(()=>{ waitingForNextCycle=false; waitStartedAt=0; runAnnouncement(cfg); },wait);
      }else{
        renderSlide(cfg.slides[nextIndex]);
        scheduleCurrentSlide(cfg,nextIndex,token);
      }
    },show);
  }

  function runAnnouncement(cfg){
    clear(); if(!cfg||cfg.enabled===false||!Array.isArray(cfg.slides)||!cfg.slides.length)return;
    const token=cycleToken;
    if(cfg.showImmediately!==false){
      renderSlide(cfg.slides[0]);
      scheduleCurrentSlide(cfg,0,token);
    }else{
      waitingForNextCycle=true;
      waitStartedAt=Date.now();
      timer=setTimeout(()=>{waitingForNextCycle=false;waitStartedAt=0;renderSlide(cfg.slides[0]);scheduleCurrentSlide(cfg,0,token);},Math.max(0,num(cfg.repeatEvery,180,0,86400)*1000));
    }
  }

  function applyLiveConfig(nextCfg){
    const wasSame=announcement && String(announcement.id||'')===String(nextCfg?.id||'');
    announcement=nextCfg||null;
    if(!announcement){clear();return;}
    if(!wasSame || !Array.isArray(announcement.slides) || !announcement.slides.length){runAnnouncement(announcement);return;}
    if(announcement.enabled===false){clear();return;}
    if(waitingForNextCycle){
      const elapsed=Date.now()-waitStartedAt;
      const remaining=Math.max(0,num(announcement.repeatEvery,180,0,86400)*1000-elapsed);
      if(timer)clearTimeout(timer);
      const token=cycleToken;
      timer=setTimeout(()=>{waitingForNextCycle=false;waitStartedAt=0;renderSlide(announcement.slides[0]);scheduleCurrentSlide(announcement,0,token);},remaining);
      return;
    }
    const idx=Math.max(0,Math.min(activeSlideIndex,announcement.slides.length-1));
    if(activeSlideIndex<0){runAnnouncement(announcement);return;}
    const slide=announcement.slides[idx];
    renderSlide(slide);
    const elapsed=Date.now()-slideStartedAt;
    const remaining=Math.max(50,num(slide?.showSeconds,8,.5,86400)*1000-elapsed);
    if(timer)clearTimeout(timer);
    const token=cycleToken;
    timer=setTimeout(()=>{
      if(token!==cycleToken)return;
      const nextIndex=idx+1;
      if(nextIndex>=announcement.slides.length){
        root.replaceChildren();
        waitingForNextCycle=true;waitStartedAt=Date.now();activeSlideIndex=-1;
        timer=setTimeout(()=>{waitingForNextCycle=false;waitStartedAt=0;renderSlide(announcement.slides[0]);scheduleCurrentSlide(announcement,0,token);},Math.max(0,num(announcement.repeatEvery,180,0,86400)*1000));
      }else{renderSlide(announcement.slides[nextIndex]);scheduleCurrentSlide(announcement,nextIndex,token);}
    },remaining);
  }

  socket?.on('settings',settings=>{
    if(owner && socket?.userId && String(socket.userId)!==owner)return;
    const cfg=currentConfig(settings);
    if(JSON.stringify(cfg)!==JSON.stringify(announcement)) applyLiveConfig(cfg);
  });
  socket?.on('announcementsSettings',list=>{
    if(draftMode)return;
    const cfg=(Array.isArray(list)?list:[]).find(a=>String(a?.id||'')===announcementId)||null;
    if(JSON.stringify(cfg)!==JSON.stringify(announcement)) applyLiveConfig(cfg);
  });
  socket?.on('announcementDraftSettings',draft=>{
    if(!draftMode || !draft || String(draft.id||'')!==announcementId)return;
    if(JSON.stringify(draft)!==JSON.stringify(announcement)) applyLiveConfig(draft);
  });
  socket?.on('liveEnded',()=>{});
  window.addEventListener('beforeunload',clear);
})();
