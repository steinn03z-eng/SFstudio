import * as database from './database.js';
import * as liveSession from './live-session.js';
import { findVoicePowerRuleFromComment } from './voice-rules.js';

const DEFAULT_POINTS = {
  enabled: true,
  tiktok: { follow:100, comment:2, like:1, share:1, giftPer10Coins:1, subscription:250 },
  twitch: { follow:100, comment:2, like:0, share:0, bitsPer10:1, subscription:250, giftSubscription:250 },
  limits: { maxAwardPerEvent:1000 },
  widget: {
    enabled: true,
    commandPrefix: '!',
    commandWords: ['point'],
    displaySeconds: 5,
    cooldownMinutes: 5,
    queueEnabled: true,
  },
  voicePower: {
    enabled:false,
    source:'gift',
    platform:'tiktok',
    targetKey:'',
    targetLabel:'',
    amount:1,
    pointCost:1000,
    activity:'follow',
    commandPrefix:'.',
    commandCaseSensitive:false,
    consumePoints:true,
    powerRules:[],
  },
};

const clampInt = (value, min=0, max=1000000) => Math.min(max, Math.max(min, Number.parseInt(value,10) || 0));
const norm = (value) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
function voiceCommentSignature(value){ return String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim().toLowerCase(); }

const TEMPORARY_LIVE_BADGES = new Set(['join','joined','like','liked','share','shared']);
const PERMANENT_BADGES = new Set(['follow','follower','followed','donor','supporter']);
function badgeKey(value){ return norm(value); }
function filterTemporaryBadges(badges){
  return (Array.isArray(badges) ? badges : []).filter((badge) => !TEMPORARY_LIVE_BADGES.has(badgeKey(badge)));
}
const platformOf = (p) => { const value=String(p||'tiktok').toLowerCase(); return value==='twitch'?'twitch':value==='both'?'both':'tiktok'; };
const platformMatches = (configured, actual) => configured==='both' || configured===actual;
function isHeartMeGift(payload){
  const values = [payload?.giftKey, payload?.giftId, payload?.giftName, payload?.giftAlt, typeof payload?.gift==='string' ? payload.gift : payload?.gift?.name, payload?.gift?.key, payload?.gift?.id];
  return values.some((value) => {
    const key = norm(value);
    return key === 'heartme' || key.includes('heartme') || key === 'quiereme' || key.includes('quiereme');
  });
}
function isSuperfanTrigger(payload){
  const values = [payload?.type, payload?.event, payload?.action, payload?.group, payload?.message, payload?.text];
  return values.some((value) => {
    const key = norm(value);
    return key.includes('superfan') || key.includes('superfans') || key.includes('superfanjoin');
  });
}


