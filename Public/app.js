(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const TOKEN_KEY = 'sf.token.v3';
  const SESSION_KEY = 'sf.session.v3';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const api = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type') && !(typeof FormData !== 'undefined' && options.body instanceof FormData) && !(typeof Blob !== 'undefined' && options.body instanceof Blob) && !(typeof ArrayBuffer !== 'undefined' && options.body instanceof ArrayBuffer)) headers.set('Content-Type', 'application/json');
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const res = await fetch(url, { ...options, headers });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const defaultSettings = {
    panels:{chat:true,events:true,gifts:true}, order:'events-gifts', filters:{chat:'all',event:'all',gift:'all',activity:'all'},
    voiceList:{enabled:true,transparent:true,backgroundOpacity:0,fontFamily:'Inter, Arial, sans-serif',fontSize:28,fontWeight:700,fontStyle:'normal',textColor:'#000000',textShadow:'none',shadowColor:'#000000',outlineWidth:0,outlineColor:'#000000',textTransform:'none',letterSpacing:0,lineHeight:1.2,itemGap:10,align:'left',listPosition:'left',horizontalPosition:'center',axis:'vertical',movementDirection:'forward',autoShowEnabled:false,autoShowEvery:30,autoShowFor:6,hideAfterShow:false,direction:'vertical',motion:'static',motionSpeed:24,showIndex:false,showId:false,selectedVoice:'',overrides:{},roulette:{enabled:false}},
    announcements:[],
    musicWidget:{enabled:true,commandPrefix:'!',requestCommand:'musica',pointCost:100,maxDurationSeconds:300,maxQueue:10,showNext:true,showProgress:true,showRequester:true,allowModeratorCommands:false,adminCommandPrefixes:{pause:'!',stop:'!',skip:'!',repeat:'!',volume:'!'},adminCommands:{pause:'pausa',stop:'detener',skip:'siguiente',repeat:'repetir',volume:'vol'},style:{scale:1,accent:'#8b5cf6',accent2:'#ec4899',progressMode:'gradient2',progressColor:'#8b5cf6',progressColor2:'#ec4899',progressColor3:'#22d3ee',textColor:'#ffffff',secondaryTextColor:'#b9b9c8',titleFont:'Inter',artistFont:'Inter',titleSize:28,artistSize:15,vinylSize:170,design:'vinyl-glow',showVinyl:true}},
    tiktokModerators:[], twitchModerators:[],
    personalization:{theme:'dark',font:'inter',animation:'slide',chatLayout:'vertical',chatDirection:'down',chatTheme:'cloud',chatAdjustMessages:false,avatarFrame:'platform',bubbleFrame:'platform',avatarSize:'md',nameSize:'md',nameWeight:'800',showPlatformPill:true,showTimestamps:true,showActivity:true,bubbleRadius:12,avatarBorderWidth:2,messagePadding:7,rowGap:5,tiktokNameColor:'white',twitchNameColor:'real',chatOverlayCardSide:'center',badgeStyle:'emoji',tiktokNameColor:'white',twitchNameColor:'real',messageEffect:'shadow',nameEffect:'shadow',textColor:'auto',showBadges:true,showEmotes:true,highlightSupporters:true,supporterHighlightStyle:'gold',eventStyle:'chat',eventSimulationMode:'single',giftStyle:'chat',giftSimulationMode:'single',highlightEventUsername:true,highlightLikes:true,highlightFollows:true,highlightJoins:true,highlightShares:true,highlightSystem:true,highlightFanclub:true,highlightSuperfan:true,highlightGifts:true,highlightSubs:true,highlightBits:true,highlightRaids:true,autoClearChat:false,clearChatSeconds:30,eventsLayout:'vertical',eventsDirection:'down',eventsMode:'slide',eventsPanelSize:'normal',eventsOverlayShape:'normal',eventsOverlayCardSide:'center',eventsCardFrame:true,giftsLayout:'vertical',giftsDirection:'down',giftsMode:'slide',giftsPanelSize:'normal',giftsOverlayShape:'normal',giftsOverlayCardSide:'center',giftsCardFrame:true,giftHighlightStyle:'gold',overlayEventHighlightStyle:'platform',overlayGiftImageSize:'md',overlayGiftComposition:'normal',overlayNameColorMode:'platform',overlayNameColor:'#ffffff',overlayEventFont:'inherit',overlayGiftFont:'inherit',overlayGiftDisplayMode:'full',overlayGiftCompositionMode:'vertical-centered',eventVisibility:{likes:true,follows:true,joins:true,shares:true,system:true,gifts:true,subscriptions:true,bits:true,raids:true,hosts:true,superfan:true}},
    appearance:{theme:'dark',panelColor:'#131625',accent:'#7c5cff',sidebarColor:'#101321',pageBackground:'#0b0d18',backgroundImage:'',style:'base'},
    profilePhoto:{source:'none',url:'',reference:'',label:'',updatedAt:0},
    connectionProfiles:{tiktok:{username:'',avatarUrl:''},twitch:{username:'',avatarUrl:''}},
    profanityFilter:{enabled:true,customWords:[]}
  };

  const merge = (base, incoming) => {
    if (Array.isArray(base) || Array.isArray(incoming)) return incoming ?? base;
    if (!base || typeof base !== 'object') return incoming ?? base;
    if (!incoming || typeof incoming !== 'object') return base;
    const out = { ...base };
    for (const key of Object.keys(incoming)) out[key] = key in base ? merge(base[key], incoming[key]) : incoming[key];
    return out;
  };

  function customizationStorageKey() {
    return `sf.customization.preferences.v3.${user?.id || 'guest'}`;
  }
  function saveCustomizationSnapshot() {
    try {
      localStorage.setItem(customizationStorageKey(), JSON.stringify({
        updatedAt: Date.now(),
        personalization: structuredClone(settings.personalization || {})
      }));
    } catch {}
  }
  function loadCustomizationSnapshot() {
    try {
      const raw = localStorage.getItem(customizationStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  }
  function rehydrateCustomizationFromStorage() {
    let snapshot = loadCustomizationSnapshot();
    if (!snapshot) {
      try {
        const legacy = JSON.parse(localStorage.getItem(`sf.customization.preferences.v2.${user?.id || 'guest'}`) || 'null');
        if (legacy && typeof legacy === 'object') snapshot = legacy;
      } catch {}
    }
    if (!snapshot?.personalization || typeof snapshot.personalization !== 'object') return;
    settings.personalization = merge(settings.personalization || {}, snapshot.personalization);
  }

  let user = null;
  let settings = structuredClone(defaultSettings);
  let socket = null;
  let page = 'dashboard';
  let authMode = 'login';
  let activeCustomizeTab = 'chat';
  let voiceCatalogRequest = 0;
  let popupWindows = new Set();
  let dashboardClearTimer = null;
  let voiceWidgetSaveTimer = 0;
  let voiceWidgetPreviewTimer = 0;
  let voiceWidgetPreviewStartAt = 0;
  let voiceWidgetVisibilityPhase = "visible";
  let voiceWidgetVisibilityPhaseStartedAt = Date.now();
  let voiceWidgetPreviewSignature = '';
  let voiceWidgetDraft = null;
  let pointsWidgetDraft = null;
  let pointsWidgetPreviewSequence = 0;
  let pointsWidgetPreviewTimers = [];
  let announcementDraft = null;
  let announcementEditingId = '';
  let announcementActiveSlide = 0;
  let announcementActiveText = 0;
  let announcementPreviewTimer = 0;
  let announcementPreviewRunning = false;
  let announcementDraftLoaded = false;
  let announcementDraftApplied = false;
  let musicWidgetDraft = null;
  let musicWidgetSimulating = false;
  let musicWidgetSimTimer = 0;
  let musicPreviewState = {current:null,queue:[],elapsed:0,playing:false,paused:false};
  let musicSimulationTrack = null;
  let musicPreviewYTPlayer=null;
  let musicPreviewYTPromise=null;
  let musicPreviewYTVideoId='';
  let musicPreviewYTReady=false;
  let musicPreviewMuted = false;
  const POINTS_WIDGET_SIM_USERS = [
    {platform:'tiktok',username:'lunabyte',displayName:'LunaByte',initials:'LU',points:1250},
    {platform:'twitch',username:'maurolive',displayName:'MauroLive',initials:'MA',points:860},
    {platform:'tiktok',username:'pixelnova',displayName:'PixelNova',initials:'PN',points:4320},
  ];
  let roulettePreviewTab = 'appearance';
  let roulettePreviewConfig = null;
  let roulettePreviewState = { history: [], participants: [], activeWinner: null };
  let roulettePreviewReady = false;
  let roulettePreviewPending = [];
  const recentEventKeys = new Map();

  const state = {
    chat:[], events:[], gifts:[],
    accounts:{tiktok:{connectionId:'',connected:false}, twitch:{connectionId:'',connected:false}},
    voices:[], catalog:[],
    activity:{tiktok:{},twitch:{}},
    supporters:{tiktok:{},twitch:{}},
    permanentProfiles:{tiktok:{},twitch:{}},
    avatarCache:new Map(), avatarPending:new Map(),
    historyLoaded:false,
    connection:'offline',
    previewChat:[],
    previewPointsWidgets:[],
    previewEvents:[],
    previewGifts:[],
    previewEventSeeds:[],
    previewGiftSeeds:[],
    previewEventIndex:0,
    previewGiftIndex:0,
    voiceListPresence:{online:false,connections:0},
    tiktokGiftCatalog:[],
    tiktokGiftIndex:new Map(),
    tiktokGiftCatalogLoaded:false
  };

  const pageMeta = {
    dashboard:['TU ESTUDIO','Dashboard'], connections:['CANALES','Conexiones'], customize:['DISEÑO','Personalización'],
    overlays:['EN ESCENA','Overlays'], roulette:['DINÁMICA','Ruleta'], voices:['VOZ','Voces'], widgets:['WIDGETS','Widgets'], settings:['PREFERENCIAS','Ajustes'], library:['RECURSOS','Biblioteca']
  };

  function toast(title, message='', type='ok') {
    const stack = $('toastStack'); if (!stack) return;
    const n = document.createElement('div'); n.className = `toast ${type === 'err' ? 'error' : ''}`;
    n.innerHTML = `<strong>${esc(title)}</strong><span>${esc(message)}</span>`;
    stack.appendChild(n); setTimeout(() => n.remove(), 4200);
  }

  function applyAppearance() {
    const a = settings.appearance || {};
    const root = document.documentElement;
    const body = document.body;
    const activeStyle = String(a.style || 'base');
    const preset = APP_STYLE_PRESETS.find(x=>x.id===activeStyle);
    const panelColor = String(a.panelColor || '').trim();

    const accent = String(a.accent || '#7c5cff').trim();
    const sidebarBg = String(a.sidebarColor || '#101321').trim();
    const pageBg = String(a.pageBackground || '#0b0d18').trim();
    const surface = activeStyle === 'custom' && panelColor ? panelColor : (preset?.surface || '#131625');
    const surface2 = activeStyle === 'custom' && panelColor
      ? `color-mix(in srgb, ${panelColor} 82%, white 18%)`
      : (preset?.surface2 || '#191d2e');

    body.dataset.theme = activeStyle === 'custom' ? 'dark' : (a.theme || 'dark');
    body.dataset.appStyle = activeStyle;

    // Mantener las variables en :root Y en body evita que reglas de tema
    // o componentes anidados oculten los colores personalizados.
    for (const [target, values] of [[root,{ '--accent':accent, '--sidebar-bg':sidebarBg, '--page-bg':pageBg, '--surface':surface, '--surface2':surface2 }],[body,{ '--accent':accent, '--sidebar-bg':sidebarBg, '--page-bg':pageBg, '--surface':surface, '--surface2':surface2 }]]) {
      Object.entries(values).forEach(([name,value])=>target.style.setProperty(name,value));
    }

    const bg = String(a.backgroundImage || '').trim();
    root.style.setProperty('--page-bg-image', bg ? `url("${bg.replace(/"/g, '\\"')}")` : 'none');
    body.style.backgroundImage = bg ? `url("${bg.replace(/"/g, '\\"')}")` : '';
    body.style.backgroundColor = a.pageBackground || '';
  }

  const APP_STYLE_PRESETS = [
    {id:'base',name:'Base',desc:'StreamFusion clásico',theme:'dark',accent:'#7c5cff',sidebar:'#101321',bg:'#0b0d18',surface:'#131625',surface2:'#191d2e'},
    {id:'midnight',name:'Medianoche',desc:'Azul profundo elegante',theme:'midnight',accent:'#6d7cff',sidebar:'#100b24',bg:'#080817',surface:'#17142f',surface2:'#211d40'},
    {id:'vampire',name:'Vampire',desc:'Rojo oscuro intenso',theme:'dark',accent:'#e34867',sidebar:'#1b0c14',bg:'#0e080d',surface:'#1d1219',surface2:'#291720'},
    {id:'ocean',name:'Ocean',desc:'Azul marino fresco',theme:'dark',accent:'#28b8e8',sidebar:'#07141d',bg:'#061018',surface:'#0d1e28',surface2:'#122a37'},
    {id:'emerald',name:'Emerald',desc:'Verde moderno',theme:'dark',accent:'#2ed58a',sidebar:'#071711',bg:'#06100b',surface:'#0f1e16',surface2:'#153025'},
    {id:'cyber',name:'Cyberpunk',desc:'Neón violeta y cian',theme:'dark',accent:'#b05cff',sidebar:'#120a1c',bg:'#090711',surface:'#171027',surface2:'#21153a'},
    {id:'sunset',name:'Sunset',desc:'Cálido y energético',theme:'dark',accent:'#ff7a4d',sidebar:'#1d100d',bg:'#100907',surface:'#221612',surface2:'#302019'},
    {id:'sakura',name:'Sakura',desc:'Rosa suave nocturno',theme:'dark',accent:'#f178b6',sidebar:'#1b0f19',bg:'#100812',surface:'#211421',surface2:'#2c1b2b'},
    {id:'graphite',name:'Graphite',desc:'Minimalismo profesional',theme:'dark',accent:'#9ca8ba',sidebar:'#111315',bg:'#0a0c0f',surface:'#15181c',surface2:'#1d2126'},
    {id:'aurora',name:'Aurora',desc:'Turquesa y violeta',theme:'dark',accent:'#52e0d0',sidebar:'#081318',bg:'#061012',surface:'#102126',surface2:'#163039'}
  ];
  function applyStylePreset(id, persist=true) {
    const preset = APP_STYLE_PRESETS.find(x=>x.id===id) || APP_STYLE_PRESETS[0];
    settings.appearance = {...settings.appearance, style:preset.id, theme:preset.theme, accent:preset.accent, sidebarColor:preset.sidebar, pageBackground:preset.bg};
    applyAppearance();
    document.documentElement.style.setProperty('--surface', preset.surface);
    document.documentElement.style.setProperty('--surface2', preset.surface2);
    if (persist) persistSettingsPatch({appearance:{...settings.appearance}}, false);
    renderSettings();
  }

  function isConnected(platform) { return Boolean(state.accounts[platform]?.connected); }
  function hasConfiguredChannel() { return ['tiktok','twitch'].some(p => Boolean(String(state.accounts[p]?.username || '').trim())); }
  function channelConnectionSummary() {
    const accounts = ['tiktok','twitch'].map(p => state.accounts[p] || {});
    if (accounts.some(a => a.live === true)) return { key:'live', label:'En Directo!', dot:'live' };
    if (accounts.some(a => a.connected === true)) return { key:'waiting', label:'Conectado!', dot:'connected' };
    return { key: hasConfiguredChannel() ? 'offline' : 'none', label:'Desconectado, esperando conexión...', dot:'offline' };
  }

  function renderTop() {
    const fallbackName = user?.displayName || 'Creador';
    $('userName').textContent = fallbackName;
    $('userEmail').textContent = user?.email || 'Plan Studio';
    const profileAvatar = isUsableViewerAvatar(settings.profilePhoto?.url) ? settings.profilePhoto.url : '';
    const img = $('userInitial');
    if (img) {
      if (img.tagName === 'IMG') {
        img.src = profileAvatar || '';
        img.style.visibility = profileAvatar ? 'visible' : 'hidden';
      } else {
        img.innerHTML = profileAvatar ? `<img src="${esc(profileAvatar)}" alt="">` : esc(fallbackName.charAt(0).toUpperCase());
      }
    }
    $('topAccounts').innerHTML = ['tiktok','twitch'].map(platform => {
      const a = state.accounts[platform] || {};
      const saved = settings.connectionProfiles?.[platform] || {};
      const name = a.username || saved.username || 'Sin conectar';
      const avatar = connectedAccountAvatarUrl(platform, { ...saved, ...a, avatarUrl: a.avatarUrl || saved.avatarUrl });
      const statusClass = a.connected ? 'on' : 'off';
      return `<div class="top-account ${statusClass}">
        <span class="top-account-avatar">${avatar ? `<img src="${esc(avatar)}" alt="">` : `<span class="account-avatar-initial">${platform==='tiktok'?'TT':'TW'}</span>`}</span>
        <span class="dot"></span><b>${platform === 'twitch' ? 'Twitch' : 'TikTok'}</b><span>${esc(name)}</span>
      </div>`;
    }).join('');
  }

  function activateNav() {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
    $('pageKicker').textContent = pageMeta[page]?.[0] || 'STREAMFUSION';
    $('pageTitle').textContent = pageMeta[page]?.[1] || page;
  }

  function connectedAccountAvatarUrl(platform, account = {}) {
    const p = String(platform || '').toLowerCase();
    if (p === 'tiktok') {
      return isUsableViewerAvatar(account.avatarUrl) ? account.avatarUrl : '';
    }
    return isUsableViewerAvatar(account.avatarUrl) ? account.avatarUrl : '';
  }

  function previewAvatarUrl(item = {}) {
    const seed = normalizeUsername(item.uniqueId || item.username || item.displayName || 'preview-user') || 'preview-user';
    return `https://api.dicebear.com/10.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
  }

  function normalizeUsername(value) {
    return String(value || '').trim().replace(/^@+/, '').replace(/^#+/, '').split(/[/?#]/)[0];
  }

  function avatarIdentity(item = {}) {
    return normalizeUsername(item.uniqueId || item.username || item.user || item.displayName || 'user');
  }

  function avatarKey(platform, username) { return `${String(platform||'').toLowerCase()}:${normalizeUsername(username).toLowerCase()}`; }


  function isUsableViewerAvatar(value) {
    const src = String(value || '').trim();
    if (!src) return false;
    if (/coin-logo\.png/i.test(src)) return false;
    return /^https?:\/\//i.test(src) || /^\/profile-photo\//i.test(src);
  }

  async function resolveAvatar(platform, username) {
    const clean = normalizeUsername(username);
    if (!clean) return '';
    const key = avatarKey(platform, clean);
    if (state.avatarCache.has(key)) return state.avatarCache.get(key);
    if (state.avatarPending.has(key)) return state.avatarPending.get(key);
    const promise = api(`/api/avatar?platform=${encodeURIComponent(platform)}&username=${encodeURIComponent(clean)}`)
      .then(d => isUsableViewerAvatar(d.avatarUrl) ? d.avatarUrl : '')
      .catch(() => '')
      .then(url => { state.avatarCache.set(key, url); return url; })
      .finally(() => state.avatarPending.delete(key));
    state.avatarPending.set(key, promise);
    return promise;
  }

  function queueAvatarImages(root = document) {
    root.querySelectorAll('img[data-avatar-platform][data-avatar-user]').forEach(img => {
      const platform = img.dataset.avatarPlatform;
      const username = img.dataset.avatarUser;
      resolveAvatar(platform, username).then(url => {
        if (img.isConnected && url) img.src = url;
      });
    });
  }

  const roleBadgeMap = {
    verified:'✓', 'voice-power':'🔥', voicepower:'🔥', moderator:'🛡️', mod:'🛡️', vip:'💎', subscriber:'🎟️', subscriber_badge:'🎟️', sub:'🎟️',
    founder:'🏆', premium:'✨', staff:'⚙️', broadcaster:'📣', member:'👤', fanclub:'👻', superfan:'🌟', donor:'🎁', supporter:'🎁'
  };

  function badgeMarkup(raw) {
    if (settings.personalization.showBadges === false) return '';
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[ ,|]+/).filter(Boolean) : [];
    const activityKeys = new Set(['like','liked','❤️','follow','followed','follower','👤','join','joined','member-join','👻','share','shared','🗣','🗣️','donor','supporter','🎁','gift','gift-image']);
    const seen = new Set();
    return list.filter(Boolean).filter((b) => {
      const key = String(b).trim().toLowerCase();
      if (activityKeys.has(key)) return false;
      const rendered = String(roleBadgeMap[key] || '•');
      if (seen.has(rendered)) return false;
      seen.add(rendered);
      return true;
    }).slice(0,5).map(b => `<span class="badge-pill" title="${esc(b)}">${esc(roleBadgeMap[String(b).toLowerCase()] || '•')}</span>`).join('');
  }

  function rememberPermanentProfile(item) {
    const p = String(item?.platform || 'tiktok').toLowerCase() === 'twitch' ? 'twitch' : 'tiktok';
    const key = profileKey(item);
    if (!key || key === 'user') return;
    const existing = state.permanentProfiles[p][key] || { followedBefore:false, everDonated:false, displayName:'', username:key };
    const viewer = item?.viewer || {};
    const followed = Boolean(item?.persistentFollowed || item?.followedBefore || viewer?.followedBefore);
    const donor = Boolean(item?.persistentDonor || item?.everDonated || viewer?.everDonated || viewer?.donorBadge);
    if (followed) existing.followedBefore = true;
    if (donor) existing.everDonated = true;
    existing.displayName = item?.displayName || item?.username || item?.user || item?.displayName || existing.displayName || key;
    existing.username = item?.uniqueId || item?.username || item?.user || existing.username || key;
    if (followed || donor || existing.displayName) state.permanentProfiles[p][key] = existing;
  }
  function permanentProfile(item) {
    const p = String(item?.platform || 'tiktok').toLowerCase() === 'twitch' ? 'twitch' : 'tiktok';
    return state.permanentProfiles[p]?.[profileKey(item)] || null;
  }
  function activityStore(platform, key) {
    const p = String(platform || 'tiktok').toLowerCase() === 'twitch' ? 'twitch' : 'tiktok';
    if (!state.activity[p][key]) state.activity[p][key] = { joined:false, like:false, followed:false, shared:false, gift:false, giftImage:'', giftName:'' };
    return state.activity[p][key];
  }
  function profileKey(item) { return normalizeUsername(item.identityKey || item.uniqueId || item.username || item.user || item.displayName || 'user').toLowerCase(); }
  function recordActivity(item) {
    const p = String(item.platform || 'tiktok').toLowerCase(); const key = profileKey(item); const type = String(item.type || item.event || '').toLowerCase();
    const a = activityStore(p, key);
    if (type.includes('join') || type === 'member') a.joined = true;
    if (type === 'like') a.like = true;
    if (type === 'share') a.shared = true;
    if (type === 'follow') a.followed = true;
    // La insignia del último regalo es persistente por usuario.
    // Se reconstruye también al llegar un comentario normal, no solo al recibir otro regalo.
    const persistentBadge = item?.persistentGiftBadge || item?.viewer?.giftBadge || item?.giftBadge || null;
    if (persistentBadge && typeof persistentBadge === 'object') {
      const catalogImage = resolveTikTokGiftImage(persistentBadge);
      const persistedImage = catalogImage || persistentBadge.image || persistentBadge.url || persistentBadge.imageUrl || '';
      const catalogName = resolveTikTokGiftCatalogItem(persistentBadge)?.name || '';
      const persistedName = catalogName || persistentBadge.name || persistentBadge.title || 'Último regalo';
      if (persistedImage) a.giftImage = persistedImage;
      if (persistedName) a.giftName = persistedName;
    }
    if (type.includes('gift') || Boolean(item.gift || item.giftName)) {
      const giftObj = item.gift && typeof item.gift === 'object' ? item.gift : null;
      a.gift = true;
      const catalogImage = resolveTikTokGiftImage(item) || resolveTikTokGiftImage(giftObj);
      const nextGiftImage = catalogImage || item.giftImage || giftObj?.image || giftObj?.url || giftObj?.imageUrl || '';
      const catalogName = resolveTikTokGiftCatalogItem(item)?.name || resolveTikTokGiftCatalogItem(giftObj)?.name || '';
      const nextGiftName = catalogName || (typeof item.gift === 'string' ? item.gift : '') || item.giftName || giftObj?.name || giftObj?.title || '';
      if (nextGiftImage) a.giftImage = nextGiftImage;
      if (nextGiftName) a.giftName = nextGiftName;
      state.supporters[p][key] = { displayName:item.displayName || item.username || key, at:Date.now() };
    }
  }
  function giftBadgeMarkup(item) {
    const catalog = resolveTikTokGiftCatalogItem(item);
    const giftName = catalog?.name || item.gift || item.giftName || 'Regalo';
    const giftImage = resolveTikTokGiftImage(item) || item.giftImage || item.gift?.image || '';
    const emoji = item.giftEmoji || item.emoji || '🎁';
    return `<span class="activity-badge gift-user-badge" title="${esc(giftName)}">${giftImage ? `<img src="${esc(giftImage)}" alt="">` : esc(emoji)}</span>`;
  }

  function activityBadgeMarkup(item) {
    const badges=[];
    const previewType = String(item?.previewActivityType || '').toLowerCase();
    const previewGiftEmoji = item?.giftEmoji || '';
    if (previewType === 'like' && settings.personalization.highlightLikes !== false) badges.push('<span class="activity-badge" title="Like">❤️</span>');
    if ((previewType === 'join' || previewType === 'member') && settings.personalization.highlightJoins !== false) badges.push('<span class="activity-badge" title="Se unió al directo">👻</span>');
    if (previewType === 'share' && settings.personalization.highlightShares !== false) badges.push('<span class="activity-badge" title="Compartió">🗣️</span>');
    if (previewType === 'follow' && settings.personalization.highlightFollows !== false) badges.push('<span class="activity-badge" title="Seguidor">👤</span>');
    if (previewType === 'bits') badges.push('<span class="activity-badge gift-activity" title="Bits">💎</span>');
    if (previewType === 'sub' || previewType === 'subscription' || previewType === 'subscription-gift') badges.push('<span class="activity-badge gift-activity" title="Suscripción">⭐</span>');
    if (item?.preview === true && previewGiftEmoji) badges.push(`<span class="activity-badge gift-activity" title="${esc(item.giftName || item.gift || 'Regalo')}">${esc(previewGiftEmoji)}</span>`);
    if (item?.preview === true && (item?.gift || item?.giftName) && settings.personalization.highlightGifts !== false) {
      const giftImage = item.giftImage || '';
      if (giftImage) badges.push(`<span class="activity-badge gift-activity gift-last-badge" title="${esc(item.giftName || item.gift || 'Regalo')}"><img src="${esc(giftImage)}" alt=""></span>`);
    }
    if (badges.length) return badges.join('');
    const a = activityStore(item.platform, profileKey(item));
    const permanent = permanentProfile(item);
    const itemType = String(item?.type || item?.event || '').toLowerCase();
    // Permanentes: sobreviven al cierre del LIVE y siguen visibles junto al usuario.
    if (permanent?.followedBefore && settings.personalization.highlightFollows !== false) badges.push('<span class="activity-badge" title="Seguidor">👤</span>');
    // Un único 🎁 representa al donador, tanto si ya donó antes como si acaba de regalar.
    const isDonor = Boolean(permanent?.everDonated || a.gift || item?.persistentDonor || item?.everDonated || item?.viewer?.everDonated);
    if (isDonor && settings.personalization.highlightGifts !== false) badges.push('<span class="activity-badge gift-activity gift-base-badge" title="Donador">🎁</span>');
    // Insignia separada para identificar el último regalo enviado.
    if (a.giftImage && settings.personalization.highlightGifts !== false) {
      badges.push(`<span class="activity-badge gift-activity gift-last-badge" title="${esc(a.giftName || 'Último regalo')}"><img src="${esc(a.giftImage)}" alt=""></span>`);
    }
    // Temporales: solo mientras exista actividad en el LIVE actual.
    if (a.like && settings.personalization.highlightLikes !== false) badges.push('<span class="activity-badge" title="Like">❤️</span>');
    if (a.joined && settings.personalization.highlightJoins !== false) badges.push('<span class="activity-badge" title="Se unió al directo">👻</span>');
    if (a.shared && settings.personalization.highlightShares !== false) badges.push('<span class="activity-badge" title="Compartió">🗣️</span>');
    return badges.join('');
  }
  function isVipRgb(item) { return Boolean(item?.persistentVipRgb || item?.vipRgb || item?.viewer?.persistentVipRgb); }
  function isSupporter(item) { return Boolean(item?.persistentDonor || item?.everDonated || state.supporters[String(item.platform||'tiktok').toLowerCase()]?.[profileKey(item)]); }

  function frameClass(item) {
    const p = settings.personalization;
    if (isVipRgb(item)) return 'avatar-frame-rgb-vip';
    if (isSupporter(item)) return 'avatar-frame-gold';
    if (p.avatarFrame === 'none') return 'avatar-frame-none';
    if (p.avatarFrame === 'ring') return 'avatar-frame-ring';
    if (p.avatarFrame === 'role') return 'avatar-frame-role';
    return 'avatar-frame-platform';
  }

  function bubbleClass(item) {
    const p = settings.personalization;
    if (p.bubbleFrame === 'none') return 'bubble-frame-none';
    if (p.bubbleFrame === 'role') return 'bubble-frame-role';
    return 'bubble-frame-platform';
  }

  function nameColor(item) {
    const p = settings.personalization || {};
    const platform = String(item.platform || 'tiktok').toLowerCase();
    if (p.nameColorMode === 'custom' && /^#[0-9a-f]{6}$/i.test(p.nameCustomColor || '')) return p.nameCustomColor;
    if (platform === 'twitch') {
      if (p.twitchNameColor === 'white') return '#ffffff';
      if (p.twitchNameColor === 'custom' && /^#[0-9a-f]{6}$/i.test(p.nameCustomColor || '')) return p.nameCustomColor;
      return '#c7a2ff';
    }
    if (p.tiktokNameColor === 'real') return '#fe6f92';
    if (p.tiktokNameColor === 'custom' && /^#[0-9a-f]{6}$/i.test(p.nameCustomColor || '')) return p.nameCustomColor;
    return '#ffffff';
  }

  const GIFT_ES_MAP = {
    'heartme':'Quiéreme','rose':'Rosa','gg':'GG','tiktok':'TikTok','communityheart':'Corazón de la comunidad','ashardofhope':'Un rayo de esperanza','loveyousomuch':'Te quiero mucho','icecreamcone':'Cono de helado','winkwink':'Guiño','pop':'Pop','freestyle':'Freestyle','fingerheart':'Corazón con los dedos','loveletter':'Carta de amor','icecream':'Helado','cap':'Gorra','moneygun':'Pistola de dinero','flowers':'Flores','fireworks':'Fuegos artificiales','perfume':'Perfume','crown':'Corona','corgi':'Corgi','lovechat':'Chat de amor','doughnut':'Dona','papercrane':'Grulla de papel','confetti':'Confeti','firecracker':'Petardo','panda':'Panda','sportscar':'Auto deportivo','lion':'León','unicorn':'Unicornio','galaxy':'Galaxia','castle':'Castillo','diamond':'Diamante','star':'Estrella','heart':'Corazón','gift':'Regalo','balloon':'Globo','cake':'Pastel','coffee':'Café','beer':'Cerveza','cheers':'Salud','rosebouquet':'Ramo de rosas','bouquet':'Ramo','sunflower':'Girasol','tiktokuniverse':'Universo de TikTok'
  };
  const GIFT_WORD_ES = [
    [/\bheart(s)?\b/gi,'corazón'],[/\blove\b/gi,'amor'],[/\byou\b/gi,'tú'],[/\bme\b/gi,'mí'],[/\bsomuch\b/gi,'muchísimo'],[/\brose(s)?\b/gi,'rosa'],[/\bflower(s)?\b/gi,'flor'],[/\bflower\b/gi,'flor'],[/\bice cream\b/gi,'helado'],[/\bcone\b/gi,'cono'],[/\bcommunity\b/gi,'comunidad'],[/\bhope\b/gi,'esperanza'],[/\bshard\b/gi,'fragmento'],[/\bice\b/gi,'hielo'],[/\bcream\b/gi,'crema'],[/\bwink\b/gi,'guiño'],[/\bgift\b/gi,'regalo'],[/\bfireworks?\b/gi,'fuegos artificiales'],[/\bcake\b/gi,'pastel'],[/\bballoon\b/gi,'globo'],[/\bcrown\b/gi,'corona'],[/\bperfume\b/gi,'perfume'],[/\bdiamond\b/gi,'diamante'],[/\bstar\b/gi,'estrella'],[/\bcoffee\b/gi,'café'],[/\bcar\b/gi,'auto'],[/\bsports?\b/gi,'deporte'],[/\bunicorn\b/gi,'unicornio'],[/\blion\b/gi,'león'],[/\bking\b/gi,'rey'],[/\bqueen\b/gi,'reina'],[/\bdragon\b/gi,'dragón'],[/\bcastle\b/gi,'castillo'],[/\bworld\b/gi,'mundo'],[/\buniverse\b/gi,'universo'],[/\bparty\b/gi,'fiesta'],[/\bpop\b/gi,'pop'],[/\bgg\b/gi,'GG'],[/\btiktok\b/gi,'TikTok']
  ];
  function normalizeGiftKey(value) { return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'').trim(); }
  function giftDisplayName(itemOrName) {
    const obj = itemOrName && typeof itemOrName === 'object' ? itemOrName : {name:itemOrName};
    const raw = String(obj.displayNameEs || obj.giftName || obj.gift || obj.name || obj.title || obj.key || 'Regalo').trim();
    const key = normalizeGiftKey(obj.key || raw);
    if (GIFT_ES_MAP[key]) return GIFT_ES_MAP[key];
    let translated = raw;
    for (const [re, repl] of GIFT_WORD_ES) translated = translated.replace(re, repl);
    return translated || 'Regalo';
  }
  async function loadTikTokGiftCatalog() {
    if (state.tiktokGiftCatalogLoaded) return state.tiktokGiftCatalog;
    try {
      const res = await fetch('/data/tiktok-gifts.json',{cache:'no-store'});
      if (!res.ok) throw new Error('gift catalog');
      const data = await res.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      state.tiktokGiftCatalog = items;
      state.tiktokGiftIndex = new Map();
      for (const item of items) {
        for (const candidate of [item.key,item.name,item.alt,item.id]) {
          const k=normalizeGiftKey(candidate); if(k && !state.tiktokGiftIndex.has(k)) state.tiktokGiftIndex.set(k,item);
        }
      }
      state.tiktokGiftCatalogLoaded = true;
      if (page==='customize' && activeCustomizeTab==='gifts') renderCustomizePreviewOnly({force:true});
    } catch { state.tiktokGiftCatalogLoaded=true; state.tiktokGiftCatalog=[]; state.tiktokGiftIndex=new Map(); }
    return state.tiktokGiftCatalog;
  }
  function lookupTikTokGift(value) { const key=normalizeGiftKey(value); return key ? (state.tiktokGiftIndex.get(key)||null) : null; }
  function resolveTikTokGiftCatalogItem(valueOrItem) {
    const obj = valueOrItem && typeof valueOrItem === 'object' ? valueOrItem : { name:valueOrItem };
    const candidates = [obj?.giftKey,obj?.key,obj?.giftId,obj?.id,obj?.giftName,obj?.name,obj?.title,typeof obj?.gift==='string'?obj.gift:obj?.gift?.key,typeof obj?.gift==='object'?obj.gift.id:'',typeof obj?.gift==='object'?obj.gift.name:''];
    for (const candidate of candidates) { const match = lookupTikTokGift(candidate); if (match) return match; }
    return null;
  }
  function resolveTikTokGiftImage(valueOrItem) {
    const gift = resolveTikTokGiftCatalogItem(valueOrItem);
    return String(gift?.image || gift?.icon || gift?.thumb || gift?.url || gift?.imageUrl || '').trim();
  }

  function fontFamilyName(value) {
    const v = String(value || settings.personalization?.font || 'inter').toLowerCase();
    return ({
      inherit:'Inter, Manrope, sans-serif', inter:'Inter, Manrope, sans-serif', poppins:'Poppins, sans-serif',
      montserrat:'Montserrat, sans-serif', oswald:'Oswald, sans-serif', system:'system-ui, sans-serif',
      roboto:'Roboto, Arial, sans-serif', nunito:'Nunito, Arial, sans-serif', lato:'Lato, Arial, sans-serif', opensans:'Open Sans, Arial, sans-serif'
    })[v] || 'Inter, Manrope, sans-serif';
  }

  function styleVars(item, kind='chat') {
    const p = settings.personalization || {};
    const platform = String(item.platform || 'tiktok').toLowerCase();
    const accent = platform === 'twitch' ? '#9146ff' : '#fe2c55';
    const textColor = p.textColor === 'auto' || !p.textColor ? '#e8ecf4' : p.textColor;
    const font = kind === 'event' ? fontFamilyName(p.overlayEventFont || p.font) : kind === 'gift' ? fontFamilyName(p.overlayGiftFont || p.font) : fontFamilyName(p.font);
    return `--row-accent:${accent};--name-color:${nameColor(item)};--message-color:${textColor};--bubble-radius:${Number(p.bubbleRadius ?? 12)}px;--avatar-border-width:${Number(p.avatarBorderWidth ?? 2)}px;--row-gap:${Number(p.rowGap ?? 5)}px;--message-padding:${Number(p.messagePadding ?? 7)}px 9px;--chat-font:${font}`;
  }

  function giftMedia(item) {
    const giftObj = item.gift && typeof item.gift === 'object' ? item.gift : null;
    const image = item.giftImage || giftObj?.image || giftObj?.url || giftObj?.imageUrl || '';
    const rawName = (typeof item.gift === 'string' ? item.gift : '') || item.giftName || giftObj?.name || giftObj?.title || 'Regalo';
    const name = giftDisplayName({...(giftObj||{}), giftName:rawName, key:giftObj?.key || item.giftKey});
    if (!image && !name) return '';
    const amount = item.amount == null || item.amount === '' ? 1 : item.amount;
    return `<div class="gift-media gift-media-real">${image ? `<img src="${esc(image)}" alt="${esc(name)}" loading="lazy" onerror="this.remove()">` : ''}<span>${esc(name)}</span><strong>×${esc(amount)}</strong></div>`;
  }

  function stripEmojis(value) {
    return String(value || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g,' ').trim();
  }

  function displayNameForActivity(item) {
    const placeholders = new Set(['usuario','user','evento','accion social','acción social','unknown','desconocido','event','undefined','null','n/a','na']);
    const values = [
      item?.displayName,
      item?.nickname,
      item?.user,
      item?.username,
      item?.uniqueId
    ];
    for (const value of values) {
      const text = String(value || '').trim();
      if (text && !placeholders.has(text.toLowerCase())) return text;
    }
    return 'Usuario';
  }

  function normalizeIncomingActivity(item) {
    const entry = { ...(item || {}) };
    const type = String(entry.type || '').trim().toLowerCase();
    const allowed = new Set(['like','follow','share','join','gift','sub','subscription','resub','bits','raid','host','superfan','fanclub','question','system']);
    if (!allowed.has(type)) return entry;
    entry.type = type;
    entry.group = entry.group || (['gift','sub','subscription','resub','bits','raid','host'].includes(type) ? 'gift' : ['like','follow','share','join'].includes(type) ? 'event' : 'system');
    if (type === 'share') { entry.action = 'Compartió'; entry.emoji = '🗣️'; }
    if (type === 'follow') { entry.action = 'Follow'; entry.emoji = '👤'; }
    if (type === 'like') { entry.action = 'Like'; entry.emoji = '❤️'; }
    if (type === 'join') { entry.action = 'Entrada'; entry.emoji = '👻'; }
    if (!entry.identityKey) entry.identityKey = normalizeUsername(entry.uniqueId || entry.username || entry.user || entry.displayName || '').toLowerCase();
    if (!entry.username) entry.username = entry.uniqueId || '';
    if (!entry.displayName) entry.displayName = entry.user || entry.nickname || entry.uniqueId || '';
    return entry;
  }

  function messageRow(item, kind='chat') {
    const p = settings.personalization || {};
    const platform = String(item.platform || 'tiktok').toLowerCase();
    const userName = displayNameForActivity(item);
    const identity = avatarIdentity(item);
    const rawBody = item.message || item.action || '';
    const body = p.showEmotes === false ? stripEmojis(rawBody) : rawBody;
    const time = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    const avatar = item.preview === true ? previewAvatarUrl(item) : (isUsableViewerAvatar(item.avatar) ? item.avatar : '');
    const isGift = kind === 'gift' || eventVisibilityKey(item) === 'gifts' || Boolean(item.gift || item.giftName);
    const showTime = p.showTimestamps !== false;
    const showPlatform = p.showPlatformPill !== false;
    const theme = p.chatTheme || 'cloud';
    const animation = kind==='event' ? (p.eventsMode || 'slide') : kind==='gift' ? (p.giftsMode || 'slide') : (p.animation || 'slide');
    const avatarHtml = avatar
      ? `<img src="${esc(avatar)}" alt="${esc(userName)}" loading="lazy">`
      : (item.preview === true
        ? `<img src="${esc(previewAvatarUrl(item))}" alt="${esc(userName)}" loading="lazy">`
        : `<img data-avatar-platform="${esc(platform)}" data-avatar-user="${esc(identity)}" src="" alt="${esc(userName)}" loading="lazy">`);
    const messageHtml = isGift ? giftMedia(item) : (body ? esc(body) : '');
    const rowKey = eventFingerprint(item, kind);
    return `<article class="stream-row ${kind} ${platform} ${isGift ? 'gift-row' : ''} chat-theme-${theme} chat-anim-${animation} ${isSupporter(item) ? 'supporter-gold' : ''} ${p.chatAdjustMessages !== false ? 'chat-adjust' : 'chat-no-adjust'}" data-stream-key="${esc(rowKey)}" style="${styleVars(item, kind)}">
      <div class="chat-avatar ${frameClass(item)} size-${p.avatarSize || 'md'}">${avatarHtml}</div>
      <div class="row-body">
        <div class="row-top">
          <strong class="name-size-${p.nameSize || 'md'} weight-${p.nameWeight || '800'}">${esc(userName)}</strong>
          ${badgeMarkup(item)}${p.showActivity !== false ? activityBadgeMarkup(item) : ''}
          ${showPlatform ? `<span class="platform-pill ${platform}">${platform === 'twitch' ? 'TW' : 'TT'}</span>` : ''}
          ${showTime ? `<time>${time}</time>` : ''}
        </div>
        ${messageHtml ? `<div class="row-message ${bubbleClass(item)} ${isGift ? 'gift-message-bubble' : ''}">${messageHtml}</div>` : ''}
      </div>
    </article>`;
  }

  function activityKind(item) {
    if (String(item?.activityKind||'').toLowerCase()==='gift') return 'gift';
    const type = String(item?.type || item?.event || '').toLowerCase();
    return (type.includes('gift') || Boolean(item?.gift || item?.giftName)) ? 'gift' : 'event';
  }
  function streamActivityRow(item, kind='event') {
    const p=settings.personalization||{};
    const platform=String(item.platform||'tiktok').toLowerCase();
    const userName=displayNameForActivity(item);
    const identity=avatarIdentity(item);
    const avatar=isUsableViewerAvatar(item.avatar)?item.avatar:'';
    const avatarHtml=avatar ? `<img src="${esc(avatar)}" alt="${esc(userName)}" loading="lazy">` : `<img data-avatar-platform="${esc(platform)}" data-avatar-user="${esc(identity)}" src="" alt="${esc(userName)}" loading="lazy">`;
    const isGift=kind==='gift';
    const itemType=String(item?.type||'').toLowerCase();
    const typeLabel=String(item.action||item.type|| (isGift?'Regalo':'Evento')).toUpperCase();
    const rawText=item.message||item.action||'';
    const cleanText=stripEmojis(rawText)||rawText;
    const highlight=isGift?(p.giftHighlightStyle||'gold'):(p.overlayEventHighlightStyle||'platform');
    const accent=highlight==='gold'?'#f5d063':highlight==='accent'?'#9d7dff':highlight==='platform'?(platform==='twitch'?'#9146ff':'#fe2c55'):'transparent';
    const font=fontFamilyName(isGift ? (p.overlayGiftFont||p.font) : (p.overlayEventFont||p.font));
    const side=isGift?(p.giftsOverlayCardSide||'center'):(p.eventsOverlayCardSide||'center');
    const layout=isGift?(p.giftsLayout||'vertical'):(p.eventsLayout||'vertical');
    const direction=isGift?(p.giftsDirection||'down'):(p.eventsDirection||'down');
    const mode=isGift?(p.giftsMode||'slide'):(p.eventsMode||'slide');
    const size=isGift?(p.giftsPanelSize||'normal'):(p.eventsPanelSize||'normal');
    const shape=isGift?(p.giftsOverlayShape||'normal'):(p.eventsOverlayShape||'normal');
    const frame=isGift?(p.giftsCardFrame!==false):(p.eventsCardFrame!==false);
    let icon='';
    let body='';
    if(isGift){
      const giftObj=item.gift&&typeof item.gift==='object'?item.gift:null;
      const giftImage=item.giftImage||giftObj?.image||giftObj?.url||giftObj?.imageUrl||'';
      const rawGiftName=(typeof item.gift==='string'?item.gift:'')||item.giftName||giftObj?.name||giftObj?.title||'Regalo';
      const giftName=giftDisplayName({...(giftObj||{}),giftName:rawGiftName,key:giftObj?.key||item.giftKey});
      const amount=item.amount==null||item.amount===''?1:item.amount;
      const display=p.overlayGiftDisplayMode||'full';
      const imageSize=p.overlayGiftImageSize||'md';
      const nameColor=p.overlayNameColorMode==='custom'?(p.overlayNameColor||'#fff'):(platform==='twitch'?'#c7a2ff':'#ff7396');
      const amountStyle=p.giftAmountStyle==='muted'?'muted':p.giftAmountStyle==='bold'?'bold':'accent';
      const imageHtml=giftImage?`<img class="gift-real-image size-${esc(imageSize)}" src="${esc(giftImage)}" alt="${esc(giftName)}" loading="lazy" onerror="this.remove()">`:'<span class="gift-real-fallback">🎁</span>';
      const giftText=`<strong class="gift-real-name" style="color:${esc(nameColor)}">${esc(giftName)}</strong><b class="gift-real-amount ${amountStyle}">×${esc(amount)}</b>`;
      if(display==='image') body=`<div class="gift-stream-content composition-${esc(p.overlayGiftCompositionMode||'vertical-centered')}">${imageHtml}</div>`;
      else if(display==='text') body=`<div class="gift-stream-content composition-${esc(p.overlayGiftCompositionMode||'vertical-centered')}">${giftText}</div>`;
      else body=`<div class="gift-stream-content composition-${esc(p.overlayGiftCompositionMode||'vertical-centered')}">${imageHtml}${giftText}</div>`;
      icon='🎁';
    } else {
      icon=esc(item.emoji||typeEmojiForDashboard(item));
      body=`<span>${esc(cleanText)}</span>`;
    }
    const showUser=isGift ? true : p.highlightEventUsername!==false;
    return `<article class="activity-preview activity-real ${isGift?'stage-gifts':'stage-events'} ${isGift?'gift':'event'}-${esc(highlight)} ${isGift?'gift':'event'}-layout-${esc(layout)} ${isGift?'gift':'event'}-direction-${esc(direction)} ${isGift?'gift':'event'}-mode-${esc(mode)} ${isGift?'gift':'event'}-size-${esc(size)} ${isGift?'gift':'event'}-shape-${esc(shape)} ${isGift?'gift':'event'}-side-${esc(side)} ${frame?'':'no-frame'}" style="--activity-accent:${accent};font-family:${font}">
      <div class="activity-user-avatar ${frameClass(item)} size-${p.avatarSize||'md'}">${avatarHtml}</div>
      <div class="activity-icon">${isGift?'<span>🎁</span>':icon}</div>
      <div class="activity-copy"><small>${esc(typeLabel)}</small>${showUser?`<strong>${esc(userName)}</strong>`:''}${body}</div>
      <span class="activity-platform ${platform}">${platform==='twitch'?'TW':'TT'}</span>
    </article>`;
  }
  function typeEmojiForDashboard(item){
    const key=eventVisibilityKey(item);
    return ({likes:'❤️',follows:'👤',joins:'👻',shares:'🗣️',subscriptions:'⭐',bits:'💎',raids:'🚀',hosts:'📣',gifts:'🎁',superfan:'🌟',system:'•'})[key]||'•';
  }
  function activityItemKey(item, kind){
    const id=String(item?.id||item?.messageId||item?.eventId||item?.activityId||item?.giftId||'').trim();
    if(id) return `activity:${kind}:${String(item?.platform||'').toLowerCase()}:${id}`;
    const platform=String(item?.platform||'tiktok').toLowerCase();
    const user=String(item?.uniqueId||item?.username||item?.user||item?.displayName||'').trim().toLowerCase();
    const ts=Number(item?.timestamp||0);
    const type=String(item?.type||item?.event||item?.group||kind).toLowerCase();
    const gift=String(item?.giftKey||item?.giftId||item?.giftName||item?.gift||'').trim().toLowerCase();
    const amount=String(item?.amount??item?.bits??'').trim();
    return `activity:${kind}:${platform}:${user}:${ts}:${type}:${gift}:${amount}`;
  }
  function renderActivityItem(item){
    const kind=activityKind(item);
    const style=kind==='gift' ? (settings.personalization?.giftStyle||'chat') : (settings.personalization?.eventStyle||'chat');
    const html=style==='stream' ? streamActivityRow(item,kind) : messageRow(item,kind);
    const key=activityItemKey(item,kind);
    return html.replace(/^<article\b/, `<article data-activity-key=\"${esc(key)}\"`);
  }
  function eventVisibilityKey(item) {
    const type = String(item?.type || item?.event || '').toLowerCase();
    // Monetary/support actions belong to Regalos, never to Eventos.
    if (item?.activityKind === 'gift' || item?.gift || item?.giftName || type.includes('gift')) return 'gifts';
    if (type === 'bits' || item?.bits) return 'gifts';
    if (type === 'sub' || type.includes('subscription')) return 'gifts';
    if (type === 'like') return 'likes';
    if (type.includes('follow') || type === 'follow') return 'follows';
    if (type.includes('join') || type === 'member') return 'joins';
    if (type.includes('share')) return 'shares';
    if (type.includes('superfan') || type.includes('super fan')) return 'superfan';
    if (type === 'raid' || type.includes('raid')) return 'raids';
    if (type === 'host' || type.includes('host')) return 'hosts';
    if (type.includes('stream_start') || type.includes('live_start') || type.includes('live started') || type.includes('began')) return 'system';
    return 'system';
  }
  function visibleActivity(item) {
    return (settings.personalization?.eventVisibility?.[eventVisibilityKey(item)] ?? true) !== false;
  }
  function activityFilterPass(item) {
    const selected = settings.filters.activity || 'all';
    return selected === 'all' || String(item.platform || '').toLowerCase() === selected;
  }
  const DASHBOARD_FEED_TTL_MS = 10 * 60 * 1000;
  let dashboardFeedCleanupTimer = null;

  function dashboardFeedCutoff() {
    return Date.now() - DASHBOARD_FEED_TTL_MS;
  }

  function pruneDashboardFeedMemory() {
    if (page !== 'dashboard') return;
    const cutoff = dashboardFeedCutoff();
    state.chat = state.chat.filter(item => {
      const ts = Number(item?.timestamp || 0);
      return !ts || ts >= cutoff;
    });
    state.events = state.events.filter(item => {
      const ts = Number(item?.timestamp || 0);
      return !ts || ts >= cutoff;
    });
    state.gifts = state.gifts.filter(item => {
      const ts = Number(item?.timestamp || 0);
      return !ts || ts >= cutoff;
    });
  }

  function startDashboardFeedCleanup() {
    if (dashboardFeedCleanupTimer) clearInterval(dashboardFeedCleanupTimer);
    dashboardFeedCleanupTimer = setInterval(() => {
      if (page !== 'dashboard') return;
      const beforeChat = state.chat.length;
      const beforeEvents = state.events.length;
      const beforeGifts = state.gifts.length;
      pruneDashboardFeedMemory();
      if (beforeChat !== state.chat.length || beforeEvents !== state.events.length || beforeGifts !== state.gifts.length) {
        updateDashboardFeeds();
      }
    }, 30000);
  }

  function unifiedActivityItems() {
    const cutoff = page === 'dashboard' ? dashboardFeedCutoff() : 0;
    return [...state.events, ...state.gifts]
      .filter(item => { const ts = Number(item?.timestamp || 0); return !cutoff || !ts || ts >= cutoff; })
      .filter(visibleActivity).filter(activityFilterPass)
      .sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0)).slice(-200);
  }
  function visibleChatItems() {
    const selectedFilter=settings.filters.chat||'all';
    const autoClear=settings.personalization?.autoClearChat===true;
    const dashboardCutoff=page === 'dashboard' ? dashboardFeedCutoff() : 0;
    const autoClearCutoff=Date.now()-Math.max(5,Number(settings.personalization?.clearChatSeconds||30))*1000;
    const filtered=state.chat.slice(-300).filter(item=>{
      const ts=Number(item?.timestamp||0);
      const keepDashboard=!dashboardCutoff||!ts||ts>=dashboardCutoff;
      const keepAutoClear=!autoClear||!ts||ts>=autoClearCutoff;
      return keepDashboard && keepAutoClear && (selectedFilter==='all'||String(item.platform||'').toLowerCase()===selectedFilter);
    });
    return orderedItems(filtered, settings.personalization?.chatDirection || 'down');
  }
  function eventFingerprint(item, kind='event') {
    const platform=String(item?.platform||'').toLowerCase();
    const user=normalizeUsername(item?.identityKey||item?.uniqueId||item?.username||item?.user||item?.displayName||'user').toLowerCase();
    const type=String(item?.type||item?.event||kind).toLowerCase();
    const text=String(item?.message||item?.action||item?.giftName||item?.gift||'').trim().toLowerCase();
    const gift=String(item?.giftId||item?.gift?.id||item?.stickerId||'').toLowerCase();
    const sourceId=String(item?.messageId||item?.commentId||item?.eventId||item?.msgId||'').trim().toLowerCase();
    const avatar=String(item?.avatar||item?.avatarUrl||item?.profilePictureUrl||'').trim().toLowerCase();
    const ts=Number(item?.timestamp||0); const bucket=ts?Math.floor(ts/1200):0;
    return sourceId?`${kind}|${platform}|${sourceId}|${user}`:`${kind}|${platform}|${user}|${type}|${text}|${gift}|${avatar}|${bucket}`;
  }
  const SMART_SCROLL_IDLE_MS = 5000;
  const dashboardChatScrollState = {pinned:true,top:0,initialized:false,direction:'down',manual:false,manualAt:0,programmatic:false,pendingNewest:false};
  const dashboardActivityScrollState = new WeakMap();
  function dashboardPinned(box, direction) {
    const threshold=40;
    return direction==='up' ? box.scrollTop<=threshold : box.scrollHeight-box.scrollTop-box.clientHeight<=threshold;
  }
  function markDashboardManualScroll(state, box) {
    state.manual=true; state.manualAt=Date.now(); state.top=box.scrollTop;
  }
  function bindDashboardChatScroll(box, direction) {
    if (!box) return;
    box.dataset.scrollDirection=direction;
    if (box.dataset.scrollTracking==='1') return;
    box.dataset.scrollTracking='1';
    box.addEventListener('scroll',()=>{
      const d=box.dataset.scrollDirection||'down';
      const pinned=dashboardPinned(box,d);
      const state=dashboardChatScrollState;
      if (!state.programmatic) markDashboardManualScroll(state,box);
      state.pinned=pinned;
      state.initialized=true;
      state.direction=d;
      if (pinned) { state.manual=false; state.pendingNewest=false; }
    },{passive:true});
  }
  function dashboardProgrammaticScroll(box, fn){
    const state=dashboardChatScrollState;
    state.programmatic=true;
    try{fn();}finally{requestAnimationFrame(()=>{state.programmatic=false;});}
  }
  function dashboardShouldFollowNew(state){
    return !state.manual || (state.manualAt && Date.now()-state.manualAt>=SMART_SCROLL_IDLE_MS);
  }
  function placeDashboardChat(box,direction,force=false,newestChanged=false) {
    if (!box) return;
    bindDashboardChatScroll(box,direction);
    const state=dashboardChatScrollState;
    const shouldFollow = force || !state.initialized || state.pinned || (newestChanged && dashboardShouldFollowNew(state));
    const rows = box.querySelectorAll('.stream-row.chat');
    const target = rows.length ? (direction === 'up' ? rows[0] : rows[rows.length - 1]) : null;
    const follow = () => {
      dashboardProgrammaticScroll(box,()=>{
        if (shouldFollow) {
          if (target) target.scrollIntoView({block:'nearest', inline:'nearest', behavior:'auto'});
          else box.scrollTop = direction==='up' ? 0 : box.scrollHeight;
        } else {
          box.scrollTop=Math.min(state.top,Math.max(0,box.scrollHeight-box.clientHeight));
        }
      });
      state.initialized=true; state.direction=direction;
      if(shouldFollow){state.pinned=true;state.manual=false;state.pendingNewest=false;}
    };
    requestAnimationFrame(()=>{ follow(); requestAnimationFrame(()=>{ if(shouldFollow) follow(); }); });
  }
  function bindDashboardActivityScroll(box,key,direction='down'){
    if(!box) return;
    let state=dashboardActivityScrollState.get(box);
    if(!state){ state={pinned:true,initialized:false,manual:false,manualAt:0,programmatic:false,top:0,direction}; dashboardActivityScrollState.set(box,state); }
    box.dataset.scrollDirection=direction;
    if(box.dataset.smartScrollTracking==='1') return;
    box.dataset.smartScrollTracking='1';
    box.addEventListener('scroll',()=>{
      const d=box.dataset.scrollDirection||'down';
      if(!state.programmatic){ state.manual=true; state.manualAt=Date.now(); state.top=box.scrollTop; }
      state.pinned=dashboardPinned(box,d); state.initialized=true; state.direction=d;
      if(state.pinned){state.manual=false;state.pendingNewest=false;}
    },{passive:true});
  }
  function placeDashboardActivity(box,key,direction='down',force=false,newestChanged=false){
    if(!box) return;
    const state=dashboardActivityScrollState.get(box)||{pinned:true,initialized:false,manual:false,manualAt:0,programmatic:false,top:0,direction:'down'};
    dashboardActivityScrollState.set(box,state);
    if(state.direction !== direction){
      state.direction=direction;
      state.initialized=false;
      state.pinned=true;
      state.manual=false;
      state.manualAt=0;
      state.top=0;
    }
    bindDashboardActivityScroll(box,key,direction);
    const shouldFollow=force||!state.initialized||state.pinned||(newestChanged&&(!state.manual||Date.now()-state.manualAt>=SMART_SCROLL_IDLE_MS));
    state.programmatic=true;
    requestAnimationFrame(()=>{
      if(shouldFollow) box.scrollTop=direction==='up'?0:box.scrollHeight;
      else box.scrollTop=Math.min(state.top,Math.max(0,box.scrollHeight-box.clientHeight));
      requestAnimationFrame(()=>{state.programmatic=false;state.initialized=true;state.direction=direction;if(shouldFollow){state.pinned=true;state.manual=false;state.pendingNewest=false;}});
    });
  }
  function updateDashboardFeeds() {
    if(page!=='dashboard') return;
    const chatBox=$('dashChat'), activityBox=$('dashActivity');
    if(!chatBox||!activityBox){ renderDashboard(true); return; }
    const chat=visibleChatItems(), activity=unifiedActivityItems();
    const chatSignature=chat.map(x=>eventFingerprint(x,'chat')).join('|');
    const activitySignature=activity.map(x=>eventFingerprint(x,'activity')).join('|');
    const chatDirection=settings.personalization?.chatDirection || 'down';
    chatBox.classList.toggle('direction-up', chatDirection==='up');
    bindDashboardChatScroll(chatBox, chatDirection);
    const prevChatSig=chatBox.dataset.signature||'';
    const chatNewestKey=chat.length?eventFingerprint(chat[chat.length-1],'chat'):'';
    const chatNewestChanged=chatNewestKey!==String(chatBox.dataset.newestKey||'');
    if(chatBox.dataset.signature!==chatSignature){
      bindDashboardChatScroll(chatBox, chatDirection);
      chatBox.innerHTML=chat.length?chat.map(x=>messageRow(x)).join(''):'<div class="empty">No hay comentarios para este filtro todavía.</div>';
      chatBox.dataset.signature=chatSignature; chatBox.dataset.newestKey=chatNewestKey; queueAvatarImages(chatBox);
      requestAnimationFrame(()=>placeDashboardChat(chatBox,chatDirection,false,chatNewestChanged||!prevChatSig));
    }
    const activityDirection=settings.personalization?.eventsDirection || 'down';
    activityBox.classList.toggle('direction-up', activityDirection==='up');
    bindDashboardActivityScroll(activityBox,'activity',activityDirection);
    const orderedActivity=orderedItems(activity, activityDirection);
    const prevActivitySig=activityBox.dataset.signature||'';
    const newestActivityItem=activity.length ? activity[activity.length-1] : null;
    const activityNewestKey=newestActivityItem ? eventFingerprint(newestActivityItem,'activity') : '';
    const activityNewestChanged=activityNewestKey!==String(activityBox.dataset.newestKey||'');
    if(activityBox.dataset.signature!==activitySignature || activityBox.dataset.direction!==activityDirection){
      activityBox.dataset.direction=activityDirection;
      bindDashboardActivityScroll(activityBox,'activity',activityDirection);
      const ordered=orderedActivity;
      const existing=new Map(Array.from(activityBox.querySelectorAll('[data-activity-key]')).map(node=>[node.dataset.activityKey,node]));
      const wanted=new Set();
      const fragment=document.createDocumentFragment();
      for(const item of ordered){
        const kind=activityKind(item);
        const key=activityItemKey(item,kind);
        wanted.add(key);
        const oldNode=existing.get(key);
        if(oldNode) fragment.appendChild(oldNode);
        else{
          const holder=document.createElement('div');
          holder.innerHTML=renderActivityItem(item).trim();
          const node=holder.firstElementChild;
          if(node) fragment.appendChild(node);
        }
      }
      for(const node of Array.from(activityBox.querySelectorAll('[data-activity-key]'))){
        if(!wanted.has(node.dataset.activityKey)) node.remove();
      }
      const empty=activityBox.querySelector('.empty');
      if(ordered.length){ if(empty) empty.remove(); activityBox.appendChild(fragment); }
      else if(!empty) activityBox.innerHTML='<div class="empty">Aún no hay actividad.</div>';
      activityBox.dataset.signature=activitySignature; activityBox.dataset.newestKey=activityNewestKey; queueAvatarImages(activityBox);
      requestAnimationFrame(()=>placeDashboardActivity(activityBox,'activity',activityDirection,!prevActivitySig,activityNewestChanged||!prevActivitySig));
    }
  }
  function updateDashboardConnectionStatus() {
    if (page !== 'dashboard') return;
    const status = channelConnectionSummary();
    const root = document.querySelector('.dashboard-connection-status');
    if (!root) return;
    root.className = `dashboard-connection-status ${status.dot}`;
    const strong = root.querySelector('strong');
    if (strong) strong.textContent = status.label;
  }

  function renderDashboard(force=false) {
    if(dashboardClearTimer){clearInterval(dashboardClearTimer);dashboardClearTimer=null;}
    if(!force && $('dashChat') && $('dashActivity')){updateDashboardFeeds();return;}
    const chat=visibleChatItems(), activity=unifiedActivityItems();
    const status=channelConnectionSummary();
    const chatDirection=settings.personalization?.chatDirection || 'down';
    const activityDirection=settings.personalization?.eventsDirection || 'down';
    const initialActivity=orderedItems(activity,activityDirection);
    $('view').innerHTML=`<div class="hero"><div><div class="dashboard-connection-status ${status.dot}"><span class="status-dot"></span><strong>${esc(status.label)}</strong><span class="status-glitch" aria-hidden="true"></span></div><h2>Todo lo que pasa en tu live,<br><em>en un solo lugar.</em></h2><p>Tu conexión permanece activa aunque cambies de sección o abras otras pestañas. El chat, eventos y regalos siguen entrando en segundo plano.</p></div></div>
      <div class="dashboard-grid"><section class="card feed"><header><div><p class="eyebrow">EN VIVO</p><h3>Chat unificado</h3></div><div class="header-actions"><select id="dashChatFilter"><option value="all">Todos</option><option value="tiktok">TikTok</option><option value="twitch">Twitch</option></select></div></header><div id="dashChat" class="chat-feed ${chatDirection==='up'?'direction-up':''}">${chat.length?chat.map(x=>messageRow(x)).join(''):'<div class="empty">No hay comentarios para este filtro todavía.</div>'}</div></section>
      <section class="card activity activity-panel"><header><div><p class="eyebrow">ACTIVIDAD</p><h3>Eventos & regalos</h3></div><div class="activity-toolbar"><select id="dashActivityFilter"><option value="all">Todos</option><option value="tiktok">TikTok</option><option value="twitch">Twitch</option></select><button id="dashActivitySettings" class="icon-btn" type="button" title="Ajustes de actividad">⚙</button></div></header><div id="dashActivity" class="event-feed ${activityDirection==='up'?'direction-up':''}" data-direction="${activityDirection}">${initialActivity.length?initialActivity.map(renderActivityItem).join(''):'<div class="empty">Aún no hay actividad.</div>'}</div><div id="dashActivityPopup" class="activity-settings-layer" hidden><div class="activity-settings-backdrop" data-close-activity-settings></div><div class="activity-settings-popover" role="dialog" aria-modal="true"><div class="popover-head"><div><p class="eyebrow">AJUSTES DE ACTIVIDAD</p><strong>Qué se mostrará</strong></div><button id="closeActivitySettings" class="mini-close" type="button" aria-label="Cerrar">×</button></div><p class="muted popover-description">Activa o desactiva cada tipo de actividad.</p><div class="activity-settings-grid">${['likes','bits','follows','joins','shares','subscriptions','raids','hosts','gifts','superfan','system'].map(k=>`<label><input type="checkbox" data-activity-visibility="${k}" ${(settings.personalization?.eventVisibility?.[k]??true)!==false?'checked':''}><span>${({likes:'Like',bits:'💎',follows:'Seguidores',joins:'Se unió al directo',shares:'Compartió',subscriptions:'Suscripciones',raids:'Raids',hosts:'Hosts',gifts:'Envió regalo',superfan:'Superfan',system:'Otros eventos'})[k]}</span><em>${({likes:'❤️',bits:'💎',follows:'👤',joins:'👻',shares:'🗣️',subscriptions:'⭐',raids:'🚀',hosts:'📣',gifts:'🎁',superfan:'🌟',system:'•'})[k]}</em></label>`).join('')}</div></div></div></section></div>`;
    const cf=$('dashChatFilter');cf.value=settings.filters.chat||'all';cf.onchange=()=>{settings.filters.chat=cf.value;renderDashboard(true);};
    const af=$('dashActivityFilter');af.value=settings.filters.activity||'all';af.onchange=()=>{settings.filters.activity=af.value;updateDashboardFeeds();};
    const popup=$('dashActivityPopup'); const toggleActivitySettings=(open)=>{if(!popup)return;popup.hidden=!open;document.body.classList.toggle('activity-settings-open',open);};
    $('dashActivitySettings')?.addEventListener('click',()=>toggleActivitySettings(popup.hidden)); $('closeActivitySettings')?.addEventListener('click',()=>toggleActivitySettings(false)); popup?.querySelector('[data-close-activity-settings]')?.addEventListener('click',()=>toggleActivitySettings(false));
    popup?.querySelectorAll('[data-activity-visibility]').forEach(input=>input.addEventListener('change',async()=>{const key=input.dataset.activityVisibility;settings.personalization.eventVisibility=settings.personalization.eventVisibility||{};settings.personalization.eventVisibility[key]=input.checked;try{await persistSettingsPatch({personalization:settings.personalization},false);}catch(e){toast('No se guardó',e.message,'err');}updateDashboardFeeds();}));
    const chatBox=$('dashChat'), activityBox=$('dashActivity'); const activityDirectionNow=settings.personalization?.eventsDirection || 'down'; chatBox.dataset.signature=chat.map(x=>eventFingerprint(x,'chat')).join('|'); activityBox.dataset.signature=activity.map(x=>eventFingerprint(x,'activity')).join('|'); activityBox.dataset.direction=activityDirectionNow; bindDashboardChatScroll(chatBox,chatDirection); bindDashboardActivityScroll(activityBox,'activity',activityDirectionNow); queueAvatarImages(); requestAnimationFrame(()=>{placeDashboardChat(chatBox,chatDirection,true);placeDashboardActivity(activityBox,'activity',activityDirectionNow,true,true);});
    if(settings.personalization?.autoClearChat===true) dashboardClearTimer=setInterval(updateDashboardFeeds,1000);
  }

  function invalidatePlatformSession(platform){
    const key=String(platform||'').toLowerCase();
    if(!state.accounts[key]) state.accounts[key]={};
    state.accounts[key]={...state.accounts[key],connected:false,live:false,mode:'saved',connectionId:''};
    renderTop();
    updateDashboardConnectionStatus();
  }

  function waitForSocketReady(timeoutMs=9000){
    if(socket?.connected) return Promise.resolve(socket);
    if(!socket) setupSocket();
    return new Promise((resolve, reject) => {
      const current = socket;
      if(current?.connected) return resolve(current);
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('No se pudo establecer la conexión con StreamFusion.'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        current?.off('connect', onConnect);
        current?.off('connect_error', onError);
      };
      const onConnect = () => { cleanup(); resolve(current); };
      const onError = (err) => { cleanup(); reject(err instanceof Error ? err : new Error(err?.message || 'No se pudo conectar.')); };
      current?.once('connect', onConnect);
      current?.once('connect_error', onError);
    });
  }

  async function connectPlatform(platform, inputId, emitEvent, buttonId){
    const input=$(inputId);
    const button=$(buttonId);
    const value=String(input?.value || '').trim();
    if(!value){ toast(platform==='tiktok'?'TikTok':'Twitch', `Escribe ${platform==='tiktok'?'@usuario':'el canal'} antes de conectar.`, 'err'); input?.focus(); return; }
    const original=button?.textContent || 'Conectar';
    if(button){ button.disabled=true; button.dataset.connecting='true'; button.textContent='Conectando…'; }
    try{
      invalidatePlatformSession(platform);
      const ready=await waitForSocketReady();
      ready.emit(emitEvent, value, (ack) => {
        if(ack?.ok){ toast(platform==='tiktok'?'TikTok':'Twitch', ack.message || 'Conexión iniciada.'); }
        else if(ack?.error){ toast('Conexión', ack.error, 'err'); }
      });
    }catch(err){
      toast('Conexión', err?.message || 'No se pudo iniciar la conexión.', 'err');
      if(button){ button.disabled=false; button.removeAttribute('data-connecting'); button.textContent=original; }
      return;
    }
    setTimeout(()=>{ if(button){ button.disabled=false; button.removeAttribute('data-connecting'); button.textContent=original; } }, 12000);
  }

  function renderConnections() {
    const card = (platform, label, placeholder) => {
      const a=state.accounts[platform]||{};
      const saved = settings.connectionProfiles?.[platform] || {};
      const profile = { ...saved, ...a, avatarUrl: a.avatarUrl || saved.avatarUrl };
      const accountAvatar = connectedAccountAvatarUrl(platform, profile);
      return `<article class="card connection-card"><div class="connection-top"><span class="connection-avatar">${accountAvatar ? `<img src="${esc(accountAvatar)}" alt="">` : `<span class="account-avatar-initial large">${platform==='tiktok'?'TT':'TW'}</span>`}</span><div><p class="eyebrow">${label.toUpperCase()}</p><h3>${esc(profile.username || 'Sin conectar')}</h3><span class="status ${a.connected?'on':'off'}"><i></i>${a.connected?(a.live?'En directo':'Conectado'):'Desconectado'}</span></div></div><label>Cuenta<input id="${platform}Input" value="${esc(profile.username||'')}" placeholder="${placeholder}"></label><div class="row"><button class="btn primary" id="${platform}Connect">Conectar</button><button class="btn secondary" id="${platform}Disconnect">Desconectar</button></div><p class="muted">La foto de esta cuenta se conserva aunque desconectes el canal y se actualiza al conectar otro usuario.</p></article>`;
    };
    $('view').innerHTML=`<div class="intro"><h2>Conecta tus canales</h2><p>La conexión es compartida por el sistema; el chat, eventos y overlays utilizan la misma fuente de eventos, pero conservan diseños independientes.</p></div><div class="connection-grid">${card('tiktok','TikTok','@usuario')}${card('twitch','Twitch','canal')}</div><div class="notice">El avatar mostrado aquí se resuelve desde la plataforma cuando está disponible. La foto también se reutiliza en la barra superior y en los mensajes del dashboard.</div>`;
    $('tiktokConnect').onclick=()=>connectPlatform('tiktok','tiktokInput','connectTikTok','tiktokConnect');
    $('tiktokDisconnect').onclick=async()=>{try{const ready=await waitForSocketReady();ready.emit('disconnectTikTok');}catch(err){toast('TikTok',err?.message||'No se pudo desconectar.','err');}};
    $('twitchConnect').onclick=()=>connectPlatform('twitch','twitchInput','connectTwitch','twitchConnect');
    $('twitchDisconnect').onclick=async()=>{try{const ready=await waitForSocketReady();ready.emit('disconnectTwitch');}catch(err){toast('Twitch',err?.message||'No se pudo desconectar.','err');}};
  }

  const markSelectedOption = (opts, value) => {
    const wanted = String(value ?? '');
    return String(opts || '').replace(/<option\b([^>]*)value=(\"|')([^\"']*)(\"|')([^>]*)>/gi, (full, before, q1, optionValue, q2, after) => {
      const clean = String(optionValue);
      const withoutSelected = `${before} ${after}`.replace(/\sselected(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?/gi, '');
      return `<option${withoutSelected} value=\"${esc(clean)}\"${clean === wanted ? ' selected' : ''}>`;
    });
  };
  const ctl = (label,id,type,value,opts='') => type==='check'
    ? `<label class="toggle"><input id="${id}" type="checkbox" ${value?'checked':''}><span>${label}</span></label>`
    : `<label>${label}<${type==='select'?'select':'input'} id="${id}" class="select" ${type==='input' ? `type="${typeof value === 'number' ? 'number' : /^#[0-9a-f]{6}$/i.test(String(value)) ? 'color' : 'text'}" value="${esc(value ?? '')}"` : ''}>${type==='select'?markSelectedOption(opts,value):''}</${type==='select'?'select':'input'}></label>`;
  const setSelect = (id, value) => { const el=$(id); if(el && el.tagName==='SELECT') el.value=String(value ?? ''); };
  const setCheck = (id, value) => { const el=$(id); if(el && el.type==='checkbox') el.checked=Boolean(value); };


  function previewSeed() {
    if (!state.previewChat.length) {
      const base = Date.now() - 3000;
      state.previewChat = [
        {preview:true,platform:'tiktok',displayName:'LunaByte',username:'lunabyte',uniqueId:'lunabyte',badges:['verified'],message:'¡Se ve genial este diseño!',timestamp:base},
        {preview:true,platform:'twitch',displayName:'MauroLive',username:'maurolive',uniqueId:'maurolive',badges:['subscriber'],message:'Saludos desde Twitch 👋',timestamp:base + 1000},
        {preview:true,platform:'tiktok',displayName:'Sofi_gg',username:'sofi_gg',uniqueId:'sofi_gg',message:'¿Podemos probar otra fuente?',timestamp:base + 2000}
      ];
    }
    return state.previewChat;
  }


  function orderedItems(items, direction='down') {
    const ordered = items.map((item,index)=>({item,index})).sort((a,b)=>{
      const ta=Number(a.item?.timestamp||0), tb=Number(b.item?.timestamp||0);
      return ta === tb ? a.index - b.index : ta - tb;
    }).map(x=>x.item);
    return direction === 'up' ? ordered.reverse() : ordered;
  }

  function chatPreviewHtml() {
    const direction = settings.personalization?.chatDirection || 'down';
    const list=previewSeed().slice();
    if(settings.voiceBot?.power?.enabled){ const base=Number(list[list.length-1]?.timestamp||Date.now())+1000; list.push({preview:true,platform:'tiktok',displayName:'FuegoUser',username:'fuegouser',uniqueId:'fuegouser',badges:['voice-power'],message:`${settings.voiceBot?.power?.commandPrefix||'.'}Goku ¡Hola chat!`,timestamp:base}); }
    const chatHtml=orderedItems(list, direction).map(x=>messageRow(x)).join('');
    return chatHtml;
  }

  let customizePreviewSignature = '';
  const previewScrollState = new WeakMap();
  function previewScrollIsPinned(box, direction) { const threshold=32; return direction==='up' ? box.scrollTop<=threshold : box.scrollHeight-box.scrollTop-box.clientHeight<=threshold; }
  function previewScrollStateFor(box,direction){ let state=previewScrollState.get(box); if(!state){state={pinned:true,initialized:false,manual:false,manualAt:0,programmatic:false,top:0,direction};previewScrollState.set(box,state);} state.direction=direction; return state; }
  function applyPreviewScroll(box,direction,mode='auto',newestChanged=false){
    const state=previewScrollStateFor(box,direction);
    if(mode==='capture'){ state.pinned=previewScrollIsPinned(box,direction); state.top=box.scrollTop; previewScrollState.set(box,state); return state; }
    const shouldFollow=mode==='force'||!state.initialized||state.pinned||(newestChanged&&(!state.manual||Date.now()-state.manualAt>=SMART_SCROLL_IDLE_MS));
    state.programmatic=true;
    requestAnimationFrame(()=>{
      if(shouldFollow) box.scrollTop=direction==='up'?0:box.scrollHeight; else box.scrollTop=Math.min(state.top,Math.max(0,box.scrollHeight-box.clientHeight));
      requestAnimationFrame(()=>{state.programmatic=false;state.initialized=true;if(shouldFollow){state.pinned=true;state.manual=false;state.pendingNewest=false;}previewScrollState.set(box,state);});
    });
    return state;
  }
  function bindPreviewScrollTracking(box, direction) {
    if (!box) return;
    box.dataset.scrollDirection = direction;
    if (box.dataset.scrollTracking === '1') return;
    box.dataset.scrollTracking = '1';
    box.addEventListener('scroll', () => {
      const currentDirection=box.dataset.scrollDirection||'down';
      const state=previewScrollStateFor(box,currentDirection);
      if(!state.programmatic){state.manual=true;state.manualAt=Date.now();state.top=box.scrollTop;}
      state.pinned=previewScrollIsPinned(box,currentDirection); state.initialized=true; state.direction=currentDirection;
      if(state.pinned){state.manual=false;state.pendingNewest=false;}
      previewScrollState.set(box,state);
    }, {passive:true});
  }
  function renderCustomizePreviewOnly({force=false}={}) {
    const box=$('liveCustomizePreview'); if(!box) return;
    const p=settings.personalization||{};
    let html='';
    let className='live-custom-preview activity-preview-stage';
    if (activeCustomizeTab==='chat') {
      html=chatPreviewHtml();
      className=`live-custom-preview chat-preview-stage layout-${p.chatLayout || 'vertical'} direction-${p.chatDirection || 'down'}`;
    } else {
      html=previewActivityCard(activeCustomizeTab);
    }
    const signature=[activeCustomizeTab,JSON.stringify(p),state.previewEventIndex,state.previewGiftIndex,state.previewChat.length,0,state.previewEvents.length,state.previewGifts.length].join('|');
    const newestPreviewKey=activeCustomizeTab==='chat'?(state.previewChat.length?eventFingerprint(state.previewChat[state.previewChat.length-1],'chat'):''):(activeCustomizeTab==='events'?(state.previewEvents.length?eventFingerprint(state.previewEvents[state.previewEvents.length-1],'activity'):''):(state.previewGifts.length?eventFingerprint(state.previewGifts[state.previewGifts.length-1],'activity'):''));
    const newestPreviewChanged=newestPreviewKey!==String(box.dataset.newestKey||'');
    if(!force && signature===customizePreviewSignature) return;
    const direction = activeCustomizeTab==='chat' ? (p.chatDirection || 'down') : activeCustomizeTab==='events' ? (p.eventsDirection || 'down') : (p.giftsDirection || 'down');
    const previousState = previewScrollStateFor(box,direction);
    const previousScrollBox = box.querySelector('.activity-preview-stack') || box;
    bindPreviewScrollTracking(previousScrollBox, direction);
    if (previousState.direction && previousState.direction !== direction) {
      previousState.initialized=false; previousState.pinned=true; previousState.manual=false; previousState.manualAt=0; previousState.top=0;
    } else if (previousState.initialized) {
      applyPreviewScroll(previousScrollBox, direction, 'capture');
    }
    previousState.direction=direction;
    previewScrollState.set(box,previousState);
    box.className=className+' preview-no-flash';
    box.dataset.theme=p.chatTheme||'cloud';
    const frag=document.createRange().createContextualFragment(html);
    box.replaceChildren(frag);
    const scrollBox = box.querySelector('.activity-preview-stack') || box;
    bindPreviewScrollTracking(scrollBox, direction);
    customizePreviewSignature=signature;
    queueAvatarImages(box);
    requestAnimationFrame(()=>{
      applyPreviewScroll(scrollBox, direction, force && !previousState.initialized ? 'force' : 'auto', newestPreviewChanged);
      box.dataset.newestKey=newestPreviewKey;
      box.classList.remove('preview-no-flash');
    });
  }

  const chatSimulationTimers = new Map();
  let chatSimulationSequence = 0;
  function simulatePreviewMessage() {
    const examples = [
      {platform:'tiktok',displayName:'LunaByte',username:'lunabyte',uniqueId:'lunabyte',message:'¡Hola chat! 👋',initials:'LB'},
      {platform:'twitch',displayName:'MauroLive',username:'maurolive',uniqueId:'maurolive',message:'Saludos a todos',initials:'ML'},
      {platform:'tiktok',displayName:'Sofi_gg',username:'sofi_gg',uniqueId:'sofi_gg',message:'¿Podemos probar otra fuente?',initials:'SG'},
      {platform:'twitch',displayName:'RexPlay',username:'rexplay',uniqueId:'rexplay',message:'Buen directo 🔥',initials:'RP'},
      {platform:'tiktok',displayName:'NekoLive',username:'nekolive',uniqueId:'nekolive',message:'Qué buena configuración',initials:'NL'}
    ];
    const next={preview:true,...examples[chatSimulationSequence++ % examples.length],timestamp:Date.now(),action:'Comentario'};
    state.previewChat=[...(state.previewChat||[]),next].slice(-24);
    // Los mensajes simulados del Chat son persistentes dentro de la sesión de preview.
    // Solo se eliminan si el usuario reinicia la preview, cambia de conjunto o recarga la página.
    renderCustomizePreviewOnly({force:true});
  }


  let activeCustomizeSection = 'appearance';

  const customizeFields = {
    eStyle:['personalization','eventStyle'], eSimulation:['personalization','eventSimulationMode'], gStyle:['personalization','giftStyle'], gSimulation:['personalization','giftSimulationMode'],
    // Chat
    cTheme:['personalization','chatTheme'], cFont:['personalization','font'], cAvatar:['personalization','avatarFrame'],
    cBubble:['personalization','bubbleFrame'], cAvatarSize:['personalization','avatarSize'], cNameSize:['personalization','nameSize'],
    cNameWeight:['personalization','nameWeight'], cTextColor:['personalization','textColor'], cAnim:['personalization','animation'],
    cDirection:['personalization','chatDirection'], cLayout:['personalization','chatLayout'], cAdjust:['personalization','chatAdjustMessages'],
    cBadges:['personalization','showBadges'], cActivity:['personalization','showActivity'], cAutoClear:['personalization','autoClearChat'],
    cClearSeconds:['personalization','clearChatSeconds'], cPlatformPill:['personalization','showPlatformPill'], cTimestamp:['personalization','showTimestamps'],
    cShowEmotes:['personalization','showEmotes'], cBubbleRadius:['personalization','bubbleRadius'], cAvatarBorder:['personalization','avatarBorderWidth'],
    cMessagePadding:['personalization','messagePadding'], cRowGap:['personalization','rowGap'], cTikName:['personalization','tiktokNameColor'], cTwitchName:['personalization','twitchNameColor'],
    // Eventos
    eLayout:['personalization','eventsLayout'], eDirection:['personalization','eventsDirection'], eMode:['personalization','eventsMode'],
    eSize:['personalization','eventsPanelSize'], eShape:['personalization','eventsOverlayShape'], eSide:['personalization','eventsOverlayCardSide'], eFrame:['personalization','eventsCardFrame'],
    eLikes:['personalization','eventVisibility','likes'], eFollows:['personalization','eventVisibility','follows'], eJoins:['personalization','eventVisibility','joins'],
    eShares:['personalization','eventVisibility','shares'], eSuperfan:['personalization','eventVisibility','superfan'], eSystem:['personalization','eventVisibility','system'], eGifts:['personalization','eventVisibility','gifts'],
    eSubs:['personalization','eventVisibility','subscriptions'], eBits:['personalization','eventVisibility','bits'], eRaids:['personalization','eventVisibility','raids'], eHosts:['personalization','eventVisibility','hosts'],
    eHighlight:['personalization','overlayEventHighlightStyle'], eFont:['personalization','overlayEventFont'], eUser:['personalization','highlightEventUsername'], eGiftHi:['personalization','highlightGifts'],
    // Regalos
    gLayout:['personalization','giftsLayout'], gDirection:['personalization','giftsDirection'], gMode:['personalization','giftsMode'], gSize:['personalization','giftsPanelSize'],
    gShape:['personalization','giftsOverlayShape'], gSide:['personalization','giftsOverlayCardSide'], gFrame:['personalization','giftsCardFrame'], gImage:['personalization','overlayGiftImageSize'],
    gDisplay:['personalization','overlayGiftDisplayMode'], gComposition:['personalization','overlayGiftCompositionMode'], gNameMode:['personalization','overlayNameColorMode'],
    gNameColor:['personalization','overlayNameColor'], gHighlight:['personalization','giftHighlightStyle'], gFont:['personalization','overlayGiftFont'], gShowActivity:['personalization','showGifts'], gAmount:['personalization','giftAmountStyle']
  };

  function setPathValue(target, path, value) {
    let cursor = target;
    for (let i=0;i<path.length-1;i++) cursor = cursor[path[i]] ||= {};
    cursor[path[path.length-1]] = value;
  }

  function getPathValue(target, path) {
    return path.reduce((acc, key) => acc == null ? undefined : acc[key], target);
  }

  function customizeControlValue(id, el) {
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (['cClearSeconds','cBubbleRadius','cAvatarBorder','cMessagePadding','cRowGap'].includes(id)) value = Math.max(0, Number(value || 0));
    if (['eLikes','eFollows','eJoins','eShares','eSystem','eGifts','eSubs','eBits','eRaids','eHosts','eUser','eGiftHi','gShowActivity'].includes(id)) value = Boolean(value);
    return value;
  }

  function bindCustomizeInputs() {
    document.querySelectorAll('#customControls select,#customControls input').forEach(el => el.addEventListener('change', async () => {
      const path = customizeFields[el.id]; if (!path) return;
      const value = customizeControlValue(el.id, el);
      const patch = { personalization:{} };
      setPathValue(patch.personalization, path.slice(1), value);
      settings = merge(settings, patch);
      saveCustomizationSnapshot();
      applyAppearance();
      if(path[1]==='eventStyle' || path[1]==='giftStyle' || path[1]==='eventSimulationMode' || path[1]==='giftSimulationMode'){
        try { localStorage.setItem('sf.customize.modes.v1', JSON.stringify({eventStyle:settings.personalization.eventStyle,giftStyle:settings.personalization.giftStyle,eventSimulationMode:settings.personalization.eventSimulationMode||'single',giftSimulationMode:settings.personalization.giftSimulationMode||'single'})); } catch {}
      }
      renderCustomizePreviewOnly({force:true});
      await persistSettingsPatch(patch, false);
      if (page === 'dashboard') renderDashboard();
    }));
  }

  function customizeSubNav(category) {
    const sections = category === 'chat'
      ? [['appearance','Apariencia'],['identity','Avatares y nombres'],['message','Mensajes'],['info','Información']]
      : category === 'events'
        ? [['appearance','Apariencia'],['layout','Orden y posición'],['content','Contenido'],['highlight','Resaltado']]
        : [['appearance','Apariencia'],['layout','Orden y posición'],['gift','Regalo'],['text','Texto'],['highlight','Resaltado']];
    if (!sections.some(([key]) => key === activeCustomizeSection)) activeCustomizeSection = sections[0][0];
    return `<div class="custom-subnav">${sections.map(([key,label])=>`<button type="button" class="custom-subtab ${activeCustomizeSection===key?'active':''}" data-custom-section="${key}">${label}</button>`).join('')}</div>`;
  }

  function chatControls(p) {
    if (activeCustomizeSection==='identity') return `<div class="custom-control-grid">
      ${ctl('Marco avatar','cAvatar','select',p.avatarFrame,'<option value="platform">Plataforma</option><option value="ring">Anillo</option><option value="role">Rol</option><option value="none">Sin marco</option>')}
      ${ctl('Tamaño avatar','cAvatarSize','select',p.avatarSize,'<option value="sm">Pequeño</option><option value="md">Medio</option><option value="lg">Grande</option>')}
      ${ctl('Grosor del marco','cAvatarBorder','input',p.avatarBorderWidth ?? 2)}
      ${ctl('Tamaño del nombre','cNameSize','select',p.nameSize,'<option value="sm">Pequeño</option><option value="md">Medio</option><option value="lg">Grande</option>')}
      ${ctl('Peso del nombre','cNameWeight','select',p.nameWeight,'<option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra Bold</option><option value="900">Black</option>')}
      ${ctl('Color nombre TikTok','cTikName','select',p.tiktokNameColor||'white','<option value="white">Blanco</option><option value="real">Rosa TikTok</option>')}
      ${ctl('Color nombre Twitch','cTwitchName','select',p.twitchNameColor||'real','<option value="real">Morado Twitch</option><option value="white">Blanco</option>')}
    </div>`;
    if (activeCustomizeSection==='message') return `<div class="custom-control-grid">
      ${ctl('Marco comentario','cBubble','select',p.bubbleFrame,'<option value="platform">Plataforma</option><option value="role">Rol</option><option value="none">Sin marco</option>')}
      ${ctl('Radio de burbuja','cBubbleRadius','input',p.bubbleRadius ?? 12)}
      ${ctl('Color del mensaje','cTextColor','select',p.textColor||'auto','<option value="auto">Automático</option><option value="#ffffff">Blanco</option><option value="#d9d9e4">Gris claro</option><option value="#ffd76e">Dorado</option><option value="#9fe8ff">Celeste</option>')}
      ${ctl('Espaciado interno','cMessagePadding','input',p.messagePadding ?? 7)}
      ${ctl('Ajustar mensajes largos','cAdjust','check',p.chatAdjustMessages !== false)}
      ${ctl('Mostrar insignias','cBadges','check',p.showBadges !== false)}
      ${ctl('Mostrar emotes','cShowEmotes','check',p.showEmotes !== false)}
    </div>`;
    if (activeCustomizeSection==='info') return `<div class="custom-control-grid">
      ${ctl('Mostrar plataforma TT / TW','cPlatformPill','check',p.showPlatformPill !== false)}
      ${ctl('Mostrar hora','cTimestamp','check',p.showTimestamps !== false)}
      ${ctl('Mostrar actividad','cActivity','check',p.showActivity !== false)}
      ${ctl('Auto limpiar chat','cAutoClear','check',p.autoClearChat)}
      ${ctl('Segundos para limpiar','cClearSeconds','input',p.clearChatSeconds || 30)}
    </div>`;
    return `<div class="custom-control-grid">
      ${ctl('Tema','cTheme','select',p.chatTheme,'<option value="cloud">Cloud</option><option value="minimal">Minimal</option><option value="neon">Neon</option><option value="aurora">Aurora</option>')}
      ${ctl('Tipo de letra','cFont','select',p.font||'inter','<option value="inter">Inter / Manrope</option><option value="poppins">Poppins</option><option value="montserrat">Montserrat</option><option value="oswald">Oswald</option><option value="system">Sistema</option>')}
      ${ctl('Dirección','cDirection','select',p.chatDirection,'<option value="down">Más reciente abajo</option><option value="up">Más reciente arriba</option>')}
      ${ctl('Distribución','cLayout','select',p.chatLayout,'<option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>')}
      ${ctl('Animación','cAnim','select',p.animation,'<option value="slide">Slide</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="none">Sin animación</option>')}
      ${ctl('Separación entre mensajes','cRowGap','input',p.rowGap ?? 5)}
    </div>`;
  }

  function eventControls(p) {
    const v=p.eventVisibility||{};
    if (activeCustomizeSection==='appearance') return `<div class="custom-control-grid">
      ${ctl('Estilo','eStyle','select',p.eventStyle||'chat','<option value="chat">Chat</option><option value="stream">Stream</option>')}
      ${ctl('Simulación','eSimulation','select',p.eventSimulationMode||'single','<option value="single">1 evento por usuario</option><option value="all">Todos los eventos</option>')}
    </div>`;
    if (activeCustomizeSection==='layout') return `<div class="custom-control-grid">
      ${ctl('Distribución','eLayout','select',p.eventsLayout,'<option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>')}
      ${ctl('Dirección','eDirection','select',p.eventsDirection,'<option value="down">Más reciente abajo</option><option value="up">Más reciente arriba</option>')}
      ${ctl('Animación','eMode','select',p.eventsMode,'<option value="slide">Slide</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="static">Estática</option>')}
      ${ctl('Tamaño del panel','eSize','select',p.eventsPanelSize,'<option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option>')}
      ${ctl('Forma','eShape','select',p.eventsOverlayShape,'<option value="normal">Normal</option><option value="rounded">Redondeada</option><option value="pill">Píldora</option>')}
      ${ctl('Posición del contenido','eSide','select',p.eventsOverlayCardSide,'<option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>')}
      ${ctl('Marco','eFrame','check',p.eventsCardFrame !== false)}
    </div>`;
    if (activeCustomizeSection==='content') return `<div class="custom-control-grid">
      ${ctl('Likes','eLikes','check',v.likes !== false)} ${ctl('Seguidores','eFollows','check',v.follows !== false)} ${ctl('Entradas','eJoins','check',v.joins !== false)}
      ${ctl('Compartidos','eShares','check',v.shares !== false)} ${ctl('Superfan','eSuperfan','check',v.superfan !== false)} ${ctl('Sistema','eSystem','check',v.system !== false)} ${ctl('Raids','eRaids','check',v.raids !== false)} ${ctl('Hosts','eHosts','check',v.hosts !== false)}
      <div class="custom-hint"><strong>Bits y suscripciones</strong><span>En Twitch se muestran exclusivamente en Regalos porque representan apoyo económico.</span></div>
    </div>`;
    if (activeCustomizeSection==='highlight') return `<div class="custom-control-grid">
      ${ctl('Estilo de resaltado','eHighlight','select',p.overlayEventHighlightStyle,'<option value="platform">Plataforma</option><option value="accent">Acento</option><option value="gold">Dorado</option><option value="none">Ninguno</option>')}
      ${ctl('Fuente del evento','eFont','select',p.overlayEventFont||'inherit','<option value="inherit">Heredada</option><option value="inter">Inter</option><option value="poppins">Poppins</option><option value="montserrat">Montserrat</option><option value="oswald">Oswald</option><option value="roboto">Roboto</option><option value="nunito">Nunito</option><option value="lato">Lato</option><option value="opensans">Open Sans</option><option value="system">Sistema</option>')}
      ${ctl('Resaltar usuario','eUser','check',p.highlightEventUsername !== false)}
      ${ctl('Resaltar regalos en eventos','eGiftHi','check',p.highlightGifts !== false)}
    </div>`;
    return `<div class="custom-control-grid"><div class="custom-hint"><strong>Vista de eventos</strong><span>Configura cómo se sienten visualmente los avisos de actividad del Dashboard.</span></div></div>`;
  }

  function giftControls(p) {
    if (activeCustomizeSection==='appearance') return `<div class="custom-control-grid">
      ${ctl('Estilo','gStyle','select',p.giftStyle||'chat','<option value="chat">Chat</option><option value="stream">Stream</option>')}
      ${ctl('Simulación','gSimulation','select',p.giftSimulationMode||'single','<option value="single">1 regalo por usuario</option><option value="all">Todos los regalos</option>')}
    </div>`;
    if (activeCustomizeSection==='gift') return `<div class="custom-control-grid">
      ${ctl('Tamaño de imagen','gImage','select',p.overlayGiftImageSize,'<option value="sm">Pequeña</option><option value="md">Media</option><option value="lg">Grande</option>')}
      ${ctl('Mostrar regalo','gDisplay','select',p.overlayGiftDisplayMode,'<option value="full">Imagen + nombre + cantidad</option><option value="image">Solo imagen</option><option value="text">Solo texto</option>')}
      ${ctl('Composición','gComposition','select',p.overlayGiftCompositionMode,'<option value="vertical-centered">Vertical centrada</option><option value="horizontal">Horizontal</option><option value="image-left">Imagen a la izquierda</option>')}
    </div>`;
    if (activeCustomizeSection==='text') return `<div class="custom-control-grid">
      ${ctl('Color del nombre','gNameMode','select',p.overlayNameColorMode,'<option value="platform">Según plataforma</option><option value="custom">Personalizado</option>')}
      ${ctl('Color personalizado','gNameColor','input',p.overlayNameColor||'#ffffff')}
      ${ctl('Estilo de cantidad','gAmount','select',p.giftAmountStyle||'accent','<option value="accent">Acento</option><option value="muted">Suave</option><option value="bold">Negrita</option>')}
      ${ctl('Mostrar actividad asociada','gShowActivity','check',p.showGifts !== false)}
    </div>`;
    if (activeCustomizeSection==='highlight') return `<div class="custom-control-grid">
      ${ctl('Resaltado','gHighlight','select',p.giftHighlightStyle,'<option value="gold">Dorado</option><option value="platform">Plataforma</option><option value="accent">Acento</option><option value="none">Ninguno</option>')}
      ${ctl('Fuente del regalo','gFont','select',p.overlayGiftFont||'inherit','<option value="inherit">Heredada</option><option value="inter">Inter</option><option value="poppins">Poppins</option><option value="montserrat">Montserrat</option><option value="oswald">Oswald</option><option value="roboto">Roboto</option><option value="nunito">Nunito</option><option value="lato">Lato</option><option value="opensans">Open Sans</option><option value="system">Sistema</option>')}
    </div>`;
    return `<div class="custom-control-grid">
      ${ctl('Distribución','gLayout','select',p.giftsLayout,'<option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>')}
      ${ctl('Dirección','gDirection','select',p.giftsDirection,'<option value="down">Más reciente abajo</option><option value="up">Más reciente arriba</option>')}
      ${ctl('Animación','gMode','select',p.giftsMode,'<option value="slide">Slide</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="static">Estática</option>')}
      ${ctl('Tamaño del panel','gSize','select',p.giftsPanelSize,'<option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option>')}
      ${ctl('Forma','gShape','select',p.giftsOverlayShape,'<option value="normal">Normal</option><option value="rounded">Redondeada</option><option value="pill">Píldora</option>')}
      ${ctl('Posición','gSide','select',p.giftsOverlayCardSide,'<option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>')}
      ${ctl('Marco','gFrame','check',p.giftsCardFrame !== false)}
    </div>`;
  }

  function previewEventSamples() {
    if (!state.previewEventSeeds.length) {
      const base = Date.now() - 70000;
      state.previewEventSeeds = [
        {key:'follows',platform:'tiktok',user:'LunaByte',icon:'👤',type:'follow',text:'comenzó a seguirte',timestamp:base},
        {key:'likes',platform:'tiktok',user:'SofiGG',icon:'❤️',type:'like',text:'envió 1.2K likes',timestamp:base+7000},
        {key:'shares',platform:'tiktok',user:'PixelMajo',icon:'🗣️',type:'share',text:'compartió tu directo',timestamp:base+14000},
        {key:'joins',platform:'tiktok',user:'Maybe♡',icon:'👻',type:'join',text:'se unió al directo',timestamp:base+21000},
        {key:'follows',platform:'twitch',user:'JosueLopez',icon:'👤',type:'follow',text:'comenzó a seguirte en Twitch',timestamp:base+28000},
        {key:'raids',platform:'twitch',user:'RaidLeader',icon:'🚀',type:'raid',text:'hizo raid con 37 espectadores',timestamp:base+49000},
        {key:'hosts',platform:'twitch',user:'HostMaster',icon:'📣',type:'host',text:'hosteó el canal',timestamp:base+56000},
        {key:'system',platform:'twitch',user:'Nocturno',icon:'⛔',type:'ban',text:'fue baneado del canal',timestamp:base+63000},
        {key:'system',platform:'twitch',user:'Nocturno',icon:'✅',type:'unban',text:'fue desbaneado del canal',timestamp:base+70000}
      ];
    }
    return state.previewEventSeeds;
  }
  function previewGiftSamples() {
    if (!state.previewGiftSeeds.length) {
      const base = Date.now() - 50000;
      const catalog = state.tiktokGiftCatalog;
      const pick = (key, fallback) => {
        const item = lookupTikTokGift(key) || catalog.find(x=>normalizeGiftKey(x?.name)===normalizeGiftKey(key)) || fallback;
        return item;
      };
      const heart = pick('heartme', {key:'heartme',name:'Heart Me',image:'',coins:1});
      const rose = pick('rose', {key:'rose',name:'Rose',image:'',coins:1});
      state.previewGiftSeeds = [
        {platform:'tiktok',user:'LunaByte',gift:heart.name,displayNameEs:giftDisplayName(heart),giftKey:heart.key,giftImage:heart.image,amount:1,coins:heart.coins,timestamp:base},
        {platform:'tiktok',user:'SofiGG',gift:rose.name,displayNameEs:giftDisplayName(rose),giftKey:rose.key,giftImage:rose.image,amount:5,coins:rose.coins,timestamp:base+10000},
        {platform:'twitch',user:'BitMaster',gift:'Bits',giftName:'Bits',giftKey:'bits',giftEmoji:'💎',amount:100,bits:100,message:'envió 100 Bits',timestamp:base+20000,twitchGiftType:'bits'},
        {platform:'twitch',user:'SubQueen',gift:'Suscripción de regalo',giftName:'Suscripción de regalo',giftKey:'subscriptiongift',giftEmoji:'⭐',amount:5,message:'regaló 5 suscripciones',timestamp:base+30000,twitchGiftType:'subscription-gift'}
      ];
    }
    return state.previewGiftSeeds;
  }
  function previewActivityCard(kind) {
    const p=settings.personalization||{};
    const isEvents = kind === 'events';
    const direction = isEvents ? (p.eventsDirection || 'down') : (p.giftsDirection || 'down');
    const layout = isEvents ? (p.eventsLayout || 'vertical') : (p.giftsLayout || 'vertical');
    const simulationMode = isEvents ? (p.eventSimulationMode || 'single') : (p.giftSimulationMode || 'single');

    if (isEvents) {
      const samples=previewEventSamples();
      const visibility=p.eventVisibility||{};
      const available=samples.filter(x=>visibility[x.key]!==false);
      if (!available.length) return `<div class="activity-preview activity-empty-preview"><div class="activity-icon">◌</div><div class="activity-copy"><strong>No hay eventos visibles</strong><span>Activa al menos un tipo en «Contenido».</span></div></div>`;

      const selected=state.previewEvents.length ? state.previewEvents : [available[state.previewEventIndex%available.length]];
      const source = simulationMode==='all' ? selected.filter(x=>visibility[x.key]!==false) : [selected[selected.length-1] || available[0]];
      const list = orderedItems(source, direction);
      const stackClass=`activity-preview-stack activity-preview-stack-${direction} activity-preview-stack-${layout} ${simulationMode==='all'?'simulation-all':''}`;

      if ((p.eventStyle||'chat')==='chat') {
        const cards=list.map((sample,index)=>{
          const row=messageRow({preview:true,previewActivityType:sample.type,platform:sample.platform,displayName:sample.user,username:sample.user,uniqueId:sample.user,message:sample.text,action:sample.type,emoji:sample.icon,timestamp:sample.timestamp},'event');
          return `<div class="preview-activity-chat-item event-layout-${esc(layout)} event-direction-${esc(direction)} event-mode-${esc(p.eventsMode||'slide')} event-size-${esc(p.eventsPanelSize||'normal')} event-shape-${esc(p.eventsOverlayShape||'normal')} event-side-${esc(p.eventsOverlayCardSide||'center')} ${p.eventsCardFrame===false?'no-frame':''}">${row}</div>`;
        }).join('');
        return `<div class="${stackClass}">${cards}</div>`;
      }

      const cards=list.map((sample,index)=>{
        const mode=p.eventsMode||'slide'; const size=p.eventsPanelSize||'normal'; const shape=p.eventsOverlayShape||'normal';
        const highlight=p.overlayEventHighlightStyle||'platform';
        const accent=highlight==='gold'?'#f5d063':highlight==='accent'?'#9d7dff':sample.platform==='twitch'?'#9146ff':'#fe2c55';
        const userName=p.highlightEventUsername===false?'Usuario':sample.user;
        const badge = sample.type==='like'?'❤️':sample.type==='follow'?'👤':sample.type==='join'?'👻':sample.type==='share'?'🗣️':sample.type==='raid'?'🚀':sample.type==='host'?'📣':sample.type==='ban'?'⛔':sample.type==='unban'?'✅':'';
        return `<div class="activity-preview stage-events event-highlight-${esc(highlight)} event-layout-${esc(layout)} event-direction-${esc(direction)} event-mode-${esc(mode)} event-size-${esc(size)} event-shape-${esc(shape)} event-side-${esc(p.eventsOverlayCardSide||'center')} ${p.eventsCardFrame===false?'no-frame':''}" style="--activity-accent:${accent};font-family:${esc(fontFamilyName(p.overlayEventFont||p.font))}"><div class="activity-icon">${sample.icon}</div><div class="activity-copy"><small>${esc(sample.type.toUpperCase())}</small><strong>${esc(userName)}</strong>${badge?`<span class="activity-sim-badge" aria-label="Actividad">${badge}</span>`:''}<span>${esc(sample.text)}</span></div><span class="activity-platform ${sample.platform}">${sample.platform==='twitch'?'TW':'TT'}</span></div>`;
      }).join('');
      return `<div class="${stackClass}">${cards}</div>`;
    }

    const samples=previewGiftSamples();
    const selected=state.previewGifts.length ? state.previewGifts : [samples[state.previewGiftIndex%samples.length]];
    const source=simulationMode==='all' ? selected : [selected[selected.length-1] || samples[0]];
    const list=orderedItems(source,direction);
    const stackClass=`activity-preview-stack activity-preview-stack-${direction} activity-preview-stack-${layout} ${simulationMode==='all'?'simulation-all':''}`;

    if((p.giftStyle||'chat')==='chat'){
      const cards=list.map((sample,index)=>`<div class="preview-activity-chat-item gift-layout-${esc(layout)} gift-direction-${esc(direction)} gift-mode-${esc(p.giftsMode||'slide')} gift-size-${esc(p.giftsPanelSize||'normal')} gift-shape-${esc(p.giftsOverlayShape||'normal')} gift-side-${esc(p.giftsOverlayCardSide||'center')} ${p.giftsCardFrame===false?'no-frame':''}">${messageRow({preview:true,previewActivityType:sample.giftKey==='bits'?'bits':sample.giftKey==='subscriptiongift'?'subscription-gift':'gift',platform:sample.platform,displayName:sample.user,username:sample.user,uniqueId:sample.user,gift:sample.gift,giftName:sample.displayNameEs||giftDisplayName(sample),giftKey:sample.giftKey,giftImage:sample.giftImage,giftEmoji:sample.giftEmoji,amount:sample.amount,message:`${sample.displayNameEs||giftDisplayName(sample)} ×${sample.amount}`,timestamp:sample.timestamp},'gift')}</div>`).join('');
      return `<div class="${stackClass}">${cards}</div>`;
    }

    const cards=list.map(sample=>{
      const size=p.overlayGiftImageSize||'md';
      const display=p.overlayGiftDisplayMode||'full';
      const nameColor=p.overlayNameColorMode==='custom'?(p.overlayNameColor||'#ffffff'):(sample.platform==='twitch'?'#c7a2ff':'#fe6f92');
      const displayGift=sample.displayNameEs||giftDisplayName(sample);
      const title=display==='image'?displayGift:display==='text'?displayGift:`${displayGift}${p.giftAmountStyle==='muted'?'':` ×${sample.amount}`}`;
      const frame=p.giftsCardFrame===false?'no-frame':'';
      const highlight=p.giftHighlightStyle||'gold';
      const accent=highlight==='gold'?'#f5d063':highlight==='platform'?(sample.platform==='twitch'?'#9146ff':'#fe2c55'):highlight==='accent'?'#9d7dff':'transparent';
      const showActivity=p.showGifts!==false;
      return `<div class="activity-preview stage-gifts gift-highlight-${esc(highlight)} gift-layout-${esc(layout)} gift-direction-${esc(direction)} gift-mode-${esc(p.giftsMode||'slide')} gift-size-${esc(p.giftsPanelSize||'normal')} gift-shape-${esc(p.giftsOverlayShape||'normal')} gift-side-${esc(p.giftsOverlayCardSide||'center')} ${frame}" style="--activity-accent:${accent};font-family:${esc(fontFamilyName(p.overlayGiftFont||p.font))};"><div class="gift-preview-media size-${size} ${display==='text'?'hide-image':''} ${display==='image'?'only-image':''}"><span>🎁</span></div><div class="activity-copy"><small>REGALO</small>${showActivity?`<strong style="color:${esc(nameColor)}">${esc(sample.user)}</strong>`:'<strong>Regalo recibido</strong>'}<span class="gift-title">${esc(title)}</span></div><span class="activity-platform ${sample.platform}">${sample.platform==='twitch'?'TW':'TT'}</span></div>`;
    }).join('');
    return `<div class="${stackClass}">${cards}</div>`;
  }

  function customizeControlPanel() {
    const p=settings.personalization||{};
    const category=activeCustomizeTab;
    let controls = category==='chat' ? chatControls(p) : category==='events' ? eventControls(p) : giftControls(p);
    return `<section class="custom-controls-panel"><div class="custom-section-head"><div><p class="eyebrow">${category==='chat'?'CHAT DEL DASHBOARD':category==='events'?'EVENTOS':'REGALOS'}</p><h3>${category==='chat'?'Personaliza cómo se ve cada mensaje':category==='events'?'Personaliza las alertas de actividad':'Personaliza cómo aparecen los regalos'}</h3></div></div>${customizeSubNav(category)}<div id="customControls">${controls}</div></section>`;
  }

  function renderCustomize() {
    const p=settings.personalization || {};
    const categories=[['chat','💬','Chat'],['events','✨','Eventos'],['gifts','🎁','Regalos']];
    $('view').innerHTML=`<div class="intro"><h2>Personalización</h2><p>Elige qué quieres diseñar. Dentro de cada opción encontrarás categorías más específicas mientras la vista previa se mantiene fija a la derecha.</p></div>
      <div class="custom-category-tabs">${categories.map(([key,icon,label])=>`<button type="button" class="custom-category ${activeCustomizeTab===key?'active':''}" data-custom-category="${key}"><span>${icon}</span>${label}</button>`).join('')}</div>
      <div class="customizer-layout"><div id="customControlWrap">${customizeControlPanel()}</div>
        <article class="card preview-card custom-preview-panel custom-preview-sticky"><div class="preview-header"><div><p class="eyebrow">VISTA PREVIA</p><h3>${activeCustomizeTab==='chat'?'Chat del Dashboard':activeCustomizeTab==='events'?'Eventos':'Regalos'}</h3></div><span class="preview-live"><i></i> SIMULACIÓN</span></div><div id="liveCustomizePreview" class="live-custom-preview">${activeCustomizeTab==='chat'?chatPreviewHtml():previewActivityCard(activeCustomizeTab)}</div>${activeCustomizeTab==='chat'?'<div class="preview-actions"><button class="btn primary" type="button" id="simulateChatMessage">＋ Simular comentario</button><span class="muted">Simula un comentario normal del chat. No activa Puntos.</span></div>':'<div class="preview-actions"><button class="btn primary" type="button" id="simulateActivity">＋ Simular '+(activeCustomizeTab==='events'?'evento':'regalo')+'</button><span class="muted">La vista previa es independiente del directo.</span></div>'}<div class="preview-note">La vista previa no escucha eventos reales. Solo cambia al cambiar entre Chat, Eventos o Regalos.</div></article>
      </div>`;
    bindCustomizeInputs();
    document.querySelectorAll('[data-custom-category]').forEach(b=>b.onclick=()=>{activeCustomizeTab=b.dataset.customCategory;activeCustomizeSection='appearance';renderCustomize();});
    document.querySelectorAll('[data-custom-section]').forEach(b=>b.onclick=()=>{activeCustomizeSection=b.dataset.customSection;renderCustomizeControlsOnly();});
    if (activeCustomizeTab==='chat' && $('simulateChatMessage')) $('simulateChatMessage').onclick=simulatePreviewMessage;
    if (activeCustomizeTab!=='chat' && $('simulateActivity')) $('simulateActivity').onclick=simulatePreviewActivity;
    renderCustomizePreviewOnly();
  }

  function renderCustomizeControlsOnly(){
    const wrap=$('customControlWrap'); if(!wrap) return;
    wrap.innerHTML=customizeControlPanel();
    bindCustomizeInputs();
    document.querySelectorAll('[data-custom-section]').forEach(b=>b.onclick=()=>{activeCustomizeSection=b.dataset.customSection;renderCustomizeControlsOnly();});
  }

  async function simulatePreviewActivity(){
    const p=settings.personalization||{};
    if (activeCustomizeTab==='gifts') await loadTikTokGiftCatalog();
    if (activeCustomizeTab==='events') {
      const samples=previewEventSamples();
      const available=samples.filter(x=>(p.eventVisibility?.[x.key]??true)!==false);
      if(!available.length)return;
      const next={...available[state.previewEventIndex%available.length],timestamp:Date.now()};
      state.previewEventIndex=(state.previewEventIndex+1)%available.length;
      if((p.eventSimulationMode||'single')==='all'){state.previewEvents.push(next);if(state.previewEvents.length>8)state.previewEvents.shift();}
      else state.previewEvents=[next];
    }
    if (activeCustomizeTab==='gifts') {
      const samples=previewGiftSamples();
      const next={...samples[state.previewGiftIndex%samples.length],timestamp:Date.now()};
      state.previewGiftIndex=(state.previewGiftIndex+1)%samples.length;
      if((p.giftSimulationMode||'single')==='all'){state.previewGifts.push(next);if(state.previewGifts.length>8)state.previewGifts.shift();}
      else state.previewGifts=[next];
    }
    renderCustomizePreviewOnly({force:true});
  }

  async function persistSettingsPatch(patch, redraw=true) {
    try {
      const result = await api('/api/user/settings',{method:'PUT',body:JSON.stringify(patch)});
      settings=merge(settings,result);
      saveCustomizationSnapshot();
      if (patch?.personalization?.eventStyle || patch?.personalization?.giftStyle || patch?.personalization?.eventSimulationMode || patch?.personalization?.giftSimulationMode) {
        try { localStorage.setItem('sf.customize.modes.v1', JSON.stringify({eventStyle:settings.personalization.eventStyle,giftStyle:settings.personalization.giftStyle,eventSimulationMode:settings.personalization.eventSimulationMode||'single',giftSimulationMode:settings.personalization.giftSimulationMode||'single'})); } catch {}
      }
      applyAppearance(); if(redraw) render();
    } catch(e){ toast('No se guardó',e.message,'err'); }
  }

  let overlayKeyCache = '';
  async function getOverlayKey() {
    if (overlayKeyCache) return overlayKeyCache;
    const data = await api('/api/overlay/key');
    overlayKeyCache = String(data?.key || '');
    if (!overlayKeyCache) throw new Error('No se pudo preparar la conexión del overlay.');
    return overlayKeyCache;
  }
  async function buildOverlayUrl(path) {
    const key = await getOverlayKey();
    const join = path.includes('?') ? '&' : '?';
    return `${location.origin}/${path}${join}owner=${encodeURIComponent(user.id)}&overlayKey=${encodeURIComponent(key)}`;
  }
  async function openOverlay(path, name) {
    // Abrimos una ventana inmediatamente dentro del gesto del usuario para
    // evitar bloqueadores de popups y cualquier sensación de doble clic.
    let popup=null;
    try {
      popup=window.open('about:blank', name || 'streamfusionOverlay', 'popup=yes,width=1280,height=760,resizable=yes,scrollbars=yes');
      if (!popup) { toast('Ventana bloqueada','Permite ventanas emergentes para abrir el overlay.','err'); return; }
      popupWindows.add(popup);
      try { popup.document.title='StreamFusion · Cargando…'; } catch {}
      const url = await buildOverlayUrl(path);
      if (!popup.closed) popup.location.replace(url);
      try { popup.focus(); } catch {}
    } catch (e) {
      try { if(popup && !popup.closed) popup.close(); } catch {}
      toast('Overlay', e.message || 'No se pudo abrir el overlay.', 'err');
    }
  }

  function overlayCard(name, path, description) {
    return `<article class="card overlay-card"><div class="mini-preview">${name==='Ruleta'?'🎡':name==='Lista de voces'?'🎙️':name==='Chat'?'💬':'✨'}</div><p class="eyebrow">SALIDA OBS</p><h3>${esc(name)}</h3><p class="muted">${esc(description)}</p><code>${esc(path)}</code><div class="row"><button class="btn primary openPopup" data-path="${esc(path)}">Abrir ventana</button><button class="btn secondary newTab" data-path="${esc(path)}">Pestaña</button><button class="btn secondary copyLink" data-path="${esc(path)}">Copiar enlace OBS</button></div></article>`;
  }

  function renderOverlays() {
    $('view').innerHTML=`<div class="intro"><h2>Overlays</h2><p>Son salidas independientes para OBS. Solo comparten la conexión del usuario y la fuente de eventos; su diseño no se copia del dashboard.</p></div><div class="overlay-status"><span class="status-pill ${state.connection==='online'?'on':''}"><i></i>${state.connection==='online'?'Conectado al stream':'Sin conexión'}</span>${['tiktok','twitch'].map(p=>`<span class="channel-state ${isConnected(p)?'on':''}">${p==='tiktok'?'TikTok':'Twitch'} · ${isConnected(p)?'ON':'OFF'}</span>`).join('')}</div><div class="overlay-grid">${overlayCard('Chat','overlay.html','Chat overlay independiente; usa la conexión real.')}${overlayCard('Eventos','overlay.html?view=events','Eventos overlay independiente.')}${overlayCard('Regalos','overlay.html?view=gifts','Regalos overlay independiente, con imagen del regalo.')}${overlayCard('Ruleta','roulette-overlay.html','Ruleta overlay original.')}</div>`;
    document.querySelectorAll('.openPopup').forEach(b=>b.onclick=()=>openOverlay(b.dataset.path,`sf_${b.dataset.path.split('/').pop()}`));
    document.querySelectorAll('.newTab').forEach(b=>b.onclick=async()=>{ let tab=null; try { tab=window.open('about:blank','_blank','noopener'); if(!tab){toast('Overlay','Permite nuevas pestañas/ventanas para abrir el overlay.','err');return;} const url=await buildOverlayUrl(b.dataset.path); if(!tab.closed)tab.location.replace(url); } catch(e){try{if(tab&&!tab.closed)tab.close();}catch{} toast('Overlay',e.message||'No se pudo abrir el overlay.','err');} });
    document.querySelectorAll('.copyLink').forEach(b=>b.onclick=async()=>{ try { const url=await buildOverlayUrl(b.dataset.path); await navigator.clipboard?.writeText(url); toast('Enlace copiado','La URL ya incluye la conexión de tu cuenta.'); } catch(e){ toast('Copiar enlace',e.message,'err'); } });
  }

  let rouletteState={participants:[],spinning:false};
  const ROULETTE_THEME_PRESETS=[
    {id:'crystal',name:'Crystal',desc:'Hielo brillante',accent:'#74c0fc',accent2:'#e7f5ff',accent3:'#c5f6fa',cardTheme:'ocean'},
    {id:'neon',name:'Neon',desc:'Glow moderno',accent:'#9b5cff',accent2:'#22d3ee',accent3:'#f472b6',cardTheme:'neon'},
    {id:'gold',name:'Gold',desc:'Sorteo premium',accent:'#d8b35a',accent2:'#f8e3a1',accent3:'#fff4c7',cardTheme:'gold'},
    {id:'galaxy',name:'Galaxy',desc:'Cósmico y oscuro',accent:'#8b5cf6',accent2:'#38bdf8',accent3:'#ec4899',cardTheme:'midnight'},
    {id:'fire',name:'Fire',desc:'Energía intensa',accent:'#ef4444',accent2:'#f97316',accent3:'#facc15',cardTheme:'sunset'},
    {id:'ocean',name:'Ocean',desc:'Azul limpio',accent:'#38bdf8',accent2:'#22d3ee',accent3:'#60a5fa',cardTheme:'ocean'},
    {id:'emerald',name:'Emerald',desc:'Verde vibrante',accent:'#10b981',accent2:'#34d399',accent3:'#a7f3d0',cardTheme:'emerald'},
    {id:'candy',name:'Candy',desc:'Colorido suave',accent:'#f472b6',accent2:'#a78bfa',accent3:'#67e8f9',cardTheme:'candy'},
    {id:'midnight',name:'Midnight',desc:'Oscuro profesional',accent:'#64748b',accent2:'#22d3ee',accent3:'#9b5cff',cardTheme:'midnight'}
  ];
  const ROULETTE_CARD_PRESETS=[
    {id:'midnight',name:'Midnight',desc:'Negro elegante',bg1:'#111827',bg2:'#0b1020',bg3:'#1f2937'},
    {id:'royal',name:'Royal',desc:'Azul premium',bg1:'#1d4ed8',bg2:'#0f172a',bg3:'#312e81'},
    {id:'sunset',name:'Sunset',desc:'Rojo y dorado',bg1:'#ef4444',bg2:'#f97316',bg3:'#7c2d12'},
    {id:'ocean',name:'Ocean',desc:'Azul marino',bg1:'#0ea5e9',bg2:'#075985',bg3:'#0f172a'},
    {id:'emerald',name:'Emerald',desc:'Verde intenso',bg1:'#10b981',bg2:'#064e3b',bg3:'#052e16'},
    {id:'candy',name:'Candy',desc:'Rosa y violeta',bg1:'#ec4899',bg2:'#8b5cf6',bg3:'#312e81'},
    {id:'gold',name:'Gold',desc:'Premium brillante',bg1:'#d8b35a',bg2:'#8a6a2f',bg3:'#3f2d14'},
    {id:'neon',name:'Neon',desc:'Fuerte y moderno',bg1:'#9b5cff',bg2:'#22d3ee',bg3:'#0f172a'}
  ];
  function defaultRoulettePreviewConfig(){return {mode:'baraja',enabled:true,audience:'all',platforms:{tiktok:true,twitch:true},participation:{entryMode:'comment',commentMode:'custom',commentText:'1',allowMultiple:false,maxEntriesPerUser:1,spamCooldownMs:2400},winnerComment:{enabled:true,voiceBotLinked:false,waitSeconds:30},auto:{enabled:false,startWaitSeconds:60,restartWaitSeconds:180},theme:{preset:'midnight',accent:'#64748b',accent2:'#22d3ee',accent3:'#9b5cff',frame:'glass',frameColor1:'#9b5cff',frameColor2:'#22d3ee',frameColor3:'#f472b6',background:'transparent',showGrid:false,cardTheme:'midnight'}};}
  function getRoulettePreviewConfig(){
    if(!roulettePreviewConfig){
      try{
        const raw=localStorage.getItem('sf.roulette.preview.v1');
        roulettePreviewConfig=merge(defaultRoulettePreviewConfig(),raw?JSON.parse(raw):{}); roulettePreviewConfig.mode='baraja';
      }catch{roulettePreviewConfig=defaultRoulettePreviewConfig();}
    }
    return roulettePreviewConfig;
  }
  function saveRoulettePreviewConfig(){
    try{
      const savedAt=Date.now();
      roulettePreviewConfig=merge(defaultRoulettePreviewConfig(),roulettePreviewConfig||{}); roulettePreviewConfig.mode='baraja';
      roulettePreviewConfig._updatedAt=savedAt;
      localStorage.setItem('sf.roulette.preview.v1',JSON.stringify(roulettePreviewConfig));
      localStorage.setItem('sf.roulette.preview.v1.savedAt',String(savedAt));
    }catch{}
  }
  function localRoulettePreviewSavedAt(){try{return Number(localStorage.getItem('sf.roulette.preview.v1.savedAt')||roulettePreviewConfig?._updatedAt||0)||0;}catch{return 0;}}
  function serverRouletteUpdatedAt(cfg){return Number(cfg?._updatedAt||0)||0;}
  function rouletteConfigEqual(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}}
  function persistRoulettePreviewConfig(){
    const cfg=getRoulettePreviewConfig();
    if(!socket?.connected) return Promise.resolve(false);
    return new Promise(resolve=>{
      let settled=false;
      const done=(payload)=>{if(settled)return;settled=true;resolve(Boolean(payload?.ok));};
      try{
        socket.emit('roulette:update',cfg,done);
        // Safety fallback for old servers that do not ACK the event.
        setTimeout(()=>{if(!settled){settled=true;resolve(false);}},1200);
      }catch{resolve(false);}
    });
  }
  function syncRoulettePreviewConfigToServer(){
    const cfg=getRoulettePreviewConfig();
    if(!socket?.connected) return;
    try{ socket.emit('roulette:update',cfg); }catch{}
  }
  function roulettePreviewPost(message){const payload={source:'streamfusion-roulette-preview',...message};const f=$('roulettePreviewFrame');if(!f?.contentWindow){roulettePreviewPending.push(payload);return;}if(!roulettePreviewReady){roulettePreviewPending.push(payload);return;}f.contentWindow.postMessage(payload,'*');}
  function flushRoulettePreviewQueue(){const f=$('roulettePreviewFrame');if(!f?.contentWindow)return;roulettePreviewReady=true;const q=roulettePreviewPending.splice(0);q.forEach(m=>{try{f.contentWindow.postMessage(m,'*');}catch{}});}
  function roulettePreviewThemeCard(p,c,active){return `<button type="button" class="roulette-theme-choice ${active?'active':''}" data-rpreview-theme="${esc(p.id)}" style="--theme-a:${esc(p.accent)};--theme-b:${esc(p.accent2)};--theme-c:${esc(p.accent3)}"><div><strong>${esc(p.name)}</strong><span>${esc(p.desc)}</span></div><div class="roulette-theme-swatches"><i></i><i></i><i></i></div></button>`;}
  function roulettePreviewDeckCard(p,c,active){return `<button type="button" class="roulette-deck-choice ${active?'active':''}" data-rpreview-deck="${esc(p.id)}" style="--deck-a:${esc(p.bg1)};--deck-b:${esc(p.bg2)};--deck-c:${esc(p.bg3)}"><div><strong>${esc(p.name)}</strong><span>${esc(p.desc)}</span></div><div class="roulette-deck-swatch"></div></button>`;}
  function syncRoulettePreviewHistoryFromServer(){
    const serverHistory=Array.isArray(rouletteState?.state?.history)?rouletteState.state.history:[];
    if(serverHistory.length || roulettePreviewState.history?.length===0) roulettePreviewState.history=serverHistory.slice(0,30);
    const serverWinner=rouletteState?.state?.winner||null;
    if(serverWinner) roulettePreviewState.activeWinner=serverWinner;
  }
  function roulettePreviewConfigControls(){
    const c=getRoulettePreviewConfig(); c.mode='baraja'; const box=$('roulettePreviewControls');if(!box)return;let h='';
    if(roulettePreviewTab==='appearance'){       c.mode='baraja'; const activeDeck=String(c.theme?.cardTheme||'midnight');
       const visualChoices=`<div class="roulette-preview-subtitle">Temas de baraja</div><div class="roulette-deck-grid">${ROULETTE_CARD_PRESETS.map(p=>roulettePreviewDeckCard(p,c,p.id===activeDeck)).join('')}</div>`;
      h=`<div class="custom-hint"><strong>Apariencia de la ruleta</strong><span>Las opciones mostradas dependen del tipo seleccionado y se mantienen al cambiar de pestaña o volver a esta interfaz.</span></div>
        ${visualChoices}
        <div class="custom-control-grid">${ctl('Marco','rFrame','select',c.theme.frame||'glass','<option value="glass">Cristal</option><option value="solid">Sólido</option><option value="minimal">Minimal</option>')}
        ${ctl('Fondo','rBg','select',c.theme.background||'transparent','<option value="transparent">Transparente</option><option value="dark">Oscuro</option><option value="midnight">Midnight</option><option value="green">Green screen</option><option value="soft-dark">Dark soft</option><option value="light">Blanco</option>')}
        ${ctl('Mostrar rejilla','rGrid','check',c.theme.showGrid===true)}${ctl('Color principal','rAccent','input',c.theme.accent||'#64748b')}${ctl('Color secundario','rAccent2','input',c.theme.accent2||'#22d3ee')}${ctl('Color terciario','rAccent3','input',c.theme.accent3||'#9b5cff')}</div>`;
    } else if(roulettePreviewTab==='config'){
      h=`<div class="custom-control-grid">${ctl('Ruleta activa','rEnabled','check',c.enabled!==false)}
      ${ctl('Público','rAudience','select',c.audience||'all','<option value="all">Todos</option><option value="followers">Seguidores</option><option value="donors">Donadores</option><option value="likers">Likers</option>')}
      ${ctl('Modo de comentario','rCommentMode','select',c.participation?.commentMode||'custom','<option value="any">Cualquier comentario</option><option value="custom">Comentario personalizado</option>')}
      ${ctl('Texto de participación','rCommentText','input',c.participation?.commentText||'1')}
      ${ctl('Permitir múltiples','rAllowMultiple','check',c.participation?.allowMultiple===true)}
      ${ctl('Máximo por usuario','rMaxEntries','input',Number(c.participation?.maxEntriesPerUser||1))}
      ${ctl('Antispam (ms)','rSpamCooldown','input',Number(c.participation?.spamCooldownMs||2400))}</div>
      <div class="roulette-platform-pills"><span class="muted">Plataformas</span><button type="button" class="roulette-pill ${c.platforms?.tiktok!==false?'active':''}" data-rpreview-platform="tiktok">TikTok</button><button type="button" class="roulette-pill ${c.platforms?.twitch!==false?'active':''}" data-rpreview-platform="twitch">Twitch</button></div>
      <div class="custom-hint"><strong>Participación simulada</strong><span>“＋ Agregar participante” crea una entrada real dentro de esta preview y además la envía a la preview de Chat.</span></div>`;
    } else if(roulettePreviewTab==='behaviour'){
      h=`<div class="custom-control-grid">${ctl('Vincular bot de voz','rVoiceBotLinked','check',c.winnerComment?.voiceBotLinked===true)}${ctl('Esperar comentario del ganador','rWinnerCommentEnabled','check',c.winnerComment?.enabled!==false)}${ctl('Tiempo de espera (segundos)','rWinnerCommentSeconds','input',Number(c.winnerComment?.waitSeconds||30))}${ctl('Participación automática','rAutoEnabled','check',c.auto?.enabled===true)}${ctl('Iniciar automáticamente tras (s)','rAutoStart','input',Number(c.auto?.startWaitSeconds||60))}${ctl('Reiniciar después de un ganador (s)','rAutoRestart','input',Number(c.auto?.restartWaitSeconds||180))}</div>
      <div class="custom-hint"><strong>Bot de voz vinculado</strong><span>Cuando está activo, el ganador espera 30 segundos (o el tiempo elegido) y solo recibe la voz/premio cuando comenta un nombre de voz válido. Un comentario normal no completa la elección.</span></div>`;
    } else if(roulettePreviewTab==='winners'){
      const a=roulettePreviewState.history||[];
      h=`<div class="roulette-winners-head"><strong>Ganadores</strong><button type="button" class="btn secondary btn-sm" id="rouletteClearWinnerHistory" ${a.length?'':'disabled'}>Borrar historial</button></div><div class="roulette-mini-list">${a.length?a.map((w)=>`<div class="roulette-mini-row"><span>🏆</span><div><strong>${esc(w.displayName||'Ganador')}</strong><small>${esc(w.platform||'')} ${w.voiceLabel?`· 🤖 ${esc(w.voiceLabel)}`:''}</small></div><button type="button" class="roulette-delete-winner" data-delete-preview-winner="${esc(w.key||w.createdAt||'')}" title="Borrar ganador" aria-label="Borrar ganador">🗑️</button></div>`).join(''):'<div class="empty">Todavía no hay ganadores. Agrega participantes y gira la ruleta.</div>'}</div>`;
    }
    box.innerHTML=h;
    bindRoulettePreviewControls();
  }
  function bindRoulettePreviewControls(){
    const map={rEnabled:['enabled'],rFrame:['theme','frame'],rBg:['theme','background'],rGrid:['theme','showGrid'],rAccent:['theme','accent'],rAccent2:['theme','accent2'],rAccent3:['theme','accent3'],rAudience:['audience'],rCommentMode:['participation','commentMode'],rCommentText:['participation','commentText'],rAllowMultiple:['participation','allowMultiple'],rMaxEntries:['participation','maxEntriesPerUser'],rSpamCooldown:['participation','spamCooldownMs'],rVoiceBotLinked:['winnerComment','voiceBotLinked'],rWinnerCommentEnabled:['winnerComment','enabled'],rWinnerCommentSeconds:['winnerComment','waitSeconds'],rAutoEnabled:['auto','enabled'],rAutoStart:['auto','startWaitSeconds'],rAutoRestart:['auto','restartWaitSeconds']};
    const readPath=(path)=>path.reduce((obj,key)=>obj?.[key],roulettePreviewConfig);
    document.querySelectorAll('#roulettePreviewControls select').forEach(el=>{const path=map[el.id];if(path)el.value=String(readPath(path) ?? '');});
    document.querySelectorAll('#roulettePreviewControls input').forEach(el=>{const path=map[el.id];if(!path)return;const value=readPath(path);if(el.type==='checkbox')el.checked=Boolean(value);else if(el.type==='number')el.value=String(Number(value ?? 0));else if(el.type==='color')el.value=String(value || '#000000');});
    const apply=(id,{rerender=false}={})=>{if(id==='rMode') return; const path=map[id];if(!path)return;const el=$(id);if(!el)return;const value=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;let cur=roulettePreviewConfig;for(let i=0;i<path.length-1;i++)cur=cur[path[i]] ||= {};cur[path[path.length-1]]=value;saveRoulettePreviewConfig();syncRoulettePreviewConfigToServer();roulettePreviewPost({type:'config',config:roulettePreviewConfig});renderRoulettePreviewCardsOnly();if(rerender)roulettePreviewConfigControls();};
    document.querySelectorAll('#roulettePreviewControls select,#roulettePreviewControls input').forEach(el=>{el.addEventListener('change',()=>apply(el.id,{rerender:el.id==='rMode'}));el.addEventListener('input',()=>{if(el.type==='color')apply(el.id);});});
    document.querySelectorAll('[data-rpreview-theme]').forEach(btn=>btn.onclick=()=>{const preset=ROULETTE_THEME_PRESETS.find(x=>x.id===btn.dataset.rpreviewTheme);if(!preset)return;roulettePreviewConfig.theme={...roulettePreviewConfig.theme,preset:preset.id,accent:preset.accent,accent2:preset.accent2,accent3:preset.accent3};roulettePreviewConfig.mode='baraja';saveRoulettePreviewConfig();syncRoulettePreviewConfigToServer();roulettePreviewPost({type:'config',config:roulettePreviewConfig});roulettePreviewConfigControls();});
    document.querySelectorAll('[data-rpreview-deck]').forEach(btn=>btn.onclick=()=>{roulettePreviewConfig.mode='baraja';roulettePreviewConfig.theme={...roulettePreviewConfig.theme,cardTheme:String(btn.dataset.rpreviewDeck||'midnight')};saveRoulettePreviewConfig();syncRoulettePreviewConfigToServer();roulettePreviewPost({type:'config',config:roulettePreviewConfig});roulettePreviewConfigControls();});
    document.querySelectorAll('[data-rpreview-platform]').forEach(btn=>btn.onclick=()=>{const platform=String(btn.dataset.rpreviewPlatform||'');roulettePreviewConfig.platforms=roulettePreviewConfig.platforms||{tiktok:true,twitch:true};roulettePreviewConfig.platforms[platform]=!roulettePreviewConfig.platforms[platform];saveRoulettePreviewConfig();syncRoulettePreviewConfigToServer();roulettePreviewPost({type:'config',config:roulettePreviewConfig});roulettePreviewConfigControls();});
    const clearWinnerHistory=$('rouletteClearWinnerHistory'); if(clearWinnerHistory) clearWinnerHistory.onclick=()=>{roulettePreviewState.history=[];roulettePreviewState.activeWinner=null;roulettePreviewConfigControls();roulettePreviewPost({type:'historyChanged',history:[]});if(socket?.connected) socket.emit('roulette:clearWinnerHistory');};
    document.querySelectorAll('[data-delete-preview-winner]').forEach(btn=>btn.onclick=()=>{const key=String(btn.dataset.deletePreviewWinner||'');roulettePreviewState.history=(roulettePreviewState.history||[]).filter(w=>String(w.key||w.createdAt||'')!==key);if(roulettePreviewState.activeWinner && String(roulettePreviewState.activeWinner.key||roulettePreviewState.activeWinner.createdAt||'')===key) roulettePreviewState.activeWinner=null;roulettePreviewConfigControls();roulettePreviewPost({type:'historyChanged',history:roulettePreviewState.history});if(socket?.connected) socket.emit('roulette:deleteWinner',key);});
  }
  function renderRoulettePreviewCardsOnly(){
    if(roulettePreviewTab==='appearance') buildRouletteEditorDecorations();
  }
  function buildRouletteEditorDecorations(){
    document.querySelectorAll('[data-rpreview-theme]').forEach(btn=>btn.classList.toggle('active',btn.dataset.rpreviewTheme===String(getRoulettePreviewConfig().theme?.preset||'midnight')));
    document.querySelectorAll('[data-rpreview-deck]').forEach(btn=>btn.classList.toggle('active',btn.dataset.rpreviewDeck===String(getRoulettePreviewConfig().theme?.cardTheme||'midnight')));
  }
  function renderRoulette(){
    if(window.__sfRoulettePreviewMessageHandler) window.removeEventListener('message',window.__sfRoulettePreviewMessageHandler);
    window.__sfRoulettePreviewMessageHandler=(ev)=>{
      const d=ev?.data;
      if(d?.source!=='streamfusion-roulette-preview') return;
      if(d.type==='ready'){ flushRoulettePreviewQueue(); return; }
      if(d.type==='result'){
        const winner=d.winner||null;
        if(winner){
          roulettePreviewState.history=[...(roulettePreviewState.history||[]),winner].slice(-30);
          roulettePreviewState.participants=roulettePreviewState.participants||[];
          roulettePreviewState.activeWinner=winner;
        }
        // Never rebuild the iframe just because a tab/result changed.
        // The preview is one persistent scene; only the editor panel changes.
        if(roulettePreviewTab==='winners') roulettePreviewConfigControls();
        const count=$('roulettePreviewParticipantCount');
        if(count) count.textContent=`${roulettePreviewState.participants?.length||0} participante${(roulettePreviewState.participants?.length||0)===1?'':'s'}`;
        return;
      }
      if(d.type==='participantComment'){
        const participant=d.participant||{};
        const message=String(d.comment||participant.comment||getRoulettePreviewConfig().participation?.commentText||'1').trim()||'1';
        const entry={...participant,comment:message};
        const key=String(entry.key||`${entry.platform||'tiktok'}:${entry.uniqueId||entry.username||entry.displayName||''}`);
        const current=roulettePreviewState.participants||[];
        if(!current.some(p=>String(p.key)===key)) roulettePreviewState.participants=[...current,entry].slice(-100);
        const chatEntry={preview:true,platform:participant.platform||'tiktok',displayName:participant.displayName||participant.username||'Participante',username:participant.username||participant.uniqueId||'participante',uniqueId:participant.uniqueId||participant.username||'participante',message,timestamp:Date.now(),rouletteParticipant:true};
        state.previewChat=[...(state.previewChat||[]),chatEntry].slice(-24);
        if(page==='customize' && activeCustomizeTab==='chat') renderCustomizePreviewOnly({force:true});
        if(roulettePreviewTab==='config'||roulettePreviewTab==='winners') roulettePreviewConfigControls();
        const count=$('roulettePreviewParticipantCount');
        if(count) count.textContent=`${roulettePreviewState.participants?.length||0} participante${(roulettePreviewState.participants?.length||0)===1?'':'s'}`;
      }
    };
    window.addEventListener('message',window.__sfRoulettePreviewMessageHandler);
    roulettePreviewReady=false;
    roulettePreviewPending=[];
    const c=getRoulettePreviewConfig();
    const tabs=[['appearance','Apariencia'],['config','Configuración'],['behaviour','Comportamiento'],['winners','Ganadores']];
    if(socket?.connected) socket.emit('roulette:getState');
    const names=['LunaByte','MauroLive','SofiGG','PixelMajo','RafaFPS','NubeStudio','KiraLive'];
    $('view').innerHTML=`<div class="intro split"><div><p class="eyebrow">DINÁMICA</p><h2>Ruleta</h2><p>Configura la ruleta desde aquí y comprueba cada cambio en tiempo real antes de abrirla para OBS.</p></div><div class="row"><button class="btn secondary" id="rouletteResetPreview">Reiniciar prueba</button><button class="btn primary" id="rouletteGenerateOverlay">Generar Overlay</button></div></div><div class="roulette-editor-layout"><section class="card roulette-editor-card"><div class="roulette-editor-tabs">${tabs.map(([k,l])=>`<button type="button" class="roulette-editor-tab ${roulettePreviewTab===k?'active':''}" data-rpreview-tab="${k}">${l}</button>`).join('')}</div><div class="roulette-editor-body" id="roulettePreviewControls"></div></section><section class="card roulette-preview-card"><div class="preview-header"><div><p class="eyebrow">VISTA PREVIA EN TIEMPO REAL</p><h3>Ruleta</h3></div><span class="preview-live"><i></i> SIMULACIÓN</span></div><div class="roulette-preview-stage"><iframe id="roulettePreviewFrame" title="Vista previa Ruleta" src="about:blank"></iframe></div><div class="roulette-preview-actions"><button class="btn secondary" id="rouletteSimAdd">＋ Agregar participante</button><button class="btn primary" id="rouletteSimSpin">🎲 Girar</button></div><div class="roulette-preview-footer"><span class="muted">Los participantes son ficticios y la simulación también alimenta el Chat de Personalización.</span><span id="roulettePreviewParticipantCount" class="preview-count">0 participantes</span></div></section></div>`;
    syncRoulettePreviewHistoryFromServer();
    roulettePreviewConfigControls();
    buildRouletteEditorDecorations();
    document.querySelectorAll('[data-rpreview-tab]').forEach(b=>b.onclick=()=>{
      roulettePreviewTab=b.dataset.rpreviewTab;
      // Tabs are editor views, not different previews. Keep the same iframe
      // mounted so participants, animations and current state never reset.
      document.querySelectorAll('[data-rpreview-tab]').forEach(tab=>tab.classList.toggle('active',tab===b));
      roulettePreviewConfigControls();
      buildRouletteEditorDecorations();
    });
    $('rouletteSimAdd').onclick=()=>{
      const c=getRoulettePreviewConfig();
      const hadWinner=Boolean(roulettePreviewState.activeWinner);
      if(hadWinner){
        // A winner closes the current round. Reset both the embedded preview and the live overlay state.
        roulettePreviewState.participants=[];
        roulettePreviewState.activeWinner=null;
        roulettePreviewPost({type:'newRound'});
        if(socket?.connected) { try { socket.emit('roulette:clearParticipants'); } catch {} }
      }
      const existing=new Set((roulettePreviewState.participants||[]).map(p=>String(p.displayName||'').toLowerCase()));
      const available=names.filter(n=>!existing.has(n.toLowerCase()));
      const pool=available.length?available:names;
      const name=pool[Math.floor(Math.random()*pool.length)];
      const customText=String(c.participation?.commentMode||'custom')==='any'?'¡Hola!':(String(c.participation?.commentText||'1').trim()||'1');
      const enabledPlatforms=['twitch','tiktok'].filter(p=>c.platforms?.[p]!==false);
      const platform=enabledPlatforms.length?enabledPlatforms[Math.floor(Math.random()*enabledPlatforms.length)]:'twitch';
      const participant={displayName:name,username:name.toLowerCase(),uniqueId:name.toLowerCase(),platform,comment:customText,key:`preview-${Date.now()}-${Math.random()}`};
      roulettePreviewState.participants=[...(roulettePreviewState.participants||[]),participant].slice(-100);
      roulettePreviewPost({type:'addParticipant',participant});
      if(socket?.connected) { try { socket.emit('roulette:simulateParticipant',participant); } catch {} }
      const count=$('roulettePreviewParticipantCount');if(count)count.textContent=`${roulettePreviewState.participants.length} participante${roulettePreviewState.participants.length===1?'':'s'}`;
      if(hadWinner && (roulettePreviewTab==='config'||roulettePreviewTab==='winners'||roulettePreviewTab==='history')) roulettePreviewConfigControls();
    };
    $('rouletteSimSpin').onclick=()=>{
      if(roulettePreviewState.activeWinner) return;
      roulettePreviewPost({type:'spin'});
    };
    $('rouletteResetPreview').onclick=()=>{
      roulettePreviewState={history:[],participants:[],activeWinner:null};
      roulettePreviewPost({type:'reset'});
      if(socket?.connected) { try { socket.emit('roulette:clearParticipants'); } catch {} }
      roulettePreviewConfigControls();
      const count=$('roulettePreviewParticipantCount');if(count)count.textContent='0 participantes';
    };
    $('rouletteGenerateOverlay').onclick=async()=>{
      // Open the window synchronously from the user click so browsers do not
      // block it after an awaited socket/API operation.
      let popup=null;
      try{
        popup=window.open('about:blank','streamfusionRoulette','popup=yes,width=1280,height=760,resizable=yes,scrollbars=yes');
        if(!popup){ toast('Ventana bloqueada','Permite ventanas emergentes para generar el overlay de la ruleta.','err'); return; }
        popupWindows.add(popup);
        try{ popup.document.title='StreamFusion · Ruleta'; }catch{}

        // Send the current account configuration without waiting on a 5s timeout.
        // The server acknowledges roulette:update immediately.
        const persisted=await persistRoulettePreviewConfig();
        const url=await buildOverlayUrl('roulette-overlay.html');
        popup.location.href=url;
        try{ popup.focus(); }catch{}
        if(!persisted) toast('Ruleta','Overlay generado. La configuración se sincronizará en segundo plano.');
      }catch(e){
        try{ if(popup && !popup.closed) popup.close(); }catch{}
        toast('Ruleta',e.message||'No se pudo generar el overlay.','err');
      }
    };
    buildOverlayUrl('roulette-overlay.html?embed=1&previewBuild=33').then(url=>{const f=$('roulettePreviewFrame');if(!f)return;f.onload=()=>{roulettePreviewReady=true;f.contentWindow?.postMessage({source:'streamfusion-roulette-preview',type:'config',config:c},'*');flushRoulettePreviewQueue();};f.src=url;}).catch(()=>{});
  }


  async function loadVoices(){
    const request=++voiceCatalogRequest;
    const [catalog,userVoices]=await Promise.all([api(`/api/voices/catalog?owner=${encodeURIComponent(user.id)}`),api('/api/user/voices')]);
    if(request!==voiceCatalogRequest) return;
    state.catalog=catalog.voices||[]; state.voices=userVoices.voices||[];
  }

  function openVoiceTestModal(voice){
    const existing = document.getElementById('voiceTestModal');
    if(existing) existing.remove();
    const label = voice?.label || voice?.name || voice?.key || 'Voz';
    const voiceId = voice?.library === 'fish' || String(voice?.key||'').startsWith('fish:') ? `fish:${voice?.fishId || String(voice.key).replace(/^fish:/,'')}` : String(voice?.id || voice?.fishId || voice?.key || '');
    const modal=document.createElement('div');
    modal.id='voiceTestModal';
    modal.className='voice-test-modal';
    modal.innerHTML=`<div class="voice-test-backdrop" data-close-voice-test></div><section class="voice-test-dialog" role="dialog" aria-modal="true" aria-labelledby="voiceTestTitle"><div class="voice-test-head"><div><p class="eyebrow">PRUEBA TEMPORAL</p><h3 id="voiceTestTitle">${esc(label)}</h3><small>${esc(voiceId)}</small></div><button class="miniBtn" data-close-voice-test aria-label="Cerrar">✕</button></div><label class="voice-test-label">Texto de prueba<textarea id="voiceTestText" rows=9 placeholder="Escribe cualquier texto para probar esta voz..."></textarea></label><div class="voice-test-meta"><span>La prueba no se guarda en el historial ni en tu biblioteca.</span><span id="voiceTestStatus"></span></div><div class="voice-test-actions"><button class="btn secondary" data-close-voice-test>Cerrar</button><button class="btn secondary" id="voiceTestDownloadMp3" disabled>⬇ MP3</button><button class="btn secondary" id="voiceTestDownloadOgg" disabled>⬇ OGG</button><button class="btn primary" id="voiceTestPlay">▶ Probar voz</button></div><audio id="voiceTestAudio" controls preload="none" class="voice-test-audio hidden"></audio></section>`;
    document.body.appendChild(modal);
    const close=()=>{ const a=document.getElementById('voiceTestAudio'); if(a){a.pause(); a.removeAttribute('src'); a.load();} modal.remove(); };
    modal.querySelectorAll('[data-close-voice-test]').forEach(el=>el.addEventListener('click',close));
    const input=modal.querySelector('#voiceTestText');
    const play=modal.querySelector('#voiceTestPlay');
    const downloadMp3=modal.querySelector('#voiceTestDownloadMp3');
    const downloadOgg=modal.querySelector('#voiceTestDownloadOgg');
    const audio=modal.querySelector('#voiceTestAudio');
    const status=modal.querySelector('#voiceTestStatus');
    let objectUrl='';
    let lastText='';
    const safeFileBase=(label||'voz').replace(/[^a-z0-9áéíóúüñ _-]/gi,'').trim()||'voz';
    const run=async()=>{
      const text=String(input?.value||'');
      if(!text.trim()){ status.textContent='Escribe un texto primero.'; status.className='err'; input?.focus(); return; }
      play.disabled=true; downloadMp3.disabled=true; downloadOgg.disabled=true; status.textContent='Generando audio…'; status.className='';
      try{
        const response=await fetch('/api/user/voice-test',{method:'POST',headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},body:JSON.stringify({voiceId,text,format:'wav'})});
        if(!response.ok){ let msg='No se pudo generar el audio.'; try{const data=await response.json(); msg=data.error||msg;}catch{} throw new Error(msg); }
        const blob=await response.blob();
        if(objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl=URL.createObjectURL(blob);
        lastText=text;
        audio.src=objectUrl; audio.classList.remove('hidden'); audio.play().catch(()=>{});
        downloadMp3.disabled=false;
        downloadOgg.disabled=false;
        status.textContent='Audio listo. Las descargas son manuales y no se guardan.';
      }catch(e){ status.textContent=e.message||'Error generando audio.'; status.className='err'; }
      finally{ play.disabled=false; }
    };
    const downloadFormat=async(format, button)=>{
      if(!lastText.trim()) return;
      button.disabled=true;
      const previous=status.textContent;
      status.textContent=`Preparando ${format.toUpperCase()}…`;
      try{
        const response=await fetch('/api/user/voice-test',{method:'POST',headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},body:JSON.stringify({voiceId,text:lastText,format})});
        if(!response.ok){ let msg=`No se pudo generar ${format.toUpperCase()}.`; try{const data=await response.json(); msg=data.error||msg;}catch{} throw new Error(msg); }
        const blob=await response.blob();
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`${safeFileBase}-prueba.${format}`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        status.textContent='Descarga iniciada.';
      }catch(e){ status.textContent=e.message||`Error preparando ${format.toUpperCase()}.`; status.className='err'; }
      finally{ button.disabled=false; }
      if(!status.className) setTimeout(()=>{ if(status.textContent==='Descarga iniciada.') status.textContent=previous||'Audio listo.'; },1800);
    };
    downloadMp3.addEventListener('click',()=>downloadFormat('mp3',downloadMp3));
    downloadOgg.addEventListener('click',()=>downloadFormat('ogg',downloadOgg));
    play.addEventListener('click',run);
    input.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();} });
    modal.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); });
    setTimeout(()=>input?.focus(),20);
  }

  function normalizeLibraryVoiceVolume(value){ const n=Number(value); return Number.isFinite(n)?Math.max(0,Math.min(500,Math.round(n))):100; }
  function libraryVoiceKey(v, options={}){ const isPersonal=options.personal===true || v?.library==='fish'; const id=String(v?.fishId||v?.id||v?.key||'').trim(); return isPersonal ? `fish:${id}` : String(v?.key||id||'').trim(); }
  function libraryVoiceVolume(key){ return normalizeLibraryVoiceVolume(settings?.voiceBot?.voiceVolumes?.[key] ?? 100); }
  function libraryVoiceVolumeIcon(value){ const n=normalizeLibraryVoiceVolume(value); return n===0?'🔇':n<70?'🔉':'🔊'; }
  function updateLibraryVoiceVolumeUi(card, value){
    if(!card) return;
    const normalized=normalizeLibraryVoiceVolume(value);
    const icon=card.querySelector('[data-voice-volume-icon]');
    const labels=card.querySelectorAll('[data-voice-volume-value]');
    const slider=card.querySelector('[data-voice-volume-slider]');
    const summary=card.querySelector('[data-voice-volume-summary]');
    if(icon) icon.textContent=libraryVoiceVolumeIcon(normalized);
    labels.forEach(label=>{ label.textContent=`${normalized}%`; });
    if(slider) slider.value=String(normalized);
    if(summary) summary.title=`Volumen de la voz: ${normalized}%`;
  }
  function queueLibraryVoiceVolumeSave(key, value){
    const normalized=normalizeLibraryVoiceVolume(value);
    settings.voiceBot=settings.voiceBot&&typeof settings.voiceBot==='object'?settings.voiceBot:{};
    settings.voiceBot.voiceVolumes=settings.voiceBot.voiceVolumes&&typeof settings.voiceBot.voiceVolumes==='object'?{...settings.voiceBot.voiceVolumes} : {};
    settings.voiceBot.voiceVolumes[key]=normalized;
    clearTimeout(window.__sfVoiceVolumeSaveTimer);
    window.__sfVoiceVolumeSaveTimer=setTimeout(()=>{
      persistSettingsPatch({voiceBot:{voiceVolumes:{...(settings.voiceBot?.voiceVolumes||{})}}}, false);
    },220);
  }
  function voiceRow(v, options={}){
    const id=v.fishId||v.id||v.key||'';
    const isPersonal=options.personal===true || v.library==='fish';
    const library=isPersonal?'fish':'streamfusion';
    const voiceKey=libraryVoiceKey(v, options);
    const volume=libraryVoiceVolume(voiceKey);
    return `<div class="voice-card ${isPersonal?'custom':''}" data-voice-card="${esc(voiceKey)}"><div class="voice-card-main"><div class="voice-icon">${isPersonal?'🐟':'🎙️'}</div><div><strong>${esc(v.label||v.name||v.key)}</strong><small>${esc(id)}${v.author?` · ${esc(v.author)}`:''}</small>${Array.isArray(v.tags)&&v.tags.length?`<div class="voice-tags">${v.tags.slice(0,5).map(tag=>`<span>#${esc(tag)}</span>`).join('')}</div>`:''}</div></div><div class="voice-actions"><details class="voice-volume-control"><summary class="voice-volume-summary" data-voice-volume-summary title="Volumen de la voz: ${volume}%"><span data-voice-volume-icon>${libraryVoiceVolumeIcon(volume)}</span><span data-voice-volume-value>${volume}%</span></summary><div class="voice-volume-popover"><div class="voice-volume-popover-head"><strong>Volumen</strong><span data-voice-volume-value>${volume}%</span></div><input class="voice-volume-slider" type="range" min="0" max="500" step="5" value="${volume}" data-voice-volume-slider="${esc(voiceKey)}" aria-label="Volumen de ${esc(v.label||v.name||'Voz')}"><div class="voice-volume-scale"><span>0%</span><span>100%</span><span>500%</span></div></div></details><button class="miniBtn" data-test-voice="${esc(id)}" data-test-voice-key="${esc(v.key||id)}" data-test-voice-label="${esc(v.label||v.name||v.key||'Voz')}" data-test-voice-library="${esc(library)}">▶ Probar</button>${isPersonal?`<button class="miniBtn" data-edit-voice="${esc(v.fishId)}">Editar</button><button class="miniBtn danger" data-delete-voice="${esc(v.fishId)}">Eliminar</button>`:''}</div></div>`;
  }

  async function saveVoice(v){
    const fishId=$('fishIdInput')?.value.trim(); const label=$('fishLabelInput')?.value.trim(); const tags=($('fishTagsInput')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!fishId){ toast('Falta el ID','Escribe el ID de Fish Audio.','err'); return; }
    try { const data=await api('/api/user/voices',{method:'POST',body:JSON.stringify({fishId,label:label||fishId,tags})}); toast('Voz guardada',`${data.voice?.label||label||fishId} quedó en tu biblioteca.`); await renderWidgets(); }
    catch(e){ toast('No se pudo guardar',e.message,'err'); }
  }

  function renderVoiceLibraryCard(){
    return `<section class="card voice-library-panel"><div class="section-head"><div><p class="eyebrow">BIBLIOTECA GLOBAL + PERSONAL</p><h3>Voces disponibles</h3></div><span class="count-pill">${state.catalog.length}</span></div>
      <div class="voice-add voice-add-main"><input id="fishLabelInput" placeholder="Nombre de la voz"><input id="fishIdInput" placeholder="ID de Fish Audio"><input id="fishTagsInput" placeholder="Tags: anime, robot, etc."><button class="btn primary" id="addVoice">＋ Guardar</button></div>
      <div id="voiceSearchResults" class="voice-search-results hidden"></div><p class="muted">Las voces personales se guardan en tu cuenta. El volumen de cada voz se sincroniza con Overlay → Bot de voz → Volúmenes. Los tags también sirven para que la ruleta de voces reconozca nombres y alias.</p>
      <div class="voice-library">${state.catalog.map(voiceRow).join('')}</div></section>`;
  }

  function renderVoices(){
    const draw = (loading=false) => {
      $('view').innerHTML=`<div class="intro split"><div><h2>Voces</h2><p>Administra la biblioteca que utiliza el bot de voz sin bloquear la navegación.</p></div><div class="widget-live-mini"><i class="${state.voiceListPresence.online?'on':''}"></i>${state.voiceListPresence.online?'LIVE':'OFF'}</div></div><div class="voice-page-single">${renderVoiceLibraryCard()}<section class="card"><div class="section-head"><div><p class="eyebrow">BOT DE VOZ</p><h3>Biblioteca personal</h3></div><span class="count-pill">${loading?'Cargando…':state.voices.length+' personalizadas'}</span></div><p class="muted">Las voces añadidas desde Fish Audio quedan disponibles para reglas de voz, selección manual y asignación automática.</p><div class="voice-library voice-library-short">${state.voices.length ? state.voices.map(v=>voiceRow(v,{personal:true})).join('') : '<div class="empty">Todavía no tienes voces personalizadas.</div>'}</div></section></div>`;
      bindVoiceLibraryActions();
    };
    draw(state.catalog.length===0 && state.voices.length===0);
    loadVoices().then(()=>{if(page==='voices') draw(false);}).catch(()=>draw(false));
  }

  function bindVoiceLibraryActions(){
    document.querySelectorAll('[data-test-voice]').forEach(btn=>btn.onclick=()=>openVoiceTestModal({id:btn.dataset.testVoice,key:btn.dataset.testVoiceKey,label:btn.dataset.testVoiceLabel,library:btn.dataset.testVoiceLibrary,fishId:btn.dataset.testVoiceLibrary==='fish'?btn.dataset.testVoice:''}));
    document.querySelectorAll('[data-voice-volume-slider]').forEach(slider=>slider.addEventListener('input',()=>{ const card=slider.closest('[data-voice-card]'); updateLibraryVoiceVolumeUi(card, slider.value); }));
    document.querySelectorAll('[data-voice-volume-slider]').forEach(slider=>slider.addEventListener('change',()=>{ const key=String(slider.dataset.voiceVolumeSlider||'').trim(); if(!key) return; const card=slider.closest('[data-voice-card]'); const value=normalizeLibraryVoiceVolume(slider.value); updateLibraryVoiceVolumeUi(card,value); queueLibraryVoiceVolumeSave(key,value); }));
    document.querySelectorAll('.voice-volume-control').forEach(details=>details.addEventListener('click',event=>{ event.stopPropagation(); }));
    document.querySelectorAll('[data-delete-voice]').forEach(btn=>btn.onclick=async()=>{try{await api(`/api/user/voices/${encodeURIComponent(btn.dataset.deleteVoice)}`,{method:'DELETE'});toast('Voz eliminada');await renderVoices();}catch(e){toast('No se pudo eliminar',e.message,'err')}});
    document.querySelectorAll('[data-edit-voice]').forEach(btn=>btn.onclick=()=>{const v=state.voices.find(x=>x.fishId===btn.dataset.editVoice);if(v){ $('fishLabelInput').value=v.label||''; $('fishIdInput').value=v.fishId||''; $('fishTagsInput').value=Array.isArray(v.tags)?v.tags.join(', '):String(v.tags||''); $('fishLabelInput').focus(); }});
    const searchInput=$('fishLabelInput'), searchBox=$('voiceSearchResults'); let searchTimer=0;
    const runVoiceSearch=async()=>{const q=searchInput?.value.trim()||''; if(q.length<2){searchBox?.classList.add('hidden');return;} const id=++searchTimer; try{const data=await api(`/api/voices/search?q=${encodeURIComponent(q)}`); if(id!==searchTimer)return; const items=(data.voices||[]).slice(0,8); searchBox.innerHTML=items.length?items.map(v=>`<button type="button" class="voice-search-item" data-id="${esc(v.id)}" data-label="${esc(v.label)}" data-author="${esc(v.author||'')}" data-description="${esc(v.description||'')}"><strong>${esc(v.label)}</strong><small>${esc(v.id)}${v.author?` · ${esc(v.author)}`:''}</small></button>`).join(''):'<div class="muted">Sin coincidencias.</div>'; searchBox.classList.remove('hidden'); searchBox.querySelectorAll('.voice-search-item').forEach(b=>b.onclick=()=>{const suggested=window.__sfSuggestVoiceTags?window.__sfSuggestVoiceTags(b.dataset.label,b.dataset.author):[];searchInput.value=b.dataset.label;$('fishIdInput').value=b.dataset.id;$('fishTagsInput').value=suggested.join(', ');searchBox.classList.add('hidden');});}catch{searchBox?.classList.add('hidden');}};
    searchInput?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runVoiceSearch,350);});
    function suggestVoiceTags(label, extra=''){
      const source=String(label||'').trim();
      const normalized=source.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[()\[\]{}"'`]/g,' ').replace(/[_/\\-]+/g,' ').replace(/[^\p{L}\p{N}\s]+/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();
      if(!normalized) return [];
      const tags=[];
      const add=(value)=>{const v=String(value||'').trim().toLowerCase();if(v && !tags.includes(v)) tags.push(v);};
      add(normalized);
      normalized.split(' ').forEach(part=>{ if(part.length>=3) add(part); });
      const compact=normalized.replace(/\s+/g,'');
      if(compact!==normalized) add(compact);
      if(extra) String(extra).split(/[,|]/).map(s=>s.trim()).filter(Boolean).slice(0,3).forEach(add);
      return tags.slice(0,10);
    }
    window.__sfSuggestVoiceTags=suggestVoiceTags;
    $('addVoice').onclick=async()=>{const fishId=$('fishIdInput')?.value.trim(), label=$('fishLabelInput')?.value.trim(), tags=($('fishTagsInput')?.value||'').split(',').map(x=>x.trim()).filter(Boolean); if(!fishId){toast('Falta el ID','Escribe el ID de Fish Audio.','err');return;} const effectiveTags=tags.length?tags:suggestVoiceTags(label||fishId); try{const data=await api('/api/user/voices',{method:'POST',body:JSON.stringify({fishId,label:label||fishId,tags:effectiveTags})});toast('Voz guardada',`${data.voice?.label||label||fishId} quedó en tu biblioteca.`);await renderVoices();}catch(e){toast('No se pudo guardar',e.message,'err')}};
  }

  const VOICE_FONTS=[['Inter, Arial, sans-serif','Inter'],['Arial, sans-serif','Arial'],['Trebuchet MS, sans-serif','Trebuchet MS'],['Verdana, sans-serif','Verdana'],['Tahoma, sans-serif','Tahoma'],['Segoe UI, sans-serif','Segoe UI'],['system-ui, sans-serif','System UI'],['Georgia, serif','Georgia'],['Times New Roman, serif','Times New Roman'],['Impact, sans-serif','Impact'],['Oswald, sans-serif','Oswald'],['Montserrat, sans-serif','Montserrat'],['Poppins, sans-serif','Poppins'],['Bebas Neue, sans-serif','Bebas Neue'],['Comic Sans MS, cursive','Comic Sans'],['Courier New, monospace','Courier New'],['Anton, sans-serif','Anton'],['Roboto Condensed, sans-serif','Roboto Condensed'],['Playfair Display, serif','Playfair Display'],['Merriweather, serif','Merriweather'],['Noto Sans, sans-serif','Noto Sans'],['Lobster, cursive','Lobster'],['Raleway, sans-serif','Raleway'],['Space Grotesk, sans-serif','Space Grotesk'],['Orbitron, sans-serif','Orbitron'],['Kanit, sans-serif','Kanit']];
  const voiceShadow=(v,c)=>v==='soft'?`0 2px 8px ${c||'#000'}`:v==='strong'?`0 4px 16px ${c||'#000'}`:'none';
  const syncVoiceWidgetVisibilityClock=(cfg, now=Date.now())=>{
    const enabled=cfg?.autoShowEnabled===true && cfg?.hideAfterShow===true;
    if(!enabled){ voiceWidgetVisibilityPhase='visible'; voiceWidgetVisibilityPhaseStartedAt=now; return; }
    const visibleFor=Math.min(120,Math.max(1,Number(cfg.autoShowFor||6)));
    const hiddenFor=Math.min(3600,Math.max(5,Number(cfg.autoShowEvery||30)));
    const elapsed=(now-voiceWidgetVisibilityPhaseStartedAt)/1000;
    if(voiceWidgetVisibilityPhase==='visible' && elapsed>=visibleFor){ voiceWidgetVisibilityPhase='hidden'; voiceWidgetVisibilityPhaseStartedAt=now; }
    else if(voiceWidgetVisibilityPhase==='hidden' && elapsed>=hiddenFor){ voiceWidgetVisibilityPhase='visible'; voiceWidgetVisibilityPhaseStartedAt=now; }
  };
  const voiceListVisibilityState=(cfg, now=Date.now())=>{
    syncVoiceWidgetVisibilityClock(cfg,now);
    const hidden=voiceWidgetVisibilityPhase==='hidden';
    const visibleFor=Math.min(120,Math.max(1,Number(cfg?.autoShowFor||6)));
    const waitFor=Math.min(3600,Math.max(5,Number(cfg?.autoShowEvery||30)));
    return {hidden, elapsed:(now-voiceWidgetVisibilityPhaseStartedAt)/1000, visibleFor, waitFor};
  };
  const voiceListStructureKey=(cfg,list)=>JSON.stringify({
    axis:cfg.axis||cfg.direction||'vertical', motion:cfg.motion||'static', moveDir:cfg.movementDirection||'forward',
    showIndex:cfg.showIndex===true, showId:cfg.showId===true,
    items:(list||[]).map(v=>String(v.key||v.id||v.fishId||v.label||''))
  });
  const voiceListItemStyle=(cfg)=>`font-family:${esc(cfg.fontFamily||'Inter, Arial, sans-serif')};font-size:${Number(cfg.fontSize??28)}px;font-weight:${Number(cfg.fontWeight??700)};font-style:${esc(cfg.fontStyle||'normal')};color:${esc(cfg.textColor||'#000000')};text-shadow:${voiceShadow(cfg.textShadow,cfg.shadowColor)};-webkit-text-stroke:${Math.max(0,Number(cfg.outlineWidth??0))}px ${esc(cfg.outlineColor||'#000000')};paint-order:stroke fill;text-transform:${esc(cfg.textTransform||'none')};letter-spacing:${Number(cfg.letterSpacing??0)}px;line-height:${Number(cfg.lineHeight||1.2)};`;
  const applyVoiceListPreviewStyles=(shell,cfg,hidden=false)=>{
    if(!shell) return;
    const axis=cfg.axis||cfg.direction||'vertical', moveDir=cfg.movementDirection||'forward', motion=String(cfg.motion||'static');
    shell.className=`voiceListShell direction-${esc(axis)} travel-${esc(moveDir)} motion-${esc(motion)} align-${esc(cfg.align||'left')} list-position-${esc(cfg.listPosition||'left')} horizontal-position-${esc(cfg.horizontalPosition||'center')}${hidden?' is-hidden':''}`;
    const bgAlpha=cfg.transparent?Number(cfg.backgroundOpacity||0):Math.max(.05,Number(cfg.backgroundOpacity||.08));
    shell.style.setProperty('--vl-font',cfg.fontFamily||'Inter, Arial, sans-serif'); shell.style.setProperty('--vl-size',`${Number(cfg.fontSize??28)}px`); shell.style.setProperty('--vl-weight',Number(cfg.fontWeight??700));
    shell.style.setProperty('--vl-style',cfg.fontStyle||'normal'); shell.style.setProperty('--vl-color',cfg.textColor||'#000000'); shell.style.setProperty('--vl-shadow',voiceShadow(cfg.textShadow,cfg.shadowColor));
    shell.style.setProperty('--vl-outline-width',`${Math.max(0,Number(cfg.outlineWidth??0))}px`); shell.style.setProperty('--vl-outline-color',cfg.outlineColor||'#000000'); shell.style.setProperty('--vl-transform',cfg.textTransform||'none');
    shell.style.setProperty('--vl-spacing',`${Number(cfg.letterSpacing??0)}px`); shell.style.setProperty('--vl-line',Number(cfg.lineHeight||1.2)); shell.style.setProperty('--vl-gap',`${Math.max(0,Number(cfg.itemGap||10))}px`);
    shell.style.setProperty('--vl-speed',`${Math.max(4,Number(cfg.motionSpeed||24))}s`); shell.style.setProperty('--vl-align',axis==='horizontal'?'center':(cfg.listPosition||cfg.align||'left')); shell.style.setProperty('--vl-bg',`rgba(255,255,255,${bgAlpha})`);
    shell.dataset.voiceStructure=voiceListStructureKey(cfg, voicePreviewItems());
    shell.querySelectorAll('.voiceListItem').forEach((item,i)=>{ item.style.cssText=voiceListItemStyle(cfg); const v=voicePreviewItems()[i % voicePreviewItems().length]; if(v){const idx=item.querySelector('.voiceListIndex'); if(idx) idx.textContent=cfg.showIndex?`${(i%voicePreviewItems().length)+1}. `:''; const small=item.querySelector('small'); if(small) small.textContent=cfg.showId?String(v.id||v.fishId||''):''; }});
  };
  function preserveVoiceListAnimation(track, mutate){
    if(!track){ mutate?.(); return; }
    const anim=track.getAnimations?.().find(a=>a && a.animationName);
    const current=anim && Number.isFinite(Number(anim.currentTime))?Number(anim.currentTime):0;
    mutate?.();
    if(current>0){ track.style.animationDelay=`-${current/1000}s`; }
  }
  function syncVoiceWidgetPreview(s, force=false){
    const host=$('voiceWidgetPreview'); if(!host) return;
    if(s.enabled===false){ if(!host.querySelector('.voice-preview-off')) host.innerHTML='<div class="voice-preview-off"><span class="off-dot"></span><strong>Widget desactivado</strong><small>Actívalo para generar contenido en el overlay.</small></div>'; return; }
    const list=voicePreviewItems();
    if(s.roulette?.enabled){
      const html=buildVoicePreviewHtml(s);
      if(force || host.innerHTML!==html) host.innerHTML=html;
      return;
    }
    const structure=voiceListStructureKey(s,list);
    let shell=host.querySelector('.voiceListShell');
    if(force || !shell || shell.dataset.voiceStructure!==structure){
      const html=buildVoicePreviewHtml({...s,autoShowEnabled:false,hideAfterShow:false});
      const wrap=document.createElement('div'); wrap.innerHTML=html;
      const next=wrap.firstElementChild;
      if(next?.classList?.contains('voiceListShell')){ host.replaceChildren(next); shell=next; }
      else { host.innerHTML=html; shell=host.querySelector('.voiceListShell'); }
      if(shell) shell.dataset.voiceStructure=structure;
    }
    if(!shell) return;

    const styleSignature=JSON.stringify({
      axis:s.axis||s.direction, motion:s.motion, movementDirection:s.movementDirection,
      fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,fontStyle:s.fontStyle,
      textColor:s.textColor,textShadow:s.textShadow,shadowColor:s.shadowColor,
      transparent:s.transparent,backgroundOpacity:s.backgroundOpacity,
      outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,textTransform:s.textTransform,
      letterSpacing:s.letterSpacing,lineHeight:s.lineHeight,itemGap:s.itemGap,align:s.align,
      listPosition:s.listPosition,horizontalPosition:s.horizontalPosition,motionSpeed:s.motionSpeed,showIndex:s.showIndex,showId:s.showId,
      overrides:s.overrides,list:list.map(v=>v.key)
    });
    if(force || shell.dataset.voiceStyleSignature!==styleSignature){
      const hidden=voiceListVisibilityState(s).hidden;
      preserveVoiceListAnimation(shell.querySelector('.voiceListTrack'),()=>applyVoiceListPreviewStyles(shell,s,hidden),Math.max(4,Number(s.motionSpeed||24)));
      shell.dataset.voiceStyleSignature=styleSignature;
    } else {
      shell.classList.toggle('is-hidden',voiceListVisibilityState(s).hidden);
    }
  }
  const voiceLibraryItems=()=>{
    const merged=[]; const seen=new Set();
    for(const v of [...(state.catalog||[]),...(state.voices||[])]){
      const key=String(v.key||v.id||v.fishId||v.name||v.label||'').trim();
      if(!key || seen.has(key)) continue; seen.add(key); merged.push(v);
    }
    return merged;
  };
  const voicePreviewItems=()=>voiceLibraryItems().length?voiceLibraryItems():[{key:'preview-1',label:'Fede Vigevani'},{key:'preview-2',label:'Deadpool'},{key:'preview-3',label:'El Mariana'}];
  function buildVoicePreviewHtml(s){
    const cfg={...s,roulette:{...(s?.roulette||{})}};
    if(cfg.enabled===false) return `<div class="voice-preview-off"><span class="off-dot"></span><strong>Widget desactivado</strong><small>Actívalo para generar contenido en el overlay.</small></div>`;

    const list=voicePreviewItems();
    if(cfg.roulette?.enabled){
      const r={title:'¿Quieres una voz?',subtitle:'Para participar, comenta lo que se indique en el sorteo!',winnerText:'Si ganas, solo comenta una de las siguientes voces:',introMotion:'fade',cardOpacity:.12,showListAfterIntro:true,...cfg.roulette};
      const now=Date.now();
      if(!voiceWidgetPreviewStartAt) voiceWidgetPreviewStartAt=now;
      const elapsed=Math.max(0,(now-voiceWidgetPreviewStartAt)/1000);
      const d1=Math.max(.5,Number(r.titleSeconds||3)),d2=Math.max(.5,Number(r.subtitleSeconds||3)),d3=Math.max(.5,Number(r.winnerSeconds||3));
      let step=-1,text='';
      if(elapsed<d1){step=0;text=r.title}
      else if(elapsed<d1+d2){step=1;text=r.subtitle}
      else if(elapsed<d1+d2+d3){step=2;text=r.winnerText}
      if(step>=0 || r.showListAfterIntro===false){
        const imgCfgs=[
          {url:r.titleImageUrl||r.imageUrl||'',alt:r.titleImageAlt||r.imageAlt||'',position:r.titleImagePosition||r.imagePosition||'top',fit:r.titleImageFit||r.imageFit||'contain',width:r.titleImageWidth??r.imageWidth??260,height:r.titleImageHeight??r.imageHeight??260,opacity:r.titleImageOpacity??r.imageOpacity??1},
          {url:r.subtitleImageUrl||r.imageUrl||'',alt:r.subtitleImageAlt||r.imageAlt||'',position:r.subtitleImagePosition||r.imagePosition||'top',fit:r.subtitleImageFit||r.imageFit||'contain',width:r.subtitleImageWidth??r.imageWidth??260,height:r.subtitleImageHeight??r.imageHeight??260,opacity:r.subtitleImageOpacity??r.imageOpacity??1},
          {url:r.winnerImageUrl||r.imageUrl||'',alt:r.winnerImageAlt||r.imageAlt||'',position:r.winnerImagePosition||r.imagePosition||'top',fit:r.winnerImageFit||r.imageFit||'contain',width:r.winnerImageWidth??r.imageWidth??260,height:r.winnerImageHeight??r.imageHeight??260,opacity:r.winnerImageOpacity??r.imageOpacity??1}
        ];
        const img=step>=0?imgCfgs[Math.min(step,2)]:null;
        const image=img?.url?`<div class="voiceListRouletteImageWrap"><img src="${esc(img.url)}" alt="${esc(img.alt)}" style="width:${clamp(img.width,80,1200)}px;height:${clamp(img.height,80,1200)}px;object-fit:${esc(img.fit)};opacity:${clamp(img.opacity??1,0,1)}" onerror="this.remove()"></div>`:'';
        const copy=`<div class="voiceListRouletteCopy"><div class="voiceListRouletteText">${esc(text||r.winnerText)}</div></div>`;
        return `<div class="voiceListRouletteShell motion-${esc(r.introMotion||'fade')} image-${esc(img?.position||'top')}"><div class="voiceListRouletteCard" style="--vl-roulette-card-bg:rgba(255,255,255,${clamp(r.cardOpacity??.12,0,1)});">${image}${copy}</div></div>`;
      }
    }

    const axis=cfg.axis||cfg.direction||'vertical';
    const moveDir=cfg.movementDirection||'forward';
    const motion=['static','scroll','slide','marquee','crawl','starwars','slide-down','slide-up','float'].includes(String(cfg.motion||''))?String(cfg.motion):'static';
    const ordered=moveDir==='reverse'?[...list].reverse():list;
    const items=ordered.map((v,i)=>{
      const style=`font-family:${esc(cfg.fontFamily||'Inter, Arial, sans-serif')};font-size:${Number(cfg.fontSize??28)}px;font-weight:${Number(cfg.fontWeight??700)};font-style:${esc(cfg.fontStyle||'normal')};color:${esc(cfg.textColor||'#000000')};text-shadow:${voiceShadow(cfg.textShadow,cfg.shadowColor)};-webkit-text-stroke:${Math.max(0,Number(cfg.outlineWidth??0))}px ${esc(cfg.outlineColor||'#000000')};paint-order:stroke fill;text-transform:${esc(cfg.textTransform||'none')};letter-spacing:${Number(cfg.letterSpacing??0)}px;line-height:${Number(cfg.lineHeight||1.2)};`;
      return `<div class="voiceListItem" style="${style}"><span class="voiceListIndex">${cfg.showIndex?`${i+1}. `:''}</span>${esc(v.label||v.name||v.key||v.fishId||'Voz')}${cfg.showId?`<small>${esc(v.id||v.fishId||'')}</small>`:''}</div>`;
    }).join('');
    if(!items) return '<div class="voiceListEmpty">No se encontraron voces.</div>';

    const content=motion==='static'?items:`${items}${items}`;
    const bgAlpha=cfg.transparent?Number(cfg.backgroundOpacity||0):Math.max(.05,Number(cfg.backgroundOpacity||.08));

    const visibility=voiceListVisibilityState(cfg);
    if(visibility.hidden){
      return `<div class="voiceListShell direction-${esc(axis)} travel-${esc(moveDir)} motion-${esc(motion)} align-${esc(cfg.align||'left')} list-position-${esc(cfg.listPosition||'left')} horizontal-position-${esc(cfg.horizontalPosition||'center')} is-hidden" style="--vl-bg:rgba(255,255,255,${bgAlpha});">`+`<div class="voiceListStage"><div class="voiceListViewport"><div class="voiceListTrack">${content}</div></div></div></div>`;
    }

    return `<div class="voiceListShell direction-${esc(axis)} travel-${esc(moveDir)} motion-${esc(motion)} align-${esc(cfg.align||'left')} list-position-${esc(cfg.listPosition||'left')} horizontal-position-${esc(cfg.horizontalPosition||'center')}" style="--vl-font:${esc(cfg.fontFamily||'Inter, Arial, sans-serif')};--vl-size:${Number(cfg.fontSize??28)}px;--vl-weight:${Number(cfg.fontWeight??700)};--vl-style:${esc(cfg.fontStyle||'normal')};--vl-color:${esc(cfg.textColor||'#000000')};--vl-shadow:${voiceShadow(cfg.textShadow,cfg.shadowColor)};--vl-outline-width:${Math.max(0,Number(cfg.outlineWidth??0))}px;--vl-outline-color:${esc(cfg.outlineColor||'#000000')};--vl-transform:${esc(cfg.textTransform||'none')};--vl-spacing:${Number(cfg.letterSpacing??0)}px;--vl-line:${Number(cfg.lineHeight||1.2)};--vl-gap:${Math.max(0,Number(cfg.itemGap||10))}px;--vl-speed:${Math.max(4,Number(cfg.motionSpeed||24))}s;--vl-align:${esc(cfg.align||'left')};--vl-bg:rgba(255,255,255,${bgAlpha});"><div class="voiceListStage"><div class="voiceListViewport"><div class="voiceListTrack">${content}</div></div></div></div>`;
  }
  function voiceStatusMarkup(){return `<span class="widget-status account"><i></i>CUENTA ACTIVA</span>`}
  function voiceCtl(label,id,type,value,opts=''){return ctl(label,id,type,value,opts)}
  function voiceListPositionOptions(axis='vertical', value='center'){
    const isHorizontal=String(axis||'vertical')==='horizontal';
    if(isHorizontal){
      const safe=['top','center','bottom'].includes(String(value))?String(value):'center';
      return ['top','center','bottom'].map(key => `<option value="${key}"${safe===key?' selected':''}>${({top:'Arriba',center:'Centro',bottom:'Abajo'})[key]}</option>`).join('');
    }
    const safe=['left','center','right'].includes(String(value))?String(value):'center';
    return ['left','center','right'].map(key => `<option value="${key}"${safe===key?' selected':''}>${({left:'Izquierda',center:'Centro',right:'Derecha'})[key]}</option>`).join('');
  }
  function voiceAxisPosition(axis, cfg){
    const isHorizontal=String(axis||'vertical')==='horizontal';
    return isHorizontal
      ? (['top','center','bottom'].includes(String(cfg?.horizontalPosition)) ? String(cfg.horizontalPosition) : 'center')
      : (['left','center','right'].includes(String(cfg?.listPosition)) ? String(cfg.listPosition) : 'center');
  }
  function normalizeVoiceListPlacement(cfg){
    const s=cfg||{};
    const axis=String(s.axis||s.direction||'vertical')==='horizontal'?'horizontal':'vertical';
    s.axis=axis; s.direction=axis;
    if(axis==='horizontal'){
      if(!['top','center','bottom'].includes(String(s.horizontalPosition||''))){
        const legacy=String(s.listPosition||'center');
        s.horizontalPosition=legacy==='left'?'top':legacy==='right'?'bottom':'center';
      }
      if(!['top','center','bottom'].includes(String(s.horizontalPosition||''))) s.horizontalPosition='center';
    }else{
      if(!['left','center','right'].includes(String(s.listPosition||''))) s.listPosition='center';
    }
    return s;
  }
  function refreshVoiceListPositionControls(axis, cfg){
    const isHorizontal=String(axis||'vertical')==='horizontal';
    const positionLabel=$('vPosition')?.closest('label');
    const pos=$('vPosition');
    if(!pos) return;
    normalizeVoiceListPlacement(cfg||{});
    const value=voiceAxisPosition(axis,cfg||{});
    if(positionLabel) positionLabel.dataset.axis=isHorizontal?'horizontal':'vertical';
    pos.innerHTML=voiceListPositionOptions(axis,value);
    pos.value=value;
    pos.setAttribute('aria-label',isHorizontal?'Posición vertical':'Posición horizontal');
  }
  function voiceRouletteMarkup(r){return `<div class="widget-subsection"><div class="section-head"><div><p class="eyebrow">INTRO DEL WIDGET</p><h3>Secuencia previa</h3></div><span class="muted">opcional</span></div><div class="settings-grid two compact-grid">${voiceCtl('Activar','vlRouletteEnabled','check',r.enabled)}${voiceCtl('Mostrar lista al terminar','vlShowListAfter','check',r.showListAfterIntro!==false)}${voiceCtl('Texto 1','vlRText1','input',r.title)}${voiceCtl('Segundos 1','vlRTime1','input',r.titleSeconds)}${voiceCtl('Texto 2','vlRText2','input',r.subtitle)}${voiceCtl('Segundos 2','vlRTime2','input',r.subtitleSeconds)}${voiceCtl('Texto 3','vlRText3','input',r.winnerText)}${voiceCtl('Segundos 3','vlRTime3','input',r.winnerSeconds)}${voiceCtl('Animación','vlRMotion','select',r.introMotion||'fade','<option value="fade">Fade</option><option value="slide-up">Slide up</option><option value="slide-down">Slide down</option><option value="zoom">Zoom</option><option value="type">Type</option><option value="star-wars">Star Wars</option>')}${voiceCtl('Opacidad tarjeta','vlRCard','input',r.cardOpacity)}</div><p class="muted">La escena de ruleta del widget sigue siendo independiente de la ruleta principal de StreamFusion.</p></div>`}
  function pointsWidgetWordsText(words){
    return Array.isArray(words) ? words.filter(Boolean).join(', ') : '';
  }
  function pointsWidgetCommandExamples(cfg){
    const prefix=String(cfg?.commandPrefix||'!');
    const words=Array.isArray(cfg?.commandWords)&&cfg.commandWords.length ? cfg.commandWords : ['point'];
    return words.slice(0,4).map(word=>`${prefix}${word}`).join(' · ');
  }
  function pointsWidgetAvatarDataUrl(initials, platform){
    const bg=platform==='twitch'?'#9146ff':'#fe2c55';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="${bg}"/><text x="60" y="67" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="white">${String(initials||'U').slice(0,2).toUpperCase()}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  function pointsWidgetPreviewCard(s, sim){
    if(!sim) return '';
    const platform=String(sim.platform||'tiktok').toLowerCase()==='twitch'?'twitch':'tiktok';
    const accent=platform==='twitch'?'#9146ff':'#fe2c55';
    const platformLabel=platform==='twitch'?'Twitch':'TikTok';
    const avatarUrl=sim.avatarUrl||pointsWidgetAvatarDataUrl(sim.initials,platform);
    const points=Number(sim.points||0).toLocaleString('es-PE');
    return `<div class="points-widget-live-wrap" style="--points-platform:${accent};--points-platform-soft:${platform==='twitch'?'rgba(145,70,255,.18)':'rgba(254,44,85,.18)'}"><div class="points-widget-card"><div class="points-widget-avatar"><img src="${esc(avatarUrl)}" alt=""></div><div class="points-widget-copy"><strong>${esc(sim.displayName||sim.username)}</strong><small>${esc(platformLabel)} · @${esc(sim.username||'usuario')}</small><div class="points-widget-comment"><span>comentó</span> <b>${esc(sim.command)}</b></div><span>Tienes <b>${points}pts</b></span></div><div class="points-widget-amount"><strong>${points}</strong><small>PTS</small></div></div></div>`;
  }
  function clearPointsWidgetPreviewTimers(){ pointsWidgetPreviewTimers.forEach(t=>clearTimeout(t)); pointsWidgetPreviewTimers=[]; }
  function renderPointsWidgetEditor(){
    window.__sfVoiceWidgetEditorOpen=false;
    clearPointsWidgetPreviewTimers();
    pointsWidgetPreviewSequence=0;
    const base=pointsWidgetDraft||structuredClone(pointsDraft?.widget||{});
    pointsWidgetDraft={enabled:true,commandPrefix:'!',commandWords:['point'],displaySeconds:5,cooldownMinutes:5,queueEnabled:true,...base};
    const s=pointsWidgetDraft;
    const prefixes=['!','.','@','/','-'].map(v=>`<option value="${esc(v)}" ${s.commandPrefix===v?'selected':''}>${esc(v)}</option>`).join('');
    $('view').innerHTML=`<div class="intro widget-editor-intro"><div><p class="eyebrow">WIDGET / PUNTOS</p><h2>Puntos</h2><p>Configura el comando que activa el aviso de puntos y controla el cooldown para evitar spam.</p></div><button class="btn secondary widget-back-btn" id="backToWidgetsFromPoints">← Volver a Widgets</button></div>
      <div class="widget-editor-layout points-widget-editor-layout"><section class="card widget-controls"><div class="widget-editor-topbar"><div><p class="eyebrow">EDITOR</p><h3>Configuración del widget</h3></div><div class="widget-header-actions"><button class="btn secondary" id="savePointsWidget">Guardar</button><button class="btn primary" id="openPointsWidgetOverlay">Generar Overlay</button></div></div>
      <div class="settings-grid two compact-grid"><article class="widget-subsection"><p class="eyebrow">COMANDO</p>${ctl('Activar widget','pwEnabled','check',s.enabled!==false)}${ctl('Prefijo','pwPrefix','select',s.commandPrefix,prefixes)}<label>Comando(s)<input id="pwWords" type="text" value="${esc(pointsWidgetWordsText(s.commandWords))}" placeholder="point, puntos, p, punto"><small class="muted">Puedes escribir varios separados por coma. Se aceptará cualquiera de ellos.</small></label><div class="notice"><strong>Ejemplos:</strong> ${esc(pointsWidgetCommandExamples(s))}</div></article>
      <article class="widget-subsection"><p class="eyebrow">TIEMPOS Y ANTI-SPAM</p>${ctl('Mostrar durante (segundos)','pwDisplaySeconds','input',s.displaySeconds)}${ctl('Cooldown por usuario (minutos)','pwCooldown','input',s.cooldownMinutes)}${ctl('Cola ordenada','pwQueue','check',s.queueEnabled!==false)}<div class="custom-hint"><strong>Cómo funciona</strong><span>Juan puede activar el widget una vez. Si vuelve a comentar antes del cooldown, se ignora. Juan y Julián pueden entrar seguidos y se mostrarán en orden, uno después de otro.</span></div></article></div></section>
      <section class="card widget-preview-card"><div class="preview-header"><div><p class="eyebrow">VISTA PREVIA EN TIEMPO REAL</p><h3>Puntos</h3></div><span class="widget-status online"><i></i> SIMULACIÓN</span></div><div id="pointsWidgetPreview" class="points-widget-preview"></div><div class="preview-actions points-widget-preview-actions"><button class="btn primary" id="simulatePointsWidget">＋ Simular comentario</button><span class="muted">Muestra los puntos del usuario y registra ese mismo comentario en Personalización → Chat.</span></div><div class="widget-preview-footer"><span class="muted">Un único overlay por cuenta.</span><code id="pointsOverlayLinkPreview">Genera el overlay para obtener tu enlace.</code></div></section></div>`;
    const updatePreview=()=>{};
    const bindInput=(id,fn)=>{const el=$(id);if(!el)return; el.addEventListener('input',e=>{fn(e);updatePreview();});el.addEventListener('change',e=>{fn(e);updatePreview();});};
    bindInput('pwEnabled',e=>pointsWidgetDraft.enabled=e.target.checked);
    bindInput('pwPrefix',e=>pointsWidgetDraft.commandPrefix=e.target.value);
    bindInput('pwWords',e=>{pointsWidgetDraft.commandWords=Array.from(new Set(String(e.target.value||'').split(',').map(v=>v.trim().replace(/^[@.!\/-]+/,'').toLowerCase()).filter(Boolean))).slice(0,12);});
    bindInput('pwDisplaySeconds',e=>pointsWidgetDraft.displaySeconds=Math.min(30,Math.max(1,Number(e.target.value)||5)));
    bindInput('pwCooldown',e=>pointsWidgetDraft.cooldownMinutes=Math.min(1440,Math.max(0,Number(e.target.value)||0)));
    bindInput('pwQueue',e=>pointsWidgetDraft.queueEnabled=e.target.checked);
    $('simulatePointsWidget').onclick=()=>{
      const s=pointsWidgetDraft; const wrap=$('pointsWidgetPreview'); if(!wrap)return;
      const user=POINTS_WIDGET_SIM_USERS[pointsWidgetPreviewSequence % POINTS_WIDGET_SIM_USERS.length];
      const words=Array.isArray(s.commandWords)&&s.commandWords.length?s.commandWords:['point'];
      const word=words[pointsWidgetPreviewSequence % words.length]||words[0];
      pointsWidgetPreviewSequence += 1;
      const sim={preview:true,...user,message:`${s.commandPrefix||'!'}${word}`,command:`${s.commandPrefix||'!'}${word}`,timestamp:Date.now(),action:'Comentario'};

      // 1) El editor de Puntos muestra el widget completo (usuario + puntos + comando).
      const holder=document.createElement('div');
      holder.innerHTML=pointsWidgetPreviewCard(s,sim);
      const pointsNode=holder.firstElementChild;
      if(!pointsNode)return;
      pointsNode.classList.add('points-widget-simulated-comment','is-visible');
      wrap.appendChild(pointsNode);
      queueAvatarImages(wrap);

      // 2) El mismo comentario se inserta como comentario NORMAL en el preview real de Chat.
      //    No activa aquí el widget; solamente alimenta el historial simulado del Chat.
      state.previewChat=[...(state.previewChat||[]),sim].slice(-24);

      // 2.1) Enviar la misma simulación al overlay generado de Puntos.
      //      El servidor la reenvía únicamente a los overlays de esta cuenta.
      try {
        if (socket?.connected) {
          socket.emit('pointsWidget:simulate', {
            platform: sim.platform,
            username: sim.username,
            displayName: sim.displayName,
            avatarUrl: sim.avatarUrl || '',
            initials: sim.initials || '',
            command: sim.command,
            points: Number(sim.points || 0),
            timestamp: sim.timestamp,
            displaySeconds: Number(s.displaySeconds || 5)
          });
        }
      } catch (error) {
        console.warn('[Points Widget] No se pudo enviar la simulación al overlay:', error);
      }
      // El comentario simulado del Chat es persistente: no se programa ningún borrado.
      // 3) Solo el widget de Puntos desaparece según la duración configurada.
      const chatExpireMs=Math.max(1,Number(s.displaySeconds)||5)*1000;
      if(page==='customize' && activeCustomizeTab==='chat') renderCustomizePreviewOnly({force:true});
      const pointTimer=setTimeout(()=>{
        pointsNode.classList.add('is-leaving');
        setTimeout(()=>pointsNode.remove(),300);
      },chatExpireMs);
      pointsWidgetPreviewTimers.push(pointTimer);
    };
    $('backToWidgetsFromPoints').onclick=()=>{window.__sfPointsWidgetEditorOpen=false;window.__sfVoiceWidgetEditorOpen=false;pointsWidgetDraft=null;clearPointsWidgetPreviewTimers();renderWidgets();};
    const save=async()=>{
      const result=await api('/api/points/widget',{method:'PUT',body:JSON.stringify({widget:structuredClone(pointsWidgetDraft)})});
      pointsWidgetDraft=structuredClone(result.widget||pointsWidgetDraft);
      settings.points={...(settings.points||{}),widget:structuredClone(pointsWidgetDraft)};
      if(pointsDraft) pointsDraft.widget=structuredClone(pointsWidgetDraft);
      state.previewPointsWidgets = [];
      toast('Puntos guardados','Configuración guardada correctamente.');
      return pointsWidgetDraft;
    };
    $('savePointsWidget').onclick=async()=>{try{await save();}catch(e){toast('No se pudo guardar',e.message||'Error','err');}};
    $('openPointsWidgetOverlay').onclick=async()=>{let popup=null;try{popup=window.open('about:blank','streamfusionPointsWidget','popup=yes,width=900,height=700,resizable=yes,scrollbars=yes');if(!popup){toast('Ventana bloqueada','Permite ventanas emergentes para abrir el overlay.','err');return;}popupWindows.add(popup);await save();const url=await buildOverlayUrl('points-overlay.html');const link=$('pointsOverlayLinkPreview');if(link)link.textContent=url;if(!popup.closed)popup.location.replace(url);try{popup.focus();}catch{}toast('Overlay generado','Este enlace pertenece únicamente a tu cuenta y se mantiene estable.');}catch(e){try{if(popup&&!popup.closed)popup.close();}catch{}toast('Overlay',e.message||'No se pudo generar el overlay.','err');}};
  }

  const ANNOUNCEMENT_FONTS = [
    ['Inter','Inter'],['Bangers','Bangers'],['Impact','Impact'],['Anton','Anton'],['Bebas Neue','Bebas Neue'],['Oswald','Oswald'],
    ['Roboto','Roboto'],['Montserrat','Montserrat'],['Poppins','Poppins'],['Playfair Display','Playfair Display'],['Press Start 2P','Press Start 2P'],
    ['Permanent Marker','Permanent Marker'],['Righteous','Righteous'],['Orbitron','Orbitron'],['Russo One','Russo One'],['Lobster','Lobster'],
    ['Pacifico','Pacifico'],['Abril Fatface','Abril Fatface'],['Luckiest Guy','Luckiest Guy'],['Teko','Teko']
  ];
  const ANNOUNCEMENT_FONT_LINK = 'https://fonts.googleapis.com/css2?family=Anton&family=Abril+Fatface&family=Bangers&family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&family=Luckiest+Guy&family=Lobster&family=Montserrat:wght@400;600;700;800;900&family=Orbitron:wght@500;700;900&family=Oswald:wght@400;600;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:wght@600;700;800&family=Poppins:wght@400;500;600;700;800;900&family=Press+Start+2P&family=Righteous&family=Roboto:wght@400;500;700;900&family=Russo+One&family=Teko:wght@500;600;700&display=swap';
  function ensureAnnouncementFonts(){
    if(document.getElementById('sfAnnouncementFonts'))return;
    const link=document.createElement('link'); link.id='sfAnnouncementFonts'; link.rel='stylesheet'; link.href=ANNOUNCEMENT_FONT_LINK; document.head.appendChild(link);
  }
  function announcementId(){return `ann_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;}
  function announcementSlideId(){return `slide_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;}
  function defaultAnnouncementText(value='Escribe tu anuncio',x=38,y=50){return {id:`txt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,enabled:true,zIndex:20,value,x,y,width:58,height:30,autoSize:true,scale:1,fontFamily:'Inter',fontSize:52,fontWeight:800,fontStyle:'normal',color:'#ffffff',align:'center',shadow:true,shadowColor:'rgba(0,0,0,.55)',shadowBlur:16,shadowX:0,shadowY:4,outlineWidth:0,outlineColor:'#000000',letterSpacing:0,lineHeight:1.05,transform:'none'};}
  function defaultAnnouncementSlide(){return {id:announcementSlideId(),showSeconds:8,texts:[defaultAnnouncementText()],image:{enabled:false,url:'',zIndex:10,x:70,y:50,width:28,height:42,opacity:1,radius:18,fit:'contain',shadow:true,shadowColor:'rgba(0,0,0,.42)',shadowBlur:18,shadowX:0,shadowY:8,borderWidth:0,borderColor:'rgba(255,255,255,.2)',aspectRatio:null}};}
  function defaultAnnouncement(name='Anuncio'){return {id:announcementId(),name,enabled:true,repeatEvery:180,showImmediately:true,width:1280,height:720,slides:[defaultAnnouncementSlide()]};}
  function ensureAnnouncementConfig(raw){
    const base=defaultAnnouncement(raw?.name||'Anuncio');
    const cfg=merge(base,raw||{});
    cfg.id=String(raw?.id||base.id); cfg.name=String(cfg.name||'Anuncio').slice(0,120); cfg.enabled=cfg.enabled!==false; cfg.repeatEvery=Math.max(0,Math.min(86400,Number(cfg.repeatEvery)||0));
    cfg.slides=(Array.isArray(cfg.slides)?cfg.slides:[]).slice(0,3).map((x)=>merge(defaultAnnouncementSlide(),x||{}));
    if(!cfg.slides.length)cfg.slides=[defaultAnnouncementSlide()];
    cfg.slides.forEach(sl=>{
      sl.id=String(sl.id||announcementSlideId());
      sl.showSeconds=Math.max(.5,Math.min(86400,Number(sl.showSeconds)||8));
      delete sl.hideSeconds;delete sl.card;delete sl.cardBackground;delete sl.cardBorder;delete sl.cardRadius;delete sl.cardPadding;delete sl.cardShadow;
      const legacy=sl.text && typeof sl.text==='object' ? sl.text : null;
      let texts=Array.isArray(sl.texts)?sl.texts.slice(0,3):[];
      if(!texts.length && legacy) texts=[legacy];
      if(!texts.length) texts=[defaultAnnouncementText()];
      sl.texts=texts.map((tx,i)=>merge(defaultAnnouncementText(i?`Texto ${i+1}`:'Escribe tu anuncio', i===0?38:50, i===0?50:50),tx||{}));
      sl.texts.forEach((tx,i)=>{tx.id=String(tx.id||`txt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);tx.zIndex=Number.isFinite(Number(tx.zIndex))?Number(tx.zIndex):(20+i);tx.autoSize=true;tx.scale=Number.isFinite(Number(tx.scale))&&Number(tx.scale)>0?Number(tx.scale):1;});
      delete sl.text;
      sl.image=merge(defaultAnnouncementSlide().image,sl.image||{}); sl.image.zIndex=Number.isFinite(Number(sl.image.zIndex))?Number(sl.image.zIndex):10; sl.image.aspectRatio=Number.isFinite(Number(sl.image.aspectRatio))&&Number(sl.image.aspectRatio)>0?Number(sl.image.aspectRatio):null;
      // La versión anterior tenía 'contain' como predeterminado y podía dejar bandas
      // transparentes/blancas fuera de la imagen al pasar al overlay. La migración
      // conserva la edición manual cuando ya usa cover/fill y normaliza el antiguo default.
      if (String(sl.image.fit || '').toLowerCase() === 'contain') sl.image.fit='cover';
    });
    return cfg;
  }
  function annCqw(px, fallback=0){const n=Number(px);return `${(Number.isFinite(n)?n:fallback)/12.8}cqw`;}
  function announcementStyleVars(slide){
    const texts=Array.isArray(slide.texts)?slide.texts:[], im=slide.image||{};
    const first=texts[0]||defaultAnnouncementText();
    const shadow=first.shadow?`${Number(first.shadowX||0)}px ${Number(first.shadowY||4)}px ${Number(first.shadowBlur||16)}px ${first.shadowColor||'rgba(0,0,0,.55)'}`:'none';
    const imgShadow=im.shadow?`${Number(im.shadowX||0)}px ${Number(im.shadowY||8)}px ${Number(im.shadowBlur||18)}px ${im.shadowColor||'rgba(0,0,0,.42)'}`:'none';
    return {textShadow:shadow,imgShadow,border:`${Number(im.borderWidth||0)}px solid ${im.borderColor||'rgba(255,255,255,.2)'}`};
  }
  function announcementPreviewMarkup(cfg,slideIndex=0,{stageClass='sf-announcement-stage'}={}){
    const sl=cfg?.slides?.[slideIndex]||defaultAnnouncementSlide();
    const texts=Array.isArray(sl.texts)?sl.texts:[defaultAnnouncementText()]; const im=sl.image||{};
    const textsMarkup=texts.slice(0,3).map((t,idx)=>{
      if(!t?.enabled)return '';
      const textShadow=t.shadow?`${annCqw(t.shadowX||0)} ${annCqw(t.shadowY||4)} ${annCqw(t.shadowBlur||16)} ${t.shadowColor||'rgba(0,0,0,.55)'}`:'none';
      const textScale=Math.max(.25,Math.min(5,Number(t.scale??1)||1)); const textBox=`width:max-content;max-width:none;height:auto;min-height:0;`; const textStyle=`left:${Number(t.x??50)}%;top:${Number(t.y??50)}%;${textBox}transform:translate(-50%,-50%) scale(${textScale});transform-origin:center center;font-family:${esc(t.fontFamily||'Inter')};font-size:${annCqw(t.fontSize||52)};font-weight:${Number(t.fontWeight||800)};font-style:${esc(t.fontStyle||'normal')};color:${esc(t.color||'#fff')};text-align:${esc(t.align||'center')};text-shadow:${textShadow};-webkit-text-stroke:${annCqw(Number(t.outlineWidth||0))} ${esc(t.outlineColor||'#000')};letter-spacing:${annCqw(Number(t.letterSpacing||0))};line-height:${Number(t.lineHeight||1.05)};text-transform:${esc(t.transform||'none')};z-index:${Number(t.zIndex??20)};`;
      return `<div class="sf-announcement-text" data-ann-element="text" data-ann-text-index="${idx}" style="${textStyle}">${esc(t.value||'')}</div>`;
    }).join('');
    const imageShadow=im.shadow?`drop-shadow(${annCqw(im.shadowX||0)} ${annCqw(im.shadowY||8)} ${annCqw(im.shadowBlur||18)} ${im.shadowColor||'rgba(0,0,0,.42)'})`:'none';
    const imageBoxStyle=`left:${Number(im.x??70)}%;top:${Number(im.y??50)}%;width:${Number(im.width??28)}%;height:auto;transform:translate(-50%,-50%);opacity:${Number(im.opacity??1)};z-index:${Number(im.zIndex??10)};background:transparent;border:0;border-radius:0;box-shadow:none;overflow:visible;`;
    const imageStyle=`width:100%;height:auto;max-width:none;display:block;background:transparent;border:0;border-radius:${annCqw(Number(im.radius||18))};object-fit:contain;object-position:center;filter:${imageShadow};`;
    return `<div class="${stageClass}"><div class="sf-announcement-card" style="background:transparent;border:0;box-shadow:none;padding:0"><div class="sf-announcement-safe-zone"></div>${textsMarkup}${im.enabled&&im.url?`<div class="sf-announcement-image" data-ann-element="image" style="${imageBoxStyle}"><img src="${esc(im.url)}" alt="" style="${imageStyle}"></div>`:''}</div></div>`;
  }
  function renderAnnouncementPreview(){
    const host=$('announcementCanvas'); if(!host||!announcementDraft)return;
    host.innerHTML=announcementPreviewMarkup(announcementDraft,announcementActiveSlide,{stageClass:'sf-announcement-stage sf-announcement-editor-stage'});
    bindAnnouncementCanvas(host,announcementDraft,announcementActiveSlide);
    const sl=announcementDraft.slides[announcementActiveSlide]; host.dataset.slideId=sl?.id||'';
  }
  function announcementElementTarget(el, slide){
    if(!el) return null;
    const kind=el.dataset.annElement;
    if(kind==='image') return {kind:'image', index:null, target:slide.image};
    if(kind==='text'){const index=Number(el.dataset.annTextIndex||0); return {kind:'text', index, target:slide.texts?.[index]||null};}
    return null;
  }
  function closeAnnouncementContextMenu(){
    const menu=document.getElementById('sf-ann-context-menu');
    if(menu) menu.remove();
  }
  function showAnnouncementContextMenu(stage, el, ev, slide){
    ev.preventDefault(); ev.stopPropagation();
    closeAnnouncementContextMenu();
    const info=announcementElementTarget(el,slide);
    if(!info?.target) return;
    const menu=document.createElement('div'); menu.id='sf-ann-context-menu'; menu.className='sf-ann-context-menu';
    const current=Number(info.target.zIndex||0);
    const elements=[...(slide.texts||[]).map(t=>({kind:'text',target:t})), ...(slide.image?.enabled&&slide.image?.url?[{kind:'image',target:slide.image}]:[])];
    const ordered=elements.slice().sort((a,b)=>Number(a.target?.zIndex||0)-Number(b.target?.zIndex||0));
    const pos=ordered.findIndex(item=>item.target===info.target);
    menu.innerHTML=`<button type="button" data-ann-z="back" ${pos<=0?'disabled':''}>↙ Mover atrás</button><button type="button" data-ann-z="forward" ${pos===ordered.length-1?'disabled':''}>↗ Mover adelante</button>`;
    document.body.appendChild(menu);
    const pad=8, mw=180, mh=84;
    const x=Math.min(window.innerWidth-mw-pad, Math.max(pad, ev.clientX));
    const y=Math.min(window.innerHeight-mh-pad, Math.max(pad, ev.clientY));
    menu.style.left=`${x}px`; menu.style.top=`${y}px`;
    menu.querySelector('[data-ann-z=back]')?.addEventListener('click',()=>{
      const i=ordered.findIndex(item=>item.target===info.target);
      if(i<=0)return;
      const other=ordered[i-1].target; const aZ=Number(info.target.zIndex||0); info.target.zIndex=Number(other.zIndex||0); other.zIndex=aZ;
      closeAnnouncementContextMenu();renderAnnouncementPreview();persistAnnouncementDebounced(false);
    });
    menu.querySelector('[data-ann-z=forward]')?.addEventListener('click',()=>{
      const i=ordered.findIndex(item=>item.target===info.target);
      if(i<0||i>=ordered.length-1)return;
      const other=ordered[i+1].target; const aZ=Number(info.target.zIndex||0); info.target.zIndex=Number(other.zIndex||0); other.zIndex=aZ;
      closeAnnouncementContextMenu();renderAnnouncementPreview();persistAnnouncementDebounced(false);
    });
    setTimeout(()=>{
      const outside=(e)=>{if(!menu.contains(e.target)){closeAnnouncementContextMenu();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',outside,true);}};
      document.addEventListener('pointerdown',outside,true); document.addEventListener('scroll',outside,true);
    },0);
  }
  function bindAnnouncementCanvas(host,cfg,slideIndex){
    const stage=host.querySelector('.sf-announcement-editor-stage'); if(!stage)return;
    const sl=cfg.slides[slideIndex]; if(!sl)return;
    stage.querySelectorAll('[data-ann-element]').forEach(el=>{
      el.setAttribute('draggable','false');
      if(el.dataset.annElement==='image'){ const img=el.querySelector('img'); if(img){ const syncRatio=()=>{ if(img.naturalWidth&&img.naturalHeight){ sl.image.aspectRatio=img.naturalWidth/img.naturalHeight; const w=Number(sl.image.width||28); sl.image.height=Number((w/sl.image.aspectRatio).toFixed(2)); el.style.height='auto'; persistAnnouncementDebounced(false); } }; if(img.complete)syncRatio(); else img.addEventListener('load',syncRatio,{once:true}); }}
      el.addEventListener('contextmenu',ev=>showAnnouncementContextMenu(stage,el,ev,sl));
      el.addEventListener('pointerdown',ev=>{
        if(ev.button!==0)return; ev.preventDefault(); ev.stopPropagation();
        const kind=el.dataset.annElement; const rect=stage.getBoundingClientRect(); const startX=ev.clientX,startY=ev.clientY;
        const textIndex=Number(el.dataset.annTextIndex||0); const target=kind==='text'?(sl.texts?.[textIndex]||sl.texts?.[0]):sl.image; if(!target)return;
        if(kind==='text')announcementActiveText=textIndex;
        const x0=Number(target.x??50), y0=Number(target.y??50); el.setPointerCapture?.(ev.pointerId);
        const move=e=>{const nx=Math.max(0,Math.min(100,x0+(e.clientX-startX)/rect.width*100));const ny=Math.max(0,Math.min(100,y0+(e.clientY-startY)/rect.height*100));target.x=Number(nx.toFixed(2));target.y=Number(ny.toFixed(2));el.style.left=`${nx}%`;el.style.top=`${ny}%`;};
        const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.classList.remove('sf-ann-selected');persistAnnouncementDebounced(false);if(kind==='text')renderAnnouncementEditor();};
        el.classList.add('sf-ann-selected'); el.addEventListener('pointermove',move); el.addEventListener('pointerup',up,{once:true});
      });
      if(el.dataset.annElement==='text'){
        const handle=document.createElement('span'); handle.className='sf-ann-resize-handle sf-ann-text-resize-handle'; el.appendChild(handle);
        handle.addEventListener('pointerdown',ev=>{
          if(ev.button!==0)return; ev.preventDefault();ev.stopPropagation();
          const rect=stage.getBoundingClientRect(); const sx=ev.clientX, sy=ev.clientY; const target=sl.texts?.[Number(el.dataset.annTextIndex||0)]; if(!target)return;
          const scale0=Math.max(.25,Math.min(5,Number(target.scale??1)||1)); handle.setPointerCapture?.(ev.pointerId);
          announcementActiveText=Number(el.dataset.annTextIndex||0);
          const move=e=>{
            const dx=(e.clientX-sx)/rect.width; const dy=(e.clientY-sy)/rect.height;
            const delta=Math.max(dx,dy);
            const scale=Math.max(.25,Math.min(5,scale0*(1+delta*1.35)));
            target.scale=Number(scale.toFixed(3));
            el.style.transform=`translate(-50%,-50%) scale(${scale})`;
          };
          const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);persistAnnouncementDebounced(false);};
          handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',up,{once:true});
        });
      }
      if(el.dataset.annElement==='image'){
        const handle=document.createElement('span'); handle.className='sf-ann-resize-handle'; el.appendChild(handle);
        handle.addEventListener('pointerdown',ev=>{
          if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();
          const rect=stage.getBoundingClientRect();const sx=ev.clientX,sy=ev.clientY;const w0=Number(sl.image.width||28),h0=Number(sl.image.height||42);const ratio=Number(sl.image.aspectRatio)>0?Number(sl.image.aspectRatio):(w0/Math.max(h0,.01));handle.setPointerCapture?.(ev.pointerId);
          const move=e=>{const requestedW=Math.max(5,Math.min(90,w0+(e.clientX-sx)/rect.width*100));const requestedH=Math.max(5,Math.min(90,h0+(e.clientY-sy)/rect.height*100));const scaleW=requestedW/w0;const scaleH=requestedH/h0;const scale=Math.max(scaleW,scaleH);const w=Math.max(5,Math.min(90,w0*scale));const h=Math.max(5,Math.min(90,h0*scale));sl.image.width=Number(w.toFixed(2));sl.image.height=Number(h.toFixed(2));sl.image.aspectRatio=ratio;el.style.width=`${w}%`;el.style.height='auto';};
          const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);persistAnnouncementDebounced(false);};
          handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up,{once:true});
        });
      }
    });
  }
  let announcementPersistTimer=0;
  async function loadAnnouncementDraft(){
    if(announcementDraftLoaded)return null;
    announcementDraftLoaded=true;
    try{
      const data=await api('/api/announcement-draft');
      return data?.draft?ensureAnnouncementConfig(data.draft):null;
    }catch(e){console.warn('[Announcements] draft load',e);return null;}
  }
  function persistAnnouncementDebounced(redraw=true){
    announcementDraftApplied=false;
    clearTimeout(announcementPersistTimer);
    announcementPersistTimer=setTimeout(async()=>{
      try{
        if(announcementDraft){
          await api('/api/announcement-draft',{method:'PUT',body:JSON.stringify({draft:structuredClone(announcementDraft)})});
        }
      }catch(e){console.warn('[Announcements] draft autosave',e);} 
      if(redraw&&page==='widgets'&&window.__sfAnnouncementEditorOpen)renderAnnouncementEditor();
    },350);
  }
  async function saveAnnouncementDraftNow(){
    if(!announcementDraft)return;
    await api('/api/announcement-draft',{method:'PUT',body:JSON.stringify({draft:structuredClone(announcementDraft)})});
  }
  async function clearAnnouncementDraft(){
    clearTimeout(announcementPersistTimer);
    try{await api('/api/announcement-draft',{method:'DELETE'});}catch(e){console.warn('[Announcements] draft clear',e);}
  }
  async function saveAnnouncements(){
    const result=await api('/api/announcements',{method:'PUT',body:JSON.stringify({announcements:structuredClone(settings.announcements||[])})});
    settings.announcements=Array.isArray(result.announcements)?result.announcements:[];
    return settings.announcements;
  }
  function setAnnouncementField(path,value){
    if(!announcementDraft)return; let target=announcementDraft; const parts=path.split('.'); for(let i=0;i<parts.length-1;i++)target=target[parts[i]]; target[parts.at(-1)]=value;
    renderAnnouncementPreview(); persistAnnouncementDebounced(false);
  }
  function announcementControl(label,id,value,type='text',attrs=''){return `<label>${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;}
  function announcementSelect(label,id,value,options){return `<label>${esc(label)}<select id="${id}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
  function announcementCheck(label,id,value){return `<label class="check-row"><input id="${id}" type="checkbox" ${value?'checked':''}><span>${esc(label)}</span></label>`;}
  function announcementColor(label,id,value){return `<label>${esc(label)}<div class="sf-color-inline"><input id="${id}" type="color" value="${/^#[0-9a-f]{3,8}$/i.test(String(value||''))?esc(value):'#ffffff'}"><code id="${id}Value">${esc(value||'#ffffff')}</code></div></label>`;}
  function announcementSlideTabs(cfg){return cfg.slides.map((sl,i)=>`<button type="button" class="sf-ann-slide-tab ${i===announcementActiveSlide?'active':''}" data-ann-slide="${i}"><span>${i+1}</span>Parte ${i+1}</button>`).join('');}
  function renderAnnouncementEditor(){
    ensureAnnouncementFonts();
    if(!announcementDraft)return;
    announcementDraft=ensureAnnouncementConfig(announcementDraft);
    const sl=announcementDraft.slides[announcementActiveSlide]||announcementDraft.slides[0];
    const texts=sl.texts||[]; announcementActiveText=Math.max(0,Math.min(announcementActiveText,texts.length-1));
    const t=texts[announcementActiveText]||texts[0]||defaultAnnouncementText(); const im=sl.image;
    const fontOptions=ANNOUNCEMENT_FONTS.map(([v,l])=>[v,l]);
    const sequenceSummary=announcementDraft.slides.map((part,i)=>`<div class="sf-ann-seq-item ${i===announcementActiveSlide?'active':''}"><span>Parte ${i+1}</span><strong data-ann-seq-duration="${i}">${Number(part.showSeconds||0)} s</strong></div>`).join('');
    const hasMultiple=announcementDraft.slides.length>1;
    const textCards=texts.slice(0,3).map((tx,i)=>`<article class="sf-ann-text-card ${i===announcementActiveText?'active':''}" data-ann-text-card="${i}"><div class="sf-ann-text-card-head"><label class="check-row"><input type="checkbox" data-ann-text-enabled="${i}" ${tx.enabled?'checked':''}><span>Texto ${i+1}</span></label><div class="sf-ann-text-card-actions"><button type="button" class="sf-ann-text-edit" data-ann-text-select="${i}">${i===announcementActiveText?'Editando':'Editar'}</button>${texts.length>1?`<button type="button" class="sf-ann-text-remove" data-ann-text-remove="${i}" aria-label="Eliminar texto">×</button>`:''}</div></div><textarea class="sf-ann-textarea" data-ann-text-value="${i}" maxlength="1200" rows="2" placeholder="Escribe el texto…">${esc(tx.value||'')}</textarea></article>`).join('');
    $('view').innerHTML=`<div class="intro split sf-ann-editor-intro"><div><div class="sf-ann-breadcrumb"><span>WIDGETS</span><b>›</b><strong>ANUNCIO</strong></div><h2>${esc(announcementDraft.name||'Anuncio')}</h2><p>Diseña cada parte en la vista previa. Las partes se muestran en orden y, al terminar la última, comienza el intervalo general.</p></div><button class="btn secondary widget-back-btn" id="backToWidgetsFromAnnouncement">← Volver a Widgets</button></div>
      <div class="widget-editor-layout sf-ann-editor-layout"><section class="card widget-controls sf-ann-controls"><div class="widget-editor-topbar"><div><p class="eyebrow">EDITOR</p><h3>Configuración del anuncio</h3></div><div class="widget-header-actions"><button class="btn danger secondary" id="deleteAnnouncement">Eliminar anuncio</button><button class="btn secondary" id="applyAnnouncement">Aplicar cambios</button><button class="btn secondary" id="saveAnnouncement">Guardar</button><button class="btn primary" id="openAnnouncementOverlay">Generar Overlay</button></div></div>
        <div class="sf-announcement-tabs"><div class="sf-ann-parts-label"><span>PARTES</span><small>${announcementDraft.slides.length}/3</small></div>${announcementSlideTabs(announcementDraft)}<div class="sf-ann-part-actions">${announcementDraft.slides.length<3?'<button type="button" class="sf-ann-add-part" id="addAnnouncementSlide">Agregar Parte <span>＋</span></button>':''}${announcementDraft.slides.length>1?'<button type="button" class="sf-ann-delete-part" id="deleteAnnouncementPart">Eliminar Parte <span>−</span></button>':''}</div></div>
        <div class="sf-ann-general-grid"><article class="widget-subsection sf-ann-general-panel"><div class="sf-ann-panel-title"><div><p class="eyebrow">ANUNCIO GENERAL</p><h3>Configuración global</h3></div><span class="sf-ann-panel-badge">${announcementDraft.slides.length} parte${announcementDraft.slides.length===1?'':'s'}</span></div><div class="sf-ann-general-row"><div class="sf-ann-name-field">${announcementControl('Nombre de anuncio','anName',announcementDraft.name,'text','maxlength="120"')}</div><div class="sf-ann-active-field">${announcementCheck('Activo','anEnabled',announcementDraft.enabled)}</div></div><div class="sf-ann-general-row sf-ann-general-row-repeat"><div>${announcementControl('Mostrar anuncio cada (segundos)','anRepeat',announcementDraft.repeatEvery,'number','min="0" step="1"')}</div></div><div class="sf-ann-sequence"><div class="sf-ann-seq-head"><span>SECUENCIA</span><small>${announcementDraft.slides.length===1?'Se muestra esta parte y luego comienza el intervalo.':'Cada parte se muestra durante su propio tiempo. Al terminar la última comienza el intervalo general.'}</small></div>${sequenceSummary}</div></article></div>
        <div class="sf-ann-section-title"><span>PARTE ${announcementActiveSlide+1}</span><small>${hasMultiple?'Configura el contenido y su duración.':'Configura el contenido; añade partes con “Agregar Parte”.'}</small></div>
        <div class="settings-grid two compact-grid sf-ann-main-grid"><article class="widget-subsection sf-ann-panel"><div class="sf-ann-panel-title"><div><p class="eyebrow">TIEMPO</p><h3>Duración de esta parte</h3></div></div>${announcementControl('Mostrar durante (segundos)','anShow',sl.showSeconds,'number','min="0.5" step="0.5"')}<p class="sf-ann-field-note">Al terminar este tiempo, pasa automáticamente a la siguiente parte. ${announcementDraft.slides.length===1?'Después comienza el intervalo general.':''}</p></article><article class="widget-subsection sf-ann-panel sf-ann-content-panel"><div class="sf-ann-panel-title sf-ann-content-title"><div><p class="eyebrow">CONTENIDO</p><h3>Textos de esta parte</h3></div><div class="sf-ann-content-tools">${announcementCheck('Mostrar texto','anTextEnabled',texts.some(x=>x.enabled))}${texts.length<3?'<button type="button" class="sf-ann-add-text" id="addAnnouncementText" title="Agregar texto">＋</button>':''}</div></div><div class="sf-ann-text-list">${textCards}</div></article></div>
        <div class="settings-grid two compact-grid sf-ann-content-grid"><article class="widget-subsection sf-ann-panel"><div class="sf-ann-panel-title"><div><p class="eyebrow">ESTILO DEL TEXTO</p><h3>Texto ${announcementActiveText+1} · Tipografía y acabado</h3></div></div>${announcementSelect('Fuente','anFont',t.fontFamily,fontOptions)}${announcementSelect('Peso','anWeight',t.fontWeight,[['400','Normal'],['500','Medium'],['600','Semibold'],['700','Bold'],['800','Extra Bold'],['900','Black']])}<div class="sf-ann-inline-grid">${announcementControl('Tamaño (px)','anFontSize',t.fontSize,'number','min="10" max="220"')}${announcementColor('Color','anTextColor',t.color)}</div><div class="sf-ann-style-row"><div class="sf-ann-toggle-inline">${announcementCheck('Sombra de texto','anTextShadow',t.shadow)}</div><div>${announcementControl('Desenfoque','anTextShadowBlur',t.shadowBlur,'number','min="0" max="80"')}</div></div><div class="sf-ann-inline-grid">${announcementControl('Contorno (px)','anOutline',t.outlineWidth,'number','min="0" max="20"')}${announcementColor('Color contorno','anOutlineColor',t.outlineColor)}</div></article><article class="widget-subsection sf-ann-panel"><div class="sf-ann-panel-title"><div><p class="eyebrow">IMAGEN</p><h3>Fuente y apariencia</h3></div></div>${announcementCheck('Usar imagen','anImageEnabled',im.enabled)}<div class="sf-ann-image-source"><div class="sf-ann-image-source-grid"><label><span>URL de imagen</span><input id="anImageUrl" type="url" value="${esc(im.url)}" maxlength="5000" placeholder="https://.../imagen.png"></label><button type="button" class="sf-ann-upload-label" id="anImageLibrary"><span class="sf-ann-upload-title">＋ Elegir de Biblioteca</span><span class="sf-ann-upload-copy">Selecciona una imagen/GIF guardado o sube uno nuevo</span><small>La nueva imagen también se guardará en tu Biblioteca</small></button></div><div class="sf-ann-image-upload-status" id="anImageUploadStatus">${im.url?.startsWith('/announcement-image/')?'✓ Imagen guardada en tu cuenta':'Pega una URL o sube una imagen.'}</div></div><div class="sf-ann-inline-grid">${announcementSelect('Ajuste de imagen','anImageFit',im.fit,[['cover','Rellenar · Cover'],['contain','Contener · Contain'],['fill','Estirar · Fill']])}${announcementControl('Opacidad','anImageOpacity',im.opacity,'number','min="0" max="1" step="0.05"')}</div><div class="sf-ann-style-row"><div>${announcementControl('Radio','anImageRadius',im.radius,'number','min="0" max="80"')}</div><div class="sf-ann-toggle-inline">${announcementCheck('Sombra de imagen','anImageShadow',im.shadow)}</div></div>${announcementControl('Desenfoque sombra','anImageShadowBlur',im.shadowBlur,'number','min="0" max="80"')}${announcementControl('Borde (px)','anImageBorder',im.borderWidth,'number','min="0" max="20"')}</article></div>
        <div class="widget-subsection sf-ann-position-section"><div class="section-head"><div><p class="eyebrow">LIENZO</p><h3>Mueve y redimensiona directamente</h3></div><span class="muted">Arrastra textos o imagen. Usa la esquina de cada elemento para cambiar su tamaño.</span></div>${announcementControl(`Texto ${announcementActiveText+1} X %`,'anTextX',t.x,'number','min="0" max="100" step="0.1"')}${announcementControl(`Texto ${announcementActiveText+1} Y %`,'anTextY',t.y,'number','min="0" max="100" step="0.1"')}${announcementControl(`Texto ${announcementActiveText+1} escala %`,'anTextScale',Number(t.scale||1)*100,'number','min="25" max="500" step="1"')}${announcementControl('Imagen X %','anImageX',im.x,'number','min="0" max="100" step="0.1"')}${announcementControl('Imagen Y %','anImageY',im.y,'number','min="0" max="100" step="0.1"')}${announcementControl('Imagen ancho %','anImageW',im.width,'number','min="5" max="90" step="0.1"')}${announcementControl('Imagen alto %','anImageH',im.height,'number','min="5" max="90" step="0.1"')}</div>
        <div class="sf-ann-actions sf-ann-config-actions"><span class="muted">Máximo 3 partes y 3 textos por parte.</span></div>
        <div class="widget-preview-footer"><span class="muted">Este anuncio y su overlay pertenecen únicamente a tu cuenta.</span><code id="announcementOverlayLinkPreview">Genera el overlay para obtener tu enlace.</code></div>
      </section><section class="card widget-preview-card sf-ann-preview-card"><div class="preview-header"><div><p class="eyebrow">VISTA PREVIA EN TIEMPO REAL</p><h3 id="announcementPreviewTitle">${esc(announcementDraft.name||'Anuncio')} · Parte ${announcementActiveSlide+1}</h3></div><span class="widget-status online"><i></i> SIMULACIÓN</span></div><div id="announcementCanvas" class="sf-announcement-canvas"></div><div class="sf-ann-preview-actions"><button class="btn primary" id="viewAnnouncement">▶ Simular anuncio</button></div><div class="sf-ann-preview-help">La simulación muestra cada parte durante sus segundos configurados, queda completamente oculta al terminar cada ciclo y luego espera el intervalo general antes de volver a empezar.</div></section></div>`;
    renderAnnouncementPreview();
    const bind=(id,fn,ev='input')=>{const el=$(id);if(!el)return;el.addEventListener(ev,fn);};
    bind('anName',e=>{
      announcementDraft.name=e.target.value;
      const name=announcementDraft.name||'Anuncio';
      const heading=document.querySelector('.sf-ann-editor-intro h2');
      const previewTitle=$('announcementPreviewTitle');
      if(heading) heading.textContent=name;
      if(previewTitle) previewTitle.textContent=`${name} · Parte ${announcementActiveSlide+1}`;
      persistAnnouncementDebounced(false);
    });
    bind('anEnabled',e=>{announcementDraft.enabled=e.target.checked;persistAnnouncementDebounced(false)},'change');
    bind('anRepeat',e=>{announcementDraft.repeatEvery=Math.max(0,Math.min(86400,Number(e.target.value)||0));persistAnnouncementDebounced(false)});
    bind('anShow',e=>{sl.showSeconds=Math.max(.5,Math.min(86400,Number(e.target.value)||.5));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anTextEnabled',e=>{texts.forEach(tx=>tx.enabled=e.target.checked);renderAnnouncementEditor();persistAnnouncementDebounced(false)},'change');
    document.querySelectorAll('[data-ann-text-select]').forEach(btn=>btn.addEventListener('click',e=>{announcementActiveText=Number(e.currentTarget.dataset.annTextSelect||0);renderAnnouncementEditor();}));
    document.querySelectorAll('[data-ann-text-enabled]').forEach(cb=>cb.addEventListener('change',e=>{const i=Number(e.currentTarget.dataset.annTextEnabled);if(texts[i])texts[i].enabled=e.currentTarget.checked;persistAnnouncementDebounced(false);renderAnnouncementPreview();}));
    document.querySelectorAll('[data-ann-text-value]').forEach(el=>el.addEventListener('input',e=>{const i=Number(e.currentTarget.dataset.annTextValue);if(texts[i])texts[i].value=e.currentTarget.value;renderAnnouncementPreview();persistAnnouncementDebounced(false);}));
    document.querySelectorAll('[data-ann-text-card]').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('button')||e.target.closest('input')||e.target.closest('textarea'))return;announcementActiveText=Number(card.dataset.annTextCard||0);renderAnnouncementEditor();}));
    document.querySelectorAll('[data-ann-text-remove]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();const i=Number(e.currentTarget.dataset.annTextRemove);if(texts.length<=1)return;texts.splice(i,1);announcementActiveText=Math.max(0,Math.min(announcementActiveText,texts.length-1));renderAnnouncementEditor();persistAnnouncementDebounced(false);}));
    $('addAnnouncementText')?.addEventListener('click',()=>{if(texts.length>=3)return;texts.push(defaultAnnouncementText(`Texto ${texts.length+1}`,50,35+texts.length*18));announcementActiveText=texts.length-1;renderAnnouncementEditor();persistAnnouncementDebounced(false);});
    bind('anFont',e=>{t.fontFamily=e.target.value;renderAnnouncementPreview();persistAnnouncementDebounced(false)},'change');
    bind('anWeight',e=>{t.fontWeight=Number(e.target.value)||800;renderAnnouncementPreview();persistAnnouncementDebounced(false)},'change');
    bind('anFontSize',e=>{t.fontSize=Math.max(10,Math.min(220,Number(e.target.value)||52));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anTextColor',e=>{t.color=e.target.value;const c=$('anTextColorValue');if(c)c.textContent=t.color.toUpperCase();renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anTextShadow',e=>{t.shadow=e.target.checked;renderAnnouncementPreview();persistAnnouncementDebounced(false)},'change');
    bind('anTextShadowBlur',e=>{t.shadowBlur=Math.max(0,Math.min(80,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anOutline',e=>{t.outlineWidth=Math.max(0,Math.min(20,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anOutlineColor',e=>{t.outlineColor=e.target.value;const c=$('anOutlineColorValue');if(c)c.textContent=t.outlineColor.toUpperCase();renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anImageEnabled',e=>{im.enabled=e.target.checked;renderAnnouncementPreview();persistAnnouncementDebounced(false)},'change');
    bind('anImageUrl',e=>{im.url=e.target.value.trim();const st=$('anImageUploadStatus');if(st)st.textContent=im.url.startsWith('/announcement-image/')?'✓ Imagen guardada en tu cuenta.':'URL externa; también puedes subir un archivo.';renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    $('anImageLibrary')?.addEventListener('click',()=>openLibraryImagePicker({title:'Imagen para el anuncio',description:'Elige una imagen/GIF de tu Biblioteca o sube uno nuevo desde aquí.',onSelect:file=>{im.url=String(file.url||'');im.enabled=true;if($('anImageEnabled'))$('anImageEnabled').checked=true;const st=$('anImageUploadStatus');if(st)st.textContent=`✓ ${file.name} seleccionado desde tu Biblioteca.`;renderAnnouncementPreview();persistAnnouncementDebounced(false);}}));
    bind('anImageFit',e=>{im.fit=e.target.value;renderAnnouncementPreview();persistAnnouncementDebounced(false)},'change');
    bind('anImageOpacity',e=>{im.opacity=Math.max(0,Math.min(1,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anImageRadius',e=>{im.radius=Math.max(0,Math.min(80,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anImageShadow',e=>{im.shadow=e.target.checked;renderAnnouncementPreview();persistAnnouncementDebounced(false)},'change');
    bind('anImageShadowBlur',e=>{im.shadowBlur=Math.max(0,Math.min(80,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    bind('anImageBorder',e=>{im.borderWidth=Math.max(0,Math.min(20,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    [['anTextX',t,'x'],['anTextY',t,'y'],['anImageX',im,'x'],['anImageY',im,'y'],['anImageW',im,'width'],['anImageH',im,'height']].forEach(([id,obj,k])=>bind(id,e=>{obj[k]=Math.max(k==='width'?5:k==='height'?5:0,Math.min(k==='width'||k==='height'?90:100,Number(e.target.value)||0));renderAnnouncementPreview();persistAnnouncementDebounced(false)}));
    bind('anTextScale',e=>{t.scale=Math.max(.25,Math.min(5,(Number(e.target.value)||100)/100));renderAnnouncementPreview();persistAnnouncementDebounced(false)});
    $('backToWidgetsFromAnnouncement').onclick=async()=>{try{await saveAnnouncementDraftNow();}catch(e){} stopAnnouncementPreview();window.__sfAnnouncementEditorOpen=false;announcementDraft=null;announcementEditingId='';announcementActiveSlide=0;announcementActiveText=0;window.__sfAnnouncementHubOpen=true;renderWidgets();};
    $('addAnnouncementSlide')?.addEventListener('click',()=>{if(announcementDraft.slides.length>=3)return;announcementDraft.slides.push(defaultAnnouncementSlide());announcementActiveSlide=announcementDraft.slides.length-1;announcementActiveText=0;renderAnnouncementEditor();persistAnnouncementDebounced(false);});
    document.querySelectorAll('.sf-ann-slide-tab').forEach(btn=>btn.onclick=()=>{announcementActiveSlide=Number(btn.dataset.annSlide||0);announcementActiveText=0;stopAnnouncementPreview();renderAnnouncementEditor();});
    $('deleteAnnouncementPart')?.addEventListener('click',()=>{if(announcementDraft.slides.length<=1)return;announcementDraft.slides.splice(announcementActiveSlide,1);announcementActiveSlide=Math.max(0,Math.min(announcementActiveSlide,announcementDraft.slides.length-1));announcementActiveText=0;renderAnnouncementEditor();persistAnnouncementDebounced(false);});
    $('deleteAnnouncement')?.addEventListener('click',async()=>{const a=announcementDraft;if(!a)return;const isSaved=(settings.announcements||[]).some(x=>String(x.id)===String(a.id));if(!window.confirm(isSaved?'¿Eliminar definitivamente este anuncio?':'¿Descartar este anuncio en creación?'))return;try{if(isSaved){settings.announcements=(settings.announcements||[]).filter(x=>String(x.id)!==String(a.id));await saveAnnouncements();}await clearAnnouncementDraft();stopAnnouncementPreview();window.__sfAnnouncementEditorOpen=false;announcementDraft=null;announcementEditingId='';announcementActiveSlide=0;announcementActiveText=0;window.__sfAnnouncementHubOpen=true;renderWidgets();toast(isSaved?'Anuncio eliminado':'Creación descartada',isSaved?'El anuncio y su overlay quedaron eliminados.':'La configuración temporal fue descartada.');}catch(e){toast('No se pudo eliminar',e.message||'Error','err');}});
    $('viewAnnouncement').onclick=()=>{toggleAnnouncementPreview();};
    $('applyAnnouncement').onclick=async()=>{try{await saveAnnouncementDraftNow();announcementDraftApplied=true;toast('Cambios aplicados','Tu configuración quedó guardada como borrador y ya puede usarse para el overlay. El anuncio seguirá sin aparecer como botón hasta que pulses Guardar.');}catch(e){toast('No se pudieron aplicar',e.message||'Error','err');}};
    $('saveAnnouncement').onclick=async()=>{try{stopAnnouncementPreview();const idx=(settings.announcements||[]).findIndex(x=>String(x.id)===String(announcementDraft.id));announcementDraft.updatedAt=Date.now();if(idx>=0)settings.announcements[idx]=structuredClone(announcementDraft);else if((settings.announcements||[]).length<4)settings.announcements=[...(settings.announcements||[]),structuredClone(announcementDraft)];else throw new Error('Solo puedes crear 4 anuncios.');await saveAnnouncements();await clearAnnouncementDraft();window.__sfAnnouncementEditorOpen=false;const savedName=announcementDraft.name||'Anuncio';announcementDraft=null;announcementEditingId='';announcementActiveSlide=0;announcementActiveText=0;renderWidgets();toast('Anuncio guardado',`“${savedName}” quedó guardado en tu cuenta.`);}catch(e){toast('No se pudo guardar',e.message||'Error','err');}};
    $('openAnnouncementOverlay').onclick=async()=>{try{
      const saved= (settings.announcements||[]).some(x=>String(x.id)===String(announcementDraft.id));
      if(!saved && !announcementDraftApplied){toast('Aplica los cambios primero','Pulsa “Aplicar cambios” para preparar el anuncio antes de generar su overlay.','err');return;}
      if(!saved) await saveAnnouncementDraftNow();
      const popupName='streamfusionAnnouncement_'+String(announcementDraft.id);
      const popup=window.open('about:blank',popupName,'popup=yes,width=1280,height=720,resizable=yes,scrollbars=yes');
      if(!popup){toast('Ventana bloqueada','Permite ventanas emergentes para abrir el overlay.','err');return;}
      popupWindows.add(popup);
      const url=await buildOverlayUrl(`announcement-overlay.html?announcementId=${encodeURIComponent(announcementDraft.id)}&draft=1`);
      announcementDraft.overlayUrl=url;
      const link=$('announcementOverlayLinkPreview');if(link)link.textContent=url;
      if(!popup.closed) popup.location.replace(url);
      try{popup.focus();}catch{}
      toast('Overlay listo','Este anuncio reutiliza siempre el mismo overlay; los cambios guardados se reflejan en tiempo real.');
    }catch(e){toast('Overlay',e.message||'No se pudo generar el overlay.','err');}};
  }
  function hideAnnouncementPreviewCanvas(){const host=$('announcementCanvas');if(host)host.replaceChildren();}
  function stopAnnouncementPreview(){if(announcementPreviewTimer){clearTimeout(announcementPreviewTimer);announcementPreviewTimer=0;}announcementPreviewRunning=false;const btn=$('viewAnnouncement');if(btn)btn.textContent='▶ Simular anuncio';hideAnnouncementPreviewCanvas();renderAnnouncementPreview();}
  function toggleAnnouncementPreview(){
    if(!announcementDraft)return;
    if(announcementPreviewRunning){stopAnnouncementPreview();return;}
    announcementPreviewRunning=true;
    const btn=$('viewAnnouncement');if(btn)btn.textContent='■ Detener simulación';
    let index=0;
    const run=()=>{
      if(!announcementPreviewRunning)return;
      if(index>=announcementDraft.slides.length){
        hideAnnouncementPreviewCanvas();
        const wait=Math.max(0,Number(announcementDraft.repeatEvery)||0)*1000;
        announcementPreviewTimer=setTimeout(()=>{index=0;run();},wait);
        return;
      }
      announcementActiveSlide=index;
      renderAnnouncementPreview();
      const sl=announcementDraft.slides[index];
      announcementPreviewTimer=setTimeout(()=>{index+=1;run();},Math.max(.5,Number(sl.showSeconds)||.5)*1000);
    };
    run();
  }
  async function renderAnnouncementHub(){
    ensureAnnouncementFonts();
    const list=Array.isArray(settings.announcements)?settings.announcements:[];
    const draft=await loadAnnouncementDraft();
    if(draft){
      announcementDraft=ensureAnnouncementConfig(structuredClone(draft));
      announcementEditingId=(list.some(x=>String(x.id)===String(draft.id))?String(draft.id):'');
      announcementActiveSlide=0; announcementActiveText=0;
      window.__sfAnnouncementEditorOpen=true; window.__sfAnnouncementHubOpen=false;
      renderWidgets();
      return;
    }
    $('view').innerHTML=`<div class="intro split"><div><p class="eyebrow">WIDGET / ANUNCIO</p><h2>Anuncios</h2><p>Crea hasta 4 anuncios independientes. Cada anuncio tiene su propio overlay, pero todos pertenecen a tu cuenta.</p></div><button class="btn secondary widget-back-btn" id="backToWidgetsRootFromAnnouncements">← Volver a Widgets</button></div><div class="sf-ann-list">${list.map(a=>`<button type="button" class="card widget-launch-card widget-launch-card-announcement sf-ann-saved" data-ann-id="${esc(a.id)}"><span class="widget-launch-icon">📢</span><span class="widget-launch-copy"><span class="widget-launch-kicker">ANUNCIO</span><strong class="widget-launch-title">${esc(a.name||'Anuncio')}</strong><small class="widget-launch-desc">${Math.min(3,(a.slides||[]).length)} parte(s) · cada ${Number(a.repeatEvery||0)}s · ${a.enabled!==false?'Activo':'Pausado'}</small></span><span class="widget-launch-arrow">→</span></button>`).join('')}<button type="button" class="card widget-launch-card widget-launch-card-announcement sf-ann-create ${list.length>=4?'is-disabled':''}" id="createAnnouncement" ${list.length>=4?'disabled':''}><span class="widget-launch-icon">＋</span><span class="widget-launch-copy"><span class="widget-launch-kicker">CREAR</span><strong class="widget-launch-title">Crear Anuncio</strong><small class="widget-launch-desc">${list.length}/4 anuncios creados</small></span><span class="widget-launch-arrow">→</span></button></div>`;
    document.querySelectorAll('.sf-ann-saved').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.annId;const found=list.find(x=>String(x.id)===String(id));if(!found)return;announcementDraft=ensureAnnouncementConfig(structuredClone(found));announcementEditingId=String(found.id);announcementActiveSlide=0;window.__sfAnnouncementEditorOpen=true;window.__sfAnnouncementHubOpen=false;stopAnnouncementPreview();renderWidgets();});
    $('createAnnouncement').onclick=async()=>{if(list.length>=4)return;await clearAnnouncementDraft();announcementDraft=defaultAnnouncement(`Anuncio ${list.length+1}`);announcementEditingId='';announcementActiveSlide=0;announcementActiveText=0;window.__sfAnnouncementEditorOpen=true;window.__sfAnnouncementHubOpen=false;stopAnnouncementPreview();renderWidgets();};
    $('backToWidgetsRootFromAnnouncements').onclick=()=>{window.__sfAnnouncementHubOpen=false;renderWidgets();};
  }

  const MUSIC_PREFIX_OPTIONS = ['!','/','.','-'];
  const MUSIC_REQUEST_OPTIONS = ['S','song','m','musica'];
  const MUSIC_ADMIN_COMMANDS = { pause:['pausar','pausa','pause'], stop:['stop','detener'], skip:['skip','saltar','siguiente','next'], repeat:['repeat','repetir'], volume:['volumen','audio','vol','v'] };
  function musicDefault(){return {enabled:true,commandPrefix:'!',requestCommand:'musica',requestCommandPreset:'musica',pointCost:100,maxDurationSeconds:300,maxQueue:10,showNext:true,showProgress:true,showRequester:true,allowModeratorCommands:false,adminCommandPrefixes:{pause:'!',stop:'!',skip:'!',repeat:'!',volume:'!'},adminCommands:{pause:'pausa',stop:'detener',skip:'siguiente',repeat:'repetir',volume:'vol'},style:{scale:1,accent:'#8b5cf6',accent2:'#ec4899',progressMode:'gradient2',progressColor:'#8b5cf6',progressColor2:'#ec4899',progressColor3:'#22d3ee',textColor:'#ffffff',secondaryTextColor:'#b9b9c8',titleFont:'Inter',artistFont:'Inter',titleSize:28,artistSize:15,vinylSize:170,design:'vinyl-glow',showVinyl:true}};}
  const MUSIC_DESIGN_OPTIONS=[
    ['vinyl-glow','Vinil Glow'],['minimal','Minimal'],['neon-ring','Neon Ring'],['retro','Retro'],['mono','Monocromo'],['glass','Glass Aura'],['cyber','Cyber Pulse'],['sunset','Sunset Wave'],['arcade','Arcade'],['arcade-glass','Arcade + Glass Aura'],['aurora','Aurora Bloom'],['synthwave','Synthwave 80s'],['hologram','Hologram'],['matrix','Matrix'],['oceanic','Oceanic'],['fire','Inferno'],['candy','Candy Pop'],['monochrome-glow','Mono Glow'],['blueprint','Blueprint'],['terminal','Terminal'],
    ['crystal-glass','Crystal Glass'],['rose-aurora','Rose Aurora'],['midnight-luxe','Midnight Luxe'],['plasma-core','Plasma Core'],['mint-mist','Mint Mist'],['ice-chrome','Ice Chrome'],['golden-hour','Golden Hour'],['ruby-noir','Ruby Noir'],['vapor-dream','Vapor Dream'],['cosmic-bloom','Cosmic Bloom'],
    ['glow-wave','Glow Wave'],['rgb-pulse','RGB Pulse'],['chrome-neon','Chrome Neon'],['rose-glass','Rose Glass'],['electric-lime','Electric Lime'],['violet-wave','Violet Wave'],['pixel-glass','Pixel Glass'],['infrared','Infrared'],['spectrum','Spectrum'],['liquid-glass','Liquid Glass']
  ];
  function musicDesignOptions(selected){return MUSIC_DESIGN_OPTIONS.map(([v,l])=>`<option value="${esc(v)}" ${String(selected||'vinyl-glow')===v?'selected':''}>${esc(l)}</option>`).join('');}
  let musicAutoSaveTimer=0;
  function scheduleMusicAutoSave(cfg){
    clearTimeout(musicAutoSaveTimer);
    musicAutoSaveTimer=setTimeout(async()=>{
      try{
        const normalized=structuredClone(cfg);
        const data=await api('/api/music/settings',{method:'PUT',body:JSON.stringify({music:normalized})});
        settings.musicWidget=data.music;
        if(window.__sfMusicWidgetEditorOpen) musicWidgetDraft=musicMerge(musicDefault(),musicWidgetDraft||data.music);
        const note=$('musicAutoSaveStatus');
        if(note){note.textContent='● Guardado automáticamente';note.classList.remove('is-saving');}
      }catch(e){
        const note=$('musicAutoSaveStatus');
        if(note){note.textContent='● Cambios pendientes de guardar';note.classList.add('is-saving');}
      }
    },550);
    const note=$('musicAutoSaveStatus');
    if(note){note.textContent='● Guardando automáticamente…';note.classList.add('is-saving');}
  }
  function musicMerge(base,extra){return {...base,...(extra||{}),adminCommandPrefixes:{...base.adminCommandPrefixes,...(extra?.adminCommandPrefixes||{})},adminCommands:{...base.adminCommands,...(extra?.adminCommands||{})},style:{...base.style,...(extra?.style||{})}};}
  function musicTime(sec){const n=Math.max(0,Math.floor(Number(sec)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
  function musicDemoThumb(){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".55" stop-color="#ec4899"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="240" height="240" rx="120" fill="#111827"/><circle cx="120" cy="120" r="92" fill="url(#g)" opacity=".95"/><circle cx="120" cy="120" r="34" fill="#0b1020"/><circle cx="120" cy="120" r="8" fill="#fff" opacity=".9"/><path d="M35 70c55-43 119-43 170 4" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="9" stroke-linecap="round"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  function musicDemoTrack(){
    return {id:'music-preview-demo',title:'Tu canción aparecerá aquí',artist:'Artista / canal',thumbnail:musicDemoThumb(),duration:214,requester:'Vista previa',platform:'demo',url:''};
  }
  let musicPreviewVinylTrackKey='';
  let musicPreviewVinylLastElapsed=0;
  const MUSIC_VINYL_SPIN_SECONDS=9;
  function musicPreviewVinylPhase(elapsed){ const e=Math.max(0,Number(elapsed)||0); return -(e%MUSIC_VINYL_SPIN_SECONDS); }
  function syncMusicPreviewVinyl({force=false}={}){
    const host=$('musicPreview'); const vinyl=host?.querySelector('.sf-music-vinyl'); if(!vinyl)return;
    const st=musicPreviewState||{}, t=st.current||null;
    const key=t?`${t.id||''}|${t.sourceId||''}`:'';
    const elapsed=Math.max(0,Number(st.elapsed||0));
    const playing=Boolean(st.playing&&!st.paused);
    const trackChanged=key!==musicPreviewVinylTrackKey;
    const correction=Math.abs(elapsed-musicPreviewVinylLastElapsed);
    if(force||trackChanged||!playing||correction>1.25){ vinyl.style.animationDelay=`${musicPreviewVinylPhase(elapsed)}s`; musicPreviewVinylTrackKey=key; }
    vinyl.classList.toggle('is-spinning',playing);
    musicPreviewVinylLastElapsed=elapsed;
  }
  function musicProgressBackground(cfg){
    const st=cfg.style||{}; const mode=['single','gradient2','gradient3'].includes(st.progressMode)?st.progressMode:'gradient2';
    const c1=st.progressColor||st.accent||'#8b5cf6', c2=st.progressColor2||st.accent2||'#ec4899', c3=st.progressColor3||'#22d3ee';
    if(mode==='single') return `linear-gradient(90deg,${c1},${c1})`;
    if(mode==='gradient3') return `linear-gradient(90deg,${c1},${c2},${c3})`;
    return `linear-gradient(90deg,${c1},${c2})`;
  }
  function musicPreviewMarkup(cfg,state={current:null,queue:[]} ,opts={}){
    const t=state.current || (opts.demo!==false ? musicDemoTrack() : null); const q=state.queue||[]; if(!t)return `<div class="music-preview-empty"><span>♫</span><strong>Sin reproducción</strong><small>La reproducción aparecerá aquí cuando llegue una solicitud.</small></div>`;
    const scale=Math.max(.45,Math.min(2,Number(cfg.style?.scale||1))); const a=cfg.style?.accent||'#8b5cf6', a2=cfg.style?.accent2||'#ec4899'; const text=cfg.style?.textColor||'#fff', secondary=cfg.style?.secondaryTextColor||'#b9b9c8'; const titleFont=cfg.style?.titleFont||'Inter', artistFont=cfg.style?.artistFont||'Inter'; const titleSize=Number(cfg.style?.titleSize||28), artistSize=Number(cfg.style?.artistSize||15), vinylSize=Number(cfg.style?.vinylSize||170); const elapsed=Number(state.elapsed||0); const duration=Math.max(1,Number(t.duration||214)); const progress=Math.max(0,Math.min(100,elapsed/duration*100)); const design=cfg.style?.design||'vinyl-glow'; const progressBg=musicProgressBackground(cfg); const isPlaying=Boolean(state.playing&&!state.paused); const toggleLabel=isPlaying?'Pausar':'Reproducir'; const toggleIcon=isPlaying?'Ⅱ':'▶';
    return `<div class="sf-music-shell design-${esc(design)}" style="--music-accent:${esc(a)};--music-accent2:${esc(a2)};--music-text:${esc(text)};--music-secondary:${esc(secondary)};--music-title-font:${esc(titleFont)};--music-artist-font:${esc(artistFont)};--music-title-size:${titleSize}px;--music-artist-size:${artistSize}px;--music-vinyl-size:${vinylSize}px;--music-progress-bg:${esc(progressBg)};--music-scale:${scale}">
      <div class="sf-music-orbit">
        ${cfg.style?.showVinyl!==false?`<div class="sf-music-disc-glow"></div><div class="sf-music-vinyl ${isPlaying?'is-spinning':''}" style="animation-delay:${musicPreviewVinylPhase(elapsed)}s"><div class="sf-music-disc-art"><img src="${esc(t.thumbnail||'')}" alt=""></div><div class="sf-music-grooves"></div><span class="sf-music-reflection"></span><span class="sf-music-edge-glow"></span><span class="sf-music-hole"></span></div>`:''}
        <div class="sf-music-info"><div class="sf-music-kicker"><span class="sf-music-live-dot"></span><span data-music-kicker>${state.paused?'PAUSADO':state.current?(isPlaying?'AHORA SONANDO':'LISTO PARA REPRODUCIR'):'VISTA PREVIA'}</span></div><h3 data-music-title>${esc(t.title||'Canción')}</h3><p data-music-artist>${esc(t.artist||'Artista')}</p>${cfg.showProgress!==false?`<div class="sf-music-progress"><span data-music-progress style="width:${progress}%;background:${esc(progressBg)};"></span></div><div class="sf-music-time-row"><span data-music-elapsed>${musicTime(elapsed)}</span><div class="sf-music-controls"><button type="button" class="sf-music-nav is-hidden" data-music-prev title="Retroceder" aria-label="Retroceder">‹</button><button type="button" class="sf-music-play" data-music-preview-toggle title="${toggleLabel}" aria-label="${toggleLabel}">${toggleIcon}</button><button type="button" class="sf-music-nav" data-music-next title="Siguiente" aria-label="Siguiente">›</button></div><span data-music-duration>${musicTime(duration)}</span></div>`:''}${cfg.showRequester!==false?`<small class="sf-music-requester" data-music-requester>Solicitada por ${esc(t.requester||'Usuario')}</small>`:''}</div>
      </div>
      ${cfg.showNext!==false&&q[0]?`<div class="sf-music-next"><span>SIGUIENTE</span><strong>${esc(q[0].title||'Siguiente canción')}</strong><small>${esc(q[0].artist||'Artista')}</small></div>`:''}
    </div>`;
  }
  let musicPlaylistRenderKey='';
  function renderMusicPlaylistPanel(){
    const host=$('musicPlaylistList'), count=$('musicPlaylistCount'); if(!host)return;
    const current=musicPreviewState?.current||null; const q=Array.isArray(musicPreviewState?.queue)?musicPreviewState.queue:[];
    const key=`${current?.id||''}:${current?.sourceId||''}|${q.map(t=>`${t.id}:${t.sourceId||''}`).join('|')}`;
    if(count)count.textContent=`${q.length} / 10`;
    if(key===musicPlaylistRenderKey){ return; }
    musicPlaylistRenderKey=key;
    const rows=[];
    if(current) rows.push(`<div class="music-playlist-item is-current" data-music-item="${esc(current.id)}" tabindex="0" role="button"><span class="music-playlist-index">▶</span><div class="music-playlist-thumb">${current.thumbnail?`<img src="${esc(current.thumbnail)}" alt="">`:'♫'}</div><div class="music-playlist-copy"><strong>${esc(current.title||'Canción')}</strong><small>${esc(current.artist||'Artista')} · AHORA</small></div><span></span></div>`);
    rows.push(...q.map((t,i)=>`<div class="music-playlist-item" data-music-item="${esc(t.id)}" tabindex="0" role="button"><span class="music-playlist-index">${i+1}</span><div class="music-playlist-thumb">${t.thumbnail?`<img src="${esc(t.thumbnail)}" alt="">`:'♫'}</div><div class="music-playlist-copy"><strong>${esc(t.title||'Canción')}</strong><small>${esc(t.artist||'Artista')}</small></div><button class="music-playlist-remove" type="button" data-music-remove="${esc(t.id)}" title="Quitar">×</button></div>`));
    if(!rows.length){host.innerHTML='<div class="music-playlist-empty">Agrega canciones para verlas aquí.</div>';return;}
    host.innerHTML=rows.join('');
    host.querySelectorAll('[data-music-remove]').forEach(btn=>btn.onclick=(ev)=>{ev.stopPropagation();removeMusicPlaylistTrack(btn.dataset.musicRemove);});
    host.querySelectorAll('[data-music-item]').forEach(item=>{
      const select=()=>{host.querySelectorAll('[data-music-item].is-selected').forEach(x=>x.classList.remove('is-selected'));item.classList.add('is-selected');};
      item.addEventListener('click',select);
      item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
    });
  }
  function musicServerSyncElapsed(snap){
    const base=Math.max(0,Number(snap?.elapsed||0));
    if(snap?.paused || !snap?.playing) return base;
    const startedAt=Number(snap?.startedAt||0);
    if(startedAt>0){
      return Math.max(0,(Date.now()-startedAt)/1000);
    }
    const serverNow=Number(snap?.serverNow||0);
    return serverNow>0 ? Math.max(0,base+(Date.now()-serverNow)/1000) : base;
  }
  function pushPreviewState(extra={}){
    musicPreviewState={...musicPreviewState,...extra,queue:Array.isArray(extra.queue??musicPreviewState.queue)?(extra.queue??musicPreviewState.queue).slice(0,10):[],simulated:true};
    musicPreviewState.queue=musicPreviewState.queue.map(t=>({...t,requester:'Simulación',source:'simulation'}));
    musicPreviewDraw(musicPreviewState);
    socket?.emit?.('music:previewState',structuredClone(musicPreviewState));
  }
  function emitMusicAppearanceSync(){
    if(!musicWidgetDraft)return;
    socket?.emit?.('music:previewSettings',structuredClone(musicWidgetDraft));
    socket?.emit?.('music:appearanceSync',structuredClone(musicWidgetDraft));
  }
  async function resolveSimulationTrack(query){
    const data=await api('/api/music/preview-track',{method:'POST',body:JSON.stringify({query})});
    if(!data?.track?.sourceId)throw new Error('No se pudo obtener un video de YouTube reproducible.');
    return data.track;
  }
  async function addMusicTrackToPlaylist(){
    const input=$('musicSimulationQuery'),query=String(input?.value||'').trim(),status=$('musicSimulationStatus');
    if(!query){status&&(status.textContent='Escribe una canción o pega una URL para agregarla.');status?.classList.remove('is-hidden','is-loading');return;}
    if((musicPreviewState.queue||[]).length>=10){toast('Playlist','Solo puedes agregar 10 canciones.','err');return;}
    if(status){status.textContent='Buscando canción para la playlist…';status.classList.remove('is-hidden');status.classList.add('is-loading');}
    try{const track=await resolveSimulationTrack(query);const q=[...(musicPreviewState?.simulated?musicPreviewState.queue:[])];if(q.some(x=>String(x.sourceId)===String(track.sourceId)) || String(musicPreviewState?.current?.sourceId||'')===String(track.sourceId)){throw new Error('Esa canción ya está en la playlist.');}q.push({...track,requester:'Simulación',source:'simulation'});pushPreviewState({queue:q});if(status){status.textContent=`Agregada a simulación y a Playlist de directo (${q.length}/10)`;status.classList.remove('is-loading');} }catch(e){if(status){status.textContent=e?.message||'No se pudo agregar la canción.';status.classList.remove('is-loading','is-hidden');}toast('Playlist',e?.message||'No se pudo agregar la canción.','err');}
  }
  function removeMusicPlaylistTrack(id){const q=(musicPreviewState.queue||[]).filter(t=>String(t.id)!==String(id));pushPreviewState({queue:q});}
  async function previewAdvance(direction=1){
    const current=musicPreviewState.current;
    if(direction>0){
      const next=(musicPreviewState.queue||[])[0]; if(!next)return;
      const q=(musicPreviewState.queue||[]).slice(1);
      const previous=current||null;
      musicPreviewState={...musicPreviewState,current:next,queue:q,previous,elapsed:0,playing:true,paused:false,simulated:true};
      musicPreviewDraw(musicPreviewState);
      await loadMusicPreviewYouTube(next,true);
      socket?.emit?.('music:simulate',{title:next.title,artist:next.artist,thumbnail:next.thumbnail,duration:next.duration,url:next.url,sourceId:next.sourceId,queue:q,previous});
      pushPreviewState({current:next,queue:q,previous,elapsed:0,playing:true,paused:false});
      return;
    }
    const prev=musicPreviewState.previous; if(!prev)return;
    const currentTrack=current;
    const q=[...(musicPreviewState.queue||[])];
    if(currentTrack)q.unshift(currentTrack);
    musicPreviewState={...musicPreviewState,current:prev,queue:q.slice(0,10),previous:null,elapsed:0,playing:true,paused:false,simulated:true};
    musicPreviewDraw(musicPreviewState);
    await loadMusicPreviewYouTube(prev,true);
    socket?.emit?.('music:simulate',{title:prev.title,artist:prev.artist,thumbnail:prev.thumbnail,duration:prev.duration,url:prev.url,sourceId:prev.sourceId,queue:q.slice(0,10),previous:null});
    pushPreviewState({current:prev,queue:q.slice(0,10),previous:null,elapsed:0,playing:true,paused:false});
  }
  function updatePreviewNavButtons(){const shell=$('musicPreview')?.querySelector('.sf-music-shell');if(!shell)return;const prev=shell.querySelector('[data-music-prev]'),next=shell.querySelector('[data-music-next]');prev?.classList.toggle('is-hidden',!musicPreviewState?.previous);if(next)next.disabled=!(musicPreviewState?.queue?.length);}
  const MUSIC_PREVIEW_VINYL_DURATION=9000;
  function syncMusicPreviewVinylAnimation(elapsed=0, playing=false, trackKey=''){
    const vinyl=document.querySelector('#musicPreview .sf-music-vinyl');
    if(!vinyl)return;
    const key=String(trackKey||'');
    let anim=vinyl.__sfSpinAnimation;
    if(!anim){
      try{
        anim=vinyl.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:MUSIC_PREVIEW_VINYL_DURATION,iterations:Infinity,easing:'linear'});
        vinyl.__sfSpinAnimation=anim;
      }catch{ anim=null; }
    }
    const duration=MUSIC_PREVIEW_VINYL_DURATION;
    const phase=((Math.max(0,Number(elapsed)||0)*1000)%duration+duration)%duration;
    const sameTrack=vinyl.dataset.phaseTrack===key && vinyl.dataset.phaseReady==='1';
    if(!sameTrack){
      vinyl.dataset.phaseTrack=key;
      vinyl.dataset.phaseReady='1';
      if(anim){ try{anim.currentTime=phase;}catch{} }
      vinyl.style.animation='none';
    }
    if(anim){
      try{
        anim.playbackRate=1;
        // Keep the preview vinyl phase tied to the real YouTube clock, but only
        // correct when the drift is large enough to be visible. This prevents
        // the tiny "snap" that appears when the player reports time with jitter.
        const animTime=Number(anim.currentTime||0);
        const phaseDelta=Math.abs(animTime-phase);
        if(phaseDelta>450 || !Number.isFinite(animTime)) anim.currentTime=phase;
        if(playing)anim.play(); else anim.pause();
      }catch{}
    }else{
      vinyl.style.animationDelay=`-${(phase/1000).toFixed(3)}s`;
      vinyl.style.animationPlayState=playing?'running':'paused';
    }
  }

  function updateMusicPreviewDynamic(){
    const host=$('musicPreview'); if(!host)return; const shell=host.querySelector('.sf-music-shell'); if(!shell)return;
    const st=musicPreviewState||{}; const t=st.current||musicDemoTrack();
    const liveElapsed=musicWidgetSimulating && musicPreviewYTPlayer && typeof musicPreviewYTPlayer.getCurrentTime==='function' ? Number(musicPreviewYTPlayer.getCurrentTime()||0) : Number(st.elapsed||0);
    const elapsed=Math.max(0,liveElapsed), duration=Math.max(1,Number(t.duration||214)); const progress=Math.max(0,Math.min(100,elapsed/duration*100)); const playing=Boolean(musicWidgetSimulating && musicPreviewYTPlayer ? musicPreviewYTPlayer.getPlayerState?.()===window.YT?.PlayerState?.PLAYING : (st.playing&&!st.paused));
    const prog=shell.querySelector('[data-music-progress]'); if(prog)prog.style.width=`${progress}%`;
    const te=shell.querySelector('[data-music-elapsed]'); if(te)te.textContent=musicTime(elapsed);
    const td=shell.querySelector('[data-music-duration]'); if(td)td.textContent=musicTime(duration);
    const kicker=shell.querySelector('[data-music-kicker]'); if(kicker)kicker.textContent=st.paused?'PAUSADO':st.current?(playing?'AHORA SONANDO':'LISTO PARA REPRODUCIR'):'VISTA PREVIA';
    const b=shell.querySelector('[data-music-preview-toggle]'); if(b){b.textContent=playing?'Ⅱ':'▶'; b.title=playing?'Pausar':'Reproducir'; b.setAttribute('aria-label',playing?'Pausar':'Reproducir'); b.disabled=false;}
    const vinyl=shell.querySelector('.sf-music-vinyl'); if(vinyl){ const correction=Math.abs(elapsed-musicPreviewVinylLastElapsed); const key=t?`${t.id||''}|${t.sourceId||''}`:''; if(key!==musicPreviewVinylTrackKey||!playing||correction>1.25){ vinyl.style.animationDelay=`${musicPreviewVinylPhase(elapsed)}s`; musicPreviewVinylTrackKey=key; } vinyl.classList.toggle('is-spinning',playing); musicPreviewVinylLastElapsed=elapsed; } updatePreviewNavButtons(); renderMusicPlaylistPanel();
  }
  function applyMusicPreviewAppearance(){
    const host=$('musicPreview'), shell=host?.querySelector('.sf-music-shell');
    if(!shell)return;
    const cfg=musicWidgetDraft||musicDefault(), st=cfg.style||{};
    const scale=Math.max(.45,Math.min(2,Number(st.scale||1)));
    const progressBg=musicProgressBackground(cfg);
    const allowedDesigns=new Set(MUSIC_DESIGN_OPTIONS.map(([value])=>value));
    const design=allowedDesigns.has(String(st.design))?String(st.design):'vinyl-glow';
    const previousDesign=shell.className;
    shell.className=`sf-music-shell design-${design}`;
    shell.style.setProperty('--music-accent',st.accent||'#8b5cf6');
    shell.style.setProperty('--music-accent2',st.accent2||'#ec4899');
    shell.style.setProperty('--music-text',st.textColor||'#fff');
    shell.style.setProperty('--music-secondary',st.secondaryTextColor||'#b9b9c8');
    shell.style.setProperty('--music-title-font',st.titleFont||'Inter');
    shell.style.setProperty('--music-artist-font',st.artistFont||'Inter');
    shell.style.setProperty('--music-title-size',`${Number(st.titleSize||28)}px`);
    shell.style.setProperty('--music-artist-size',`${Number(st.artistSize||15)}px`);
    shell.style.setProperty('--music-vinyl-size',`${Number(st.vinylSize||170)}px`);
    shell.style.setProperty('--music-progress-bg',progressBg);
    shell.style.setProperty('--music-scale',String(scale));
    shell.style.transform=`scale(${scale})`;
    shell.style.transformOrigin='center center';
    const vinyl=shell.querySelector('.sf-music-vinyl'); if(vinyl)vinyl.style.display=st.showVinyl===false?'none':'';
    const progress=shell.querySelector('.sf-music-progress'); if(progress)progress.style.display=cfg.showProgress===false?'none':'';
    const requester=shell.querySelector('[data-music-requester]'); if(requester)requester.style.display=cfg.showRequester===false?'none':'';
    const next=shell.querySelector('.sf-music-next'); if(next)next.style.display=cfg.showNext===false?'none':'';
    const title=shell.querySelector('[data-music-title]'); if(title){title.style.fontFamily=`${st.titleFont||'Inter'},Inter,sans-serif`;title.style.fontSize=`${Number(st.titleSize||28)}px`;title.style.color=st.textColor||'#fff';}
    const artist=shell.querySelector('[data-music-artist]'); if(artist){artist.style.fontFamily=`${st.artistFont||'Inter'},Inter,sans-serif`;artist.style.fontSize=`${Number(st.artistSize||15)}px`;artist.style.color=st.secondaryTextColor||'#b9b9c8';}
    shell.querySelectorAll('[data-music-progress]').forEach(bar=>{bar.style.background=progressBg});
    const designChanged=previousDesign!==shell.className;
    if(designChanged){
      // Changing appearance must not restart the turntable. Keep the current
      // phase/elapsed position and only refresh the non-visual state.
      syncMusicPreviewVinyl({force:false});
    }
    updateMusicPreviewDynamic();
  }

  function musicPreviewDraw(state=musicPreviewState,opts={demo:true}){
    const host=$('musicPreview'); if(!host)return;
    musicPreviewState=structuredClone(state||{});
    const cfg=musicWidgetDraft||musicDefault();
    host.innerHTML=musicPreviewMarkup(cfg,musicPreviewState,opts)+`<span class="music-resize-handle" id="musicResizeHandle" title="Redimensionar"></span>`;
    bindMusicResizeHandle();
    host.querySelector('[data-music-preview-toggle]')?.addEventListener('click',toggleMusicPreviewPlayback);
    host.querySelector('[data-music-prev]')?.addEventListener('click',()=>previewAdvance(-1));
    host.querySelector('[data-music-next]')?.addEventListener('click',()=>previewAdvance(1));
    applyMusicPreviewAppearance();
    renderMusicPlaylistPanel();
  }
  function bindMusicResizeHandle(){const h=$('musicResizeHandle');const host=$('musicPreview');if(!h||!host)return;h.onpointerdown=(ev)=>{ev.preventDefault();ev.stopPropagation();const sx=ev.clientX,sy=ev.clientY,s0=Number(musicWidgetDraft?.style?.scale||1);const move=e=>{const delta=((e.clientX-sx)+(e.clientY-sy))/520;const next=Math.max(.45,Math.min(2,s0+delta));musicWidgetDraft.style.scale=Number(next.toFixed(2));const scaleEl=$('musicScale');if(scaleEl)scaleEl.value=String(musicWidgetDraft.style.scale);const valueEl=$('musicScaleValue');if(valueEl)valueEl.textContent=`${Math.round(musicWidgetDraft.style.scale*100)}%`;musicPreviewDraw(musicPreviewState);};const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});};}
  function stopMusicWidgetSimulation(){clearInterval(musicWidgetSimTimer);musicWidgetSimTimer=0;musicWidgetSimulating=false;musicSimulationTrack=null;try{musicPreviewYTPlayer?.stopVideo?.();}catch{}socket?.emit?.('music:simulateStop');musicPreviewState={current:null,queue:[],previous:null,elapsed:0,playing:false,paused:false};musicPreviewDraw(musicPreviewState,{demo:true}); $('musicSimulate')?.classList.remove('is-hidden'); $('musicStopSimulation')?.classList.add('is-hidden'); $('musicSimulationStatus')?.classList.remove('is-loading'); $('musicSimulationStatus')?.classList.add('is-hidden');}
  function ensureMusicYouTubeAPI(){
    if(window.YT?.Player) return Promise.resolve(window.YT);
    if(musicPreviewYTPromise) return musicPreviewYTPromise;
    musicPreviewYTPromise=new Promise((resolve,reject)=>{
      const previous=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{try{previous?.();}catch{};musicPreviewYTReady=true;resolve(window.YT);};
      const existing=document.querySelector('script[data-sf-youtube-api]');
      if(existing){existing.addEventListener('load',()=>{if(window.YT?.Player){musicPreviewYTReady=true;resolve(window.YT);}});return;}
      const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.dataset.sfYoutubeApi='1';script.onerror=()=>{musicPreviewYTPromise=null;reject(new Error('No se pudo cargar el reproductor de YouTube.'));};document.head.appendChild(script);
    });
    return musicPreviewYTPromise;
  }
  function ensureMusicPreviewPlayer(){
    return ensureMusicYouTubeAPI().then(()=>{
      if(musicPreviewYTPlayer)return musicPreviewYTPlayer;
      let host=document.getElementById('musicPreviewYoutubeHost');
      if(!host){host=document.createElement('div');host.id='musicPreviewYoutubeHost';host.className='music-youtube-hidden-host';document.body.appendChild(host);}
      return new Promise((resolve,reject)=>{try{musicPreviewYTPlayer=new YT.Player(host,{width:'200',height:'200',videoId:'',playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,playsinline:1,rel:0,modestbranding:1,iv_load_policy:3,origin:location.origin},events:{onReady:()=>{musicPreviewYTReady=true;resolve(musicPreviewYTPlayer);},onStateChange:e=>{if(!musicWidgetSimulating||!musicPreviewYTPlayer)return;const st=e?.data;if(st===YT.PlayerState.PLAYING)musicPreviewState={...musicPreviewState,playing:true,paused:false,simulated:true};else if(st===YT.PlayerState.PAUSED)musicPreviewState={...musicPreviewState,playing:false,paused:true,simulated:true};else if(st===YT.PlayerState.ENDED){const dur=Number(musicPreviewState.current?.duration||musicSimulationTrack?.duration||musicPreviewYTPlayer.getDuration?.()||0);musicPreviewState={...musicPreviewState,elapsed:dur,playing:false,paused:true,simulated:true};updateMusicPreviewDynamic();if((musicPreviewState.queue||[]).length){setTimeout(()=>previewAdvance(1),120);} }updateMusicPreviewDynamic();},onError:e=>{const status=$('musicSimulationStatus');if(status){status.textContent=`YouTube no puede reproducir este vídeo (código ${Number(e?.data||0)}). Prueba otra canción.`;status.classList.remove('is-loading','is-hidden');}musicWidgetSimulating=false;updateMusicPreviewDynamic();}}});}catch(e){reject(e);}});
    });
  }
  async function loadMusicPreviewYouTube(track,autoplay=true,startSeconds=null){const player=await ensureMusicPreviewPlayer();const videoId=String(track?.sourceId||'').trim();if(!videoId)throw new Error('La canción no tiene un videoId de YouTube.');musicPreviewYTVideoId=videoId;const fallback=Math.max(0,Number(musicPreviewState?.elapsed||0));const seconds=Math.max(0,Number(startSeconds==null?fallback:startSeconds)||0);player.loadVideoById({videoId,startSeconds:seconds});if(!autoplay)player.pauseVideo();}
  function startMusicPreviewClock(){
    if(musicWidgetSimTimer)return;
    musicWidgetSimTimer=setInterval(()=>{
      if(!musicWidgetSimulating||!musicPreviewYTPlayer)return;
      const current=musicPreviewState?.current||musicSimulationTrack; if(!current)return;
      const e=Number(musicPreviewYTPlayer.getCurrentTime?.()||0),d=Math.max(1,Number(musicPreviewYTPlayer.getDuration?.()||current.duration||1));
      const max=Number(musicPreviewState.current?.duration||d); const ps=musicPreviewYTPlayer.getPlayerState?.();
      musicPreviewState={...musicPreviewState,elapsed:Math.min(Math.max(0,e),max),playing:ps===YT.PlayerState.PLAYING,paused:ps===YT.PlayerState.PAUSED,simulated:true};
      updateMusicPreviewDynamic();
    },500);
  }
  async function toggleMusicPreviewPlayback(){
    if(!musicWidgetSimulating||!musicSimulationTrack){
      const input=$('musicSimulationQuery'); const query=String(input?.value||'').trim();
      if(query){ await startMusicWidgetSimulation(); return; }
      const status=$('musicSimulationStatus');
      if(status){ status.textContent='Escribe una canción o pega una URL para reproducirla.'; status.classList.remove('is-hidden','is-loading'); }
      input?.focus(); return;
    }
    try {
      const player=musicPreviewYTPlayer || await ensureMusicPreviewPlayer();
      if(!player) throw new Error('El reproductor de vista previa todavía no está listo.');
      const yt=window.YT;
      const ps=player.getPlayerState?.();
      const currentTime=Number(player.getCurrentTime?.()||musicPreviewState.elapsed||0);
      const shouldPause=yt?.PlayerState ? ps===yt.PlayerState.PLAYING : Boolean(musicPreviewState.playing&&!musicPreviewState.paused);
      if(shouldPause){
        player.pauseVideo?.();
        musicPreviewState={...musicPreviewState,elapsed:currentTime,playing:false,paused:true,simulated:true};
        socket?.emit?.('music:previewState',structuredClone(musicPreviewState));
      } else {
        // Do not optimistically redraw the whole widget. Let YouTube confirm
        // PLAYING first so the button and clock never fight the iframe state.
        player.playVideo?.();
        musicPreviewState={...musicPreviewState,elapsed:currentTime,playing:true,paused:false,simulated:true};
        socket?.emit?.('music:previewState',structuredClone(musicPreviewState));
      }
      updateMusicPreviewDynamic();
    } catch(error) {
      const status=$('musicSimulationStatus');
      if(status){ status.textContent=error?.message||'No se pudo controlar la vista previa.'; status.classList.remove('is-loading','is-hidden'); }
    }
  }
  async function startMusicWidgetSimulation(){
    clearInterval(musicWidgetSimTimer);musicWidgetSimTimer=0;musicWidgetSimulating=false;musicSimulationTrack=null;
    const input=$('musicSimulationQuery'),query=String(input?.value||'').trim(),status=$('musicSimulationStatus');
    if(!query){if(status){status.textContent='Escribe una canción o pega una URL para reproducirla.';status.classList.remove('is-hidden','is-loading');}return;}
    if(status){status.textContent='Buscando canción en YouTube Music…';status.classList.remove('is-hidden');status.classList.add('is-loading');}
    try{
      const track=await resolveSimulationTrack(query);
      const existing=(musicPreviewState?.simulated?musicPreviewState.queue:[]).filter(Boolean).map(t=>({...t,requester:'Simulación',source:'simulation'}));
      if(existing.some(t=>String(t.sourceId)===String(track.sourceId)) || String(musicPreviewState?.current?.sourceId||'')===String(track.sourceId)){
        throw new Error('Esa canción ya está en la simulación.');
      }
      musicSimulationTrack=track;
      musicWidgetSimulating=true;
      musicPreviewState={current:track,queue:existing.slice(0,10),previous:null,elapsed:0,playing:true,paused:false,simulated:true,source:'simulation'};
      musicPreviewDraw(musicPreviewState);
      // Ask the server to create the simulation first and use its authoritative
      // startedAt timestamp for the editor iframe. This makes the preview and
      // generated overlay share one playback clock instead of starting twice.
      let sync=null;
      try{
        sync=await new Promise((resolve)=>{
          let settled=false;
          const finish=(value)=>{if(settled)return;settled=true;resolve(value||null);};
          socket?.emit?.('music:simulate',{title:track.title,artist:track.artist,thumbnail:track.thumbnail,duration:track.duration,url:track.url,sourceId:track.sourceId,queue:existing.slice(0,10),previous:null},(ack)=>finish(ack?.sync||null));
          setTimeout(()=>finish(null),2500);
        });
      }catch{}
      if(sync){
        const syncedElapsed=sync.startedAt&&!sync.paused&&sync.playing?Math.max(0,(Date.now()-Number(sync.startedAt))/1000):Math.max(0,Number(sync.elapsed||0));
        musicPreviewState={...musicPreviewState,elapsed:syncedElapsed,playing:Boolean(sync.playing&&!sync.paused),paused:Boolean(sync.paused),serverStartedAt:Number(sync.startedAt||0)};
        musicPreviewDraw(musicPreviewState);
        await loadMusicPreviewYouTube(track,true,syncedElapsed);
      }else{
        socket?.emit?.('music:previewState',structuredClone(musicPreviewState));
        await loadMusicPreviewYouTube(track,true,0);
      }
      if(status){status.textContent='Reproduciendo en la vista previa · sincronizada con el overlay';status.classList.remove('is-loading');}
      $('musicSimulate')?.classList.add('is-hidden');$('musicStopSimulation')?.classList.remove('is-hidden');updatePreviewNavButtons();
      startMusicPreviewClock();
    }catch(e){musicWidgetSimulating=false;musicSimulationTrack=null;if(status){status.textContent=e?.message||'No se pudo reproducir la canción.';status.classList.remove('is-loading','is-hidden');}toast('Simular música',e?.message||'No se pudo obtener la canción.','err');}
  }

  const MUSIC_FONT_LINK='https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&family=Luckiest+Guy&family=Lobster&family=Montserrat:wght@400;600;700;800;900&family=Orbitron:wght@500;700;900&family=Oswald:wght@400;600;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:wght@600;700&family=Poppins:wght@400;500;600;700;800;900&family=Press+Start+2P&family=Righteous&family=Roboto:wght@400;500;700;900&family=Russo+One&family=Teko:wght@500;600;700&display=swap';
  function ensureMusicFonts(){ if(document.querySelector('link[data-sf-music-fonts]'))return; const link=document.createElement('link');link.rel='stylesheet';link.href=MUSIC_FONT_LINK;link.dataset.sfMusicFonts='1';document.head.appendChild(link); }
  function musicFontOptions(selected){
    const fonts=[['Inter','Inter'],['Bangers','Bangers'],['Impact','Impact'],['Anton','Anton'],['Bebas Neue','Bebas Neue'],['Oswald','Oswald'],['Montserrat','Montserrat'],['Poppins','Poppins'],['Roboto','Roboto'],['Rubik','Rubik'],['Righteous','Righteous'],['Russo One','Russo One'],['Orbitron','Orbitron'],['Teko','Teko'],['Permanent Marker','Permanent Marker'],['Luckiest Guy','Luckiest Guy'],['Pacifico','Pacifico'],['Lobster','Lobster'],['Playfair Display','Playfair Display'],['Press Start 2P','Press Start 2P'],['Arial','Arial'],['Verdana','Verdana'],['Trebuchet MS','Trebuchet MS'],['Georgia','Georgia'],['Times New Roman','Times New Roman']];
    return fonts.map(([v,l])=>`<option value="${esc(v)}" ${String(selected||'Inter')===v?'selected':''}>${esc(l)}</option>`).join('');
  }
  let musicWidgetActiveTab = 'commands';
  function renderMusicWidgetEditor(){
    ensureMusicFonts();
    window.__sfMusicWidgetEditorOpen=true; window.__sfVoiceWidgetEditorOpen=false; window.__sfPointsWidgetEditorOpen=false; window.__sfAnnouncementHubOpen=false;
    musicWidgetDraft=musicMerge(musicDefault(),musicWidgetDraft||settings.musicWidget||{});const s=musicWidgetDraft;
    const pfx=MUSIC_PREFIX_OPTIONS.map(v=>`<option value="${esc(v)}" ${s.commandPrefix===v?'selected':''}>${esc(v)}</option>`).join('');
    const tab=(key,icon,label,desc)=>`<button type="button" class="music-editor-tab ${musicWidgetActiveTab===key?'is-active':''}" data-music-tab="${key}"><span class="music-editor-tab-icon">${icon}</span><span><strong>${label}</strong><small>${desc}</small></span></button>`;
    const connectedAdmins=['tiktok','twitch'].map(platform=>{const profile=settings.connectionProfiles?.[platform]||{};const account=state.accounts?.[platform]||{};const username=String(account.username||profile.username||'').trim()||'Sin conectar';const avatar=connectedAccountAvatarUrl(platform,{...profile,...account,avatarUrl:account.avatarUrl||profile.avatarUrl});const connected=Boolean(account.connected||profile.connected);const status=connected?'CONECTADO':'DESCONECTADO';return `<div class="music-owner-admin ${connected?'is-connected':'is-disconnected'}"><span class="music-owner-avatar">${avatar?`<img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.classList.remove('is-hidden')"><span class="music-owner-avatar-fallback is-hidden">${platform==='tiktok'?'TT':'TW'}</span>`:`<span class="music-owner-avatar-fallback">${platform==='tiktok'?'TT':'TW'}</span>`}</span><span class="music-owner-copy"><strong>${platform==='tiktok'?'TikTok':'Twitch'}</strong><small>${esc(username)}</small></span><span class="music-owner-status"><i></i>${status}</span>${connected?'<span class="music-owner-badge">ADMIN</span>':''}</div>`}).join('');
    const adminOption=(k)=>MUSIC_ADMIN_COMMANDS[k].map(v=>`<option value="${esc(v)}" ${normMusic(s.adminCommands?.[k])===normMusic(v)?'selected':''}>${esc(v)}</option>`).join('');
    $('view').innerHTML=`
      <div class="intro widget-editor-intro"><div><p class="eyebrow">WIDGET / MÚSICA</p><h2>Música</h2><p>Configura solicitudes, apariencia y controles del reproductor desde un solo editor.</p></div><button class="btn secondary widget-back-btn" id="backToWidgetsFromMusic">← Volver a Widgets</button></div>
      <div class="widget-editor-layout music-widget-editor-layout">
        <section class="card widget-controls music-widget-controls">
          <div class="widget-editor-topbar"><div><p class="eyebrow">EDITOR</p><h3>Configuración de Música</h3><p class="widget-account-note"><span>✓</span> Los cambios se reflejan al instante en la vista previa y el overlay. <b id="musicAutoSaveStatus">● Guardado automáticamente</b></p></div><div class="widget-header-actions"><button class="btn secondary" id="saveMusicWidget">Guardar</button><button class="btn primary" id="openMusicOverlay">Generar Overlay</button></div></div>
          <div class="music-editor-tabs" role="tablist" aria-label="Configuración de Música">${tab('commands','⌘','Comandos','Solicitudes y puntos')}${tab('playlist','♫','Playlist','Canciones de la simulación')}${tab('appearance','✦','Apariencia','Diseño del reproductor')}${tab('admin','⚙','Administración','Permisos y controles')}</div>
          <div class="music-tab-panels">
            <div class="music-tab-panel ${musicWidgetActiveTab==='commands'?'is-active':''}" data-music-panel="commands">
              <div class="settings-grid two compact-grid">
                <article class="widget-subsection"><div class="section-head"><div><p class="eyebrow">SOLICITUDES</p><h3>Comandos de música</h3></div></div><div class="music-inline-row music-request-command-row"><label>Prefijo<select id="musicPrefix">${pfx}</select></label><label>Comando<select id="musicCommandPreset">${MUSIC_REQUEST_OPTIONS.map(v=>`<option value="${esc(v)}" ${String(s.requestCommand||'musica').toLowerCase()===String(v).toLowerCase()?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div><label>Coste por canción (puntos)<input id="musicPointCost" type="number" min="0" max="1000000" value="${Number(s.pointCost||0)}"></label><div class="music-command-preview-box"><span>Ejemplo</span><strong id="musicCommandPreview">${esc(s.commandPrefix)}</strong><b id="musicCommandPreviewWord">${esc(s.requestCommand||'musica')}</b> <em>Nombre de canción</em></div></article>
                <article class="widget-subsection"><div class="section-head"><div><p class="eyebrow">REPRODUCCIÓN</p><h3>Límites y estado</h3></div></div><div class="music-inline-row"><label>Duración máxima (min)<input id="musicMaxDuration" type="number" min="0.5" max="60" step="0.5" value="${(Number(s.maxDurationSeconds||300)/60).toFixed(1).replace(/\.0$/,'')}"></label><label>Cola máxima<input id="musicMaxQueue" type="number" min="1" max="10" value="${Math.min(10,Number(s.maxQueue||10))}"></label></div><label class="check-row"><input id="musicEnabled" type="checkbox" ${s.enabled?'checked':''}><span>Activar música</span></label></article>
              </div>
            </div>
            <div class="music-tab-panel ${musicWidgetActiveTab==='playlist'?'is-active':''}" data-music-panel="playlist">
              <article class="widget-subsection music-playlist-panel">
                <div class="section-head"><div><p class="eyebrow">PLAYLIST DE SIMULACIÓN</p><h3>Próximas canciones</h3><p class="muted">Las canciones solicitadas por simulación se sincronizan con la vista previa y el overlay cuando se reproducen.</p></div><div class="music-playlist-head-actions"><span class="music-playlist-count" id="musicPlaylistCount">0 / 10</span><button class="btn secondary music-playlist-overlay-btn" id="openMusicPlaylistOverlay" type="button">Mostrar playlist overlay</button></div></div>
                <div class="music-playlist-list" id="musicPlaylistList"><div class="music-playlist-empty">Agrega canciones para verlas aquí.</div></div>
              </article>
            </div>
            <div class="music-tab-panel ${musicWidgetActiveTab==='appearance'?'is-active':''}" data-music-panel="appearance">
              <div class="settings-grid two compact-grid music-appearance-grid">
                <article class="widget-subsection music-design-panel"><div class="section-head"><div><p class="eyebrow">DISEÑO</p><h3>Identidad visual</h3><p class="muted">Elige un tema y se aplica inmediatamente.</p></div></div><div class="music-style-selector"><label for="musicDesign">Temas</label><div class="music-style-select-wrap"><select id="musicDesign" class="music-style-select">${musicDesignOptions(s.style.design)}</select></div></div><div class="music-inline-row"><label>Escala<input id="musicScale" type="range" min="0.45" max="2" step="0.01" value="${Number(s.style.scale||1)}"></label><div class="music-selected-theme"><span>ACTIVO</span><strong id="musicSelectedTheme">${esc((MUSIC_DESIGN_OPTIONS.find(([v])=>v===s.style.design)||MUSIC_DESIGN_OPTIONS[0])[1])}</strong></div></div><div class="music-range-value"><output id="musicScaleValue">${Math.round(Number(s.style.scale||1)*100)}%</output><span>Escala general</span></div><div class="music-inline-row"><label>Fuente del título<select id="musicTitleFont">${musicFontOptions(s.style.titleFont)}</select></label><label>Fuente del artista<select id="musicArtistFont">${musicFontOptions(s.style.artistFont)}</select></label></div></article>
                <article class="widget-subsection music-elements-panel"><div class="section-head"><div><p class="eyebrow">ELEMENTOS</p><h3>Qué mostrar</h3></div></div><div class="music-check-grid compact-elements">${ctl('Disco vinil','musicVinyl','check',s.style.showVinyl!==false)}${ctl('Mostrar progreso','musicProgress','check',s.showProgress!==false)}${ctl('Mostrar siguiente','musicNext','check',s.showNext!==false)}${ctl('Mostrar solicitante','musicRequester','check',s.showRequester!==false)}</div><p class="music-design-note">Transparente por defecto. Solo se renderiza el contenido.</p></article>
                <article class="widget-subsection music-color-panel"><div class="section-head"><div><p class="eyebrow">COLOR Y TAMAÑO</p><h3>Detalles del contenido</h3></div></div><div class="music-inline-row"><label>Color del título<input id="musicTextColor" type="color" value="${esc(s.style.textColor)}"></label><label>Color del artista<input id="musicSecondaryTextColor" type="color" value="${esc(s.style.secondaryTextColor)}"></label></div><div class="music-inline-row"><label>Tamaño del título<input id="musicTitleSize" type="number" min="16" max="72" value="${Number(s.style.titleSize||28)}"></label><label>Tamaño del artista<input id="musicArtistSize" type="number" min="10" max="36" value="${Number(s.style.artistSize||15)}"></label></div><div class="music-inline-row"><label>Tamaño del vinil<input id="musicVinylSize" type="number" min="90" max="280" value="${Number(s.style.vinylSize||170)}"></label><label>Color de acento<input id="musicAccent" type="color" value="${esc(s.style.accent)}"></label></div><div class="music-inline-row"><label>Color de acento 2<input id="musicAccent2" type="color" value="${esc(s.style.accent2)}"></label><label>Barra de reproducción<select id="musicProgressMode"><option value="single" ${s.style.progressMode==='single'?'selected':''}>1 color</option><option value="gradient2" ${(!s.style.progressMode||s.style.progressMode==='gradient2')?'selected':''}>2 colores</option><option value="gradient3" ${s.style.progressMode==='gradient3'?'selected':''}>3 colores</option></select></label></div><div class="music-progress-colors"><label>Color barra 1<input id="musicProgressColor" type="color" value="${esc(s.style.progressColor||s.style.accent)}"></label><label class="music-progress-color2-label ${s.style.progressMode==='single'?'is-hidden':''}">Color barra 2<input id="musicProgressColor2" type="color" value="${esc(s.style.progressColor2||s.style.accent2)}"></label><label class="music-progress-color3-label ${s.style.progressMode==='gradient3'?'':'is-hidden'}">Color barra 3<input id="musicProgressColor3" type="color" value="${esc(s.style.progressColor3||'#22d3ee')}"></label></div></article>
              </div>
            </div>
            <div class="music-tab-panel ${musicWidgetActiveTab==='admin'?'is-active':''}" data-music-panel="admin">
              <article class="widget-subsection music-admin-panel">
                <div class="section-head"><div><p class="eyebrow">ADMINISTRACIÓN</p><h3>Control de reproducción</h3><p class="muted">La cuenta conectada es administradora por defecto. Los moderadores son opcionales.</p></div></div>
                <div class="music-owner-admin-grid">${connectedAdmins||'<div class="music-admin-empty">No hay cuentas TikTok/Twitch conectadas. Conecta una para que aparezca como admin.</div>'}</div>
                <div class="music-moderator-toggle"><label class="check-row"><input id="musicAllowModeratorCommands" type="checkbox" ${s.allowModeratorCommands?'checked':''}><span>Permitir comandos a moderadores</span></label><small>Solo usuarios con insignia <b>moderador</b> podrán usar los comandos especiales.</small></div>
                <div class="music-admin-command-grid">${Object.entries(MUSIC_ADMIN_COMMANDS).map(([k])=>{const label=k==='pause'?'Pausa':k==='stop'?'Detener':k==='skip'?'Saltar':k==='repeat'?'Repetir':'Volumen';return `<div class="music-admin-command-card"><div class="music-admin-command-title"><strong>${label}</strong><span>Admin${s.allowModeratorCommands?' + moderador':''}</span></div><div class="music-admin-command-fields"><label>Prefijo<select data-music-admin-prefix="${k}">${MUSIC_PREFIX_OPTIONS.map(v=>`<option value="${esc(v)}" ${s.adminCommandPrefixes?.[k]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Comando<select data-music-admin-command="${k}">${adminOption(k)}</select></label></div><div class="music-admin-command-example">Ejemplo: <b data-music-admin-example="${k}">${esc(s.adminCommandPrefixes?.[k]||s.commandPrefix)}${esc(s.adminCommands?.[k]||'')}${k==='volume'?' 100':''}</b>${k==='volume'?'<small> · 0–100</small>':''}</div></div>`}).join('')}</div>
                <div class="music-admin-preview"><span>Comandos activos</span><div data-music-active-commands>${Object.entries(MUSIC_ADMIN_COMMANDS).map(([k])=>`<b data-music-active-command="${k}">${esc(s.adminCommandPrefixes?.[k]||s.commandPrefix)}${esc(s.adminCommands?.[k]||k)}${k==='volume'?' 100':''}</b>`).join('&nbsp;&nbsp;')}</div></div>
              </article>
            </div>
          </div>
        </section>
        <section class="card music-preview-panel"><div class="preview-header"><div><p class="eyebrow">VISTA PREVIA</p><h3>Reproductor</h3></div><span class="preview-live"><i></i> TIEMPO REAL</span></div><div class="music-preview-stage" id="musicPreview">${musicPreviewMarkup(s,{current:null,queue:[],playing:false})}<span class="music-resize-handle" id="musicResizeHandle" title="Redimensionar"></span></div><div id="musicPreviewYoutubeHost" class="music-youtube-hidden-host" aria-hidden="true"></div><div class="music-preview-test-block"><div class="music-preview-test-head"><div><p class="eyebrow">PRUEBA</p><strong>Simulador de canción</strong><small>Escribe una canción o pega una URL para escucharla y comprobar el diseño.</small></div><button class="music-preview-audio-btn" id="musicPreviewMute" type="button" title="Silenciar vista previa" aria-label="Silenciar vista previa">🔊</button></div><div class="music-preview-actions music-simulation-actions"><input id="musicSimulationQuery" class="music-simulation-input" type="text" maxlength="300" placeholder="Canción o URL de YouTube"><div class="music-simulation-buttons"><button class="btn primary" id="musicSimulate">▶ Simular canción</button><button class="btn secondary" id="musicAddPlaylist" type="button">＋ Agregar a playlist</button><button class="btn secondary is-hidden" id="musicStopSimulation">■ Detener simulación</button></div><small id="musicSimulationStatus" class="music-simulation-status is-hidden"></small></div></div><div class="music-preview-footer"><div class="music-overlay-tools"><button class="btn secondary is-hidden" id="copyMusicOverlayLink" type="button">⧉ Copiar enlace OBS</button></div></div></section>
      </div>`;
    const refreshMusicCommandLabels=()=>{
      const mainPrefix=String($('musicPrefix')?.value||s.commandPrefix||'!');
      const mainCommand=String($('musicCommandPreset')?.value||s.requestCommand||'musica');
      const mainPreview=document.getElementById('musicCommandPreview');
      const mainWord=document.getElementById('musicCommandPreviewWord');
      if(mainPreview) mainPreview.textContent=mainPrefix;
      if(mainWord) mainWord.textContent=mainCommand;
      Object.keys(MUSIC_ADMIN_COMMANDS).forEach(k=>{
        const pref=String(document.querySelector(`[data-music-admin-prefix="${k}"]`)?.value||s.commandPrefix||'!');
        const cmd=String(document.querySelector(`[data-music-admin-command="${k}"]`)?.value||s.adminCommands?.[k]||'').trim();
        const ex=document.querySelector(`[data-music-admin-example="${k}"]`);
        const ac=document.querySelector(`[data-music-active-command="${k}"]`);
        if(ex) ex.textContent=`${pref}${cmd}${k==='volume'?' 100':''}`;
        if(ac) ac.textContent=`${pref}${cmd}${k==='volume'?' 100':''}`;
      });
    };
    const sync=()=>{
      const el=id=>$(id);s.commandPrefix=el('musicPrefix')?.value||'!';const cmdPreset=el('musicCommandPreset')?.value||'musica';s.requestCommand=cmdPreset;s.requestCommandPreset=cmdPreset;s.pointCost=Number(el('musicPointCost')?.value||0);s.maxDurationSeconds=Math.max(30,Number(el('musicMaxDuration')?.value||5)*60);s.maxQueue=Math.min(10,Math.max(1,Number(el('musicMaxQueue')?.value||10)));s.enabled=Boolean(el('musicEnabled')?.checked);s.allowModeratorCommands=Boolean(el('musicAllowModeratorCommands')?.checked);
      s.style.scale=Number(el('musicScale')?.value||1);s.style.design=el('musicDesign')?.value||'vinyl-glow';s.style.titleFont=el('musicTitleFont')?.value||'Inter';s.style.artistFont=el('musicArtistFont')?.value||'Inter';s.style.textColor=el('musicTextColor')?.value||'#ffffff';s.style.secondaryTextColor=el('musicSecondaryTextColor')?.value||'#b9b9c8';s.style.titleSize=Number(el('musicTitleSize')?.value||28);s.style.artistSize=Number(el('musicArtistSize')?.value||15);s.style.vinylSize=Number(el('musicVinylSize')?.value||170);s.style.accent=el('musicAccent')?.value||'#8b5cf6';s.style.accent2=el('musicAccent2')?.value||'#ec4899';s.style.progressMode=el('musicProgressMode')?.value||'gradient2';s.style.progressColor=el('musicProgressColor')?.value||s.style.accent;s.style.progressColor2=el('musicProgressColor2')?.value||s.style.accent2;s.style.progressColor3=el('musicProgressColor3')?.value||'#22d3ee';s.style.showVinyl=Boolean(el('musicVinyl')?.checked);s.showProgress=Boolean(el('musicProgress')?.checked);s.showNext=Boolean(el('musicNext')?.checked);s.showRequester=Boolean(el('musicRequester')?.checked);
      Object.keys(MUSIC_ADMIN_COMMANDS).forEach(k=>{s.adminCommandPrefixes=s.adminCommandPrefixes||{};s.adminCommands=s.adminCommands||{};s.adminCommandPrefixes[k]=document.querySelector(`[data-music-admin-prefix="${k}"]`)?.value||s.commandPrefix;s.adminCommands[k]=String(document.querySelector(`[data-music-admin-command="${k}"]`)?.value||s.adminCommands[k]||'').trim().replace(/\s+/g,'').toLowerCase()});
      delete s.admins;
      musicWidgetDraft=s; settings.musicWidget=s;
      el('musicScaleValue').textContent=`${Math.round(s.style.scale*100)}%`;const activeTheme=el('musicSelectedTheme');if(activeTheme)activeTheme.textContent=MUSIC_DESIGN_OPTIONS.find(([v])=>v===s.style.design)?.[1]||s.style.design;refreshMusicCommandLabels();
      document.querySelector('.music-progress-color2-label')?.classList.toggle('is-hidden',s.style.progressMode==='single');document.querySelector('.music-progress-color3-label')?.classList.toggle('is-hidden',s.style.progressMode!=='gradient3');
      applyMusicPreviewAppearance(); emitMusicAppearanceSync(); scheduleMusicAutoSave(s);
    };
    ['musicPrefix','musicCommandPreset','musicPointCost','musicMaxDuration','musicMaxQueue','musicEnabled','musicAllowModeratorCommands','musicScale','musicDesign','musicTitleFont','musicArtistFont','musicTextColor','musicSecondaryTextColor','musicTitleSize','musicArtistSize','musicVinylSize','musicAccent','musicAccent2','musicProgressMode','musicProgressColor','musicProgressColor2','musicProgressColor3','musicVinyl','musicProgress','musicNext','musicRequester'].forEach(id=>{const e=$(id);e?.addEventListener('input',sync);e?.addEventListener('change',sync);});
    document.querySelectorAll('[data-music-tab]').forEach(b=>b.onclick=()=>{musicWidgetActiveTab=b.dataset.musicTab;document.querySelectorAll('[data-music-tab]').forEach(x=>x.classList.toggle('is-active',x===b));document.querySelectorAll('[data-music-panel]').forEach(x=>x.classList.toggle('is-active',x.dataset.musicPanel===musicWidgetActiveTab));});
    document.querySelectorAll('[data-music-admin-command]').forEach(e=>{e.addEventListener('input',sync);e.addEventListener('change',sync);});document.querySelectorAll('[data-music-admin-prefix]').forEach(e=>{e.addEventListener('input',sync);e.addEventListener('change',sync);});
    refreshMusicCommandLabels();
    $('musicSimulate').onclick=startMusicWidgetSimulation;$('musicAddPlaylist').onclick=addMusicTrackToPlaylist;$('musicStopSimulation').onclick=stopMusicWidgetSimulation;$('musicPreviewMute').onclick=()=>{musicPreviewMuted=!musicPreviewMuted;try{if(musicPreviewMuted)musicPreviewYTPlayer?.mute?.();else musicPreviewYTPlayer?.unMute?.();}catch{}const b=$('musicPreviewMute');if(b){b.textContent=musicPreviewMuted?'🔇':'🔊';b.title=musicPreviewMuted?'Activar audio de la vista previa':'Silenciar vista previa';b.setAttribute('aria-label',musicPreviewMuted?'Activar audio de la vista previa':'Silenciar vista previa');}};
    $('backToWidgetsFromMusic').onclick=()=>{stopMusicWidgetSimulation();window.__sfMusicWidgetEditorOpen=false;renderWidgets();};
    $('saveMusicWidget').onclick=async()=>{sync();clearTimeout(musicAutoSaveTimer);musicAutoSaveTimer=0;try{const data=await api('/api/music/settings',{method:'PUT',body:JSON.stringify({music:structuredClone(s)})});settings.musicWidget=data.music;musicWidgetDraft=structuredClone(data.music);const note=$('musicAutoSaveStatus');if(note){note.textContent='● Guardado automáticamente';note.classList.remove('is-saving');}toast('Música guardada','La configuración quedó guardada en tu cuenta.');}catch(e){toast('Música',e.message||'No se pudo guardar.','err');}};
    $('openMusicOverlay').onclick=async()=>{try{sync();await getOverlayKey();await openOverlay('music-overlay.html?widget=music','streamfusionMusicOverlay');$('copyMusicOverlayLink')?.classList.remove('is-hidden');}catch(e){toast('Overlay',e.message||'No se pudo generar el overlay.','err');}};
    $('openMusicPlaylistOverlay').onclick=async()=>{let popup=null;try{popup=window.open('about:blank','streamfusionMusicPlaylist','popup=yes,width=1400,height=860,resizable=yes,scrollbars=no');if(!popup){toast('Playlist','Permite ventanas emergentes para abrir la playlist.','err');return;}popupWindows.add(popup);const url=await buildOverlayUrl('music-playlist.html?widget=music-playlist');if(!popup.closed)popup.location.replace(url);try{popup.focus();}catch{};}catch(e){try{if(popup&&!popup.closed)popup.close();}catch{}toast('Playlist',e.message||'No se pudo abrir la playlist.','err');}};
    $('copyMusicOverlayLink').onclick=async()=>{try{const url=await buildOverlayUrl('music-overlay.html?widget=music');await navigator.clipboard.writeText(url);toast('Enlace OBS','El enlace del overlay de Música fue copiado.');}catch(e){toast('Enlace OBS',e.message||'Primero genera el overlay.','err');}};
    musicPreviewDraw(musicPreviewState);
  }

  function normMusic(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

  function renderWidgets(){
    if(window.__sfAnnouncementEditorOpen){ renderAnnouncementEditor(); return; }
    if(window.__sfPointsWidgetEditorOpen){ renderPointsWidgetEditor(); return; }
    if(window.__sfMusicWidgetEditorOpen){ renderMusicWidgetEditor(); return; }
    if(window.__sfAnnouncementHubOpen){ renderAnnouncementHub(); return; }
    window.__sfVoiceWidgetEditorOpen = Boolean(window.__sfVoiceWidgetEditorOpen);
    if(!window.__sfVoiceWidgetEditorOpen){
      if(voiceWidgetPreviewTimer){clearInterval(voiceWidgetPreviewTimer);voiceWidgetPreviewTimer=0;}
      voiceWidgetDraft=null;
      const total=voiceLibraryItems().length;
      $('view').innerHTML=`<div class="intro"><h2>Widgets</h2><p>Selecciona un widget para abrir su editor sin perder la sesión de tu cuenta.</p></div><div class="widget-launch-grid"><button type="button" class="card widget-launch-card widget-launch-card-premium" id="openVoiceWidgetEditor"><span class="widget-launch-icon" aria-hidden="true">🎙️</span><span class="widget-launch-copy"><span class="widget-launch-kicker">WIDGET DE STREAM</span><strong class="widget-launch-title">Lista de voces</strong><small class="widget-launch-desc">Diseña la lista, movimiento e intro. Todo se guarda en tu cuenta y no necesita conectar TikTok o Twitch.</small></span><span class="widget-launch-arrow" aria-hidden="true">→</span></button><button type="button" class="card widget-launch-card widget-launch-card-music" id="openMusicWidget"><span class="widget-launch-icon music-launch-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="img" focusable="false"><path d="M9 18.2V5.8l10-2.2v11.6"/><path d="M9 16.2c0 1.55-1.8 2.8-4 2.8s-4-1.25-4-2.8 1.8-2.8 4-2.8 4 1.25 4 2.8Zm10-1c0 1.55-1.8 2.8-4 2.8s-4-1.25-4-2.8 1.8-2.8 4-2.8 4 1.25 4 2.8Z"/></svg><i></i></span><span class="widget-launch-copy"><span class="widget-launch-kicker">REPRODUCTOR</span><strong class="widget-launch-title">Música</strong><small class="widget-launch-desc">Cola de canciones, puntos, comandos y reproductor tipo vinil para OBS.</small></span><span class="widget-launch-arrow" aria-hidden="true">→</span></button><button type="button" class="card widget-launch-card widget-launch-card-points" id="openPointsWidgetEditor"><span class="widget-launch-icon" aria-hidden="true">✦</span><span class="widget-launch-copy"><span class="widget-launch-kicker">INTERACCIÓN</span><strong class="widget-launch-title">Puntos</strong><small class="widget-launch-desc">Muestra los puntos del usuario cuando comenta tu comando, con cooldown y cola anti-spam.</small></span><span class="widget-launch-arrow" aria-hidden="true">→</span></button><button type="button" class="card widget-launch-card widget-launch-card-announcement" id="openAnnouncementWidget"><span class="widget-launch-icon" aria-hidden="true">📢</span><span class="widget-launch-copy"><span class="widget-launch-kicker">PROMOCIÓN</span><strong class="widget-launch-title">Anuncio</strong><small class="widget-launch-desc">Crea anuncios transparentes con texto, imágenes, tiempos y hasta 3 partes.</small></span><span class="widget-launch-arrow" aria-hidden="true">→</span></button></div>`;
      $('openVoiceWidgetEditor').onclick=()=>{window.__sfPointsWidgetEditorOpen=false;window.__sfVoiceWidgetEditorOpen=true;voiceWidgetPreviewStartAt=Date.now();voiceWidgetVisibilityPhase='visible';voiceWidgetVisibilityPhaseStartedAt=Date.now();try{renderWidgets();}catch(e){console.error('[Widgets] Lista de voces',e);toast('Lista de voces',e.message||'No se pudo abrir el editor.','err');}};
      $('openPointsWidgetEditor').onclick=async()=>{window.__sfVoiceWidgetEditorOpen=false;window.__sfPointsWidgetEditorOpen=true;try{const data=await api('/api/points/settings');pointsDraft=structuredClone(data.points||{});pointsWidgetDraft=structuredClone(pointsDraft.widget||{});}catch(e){pointsDraft=pointsDraft||{};pointsWidgetDraft=pointsWidgetDraft||{};toast('Puntos',e.message||'No se pudo cargar la configuración.','err');}try{renderWidgets();}catch(e){console.error('[Widgets] Puntos',e);toast('Puntos',e.message||'No se pudo abrir el editor.','err');}};
      $('openAnnouncementWidget').onclick=()=>{window.__sfVoiceWidgetEditorOpen=false;window.__sfPointsWidgetEditorOpen=false;window.__sfAnnouncementHubOpen=true;try{renderWidgets();}catch(e){console.error('[Widgets] Anuncio',e);toast('Anuncio',e.message||'No se pudo abrir el widget.','err');}};
      $('openMusicWidget').onclick=async()=>{window.__sfVoiceWidgetEditorOpen=false;window.__sfPointsWidgetEditorOpen=false;window.__sfAnnouncementHubOpen=false;window.__sfMusicWidgetEditorOpen=true;try{const data=await api('/api/music/settings');musicWidgetDraft=structuredClone(data.music||{});}catch(e){musicWidgetDraft=musicDefault();toast('Música',e.message||'No se pudo cargar la configuración.','err');}try{renderWidgets();}catch(e){console.error('[Widgets] Música',e);toast('Música',e.message||'No se pudo abrir el widget.','err');}};
      if(total===0) loadVoices().then(()=>{if(page==='widgets'&&!window.__sfVoiceWidgetEditorOpen)renderWidgets();}).catch(()=>{});
      return;
    }
    const s={autoShowEnabled:false,autoShowEvery:30,autoShowFor:6,hideAfterShow:false,...structuredClone(settings.voiceList||{})};
    if(!['top','center','bottom'].includes(String(s.horizontalPosition||''))){ const legacy=String(s.listPosition||'center'); s.horizontalPosition=legacy==='left'?'top':legacy==='right'?'bottom':'center'; }
    normalizeVoiceListPlacement(s);
    voiceWidgetDraft=s;
    if(!voiceWidgetPreviewTimer){ voiceWidgetPreviewTimer=setInterval(()=>{ if(page!=='widgets'||!window.__sfVoiceWidgetEditorOpen||!voiceWidgetDraft)return; syncVoiceWidgetPreview(voiceWidgetDraft,false); },100); }
    s.axis=s.axis||s.direction||'vertical'; s.direction=s.axis; s.movementDirection=s.movementDirection||'forward'; s.roulette={enabled:false,title:'¿Quieres una voz?',subtitle:'Para participar, comenta lo que se indique en el sorteo!',winnerText:'Si ganas, solo comenta una de las siguientes voces:',titleSeconds:3,subtitleSeconds:3,winnerSeconds:3,introMotion:'fade',cardOpacity:.12,showListAfterIntro:true,...(s.roulette||{})};
    const fontOpts=VOICE_FONTS.map(x=>`<option value="${esc(x[0])}">${esc(x[1])}</option>`).join('');
    const library=voiceLibraryItems();
    $('view').innerHTML=`<div class="intro widget-editor-intro"><div><p class="eyebrow">WIDGET / LISTA DE VOCES</p><h2>Lista de Voces</h2><p>Edita la lista y comprueba los cambios en tiempo real.</p></div><button class="btn secondary widget-back-btn" id="backToWidgets">← Volver a Widgets</button></div>
      <div class="widget-editor-layout"><section class="card widget-controls"><div class="widget-editor-topbar"><div><p class="eyebrow">EDITOR</p><h3>Configuración del widget</h3><p class="widget-account-note"><span>✓</span> Se guarda en tu cuenta · no requiere conectar TikTok o Twitch</p></div><div class="widget-header-actions"><button class="btn secondary" id="saveVoiceWidget">Guardar</button><button class="btn primary" id="openVoiceWidget">Generar Overlay</button></div></div>
      <div class="settings-grid two compact-grid">
      <article class="widget-subsection"><p class="eyebrow">GENERAL</p>${voiceCtl('Activar','vEnabled','check',s.enabled)}${voiceCtl('Fondo transparente','vTransparent','check',s.transparent)}${voiceCtl('Opacidad de fondo','vBgOpacity','input',s.backgroundOpacity)}${voiceCtl('Fuente','vFont','select',s.fontFamily,fontOpts)}${voiceCtl('Tamaño','vSize','input',s.fontSize)}${voiceCtl('Peso','vWeight','input',s.fontWeight)}${voiceCtl('Estilo','vStyle','select',s.fontStyle,'<option value="normal">Normal</option><option value="italic">Cursiva</option>')}${voiceCtl('Color','vColor','input',s.textColor)}</article>
      <article class="widget-subsection"><p class="eyebrow">EFECTOS</p>${voiceCtl('Sombra','vShadow','select',s.textShadow,'<option value="none">Sin sombra</option><option value="soft">Suave</option><option value="strong">Fuerte</option>')}${voiceCtl('Color sombra','vShadowColor','input',s.shadowColor)}${voiceCtl('Contorno (px)','vOutline','input',s.outlineWidth)}${voiceCtl('Color contorno','vOutlineColor','input',s.outlineColor)}${voiceCtl('Transformación','vTransform','select',s.textTransform,'<option value="none">Normal</option><option value="uppercase">MAYÚSCULAS</option><option value="lowercase">minúsculas</option><option value="capitalize">Capitalizar</option>')}${voiceCtl('Espaciado','vLetter','input',s.letterSpacing)}${voiceCtl('Altura línea','vLine','input',s.lineHeight)}</article>
      <article class="widget-subsection"><p class="eyebrow">COMPOSICIÓN</p>${voiceCtl('Separación','vGap','input',s.itemGap)}${voiceCtl('Posición','vPosition','select',voiceAxisPosition(s.axis,s),voiceListPositionOptions(s.axis,voiceAxisPosition(s.axis,s)))}${voiceCtl('Desplazamiento','vAxis','select',s.axis,'<option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>')}${voiceCtl('Dirección','vMoveDir','select',s.movementDirection,'<option value="forward">Normal</option><option value="reverse">Invertida</option>')}${voiceCtl('Movimiento','vMotion','select',s.motion,'<option value="static">Estático</option><option value="scroll">Scroll</option><option value="slide">Slide</option><option value="marquee">Marquee</option>')}${voiceCtl('Velocidad','vMotionSpeed','input',s.motionSpeed)}</article>
      <article class="widget-subsection"><p class="eyebrow">VISIBILIDAD</p>${voiceCtl('Mostrar índice','vShowIndex','check',s.showIndex)}${voiceCtl('Mostrar ID','vShowId','check',s.showId)}${voiceCtl('Mostrar automáticamente','vAutoShow','check',s.autoShowEnabled)}${voiceCtl('Ocultar al terminar de mostrar la lista','vHideAfterShow','check',s.hideAfterShow===true)}${voiceCtl('Esperar tras ocultar (segundos)','vAutoEvery','input',s.autoShowEvery)}${voiceCtl('Visible durante (segundos)','vAutoFor','input',s.autoShowFor)}</article></div>
      ${voiceRouletteMarkup(s.roulette)}
      </section>
      <section class="card widget-preview-card"><div class="preview-header"><div><p class="eyebrow">VISTA PREVIA EN TIEMPO REAL</p><h3>Lista de Voces</h3></div><span id="voicePreviewStatus">${voiceStatusMarkup()}</span></div><div id="voiceWidgetPreview" class="voice-widget-preview"></div><div class="widget-preview-footer"><span class="muted">La misma configuración guardada se usa en tu overlay único.</span><code>/voice-list-overlay.html</code></div></section></div>`;
    syncVoiceWidgetPreview(s,true);
    const map={vEnabled:['enabled','check'],vTransparent:['transparent','check'],vBgOpacity:['backgroundOpacity','num'],vFont:['fontFamily'],vSize:['fontSize','num'],vWeight:['fontWeight','num'],vStyle:['fontStyle'],vColor:['textColor'],vShadow:['textShadow'],vShadowColor:['shadowColor'],vOutline:['outlineWidth','num'],vOutlineColor:['outlineColor'],vTransform:['textTransform'],vLetter:['letterSpacing','num'],vLine:['lineHeight','num'],vGap:['itemGap','num'],vPosition:['__position'],vAxis:['axis'],vMoveDir:['movementDirection'],vMotion:['motion'],vMotionSpeed:['motionSpeed','num'],vShowIndex:['showIndex','check'],vShowId:['showId','check'],vAutoShow:['autoShowEnabled','check'],vHideAfterShow:['hideAfterShow','check'],vAutoEvery:['autoShowEvery','num'],vAutoFor:['autoShowFor','num']};
    const scheduleVoiceWidgetSave=()=>{clearTimeout(voiceWidgetSaveTimer);voiceWidgetSaveTimer=setTimeout(async()=>{try{const result=await api('/api/voice-list/settings',{method:'PUT',body:JSON.stringify(s)});settings.voiceList=merge(settings.voiceList,result.voiceList||s);}catch(e){console.warn('voice widget autosave',e);}},300);};
    const updatePreview=()=>{voiceWidgetDraft=s;if(s.autoShowEnabled!==true||s.hideAfterShow!==true){voiceWidgetVisibilityPhase='visible';voiceWidgetVisibilityPhaseStartedAt=Date.now();}syncVoiceWidgetPreview(s,false);scheduleVoiceWidgetSave();};
    normalizeVoiceListPlacement(s);
    for(const [id,[key,type]] of Object.entries(map)){
      const el=$(id); if(!el) continue;
      if(key==='__position') el.value=String(voiceAxisPosition(s.axis,s));
      else if(type==='check') el.checked=!!s[key];
      else el.value=String(s[key]??'');
      const readValue=()=>{
        if(key==='__position'){
          const v=String(el.value||'center');
          if(String(s.axis)==='horizontal') s.horizontalPosition=['top','center','bottom'].includes(v)?v:'center';
          else s.listPosition=['left','center','right'].includes(v)?v:'center';
        }else{
          s[key]=type==='check'?el.checked:type==='num'?Number(el.value):el.value;
        }
        normalizeVoiceListPlacement(s);
      };
      el.addEventListener('input',()=>{readValue();if(id==='vAxis')refreshVoiceListPositionControls(s.axis,s);updatePreview();});
      el.addEventListener('change',()=>{readValue();if(id==='vAxis')refreshVoiceListPositionControls(s.axis,s);updatePreview();});
    }
    setSelect('vFont',s.fontFamily); setSelect('vAxis',s.axis); setSelect('vMoveDir',s.movementDirection);
    refreshVoiceListPositionControls(s.axis,s);
    if($('vColor'))$('vColor').value=s.textColor; if($('vShadowColor'))$('vShadowColor').value=s.shadowColor; if($('vOutlineColor'))$('vOutlineColor').value=s.outlineColor;
    const rouletteFields={vlRouletteEnabled:['enabled','check'],vlShowListAfter:['showListAfterIntro','check'],vlRText1:['title'],vlRTime1:['titleSeconds','num'],vlRText2:['subtitle'],vlRTime2:['subtitleSeconds','num'],vlRText3:['winnerText'],vlRTime3:['winnerSeconds','num'],vlRMotion:['introMotion'],vlRCard:['cardOpacity','num']};
    for(const [id,[key,type]] of Object.entries(rouletteFields)){const el=$(id);if(!el)continue;const value=s.roulette?.[key];if(type==='check')el.checked=value!==false;else el.value=String(value??'');el.addEventListener('input',()=>{s.roulette=s.roulette||{};s.roulette[key]=type==='check'?el.checked:type==='num'?Number(el.value):el.value;voiceWidgetPreviewStartAt=Date.now();voiceWidgetPreviewSignature='';updatePreview();});el.addEventListener('change',()=>{s.roulette=s.roulette||{};s.roulette[key]=type==='check'?el.checked:type==='num'?Number(el.value):el.value;voiceWidgetPreviewStartAt=Date.now();voiceWidgetPreviewSignature='';updatePreview();});}
    const persistVoiceWidget = async () => {
      normalizeVoiceListPlacement(s);
      const result=await api('/api/voice-list/settings',{method:'PUT',body:JSON.stringify(s)});
      settings.voiceList=merge(settings.voiceList,result.voiceList||s);
      voiceWidgetDraft=s;
      return result.voiceList||s;
    };
    $('backToWidgets').onclick=()=>{ window.__sfVoiceWidgetEditorOpen=false; voiceWidgetDraft=null; voiceWidgetPreviewSignature=''; if(voiceWidgetPreviewTimer){clearInterval(voiceWidgetPreviewTimer);voiceWidgetPreviewTimer=0;} renderWidgets(); };
    $('saveVoiceWidget').onclick=async()=>{ try{ await persistVoiceWidget(); toast('Widget guardado','Todos los cambios de Lista de Voces quedaron guardados.'); }catch(e){ toast('No se pudo guardar',e.message,'err'); } };
    $('openVoiceWidget').onclick=async()=>{ try{ await persistVoiceWidget(); await openOverlay('voice-list-overlay.html','streamfusionVoiceList'); }catch(e){ toast('Overlay',e.message||'No se pudo generar el overlay.','err'); } };
    loadVoices().then(()=>{if(page==='widgets'&&window.__sfVoiceWidgetEditorOpen&&voiceLibraryItems().length!==library.length)renderWidgets();}).catch(()=>{});
  }

  let pointsDraft = null;
  async function renderPoints(){
    try {
      const cfgData=await api('/api/points/settings');
      const cfg=cfgData.points||{};
      pointsDraft=structuredClone(cfg);
      $('view').innerHTML=`
        <div class="intro split"><div><h2>Sistema de puntos</h2><p>Configura la economía de tu canal y administra puntos por usuario sin cargar una lista completa en memoria.</p></div><div class="widget-live-mini"><i class="on"></i> ACTIVO</div></div>
        <div class="settings-grid two points-grid">
          <section class="card"><div class="section-head"><div><p class="eyebrow">PUNTOS</p><h3>Configuración por plataforma</h3></div><span class="badge-pill">✦</span></div>
            <label class="toggle"><input id="pointsEnabled" type="checkbox" ${cfg.enabled!==false?'checked':''}><span>Activar sistema de puntos</span></label>
            <div class="points-platform-tabs"><button class="btn secondary" data-points-platform="tiktok">TikTok</button><button class="btn secondary" data-points-platform="twitch">Twitch</button></div>
            <div id="pointsPlatformForm"></div>
            <div class="row points-actions"><button class="btn primary" id="savePoints">Guardar puntos</button><button class="btn secondary" id="openPointsUsers">Ver usuarios</button></div>
          </section>
          <section class="card points-management-card"><div class="section-head"><div><p class="eyebrow">GESTIÓN DE USUARIOS</p><h3>Dar puntos</h3></div><span class="badge-pill">✦</span></div>
            <p class="muted">Busca un usuario registrado en tus actividades y consulta su saldo actual antes de otorgar puntos.</p>
            <div class="points-manage-toolbar">
              <label>Plataforma<select id="pointManagePlatform"><option value="tiktok">TikTok</option><option value="twitch">Twitch</option></select></label>
              <label class="grow" id="pointManageUserLabel">Unique ID TikTok<input id="pointManageUser" placeholder="@unique_id" autocomplete="off"></label>
              <button class="btn secondary" id="findPointUser">Buscar usuario</button>
            </div>
            <div id="pointManageResult" class="point-user-result" hidden></div>
            <div class="points-award-row" id="pointAwardRow" hidden>
              <label>Puntos a otorgar<input id="pointAwardAmount" type="number" min="1" step="1" value="100" inputmode="numeric"></label>
              <button class="btn primary" id="grantPointUser">Otorgar puntos</button>
            </div>
            <div id="pointManageStatus" class="status" aria-live="polite"></div>
          </section>
        </div>`;
      bindPointsPage();
    } catch(e) { $('view').innerHTML=`<div class="empty">No se pudo cargar el sistema de puntos: ${esc(e.message||e)}</div>`; }
  }
  function pointsField(label,id,value){return `<label>${esc(label)}<input id="${esc(id)}" type="number" min="0" step="1" value="${esc(value??0)}"></label>`;}
  function renderPointsPlatformForm(platform){
    const cfg=pointsDraft?.[platform]||{}; const twitch=platform==='twitch';
    $('pointsPlatformForm').innerHTML=`<div class="custom-control-grid points-award-grid">
      ${pointsField('Seguidor · puntos','ptFollow',cfg.follow??100)}
      ${pointsField('Comentario · puntos','ptComment',cfg.comment??2)}
      ${!twitch?pointsField('Like · puntos por like','ptLike',cfg.like??1):''}
      ${!twitch?pointsField('Compartir · puntos','ptShare',cfg.share??1):''}
      ${twitch?pointsField('Bits · puntos por cada 10 Bits','ptBitsPer10',cfg.bitsPer10??1):pointsField('Regalo · puntos por cada 10 monedas','ptGiftPer10',cfg.giftPer10Coins??1)}
      ${pointsField('Suscripción · puntos','ptSub',cfg.subscription??250)}
    </div>
    <p class="muted">${twitch?'En Twitch se utilizan seguidores, comentarios, Bits y suscripciones. Likes y compartidos no existen aquí.':'En TikTok se utilizan seguidores, comentarios, likes, compartidos, regalos y suscripciones.'}</p>`;
    const ids=twitch?{follow:'ptFollow',comment:'ptComment',bitsPer10:'ptBitsPer10',subscription:'ptSub'}:{follow:'ptFollow',comment:'ptComment',like:'ptLike',share:'ptShare',giftPer10Coins:'ptGiftPer10',subscription:'ptSub'};
    Object.entries(ids).forEach(([k,id])=>{const el=$(id);if(el){el.oninput=()=>{pointsDraft[platform][k]=Math.max(0,Number(el.value)||0);};}});
    document.querySelectorAll('[data-points-platform]').forEach(b=>b.classList.toggle('primary',b.dataset.pointsPlatform===platform));
  }
  function bindPointsPage(){
    let platform='tiktok';
    renderPointsPlatformForm(platform);
    document.querySelectorAll('[data-points-platform]').forEach(b=>b.onclick=()=>{platform=b.dataset.pointsPlatform;renderPointsPlatformForm(platform);});
    $('pointsEnabled')?.addEventListener('change',e=>pointsDraft.enabled=e.target.checked);
    $('savePoints')?.addEventListener('click',async()=>{try{await api('/api/points/settings',{method:'PUT',body:JSON.stringify({points:pointsDraft})});toast('Sistema de puntos','Configuración guardada.');}catch(e){toast('No se pudo guardar',e.message,'err');}});
    $('openPointsUsers')?.addEventListener('click',()=>window.open('/points-users.html','streamfusionPointsUsers','width=960,height=800,noopener'));

    const updateManageLabels=()=>{const p=$('pointManagePlatform')?.value||'tiktok'; const label=$('pointManageUserLabel'); if(label){label.firstChild.textContent=p==='twitch'?'Nombre de canal':'Unique ID TikTok'; const input=$('pointManageUser'); if(input){input.placeholder=p==='twitch'?'canal_twitch':'@unique_id'; input.value='';}} const status=$('pointManageStatus'); if(status){status.className='status';status.textContent=p==='tiktok'?'Busca cualquier uniqueId de TikTok; la foto y nombre se consultan directamente.':'Twitch permite buscar el canal directamente.';} $('pointManageResult')?.setAttribute('hidden',''); $('pointAwardRow')?.setAttribute('hidden','');};
    $('pointManagePlatform')?.addEventListener('change',updateManageLabels);

    let selectedUser=null, pollTimer=0;
    const paintUser=(u)=>{selectedUser=u; const result=$('pointManageResult'); const award=$('pointAwardRow'); if(!result||!award)return; result.hidden=false; award.hidden=false; result.innerHTML=`<div class="point-user-avatar ${u.avatarUrl?'has-avatar':'fallback-avatar'}">${u.avatarUrl?`<img src="${esc(u.avatarUrl)}" alt="Foto de perfil de ${esc(u.displayName||u.username)}">`:`<span>${u.platform==='twitch'?'TW':'TT'}</span>`}</div><div class="point-user-meta"><strong>${esc(u.displayName||u.username)}</strong><small>${u.platform==='twitch'?'Twitch':'TikTok'} · @${esc(u.username)}</small></div><div class="point-user-balance"><span>Saldo actual</span><strong>${Number(u.points||0).toLocaleString('es-PE')} pts</strong></div>`;};
    const lookup=async()=>{const p=$('pointManagePlatform')?.value||'tiktok'; const q=String($('pointManageUser')?.value||'').trim(); const status=$('pointManageStatus'); if(!q){if(status){status.className='status err';status.textContent=p==='twitch'?'Escribe el nombre de canal.':'Escribe el uniqueId de TikTok.';}return;} try{const d=await api('/api/points/user?platform='+encodeURIComponent(p)+'&username='+encodeURIComponent(q)); paintUser(d.user); if(status){status.className='status';status.textContent='Usuario encontrado.';} clearInterval(pollTimer); pollTimer=setInterval(async()=>{try{const cur=await api('/api/points/user?platform='+encodeURIComponent(p)+'&username='+encodeURIComponent(q)); paintUser(cur.user);}catch{}},5000);}catch(e){selectedUser=null; $('pointManageResult')?.setAttribute('hidden',''); $('pointAwardRow')?.setAttribute('hidden',''); if(status){status.className='status err';status.textContent=e.message||'No se encontró el usuario.';}}};
    $('findPointUser')?.addEventListener('click',lookup); $('pointManageUser')?.addEventListener('keydown',e=>{if(e.key==='Enter')lookup();});
    $('grantPointUser')?.addEventListener('click',async()=>{if(!selectedUser)return; const amount=Math.max(1,Math.floor(Number($('pointAwardAmount')?.value)||0)); const status=$('pointManageStatus'); try{const d=await api('/api/points/user',{method:'POST',body:JSON.stringify({platform:selectedUser.platform,username:selectedUser.username,displayName:selectedUser.displayName,amount})}); const before=Number(selectedUser.points||0), after=Number(d.account?.points ?? before+amount); selectedUser={...selectedUser,points:after}; paintUser(selectedUser); if(status){status.className='status ok';status.innerHTML=`<strong>✓ Puntos añadidos correctamente</strong> · +${amount.toLocaleString('es-PE')} pts · nuevo saldo ${after.toLocaleString('es-PE')} pts`; } const balance=document.querySelector('.point-user-balance strong'); if(balance){balance.animate([{transform:'scale(1)',color:'inherit'},{transform:'scale(1.16)',color:'#56e39f'},{transform:'scale(1)',color:'inherit'}],{duration:550,easing:'ease-out'});} }catch(e){if(status){status.className='status err';status.textContent=e.message||'No se pudieron añadir los puntos.';}}});
    window.addEventListener('beforeunload',()=>clearInterval(pollTimer),{once:true});
    updateManageLabels();
  }
  function openGivePointsModal(){
    const modal=document.createElement('div');
    modal.className='points-modal';
    modal.innerHTML=`<div class="points-modal-backdrop"></div><section class="points-modal-dialog points-give-dialog">
      <header><div><p class="eyebrow">GESTIÓN DE USUARIOS</p><h3>Dar puntos</h3><p class="muted">El saldo se guarda para tu cuenta StreamFusion y no depende del directo actual.</p></div><button class="miniBtn" data-close-points>×</button></header>
      <div class="points-give-grid">
        <label>Plataforma<select id="givePointsPlatform"><option value="tiktok">TikTok</option><option value="twitch">Twitch</option></select></label>
        <label>Usuario / uniqueId<input id="givePointsUsername" placeholder="@unique_id" autocomplete="off"></label>
        <label>Nombre visible (opcional)<input id="givePointsDisplay" placeholder="Nombre del usuario" autocomplete="off"></label>
        <label>Puntos<input id="givePointsAmount" type="number" min="1" step="1" value="100" inputmode="numeric"></label>
      </div>
      <div id="givePointsStatus" class="status"></div>
      <div class="row"><button class="btn secondary" data-close-points>Cancelar</button><button class="btn primary" id="confirmGivePoints">Añadir puntos</button></div>
    </section>`;
    document.body.appendChild(modal);
    const close=()=>modal.remove(); modal.querySelectorAll('[data-close-points]').forEach(b=>b.onclick=close);
    modal.querySelector('.points-modal-backdrop').onclick=close;
    const status=modal.querySelector('#givePointsStatus');
    modal.querySelector('#confirmGivePoints').onclick=async()=>{
      const platform=modal.querySelector('#givePointsPlatform').value;
      const username=modal.querySelector('#givePointsUsername').value.trim();
      const displayName=modal.querySelector('#givePointsDisplay').value.trim()||username;
      const amount=Math.max(1,Math.floor(Number(modal.querySelector('#givePointsAmount').value)||0));
      if(!username||!amount){status.className='status err';status.textContent='Completa usuario y cantidad de puntos.';return;}
      try{
        const result=await api('/api/points/user',{method:'POST',body:JSON.stringify({platform,username,displayName,amount})});
        status.className='status ok'; status.textContent=result.message||(`Puntos añadidos: +${amount}`);
        setTimeout(close,650);
      }catch(e){status.className='status err';status.textContent=e.message||'No se pudieron añadir los puntos.';}
    };
  }

  function renderPowerTarget(){
    const wrap=$('pvGiftTargetWrap'); if(!wrap) return;
    const p=pointsDraft?.voicePower||{};
    if(p.source==='gift'){
      if(p.platform==='twitch') wrap.innerHTML=`<label>Activación Twitch<select id="pvGiftTarget"><option value="bits" ${p.targetKey==='bits'?'selected':''}>💎 Bits</option><option value="subscription" ${p.targetKey==='subscription'?'selected':''}>⭐ Suscripción</option><option value="subscriptiongift" ${p.targetKey==='subscriptiongift'?'selected':''}>🎁 Suscripción regalada</option></select></label>`;
      else { const gifts=(state.tiktokGiftCatalog||[]).slice(0,150); wrap.innerHTML=`<label>Regalo TikTok<select id="pvGiftTarget"><option value="">Selecciona un regalo</option>${gifts.map(g=>`<option value="${esc(g.key||g.id||g.name)}" ${String(p.targetKey||'')===String(g.key||g.id||g.name)?'selected':''}>${esc(g.displayNameEs||g.name||g.key)}</option>`).join('')}</select></label>`; }
      $('pvGiftTarget').onchange=e=>{pointsDraft.voicePower.targetKey=e.target.value;pointsDraft.voicePower.targetLabel=e.target.options[e.target.selectedIndex]?.textContent||e.target.value;};
    } else wrap.innerHTML='<div class="notice">Esta fuente no requiere seleccionar un regalo.</div>';
  }
  function openPointsUsersModal(powerOnly=false){
    const modal=document.createElement('div');modal.className='points-modal';
    if(!powerOnly){ window.open('/points-manager.html','streamfusionPointsManager','width=1040,height=760,noopener'); return; }
    const source=(settings.voiceBot?.powerUsers)||[];
    modal.innerHTML=`<div class="points-modal-backdrop"></div><section class="points-modal-dialog"><header><div><p class="eyebrow">${powerOnly?'ACCESO 🔥':'SISTEMA DE PUNTOS'}</p><h3>${powerOnly?'Usuarios con poder de voz':'Usuarios y puntos'}</h3></div><button class="miniBtn" data-close-points>×</button></header><div class="points-modal-list">${source.length?source.map((u,i)=> powerOnly?`<div class="points-user-row"><span>🔥</span><div class="grow"><strong>${esc(u.displayName||u.username)}</strong><small>${u.platform==='twitch'?'Twitch':'TikTok'} · @${esc(u.username)}</small></div><button class="miniBtn danger" data-remove-power="${esc(u.platform)}:${esc(u.username)}">Eliminar</button></div>`:`<div class="points-user-row"><span>${i+1}</span><div class="grow"><strong>${esc(u.displayName||u.username)}</strong><small>${u.platform==='twitch'?'Twitch':'TikTok'} · @${esc(u.username)}</small></div><b>${Number(u.points||0).toLocaleString('es-PE')} pts</b></div>`).join(''):'<div class="empty">No hay usuarios todavía.</div>'}</div></section>`;
    document.body.appendChild(modal);const close=()=>modal.remove();modal.querySelector('[data-close-points]').onclick=close;modal.querySelector('.points-modal-backdrop').onclick=close;
    modal.querySelectorAll('[data-remove-power]').forEach(btn=>btn.onclick=async()=>{const [platform,...rest]=btn.dataset.removePower.split(':');const username=rest.join(':');try{settings.voiceBot=settings.voiceBot||{};settings.voiceBot.powerUsers=(settings.voiceBot.powerUsers||[]).filter(v=>!(String(v.platform)===platform && String(v.username).toLowerCase()===username.toLowerCase()));await persistSettingsPatch({voiceBot:{powerUsers:settings.voiceBot.powerUsers}},false);toast('Acceso eliminado','La insignia 🔥 ya no está disponible para esa persona.');close();openPointsUsersModal(true);}catch(e){toast('No se pudo eliminar',e.message,'err')}});
  }
  function closeAppearancePanel(){ document.querySelector('.appearance-popover-overlay')?.remove(); }
  function openAppearancePanel(mode='styles'){
    closeAppearancePanel();
    const a=settings.appearance||{};
    const overlay=document.createElement('div'); overlay.className='appearance-popover-overlay';
    const backgroundImage=String(a.backgroundImage||'').trim();
    if(mode==='styles'){
      overlay.innerHTML=`<div class="appearance-popover-backdrop" data-close-appearance></div><section class="appearance-popover appearance-style-popover"><header class="appearance-popover-head"><div><p class="eyebrow">PERSONALIZACIÓN</p><h3>Estilos de StreamFusion</h3><small>Elige un estilo y se actualizarán juntos el panel lateral, acento, paneles y fondo base.</small></div><button class="mini-close" data-close-appearance aria-label="Cerrar">×</button></header><div class="style-preset-grid appearance-modal-grid">${APP_STYLE_PRESETS.map(p=>`<button type="button" class="style-preset ${String(a.style||'base')===p.id?'active':''}" data-style-preset-modal="${esc(p.id)}"><span class="style-swatch" style="--swatch-accent:${esc(p.accent)};--swatch-side:${esc(p.sidebar)};--swatch-surface:${esc(p.surface)}"><i></i><i></i><b></b></span><span class="style-preset-copy"><strong>${esc(p.name)}</strong><small>${esc(p.desc)}</small></span></button>`).join('')}</div></section>`;
    } else {
      overlay.innerHTML=`<div class="appearance-popover-backdrop" data-close-appearance></div><section class="appearance-popover"><header class="appearance-popover-head"><div><p class="eyebrow">PERSONALIZACIÓN</p><h3>Fondo de la página</h3><small>Agrega una imagen sin modificar los overlays. Puedes usar un archivo o una URL.</small></div><button class="mini-close" data-close-appearance aria-label="Cerrar">×</button></header><div class="appearance-background-stage" style="background-image:${backgroundImage?`url('${esc(backgroundImage)}')`:'none'}"><div><strong>${backgroundImage?'Fondo personalizado activo':'Sin imagen personalizada'}</strong><small>${backgroundImage?'La imagen se conserva hasta que la reemplaces o la retires.':'Se está usando el color base de la página.'}</small></div></div><div class="appearance-bg-modal-grid"><label class="profile-file-label background-file-label"><span>🖼️ Subir imagen</span><input id="appearancePageBgFile" type="file" accept="image/*"><small>PNG, JPG, WEBP · máximo 6 MB</small></label><label>URL de imagen<input id="appearancePageBgUrl" value="${esc(backgroundImage)}" placeholder="https://ejemplo.com/fondo.jpg"><small class="muted">La URL debe comenzar por http:// o https://</small></label></div><div class="row appearance-modal-actions"><button class="btn primary" id="appearanceSaveBgUrl">Aplicar URL</button><button class="btn secondary" id="appearanceClearBg">Quitar imagen</button></div></section>`;
    }
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close-appearance]').forEach(el=>el.onclick=closeAppearancePanel);
    if(mode==='styles'){
      overlay.querySelectorAll('[data-style-preset-modal]').forEach(btn=>btn.onclick=async()=>{ closeAppearancePanel(); applyStylePreset(btn.dataset.stylePresetModal,true); });
    } else {
      const urlInput=overlay.querySelector('#appearancePageBgUrl');
      overlay.querySelector('#appearanceSaveBgUrl').onclick=async()=>{const url=String(urlInput?.value||'').trim();if(url && !/^https?:\/\//i.test(url)){toast('URL no válida','Usa una URL que empiece por http:// o https://.','err');return;}try{settings.appearance={...settings.appearance,backgroundImage:url};await persistSettingsPatch({appearance:{...settings.appearance}},false);applyAppearance();toast('Fondo actualizado',url?'La imagen se aplicó al estudio.':'La imagen de fondo fue retirada.');closeAppearancePanel();renderSettings();}catch(e){toast('No se guardó',e.message,'err');}};
      overlay.querySelector('#appearanceClearBg').onclick=async()=>{try{await api('/api/user/background-image',{method:'DELETE'});settings.appearance={...settings.appearance,backgroundImage:''};applyAppearance();toast('Fondo limpiado','La página volvió a usar su color de fondo.');closeAppearancePanel();renderSettings();}catch(e){toast('No se pudo quitar',e.message,'err');}};
      overlay.querySelector('#appearancePageBgFile').onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>6*1024*1024){toast('Imagen demasiado grande','El máximo es 6 MB.','err');e.target.value='';return;}const reader=new FileReader();reader.onload=async()=>{const dataUrl=String(reader.result||'');if(!dataUrl.startsWith('data:image/')){toast('Archivo no válido','Selecciona una imagen compatible.','err');return;}try{const d=await api('/api/user/background-image',{method:'POST',body:JSON.stringify({dataUrl})});settings.appearance={...settings.appearance,backgroundImage:d.url};applyAppearance();toast('Fondo actualizado','La imagen subida se guardó en tu cuenta.');closeAppearancePanel();renderSettings();}catch(e){toast('No se pudo subir',e.message,'err');}};reader.readAsDataURL(file);};
    }
  }

  function appearanceColorControl(label,id,value,description,key){
    const safeValue=String(value||'#000000');
    return `<div class="appearance-color-row" data-appearance-color-row data-appearance-key="${esc(key)}">
      <div class="appearance-color-copy"><label for="${esc(id)}">${esc(label)}</label><small class="muted">${esc(description)}</small></div>
      <div class="appearance-color-editor">
        <input id="${esc(id)}" type="color" value="${esc(safeValue)}" aria-label="${esc(label)}">
        <span class="appearance-color-line" style="--chosen-color:${esc(safeValue)}" aria-hidden="true"></span>
        <button type="button" class="appearance-reset-btn" data-reset-appearance="${esc(key)}" title="Restaurar color base" aria-label="Restaurar ${esc(label)}">↺</button>
      </div>
    </div>`;
  }

  function renderSettings(){
    const a=settings.appearance||{};
    const moderators=Array.isArray(settings.tiktokModerators)?settings.tiktokModerators:[];
    const twitchModerators=Array.isArray(settings.twitchModerators)?settings.twitchModerators:[];
    const photo=settings.profilePhoto||defaultSettings.profilePhoto;
    const photoUrl=isUsableViewerAvatar(photo.url)?photo.url:'';

    const moderatorEntry=(value,platform)=>{
      if(value && typeof value==='object'){
        return {
          platform,
          username:normalizeUsername(value.username||value.uniqueId||value.user||value.identityKey||''),
          displayName:String(value.displayName||value.nickname||value.name||value.username||value.uniqueId||value.user||'').trim(),
          avatarUrl:isUsableViewerAvatar(value.avatarUrl||value.avatar||'')?(value.avatarUrl||value.avatar):''
        };
      }
      const username=normalizeUsername(value||'');
      return {platform,username,displayName:username,avatarUrl:''};
    };
    const escAttr=(value)=>esc(value).replace(/`/g,'&#96;');
    const avatarMarkup=(entry, size='md')=>entry.avatarUrl
      ? `<img class="moderator-avatar moderator-avatar-${size}" src="${escAttr(entry.avatarUrl)}" alt="${escAttr(entry.displayName||entry.username)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('broken');this.style.display='none';this.nextElementSibling?.classList.remove('hidden')"><span class="moderator-avatar-fallback ${size==='lg'?'lg':''}${entry.platform==='twitch'?' twitch':''}">${esc((entry.displayName||entry.username||'U').slice(0,1).toUpperCase())}</span>`
      : `<span class="moderator-avatar moderator-avatar-${size} moderator-avatar-generated ${entry.platform==='twitch'?'twitch':''}">${esc((entry.displayName||entry.username||'U').slice(0,1).toUpperCase())}</span>`;
    const profileCard=(entry, action='add', buttonId='')=>`
      <div class="moderator-profile ${action==='add'?'moderator-profile-result':''}">
        <div class="moderator-profile-main">
          <div class="moderator-profile-avatar">${avatarMarkup(entry,action==='add'?'lg':'md')}</div>
          <div class="moderator-profile-copy">
            <div class="moderator-profile-name-row"><strong>${esc(entry.displayName||entry.username||'Usuario')}</strong><span class="moderator-badge">🛡️ Moderador</span></div>
            <div class="moderator-profile-username">@${esc(entry.username||'usuario')}</div>
            <small>${entry.platform==='twitch'?'Perfil público de Twitch':'Perfil público de TikTok'}</small>
          </div>
        </div>
        ${action==='add'?`<button type="button" class="btn primary moderator-result-add" id="${buttonId}">Añadir moderador</button>`:`<button type="button" class="moderator-delete" data-remove-moderator-platform="${entry.platform}" data-remove-moderator-user="${escAttr(entry.username)}" aria-label="Eliminar moderador" title="Eliminar moderador">🗑️</button>`}
      </div>`;

    const renderConfigured=(platform)=>{
      const key=platform==='twitch'?'twitchModerators':'tiktokModerators';
      const list=Array.isArray(settings[key])?settings[key]:[];
      const wrap=$(platform==='twitch'?'twitchModeratorList':'tiktokModeratorList');
      if(!wrap)return;
      wrap.innerHTML=list.length?list.map(v=>profileCard(moderatorEntry(v,platform),'list')).join(''):`<div class="moderator-empty-state"><span>🛡️</span><div><strong>No hay moderadores configurados</strong><small>Busca un usuario arriba para añadirlo a este canal.</small></div></div>`;
      wrap.querySelectorAll('[data-remove-moderator-platform]').forEach(btn=>btn.onclick=async()=>{
        const target=String(btn.dataset.removeModeratorUser||'').toLowerCase();
        const targetKey=platform==='twitch'?'twitchModerators':'tiktokModerators';
        settings[targetKey]=(settings[targetKey]||[]).filter(value=>String(moderatorEntry(value,platform).username||'').toLowerCase()!==target);
        await persistSettingsPatch({[targetKey]:settings[targetKey]},false);
        renderConfigured(platform);
      });
    };

    const moderatorPanel=(platform,list)=>{
      const tiktok=platform==='tiktok';
      const inputId=tiktok?'tiktokModeratorInput':'twitchModeratorInput';
      const searchId=tiktok?'searchTiktokModerator':'searchTwitchModerator';
      const resultId=tiktok?'tiktokModeratorResult':'twitchModeratorResult';
      const statusId=tiktok?'tiktokModeratorStatus':'twitchModeratorStatus';
      const listId=tiktok?'tiktokModeratorList':'twitchModeratorList';
      const title=tiktok?'Añadir moderadores TikTok':'Añadir moderadores Twitch';
      const description=tiktok?'Busca el @unique id público del usuario. Verás su foto, nombre y usuario antes de añadirlo.':'Busca el usuario público de Twitch. Verás su foto, nombre y usuario antes de añadirlo.';
      const label=tiktok?'Unique ID de TikTok':'Usuario de Twitch';
      const placeholder=tiktok?'ejemplo: @tiktok':'ejemplo: @twitch';
      return `<article class="card moderator-settings moderator-settings-modern" data-moderator-panel="${platform}">
        <div class="moderator-panel-head">
          <div><p class="eyebrow">${tiktok?'MODERACIÓN TIKTOK':'MODERACIÓN TWITCH'}</p><h3>${title}</h3><p class="muted moderator-panel-description">${description}</p></div>
          <span class="moderator-panel-icon">🛡️</span>
        </div>
        <div class="moderator-search-box">
          <label class="grow">${label}<input id="${inputId}" placeholder="${placeholder}" autocomplete="off" spellcheck="false"></label>
          <button type="button" class="btn primary moderator-search-btn" id="${searchId}">Buscar</button>
        </div>
        <div class="moderator-status" id="${statusId}" aria-live="polite"></div>
        <div class="moderator-result hidden" id="${resultId}"></div>
        <div class="moderator-list" id="${listId}">${list.length?list.map(v=>profileCard(moderatorEntry(v,platform),'list')).join(''):`<div class="moderator-empty-state"><span>🛡️</span><div><strong>No hay moderadores configurados</strong><small>Busca un usuario arriba para añadirlo a este canal.</small></div></div>`}</div>
      </article>`;
    };

    const activeStyle = String(a.style||'base');
    const backgroundImage = String(a.backgroundImage||'').trim();
    $('view').innerHTML=`<div class="settings-page"><div class="intro"><h2>Ajustes</h2><p>Personaliza la apariencia del estudio sin alterar la configuración de tus widgets ni overlays.</p></div>
      <div class="settings-grid two appearance-main-grid">
        <article class="card appearance-controls-card">
          <div class="appearance-card-head"><div><p class="eyebrow">APARIENCIA DEL DASHBOARD</p><h3>Colores principales</h3><p class="muted">Controla la identidad visual del estudio sin tocar tus widgets ni overlays.</p></div><span class="appearance-live-dot">●</span></div>
          <div class="appearance-control-list appearance-color-list">
            ${appearanceColorControl('Paneles','sPanelColor',a.panelColor||'#131625','Color de las tarjetas, paneles y superficies principales.','panelColor')}
            ${appearanceColorControl('Color de acento','sAccent',a.accent||'#7c5cff','Botones, selección y detalles interactivos.','accent')}
            ${appearanceColorControl('Color del panel lateral','sSidebar',a.sidebarColor||'#101321','Menú izquierdo y navegación principal.','sidebarColor')}
            ${appearanceColorControl('Color base de la página','sPageBg',a.pageBackground||'#0b0d18','Fondo usado cuando no hay una imagen personalizada.','pageBackground')}
          </div>
          <div class="appearance-quick-grid">
            <button type="button" class="appearance-quick-card" id="openBackgroundAppearance"><span class="appearance-quick-icon">🖼️</span><span><strong>Fondo</strong><small>Imagen o URL de fondo</small></span><b>›</b></button>
            <button type="button" class="appearance-quick-card" id="openStylesAppearance"><span class="appearance-quick-icon">✨</span><span><strong>Estilos</strong><small>${APP_STYLE_PRESETS.length} estilos listos para usar</small></span><b>›</b></button>
          </div>
          <div class="appearance-current-summary"><span class="appearance-summary-swatch" style="--sum-accent:${esc(a.accent||'#7c5cff')};--sum-side:${esc(a.sidebarColor||'#101321')};--sum-bg:${esc(a.pageBackground||'#0b0d18')}"></span><span><strong>${activeStyle==='custom'?'Personalizado':esc((APP_STYLE_PRESETS.find(x=>x.id===activeStyle)||{}).name||'Base')}</strong><small>Configuración visual actual</small></span></div>
          <button class="btn primary" id="saveAppearance">Guardar cambios</button>
        </article>
        <article class="card account-profile-card"><div class="account-profile-copy"><p class="eyebrow">CUENTA</p><h3>${esc(user?.displayName||'Creador')}</h3><p>${esc(user?.email||'')}</p><p class="muted">ID: ${esc(user?.id||'')}</p><button class="btn secondary" id="logout2">Cerrar sesión</button></div><button type="button" class="profile-photo-box ${photoUrl?'has-photo':''}" id="openProfilePhoto" title="Cambiar foto de perfil">${photoUrl?`<img src="${esc(photoUrl)}" alt="Foto de perfil">`:`<span>+</span><small>Foto</small>`}</button></article>
      </div>
      <div class="settings-grid two moderator-settings-grid">${moderatorPanel('tiktok',moderators)}${moderatorPanel('twitch',twitchModerators)}</div>

    </div>`;

    const appearanceInputs = {
      panelColor: 'sPanelColor',
      accent: 'sAccent',
      sidebarColor: 'sSidebar',
      pageBackground: 'sPageBg'
    };
    const defaultAppearanceColors = {
      panelColor: '#131625',
      accent: '#7c5cff',
      sidebarColor: '#101321',
      pageBackground: '#0b0d18'
    };

    const updateAppearanceEditor = (persist=false) => {
      const next = {...settings.appearance, style:'custom'};
      Object.entries(appearanceInputs).forEach(([key,id])=>{
        const el=$(id);
        if(el) next[key]=el.value;
      });
      settings.appearance=next;
      applyAppearance();
      refreshAppearanceColorRows();
      if (persist) return persistSettingsPatch({appearance:{...settings.appearance}}, false);
    };

    const refreshAppearanceColorRows = () => {
      document.querySelectorAll('[data-appearance-color-row]').forEach(row=>{
        const input=row.querySelector('input[type="color"]');
        const line=row.querySelector('.appearance-color-line');
        if (input && line) line.style.setProperty('--chosen-color', input.value);
      });
    };

    Object.entries(appearanceInputs).forEach(([key,id])=>{
      const input=$(id);
      if(!input) return;
      input.addEventListener('input',()=>updateAppearanceEditor(false));
      input.addEventListener('change',()=>refreshAppearanceColorRows());
      const reset=$(`[data-reset-appearance="${key}"]`);
      if(reset){
        reset.onclick=async()=>{
          input.value=defaultAppearanceColors[key];
          try{
            await updateAppearanceEditor(true);
            refreshAppearanceColorRows();
            toast('Color restaurado',`"${key==='panelColor'?'Paneles':key==='accent'?'Color de acento':key==='sidebarColor'?'Panel lateral':'Fondo de la página'}" volvió a su color base.`);
          }catch(e){
            toast('No se pudo restaurar',e.message||'No se pudo guardar el color base.','err');
          }
        };
      }
    });
    refreshAppearanceColorRows();
    $('saveAppearance').onclick=async()=>{
      try{
        await updateAppearanceEditor(true);
        toast('Apariencia guardada','Tus colores personalizados ya están activos.');
      }catch(e){
        toast('No se guardó',e.message||'No se pudieron guardar los cambios.','err');
      }
    };
    $('logout2').onclick=logout;
    $('openProfilePhoto').onclick=()=>openProfilePhotoModal();
    $('openBackgroundAppearance').onclick=()=>openAppearancePanel('background');
    $('openStylesAppearance').onclick=()=>openAppearancePanel('styles');

    const setupModeratorPanel=(platform)=>{
      const tiktok=platform==='tiktok';
      const input=$(tiktok?'tiktokModeratorInput':'twitchModeratorInput');
      const searchBtn=$(tiktok?'searchTiktokModerator':'searchTwitchModerator');
      const result=$(tiktok?'tiktokModeratorResult':'twitchModeratorResult');
      const status=$(tiktok?'tiktokModeratorStatus':'twitchModeratorStatus');
      const key=tiktok?'tiktokModerators':'twitchModerators';
      let pendingProfile=null;
      const setStatus=(message='',type='')=>{status.className=`moderator-status ${type}`;status.textContent=message;};
      const clearResult=()=>{pendingProfile=null;result.classList.add('hidden');result.innerHTML='';};
      const search=async()=>{
        const username=normalizeUsername(input?.value||'');
        clearResult();
        if(!username){setStatus(tiktok?'Escribe un @unique id de TikTok.':'Escribe un usuario de Twitch.','err');return;}
        const exists=(settings[key]||[]).some(value=>String(moderatorEntry(value,platform).username||'').toLowerCase()===username.toLowerCase());
        if(exists){setStatus('Ese usuario ya está configurado como moderador.','err');renderConfigured(platform);return;}
        setStatus('Buscando perfil público…','loading'); searchBtn.disabled=true; searchBtn.textContent='Buscando…';
        try{
          const data=await api(`/api/moderators/lookup?platform=${encodeURIComponent(platform)}&username=${encodeURIComponent(username)}`);
          pendingProfile={...data.profile,platform};
          result.innerHTML=profileCard(pendingProfile,'add',tiktok?'confirmTiktokModerator':'confirmTwitchModerator');
          result.classList.remove('hidden');
          setStatus('Perfil encontrado. Comprueba que sea la persona correcta antes de añadirla.','ok');
          result.querySelector('.moderator-result-add').onclick=async()=>{
            const normalized=moderatorEntry(pendingProfile,platform);
            const duplicate=(settings[key]||[]).some(value=>String(moderatorEntry(value,platform).username||'').toLowerCase()===normalized.username.toLowerCase());
            if(duplicate){setStatus('Ese usuario ya está configurado como moderador.','err');return;}
            settings[key]=[...(settings[key]||[]),{username:normalized.username,uniqueId:tiktok?normalized.username:undefined,displayName:normalized.displayName,avatarUrl:normalized.avatarUrl}];
            await persistSettingsPatch({[key]:settings[key]},false);
            input.value=''; clearResult(); setStatus('Moderador añadido correctamente. 🛡️ se aplicará en toda la experiencia.','ok'); renderConfigured(platform); toast('Moderador añadido',`${normalized.displayName||normalized.username} ahora tiene la insignia 🛡️.`);
          };
        }catch(e){setStatus(e.message||'No se pudo encontrar ese perfil.','err');}
        finally{searchBtn.disabled=false;searchBtn.textContent='Buscar';}
      };
      searchBtn.onclick=search;
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
      input.addEventListener('input',()=>{if(result&&!result.classList.contains('hidden'))clearResult();if(status.textContent)setStatus('');});
      renderConfigured(platform);
    };

    setupModeratorPanel('tiktok');
    setupModeratorPanel('twitch');
  }

  async function openLibraryImagePicker({onSelect, title='Biblioteca de imágenes', description='Selecciona una imagen o GIF de tu biblioteca.'}={}){
    try{ await loadLibrary(); }catch(e){ toast('Biblioteca',e.message,'err'); return; }
    const modal=document.createElement('div'); modal.className='sf-library-image-picker-modal';
    const images=()=>libraryFiles.filter(f=>f.kind==='images');
    const render=()=>{
      const items=images();
      const tiles=items.map(file=>`<button type="button" class="sf-library-image-picker-tile" data-lib-id="${esc(file.id)}" title="${esc(file.name)}"><span class="sf-library-image-picker-thumb"><img src="${esc(file.url)}" alt="${esc(file.name)}" loading="lazy"></span><span>${esc(file.name)}</span></button>`).join('');
      modal.querySelector('[data-picker-grid]').innerHTML=`<button type="button" class="sf-library-image-picker-upload" data-picker-upload><span>＋</span><strong>Subir</strong><small>PNG · JPG · GIF</small></button>${tiles||''}`;
      modal.querySelectorAll('[data-lib-id]').forEach(btn=>btn.onclick=()=>{const f=libraryFiles.find(x=>String(x.id)===String(btn.dataset.libId));if(f){onSelect?.(f);closePicker();}});
      modal.querySelector('[data-picker-upload]').onclick=()=>modal.querySelector('[data-picker-file]').click();
    };
    modal.innerHTML=`<div class="sf-library-image-picker-backdrop" data-picker-close></div><section class="sf-library-image-picker-dialog" role="dialog" aria-modal="true"><header><div><p class="eyebrow">BIBLIOTECA</p><h3>${esc(title)}</h3><p>${esc(description)}</p></div><button type="button" class="sf-library-image-picker-close" data-picker-close>×</button></header><div class="sf-library-image-picker-grid" data-picker-grid></div><input type="file" hidden data-picker-file accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"><footer><span>Las imágenes y GIFs que subas quedan guardados en tu Biblioteca.</span><span>${formatBytes(libraryUsage.freeBytes)} libres</span></footer></section>`;
    document.body.appendChild(modal);
    const closePicker=()=>{modal.remove();document.removeEventListener('keydown',onPickerKey);};
    const onPickerKey=ev=>{if(ev.key==='Escape')closePicker();};
    document.addEventListener('keydown',onPickerKey);
    modal.querySelectorAll('[data-picker-close]').forEach(x=>x.onclick=closePicker);
    modal.querySelector('[data-picker-file]').onchange=async e=>{ const file=e.target.files?.[0]; if(!file)return; const before=new Set(images().map(x=>String(x.id))); await uploadLibraryFiles('images',[file]); await loadLibrary(); render(); const newest=images().find(x=>!before.has(String(x.id))) || images()[0]; if(newest) { onSelect?.(newest); closePicker(); } e.target.value=''; };
    render();
  }

  async function openProfilePhotoModal(){
    const modal=document.createElement('div'); modal.className='profile-photo-modal';
    modal.innerHTML=`<div class="profile-photo-backdrop"></div><section class="profile-photo-dialog"><header><div><p class="eyebrow">CUENTA</p><h3>Foto de perfil</h3><p class="muted">Selecciona una imagen o GIF y confirma antes de aplicarlo.</p></div><button type="button" class="mini-close" data-close>×</button></header><div class="profile-photo-tabs"><button type="button" class="profile-photo-tab active" data-source="local">Biblioteca</button><button type="button" class="profile-photo-tab" data-source="url">URL</button><button type="button" class="profile-photo-tab" data-source="twitch">Twitch</button><button type="button" class="profile-photo-tab" data-source="tiktok">TikTok</button></div><div id="profilePhotoBody"></div><div class="profile-photo-status" id="profilePhotoStatus"></div></section>`;
    document.body.appendChild(modal);
    const body=modal.querySelector('#profilePhotoBody'); const status=modal.querySelector('#profilePhotoStatus'); let source='local'; let pending=null;
    const close=()=>modal.remove(); modal.querySelector('[data-close]').onclick=close; modal.querySelector('.profile-photo-backdrop').onclick=close;
    const setStatus=(text='',type='')=>{status.className=`profile-photo-status ${type}`;status.textContent=text;};
    const renderPendingPreview=(item)=>{
      pending=item||null;
      const preview=body.querySelector('#profilePhotoPreview'); if(!preview)return;
      if(!item){ preview.innerHTML='<span>Selecciona una imagen para verla aquí</span>'; return; }
      preview.innerHTML=`<div class="profile-photo-selected-preview"><img src="${esc(item.previewUrl||item.url||'')}" alt="${esc(item.name||'Foto de perfil')}"><div class="profile-photo-confirm"><span>¿Usar esta imagen?</span><button type="button" class="yes" data-profile-confirm aria-label="Confirmar">✓</button><button type="button" class="no" data-profile-cancel aria-label="Cancelar">✕</button></div></div>`;
      preview.querySelector('[data-profile-confirm]')?.addEventListener('click',async()=>{
        if(!pending)return;
        try{
          const payload=pending.libraryId?{libraryId:pending.libraryId}:{pendingId:pending.pendingId};
          const saved=await api('/api/profile-photo/select',{method:'POST',body:JSON.stringify(payload)});
          settings.profilePhoto=saved.photo; renderTop(); renderSettings(); toast('Foto de perfil','Imagen seleccionada correctamente.'); modal.remove();
        }catch(e){setStatus(e.message||'No se pudo guardar la foto.','err');}
      });
      preview.querySelector('[data-profile-cancel]')?.addEventListener('click',()=>{pending=null;renderPendingPreview(null);setStatus('Selección cancelada.');});
    };
    const renderBody=async()=>{
      const labels={url:'Pega una URL directa de imagen.',twitch:'Escribe el usuario o canal de Twitch.',tiktok:'Escribe el @unique id de TikTok.'};
      const inputLabel=source==='url'?'URL de imagen':source==='twitch'?'Canal Twitch':'Unique ID TikTok';
      if(source==='local'){
        body.innerHTML=`<div class="profile-photo-library-intro"><div><p class="eyebrow">BIBLIOTECA</p><strong>Seleccionar imagen</strong><small>Elige una imagen o GIF guardado en tu Biblioteca.</small></div><button type="button" class="btn primary profile-open-library" id="openProfileLibrary">Abrir biblioteca</button></div><div class="profile-photo-preview profile-photo-library-preview" id="profilePhotoPreview"><span>Selecciona una imagen para verla aquí</span></div>`;
        body.querySelector('#openProfileLibrary').onclick=()=>openLibraryImagePicker({title:'Seleccionar foto de perfil',description:'Elige una imagen o GIF de tu Biblioteca. También puedes subir uno nuevo.',onSelect:file=>{renderPendingPreview({libraryId:file.id,previewUrl:file.url,name:file.name});setStatus('Imagen preparada. Confirma con ✓ para aplicarla.');}});
        renderPendingPreview(pending);
      }else{
        body.innerHTML=`<div class="profile-photo-lookup-row"><label class="grow">${inputLabel}<input id="profilePhotoInput" placeholder="${source==='url'?'https://...':source==='twitch'?'canal_twitch':'@unique_id'}" autocomplete="off"></label><button class="btn primary" id="profilePhotoSearch">Buscar</button></div><p class="muted profile-photo-hint">${labels[source]}</p><div class="profile-photo-preview" id="profilePhotoPreview"><span>Aquí aparecerá la foto</span></div>`;
        body.querySelector('#profilePhotoSearch').onclick=async()=>{const value=String(body.querySelector('#profilePhotoInput')?.value||'').trim(); if(!value){setStatus('Escribe un valor primero.','err');return;} setStatus('Buscando foto...'); try{const d=await api('/api/profile-photo/lookup',{method:'POST',body:JSON.stringify({source,value})}); renderPendingPreview({pendingId:d.pendingId,previewUrl:d.previewUrl,name:d.nickname||d.label||'Foto'}); setStatus('Imagen preparada. Confirma con ✓ para aplicarla.');}catch(e){setStatus(e.message||'No se pudo obtener la foto.','err');}};
      }
    };
    modal.querySelectorAll('[data-source]').forEach(btn=>btn.onclick=()=>{source=btn.dataset.source;pending=null;modal.querySelectorAll('.profile-photo-tab').forEach(b=>b.classList.toggle('active',b.dataset.source===source));setStatus('');renderBody();});
    await renderBody();
  }

  function applyVoiceLibrarySync(payload={}){
    const voices=Array.isArray(payload?.voices)?payload.voices:[];
    state.voices=voices.filter(v=>v && String(v.fishId||v.id||'').trim());
    const base=Array.isArray(state.catalog)?state.catalog.filter(v=>v?.library!=='fish' && !String(v?.key||'').startsWith('fish:')):[];
    const custom=state.voices.map(v=>({key:`fish:${v.fishId||v.id}`,id:v.fishId||v.id,fishId:v.fishId||v.id,label:v.label,author:v.author||'',description:v.description||'',image:v.imageUrl||'',tags:Array.isArray(v.tags)?v.tags:[],library:'fish',referenceId:v.fishId||v.id,aliases:Array.isArray(v.tags)?v.tags:[]}));
    state.catalog=[...base,...custom];
  }

  let libraryTab = 'images';
  let libraryFiles = [];
  let libraryUsage = {usedBytes:0,maxBytes:50*1024*1024,freeBytes:50*1024*1024,fileCount:0};
  let libraryContextMenu = null;

  function formatBytes(bytes){ const n=Number(bytes||0); if(n<1024) return `${n} B`; const units=['KB','MB','GB']; let v=n/1024; let i=0; while(v>=1024&&i<units.length-1){v/=1024;i++;} return `${v.toFixed(v>=10?1:2)} ${units[i]}`; }
  function libraryKindLabel(kind){return kind==='images'?'Fotos y GIFs':kind==='audio'?'Audios':'Videos';}
  function libraryActionIcon(action,size=16){ const common=`width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`; if(action==='rename')return `<svg ${common}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>`; if(action==='download')return `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`; if(action==='delete')return `<svg ${common}><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>`; return `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="m10 8 5 4-5 4z"/></svg>`; }
  function libraryIcon(kind,size=20){
    const common=`width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
    if(kind==='images') return `<svg ${common}><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.4"/><path d="m5 17 4.3-4.3a1.8 1.8 0 0 1 2.55 0L14 14.85l1.45-1.45a1.8 1.8 0 0 1 2.55 0L19 14.4 21 16.4"/></svg>`;
    if(kind==='audio') return `<svg ${common}><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>`;
    return `<svg ${common}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/></svg>`;
  }
  function libraryAccept(kind){return kind==='images'?'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp':kind==='audio'?'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus':'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v';}
  function libraryPreview(file){
    const url=esc(file.url); const name=esc(file.name);
    if(file.kind==='images') return `<div class="sf-library-thumb sf-library-preview-trigger" data-library-preview="1" role="button" tabindex="0" aria-label="Visualizar ${name}"><img src="${url}" alt="${name}" loading="lazy"></div>`;
    if(file.kind==='video') return `<div class="sf-library-thumb sf-library-media-thumb sf-library-preview-trigger" data-library-preview="1" role="button" tabindex="0" aria-label="Reproducir ${name}"><video src="${url}" muted preload="metadata" playsinline></video><span class="sf-library-media-badge">VIDEO</span></div>`;
    return `<div class="sf-library-thumb sf-library-audio-thumb sf-library-preview-trigger" data-library-preview="1" role="button" tabindex="0" aria-label="Reproducir ${name}"><div class="sf-library-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span class="sf-library-audio-symbol">${libraryIcon('audio',34)}</span><span class="sf-library-media-badge">AUDIO</span></div>`;
  }
  async function loadLibrary(){ const d=await api('/api/library'); libraryFiles=Array.isArray(d.files)?d.files:[]; libraryUsage=d.usage||libraryUsage; }
  function closeLibraryContext(){ if(libraryContextMenu){libraryContextMenu.remove();libraryContextMenu=null;} }
  function openLibraryPreview(file){
    closeLibraryContext();
    document.querySelector('.sf-library-preview-modal')?.remove();
    const modal=document.createElement('div'); modal.className='sf-library-preview-modal';
    const title=esc(file.name); const url=esc(file.url);
    const isVideo=file.kind==='video'; const isAudio=file.kind==='audio';
    let content='';
    if(file.kind==='images'){
      content=`<div class="sf-library-preview-stage sf-image-stage"><img src="${url}" alt="${title}"></div>`;
    } else {
      const mediaTag=isVideo?`<video class="sf-library-custom-media" src="${url}" preload="metadata" playsinline></video>`:`<audio class="sf-library-custom-media" src="${url}" preload="metadata"></audio>`;
      content=`<div class="sf-library-player ${isVideo?'is-video':'is-audio'}" data-player-kind="${isVideo?'video':'audio'}">
        <div class="sf-library-player-stage">${mediaTag}<div class="sf-library-player-overlay"><div class="sf-library-player-art">${libraryIcon(file.kind,46)}</div><span class="sf-library-player-badge">${isVideo?'VIDEO':'AUDIO'}</span></div></div>
        <div class="sf-library-player-controls">
          <button type="button" class="sf-library-player-play" data-player-play aria-label="Reproducir">▶</button>
          <div class="sf-library-player-main"><div class="sf-library-player-times"><span data-player-current>0:00</span><span data-player-duration>0:00</span></div><input type="range" min="0" max="100" step="0.01" value="0" data-player-seek aria-label="Progreso"></div>
          <button type="button" class="sf-library-player-mute" data-player-mute aria-label="Silenciar">⌕</button>
          <input class="sf-library-player-volume" type="range" min="0" max="1" step="0.01" value="1" data-player-volume aria-label="Volumen">
          ${isVideo?'<button type="button" class="sf-library-player-full" data-player-full aria-label="Pantalla completa">⛶</button>':''}
        </div>
      </div>`;
    }
    modal.innerHTML=`<div class="sf-library-preview-backdrop" data-close-preview></div><section class="sf-library-preview-dialog ${isVideo||isAudio?'sf-library-media-dialog':''}" role="dialog" aria-modal="true" aria-label="${title}"><header><div class="sf-library-preview-title"><span class="sf-library-preview-kind">${libraryIcon(file.kind,18)}</span><div><strong>${title}</strong><small>${libraryKindLabel(file.kind)} · ${formatBytes(file.sizeBytes)}</small></div></div><button type="button" class="sf-library-preview-close" data-close-preview aria-label="Cerrar">×</button></header>${content}</section>`;
    document.body.appendChild(modal);
    const close=()=>{ const media=modal.querySelector('.sf-library-custom-media'); try{media?.pause();}catch{} modal.remove(); };
    modal.querySelectorAll('[data-close-preview]').forEach(el=>el.onclick=close);
    modal.addEventListener('keydown',e=>{if(e.key==='Escape')close()}); modal.tabIndex=-1; modal.focus();
    const media=modal.querySelector('.sf-library-custom-media');
    if(!media) return;
    const playBtn=modal.querySelector('[data-player-play]'), seek=modal.querySelector('[data-player-seek]'), volume=modal.querySelector('[data-player-volume]'), mute=modal.querySelector('[data-player-mute]'), full=modal.querySelector('[data-player-full]');
    const current=modal.querySelector('[data-player-current]'), duration=modal.querySelector('[data-player-duration]');
    const fmt=t=>{const n=Math.max(0,Number(t)||0),m=Math.floor(n/60),sec=Math.floor(n%60);return `${m}:${String(sec).padStart(2,'0')}`;};
    const sync=()=>{const dur=Number(media.duration)||0,pos=Number(media.currentTime)||0; current.textContent=fmt(pos);duration.textContent=fmt(dur); if(dur>0) seek.value=(pos/dur)*100; playBtn.textContent=media.paused?'▶':'Ⅱ'; playBtn.setAttribute('aria-label',media.paused?'Reproducir':'Pausar');};
    playBtn.onclick=()=>{if(media.paused)media.play().catch(()=>{});else media.pause();};
    seek.oninput=()=>{const dur=Number(media.duration)||0;if(dur)media.currentTime=(Number(seek.value)/100)*dur;};
    volume.oninput=()=>{media.volume=Number(volume.value);media.muted=media.volume===0;};
    mute.onclick=()=>{media.muted=!media.muted;mute.textContent=media.muted?'◉':'⌕';};
    full?.addEventListener('click',()=>{const stage=modal.querySelector('.sf-library-player-stage');if(stage?.requestFullscreen)stage.requestFullscreen().catch(()=>{});});
    ['loadedmetadata','timeupdate','play','pause','ended','volumechange','ratechange'].forEach(ev=>media.addEventListener(ev,sync));
    sync();
    // Intentional autoplay only for user-initiated preview via a trusted click/context menu.
    media.play().catch(()=>{});
  }
  function showLibraryContextMenu(e,file){
    e.preventDefault(); closeLibraryContext();
    const menu=document.createElement('div'); menu.className='sf-library-context';
    const previewLabel=file.kind==='images'?'Visualizar':'Reproducir'; const previewIcon=file.kind==='images'?libraryIcon('images',16):libraryIcon(file.kind,16);
    menu.innerHTML=`<button data-act="preview">${previewIcon}<span>${previewLabel}</span></button><button data-act="rename">${libraryActionIcon('rename')}<span>Renombrar</span></button><button data-act="download">${libraryActionIcon('download')}<span>Descargar</span></button><div class="sf-library-context-sep"></div><button data-act="delete" class="danger">${libraryActionIcon('delete')}<span>Eliminar</span></button>`;
    document.body.appendChild(menu); libraryContextMenu=menu;
    const rect=menu.getBoundingClientRect(); const x=Math.min(e.clientX,window.innerWidth-rect.width-10), y=Math.min(e.clientY,window.innerHeight-rect.height-10); menu.style.left=`${Math.max(8,x)}px`; menu.style.top=`${Math.max(8,y)}px`;
    menu.querySelector('[data-act="preview"]').onclick=()=>openLibraryPreview(file);
    menu.querySelector('[data-act="rename"]').onclick=()=>{closeLibraryContext(); beginLibraryRename(file)};
    menu.querySelector('[data-act="download"]').onclick=()=>{closeLibraryContext(); const a=document.createElement('a');a.href=file.url+'?download=1';a.download=file.name;a.click();};
    menu.querySelector('[data-act="delete"]').onclick=async()=>{closeLibraryContext();if(!confirm(`¿Eliminar “${file.name}”?`))return;try{await api(`/api/library/${encodeURIComponent(file.id)}`,{method:'DELETE'});toast('Biblioteca','Archivo eliminado.');await loadLibrary();renderLibrary();}catch(e){toast('No se pudo eliminar',e.message,'err');}};
    setTimeout(()=>document.addEventListener('pointerdown',(ev)=>{if(!libraryContextMenu||libraryContextMenu.contains(ev.target))return;closeLibraryContext();},{once:true}),0);
  }
  function beginLibraryRename(file){
    const host=document.querySelector(`[data-library-id="${CSS.escape(String(file.id))}"]`); if(!host)return;
    const nameEl=host.querySelector('.sf-library-name'); if(!nameEl)return; const input=document.createElement('input'); input.className='sf-library-inline-name'; input.value=file.name; nameEl.replaceWith(input); input.focus();input.select();
    let done=false; const finish=async(save=true)=>{if(done)return;done=true;const value=input.value.trim();if(save&&value&&value!==file.name){try{const d=await api(`/api/library/${encodeURIComponent(file.id)}`,{method:'PATCH',body:JSON.stringify({name:value})});file.name=d.file?.name||value;toast('Biblioteca','Nombre actualizado.');}catch(e){toast('No se pudo renombrar',e.message,'err');}}renderLibrary();};
    input.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();finish(true);}else if(ev.key==='Escape')finish(false);});input.addEventListener('blur',()=>finish(true));
  }
  async function uploadLibraryFiles(kind, files){
    const list=Array.from(files||[]).filter(Boolean); if(!list.length)return;
    for(const file of list){
      if(file.size>libraryUsage.freeBytes){toast('Biblioteca llena',`“${file.name}” no cabe en el espacio disponible (${formatBytes(libraryUsage.freeBytes)}).`,'err');continue;}
      const form=new FormData();form.append('file',file,file.name);
      try{const d=await api('/api/library/upload',{method:'POST',headers:{'X-Library-Kind':kind},body:form});libraryUsage=d.usage||libraryUsage;libraryFiles.unshift(d.file);toast('Archivo subido',`${file.name} se guardó en tu biblioteca.`);}catch(e){toast('No se pudo subir',`${file.name}: ${e.message}`,'err');}
    }
    await loadLibrary(); renderLibrary();
  }
  function renderLibrary(){
    closeLibraryContext();
    const items=libraryFiles.filter(f=>f.kind===libraryTab);
    $('view').innerHTML=`<div class="intro split"><div><p class="eyebrow">RECURSOS</p><h2>Biblioteca</h2><p>Guarda tus archivos en tu cuenta y reutilízalos en tus creaciones sin llenar el editor.</p></div><div class="sf-library-usage"><strong>${formatBytes(libraryUsage.usedBytes)}</strong><span>de 50 MB usados</span><div><i style="width:${Math.min(100,(libraryUsage.usedBytes/libraryUsage.maxBytes)*100)}%"></i></div></div></div>
    <section class="card sf-library-shell"><div class="sf-library-tabs">${[['images','Fotos y GIFs'],['audio','Audios'],['video','Videos']].map(([id,label])=>`<button class="sf-library-tab ${libraryTab===id?'active':''}" data-library-tab="${id}">${libraryIcon(id,18)}<span>${label}</span><em>${libraryFiles.filter(f=>f.kind===id).length}</em></button>`).join('')}</div>
    <div class="sf-library-head"><div><p class="eyebrow">${libraryKindLabel(libraryTab).toUpperCase()}</p><h3>Tu colección</h3></div><label class="btn primary sf-library-upload">＋ Subir archivo<input type="file" id="libraryFilePicker" accept="${libraryAccept(libraryTab)}" multiple></label></div>
    <div class="sf-library-content" id="libraryContent">${items.length?`<div class="sf-library-grid"><button type="button" class="sf-library-upload-tile" id="libraryGridUpload" aria-label="Subir archivo"><span class="sf-library-upload-tile-icon">＋</span><strong>Subir archivo</strong><small>o arrastra aquí</small></button>${items.map(file=>`<article class="sf-library-card" data-library-id="${esc(file.id)}" title="Clic derecho o ⋯ para más acciones"><div class="sf-library-card-menu" data-library-menu aria-label="Más opciones">⋯</div>${libraryPreview(file)}<div class="sf-library-card-body"><strong class="sf-library-name" title="Doble clic para renombrar">${esc(file.name)}</strong><small>${formatBytes(file.sizeBytes)} · ${new Date(file.createdAt||Date.now()).toLocaleDateString()}</small></div></article>`).join('')}</div>`:`<button type="button" class="sf-library-empty" id="libraryDropZone" aria-label="Subir archivo a la biblioteca"><span class="sf-library-empty-icon">＋</span><span class="sf-library-empty-title">Sube tu primer archivo</span><span class="sf-library-empty-text">Arrastra un ${libraryTab==='images'?'GIF, PNG o JPG':libraryTab==='audio'?'MP3, WAV u otro audio':'MP4 u otro video'} aquí</span></button>`}</div>
    <div class="sf-library-foot"><span>${items.length} archivo${items.length===1?'':'s'} en ${libraryKindLabel(libraryTab)}</span><span>El contenido se guarda en tu cuenta · ${formatBytes(libraryUsage.freeBytes)} libres</span></div></section>`;
    document.querySelectorAll('[data-library-tab]').forEach(btn=>btn.onclick=()=>{libraryTab=btn.dataset.libraryTab;renderLibrary();});
    const picker=$('libraryFilePicker'), zone=$('libraryDropZone'), gridUpload=$('libraryGridUpload');
    picker?.addEventListener('change',e=>uploadLibraryFiles(libraryTab,e.target.files));
    zone?.addEventListener('click',()=>picker?.click());
    gridUpload?.addEventListener('click',()=>picker?.click());
    const target=$('libraryContent');
    const dropTarget=zone||target;
    dropTarget?.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();zone?.classList.add('dragover');});
    dropTarget?.addEventListener('dragleave',e=>{if(e.currentTarget===e.target||!e.currentTarget.contains(e.relatedTarget))zone?.classList.remove('dragover');});
    dropTarget?.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();zone?.classList.remove('dragover');uploadLibraryFiles(libraryTab,e.dataTransfer.files);});
    document.querySelectorAll('.sf-library-card').forEach(card=>{const file=libraryFiles.find(x=>String(x.id)===String(card.dataset.libraryId));if(!file)return;card.addEventListener('contextmenu',e=>showLibraryContextMenu(e,file));card.querySelector('[data-library-menu]')?.addEventListener('click',e=>{e.stopPropagation(); const r=e.currentTarget.getBoundingClientRect(); showLibraryContextMenu({preventDefault(){},clientX:r.right-4,clientY:r.bottom+5},file);}); const preview=card.querySelector('[data-library-preview]'); preview?.addEventListener('dblclick',e=>{e.preventDefault();openLibraryPreview(file);}); preview?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLibraryPreview(file);}}); card.querySelector('.sf-library-name')?.addEventListener('dblclick',()=>beginLibraryRename(file));});
  }
  async function openLibraryPage(){ try{await loadLibrary();}catch(e){toast('Biblioteca',e.message,'err');} renderLibrary(); }

  function render(){ applyAppearance(); activateNav(); renderTop(); if(page==='dashboard')renderDashboard(); else if(page==='connections')renderConnections(); else if(page==='customize')renderCustomize(); else if(page==='overlays')renderOverlays(); else if(page==='roulette')renderRoulette(); else if(page==='voices')renderVoices(); else if(page==='points')renderPoints(); else if(page==='widgets')renderWidgets(); else if(page==='library')openLibraryPage(); else renderSettings(); }

  function classifyEvent(item){ return activityKind(item); }
  function isCurrentConnectionEvent(item){
    const platform=String(item?.platform||'').toLowerCase();
    if(platform!=='tiktok' && platform!=='twitch') return true;
    const eventConnectionId=String(item?.connectionId||'').trim();
    if(!eventConnectionId) return true; // history/legacy entries without a session id
    const account=state.accounts[platform]||{};
    const current=String(account.connectionId||'').trim();
    // During the connection handshake the first chat/event can arrive before
    // accountState reaches the browser. Do not drop those legitimate events.
    if(!current && account.connected) return true;
    if(!current) return true;
    return eventConnectionId===current;
  }
  function acceptChat(item){
    if(!isCurrentConnectionEvent(item)) return;
    const entry={...item,timestamp:item.timestamp||Date.now()};
    rememberPermanentProfile(entry);
    // Cada comentario puede traer la insignia persistente del ultimo regalo.
    // La copiamos a la memoria visual del usuario para que incluso renderizados
    // posteriores no dependan del orden regalo -> comentario.
    recordActivity(entry);
    const key=eventFingerprint(entry,'chat'); const now=Date.now();
    for(const [k,t] of recentEventKeys) if(now-t>15000) recentEventKeys.delete(k);
    if(recentEventKeys.has(key)) return; recentEventKeys.set(key,now);
    state.chat.push(entry); if(state.chat.length>500)state.chat.splice(0,state.chat.length-500);
    if(page==='dashboard') updateDashboardFeeds();
  }
  function acceptEvent(item){
    if(!isCurrentConnectionEvent(item)) return;
    const entry=normalizeIncomingActivity({...item,timestamp:item.timestamp||Date.now()});
    const key=eventFingerprint(entry,'activity'); const now=Date.now();
    for(const [k,t] of recentEventKeys) if(now-t>15000) recentEventKeys.delete(k);
    if(recentEventKeys.has(key)) return; recentEventKeys.set(key,now);
    rememberPermanentProfile(entry); recordActivity(entry); const kind=classifyEvent(entry); (kind==='gift'?state.gifts:state.events).push(entry);
    if(state.events.length>300)state.events.shift(); if(state.gifts.length>300)state.gifts.shift();
    if(page==='dashboard') updateDashboardFeeds();
  }
  async function hydrateHistory(){
    try {
      const data=await api('/api/live-history');
      (data.chat||[]).forEach(x=>acceptChat({...x, connectionId:x?.connectionId||''}));
      (data.events||[]).forEach(x=>acceptEvent({...x, connectionId:x?.connectionId||''}));
      state.chat=state.chat.slice(-500);
      state.historyLoaded=true;
      if(page==='dashboard')renderDashboard();
      if(page==='customize'&&activeCustomizeTab==='chat')renderCustomizePreviewOnly();
    } catch(e){ console.warn('live history',e); }
  }

  function setupSocket(){
    if(socket) socket.disconnect();
    socket=io({auth:{token:token()},transports:['polling','websocket'],upgrade:true,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:10000,randomizationFactor:0.25,timeout:15000});
    socket.on('connect',async()=>{
      state.connection='online'; renderTop();
      // Always rehydrate the account's recent Dashboard data after every socket
      // connection/reconnection so the first frame cannot miss chat/events.
      await hydrateHistory();
      if(page==='dashboard') renderDashboard(true);
      if(page==='connections'||page==='overlays')render();
    });
    socket.on('disconnect',()=>{state.connection='offline'; renderTop(); if(page==='overlays')renderOverlays();});
    socket.on('connect_error',err=>toast('Conexión',err.message||'No se pudo conectar al stream.','err'));
    socket.on('musicSettings', cfg=>{settings.musicWidget=cfg||settings.musicWidget;if(page==='widgets'&&window.__sfMusicWidgetEditorOpen){/* Keep the live draft; reconnects must never discard unsaved editor changes. */}});
  socket.on('musicState', snap=>{
    if(!snap)return;
    // Las canciones de simulación son el único origen que controla también la vista previa.
    if(snap?.simulationActive && snap?.simulationCurrent){
      const next=structuredClone(snap.simulationCurrent);
      const sameTrack=String(musicPreviewState?.current?.sourceId||'')===String(next.sourceId||'');
      const authoritativeElapsed=musicServerSyncElapsed(snap);
      musicPreviewState={current:next,queue:Array.isArray(snap.simulationQueue)?snap.simulationQueue:[],previous:snap.simulationPrevious||null,elapsed:authoritativeElapsed,playing:Boolean(snap.playing&&!snap.paused),paused:Boolean(snap.paused),simulated:true,source:'simulation',serverStartedAt:Number(snap.startedAt||0)};
      musicSimulationTrack=next;
      if(page==='widgets'&&window.__sfMusicWidgetEditorOpen){
        musicWidgetSimulating=true;
        if(!sameTrack) musicPreviewDraw(musicPreviewState); else updateMusicPreviewDynamic();
        $('musicSimulate')?.classList.add('is-hidden');$('musicStopSimulation')?.classList.remove('is-hidden');
        const status=$('musicSimulationStatus');if(status){status.textContent='Simulación vinculada al overlay · reproducción sincronizada';status.classList.remove('is-hidden','is-loading');}
        ensureMusicPreviewPlayer().then(player=>{
          try{
            const desired=Math.max(0,musicServerSyncElapsed(snap));
            const local=Number(player.getCurrentTime?.()||0);
            // Both the editor preview and the generated overlay use the same
            // server startedAt epoch. Correct only meaningful drift so the iframe
            // does not visibly jump on every telemetry packet.
            if(Math.abs(local-desired)>0.35){player.seekTo?.(desired,true);syncMusicPreviewVinylAnimation(desired,Boolean(snap.playing&&!snap.paused),String(next.id||next.sourceId||''));}
          }catch{}
          try{
            const shouldPlay=Boolean(snap.playing&&!snap.paused), ps=player.getPlayerState?.();
            if(shouldPlay && ps!==YT.PlayerState.PLAYING) player.playVideo?.();
            if(!shouldPlay && ps===YT.PlayerState.PLAYING) player.pauseVideo?.();
          }catch{}
        }).catch(()=>{});
        startMusicPreviewClock();
      }
      return;
    }
    // Una canción de DIRECT PLAYLIST / chat solo afecta el overlay. Nunca reemplaza
    // la última canción mostrada en la vista previa mientras la simulación siga activa.
    if(Array.isArray(snap?.simulationQueue) && page==='widgets'&&window.__sfMusicWidgetEditorOpen){
      musicPreviewState={...musicPreviewState,queue:snap.simulationQueue,simulated:true};
      if(!musicWidgetSimulating) renderMusicPlaylistPanel();
    }
  });
  socket.on('musicPreviewSettings', cfg=>{ if(page==='widgets'&&window.__sfMusicWidgetEditorOpen){ musicWidgetDraft=musicMerge(musicWidgetDraft||musicDefault(),cfg||{}); applyMusicPreviewAppearance(); }});
  socket.on('musicAppearanceSync', cfg=>{ if(page==='widgets'&&window.__sfMusicWidgetEditorOpen){ musicWidgetDraft=musicMerge(musicWidgetDraft||musicDefault(),cfg||{}); applyMusicPreviewAppearance(); }});
  socket.on('musicEditorPreviewState', st=>{ if(page==='widgets'&&window.__sfMusicWidgetEditorOpen && st?.simulated){
    const prev=musicPreviewState||{};
    const sameTrack=String(prev?.current?.sourceId||'')===String(st?.current?.sourceId||'') && String(prev?.current?.id||'')===String(st?.current?.id||'');
    const sameQueue=JSON.stringify((prev.queue||[]).map(x=>x.sourceId||x.id))===JSON.stringify((st.queue||[]).map(x=>x.sourceId||x.id));
    const samePrevious=String(prev?.previous?.sourceId||'')===String(st?.previous?.sourceId||'') && String(prev?.previous?.id||'')===String(st?.previous?.id||'');
    musicPreviewState=structuredClone(st); musicWidgetSimulating=Boolean(st.current); if(st.current)musicSimulationTrack=st.current;
    if(!sameTrack||!sameQueue||!samePrevious) musicPreviewDraw(musicPreviewState); else updateMusicPreviewDynamic();
  }});
  socket.on('musicNotice',notice=>{ if(notice?.message) toast('Música',notice.message,notice.type==='error'?'err':''); });
  socket.on('settings', s=>{
      const incoming=merge(defaultSettings,s||{});
      try { const saved=JSON.parse(localStorage.getItem('sf.customize.modes.v1')||'null'); if(saved){ incoming.personalization.eventStyle=saved.eventStyle||incoming.personalization.eventStyle; incoming.personalization.giftStyle=saved.giftStyle||incoming.personalization.giftStyle; incoming.personalization.eventSimulationMode=saved.eventSimulationMode||incoming.personalization.eventSimulationMode||'single'; incoming.personalization.giftSimulationMode=saved.giftSimulationMode||incoming.personalization.giftSimulationMode||'single'; } } catch {}
      settings=incoming;
      settings.announcements=Array.isArray(settings.announcements)?settings.announcements:[];
      applyAppearance();
      renderTop();
      if(page==='dashboard') updateDashboardFeeds();
      if(page==='widgets'&&window.__sfVoiceWidgetEditorOpen){voiceWidgetDraft=merge(voiceWidgetDraft||{},settings.voiceList||{});normalizeVoiceListPlacement(voiceWidgetDraft);syncVoiceWidgetPreview(voiceWidgetDraft,false);}
      if(page==='customize') renderCustomizePreviewOnly();
    });
    socket.on('announcementsSettings', list=>{settings.announcements=Array.isArray(list)?list:[];if(page==='widgets'&&window.__sfAnnouncementHubOpen&&!window.__sfAnnouncementEditorOpen)renderAnnouncementHub();});
    socket.on('voiceListSettings', v=>{
      settings.voiceList=merge(settings.voiceList,v||{});
      // Never rebuild Widgets -> Puntos from background voice-list updates.
      // Replacing the editor DOM while an input/range has focus causes visible
      // flicker, caret jumps and makes editing nearly impossible.
      if(page==='widgets'&&window.__sfPointsWidgetEditorOpen){ return; }
      if(page==='widgets'&&!window.__sfVoiceWidgetEditorOpen&&!window.__sfPointsWidgetEditorOpen&&!window.__sfAnnouncementHubOpen&&!window.__sfAnnouncementEditorOpen&&!window.__sfMusicWidgetEditorOpen){
        renderWidgets();
      }else if(page==='widgets'&&window.__sfVoiceWidgetEditorOpen){
        voiceWidgetDraft=merge(voiceWidgetDraft||settings.voiceList,v||{});
        voiceWidgetPreviewSignature='';
      }
    });
    socket.on('voiceLibrary', payload=>{
      applyVoiceLibrarySync(payload||{});
      if(page==='widgets'&&window.__sfVoiceWidgetEditorOpen){
        try { syncVoiceWidgetPreview(voiceWidgetDraft||settings.voiceList||{},true); } catch(e){ console.warn('voice library preview sync',e); }
        return;
      }
      if(page==='widgets'&&window.__sfPointsWidgetEditorOpen){ return; }
      if(page==='voices'||page==='customize'||page==='points'){ render(); }
      else if(page==='widgets'&&!window.__sfVoiceWidgetEditorOpen&&!window.__sfPointsWidgetEditorOpen&&!window.__sfAnnouncementHubOpen&&!window.__sfAnnouncementEditorOpen&&!window.__sfMusicWidgetEditorOpen){ renderWidgets(); }
    });
    socket.on('voiceListPresence', d=>{state.voiceListPresence={online:Boolean(d?.online),connections:Number(d?.connections||0)};if(page==='widgets'&&window.__sfVoiceWidgetEditorOpen){const frag=document.createRange();$('voiceWidgetStatus')?.replaceChildren(frag.createContextualFragment(voiceStatusMarkup()));$('voicePreviewStatus')?.replaceChildren(frag.createContextualFragment(voiceStatusMarkup()));}});
    socket.on('liveEnded', info=>{
      const p=String(info?.platform||'tiktok').toLowerCase();
      // Las insignias de actividad (like, unido y compartir) son exclusivas
      // de la sesión actual del LIVE. Al terminar, no deben pasar al siguiente.
      if(state.activity?.[p]) state.activity[p]={};
      if(state.activityBadges?.[p]) state.activityBadges[p]={};
      if(state.supporters?.[p]) state.supporters[p]={};
      state.chat=state.chat.filter(x=>String(x?.platform||'').toLowerCase()!==p);
      state.events=state.events.filter(x=>String(x?.platform||'').toLowerCase()!==p);
      state.gifts=state.gifts.filter(x=>String(x?.platform||'').toLowerCase()!==p);
      if(page==='dashboard') updateDashboardFeeds();
    });
    socket.on('accountState', d=>{
      if(!d?.platform)return;
      const platform=String(d.platform).toLowerCase();
      const previous=state.accounts[platform]||{};
      const next={...previous, ...d};
      const explicitFeedClear = d?.clearFeeds===true || d?.stateReason==='manual-disconnect';
      const justEndedLive = previous.live===true && next.live===false && d?.stateReason==='live-ended';
      // A connection handshake must NEVER clear Dashboard chat/events/gifts.
      // The feed is cleared only by an explicit disconnect or an actual live end.
      if(explicitFeedClear || justEndedLive){
        next.connectionId='';
        next.avatarUrl = next.avatarUrl || previous.avatarUrl || settings.connectionProfiles?.[platform]?.avatarUrl || '';
        next.username = next.username || previous.username || settings.connectionProfiles?.[platform]?.username || '';
        state.chat=state.chat.filter(x=>String(x?.platform||'').toLowerCase()!==platform);
        state.events=state.events.filter(x=>String(x?.platform||'').toLowerCase()!==platform);
        state.gifts=state.gifts.filter(x=>String(x?.platform||'').toLowerCase()!==platform);
        if(state.activity?.[platform]) state.activity[platform]={};
        if(state.supporters?.[platform]) state.supporters[platform]={};
        if(page==='dashboard') updateDashboardFeeds();
      }
      state.accounts[platform]=next;
      renderTop();updateDashboardConnectionStatus();
      if(page==='connections'||page==='overlays')render();
      if(page==='widgets'&&window.__sfVoiceWidgetEditorOpen){$('voicePreviewStatus')?.replaceChildren(document.createRange().createContextualFragment(voiceStatusMarkup()));}
    });
    socket.on('liveHistory', data=>{
      // Rehydrate without wiping items that arrived during the connection handshake.
      // This is important for the start-live/system card and for chat/events that
      // can arrive in the same moment the platform becomes available.
      const mergeUnique=(target, items, acceptFn)=>{
        (Array.isArray(items)?items:[]).forEach(raw=>{
          const item={...raw, connectionId:raw?.connectionId||''};
          const key=eventFingerprint(item, item?.source==='chat'?'chat':'activity');
          const exists=target.some(existing=>eventFingerprint(existing, item?.source==='chat'?'chat':'activity')===key);
          if(!exists) acceptFn(item);
        });
      };
      mergeUnique(state.chat, data?.chat, acceptChat);
      mergeUnique([...state.events,...state.gifts], data?.events, acceptEvent);
      state.historyLoaded=true;
      if(page==='dashboard') updateDashboardFeeds();
      if(page==='customize' && activeCustomizeTab==='chat') renderCustomizePreviewOnly();
    });
    startDashboardFeedCleanup();
    socket.on('chat',d=>acceptChat(d||{}));
    socket.on('event',d=>acceptEvent(d||{}));
    socket.on('roulette:sync',s=>{
      rouletteState=s||rouletteState;
      if(s?.config){
        const serverConfig=merge(defaultRoulettePreviewConfig(),s.config);
        const localConfig=getRoulettePreviewConfig();
        const localSavedAt=localRoulettePreviewSavedAt();
        const serverUpdatedAt=serverRouletteUpdatedAt(serverConfig);
        // The newest revision wins. This prevents an older socket snapshot from
        // visually reverting a freshly selected option after changing pages.
        if(localSavedAt && !rouletteConfigEqual(localConfig,serverConfig) && localSavedAt > serverUpdatedAt) {
          roulettePreviewConfig=localConfig;
          if(socket?.connected) { try{socket.emit('roulette:update',localConfig);}catch{} }
        } else {
          roulettePreviewConfig=serverConfig;
          try{ localStorage.setItem('sf.roulette.preview.v1',JSON.stringify(roulettePreviewConfig)); localStorage.setItem('sf.roulette.preview.v1.savedAt',String(serverUpdatedAt||Date.now())); }catch{}
        }
      }
      syncRoulettePreviewHistoryFromServer();
      if(page==='roulette'){
        const frame=$('roulettePreviewFrame');
        if(frame?.contentWindow){
          roulettePreviewPost({type:'config',config:getRoulettePreviewConfig()});
          roulettePreviewConfigControls();
        }else renderRoulette();
      }
    });
    socket.on('roulette:result',s=>{
      rouletteState=s||rouletteState;
      syncRoulettePreviewHistoryFromServer();
      toast('Ganador',s?.winner?.displayName||s?.winner?.username||'Listo');
      if(page==='roulette'){
        const frame=$('roulettePreviewFrame');
        if(frame?.contentWindow){
          roulettePreviewConfigControls();
        }else renderRoulette();
      }
    });
    socket.on('roulette:error',e=>toast('Ruleta',e.message||'No se pudo iniciar','err'));
    socket.on('system',d=>d?.message&&toast('Sistema',d.message));
  }

  function showRegistrationWelcome(displayName='Creador'){
    const existing=document.getElementById('registrationWelcome');
    if(existing) existing.remove();
    const notice=document.createElement('div');
    notice.id='registrationWelcome';
    notice.className='registration-welcome';
    notice.setAttribute('role','status');
    notice.innerHTML=`<div class="registration-welcome-copy"><span class="registration-welcome-icon">✓</span><strong>Bienvenido!</strong><span class="registration-welcome-name">${esc(displayName)}</span></div><button type="button" class="registration-welcome-close" aria-label="Cerrar notificación">×</button>`;
    document.body.appendChild(notice);
    const close=()=>{notice.classList.add('hide');setTimeout(()=>notice.remove(),250);};
    notice.querySelector('.registration-welcome-close')?.addEventListener('click',close);
    setTimeout(close,10000);
  }

  async function startApp(){
    if(!token()){showAuth();return;}
    try{ const me=await api('/api/me'); user=me.user; $('authScreen').classList.add('hidden');$('app').classList.remove('hidden');settings=merge(defaultSettings,await api('/api/user/settings')); rehydrateCustomizationFromStorage(); loadTikTokGiftCatalog().catch(()=>{}); saveCustomizationSnapshot(); try { const saved=JSON.parse(localStorage.getItem('sf.customize.modes.v1')||'null'); if(saved){ settings.personalization.eventStyle=saved.eventStyle||settings.personalization.eventStyle; settings.personalization.giftStyle=saved.giftStyle||settings.personalization.giftStyle; settings.personalization.eventSimulationMode=saved.eventSimulationMode||settings.personalization.eventSimulationMode||'single'; settings.personalization.giftSimulationMode=saved.giftSimulationMode||settings.personalization.giftSimulationMode||'single'; } } catch {} render();setupSocket(); }
    catch(e){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SESSION_KEY);showAuth();}
  }
  function showAuth(){ $('authScreen').classList.remove('hidden');$('app').classList.add('hidden');$('authTitle').textContent=authMode==='login'?'Bienvenido de vuelta':'Crear cuenta';$('authText').textContent=authMode==='login'?'Inicia sesión para abrir tu estudio.':'Crea tu cuenta para guardar voces y configuraciones.';$('authNameWrap').classList.toggle('hidden',authMode==='login');$('authSubmit').innerHTML=authMode==='login'?'Entrar al estudio <span>→</span>':'Crear cuenta <span>→</span>';$('authToggle').textContent=authMode==='login'?'¿No tienes cuenta? Crear cuenta':'¿Ya tienes cuenta? Iniciar sesión';}
  async function authSubmit(e){e.preventDefault();$('authError').textContent='';const registering=authMode==='register';try{const d=await api(registering?'/api/auth/register':'/api/auth/login',{method:'POST',body:JSON.stringify({email:$('authEmail').value,password:$('authPassword').value,displayName:$('authName').value})});localStorage.setItem(TOKEN_KEY,d.token);localStorage.setItem(SESSION_KEY,JSON.stringify(d.user));await startApp();if(registering)showRegistrationWelcome(d.user?.displayName||$('authName').value||'Creador');}catch(err){$('authError').textContent=err.message;}}
  async function logout(){try{await api('/api/auth/logout',{method:'POST'});}catch{}try{socket?.disconnect();}catch{}localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SESSION_KEY);user=null;state.chat=[];state.events=[];state.gifts=[];showAuth();}

  document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.page===page)return;if(btn.dataset.page!=='widgets'){window.__sfAnnouncementEditorOpen=false;window.__sfAnnouncementHubOpen=false;window.__sfPointsWidgetEditorOpen=false;window.__sfVoiceWidgetEditorOpen=false;stopAnnouncementPreview?.();}page=btn.dataset.page;render();}));
  $('collapse').onclick=()=>document.body.classList.toggle('sidebar-collapsed');
  $('logout').onclick=logout;
  $('authForm').addEventListener('submit',authSubmit);
  $('authToggle').onclick=()=>{authMode=authMode==='login'?'register':'login';showAuth();};
  window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(pageMeta[next]){page=next;render();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && (!socket||!socket.connected)) setupSocket();});
  window.addEventListener('pageshow',()=>{if(!socket||!socket.connected)setupSocket();});

  window.streamFusionStudio = { state, getSettings:()=>structuredClone(settings), openOverlay };
  showAuth(); startApp();
})();
