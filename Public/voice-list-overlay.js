/* StreamFusion Voice List v9 */
(() => {
  const root = document.getElementById("voiceListOverlay");
  if (!root) return;
  const widgetParams = new URLSearchParams(location.search);
  const widgetOverlayKey = widgetParams.get("overlayKey") || "";
  const socket = typeof io === "function" ? io({ auth: { overlayKey: widgetOverlayKey, widget: "voicelist" }, transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity }) : null;

  const DEFAULT_ROULETTE = {
    enabled: false,
    title: "¿Quieres una voz?",
    subtitle: "Para participar, comenta lo que se indique en el sorteo!",
    winnerText: "Si ganas, solo comenta una de las siguientes voces:",
    imageUrl: "",
    imageAlt: "",
    titleImageUrl: "",
    titleImageAlt: "",
    titleImagePosition: "top",
    titleImageFit: "contain",
    titleImageWidth: 260,
    titleImageHeight: 260,
    titleImageOpacity: 1,
    subtitleImageUrl: "",
    subtitleImageAlt: "",
    subtitleImagePosition: "top",
    subtitleImageFit: "contain",
    subtitleImageWidth: 260,
    subtitleImageHeight: 260,
    subtitleImageOpacity: 1,
    winnerImageUrl: "",
    winnerImageAlt: "",
    winnerImagePosition: "top",
    winnerImageFit: "contain",
    winnerImageWidth: 260,
    winnerImageHeight: 260,
    winnerImageOpacity: 1,
    imagePosition: "top",
    imageFit: "contain",
    imageWidth: 260,
    imageHeight: 260,
    imageOpacity: 1,
    cardOpacity: 0.12,
    titleSeconds: 3,
    subtitleSeconds: 3,
    winnerSeconds: 3,
    introMotion: "fade",
    showListAfterIntro: true,
  };

  const DEFAULTS = {
    enabled: true,
    transparent: true,
    backgroundOpacity: 0,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    fontStyle: "normal",
    textColor: "#000000",
    textShadow: "none",
    shadowColor: "#000000",
    outlineWidth: 0,
    outlineColor: "#000000",
    textTransform: "none",
    letterSpacing: 0,
    lineHeight: 1.2,
    itemGap: 10,
    align: "left",
    listPosition: "left",
    horizontalPosition: "center",
    autoShowEnabled: false,
    autoShowEvery: 30,
    autoShowFor: 6,
    hideAfterShow: false,
    direction: "vertical",
    axis: "vertical",
    movementDirection: "forward",
    movementDirection: "forward",
    motion: "static",
    motionSpeed: 24,
    showIndex: false,
    showId: false,
    overrides: {},
    roulette: { ...DEFAULT_ROULETTE },
  };

  let catalog = [];
  let settings = { ...DEFAULTS };
  function normalizeAxisSettings(input) {
    const s = input || {};
    s.axis = s.axis === "horizontal" ? "horizontal" : (s.direction === "horizontal" ? "horizontal" : "vertical");
    s.direction = s.axis;
    s.movementDirection = s.movementDirection === "reverse" ? "reverse" : "forward";
    if (s.axis === "horizontal") {
      if (!["top","center","bottom"].includes(String(s.horizontalPosition || ""))) {
        const legacy = String(s.listPosition || "center");
        s.horizontalPosition = legacy === "left" ? "top" : legacy === "right" ? "bottom" : "center";
      }
      s.horizontalPosition = ["top","center","bottom"].includes(String(s.horizontalPosition || "")) ? s.horizontalPosition : "center";
    } else {
      s.listPosition = ["left","center","right"].includes(String(s.listPosition || "")) ? s.listPosition : "center";
    }
    s.motion = ["static","scroll","slide","marquee","crawl","starwars","slide-down","slide-up","float"].includes(s.motion) ? s.motion : "static";
    if(!["top","center","bottom"].includes(String(s.horizontalPosition||""))){ const legacy=String(s.listPosition||"center"); s.horizontalPosition=legacy==="left"?"top":legacy==="right"?"bottom":"center"; }
    return s;
  }

  let sceneStartAt = Date.now();
  let visibilityPhase = "visible";
  let visibilityPhaseStartedAt = Date.now();
  let appliedStyleSignature = "";
  let ticker = null;
  let renderRevision = 0;
  let lastRenderKey = "";
  let lastSceneMode = "";

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));
  const shadow = (v, color = "#000000") => {
    const c = String(color || "#000000");
    if (v === "soft") return `0 2px 8px ${c}`;
    if (v === "strong") return `0 4px 16px ${c}`;
    return "none";
  };
  const outline = (width = 0, color = "#000000") => `${Math.max(0, Number(width || 0))}px ${String(color || "#000000")}`;
  const normRoulette = (r = {}) => ({ ...DEFAULT_ROULETTE, ...(r || {}) });

  function renderItem(v, i, s) {
    const style = `font-family:${esc(s.fontFamily)};font-size:${Number(s.fontSize)}px;font-weight:${Number(s.fontWeight)};font-style:${esc(s.fontStyle)};color:${esc(s.textColor)};text-shadow:${shadow(s.textShadow, s.shadowColor)};-webkit-text-stroke:${outline(s.outlineWidth ?? 0, s.outlineColor)};paint-order:stroke fill;text-transform:${esc(s.textTransform)};letter-spacing:${Number(s.letterSpacing || 0)}px;line-height:${Number(s.lineHeight || 1.2)};`;
    return `<div class="voiceListItem" style="${style}"><span class="voiceListIndex">${s.showIndex ? `${i + 1}. ` : ""}</span>${esc(v.label)}${s.showId ? `<small>${esc(v.id)}</small>` : ""}</div>`;
  }

  function renderList(s, list) {
    if (!list.length) return '<div class="voiceListEmpty">No se encontraron voces.</div>';
    const axis = s.axis || s.direction || "vertical";
    const ordered = s.movementDirection === "reverse" ? [...list].reverse() : list;
    const items = ordered.map((v, i) => renderItem(v, i, s)).join("");
    // En horizontal el contenido debe ser una sola línea continua.
    // Repetimos la línea únicamente cuando hay movimiento para permitir un loop fluido.
    const content = s.motion === "static" ? items : `${items}${items}`;
    return `<div class="voiceListStage"><div class="voiceListViewport"><div class="voiceListTrack">${content}</div></div></div>`;
  }

  function syncVisibilityClock(s, now = Date.now()) {
    const enabled = s.autoShowEnabled === true && s.hideAfterShow === true;
    if (!enabled) {
      visibilityPhase = "visible";
      visibilityPhaseStartedAt = now;
      return;
    }
    const visibleFor = clamp(Number(s.autoShowFor || 6), 1, 120);
    const hiddenFor = clamp(Number(s.autoShowEvery || 30), 5, 3600);
    const elapsed = (now - visibilityPhaseStartedAt) / 1000;
    if (visibilityPhase === "visible" && elapsed >= visibleFor) {
      visibilityPhase = "hidden";
      visibilityPhaseStartedAt = now;
    } else if (visibilityPhase === "hidden" && elapsed >= hiddenFor) {
      visibilityPhase = "visible";
      visibilityPhaseStartedAt = now;
    }
  }

  function isListVisible(s, now = Date.now()) {
    syncVisibilityClock(s, now);
    return visibilityPhase !== "hidden";
  }

  function currentScene(s, now = Date.now()) {
    const r = normRoulette(s.roulette);
    if (!r.enabled) return { mode: "list", step: -1, text: "" };
    const elapsed = Math.max(0, (now - sceneStartAt) / 1000);
    const d1 = clamp(r.titleSeconds, 0.5, 30);
    const d2 = clamp(r.subtitleSeconds, 0.5, 30);
    const d3 = clamp(r.winnerSeconds, 0.5, 30);
    if (elapsed < d1) return { mode: "intro", step: 0, text: r.title };
    if (elapsed < d1 + d2) return { mode: "intro", step: 1, text: r.subtitle };
    if (elapsed < d1 + d2 + d3) return { mode: "intro", step: 2, text: r.winnerText };
    if (r.showListAfterIntro === false) return { mode: "intro", step: 2, text: r.winnerText };
    return { mode: "list", step: 3, text: "" };
  }

  function imageConfigForStep(r, step) {
    const idx = Math.max(0, Math.min(2, Number(step || 0)));
    const base = [
      { url: r.titleImageUrl || r.imageUrl, alt: r.titleImageAlt || r.imageAlt || "Imagen de ruleta", position: r.titleImagePosition || r.imagePosition || "top", fit: r.titleImageFit || r.imageFit || "contain", width: r.titleImageWidth ?? r.imageWidth ?? 260, height: r.titleImageHeight ?? r.imageHeight ?? 260, opacity: r.titleImageOpacity ?? r.imageOpacity ?? 1 },
      { url: r.subtitleImageUrl || r.imageUrl, alt: r.subtitleImageAlt || r.imageAlt || "Imagen de ruleta", position: r.subtitleImagePosition || r.imagePosition || "top", fit: r.subtitleImageFit || r.imageFit || "contain", width: r.subtitleImageWidth ?? r.imageWidth ?? 260, height: r.subtitleImageHeight ?? r.imageHeight ?? 260, opacity: r.subtitleImageOpacity ?? r.imageOpacity ?? 1 },
      { url: r.winnerImageUrl || r.imageUrl, alt: r.winnerImageAlt || r.imageAlt || "Imagen de ruleta", position: r.winnerImagePosition || r.imagePosition || "top", fit: r.winnerImageFit || r.imageFit || "contain", width: r.winnerImageWidth ?? r.imageWidth ?? 260, height: r.winnerImageHeight ?? r.imageHeight ?? 260, opacity: r.winnerImageOpacity ?? r.imageOpacity ?? 1 },
    ];
    return base[idx] || base[0];
  }

  function renderRoulette(s, list, scene) {
    const r = normRoulette(s.roulette);
    const motionClass = `motion-${r.introMotion || "fade"}`;
    const imageCfg = imageConfigForStep(r, scene.step);
    const imagePos = `image-${imageCfg.position || "top"}`;
    const image = imageCfg?.url ? `<div class="voiceListRouletteImageWrap"><img src="${esc(imageCfg.url)}" alt="${esc(imageCfg.alt)}" style="width:${clamp(imageCfg.width, 80, 1200)}px;height:${clamp(imageCfg.height, 80, 1200)}px;object-fit:${esc(imageCfg.fit || "contain")};opacity:${clamp(imageCfg.opacity ?? 1, 0, 1)}" /></div>` : "";
    const intro = `<div class="voiceListRouletteShell ${motionClass} ${imagePos}"><div class="voiceListRouletteCard" style="--vl-roulette-card-bg:rgba(255,255,255,${clamp(r.cardOpacity ?? 0.12, 0, 1)});">${image}<div class="voiceListRouletteCopy"><div class="voiceListRouletteText">${esc(scene.text || r.title)}</div></div></div></div>`;
    const listBlock = `<div class="voiceListRouletteListWrap">${renderList(s, list)}</div>`;
    return scene.mode === "intro" ? intro : (isListVisible(s) ? listBlock : "");
  }

  function listStructureKey(s,list){ return JSON.stringify({axis:s.axis||s.direction||'vertical',motion:s.motion||'static',moveDir:s.movementDirection||'forward',showIndex:s.showIndex===true,showId:s.showId===true,items:list.map(v=>String(v.key||v.id||v.fishId||v.label||''))}); }
  function applyListStyles(rootEl,s,list,hidden){
    const axis=s.axis||s.direction||'vertical', moveDir=s.movementDirection||'forward', motion=s.motion||'static';
    rootEl.className=`voiceListShell direction-${axis} travel-${moveDir} motion-${motion} align-${s.align||'left'} list-position-${s.listPosition||'left'} horizontal-position-${s.horizontalPosition||'center'}${hidden?' is-hidden':''}`;
    rootEl.style.setProperty('--vl-font',s.fontFamily); rootEl.style.setProperty('--vl-size',`${Number(s.fontSize)}px`); rootEl.style.setProperty('--vl-weight',s.fontWeight); rootEl.style.setProperty('--vl-style',s.fontStyle); rootEl.style.setProperty('--vl-color',s.textColor);
    rootEl.style.setProperty('--vl-shadow',shadow(s.textShadow,s.shadowColor)); rootEl.style.setProperty('--vl-outline-width',`${Math.max(0,Number(s.outlineWidth??0))}px`); rootEl.style.setProperty('--vl-outline-color',s.outlineColor||'#000000'); rootEl.style.setProperty('--vl-transform',s.textTransform);
    rootEl.style.setProperty('--vl-spacing',`${s.letterSpacing}px`); rootEl.style.setProperty('--vl-line',s.lineHeight); rootEl.style.setProperty('--vl-gap',`${s.itemGap}px`); rootEl.style.setProperty('--vl-bg',s.transparent?`rgba(255,255,255,${s.backgroundOpacity})`:`rgba(255,255,255,${Math.max(.05,s.backgroundOpacity)})`); rootEl.style.setProperty('--vl-speed',`${s.motionSpeed||24}s`); rootEl.style.setProperty('--vl-align',axis==='horizontal'?'center':(s.listPosition||s.align||'left'));
    const ordered=s.movementDirection==='reverse'?[...list].reverse():list; const items=rootEl.querySelectorAll('.voiceListItem');
    items.forEach((item,i)=>{ const v=ordered[i%Math.max(1,ordered.length)]; if(!v)return; item.style.cssText=`font-family:${esc(s.fontFamily)};font-size:${Number(s.fontSize)}px;font-weight:${Number(s.fontWeight)};font-style:${esc(s.fontStyle)};color:${esc(s.textColor)};text-shadow:${shadow(s.textShadow,s.shadowColor)};-webkit-text-stroke:${outline(s.outlineWidth??0,s.outlineColor)};paint-order:stroke fill;text-transform:${esc(s.textTransform)};letter-spacing:${Number(s.letterSpacing||0)}px;line-height:${Number(s.lineHeight||1.2)};`; const index=item.querySelector('.voiceListIndex'); if(index)index.textContent=s.showIndex?`${(i%ordered.length)+1}. `:''; const small=item.querySelector('small'); if(small)small.textContent=s.showId?String(v.id||v.fishId||''):''; });
    rootEl.dataset.structure=listStructureKey(s,list);
  }
  function preserveAnimation(track,mutate,newDurationSeconds){
    if(!track){ mutate?.(); return; }
    const animation=track.getAnimations?.().find(a=>a&&a.animationName);
    const duration=Number(animation?.effect?.getComputedTiming?.().duration);
    const current=Number(animation?.currentTime);
    const progress=Number.isFinite(current)&&Number.isFinite(duration)&&duration>0?((((current%duration)+duration)%duration)/duration):0;
    mutate?.();
    requestAnimationFrame(()=>{ track.style.animationDelay = (progress > 0 && newDurationSeconds) ? `${-(progress*Number(newDurationSeconds))}s` : ""; });
  }

  function styleSignatureFor(s,list) {
    return JSON.stringify({
      axis:s.axis||s.direction,motion:s.motion,movementDirection:s.movementDirection,
      fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,fontStyle:s.fontStyle,
      textColor:s.textColor,textShadow:s.textShadow,shadowColor:s.shadowColor,
      outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,textTransform:s.textTransform,
      letterSpacing:s.letterSpacing,lineHeight:s.lineHeight,itemGap:s.itemGap,align:s.align,
      listPosition:s.listPosition,horizontalPosition:s.horizontalPosition,motionSpeed:s.motionSpeed,showIndex:s.showIndex,showId:s.showId,
      overrides:s.overrides,list:list.map(v=>v.key)
    });
  }

  function render() {
    if (settings.enabled === false) { root.innerHTML = ""; root.className = ""; return; }
    const s=settings, list=Array.isArray(catalog)?catalog:[];
    if(s.roulette?.enabled){
      const scene=currentScene(s);
      const html=renderRoulette(s,list,scene);
      const wantedKey=`roulette:${scene.mode}:${scene.step}:${JSON.stringify(s.roulette)}`;
      if(wantedKey!==lastRenderKey) root.innerHTML=html;
      lastRenderKey=wantedKey;
      return;
    }
    if(!list.length){ if(!root.querySelector('.voiceListEmpty')) root.innerHTML='<div class="voiceListEmpty">No se encontraron voces.</div>'; return; }
    const structure=listStructureKey(s,list);
    let shell=root.querySelector('.voiceListShell');
    if(!shell || root.dataset.structure!==structure){
      root.innerHTML=renderList(s,list);
      shell=root.querySelector('.voiceListShell');
      root.dataset.structure=structure;
      appliedStyleSignature='';
    }
    if(!shell) return;
    const signature=styleSignatureFor(s,list);
    const hidden=isListVisible(s);
    if(appliedStyleSignature!==signature){
      preserveAnimation(shell.querySelector('.voiceListTrack'),()=>applyListStyles(shell,s,list,hidden),Math.max(4,Number(s.motionSpeed||24)));
      appliedStyleSignature=signature;
    }else{
      shell.classList.toggle('is-hidden',hidden);
    }
  }

  let visibilityTicker=null;
  function startVisibilityTicker(){
    if(visibilityTicker) return;
    visibilityTicker=setInterval(()=>{
      if(!settings || settings.enabled===false || settings.roulette?.enabled) return;
      const shell=root.querySelector('.voiceListShell');
      if(!shell) return;
      const hidden=!isListVisible(settings);
      shell.classList.toggle('is-hidden',hidden);
    },100);
  }

  const owner = new URLSearchParams(location.search).get("owner") || "";
  let catalogRequest = 0;
  async function refreshUserVoiceCatalog() {
    const request = ++catalogRequest;
    try {
      const response = await fetch(`/api/voices/catalog?owner=${encodeURIComponent(owner)}&overlayKey=${encodeURIComponent(widgetOverlayKey)}&_v=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (request !== catalogRequest) return;
      catalog = Array.isArray(data?.voices) ? data.voices : [];
      appliedStyleSignature = "";
      renderRevision += 1;
      render();
    } catch (error) {
      console.warn("[voice-list-overlay] No se pudo actualizar la biblioteca:", error);
    }
  }
  Promise.all([
    fetch(`/api/voices/catalog?owner=${encodeURIComponent(owner)}&overlayKey=${encodeURIComponent(widgetOverlayKey)}&_v=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`/api/voice-list/settings?owner=${encodeURIComponent(owner)}&overlayKey=${encodeURIComponent(widgetOverlayKey)}&_v=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
  ]).then(([cat, s]) => {
    catalog = Array.isArray(cat?.voices) ? cat.voices : [];
    settings = normalizeAxisSettings({ ...DEFAULTS, ...(s.voiceList || s || {}), roulette: { ...DEFAULT_ROULETTE, ...((s.voiceList || s || {}).roulette || {}) } });
    visibilityPhase = "visible";
    visibilityPhaseStartedAt = Date.now();
    appliedStyleSignature = "";
    renderRevision += 1;
    lastRenderKey = "";
    render();
    startVisibilityTicker();
  }).catch(() => {});

  socket?.on("voiceListSettings", (s) => {
    const incoming = s || {};
    const prevVisibility = settings && `${settings.autoShowEnabled}|${settings.hideAfterShow}`;
    settings = normalizeAxisSettings({ ...DEFAULTS, ...incoming, roulette: { ...DEFAULT_ROULETTE, ...(incoming.roulette || {}) } });
    const nextVisibility = `${settings.autoShowEnabled}|${settings.hideAfterShow}`;
    if (prevVisibility !== nextVisibility) {
      visibilityPhase = "visible";
      visibilityPhaseStartedAt = Date.now();
    }
    appliedStyleSignature = "";
    renderRevision += 1;
    lastRenderKey = "";
    render();
  });

  socket?.on("voiceLibrary", () => {
    refreshUserVoiceCatalog();
  });

  socket?.on("connect", () => {
    socket.emit?.("voiceList:getState");
    refreshUserVoiceCatalog();
  });
})();