export function defaultPointsConfig(){ return structuredClone(DEFAULT_POINTS); }
export function normalizePointsConfig(input){
  const base = structuredClone(DEFAULT_POINTS);
  if (!input || typeof input !== 'object') return base;
  const out = {
    ...base,
    ...input,
    tiktok:{...base.tiktok,...(input.tiktok||{})},
    twitch:{...base.twitch,...(input.twitch||{})},
    limits:{...base.limits,...(input.limits||{})},
    widget:{...base.widget,...(input.widget||{})},
    voicePower:{...base.voicePower,...(input.voicePower||{})},
  };
  out.enabled = out.enabled !== false;
  out.voicePower.enabled = out.voicePower.enabled === true;
  out.voicePower.source = ['gift','points','activity','any'].includes(out.voicePower.source)?out.voicePower.source:'gift';
  out.voicePower.platform = platformOf(out.voicePower.platform);
  out.voicePower.commandPrefix = ['@','.','/','-'].includes(String(out.voicePower.commandPrefix||'')) ? String(out.voicePower.commandPrefix) : '.';
  out.voicePower.amount = clampInt(out.voicePower.amount,1,1000000);
  out.voicePower.bitsAmount = clampInt(out.voicePower.bitsAmount || out.voicePower.amount,1,100000000);
  out.voicePower.pointCost = clampInt(out.voicePower.pointCost,1,100000000);
  out.voicePower.activity = ['like','share','follow','moderator'].includes(out.voicePower.activity)?out.voicePower.activity:'follow';
  out.voicePower.powerRules = (Array.isArray(out.voicePower.powerRules) ? out.voicePower.powerRules : []).map((r)=>{
    const rule={...r};
    rule.id=String(rule.id||`vpr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
    rule.platform=platformOf(rule.platform);
    rule.source=['points','gift','activity','any'].includes(String(rule.source||''))?String(rule.source):'points';
    rule.voiceKey=String(rule.voiceKey||'').trim();
    rule.voiceLabel=String(rule.voiceLabel||'').trim();
    rule.commandPrefix=['@','.','/','-'].includes(String(rule.commandPrefix||''))?String(rule.commandPrefix):'.';
    rule.pointCost=clampInt(rule.pointCost,1,100000000);
    rule.amount=clampInt(rule.amount,1,100000000);
    rule.activity=['like','share','follow','moderator','subscription'].includes(String(rule.activity||''))?String(rule.activity):'follow';
    rule.giftKey=String(rule.giftKey||rule.targetKey||'').trim();
    rule.giftLabel=String(rule.giftLabel||rule.targetLabel||'').trim();
    rule.active=rule.active!==false;
    rule.createdAt=Number(rule.createdAt||Date.now());
    rule.updatedAt=Number(rule.updatedAt||Date.now());
    return rule;
  }).filter(r=>r.id);
  out.voicePower.commandCaseSensitive = out.voicePower.commandCaseSensitive === true;
  out.widget.commandPrefix = ['!','.', '@','/','-'].includes(String(out.widget.commandPrefix||'!')) ? String(out.widget.commandPrefix) : '!';
  out.widget.commandWords = Array.from(new Set((Array.isArray(out.widget.commandWords) ? out.widget.commandWords : String(out.widget.commandWords||'point').split(',')).map(v=>String(v||'').trim().replace(/^[@.!\/-]+/,'').toLowerCase()).filter(Boolean))).slice(0,12);
  if(!out.widget.commandWords.length) out.widget.commandWords=['point'];
  out.widget.displaySeconds = Math.min(30, Math.max(1, Number(out.widget.displaySeconds||5)));
  out.widget.cooldownMinutes = Math.min(1440, Math.max(0, Number(out.widget.cooldownMinutes||5)));
  out.widget.enabled = out.widget.enabled !== false;
  out.widget.queueEnabled = out.widget.queueEnabled !== false;
  return out;
}

function userSettings(ownerId){ return database.getUserSettings(ownerId) || {}; }
function moderatorIdentity(value){
  if (value && typeof value === 'object') return value.uniqueId || value.username || value.user || value.identityKey || '';
  return value;
}

function isConfiguredModerator(ownerId, platform, identity, settings){
  const key = norm(identity);
  if (!key) return false;
  const configured = Array.isArray(settings?.[platform==='twitch'?'twitchModerators':'tiktokModerators']) ? settings[platform==='twitch'?'twitchModerators':'tiktokModerators'] : [];
  return configured.some(v => norm(moderatorIdentity(v)) === key);
}

function classify(ownerId, payload, settings){
  const platform = platformOf(payload?.platform);
  const type = norm(payload?.type || payload?.event || payload?.action || '');
  const group = norm(payload?.group || '');
  if (type.includes('follow') || group.includes('follow')) return {kind:'follow',units:1};
  if (type.includes('like') || group.includes('like')) return {kind:'like',units:clampInt(payload?.likes ?? payload?.amount ?? 1,1,100000)};
  if (type.includes('share') || group.includes('share')) return {kind:'share',units:1};
  if (type.includes('sub') || type.includes('subscription') || type.includes('resub') || group.includes('subscription') || norm(payload?.twitchGiftType||'').includes('subscription')) return {kind:'subscription',units:clampInt(payload?.amount ?? payload?.months ?? 1,1,100)};
  if (type.includes('cheer') || type.includes('bits') || platform==='twitch' && Number(payload?.bits)>0) return {kind:'bits',units:clampInt(payload?.bits ?? payload?.amount ?? 1,1,100000000)};
  if (type.includes('gift') || group.includes('gift') || payload?.gift || payload?.giftName) {
    const coins = clampInt(payload?.giftCoins ?? payload?.coins ?? 0,0,100000000);
    return {kind:'gift',units:Math.max(1, clampInt(payload?.amount ?? 1,1,100000)) , coins};
  }
  if (payload?.source==='chat' || type==='chat' || type.includes('comment') || type.includes('message')) return {kind:'comment',units:1};
  const identity = payload?.uniqueId || payload?.username || payload?.user || payload?.displayName;
  if (isConfiguredModerator(ownerId, platform, identity, settings)) return {kind:'moderator',units:1};
  return {kind:'other',units:0};
}

function awardAmount(platform, classified, cfg){
  const c = cfg[platform] || {};
  switch (classified.kind) {
    case 'follow': return clampInt(c.follow);
    case 'comment': return clampInt(c.comment);
    case 'like': return clampInt(c.like) * classified.units;
    case 'share': return clampInt(c.share) * classified.units;
    case 'subscription': return clampInt(c.subscription) * classified.units;
    case 'bits': return clampInt(c.bitsPer10) * Math.floor(classified.units / 10);
    case 'gift': return clampInt(c.giftPer10Coins) * Math.max(1, Math.floor((classified.coins || 0) / 10));
    default: return 0;
  }
}

function findGiftMatch(payload, targetKey=''){
  const candidates = [payload?.giftId,payload?.giftKey,payload?.gift,payload?.giftName,payload?.giftAlt,payload?.twitchGiftType].map(norm).filter(Boolean);
  const target = norm(targetKey);
  return Boolean(target && candidates.includes(target));
}

function voiceBotRules(settings){
  return Array.isArray(settings?.voiceBot?.rules) ? settings.voiceBot.rules.filter(r=>r && r.active!==false) : [];
}
function ruleVoiceAssignment(rule, payload, source){
  if(!rule) return null;
  return {
    voiceKey:String(rule.voiceKey||'verity'),
    voiceLabel:String(rule.targetLabel||rule.targetKey||'Regla'),
    ruleId:String(rule.id||''),
    ruleLabel:String(rule.targetLabel||rule.targetKey||'Regla'),
    targetImage:String(rule.targetImage||payload?.giftImage||''),
    mode:rule.mode==='once'?'once':'unlock',
    kind:String(rule.kind||source||'event'),
    source:String(source||rule.kind||'event'),
    triggeredAt:Date.now(),
  };
}
function findVoiceRuleForEvent(settings, payload, kind){
  const rules=voiceBotRules(settings);
  const platform=platformOf(payload?.platform);
  const candidates=kind==='gift'
    ? [payload?.giftId,payload?.giftKey,payload?.giftName,payload?.giftAlt,payload?.gift?.name,payload?.gift]
    : [kind];
  const candidateKeys=candidates.map(norm).filter(Boolean);
  const eventKey=norm(kind);
  const matches=rules.filter((r)=>{
    if(platformOf(r.platform)!==platform) return false;
    const rk=String(r.kind||'gift');
    if(rk==='gift' && kind==='gift'){
      const target=norm(r.targetKey||r.targetLabel);
      return Boolean(target && candidateKeys.some(k=>k===target || k.includes(target) || target.includes(k)));
    }
    if(rk==='event' && ['follow','like','share','join'].includes(kind)){
      const target=norm(r.targetKey||r.targetLabel);
      return Boolean(target && (eventKey===target || eventKey.includes(target) || target.includes(eventKey)));
    }
    return false;
  });
  return matches.length ? matches[matches.length-1] : null;
}
function fixedVoiceForUser(settings, platform, username){
  const list=Array.isArray(settings?.voiceFixedUsers)?settings.voiceFixedUsers:[];
  const u=norm(username);
  return list.find((entry)=>platformOf(entry?.platform)===platform && norm(entry?.username||entry?.uniqueId)===u) || null;
}
function buildCurrentVoiceAssignment(ownerId, settings, payload, profile, username, platform, activePower, liveAssignment){
  const giftVoice=profile?.giftVoice || null;
  // 1) Regalos tienen prioridad absoluta sobre eventos/insignias.
  if(giftVoice) return giftVoice;

  // 2) Usuario fijado y Poder de Voz son autorizaciones directas.
  const fixed=fixedVoiceForUser(settings,platform,username);
  if(fixed?.voiceKey) return {voiceKey:String(fixed.voiceKey),voiceLabel:String(fixed.voiceLabel||fixed.voiceKey),source:'user',kind:'role',mode:'unlock',ruleId:''};
  if(activePower?.voiceKey) return {voiceKey:String(activePower.voiceKey),voiceLabel:String(activePower.voiceLabel||activePower.voiceKey),source:'power',kind:'power',mode:'unlock',ruleId:String(activePower.ruleId||'')};

  // 3) Una asignación del LIVE representa la regla del evento más reciente
  //    que sí tenía una voz. Si existe, se conserva hasta que otra actividad
  //    válida la sustituya o una insignia de mayor prioridad entre en juego.
  if(liveAssignment) return liveAssignment;

  // 4) Follow es permanente. Su voz solo entra como fallback cuando no hay
  //    un evento temporal del LIVE con una voz asignada.
  if(profile?.followVoice) return profile.followVoice;
  return null;
}

function findFallbackVoiceRuleForActiveBadge(settings, username, platform, liveBadges){
  const kinds=[
    {kind:'like',active:Boolean(liveBadges?.liked),at:Number(liveBadges?.likedAt||0)},
    {kind:'share',active:Boolean(liveBadges?.shared),at:Number(liveBadges?.sharedAt||0)},
    {kind:'join',active:Boolean(liveBadges?.joined),at:Number(liveBadges?.joinedAt||0)},
    {kind:'follow',active:Boolean(liveBadges?.followed),at:Number(liveBadges?.followedAt||0)},
  ].filter(x=>x.active).sort((a,b)=>b.at-a.at);
  for(const candidate of kinds){
    const fakePayload={platform,uniqueId:username,username};
    const rule=findVoiceRuleForEvent(settings,fakePayload,candidate.kind);
    if(rule) return {kind:candidate.kind,rule};
  }
  return null;
}


function voicePowerState(settings){
  const fallback = settings?.points?.voicePower && typeof settings.points.voicePower==='object' ? settings.points.voicePower : {};
  const botPart = settings?.voiceBot?.power && typeof settings.voiceBot.power==='object' ? settings.voiceBot.power : {};
  const power = { ...DEFAULT_POINTS.voicePower, ...fallback, ...botPart };
  return { ...power, enabled:power.enabled===true, commandPrefix:String(power.commandPrefix||'.').slice(0,4) };
}

export function userHasVoicePower(ownerId, platform, identity){
  return liveSession.hasPower(ownerId, platform, identity);
}

function upsertPowerUser(ownerId, settings, payload, trigger, pointsAfter=0, rule=null, resolvedVoice=null){
  const platform=platformOf(payload?.platform);
  const username=String(payload?.uniqueId || payload?.username || payload?.user || payload?.displayName || '').trim();
  if(!username) return {changed:false,entry:null};
  const displayName=String(payload?.displayName || payload?.user || payload?.username || username).trim();
  const nextEntry={ username, displayName, badge:'🔥', grantedAt:Date.now(), source:trigger, points:pointsAfter,
    ruleId:String(rule?.id||''), voiceKey:String(resolvedVoice?.voiceKey||'').trim(), voiceLabel:String(resolvedVoice?.voiceLabel||'').trim(), commandPrefix:String(rule?.commandPrefix||'.'),
    ruleSource:String(rule?.source||trigger||''), active:true };
  const current=liveSession.getPowerUsers(ownerId,platform).find((u)=>String(u?.username||'').toLowerCase()===username.toLowerCase());
  const changed=!current || String(current.voiceKey||'')!==String(nextEntry.voiceKey||'') || String(current.ruleId||'')!==String(nextEntry.ruleId||'');
  const entry=liveSession.grantPower(ownerId,platform,username,nextEntry);
  return {changed,entry};
}

function normVoicePrefix(value){ return String(value||'').trim().slice(0,4); }
function findVoiceCommandInMessage(after, ownerId=''){
  const words=String(after||'').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return null;
  let best=null;
  // La voz se toma del primer bloque del mensaje. El resto es el texto que
  // debe leer el bot. Elegimos la coincidencia más larga para soportar voces
  // con nombres compuestos (por ejemplo "Gojo Satoru hola").
  for(let count=1; count<=words.length; count+=1){
    const candidate=words.slice(0,count).join(' ');
    const voiceRule=findVoicePowerRuleFromComment(candidate,ownerId);
    if(!voiceRule) continue;
    const exact=Array.isArray(voiceRule.aliases) && voiceRule.aliases.some(alias => norm(alias)===norm(candidate));
    if(exact || candidate.length>=(best?.candidate?.length||0)) best={voiceRule,candidate,count,exact};
  }
  return best;
}

function parseVoicePowerCommand(text, rules=[], ownerId=''){
  const raw=String(text||'').trim(); if(!raw) return null;
  const candidates=rules.filter(r=>r?.active!==false);
  for(const rule of candidates){
    const prefix=normVoicePrefix(rule.commandPrefix||'.');
    if(!prefix || !raw.startsWith(prefix)) continue;
    const after=raw.slice(prefix.length).trim();
    if(/^borrar$/iu.test(after)) return {clear:true,rule};
    if(!after) continue;

    const match=findVoiceCommandInMessage(after,ownerId);
    if(!match?.voiceRule) continue;
    const remaining=after.split(/\s+/).slice(match.count).join(' ').trim();

    return {
      rule,
      clear:false,
      voiceKey:String(match.voiceRule.voiceKey||''),
      voiceLabel:String(match.voiceRule.voiceLabel||''),
      text:remaining,
      prefix,
    };
  }
  return null;
}


const pointsWidgetCooldowns = new Map();
function pointsWidgetKey(ownerId, platform, username, liveId=''){ return `${ownerId}:${platform}:${String(liveId||'live').trim()}:${String(username||'').trim().toLowerCase()}`; }
function parsePointsWidgetCommand(text, widget){
  if(String(widget?.enabled) === 'false') return null;
  const prefix=String(widget?.commandPrefix||'!');
  const raw=String(text||'').trim();
  if(!raw || !raw.startsWith(prefix)) return null;
  const command=raw.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
  if(!command) return null;
  const allowed=Array.isArray(widget?.commandWords)?widget.commandWords:[];
  return allowed.some(v=>String(v).trim().toLowerCase()===command) && raw.slice(prefix.length).trim().split(/\s+/).length===1 ? command : null;
}
function buildPointsWidgetTrigger(ownerId, payload, cfg, account){
  const widget=cfg?.widget||{};
  if(widget.enabled===false || payload?.source!=='chat') return null;
  const command=parsePointsWidgetCommand(payload?.comment || payload?.message || payload?.text || '', widget);
  if(!command) return null;
  const username=String(payload?.uniqueId || payload?.username || payload?.user || payload?.displayName || '').trim();
  if(!username) return null;
  const platform=platformOf(payload?.platform);
  const liveId=liveSession.getLiveId(ownerId,platform) || '';
  const key=pointsWidgetKey(ownerId,platform,username,liveId);
  const now=Date.now();
  const cooldownMs=Math.max(0, Number(widget.cooldownMinutes||0))*60*1000;
  const last=Number(pointsWidgetCooldowns.get(key)||0);
  if(cooldownMs>0 && now-last<cooldownMs) return null;
  pointsWidgetCooldowns.set(key, now);
  return {
    ownerId:String(ownerId), platform, username, displayName:String(payload?.displayName || payload?.user || payload?.username || username).trim(),
    avatarUrl:String(payload?.avatar || payload?.avatarUrl || payload?.profileImageUrl || '').trim(),
    points:Number(account?.points ?? database.getPoints(ownerId,platform,username)?.points ?? 0),
    command:`${String(widget.commandPrefix||'!')}${command}`,
    displaySeconds:Number(widget.displaySeconds||5), timestamp:now, cooldownMinutes:Number(widget.cooldownMinutes||0)
  };
}

export function processLivePayload(ownerId, payload){
  if (!ownerId || !payload || typeof payload!=='object') return payload;
  const current=userSettings(ownerId);
  const pointsCfg=normalizePointsConfig(current.points||{});
  const effectivePower=voicePowerState(current);
  const platform=platformOf(payload.platform);
  const classified=classify(ownerId,payload,current);
  const username=String(payload?.uniqueId || payload?.username || payload?.user || payload?.displayName || '').trim();
  const displayName=String(payload?.displayName || payload?.user || payload?.username || username).trim();
  if(username) liveSession.recordViewerActivity(ownerId, platform, username);
  if(username && (classified.kind==='comment' || classified.kind==='chat')){
    const signature=voiceCommentSignature(payload?.message || payload?.comment || payload?.text || '');
    payload.voiceAntispamAllowed=liveSession.allowCommentForVoice(ownerId,platform,username,signature,2);
  }
  const profile=username ? database.touchViewerProfile(ownerId,platform,username,displayName,payload?.avatarUrl || payload?.avatar || payload?.profileImageUrl || '') : null;

  // Follow is permanent per registered account + viewer. Only the FIRST follow
  // is a new activity. Repeated follow events must never refresh its timestamp,
  // reorder event priority, or change an already-resolved voice.
  const followFirstTime = Boolean(classified.kind==='follow' && username && profile && !profile.followedBefore);
  if(followFirstTime){
    database.markViewerFollow(ownerId,platform,username,displayName);
  }

  const liveBadgeType = classified.kind === 'follow' ? 'follow' : classified.kind === 'share' ? 'share' : classified.kind === 'like' ? 'like' : classified.kind === 'gift' ? 'gift' : null;
  if(username && liveBadgeType && (classified.kind!=='follow' || followFirstTime)) liveSession.addBadge(ownerId, platform, username, liveBadgeType);
  if(username && ['follow','like','share','join'].includes(classified.kind) && (classified.kind!=='follow' || followFirstTime)) liveSession.recordLastActivity(ownerId, platform, username, classified.kind);
  if(username && (classified.kind === 'comment' || classified.kind === 'chat')) { /* keep current LIVE badges attached to normal chat */ }
  const liveId=liveSession.getLiveId(ownerId,platform) || String(payload?.liveId||'');

  // Persistent identity rules: follow reward is granted once ever; donor status is permanent.
  const isDonation = ['gift','bits','subscription'].includes(classified.kind);
  if(isDonation && username){
    database.markViewerDonated(ownerId,platform,username,displayName,1);
    liveSession.addBadge(ownerId, platform, username, 'donor');
    const giftImage=String(payload?.giftImage || payload?.gift?.image || payload?.gift?.url || payload?.gift?.imageUrl || '').trim();
    const giftName=String(payload?.giftName || (typeof payload?.gift === 'string' ? payload.gift : payload?.gift?.name) || payload?.giftAlt || 'Regalo').trim();
    const giftBadge={ image:giftImage, name:giftName || 'Regalo', key:String(payload?.giftId || payload?.giftKey || payload?.giftName || payload?.giftAlt || '').trim(), id:String(payload?.giftId || '').trim(), updatedAt:Date.now() };
    database.setViewerLastGift(ownerId,platform,username,giftBadge,displayName);
    if(giftImage || giftName){
      liveSession.addBadge(ownerId, platform, username, 'gift-image', giftBadge);
    }
  }

  // VIP RGB is permanent: Heart Me / Quiéreme or Super Fan.
  if(username && ((classified.kind === 'gift' && isHeartMeGift(payload)) || isSuperfanTrigger(payload))){
    database.markViewerVipRgb(ownerId,platform,username,displayName,(classified.kind === 'gift' && isHeartMeGift(payload)) ? 'heartme' : 'superfan');
  }

  // Personalización de voz ligada a actividad: regalos tienen prioridad sobre eventos.
  if(username){
    if(classified.kind==='gift'){
      const giftRule=findVoiceRuleForEvent(current,payload,'gift');
      if(giftRule){
        const assignment=ruleVoiceAssignment(giftRule,payload,'gift');
        if(assignment.mode==='unlock') database.setViewerPersistentVoice(ownerId,platform,username,'gift',assignment,displayName);
        else liveSession.setVoiceAssignment(ownerId,platform,username,assignment);
      }
      // Si el nuevo regalo no tiene regla de voz, NO borramos la voz del último regalo.
    } else if(['follow','like','share','join'].includes(classified.kind) && (classified.kind!=='follow' || followFirstTime)) {
      const liveBadgesNow=liveSession.getBadges(ownerId,platform,username);
      const eventRule=findVoiceRuleForEvent(current,payload,classified.kind);
      if(eventRule){
        const assignment=ruleVoiceAssignment(eventRule,payload,'event');
        if(classified.kind==='follow' && assignment.mode==='unlock'){
          database.setViewerPersistentVoice(ownerId,platform,username,'follow',assignment,displayName);
          // Follow is permanent. A new Follow rule with a voice must supersede
          // any older LIVE-temporary event assignment (e.g. a previous Like).
          liveSession.clearVoiceAssignment(ownerId,platform,username);
        } else {
          liveSession.setVoiceAssignment(ownerId,platform,username,assignment);
        }
      } else {
        // No hay regla específica para la actividad más reciente. Busca una
        // regla entre las insignias actualmente válidas del usuario. Follow
        // es permanente; Like/Share/Join viven solo en este LIVE.
        const fallback=findFallbackVoiceRuleForActiveBadge(current,username,platform,liveBadgesNow);
        if(fallback?.rule){
          const assignment=ruleVoiceAssignment(fallback.rule,payload,'event');
          if(fallback.kind==='follow' && assignment.mode==='unlock'){
            database.setViewerPersistentVoice(ownerId,platform,username,'follow',assignment,displayName);
            // Follow fallback is permanent and must replace any older temporary
            // event assignment when the current activity has no specific rule.
            liveSession.clearVoiceAssignment(ownerId,platform,username);
          } else {
            liveSession.setVoiceAssignment(ownerId,platform,username,assignment);
          }
        } else {
          // No arrastrar una regla temporal anterior cuando la actividad actual
          // no tiene ninguna regla válida. FollowVoice quedará como fallback.
          liveSession.clearVoiceAssignment(ownerId,platform,username);
        }
      }
    }
  }

  const nextProfile=username ? database.getViewerProfile(ownerId,platform,username,displayName) : null;
  if(username && nextProfile){
    payload.persistentFollowed = Boolean(nextProfile.followedBefore);
    payload.persistentDonor = Boolean(nextProfile.everDonated);
    payload.persistentVipRgb = Boolean(nextProfile.vipRgb);
    payload.persistentVipRgbReason = String(nextProfile.vipRgbReason || '');
    // Último regalo persistente: debe viajar con cada comentario/evento del usuario
    // para que Dashboard Chat pueda pintar siempre su insignia aunque no haya
    // enviado el regalo en el LIVE actual.
    payload.persistentGiftBadge = nextProfile.giftBadge || null;
  }

  let account=null;
  let added=0;
  if(pointsCfg.enabled){
    const rawAward=awardAmount(platform,classified,pointsCfg);
    // Follow points are one-time historically, everything else follows the configured live rules.
    added=Math.min(followFirstTime || classified.kind!=='follow' ? rawAward : 0, pointsCfg.limits.maxAwardPerEvent || 1000);
    if(username && added>0) account=database.addPoints(ownerId,platform,username,displayName,added,classified.kind);
  }

  const pointsWidgetTrigger = buildPointsWidgetTrigger(ownerId, payload, pointsCfg, account);

  // Los comandos del widget Puntos tienen prioridad absoluta sobre Poder de Voz.
  // Ejemplo: si el widget Puntos usa ".p", el mensaje ".p" SOLO consulta
  // puntos y jamás debe intentar resolver ".p" como nombre/tag de una voz.
  const pointsCommandOwnsMessage = Boolean(pointsWidgetTrigger);

  let unlocked=false;
  let voicePowerCommand=null;
  const legacyRules = effectivePower.enabled && (!Array.isArray(effectivePower.powerRules) || !effectivePower.powerRules.length) ? [{
    id:'legacy-power', source:effectivePower.source, platform:effectivePower.platform, commandPrefix: effectivePower.commandPrefix || '.', pointCost: effectivePower.pointCost || 1, amount:effectivePower.amount||1, activity:effectivePower.activity||'follow', giftKey:effectivePower.targetKey||effectivePower.giftKey||'', giftLabel:effectivePower.targetLabel||effectivePower.giftLabel||''
  }] : [];
  const powerRules=effectivePower.enabled ? [...(Array.isArray(effectivePower.powerRules)?effectivePower.powerRules:[]), ...legacyRules] : [];
  if(username && powerRules.length && !pointsCommandOwnsMessage){
    const commentText=String(payload?.comment || payload?.message || payload?.text || '');
    const command=parseVoicePowerCommand(commentText,powerRules,ownerId);
    if(command?.clear){
      liveSession.revokePower(ownerId,platform,username);
      voicePowerCommand={clear:true, text:'', ruleId:String(command.rule?.id||'')};
    } else if(command?.rule){
      const rule=command.rule;
      const platformOk=platformMatches(platformOf(rule.platform),platform);
      if(platformOk && (rule.source==='points' || rule.source==='any' || rule.source==='gift' || rule.source==='activity')){
        const pointCost=Math.max(1,Number(rule.pointCost||1));
        const balance=Number(database.getPoints(ownerId,platform,username)?.points ?? account?.points ?? 0);
        let sourceEligible=true;
        if(rule.source==='points') sourceEligible=pointsCfg.enabled && balance>=pointCost;
        if(rule.source==='gift'){
          const liveBadges=liveSession.getBadges(ownerId,platform,username);
          const target=norm(rule.giftKey||'');
          sourceEligible=Boolean(liveBadges?.giftBadge && (!target || [liveBadges.giftBadge.key,liveBadges.giftBadge.id,liveBadges.giftBadge.name].some(v=>norm(v)===target)));
        } else if(rule.source==='activity'){
          const countType=String(rule.activity||'follow');
          if(countType==='follow') sourceEligible=Boolean(liveSession.getBadges(ownerId,platform,username)?.followed);
          else if(countType==='moderator') sourceEligible=isConfiguredModerator(ownerId,platform,username,current);
          else if(countType==='like' || countType==='share') sourceEligible=liveSession.getActivityCount(ownerId,platform,username,countType)>=Number(rule.amount||1);
          else if(countType==='subscription') sourceEligible=classified.kind==='subscription';
        }
        if(rule.source==='any') sourceEligible=true;
        const canUse=sourceEligible;
        if(canUse){
          if(rule.source==='points' && pointCost>0) database.spendPoints(ownerId,platform,username,pointCost);
          const pointsAfter=Number(database.getPoints(ownerId,platform,username)?.points ?? 0);
          const result=upsertPowerUser(ownerId,current,payload,rule.source,pointsAfter,rule,{voiceKey:command.voiceKey,voiceLabel:command.voiceLabel});
          unlocked=result.changed;
          voicePowerCommand={used:true, ruleId:String(rule.id), voiceKey:String(command.voiceKey||''), voiceLabel:String(command.voiceLabel||''), text:String(command.text||''), cost:rule.source==='points'?pointCost:0, balance:pointsAfter};
        } else {
          voicePowerCommand={denied:true, ruleId:String(rule.id), voiceKey:String(command.voiceKey||''), voiceLabel:String(command.voiceLabel||''), text:'', cost:rule.source==='points'?pointCost:0, balance};
        }
      }
    }
    // Gift/activity rules are eligibility sources; the viewer chooses the voice with prefix+voice in chat.

  }


  const out={...payload};
  if(voicePowerCommand) out.voicePowerCommand=voicePowerCommand;
  const rawType=norm(payload?.type || payload?.event || payload?.action || '');
  const activePower=username ? liveSession.getPowerUsers(ownerId,platform).find((u)=>String(u?.username||'').toLowerCase()===username.toLowerCase()) : null;
  const liveAssignment=username ? liveSession.getVoiceAssignment(ownerId,platform,username) : null;
  if(activePower){ out.voicePower=true; out.voicePowerAssignment={voiceKey:String(activePower.voiceKey||'verity'),voiceLabel:String(activePower.voiceLabel||''),ruleId:String(activePower.ruleId||''),source:String(activePower.ruleSource||activePower.source||''),commandPrefix:String(activePower.commandPrefix||'.')}; }
  if(username){
    const voiceAssignment=buildCurrentVoiceAssignment(ownerId,current,payload,nextProfile,username,platform,activePower,liveAssignment);
    if(voiceAssignment){
      out.voiceAssignment=voiceAssignment;
      out.voiceKey=String(voiceAssignment.voiceKey||'');
      out.voiceSource=String(voiceAssignment.source||'');
    }
  }
  if(username && (rawType.includes('join') || rawType.includes('member'))) liveSession.addBadge(ownerId, platform, username, 'join');
  const liveBadges=username ? liveSession.getBadges(ownerId, platform, username) : null;
  // Solo estas insignias pueden cruzar entre eventos/datos del cliente.
  // Like, Se unió y Compartir son exclusivamente del LIVE activo y se reconstruyen
  // desde liveSession; nunca se aceptan directamente desde payload.badges.
  const outBadges=filterTemporaryBadges(payload.badges);
  if(voicePowerCommand?.clear===true){ for(let i=outBadges.length-1;i>=0;i--){ const b=outBadges[i]; if(norm(b)==='voicepower'||norm(b)==='voice-power'||String(b)==='🔥') outBadges.splice(i,1); } }
  if(username && isConfiguredModerator(ownerId,platform,username,current) && !outBadges.some(b=>norm(b)==='moderator'||norm(b)==='mod')) outBadges.push('moderator');
  // Permanentes: seguir y donador se reconstruyen desde viewer_profiles.
  if(nextProfile?.followedBefore && !outBadges.some(b=>['👤','follow','follower','followed'].includes(badgeKey(b)))) outBadges.push('follow');
  if(nextProfile?.everDonated && !outBadges.some(b=>['🎁','donor','supporter'].includes(badgeKey(b)))) outBadges.push('donor');

  // Temporales: solo existen mientras esta sesión LIVE esté activa.
  if(liveBadges?.joined && !outBadges.some(b=>['join','joined'].includes(badgeKey(b)))) outBadges.push('join');
  if(liveBadges?.liked && !outBadges.some(b=>['like','liked'].includes(badgeKey(b)))) outBadges.push('like');
  if(liveBadges?.shared && !outBadges.some(b=>['share','shared'].includes(badgeKey(b)))) outBadges.push('share');
  if(username && userHasVoicePower(ownerId,platform,username) && voicePowerCommand?.clear!==true){
    if(!outBadges.some(b=>norm(b)==='voicepower'||norm(b)==='voice-power'||String(b)==='🔥')) outBadges.push('voice-power');
    out.voicePower=true;
  }
  out.badges=outBadges;
  if(liveId) out.liveId=liveId;
  if(nextProfile){ out.viewer={ followedBefore:nextProfile.followedBefore, everDonated:nextProfile.everDonated, donorBadge:nextProfile.everDonated, liveId, liveBadges: { ...(liveBadges || {joined:false,followed:false,liked:false,shared:false,donor:false,giftBadge:null}), giftBadge: liveBadges?.giftBadge || nextProfile.giftBadge || null }, giftBadge: liveBadges?.giftBadge || nextProfile.giftBadge || null }; }
  if(account) out.pointsAwarded=added;
  if(username) out.pointsBalance=database.getPoints(ownerId,platform,username)?.points ?? account?.points ?? 0;
  if(pointsWidgetTrigger) out.pointsWidgetTrigger=pointsWidgetTrigger;
  out.followRewarded=followFirstTime;
  if(unlocked) out.voicePowerUnlocked=true;
  return out;
}

export function getConfigForUser(ownerId){
  const settings = userSettings(ownerId);
  const merged = normalizePointsConfig(settings.points||{});
  if (!settings.points?.voicePower && settings.voiceBot?.power) merged.voicePower = {...merged.voicePower, ...settings.voiceBot.power};
  return merged;
}
export function setConfigForUser(ownerId, cfg){
  const settings=userSettings(ownerId);
  const normalized=normalizePointsConfig(cfg);
  settings.points=normalized;
  settings.voiceBot={...(settings.voiceBot||{}), power: structuredClone(normalized.voicePower)};
  // Active voice-power grants belong to the current LIVE only; never persist them in user settings.
  if (settings.voiceBot?.powerUsers) delete settings.voiceBot.powerUsers;
  database.saveUserSettings(ownerId,settings);
  return normalized;
}
