import "dotenv/config";

import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import fs from "node:fs";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { randomBytes, randomUUID } from "node:crypto";

import * as database from "./services/database.js";
import * as liveSession from "./services/live-session.js";
import * as points from "./services/points.js";
import * as tiktok from "./services/tiktok.js";
import * as twitch from "./services/twitch.js";
import * as roulette from "./services/roulette.js";
import { snapshot as liveHistorySnapshot, clear as clearLiveHistory } from "./services/live-history.js";
import { setCustomVoiceRules, VOICE_RULE_MATCHERS } from "./services/voice-rules.js";
import { PROFANITY_EXTRA } from "./services/profanity-catalog.js";
import { shouldDropRepeatedComment } from "./services/antiSpam.js";
import * as music from "./services/music.js";

globalThis.__STREAMFUSION_ROULETTE_HOOK__ = roulette;

globalThis.__STREAMFUSION_POINTS_HOOK__ = (ownerId, payload) => points.processLivePayload(ownerId, payload);
globalThis.__STREAMFUSION_MUSIC_HOOK__ = (ownerId, payload) => music.processChat(ownerId, payload, io);

globalThis.__STREAMFUSION_LIVE_END_HOOK__ = (ownerId, platform) => { const id=String(ownerId||"").trim(); const p=String(platform||"tiktok").toLowerCase()==="twitch"?"twitch":"tiktok"; if(id){ liveSession.end(id,p); clearLiveHistory(id); io.to(`user:${id}`).emit("liveEnded", {platform:p}); } };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY || "";
const FISH_AUDIO_MODEL = process.env.FISH_AUDIO_MODEL || "s2.1-pro-free";
const FISH_AUDIO_VOICE_CHANGER_WS = process.env.FISH_AUDIO_VOICE_CHANGER_WS || "";

const accountStateDefaults = {
    tiktok: { username: "", connected: false, live: false, mode: "saved", clearFeeds: false, stateReason: "initial" },
    twitch: { username: "", connected: false, live: false, mode: "saved", clearFeeds: false, stateReason: "initial" },
};
const accountStateByUser = new Map();
function getUserAccountState(userId, platform) {
    const id = String(userId || "").trim();
    const key = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const current = accountStateByUser.get(id) || {};
    return { ...(accountStateDefaults[key] || {}), ...(current[key] || {}) };
}

const voiceListPresence = new Map();
function voiceListPresencePayload(userId) { const connections = Number(voiceListPresence.get(String(userId)) || 0); return { online: connections > 0, connections }; }
function emitVoiceListPresence(userId) { if (userId) io.to(`user:${userId}`).emit("voiceListPresence", voiceListPresencePayload(userId)); }
function addVoiceListPresence(userId) { const key=String(userId||""); if(!key)return; voiceListPresence.set(key,Number(voiceListPresence.get(key)||0)+1); emitVoiceListPresence(key); }
function removeVoiceListPresence(userId) { const key=String(userId||""); if(!key)return; const next=Math.max(0,Number(voiceListPresence.get(key)||0)-1); if(next)voiceListPresence.set(key,next); else voiceListPresence.delete(key); emitVoiceListPresence(key); }

function emitAccountState(platform, overrides = {}, ownerId = "") {
    const key = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const id = String(ownerId || "").trim();
    if (id) {
        const current = accountStateByUser.get(id) || {};
        const next = { ...(accountStateDefaults[key] || {}), ...(current[key] || {}), ...overrides, platform: key };
        accountStateByUser.set(id, { ...current, [key]: next });
        io.to(`user:${id}`).emit("accountState", { ...next, platform: key });
        return { ...next, platform: key };
    }
    const payload = { ...(accountStateDefaults[key] || {}), ...overrides, platform: key };
    return payload;
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
    },
    // Railway/OBS/proxies can occasionally drop an otherwise healthy socket.
    // Give Socket.IO more room to survive transient network pauses while
    // retaining its normal heartbeat and reconnection behaviour on clients.
    pingInterval: 25000,
    pingTimeout: 60000,
    connectTimeout: 15000,
});

roulette.setBroadcaster((event, payload, ownerId = "") => {
    const id = String(ownerId || "").trim();
    if (id) io.to(`user:${id}`).emit(event, payload);
});

roulette.setVoiceAssignmentSync((payload) => {
    if (!payload || payload.action !== "upsert" || !payload.assignment) return;
    upsertVoiceFixedUser(payload.assignment, String(payload.ownerId || payload.assignment?.ownerId || "").trim());
});

const DEFAULT_SETTINGS = {
    general: {
        startMinimized: false,
        playSounds: true,
        saveLogs: true,
    },
    tiktok: {
        showChat: true,
        showLikes: true,
        showGifts: true,
        showFollowers: true,
        showShares: true,
        showJoin: true,
        showSystem: true,
    },
    twitch: {
        showChat: true,
        showSubs: true,
        showBits: true,
        showRaids: true,
        showFollowers: true,
        showJoin: true,
        showSystem: true,
    },
    overlay: {
        chat: true,
        events: true,
        gifts: true,
        platform: "both",
    },
    voiceFixedUsers: [],
    tiktokModerators: [],
    announcements: [],
    announcementDraft: null,
    musicWidget: null,
    voiceList: {
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
        axis: "vertical",
        movementDirection: "forward",
        autoShowEnabled: false,
        autoShowEvery: 30,
        autoShowFor: 6,
        hideAfterShow: false,
        direction: "vertical",
        motion: "static",
        motionSpeed: 24,
        showIndex: false,
        showId: false,
        selectedVoice: "",
        overrides: {},
        roulette: {
            enabled: false,
            title: "¿Quieres una voz?",
            subtitle: "Para participar, comenta lo que se indique en el sorteo!",
            winnerText: "Si ganas, solo comenta una de las siguientes voces:",
            imageUrl: "",
            imageAlt: "",
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
        },
    },
    appearance: {
        theme: "dark",
    },
    profilePhoto: {
        source: "none",
        url: "",
        reference: "",
        label: "",
        updatedAt: 0,
    },
    connectionProfiles: {
        tiktok: { username: "", avatarUrl: "" },
        twitch: { username: "", avatarUrl: "" },
    },
    personalization: {
        theme: "dark",
        font: "inter",
        animation: "slide",
        chatLayout: "vertical",
        chatDirection: "down",
        chatTheme: "cloud",
        chatAdjustMessages: false,
        avatarFrame: "platform",
        bubbleFrame: "platform",
        avatarSize: "md",
        showPlatformPill: true,
        showTimestamps: true,
        showActivity: true,
        bubbleRadius: 12,
        avatarBorderWidth: 2,
        messagePadding: 7,
        rowGap: 5,
        tiktokNameColor: "white",
        twitchNameColor: "real",
        nameSize: "md",
        nameWeight: "800",
        chatHorizontalMode: "normal",
        chatOverlayShape: "normal",
        chatOverlayCardSide: "center",
        badgeStyle: "emoji",
        tiktokNameColor: "white",
        twitchNameColor: "real",
        messageEffect: "shadow",
        nameEffect: "shadow",
        textColor: "auto",
        showBadges: true,
        showEmotes: true,
        highlightSupporters: true,
        supporterHighlightStyle: "gold",
        eventsLayout: "vertical",
        eventsDirection: "down",
        eventsMode: "slide",
        eventsPanelSize: "normal",
        eventsOverlayShape: "normal",
        giftsLayout: "vertical",
        giftsDirection: "down",
        giftsMode: "slide",
        giftsPanelSize: "normal",
        giftsOverlayShape: "normal",
        eventsOverlayCardSide: "center",
        giftsOverlayCardSide: "center",
        overlayNameColorMode: "platform",
        overlayNameColor: "#ffffff",
        overlayEventFont: "inherit",
        overlayGiftDisplayMode: "full",
        overlayGiftCompositionMode: "vertical-centered",
        eventVisibility: { likes:true, follows:true, joins:true, shares:true, system:true, gifts:true, subscriptions:true, bits:true, raids:true, hosts:true },
        highlightStyle: "platform",
        giftHighlightStyle: "gold",
        highlightEventUsername: true,
        highlightLikes: true,
        highlightFollows: true,
        highlightJoins: true,
        highlightShares: true,
        highlightSystem: true,
        highlightFanclub: true,
        highlightSuperfan: true,
        highlightGifts: true,
        highlightSubs: true,
        highlightBits: true,
        highlightRaids: true,
        autoClearChat: false,
        clearChatSeconds: 30,
    },
};

function sanitizeLiveOnlySettings(settings){
    const out = structuredClone(settings || {});
    // Elimina únicamente estado efímero de LIVE antes de enviarlo a clientes/overlays.
    // La configuración persistente de cada cuenta, incluido Puntos, se conserva intacta.
    if (out.voiceBot && typeof out.voiceBot === "object") {
        delete out.voiceBot.lastMessageByUser;
        delete out.voiceBot.seenEvents;
        delete out.voiceBot.pendingByUser;
    }
    return out;
}

function normalizeVoiceCustomFilterWords(raw) {
    return [...new Set((Array.isArray(raw) ? raw : [])
        .map(v => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean))]
        .slice(0, 500)
        .map(v => v.slice(0, 120));
}

function migrateVoiceCustomFilterSettings(settings = {}) {
    const base = settings && typeof settings === "object" ? settings : {};
    const voiceBot = base.voiceBot && typeof base.voiceBot === "object" ? base.voiceBot : {};
    const legacy = normalizeVoiceCustomFilterWords(base?.profanityFilter?.customWords);
    const current = normalizeVoiceCustomFilterWords(voiceBot.customFilterWords);
    if (current.length || !legacy.length) return base;
    const migrated = deepMerge(structuredClone(base), { voiceBot: { customFilterWords: legacy } });
    return migrated;
}

function normalizeVoiceCustomFilterSource(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function escapeVoiceRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVoiceCustomFilterRegex(words = []) {
    const patterns = normalizeVoiceCustomFilterWords(words).map((word) => {
        const normalized = normalizeVoiceCustomFilterSource(word).trim().replace(/\s+/g, " ");
        if (!normalized) return "";
        const parts = normalized.split(" ").filter(Boolean).map(escapeVoiceRegex);
        const core = parts.join("[\\s._-]+");
        return `(?<![\\p{L}\\p{N}])${core}(?![\\p{L}\\p{N}])`;
    }).filter(Boolean);
    return patterns.length ? new RegExp(patterns.join("|"), "giu") : null;
}

function censorVoiceCustomFilter(text, ownerId = "", explicitWords = []) {
    const source = String(text || "");
    if (!source) return source;
    const settings = ownerId ? (database.getUserSettings(ownerId) || {}) : {};
    const words = explicitWords.length ? explicitWords : (settings?.voiceBot?.customFilterWords || []);
    const regex = buildVoiceCustomFilterRegex(words);
    if (!regex) return source;
    // En servidor usamos el texto original (solo NFKC/ausencia de case) para no deformar
    // tildes o la ñ del resto del comentario. El overlay ya hace la limpieza Unicode previa.
    const directSource = source.normalize("NFKC");
    return directSource.replace(regex, " ").replace(/\s+/g, " ").trim();
}

function sanitizeRepeatedSpamComment(text) {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) return "";

    const laughUnit = (value) => /^(?:ja|je|ji|jo|ju|ha|he|hi|ho|hu|jaja|jeje|jojo|haha|hehe|xd|lol)$/i.test(value);
    const punctuationFree = (value) => normalizeVoiceCustomFilterSource(value).replace(/[^\p{L}\p{N}]+/gu, "");
    const tokens = source.split(" ").filter(Boolean);

    // Repeated tokens: normal spam keeps one copy; laughter keeps three for a natural TTS rhythm.
    const groups = [];
    for (const token of tokens) {
        const clean = punctuationFree(token);
        const previous = groups[groups.length - 1];
        if (previous && previous.key && clean && previous.key === clean) previous.tokens.push(token);
        else groups.push({ key: clean, tokens: [token] });
    }
    if (groups.some(group => group.tokens.length >= 3)) {
        const reduced = groups.flatMap(group => {
            if (group.tokens.length < 3) return group.tokens;
            if (laughUnit(group.key)) return group.tokens.slice(0, 3).map(token => punctuationFree(token) || token);
            return [group.tokens[0]];
        });
        return reduced.join(" ").replace(/\s+/g, " ").trim();
    }

    // Attached repetition: HOLAHOLAHOLA -> HOLA; JAJAJAJAJA -> JA, JA, JA.
    const compact = punctuationFree(source);
    if (compact.length >= 6 && compact.length <= 80) {
        for (let size = 1; size <= Math.min(8, Math.floor(compact.length / 3)); size++) {
            if (compact.length % size !== 0) continue;
            const unit = compact.slice(0, size);
            if (!unit) continue;
            const count = compact.length / size;
            if (count < 3 || !new RegExp(`^(?:${escapeVoiceRegex(unit)}){${count}}$`, "i").test(compact)) continue;
            if (laughUnit(unit)) return Array.from({ length: Math.min(3, count) }, () => unit).join(", ");
            return unit;
        }
    }
    return source;
}

function deepMerge(base, incoming) {
    if (Array.isArray(base) || Array.isArray(incoming)) return incoming ?? base;
    if (typeof base !== "object" || base === null) return incoming ?? base;
    if (typeof incoming !== "object" || incoming === null) return base;

    const result = { ...base };

    for (const key of Object.keys(incoming)) {
        if (key in base) {
            result[key] = deepMerge(base[key], incoming[key]);
        } else {
            result[key] = incoming[key];
        }
    }

    return result;
}

function normalizeAnnouncementConfig(input = {}) {
    const clamp = (v,min,max,def) => { const n=Number(v); return Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : def; };
    const clean = (v,max=20000) => String(v ?? '').trim().slice(0,max);
    const color = (v,def) => { const x=clean(v,30); return /^#[0-9a-f]{3,8}$/i.test(x) || /^rgba?\([^)]+\)$/.test(x) ? x : def; };
    const pos = (v,def=50) => clamp(v,0,100,def);
    const slide = (raw={}, index=0) => {
        const r = raw && typeof raw === 'object' ? raw : {};
        const legacyText = r.text && typeof r.text === 'object' ? r.text : null;
        const rawTexts = Array.isArray(r.texts) ? r.texts.slice(0,3) : (legacyText ? [legacyText] : [{}]);
        const image = r.image && typeof r.image === 'object' ? r.image : {};
        const normalizeText = (rawText={}, textIndex=0) => {
            const text = rawText && typeof rawText === 'object' ? rawText : {};
            return {
                id: clean(text.id || `txt_${Date.now()}_${index}_${textIndex}_${Math.random().toString(36).slice(2,8)}`,80),
                enabled: text.enabled !== false, value: clean(text.value ?? (textIndex ? `Texto ${textIndex+1}` : 'Escribe tu anuncio'),1200),
                x: pos(text.x,textIndex===0?38:50), y: pos(text.y,textIndex===0?50:50), width: pos(text.width,58), height: pos(text.height,30),
                fontFamily: clean(text.fontFamily || 'Inter',120), fontSize: clamp(text.fontSize,10,220,52), fontWeight: clamp(text.fontWeight,100,1000,800),
                fontStyle: ['normal','italic'].includes(String(text.fontStyle)) ? String(text.fontStyle) : 'normal',
                color: color(text.color,'#ffffff'), align: ['left','center','right'].includes(String(text.align)) ? String(text.align) : 'center',
                shadow: text.shadow !== false, shadowColor: color(text.shadowColor,'rgba(0,0,0,0.55)'),
                shadowBlur: clamp(text.shadowBlur,0,80,16), shadowX: clamp(text.shadowX,-40,40,0), shadowY: clamp(text.shadowY,-40,40,4),
                outlineWidth: clamp(text.outlineWidth,0,20,0), outlineColor: color(text.outlineColor,'#000000'),
                letterSpacing: clamp(text.letterSpacing,-10,40,0), lineHeight: clamp(text.lineHeight,0.6,2.5,1.05),
                transform: ['none','uppercase','lowercase','capitalize'].includes(String(text.transform)) ? String(text.transform) : 'none',
            };
        };
        const id = clean(r.id || `slide_${Date.now()}_${index}_${Math.random().toString(36).slice(2,8)}`,80);
        return {
            id,
            showSeconds: clamp(r.showSeconds,0.5,86400,8),
            texts: rawTexts.map(normalizeText),
            image: {
                enabled: image.enabled === true,
                url: clean(image.url,5000),
                x: pos(image.x,68), y: pos(image.y,50), width: pos(image.width,26), height: pos(image.height,42),
                opacity: clamp(image.opacity,0,1,1), radius: clamp(image.radius,0,80,18),
                fit: ['contain','cover','fill'].includes(String(image.fit)) ? String(image.fit) : 'contain',
                shadow: image.shadow !== false, shadowColor: color(image.shadowColor,'rgba(0,0,0,0.42)'),
                shadowBlur: clamp(image.shadowBlur,0,80,18), shadowX: clamp(image.shadowX,-40,40,0), shadowY: clamp(image.shadowY,-40,40,8),
                borderWidth: clamp(image.borderWidth,0,20,0), borderColor: color(image.borderColor,'rgba(255,255,255,0.2)'),
            }
        };
    };
    const r = input && typeof input === 'object' ? input : {};
    const slides = Array.isArray(r.slides) ? r.slides.slice(0,3).map((x,i)=>slide(x,i)) : [slide({},0)];
    return {
        id: clean(r.id || `ann_${Date.now()}_${Math.random().toString(36).slice(2,10)}`,80),
        name: clean(r.name || 'Anuncio',120), enabled: r.enabled !== false,
        repeatEvery: clamp(r.repeatEvery,0,86400,180), showImmediately: r.showImmediately !== false,
        width: clamp(r.width,320,3840,1280), height: clamp(r.height,180,2160,720),
        slides: slides.length ? slides : [slide({},0)], updatedAt: Number(r.updatedAt || Date.now()), createdAt: Number(r.createdAt || Date.now())
    };
}
function normalizeAnnouncements(input) {
    const raw = Array.isArray(input) ? input : [];
    return raw.slice(0,4).map(normalizeAnnouncementConfig);
}

function getMergedSettings() {
    const saved = database.getSettings();
    if (!saved) return structuredClone(DEFAULT_SETTINGS);
    return deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
}

function normalizeVoiceFixedUserEntry(entry = {}) {
    const platform = String(entry?.platform || "tiktok").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const username = cleanUser(String(entry?.username || entry?.uniqueId || entry?.displayName || entry?.label || "").trim());
    if (!username) return null;
    const voiceKey = String(entry?.voiceKey || "verity").trim();
    const displayName = String(entry?.displayName || entry?.nickname || entry?.username || entry?.label || username).trim() || username;
    const source = String(entry?.source || "manual").toLowerCase() === "roulette" ? "roulette" : "manual";
    return {
        platform,
        username,
        displayName,
        voiceKey,
        voiceLabel: String(entry?.voiceLabel || entry?.label || entry?.voiceKey || "").trim(),
        source,
        sourceLabel: source === "roulette" ? "Ruleta" : "Manual",
        comment: String(entry?.comment || "").trim(),
        winnerKey: String(entry?.winnerKey || "").trim(),
        createdAt: Number(entry?.createdAt || Date.now()),
        updatedAt: Number(entry?.updatedAt || Date.now()),
        commentAt: Number(entry?.commentAt || 0) || 0,
        autoAssigned: Boolean(entry?.autoAssigned),
    };
}

function voiceFixedUserKey(entry = {}) {
    const platform = String(entry?.platform || "tiktok").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const username = cleanUser(String(entry?.username || entry?.uniqueId || "").trim());
    return platform && username ? `${platform}:${username}` : "";
}

function readVoiceFixedUsers(ownerId = "") {
    const settings = ownerId ? database.getUserSettings(ownerId) : (database.getSettings() || {});
    const list = Array.isArray(settings.voiceFixedUsers) ? settings.voiceFixedUsers : [];
    return list.map((entry) => normalizeVoiceFixedUserEntry(entry)).filter(Boolean);
}

function writeVoiceFixedUsers(list = [], ownerId = "") {
    const current = ownerId ? database.getUserSettings(ownerId) : (database.getSettings() || {});
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), current);
    merged.voiceFixedUsers = list.map((entry) => normalizeVoiceFixedUserEntry(entry)).filter(Boolean);
    if (ownerId) {
        database.saveUserSettings(ownerId, merged);
        io.to(`user:${ownerId}`).emit("settings", merged);
        return merged.voiceFixedUsers;
    }
    database.saveSettings(merged);
    io.emit("settings", merged);
    return merged.voiceFixedUsers;
}

function upsertVoiceFixedUser(entry = {}, ownerId = "") {
    const normalized = normalizeVoiceFixedUserEntry(entry);
    if (!normalized) return null;
    const list = readVoiceFixedUsers(ownerId);
    const key = voiceFixedUserKey(normalized);
    const idx = list.findIndex((item) => voiceFixedUserKey(item) === key);
    const now = Date.now();
    const next = {
        ...normalized,
        createdAt: idx >= 0 ? Number(list[idx]?.createdAt || now) : now,
        updatedAt: now,
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.unshift(next);
    writeVoiceFixedUsers(list, ownerId);
    return next;
}

function deleteVoiceFixedUser(entry = {}, ownerId = "") {
    const key = voiceFixedUserKey(entry);
    if (!key) return false;
    const list = readVoiceFixedUsers(ownerId);
    const next = list.filter((item) => voiceFixedUserKey(item) !== key);
    if (next.length === list.length) return false;
    writeVoiceFixedUsers(next, ownerId);
    return true;
}

const AVATAR_FALLBACK = (seed, platform = "user") => {
    const label = String(seed || platform || "U").replace(/^@+/, "").replace(/^#+/, "").trim();
    if (platform === "tiktok") {
        return `https://api.dicebear.com/10.x/notionists/svg?seed=${encodeURIComponent(label || "tiktok")}`;
    }
    const initial = (label.match(/[A-Za-z0-9]/)?.[0] || String(platform || "U")[0] || "U").toUpperCase();
    const accent = platform === "twitch" ? "#9146ff" : "#64748b";
    const bg = platform === "twitch" ? "#0f172a" : "#1f2937";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="${bg}"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="57%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="700" fill="#fff">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

function cleanUser(value) {
    return String(value || "")
        .trim()
        .replace(/^@+/, "")
        .replace(/^#+/, "")
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
        .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "")
        .split(/[/?#]/)[0]
        .trim();
}

async function fetchText(url, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    } finally {
        clearTimeout(timer);
    }
}

async function resolveTiktokAvatar(username) {
    const html = await fetchText(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
    if (!html) return "";

    const patterns = [
        /property=["']og:image(?:secure_url)?["'][^>]*content=["']([^"']+)["']/i,
        /name=["']twitter:image(?:secure_url)?["'][^>]*content=["']([^"']+)["']/i,
        /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /content=["']([^"']+)["'][^>]*property=["']og:image/i,
    ];

    for (const re of patterns) {
        const match = html.match(re);
        if (match?.[1]) return String(match[1]).replace(/&amp;/g, "&");
    }

    const metaMatch = html.match(/"avatarThumb"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i);
    if (metaMatch?.[1]) return String(metaMatch[1]).replace(/\u0026/g, "&");

    return "";
}

async function resolveTwitchAvatar(username) {
    const text = await fetchText(`https://decapi.me/twitch/avatar/${encodeURIComponent(username)}`);
    const avatar = String(text || "").trim();
    if (/^https?:\/\//i.test(avatar)) return avatar;
    return "";
}

function extractMetaContent(html, key, attr = "name") {
    if (!html) return "";
    const safeKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<meta[^>]+${attr}=[\"']${safeKey}[\"'][^>]+content=[\"']([^\"']+)`, "i"),
        new RegExp(`<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+${attr}=[\"']${safeKey}[\"']`, "i"),
    ];
    for (const re of patterns) {
        const match = html.match(re);
        if (match?.[1]) return String(match[1]).replace(/&amp;/g, "&").trim();
    }
    return "";
}

function decodeEscapedJsonString(value) {
    return String(value || "")
        .replace(/\\u002F/gi, "/")
        .replace(/\\u0026/gi, "&")
        .replace(/\\u003D/gi, "=")
        .replace(/\\u003F/gi, "?")
        .replace(/\\\"/g, '\"')
        .trim();
}

async function lookupPublicProfile(platform, username) {
    const p = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const login = cleanUser(username);
    if (!login) throw new Error("Escribe un usuario válido.");

    if (p === "tiktok") {
        // La foto se obtiene PRIMERO y se conserva en pendingProfilePhotos.
        // No hacemos una segunda descarga de la misma imagen al iniciar la conexión.
        let photoLookup = null;
        try {
            photoLookup = await lookupProfilePhoto("tiktok", login);
        } catch (error) {
            throw new Error(error?.message || "No se pudo consultar ese perfil de TikTok.");
        }

        const pendingId = String(photoLookup?.pendingId || "").trim();
        const pending = pendingId ? pendingProfilePhotos.get(pendingId) : null;
        const avatarUrl = String(photoLookup?.sourceUrl || "").trim();
        const userData = photoLookup?.userData && typeof photoLookup.userData === "object" ? photoLookup.userData : {};
        const uniqueId = cleanUser(userData.unique_id || userData.uniqueId || userData.uniqueID || login) || login;
        const displayName = String(userData.nickname || userData.display_name || userData.displayName || uniqueId).trim() || uniqueId;

        if (!avatarUrl && !pending) throw new Error("Euler encontró el perfil, pero no devolvió una foto de perfil utilizable.");

        const photoData = pending ? { buffer: pending.buffer, contentType: pending.contentType } : null;
        if (pendingId) pendingProfilePhotos.delete(pendingId);
        return {
            platform: p,
            username: uniqueId,
            displayName,
            avatarUrl: avatarUrl || "",
            photoData
        };
    }

    // Twitch: obtener avatar y página de perfil en paralelo; el avatar sigue estando
    // disponible antes de iniciar la conexión del canal.
    const [html, avatarUrl] = await Promise.all([
        fetchText(`https://www.twitch.tv/${encodeURIComponent(login)}`),
        resolveTwitchAvatar(login).catch(() => "")
    ]);
    let displayName = "";
    if (html) {
        const candidates = [
            html.match(/\"displayName\"\s*:\s*\"([^\"]+)\"/i),
            html.match(/\"display_name\"\s*:\s*\"([^\"]+)\"/i),
            html.match(/<title[^>]*>\s*([^<]+?)\s*[-|]\s*Twitch\s*<\/title>/i),
        ];
        displayName = decodeEscapedJsonString(candidates.find(Boolean)?.[1] || "");
    }
    if (!displayName) displayName = login;
    if (!avatarUrl && !html) throw new Error("No se pudo consultar ese perfil de Twitch.");
    return { platform: p, username: login, displayName, avatarUrl };
}


const PROFILE_PHOTO_DIR = path.join(__dirname, "data", "profile-photos");
if (!fs.existsSync(PROFILE_PHOTO_DIR)) fs.mkdirSync(PROFILE_PHOTO_DIR, { recursive: true });
const USER_BACKGROUND_DIR = path.join(__dirname, "data", "user-backgrounds");
const USER_LIBRARY_DIR = path.join(__dirname, "data", "user-library");
if (!fs.existsSync(USER_LIBRARY_DIR)) fs.mkdirSync(USER_LIBRARY_DIR, { recursive: true });
if (!fs.existsSync(USER_BACKGROUND_DIR)) fs.mkdirSync(USER_BACKGROUND_DIR, { recursive: true });
const ANNOUNCEMENT_IMAGE_DIR = path.join(__dirname, "data", "announcement-images");
if (!fs.existsSync(ANNOUNCEMENT_IMAGE_DIR)) fs.mkdirSync(ANNOUNCEMENT_IMAGE_DIR, { recursive: true });
const USER_BACKGROUND_MAX_BYTES = 6 * 1024 * 1024;
const ANNOUNCEMENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const pendingProfilePhotos = new Map();
const PROFILE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

function imageExtension(contentType = "image/jpeg") {
    const type = String(contentType || "").toLowerCase().split(";")[0];
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/gif") return "gif";
    if (type === "image/avif") return "avif";
    return "jpg";
}

function assertImageBuffer(buffer, contentType = "") {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("La imagen está vacía.");
    if (buffer.length > PROFILE_PHOTO_MAX_BYTES) throw new Error("La imagen supera el límite de 8 MB.");
    if (contentType && !/^image\//i.test(String(contentType))) throw new Error("El archivo recibido no es una imagen.");
}

function dataUrlToImage(value) {
    const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) throw new Error("Archivo de imagen no válido.");
    const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    assertImageBuffer(buffer, match[1]);
    return { buffer, contentType: match[1].toLowerCase() };
}

async function fetchImage(url, timeoutMs = 10000) {
    const target = String(url || "").trim();
    if (!/^https?:\/\//i.test(target)) throw new Error("La URL de la imagen no es válida.");
    const hostname = new URL(target).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0" || hostname === "127.0.0.1" || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
        throw new Error("La URL debe apuntar a una dirección pública.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(target, {
            signal: controller.signal,
            redirect: "follow",
            headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
                accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                referer: "https://www.tiktok.com/",
            },
        });
        if (!response.ok) throw new Error(`La imagen respondió HTTP ${response.status}.`);
        const type = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (!/^image\//i.test(type)) throw new Error("La URL no devuelve una imagen.");
        const length = Number(response.headers.get("content-length") || 0);
        if (length > PROFILE_PHOTO_MAX_BYTES) throw new Error("La imagen supera el límite de 8 MB.");
        const buffer = Buffer.from(await response.arrayBuffer());
        assertImageBuffer(buffer, type);
        return { buffer, contentType: type };
    } finally { clearTimeout(timer); }
}

async function syncConnectedProfilePhotoData(ownerId, platform, username, image) {
    const owner = String(ownerId || "").trim();
    const type = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const clean = type === "twitch" ? String(username || "").replace(/^#+/, "").trim() : cleanUser(username);
    if (!owner || !clean || !image?.buffer) return null;
    try {
        const photo = savePermanentProfilePhoto(owner, image, {
            source: type,
            reference: clean,
            label: type === "twitch" ? `Twitch · @${clean}` : `TikTok · @${clean}`
        });
        const savedSettings = database.getUserSettings(owner);
        io.to(`user:${owner}`).emit("settings", savedSettings);
        return photo;
    } catch (error) {
        console.warn(`[profile-photo] No se pudo guardar ${type} @${clean}:`, error?.message || error);
        return null;
    }
}

async function syncConnectedProfilePhoto(ownerId, platform, username, avatarUrl) {
    const owner = String(ownerId || "").trim();
    const type = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const clean = type === "twitch" ? String(username || "").replace(/^#+/, "").trim() : cleanUser(username);
    const sourceUrl = String(avatarUrl || "").trim();
    if (!owner || !clean || !/^https?:\/\//i.test(sourceUrl)) return null;

    try {
        // Reutiliza la misma ruta de almacenamiento de Ajustes → Foto de perfil,
        // pero se ejecuta automáticamente al obtener el perfil de una conexión.
        const image = await fetchImage(sourceUrl);
        const photo = savePermanentProfilePhoto(owner, image, {
            source: type,
            reference: clean,
            label: type === "twitch" ? `Twitch · @${clean}` : `TikTok · @${clean}`
        });

        const savedSettings = database.getUserSettings(owner);
        io.to(`user:${owner}`).emit("settings", savedSettings);
        return photo;
    } catch (error) {
        console.warn(`[profile-photo] No se pudo sincronizar ${type} @${clean}:`, error?.message || error);
        return null;
    }
}

async function lookupProfilePhoto(source, value) {
    const clean = cleanUser(value);
    if (!clean) throw new Error("Escribe un usuario válido.");
    const type = String(source || "").toLowerCase();

    if (type === "url") {
        const image = await fetchImage(value);
        const pendingId = randomBytes(18).toString("hex");
        pendingProfilePhotos.set(pendingId, { ...image, source: "url", reference: String(value).trim(), label: "URL", createdAt: Date.now() });
        return { pendingId, previewUrl: `/api/profile-photo/pending/${pendingId}`, label: "URL" };
    }

    if (type === "twitch") {
        const response = await fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(clean)}`, {
            headers: { "user-agent": "StreamFusion/1.0", accept: "text/plain" },
        });
        const avatarUrl = String(await response.text()).trim();
        if (!response.ok || !/^https?:\/\//i.test(avatarUrl)) throw new Error("No se encontró la foto de ese canal de Twitch.");
        const image = await fetchImage(avatarUrl);
        const pendingId = randomBytes(18).toString("hex");
        pendingProfilePhotos.set(pendingId, { ...image, source: "twitch", reference: clean, label: `Twitch · @${clean}`, createdAt: Date.now() });
        return { pendingId, previewUrl: `/api/profile-photo/pending/${pendingId}`, label: `Twitch · @${clean}` };
    }

    if (type === "tiktok") {
        const apiKey = String(process.env.EULER_API_KEY || "").trim();
        if (!apiKey) throw new Error("Falta EULER_API_KEY en el .env del backend.");
        const response = await fetch(`https://tiktok.eulerstream.com/tiktok/users/${encodeURIComponent(clean)}/basic`, {
            headers: { "X-Api-Key": apiKey, accept: "application/json", "user-agent": "StreamFusion/1.0" },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || Number(data.code) !== 200 || !data.user) {
            throw new Error(data?.message || `Euler respondió HTTP ${response.status}.`);
        }
        const userData = data.user;
        const avatars = [];
        for (const key of ["avatar_larger", "avatar_medium", "avatar_thumb"]) {
            const list = Array.isArray(userData[key]) ? userData[key] : [];
            for (const item of list) if (typeof item === "string" && /^https?:\/\//i.test(item)) avatars.push(item);
        }
        if (!avatars.length) throw new Error("Euler no devolvió una foto para ese unique ID.");
        let image = null;
        let selectedUrl = "";
        for (const candidate of avatars) {
            try { image = await fetchImage(candidate); selectedUrl = candidate; break; } catch {}
        }
        if (!image) throw new Error("Se encontró el perfil, pero no se pudo descargar su imagen.");
        const pendingId = randomBytes(18).toString("hex");
        pendingProfilePhotos.set(pendingId, { ...image, source: "tiktok", reference: clean, label: `TikTok · @${clean}`, nickname: String(userData.nickname || ""), sourceUrl: selectedUrl, userData, createdAt: Date.now() });
        return { pendingId, previewUrl: `/api/profile-photo/pending/${pendingId}`, label: `TikTok · @${clean}`, nickname: String(userData.nickname || ""), sourceUrl: selectedUrl, userData };
    }

    throw new Error("Fuente de foto no válida.");
}

function getProfilePhotoPayload(ownerId) {
    const settings = database.getUserSettings(ownerId) || {};
    return settings.profilePhoto || DEFAULT_SETTINGS.profilePhoto;
}

function savePermanentProfilePhoto(ownerId, image, meta = {}) {
    const safeOwner = String(ownerId || "").replace(/[^A-Za-z0-9_-]/g, "_");
    const previous = getProfilePhotoPayload(ownerId);
    if (String(previous.url || "").startsWith("/profile-photo/")) {
        const previousToken = String(previous.url).split("/").pop();
        for (const file of fs.readdirSync(PROFILE_PHOTO_DIR)) {
            if (file.startsWith(`${safeOwner}_`) && file.includes(`_${previousToken}.`)) { try { fs.unlinkSync(path.join(PROFILE_PHOTO_DIR, file)); } catch {} }
        }
    }
    const token = randomBytes(24).toString("hex");
    const ext = imageExtension(image.contentType);
    const fileName = `${safeOwner}_${token}.${ext}`;
    const diskPath = path.join(PROFILE_PHOTO_DIR, fileName);
    fs.writeFileSync(diskPath, image.buffer);
    const photo = { source: meta.source || "none", url: `/profile-photo/${encodeURIComponent(token)}`, reference: meta.reference || "", label: meta.label || "", updatedAt: Date.now() };
    const current = database.getUserSettings(ownerId) || {};
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { profilePhoto: photo }));
    database.saveUserSettings(ownerId, merged);
    return photo;
}

function getUserBackgroundPayload(ownerId) {
    const settings = database.getUserSettings(ownerId) || {};
    return settings.appearance?.backgroundImage || "";
}

function savePermanentAnnouncementImage(ownerId, image) {
    const safeOwner = String(ownerId || "").replace(/[^A-Za-z0-9_-]/g, "_");
    if (!Buffer.isBuffer(image?.buffer) || !image.buffer.length) throw new Error("La imagen del anuncio está vacía.");
    if (image.buffer.length > ANNOUNCEMENT_IMAGE_MAX_BYTES) throw new Error("La imagen del anuncio supera el límite de 8 MB.");
    const token = randomBytes(24).toString("hex");
    const ext = imageExtension(image.contentType);
    const fileName = `${safeOwner}_${token}.${ext}`;
    fs.writeFileSync(path.join(ANNOUNCEMENT_IMAGE_DIR, fileName), image.buffer);
    return `/announcement-image/${encodeURIComponent(token)}`;
}

function cleanupAnnouncementImages(ownerId, announcements = []) {
    const safeOwner = String(ownerId || "").replace(/[^A-Za-z0-9_-]/g, "_");
    const referenced = new Set();
    for (const ann of Array.isArray(announcements) ? announcements : []) {
        for (const slide of (Array.isArray(ann?.slides) ? ann.slides : [])) {
            const url = String(slide?.image?.url || "");
            if (!url.startsWith("/announcement-image/")) continue;
            const token = url.split("/").pop()?.replace(/[^a-f0-9]/gi, "");
            if (token) referenced.add(token);
        }
    }
    for (const file of fs.readdirSync(ANNOUNCEMENT_IMAGE_DIR)) {
        if (!file.startsWith(`${safeOwner}_`)) continue;
        const match = file.match(/_([a-f0-9]{48})\.[^.]+$/i);
        if (!match || referenced.has(match[1])) continue;
        try { fs.unlinkSync(path.join(ANNOUNCEMENT_IMAGE_DIR, file)); } catch {}
    }
}

function savePermanentUserBackground(ownerId, image) {
    const safeOwner = String(ownerId || "").replace(/[^A-Za-z0-9_-]/g, "_");
    const previous = String(getUserBackgroundPayload(ownerId) || "");
    if (previous.startsWith("/background-image/")) {
        const previousToken = previous.split("/").pop();
        for (const file of fs.readdirSync(USER_BACKGROUND_DIR)) {
            if (file.startsWith(`${safeOwner}_`) && file.includes(`_${previousToken}.`)) { try { fs.unlinkSync(path.join(USER_BACKGROUND_DIR, file)); } catch {} }
        }
    }
    if (!Buffer.isBuffer(image?.buffer) || !image.buffer.length) throw new Error("La imagen de fondo está vacía.");
    if (image.buffer.length > USER_BACKGROUND_MAX_BYTES) throw new Error("La imagen de fondo supera el límite de 6 MB.");
    const token = randomBytes(24).toString("hex");
    const ext = imageExtension(image.contentType);
    const fileName = `${safeOwner}_${token}.${ext}`;
    fs.writeFileSync(path.join(USER_BACKGROUND_DIR, fileName), image.buffer);
    return `/background-image/${encodeURIComponent(token)}`;
}

function removeUserBackground(ownerId) {
    const safeOwner = String(ownerId || "").replace(/[^A-Za-z0-9_-]/g, "_");
    const previous = String(getUserBackgroundPayload(ownerId) || "");
    if (previous.startsWith("/background-image/")) {
        const previousToken = previous.split("/").pop();
        for (const file of fs.readdirSync(USER_BACKGROUND_DIR)) {
            if (file.startsWith(`${safeOwner}_`) && file.includes(`_${previousToken}.`)) { try { fs.unlinkSync(path.join(USER_BACKGROUND_DIR, file)); } catch {} }
        }
    }
}

function cleanupPendingProfilePhotos() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, item] of pendingProfilePhotos.entries()) if (Number(item.createdAt || 0) < cutoff) pendingProfilePhotos.delete(id);
}
setInterval(cleanupPendingProfilePhotos, 60_000).unref();


function readRequestBuffer(req, maxBytes = 52 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0; const chunks = [];
        req.on('data', chunk => { total += chunk.length; if (total > maxBytes) { reject(Object.assign(new Error('El archivo o solicitud supera el límite permitido.'), { statusCode: 413 })); req.destroy(); return; } chunks.push(Buffer.from(chunk)); });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
        req.on('aborted', () => reject(Object.assign(new Error('La subida fue cancelada.'), { statusCode: 400 })));
    });
}

function parseMultipartBuffer(buffer, contentType) {
    const match = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) throw new Error('Solicitud multipart inválida.');
    const boundary = Buffer.from(`--${match[1] || match[2]}`);
    const parts = []; let cursor = 0;
    while (cursor < buffer.length) {
        const start = buffer.indexOf(boundary, cursor);
        if (start < 0) break;
        const next = buffer.indexOf(boundary, start + boundary.length);
        if (next < 0) break;
        let part = buffer.subarray(start + boundary.length, next);
        if (part.subarray(0,2).equals(Buffer.from('--'))) break;
        if (part.subarray(0,2).equals(Buffer.from('\r\n'))) part = part.subarray(2);
        if (part.length >= 2 && part.subarray(part.length-2).equals(Buffer.from('\r\n'))) part = part.subarray(0, part.length-2);
        const sep = Buffer.from('\r\n\r\n'); const split = part.indexOf(sep);
        if (split >= 0) {
            const headerText = part.subarray(0, split).toString('utf8');
            const body = part.subarray(split + sep.length);
            const headers = {};
            for (const line of headerText.split('\r\n')) { const idx=line.indexOf(':'); if(idx>0) headers[line.slice(0,idx).trim().toLowerCase()] = line.slice(idx+1).trim(); }
            const disposition = headers['content-disposition'] || '';
            const nameMatch = disposition.match(/name="([^"]*)"/i);
            const filenameMatch = disposition.match(/filename="([^"]*)"/i);
            if (nameMatch) parts.push({ name:nameMatch[1], filename:filenameMatch ? filenameMatch[1] : '', mime:String(headers['content-type']||'application/octet-stream'), data:body });
        }
        cursor = next;
    }
    return parts;
}

function safeLibraryFileName(name) {
    const base = path.basename(String(name || 'archivo')).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim() || 'archivo';
    return base.slice(0, 180);
}
function libraryKindFor(mime, name='') {
    const m=String(mime||'').toLowerCase(), n=String(name||'').toLowerCase();
    if (m === 'image/gif' || m.startsWith('image/')) return 'images';
    if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(n)) return 'audio';
    if (m.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(n)) return 'video';
    return '';
}
function allowedLibraryFile(mime,name,kind) {
    const n=String(name||'').toLowerCase(), m=String(mime||'').toLowerCase();
    if(kind==='images') return (m.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(n));
    if(kind==='audio') return (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(n));
    if(kind==='video') return (m.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(n));
    return false;
}
function userLibraryDiskDir(userId) {
    const safe = String(userId||'').replace(/[^A-Za-z0-9_-]/g,'_'); const dir=path.join(USER_LIBRARY_DIR,safe); if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true}); return dir;
}

app.use(cors());
app.use(compression());
app.use(
    helmet({
        contentSecurityPolicy: false,
    })
);
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "Public")));

function bearerToken(req) {
    return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function requireUser(req, res, next) {
    const user = database.getSession(bearerToken(req));
    if (!user) return res.status(401).json({ error: "Sesión requerida." });
    req.user = user;
    next();
}


app.get('/api/library', requireUser, (req,res)=>{
    const files=database.listUserLibraryFiles(req.user.id).map(f=>({...f,url:`/library-file/${encodeURIComponent(f.accessToken)}`}));
    res.json({ok:true,files,usage:database.getUserLibraryUsage(req.user.id),limitBytes:database.LIBRARY_MAX_BYTES});
});

app.post('/api/library/upload', requireUser, async (req,res)=>{
    try {
        const kind=String(req.headers['x-library-kind']||'').toLowerCase();
        if(!['images','audio','video'].includes(kind)) return res.status(400).json({error:'Sección de biblioteca inválida.'});
        const usage=database.getUserLibraryUsage(req.user.id);
        const remaining=database.LIBRARY_MAX_BYTES-usage.usedBytes;
        const declared=Number(req.headers['content-length']||0);
        if(declared>52*1024*1024) return res.status(413).json({error:'La subida supera el límite permitido de 50 MB.'});
        const body=await readRequestBuffer(req, 52*1024*1024);
        const parts=parseMultipartBuffer(body,req.headers['content-type']);
        const file=parts.find(p=>p.name==='file'&&p.filename);
        if(!file) return res.status(400).json({error:'No se recibió ningún archivo.'});
        if(file.data.length>remaining) return res.status(413).json({error:`No hay suficiente espacio. Restan ${(remaining/1024/1024).toFixed(2)} MB de 50 MB.`});
        if(file.data.length>database.LIBRARY_MAX_BYTES) return res.status(413).json({error:'El archivo supera el máximo de 50 MB por cuenta.'});
        const cleanName=safeLibraryFileName(file.filename); if(!allowedLibraryFile(file.mime,cleanName,kind)) return res.status(415).json({error:'Ese tipo de archivo no corresponde a esta sección.'});
        const id=randomUUID(); const ext=path.extname(cleanName).slice(0,12); const storedName=`${id}${ext}`; const dir=userLibraryDiskDir(req.user.id); fs.writeFileSync(path.join(dir,storedName),file.data);
        const saved=database.createUserLibraryFile(req.user.id,{kind,name:cleanName,storedName,mimeType:file.mime,sizeBytes:file.data.length});
        io.to(`user:${req.user.id}`).emit('libraryChanged');
        res.status(201).json({ok:true,file:{...saved,url:`/library-file/${encodeURIComponent(saved.accessToken)}`},usage:database.getUserLibraryUsage(req.user.id)});
    } catch(e){ console.error('[library upload]',e); res.status(e.statusCode||400).json({error:e.message||'No se pudo subir el archivo.'}); }
});

app.patch('/api/library/:id', requireUser, (req,res)=>{
    try { const saved=database.renameUserLibraryFile(req.user.id,req.params.id,req.body?.name); if(!saved)return res.status(404).json({error:'Archivo no encontrado.'}); io.to(`user:${req.user.id}`).emit('libraryChanged'); res.json({ok:true,file:{...saved,url:`/library-file/${encodeURIComponent(saved.accessToken)}`}}); } catch(e){res.status(400).json({error:e.message||'No se pudo renombrar.'});}
});

app.delete('/api/library/:id', requireUser, (req,res)=>{
    try { const item=database.getUserLibraryFileById(req.user.id,req.params.id); if(!item)return res.status(404).json({error:'Archivo no encontrado.'}); const ok=database.deleteUserLibraryFile(req.user.id,item.id); if(ok){try{fs.unlinkSync(path.join(userLibraryDiskDir(req.user.id),item.storedName));}catch{}} io.to(`user:${req.user.id}`).emit('libraryChanged'); res.json({ok:true,usage:database.getUserLibraryUsage(req.user.id)}); } catch(e){res.status(400).json({error:e.message||'No se pudo eliminar.'});}
});

app.get('/library-file/:token', (req,res)=>{
    const item=database.getUserLibraryFileByToken(req.params.token); if(!item)return res.status(404).end();
    const full=path.join(userLibraryDiskDir(item.userId),item.storedName); if(!fs.existsSync(full))return res.status(404).end();
    res.setHeader('Content-Type',item.mimeType); res.setHeader('Cache-Control','private, max-age=31536000, immutable');
    if(String(req.query.download||'')==='1') res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`);
    fs.createReadStream(full).pipe(res);
});

app.post("/api/auth/register", (req, res) => {
    try {
        const user = database.createUser(req.body || {});
        const token = database.createSession(user.id);
        res.status(201).json({ token, user });
    } catch (error) { res.status(400).json({ error: error.message || "No se pudo crear la cuenta." }); }
});

app.post("/api/auth/login", (req, res) => {
    try {
        const user = database.authenticateUser(req.body || {});
        const token = database.createSession(user.id);
        res.json({ token, user });
    } catch (error) { res.status(401).json({ error: error.message || "No se pudo iniciar sesión." }); }
});

app.post("/api/auth/logout", requireUser, (req, res) => { database.deleteSession(bearerToken(req)); res.status(204).end(); });

app.get("/api/me", requireUser, (req, res) => res.json({ user: req.user }));

app.get("/api/live-history", requireUser, (req, res) => res.json(liveSession.isActive(req.user.id, "tiktok") || liveSession.isActive(req.user.id, "twitch") ? liveHistorySnapshot(req.user.id) : { chat: [], events: [] }));


app.get("/api/profile-photo", requireUser, (req, res) => {
    res.json({ photo: getProfilePhotoPayload(req.user.id) });
});

app.post("/api/profile-photo/lookup", requireUser, async (req, res) => {
    try {
        const photo = await lookupProfilePhoto(req.body?.source, req.body?.value);
        res.json({ ok: true, ...photo });
    } catch (error) {
        res.status(400).json({ ok: false, error: error?.message || "No se pudo obtener la foto." });
    }
});

app.post("/api/profile-photo/select", requireUser, async (req, res) => {
    try {
        const pendingId = String(req.body?.pendingId || "").trim();
        if (pendingId) {
            const pending = pendingProfilePhotos.get(pendingId);
            if (!pending) return res.status(400).json({ ok: false, error: "La vista previa expiró. Búscala de nuevo." });
            const photo = savePermanentProfilePhoto(req.user.id, pending, pending);
            pendingProfilePhotos.delete(pendingId);
            io.to(`user:${req.user.id}`).emit("settings", database.getUserSettings(req.user.id));
            return res.json({ ok: true, photo });
        }

        const libraryId = String(req.body?.libraryId || "").trim();
        if (libraryId) {
            const item = database.getUserLibraryFileById(req.user.id, libraryId);
            if (!item) return res.status(404).json({ ok:false, error:"La imagen no existe en tu biblioteca." });
            if (item.kind !== "images") return res.status(415).json({ ok:false, error:"Ese archivo no es una imagen." });
            const full = path.join(userLibraryDiskDir(req.user.id), item.storedName);
            if (!fs.existsSync(full)) return res.status(404).json({ ok:false, error:"El archivo de biblioteca no está disponible." });
            const image = { buffer: fs.readFileSync(full), contentType: item.mimeType || "image/jpeg" };
            const photo = savePermanentProfilePhoto(req.user.id, image, { source:"library", reference:item.id, label:item.name });
            io.to(`user:${req.user.id}`).emit("settings", database.getUserSettings(req.user.id));
            return res.json({ ok:true, photo });
        }

        const dataUrl = String(req.body?.dataUrl || "").trim();
        if (!dataUrl) return res.status(400).json({ ok: false, error: "No se recibió una imagen." });
        const image = dataUrlToImage(dataUrl);
        const source = String(req.body?.source || "local").toLowerCase();
        const reference = String(req.body?.reference || "local");
        const label = String(req.body?.label || "Archivo local");
        const photo = savePermanentProfilePhoto(req.user.id, image, { source, reference, label });
        io.to(`user:${req.user.id}`).emit("settings", database.getUserSettings(req.user.id));
        res.json({ ok: true, photo });
    } catch (error) {
        res.status(400).json({ ok: false, error: error?.message || "No se pudo guardar la foto." });
    }
});

app.delete("/api/profile-photo", requireUser, (req, res) => {
    try {
        const current = database.getUserSettings(req.user.id) || {};
        const photo = current.profilePhoto || {};
        if (String(photo.url || "").startsWith("/profile-photo/")) {
            const token = String(photo.url).split("/").pop();
            const ownerPart = String(req.user.id || "").replace(/[^A-Za-z0-9_-]/g, "_");
            const files = fs.readdirSync(PROFILE_PHOTO_DIR).filter(name => name.startsWith(`${ownerPart}_`) && name.includes(token));
            for (const file of files) { try { fs.unlinkSync(path.join(PROFILE_PHOTO_DIR, file)); } catch {} }
        }
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { profilePhoto: structuredClone(DEFAULT_SETTINGS.profilePhoto) }));
        database.saveUserSettings(req.user.id, merged);
        io.to(`user:${req.user.id}`).emit("settings", merged);
        res.json({ ok: true, photo: merged.profilePhoto });
    } catch (error) { res.status(500).json({ ok: false, error: error?.message || "No se pudo quitar la foto." }); }
});

app.get("/api/profile-photo/pending/:token", (req, res) => {
    const pending = pendingProfilePhotos.get(String(req.params.token || ""));
    if (!pending) return res.status(404).end();
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Type", pending.contentType || "image/jpeg");
    res.end(pending.buffer);
});

app.get("/profile-photo/:token", (req, res) => {
    const token = String(req.params.token || "").replace(/[^a-f0-9]/gi, "");
    if (!token) return res.status(404).end();
    const prefixFiles = fs.readdirSync(PROFILE_PHOTO_DIR).filter(name => name.includes(`_${token}.`));
    if (!prefixFiles.length) return res.status(404).end();
    const filePath = path.join(PROFILE_PHOTO_DIR, prefixFiles[0]);
    try {
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Content-Type", types[ext] || "application/octet-stream");
        fs.createReadStream(filePath).pipe(res);
    } catch { res.status(404).end(); }
});


app.post("/api/announcement-image", requireUser, (req, res) => {
    try {
        const dataUrl = String(req.body?.dataUrl || "").trim();
        if (!dataUrl) return res.status(400).json({ ok:false, error:"No se recibió una imagen." });
        const image = dataUrlToImage(dataUrl);
        if (image.buffer.length > ANNOUNCEMENT_IMAGE_MAX_BYTES) return res.status(400).json({ ok:false, error:"La imagen del anuncio supera el límite de 8 MB." });
        const url = savePermanentAnnouncementImage(req.user.id, image);
        res.json({ ok:true, url, size:image.buffer.length });
    } catch (error) {
        res.status(400).json({ ok:false, error:error?.message || "No se pudo guardar la imagen del anuncio." });
    }
});

app.get("/announcement-image/:token", (req, res) => {
    const token = String(req.params.token || "").replace(/[^a-f0-9]/gi, "");
    if (!token) return res.status(404).end();
    const files = fs.readdirSync(ANNOUNCEMENT_IMAGE_DIR).filter(name => name.includes(`_${token}.`));
    if (!files.length) return res.status(404).end();
    const filePath = path.join(ANNOUNCEMENT_IMAGE_DIR, files[0]);
    try {
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const types = { jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp", gif:"image/gif", avif:"image/avif" };
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Content-Type", types[ext] || "application/octet-stream");
        fs.createReadStream(filePath).pipe(res);
    } catch { res.status(404).end(); }
});

app.get("/api/user/settings", requireUser, (req, res) => {
    const own = migrateVoiceCustomFilterSettings(database.getUserSettings(req.user.id));
    if (own && Array.isArray(own.announcements)) own.announcements = normalizeAnnouncements(own.announcements);
    if (own?.voiceBot?.customFilterWords?.length && !(database.getUserSettings(req.user.id)?.voiceBot?.customFilterWords || []).length) {
        database.saveUserSettings(req.user.id, own);
    }
    res.json(deepMerge(structuredClone(DEFAULT_SETTINGS), own));
});

app.get("/api/overlay/key", requireUser, (req, res) => {
    res.json({ key: database.getOrCreateOverlayKey(req.user.id) });
});

app.put("/api/user/settings", requireUser, (req, res) => {
    const own = database.getUserSettings(req.user.id);
    const incoming = req.body && typeof req.body === "object" ? structuredClone(req.body) : {};
    if (Object.prototype.hasOwnProperty.call(incoming, "announcements")) incoming.announcements = normalizeAnnouncements(incoming.announcements);
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(own, incoming));
    merged.announcements = normalizeAnnouncements(merged.announcements);
    database.saveUserSettings(req.user.id, merged);
    io.to(`user:${req.user.id}`).emit("settings", merged);
    res.json(merged);
});

app.get("/api/announcement-draft", requireUser, (req, res) => {
    try {
        const settings = getSettingsForUser(req.user.id);
        res.json({ ok:true, draft: settings.announcementDraft ? normalizeAnnouncements([settings.announcementDraft])[0] : null });
    } catch (error) {
        res.status(500).json({ ok:false, error:error?.message || "No se pudo cargar el borrador del anuncio." });
    }
});

app.put("/api/announcement-draft", requireUser, (req, res) => {
    try {
        const draft = req.body?.draft && typeof req.body.draft === "object"
            ? normalizeAnnouncements([req.body.draft])[0] || null
            : null;
        const current = database.getUserSettings(req.user.id) || {};
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { announcementDraft: draft }));
        merged.announcementDraft = draft;
        database.saveUserSettings(req.user.id, merged);
        io.to(`user:${req.user.id}`).emit('announcementDraftSettings', draft);
        res.json({ ok:true, draft });
    } catch (error) {
        console.error("[announcement-draft:put]", error);
        res.status(500).json({ ok:false, error:error?.message || "No se pudo guardar el borrador del anuncio." });
    }
});

app.delete("/api/announcement-draft", requireUser, (req, res) => {
    try {
        const current = database.getUserSettings(req.user.id) || {};
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { announcementDraft: null }));
        merged.announcementDraft = null;
        database.saveUserSettings(req.user.id, merged);
        io.to(`user:${req.user.id}`).emit('announcementDraftSettings', null);
        res.json({ ok:true, draft:null });
    } catch (error) {
        console.error("[announcement-draft:delete]", error);
        res.status(500).json({ ok:false, error:error?.message || "No se pudo eliminar el borrador del anuncio." });
    }
});

app.get("/api/announcements", requireUser, (req, res) => {
    try {
        const settings = getSettingsForUser(req.user.id);
        res.json({ ok:true, announcements: normalizeAnnouncements(settings.announcements) });
    } catch (error) {
        res.status(500).json({ ok:false, error:error?.message || "No se pudieron cargar los anuncios." });
    }
});

app.put("/api/announcements", requireUser, (req, res) => {
    try {
        const announcements = normalizeAnnouncements(req.body?.announcements);
        const current = database.getUserSettings(req.user.id) || {};
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { announcements }));
        merged.announcements = announcements;
        database.saveUserSettings(req.user.id, merged);
        cleanupAnnouncementImages(req.user.id, announcements);
        const safe = sanitizeLiveOnlySettings(merged);
        io.to(`user:${req.user.id}`).emit("settings", safe);
        io.to(`user:${req.user.id}`).emit("announcementsSettings", announcements);
        res.json({ ok:true, announcements });
    } catch (error) {
        console.error("[announcements:put]", error);
        res.status(500).json({ ok:false, error:error?.message || "No se pudieron guardar los anuncios." });
    }
});

app.post("/api/user/background-image", requireUser, (req, res) => {
    try {
        const dataUrl = String(req.body?.dataUrl || "").trim();
        if (!dataUrl) return res.status(400).json({ ok:false, error:"No se recibió una imagen." });
        const image = dataUrlToImage(dataUrl);
        if (image.buffer.length > USER_BACKGROUND_MAX_BYTES) return res.status(400).json({ ok:false, error:"La imagen de fondo supera el límite de 6 MB." });
        const url = savePermanentUserBackground(req.user.id, image);
        const current = database.getUserSettings(req.user.id) || {};
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { appearance:{ ...(current.appearance||{}), backgroundImage:url } }));
        database.saveUserSettings(req.user.id, merged);
        io.to(`user:${req.user.id}`).emit("settings", merged);
        res.json({ ok:true, url });
    } catch (error) { res.status(400).json({ ok:false, error:error?.message || "No se pudo guardar el fondo." }); }
});

app.delete("/api/user/background-image", requireUser, (req, res) => {
    try {
        removeUserBackground(req.user.id);
        const current = database.getUserSettings(req.user.id) || {};
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { appearance:{ ...(current.appearance||{}), backgroundImage:"" } }));
        database.saveUserSettings(req.user.id, merged);
        io.to(`user:${req.user.id}`).emit("settings", merged);
        res.json({ ok:true });
    } catch (error) { res.status(500).json({ ok:false, error:error?.message || "No se pudo quitar el fondo." }); }
});

app.get("/background-image/:token", (req, res) => {
    const token = String(req.params.token || "").replace(/[^a-f0-9]/gi, "");
    if (!token) return res.status(404).end();
    const prefixFiles = fs.readdirSync(USER_BACKGROUND_DIR).filter(name => name.includes(`_${token}.`));
    if (!prefixFiles.length) return res.status(404).end();
    const filePath = path.join(USER_BACKGROUND_DIR, prefixFiles[0]);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    const ext = path.extname(filePath).toLowerCase();
    const types = {'.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
    res.setHeader('Cache-Control','private, max-age=86400');
    res.setHeader('Content-Type',types[ext]||'image/jpeg');
    res.sendFile(filePath);
});

app.get("/api/music/settings", requireUser, (req,res)=>{ res.json({ok:true,music:music.getMusicConfig(req.user.id)}); });
app.get("/api/music/diagnostics", requireUser, async (req,res)=>{
  try {
    const runtime=music.getMusicRuntimeStatus();
    let ytmusicapi=false; let version='';
    try {
      const { spawn } = await import('node:child_process');
      const py=String(process.env.PYTHON_BIN||runtime.pythonCommand||'python3');
      const result=await new Promise((resolve,reject)=>{
        const child=spawn(py,['-c','import ytmusicapi; print(getattr(ytmusicapi,"__version__","installed"))'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
        let stdout=''; let stderr='';
        const timer=setTimeout(()=>{try{child.kill('SIGKILL')}catch{};reject(new Error('Python tardó demasiado en responder.'));},5000);
        child.stdout.on('data',d=>stdout+=d.toString());
        child.stderr.on('data',d=>stderr+=d.toString());
        child.once('error',e=>{clearTimeout(timer);reject(e);});
        child.once('close',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(new Error(stderr.trim()||`Python terminó con código ${code}`));});
      });
      ytmusicapi=true; version=String(result.stdout||'').trim();
    } catch {}
    res.json({ok:true,...runtime,ytmusicapi,ytmusicapiVersion:version,youtubeApiKeyRequired:false,playback:'youtube-iframe'});
  } catch(e) {
    res.status(500).json({ok:false,error:e?.message||"No se pudo comprobar el motor de música."});
  }
});
app.put("/api/music/settings", requireUser, (req,res)=>{ try { const cfg=music.setMusicConfig(req.user.id, req.body?.music || req.body || {}); io.to(`user:${req.user.id}`).emit("musicSettings",cfg); res.json({ok:true,music:cfg}); } catch(e) { res.status(500).json({ok:false,error:e?.message||"No se pudo guardar Música."}); } });
app.post("/api/music/preview-track", requireUser, async (req,res)=>{ try { const query=String(req.body?.query||'').trim(); if(!query) return res.status(400).json({ok:false,error:'Escribe el nombre o URL de una canción.'}); const cfg=music.getMusicConfig(req.user.id); const track=await music.resolveMusicPreview(query,cfg.maxDurationSeconds); res.json({ok:true,track}); } catch(e) { res.status(400).json({ok:false,error:e?.message||'No se pudo obtener la canción.'}); } });
function resolveMusicOwner(req){
  if(req.user?.id) return String(req.user.id);
  const ownerId=String(req.query?.owner||req.body?.owner||'').trim();
  const overlayKey=String(req.query?.overlayKey||req.body?.overlayKey||'').trim();
  if(!ownerId||!overlayKey) return '';
  const owner=database.getUserByOverlayKey(overlayKey);
  return owner?.id && String(owner.id)===ownerId ? owner.id : '';
}
app.get("/api/music/playlist", (req,res)=>{ try{ const ownerId=resolveMusicOwner(req); if(!ownerId) return res.status(403).json({ok:false,error:'Overlay no autorizado.'}); res.json({ok:true,music:music.getPublicSnapshot(ownerId)}); }catch(e){res.status(500).json({ok:false,error:e?.message||'No se pudo cargar la playlist.'});} });
app.post("/api/music/playlist/add", async (req,res)=>{ try{ const ownerId=resolveMusicOwner(req); if(!ownerId) return res.status(403).json({ok:false,error:'Overlay no autorizado.'}); const query=String(req.body?.query||'').trim(); if(!query) return res.status(400).json({ok:false,error:'Escribe una canción o URL.'}); const state=await music.addPlaylistTrack(ownerId,query,'Panel de playlist',io); io.to(`user:${ownerId}`).emit('musicState',state); res.json({ok:true,music:state}); }catch(e){res.status(400).json({ok:false,error:e?.message||'No se pudo agregar la canción.'});} });
app.delete("/api/music/playlist/:trackId", (req,res)=>{ try{ const ownerId=resolveMusicOwner(req); if(!ownerId) return res.status(403).json({ok:false,error:'Overlay no autorizado.'}); const ok=music.removePlaylistTrack(ownerId,req.params.trackId,io); if(!ok) return res.status(404).json({ok:false,error:'Canción no encontrada.'}); res.json({ok:true,music:music.getPublicSnapshot(ownerId)}); }catch(e){res.status(400).json({ok:false,error:e?.message||'No se pudo eliminar la canción.'});} });
app.post("/api/music/playlist/reorder", (req,res)=>{ try{ const ownerId=resolveMusicOwner(req); if(!ownerId) return res.status(403).json({ok:false,error:'Overlay no autorizado.'}); const state=music.reorderPlaylistTrack(ownerId,req.body?.trackId,req.body?.targetIndex,io); res.json({ok:true,music:state}); }catch(e){res.status(400).json({ok:false,error:e?.message||'No se pudo reordenar la playlist.'});} });
app.post("/api/music/playlist/play/:trackId", (req,res)=>{ try{ const ownerId=resolveMusicOwner(req); if(!ownerId) return res.status(403).json({ok:false,error:'Overlay no autorizado.'}); const state=music.playTrack(ownerId,req.params.trackId,io); res.json({ok:true,music:state}); }catch(e){res.status(400).json({ok:false,error:e?.message||'No se pudo seleccionar la canción.'});} });
app.post("/api/music/playlist/clear-history", (req,res)=>{ try{ const ownerId=resolveMusicOwner(req); if(!ownerId) return res.status(403).json({ok:false,error:'Overlay no autorizado.'}); const state=music.clearHistory(ownerId,io); res.json({ok:true,music:state}); }catch(e){res.status(400).json({ok:false,error:e?.message||'No se pudo limpiar la playlist.'});} });
app.get("/music-overlay.html", (req,res)=>res.sendFile(path.join(__dirname,'Public','music-overlay.html')));
app.get("/music-playlist.html", (req,res)=>res.sendFile(path.join(__dirname,'Public','music-playlist.html')));

app.get("/api/points/widget", requireUser, (req, res) => {
    try {
        const cfg = points.getConfigForUser(req.user.id);
        res.json({ ok:true, widget: cfg.widget });
    } catch (error) {
        console.error("[points/widget:get]", error);
        res.status(500).json({ ok:false, error:error?.message || "No se pudo cargar el widget de puntos." });
    }
});

app.put("/api/points/widget", requireUser, (req, res) => {
    try {
        const current = points.getConfigForUser(req.user.id);
        const incoming = req.body && typeof req.body === "object" ? (req.body.widget ?? req.body) : {};
        const cfg = points.setConfigForUser(req.user.id, { ...current, widget: incoming || {} });
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), database.getUserSettings(req.user.id) || {});
        io.to(`user:${req.user.id}`).emit("settings", sanitizeLiveOnlySettings(merged));
        res.json({ ok:true, widget:cfg.widget });
    } catch (error) {
        console.error("[points/widget:put]", error);
        res.status(500).json({ ok:false, error:error?.message || "No se pudo guardar el widget de puntos." });
    }
});

app.get("/api/user/profanity-words", requireUser, (req, res) => {
    const settings = migrateVoiceCustomFilterSettings(database.getUserSettings(req.user.id) || {});
    const words = normalizeVoiceCustomFilterWords(settings?.voiceBot?.customFilterWords);
    res.json({ ok: true, customWords: words });
});

app.put("/api/user/profanity-words", requireUser, (req, res) => {
    // Backwards-compatible endpoint: old UI clients now write to the Chat Overlay
    // custom filter instead of mixing those words with the profanity catalog.
    const raw = Array.isArray(req.body?.customWords) ? req.body.customWords : [];
    const customWords = normalizeVoiceCustomFilterWords(raw);
    const settings = migrateVoiceCustomFilterSettings(database.getUserSettings(req.user.id) || {});
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(settings, { voiceBot: { customFilterWords } }));
    database.saveUserSettings(req.user.id, merged);
    io.to(`user:${req.user.id}`).emit("settings", merged);
    res.json({ ok: true, customWords });
});

app.get("/api/points/settings", requireUser, (req, res) => {
    res.json({ points: points.getConfigForUser(req.user.id) });
});

app.put("/api/points/settings", requireUser, (req, res) => {
    try {
        const incoming = (req.body && typeof req.body === "object") ? (req.body.points ?? req.body) : {};
        const cfg = points.setConfigForUser(req.user.id, incoming || {});
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), database.getUserSettings(req.user.id) || {});
        io.to(`user:${req.user.id}`).emit("settings", sanitizeLiveOnlySettings(merged));
        res.json({ ok:true, points: cfg });
    } catch (error) {
        console.error("[points/settings]", error);
        res.status(500).json({ ok:false, error: error?.message || "No se pudo guardar la configuración de puntos." });
    }
});

app.get("/api/points/leaderboard", requireUser, (req, res) => {
    const limit=Math.min(500,Math.max(1,Number(req.query.limit||100)||100));
    res.json({ users: database.listPointBalances(req.user.id, limit, req.query.q || '') });
});

app.get("/api/points/user", requireUser, async (req, res) => {
    const platform=String(req.query?.platform||'tiktok').toLowerCase()==='twitch'?'twitch':'tiktok';
    const username=String(req.query?.username||req.query?.uniqueId||'').trim().replace(/^@+/, '');
    if(!username) return res.status(400).json({error:'Escribe el usuario/uniqueId.'});

    // TikTok: la búsqueda es independiente del LIVE actual.
    // Reutilizamos exactamente la misma resolución pública que usa
    // Ajustes → Foto de perfil → TikTok / Moderadores, pero solo para
    // identificar al usuario y mostrar su avatar; nunca cambia la foto
    // de perfil de la cuenta.
    if(platform==='tiktok'){
        const existing=database.findViewerProfile(req.user.id,'tiktok',username);
        const account=database.getPoints(req.user.id, 'tiktok', username);
        let resolvedUsername=username;
        let displayName=existing?.displayName || account.displayName || username;
        let avatarUrl=existing?.avatarUrl || '';

        // Una vez que ya tenemos el perfil guardado, no repetimos la consulta externa
        // en cada polling del saldo. Solo resolvemos TikTok cuando todavía no existe
        // la identidad o falta el avatar.
        if(!existing || !avatarUrl){
            try {
                const publicProfile=await lookupPublicProfile('tiktok', username);
                resolvedUsername=String(publicProfile.username||username).trim().replace(/^@+/,'') || username;
                displayName=String(publicProfile.displayName||displayName||resolvedUsername).trim() || resolvedUsername;
                avatarUrl=String(publicProfile.avatarUrl||avatarUrl).trim();
            } catch (error) {
                if(!existing) return res.status(404).json({error:error?.message||'No se encontró ese usuario de TikTok.'});
            }
        }

        database.touchViewerProfile(req.user.id,'tiktok',resolvedUsername,displayName,avatarUrl);
        const fresh=database.findViewerProfile(req.user.id,'tiktok',resolvedUsername) || existing || {};
        const resolvedAccount=database.getPoints(req.user.id,'tiktok',resolvedUsername);
        return res.json({ ok:true, user:{ platform:'tiktok', username:fresh.username||resolvedUsername, displayName:fresh.displayName||displayName||resolvedUsername, avatarUrl:avatarUrl||fresh.avatarUrl||'', points:Number(resolvedAccount.points||0), totalEarned:Number(resolvedAccount.totalEarned||0), everDonated:Boolean(fresh.everDonated), followedBefore:Boolean(fresh.followedBefore), updatedAt:resolvedAccount.updatedAt||fresh.updatedAt||'' } });
    }

    // Twitch: no requiere que haya comentado previamente; el usuario se puede consultar por su canal.
    const account=database.getPoints(req.user.id, 'twitch', username);
    const viewer=database.findViewerProfile(req.user.id, 'twitch', username);
    const avatarUrl=viewer?.avatarUrl || await resolveTwitchAvatar(username).catch(()=>'' );
    const displayName=viewer?.displayName || account.displayName || username;
    if(!viewer && avatarUrl) database.touchViewerProfile(req.user.id,'twitch',username,displayName,avatarUrl);
    return res.json({ ok:true, user:{ platform:'twitch', username:account.username||username, displayName, avatarUrl, points:Number(account.points||0), totalEarned:Number(account.totalEarned||0), everDonated:Boolean(viewer?.everDonated), followedBefore:Boolean(viewer?.followedBefore), updatedAt:account.updatedAt||viewer?.updatedAt||'' } });
});

app.post("/api/points/user", requireUser, (req, res) => {
    const platform=String(req.body?.platform||'tiktok').toLowerCase()==='twitch'?'twitch':'tiktok';
    const username=String(req.body?.username||req.body?.uniqueId||'').trim().replace(/^@+/, '');
    const displayName=String(req.body?.displayName||username).trim() || username;
    const amount=Math.max(1,Math.min(100000000,Math.floor(Number(req.body?.amount)||0)));
    if(!username) return res.status(400).json({error:'Escribe el uniqueId/usuario.'});
    if(!amount) return res.status(400).json({error:'La cantidad de puntos debe ser mayor que 0.'});
    const account=database.addManualPoints(req.user.id, platform, username, displayName, amount);
    res.json({ok:true,account,message:`Puntos añadidos: +${amount}`});
});

app.delete("/api/points/user", requireUser, (req, res) => {
    const ok = database.deletePointBalance(req.user.id, req.body?.platform, req.body?.username);
    res.json({ ok });
});

app.get("/api/overlay/voicebot-settings", (req, res) => {
    const overlayKey = String(req.query?.overlayKey || "").trim();
    const owner = overlayKey ? database.getUserByOverlayKey(overlayKey) : null;
    if (!owner) return res.status(403).json({ error: "Overlay no autorizado." });
    const original = database.getUserSettings(owner.id) || {};
    const settings = migrateVoiceCustomFilterSettings(original);
    if (settings?.voiceBot?.customFilterWords?.length && !(original?.voiceBot?.customFilterWords || []).length) database.saveUserSettings(owner.id, settings);
    res.json({ voiceBot: settings.voiceBot || DEFAULT_SETTINGS.voiceBot, profanityFilter: settings.profanityFilter || DEFAULT_SETTINGS.profanityFilter, ownerId: owner.id });
});

app.put("/api/overlay/voicebot-settings", (req, res) => {
    const overlayKey = String(req.body?.overlayKey || "").trim();
    const owner = overlayKey ? database.getUserByOverlayKey(overlayKey) : null;
    if (!owner) return res.status(403).json({ error: "Overlay no autorizado." });
    const current = migrateVoiceCustomFilterSettings(database.getUserSettings(owner.id) || {});
    const incoming = req.body?.voiceBot && typeof req.body.voiceBot === "object" ? structuredClone(req.body.voiceBot) : {};
    incoming.customFilterWords = normalizeVoiceCustomFilterWords(incoming.customFilterWords);
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { voiceBot: incoming }));
    merged.voiceBot = merged.voiceBot || {};
    // El estado de activación del Bot de Voz es local a cada overlay; no lo persistimos en la cuenta.
    merged.voiceBot.enabled = false;
    // El estado de la sesión LIVE nunca se persiste.
    merged.voiceBot.lastMessageByUser = {};
    merged.voiceBot.seenEvents = {};
    merged.voiceBot.pendingByUser = {};
    database.saveUserSettings(owner.id, merged);
    io.to(`user:${owner.id}`).emit("settings", merged);
    io.to(`user:${owner.id}`).emit("voiceListSettings", merged.voiceList || DEFAULT_SETTINGS.voiceList);
    res.json({ ok: true, voiceBot: merged.voiceBot });
});

app.get("/api/voicebot/power-users", (req, res) => {
    const requestedOwner = String(req.query?.owner || '').trim();
    const overlayKey = String(req.query?.overlayKey || '').trim();
    let ownerId = req.user?.id || null;
    if (!ownerId && requestedOwner && overlayKey) {
        const owner = database.getUserByOverlayKey(overlayKey);
        if (owner?.id === requestedOwner) ownerId = owner.id;
    }
    if (!ownerId) return res.status(403).json({ error:'No autorizado.' });
    const settings = database.getUserSettings(ownerId) || {};
    const power = settings?.voiceBot?.power || {};
    const tiktokUsers = liveSession.getPowerUsers(ownerId, 'tiktok');
    const twitchUsers = liveSession.getPowerUsers(ownerId, 'twitch');
    res.json({ powerUsers: [...tiktokUsers, ...twitchUsers], power });
});


app.get("/api/moderators/lookup", requireUser, async (req, res) => {
    try {
        const platform = String(req.query.platform || "tiktok").toLowerCase() === "twitch" ? "twitch" : "tiktok";
        const username = String(req.query.username || "").trim();
        if (!username) return res.status(400).json({ error: "Escribe un usuario para buscar." });
        const profile = await lookupPublicProfile(platform, username);
        res.json({ ok: true, profile });
    } catch (error) {
        res.status(404).json({ ok: false, error: error?.message || "No se encontró el perfil." });
    }
});


app.get("/api/avatar", async (req, res) => {
    const platform = String(req.query.platform || "").toLowerCase();
    const username = cleanUser(req.query.username);

    if (!username) {
        return res.status(400).json({
            avatarUrl: "",
            platform,
            username: "",
            source: "none",
        });
    }

    let avatarUrl = "";
    let source = "fallback";

    if (platform === "twitch") {
        avatarUrl = await resolveTwitchAvatar(username);
        source = avatarUrl ? "twitch" : "fallback";
    } else if (platform === "tiktok") {
        avatarUrl = await resolveTiktokAvatar(username);
        source = avatarUrl ? "tiktok" : "fallback";
    }

    res.json({
        avatarUrl: /^https?:\/\//i.test(String(avatarUrl || "")) ? avatarUrl : "",
        platform,
        username,
        source: avatarUrl ? source : "none",
    });
});


async function fishFetchJson(pathname, { query = {}, method = "GET", body = null } = {}) {
    if (!FISH_AUDIO_API_KEY) {
        throw new Error("Falta FISH_AUDIO_API_KEY en el servidor.");
    }

    const url = new URL(`https://api.fish.audio${pathname}`);
    for (const [key, value] of Object.entries(query || {})) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    const headers = {
        Authorization: `Bearer ${FISH_AUDIO_API_KEY}`,
    };

    const options = { method, headers };
    if (body !== null && body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "application/json";
    const raw = await response.text();

    let parsed = null;
    if (contentType.includes("application/json") || raw.trim().startsWith("{")) {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }

    return {
        ok: response.ok,
        status: response.status,
        contentType,
        raw,
        json: parsed,
    };
}

function publicOwnerUserId(req) {
    const owner = String(req.query?.owner || "").trim();
    return owner && database.getUserById(owner) ? owner : null;
}

function getSettingsForUser(userId) {
    if (!userId) return getMergedSettings();
    return deepMerge(structuredClone(DEFAULT_SETTINGS), database.getUserSettings(userId));
}


function saveConnectionProfile(ownerId, platform, profile = {}) {
    const owner = String(ownerId || "").trim();
    const key = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    if (!owner) return null;
    const current = database.getUserSettings(owner) || {};
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), current);
    merged.connectionProfiles = merged.connectionProfiles || { tiktok: { username: "", avatarUrl: "" }, twitch: { username: "", avatarUrl: "" } };
    merged.connectionProfiles[key] = {
        ...(merged.connectionProfiles[key] || {}),
        username: String(profile.username || merged.connectionProfiles[key]?.username || "").trim(),
        avatarUrl: String(profile.avatarUrl || merged.connectionProfiles[key]?.avatarUrl || "").trim(),
    };
    database.saveUserSettings(owner, merged);
    io.to(`user:${owner}`).emit("settings", merged);
    return merged.connectionProfiles[key];
}

function getSavedConnectionProfile(ownerId, platform) {
    const key = String(platform || "").toLowerCase() === "twitch" ? "twitch" : "tiktok";
    const settings = ownerId ? getSettingsForUser(ownerId) : DEFAULT_SETTINGS;
    return { ...(settings.connectionProfiles?.[key] || {}) };
}

function normalizeVoiceListSettingsForStorage(input = {}) {
    const out = structuredClone(input || {});
    const axis = String(out.axis || out.direction || "vertical").toLowerCase() === "horizontal" ? "horizontal" : "vertical";
    out.axis = axis;
    out.direction = axis;
    if (axis === "horizontal") {
        if (!["top","center","bottom"].includes(String(out.horizontalPosition || ""))) {
            const legacy = String(out.listPosition || "center");
            out.horizontalPosition = legacy === "left" ? "top" : legacy === "right" ? "bottom" : "center";
        }
        out.horizontalPosition = ["top","center","bottom"].includes(String(out.horizontalPosition || "")) ? out.horizontalPosition : "center";
    } else {
        out.listPosition = ["left","center","right"].includes(String(out.listPosition || "")) ? out.listPosition : "center";
    }
    return out;
}

app.get("/api/voice-list/settings", (req, res) => {
    const userId = req.user?.id || publicOwnerUserId(req);
    const settings = getSettingsForUser(userId);
    res.json({ voiceList: settings.voiceList || DEFAULT_SETTINGS.voiceList });
});

app.put("/api/voice-list/settings", requireUser, (req, res) => {
    const userId = req.user.id;
    const current = database.getUserSettings(userId) || {};
    const incoming = normalizeVoiceListSettingsForStorage(req.body && typeof req.body === "object" ? req.body : {});
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, { voiceList: incoming }));
    merged.voiceList = normalizeVoiceListSettingsForStorage(merged.voiceList || DEFAULT_SETTINGS.voiceList);
    database.saveUserSettings(userId, merged);
    const safe = sanitizeLiveOnlySettings(merged);
    io.to(`user:${userId}`).emit("settings", safe);
    io.to(`user:${userId}`).emit("voiceListSettings", merged.voiceList || DEFAULT_SETTINGS.voiceList);
    res.json({ ok: true, voiceList: merged.voiceList || DEFAULT_SETTINGS.voiceList });
});

app.get("/api/user/voices", requireUser, (req, res) => {
    const voices = database.listUserVoices(req.user.id);
    setCustomVoiceRules(req.user.id, voices);
    res.json({ voices });
});

app.post("/api/user/voices", requireUser, (req, res) => {
    try {
        const input = req.body || {};
        const fishId = String(input.fishId || input.id || "").trim();
        if (!fishId) return res.status(400).json({ error: "Escribe el ID de Fish Audio." });
        const voice = database.upsertUserVoice(req.user.id, {
            fishId,
            label: input.label || input.name || fishId,
            author: input.author || "",
            description: input.description || "",
            imageUrl: input.imageUrl || input.avatarUrl || "",
            tags: input.tags || [],
        });
        const voices = database.listUserVoices(req.user.id);
        setCustomVoiceRules(req.user.id, voices);
        io.to(`user:${req.user.id}`).emit('voiceLibrary', { voices, updatedAt: Date.now() });
        res.status(201).json({ voice });
    } catch (error) {
        res.status(400).json({ error: error?.message || "No se pudo guardar la voz." });
    }
});

app.delete("/api/user/voices/:fishId", requireUser, (req, res) => {
    const ok = database.deleteUserVoice(req.user.id, req.params.fishId);
    if (!ok) return res.status(404).json({ error: "Voz no encontrada." });
    const voices = database.listUserVoices(req.user.id);
    setCustomVoiceRules(req.user.id, voices);
    io.to(`user:${req.user.id}`).emit('voiceLibrary', { voices, updatedAt: Date.now() });
    res.status(204).end();
});

app.get("/api/voices/search", requireUser, async (req, res) => {
    try {
        const query = String(req.query.q || req.query.title || "").trim();
        if (!query) return res.json({ voices: [] });
        if (!FISH_AUDIO_API_KEY) return res.json({ voices: [] });
        const result = await fishFetchJson("/model", { query: { page_size: 20, page_number: 1, title: query, sort_by: "score" } });
        const items = Array.isArray(result.json?.items) ? result.json.items : [];
        res.json({ voices: items.map((item) => ({ id: item._id || item.id || "", label: item.title || item.name || item._id || "Voz", author: item.author?.nickname || item.author?.name || "", description: item.description || "", imageUrl: item.image || item.cover || "" })).filter((x) => x.id) });
    } catch (error) {
        res.json({ voices: [], error: error?.message || "No se pudo buscar en Fish Audio." });
    }
});

app.get("/api/voices/catalog", (req, res) => {
    try {
        const catalogPath = path.join(__dirname, "Public", "data", "voice-catalog.json");
        const base = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
        const requestedOwner = String(req.query?.owner || "").trim();
        const overlayKey = String(req.query?.overlayKey || "").trim();
        let ownerId = req.user?.id || null;
        if (!ownerId && requestedOwner && overlayKey) {
            const owner = database.getUserByOverlayKey(overlayKey);
            if (owner?.id === requestedOwner) ownerId = owner.id;
        }
        if (!ownerId) ownerId = requestedOwner ? null : null;
        const custom = ownerId ? database.listUserVoices(ownerId) : [];
        const globalMatchers = new Map((VOICE_RULE_MATCHERS || []).map((rule) => [String(rule.voiceLabel || "").trim().toLowerCase(), rule]));
        const voices = Array.isArray(base?.voices) ? base.voices.map((v) => {
            const label = String(v.label || v.name || v.id || "Voz").trim();
            const matcher = globalMatchers.get(label.toLowerCase());
            const aliases = Array.from(new Set([
                ...(Array.isArray(v.aliases) ? v.aliases : []),
                ...(Array.isArray(v.tags) ? v.tags : []),
                ...(Array.isArray(matcher?.aliases) ? matcher.aliases : []),
            ].map((x) => String(x || "").trim()).filter(Boolean)));
            return {
                ...v, library: "streamfusion", fishId: v.fishId || v.id || "",
                tags: aliases, aliases,
            };
        }) : [];
        for (const v of custom) {
            const key = `fish:${v.fishId}`;
            const existing = voices.findIndex((x) => String(x.key || "") === key);
            const item = {
                key, id: v.fishId, fishId: v.fishId, label: v.label, author: v.author, description: v.description, image: v.imageUrl, tags: v.tags || [],
                library: "fish", referenceId: v.fishId,
            };
            if (existing >= 0) voices[existing] = item; else voices.push(item);
        }
        res.json({ voices });
    } catch (error) {
        res.status(500).json({ error: error?.message || "No se pudo cargar el catálogo." });
    }
});

app.get("/api/realtime-voice/status", async (req, res) => {
    let voiceCount = 0;
    let apiReachable = false;

    if (FISH_AUDIO_API_KEY) {
        try {
            const check = await fishFetchJson("/model", { query: { page_size: 1, page_number: 1 } });
            apiReachable = check.ok;
            voiceCount = Number(check.json?.total || check.json?.items?.length || 0) || 0;
        } catch {
            apiReachable = false;
        }
    }

    res.json({
        online: true,
        apiKeyConfigured: Boolean(FISH_AUDIO_API_KEY),
        apiReachable,
        voiceCount,
        model: FISH_AUDIO_MODEL,
        ttsEndpoint: "/api/voicebot/tts",
        asrEndpoint: null,
        voicesEndpoint: "/api/realtime-voice/voices",
        voiceChangerWsUrl: FISH_AUDIO_VOICE_CHANGER_WS,
        browserSinkId: true,
        recognition: "web",
    });
});

app.get("/api/realtime-voice/voices", async (req, res) => {
    try {
        if (!FISH_AUDIO_API_KEY) {
            return res.status(500).json({ error: "Falta FISH_AUDIO_API_KEY en el servidor." });
        }

        const all = String(req.query.all || "0").toLowerCase() === "1" || String(req.query.all || "").toLowerCase() === "true";
        const baseQuery = {
            page_size: Math.min(Math.max(Number(req.query.page_size || 100) || 100, 1), 100),
            page_number: Math.max(Number(req.query.page_number || 1) || 1, 1),
            title: String(req.query.title || "").trim(),
            tag: String(req.query.tag || "").trim(),
            self: String(req.query.self || "false"),
            author_id: String(req.query.author_id || "").trim(),
            language: String(req.query.language || "").trim(),
            title_language: String(req.query.title_language || "").trim(),
            sort_by: String(req.query.sort_by || "score").trim(),
        };

        if (!all) {
            const result = await fishFetchJson("/model", { query: baseQuery });
            return res.status(result.status).json(result.json || { error: result.raw });
        }

        const items = [];
        const seen = new Set();
        let page = baseQuery.page_number;
        let hasMore = true;
        let lastTotal = 0;

        while (hasMore && page < 20) {
            const result = await fishFetchJson("/model", { query: { ...baseQuery, page_number: page } });
            if (!result.ok) return res.status(result.status).json(result.json || { error: result.raw });
            const payload = result.json || {};
            lastTotal = Number(payload.total || lastTotal || 0) || 0;
            for (const item of payload.items || []) {
                if (!item?._id || seen.has(item._id)) continue;
                seen.add(item._id);
                items.push(item);
            }
            hasMore = Boolean(payload.has_more);
            page += 1;
            if (!payload.items?.length) break;
        }

        return res.json({
            total: lastTotal || items.length,
            items,
            has_more: false,
            loaded_all: true,
        });
    } catch (err) {
        return res.status(500).json({ error: err?.message || "No se pudieron cargar las voces." });
    }
});

app.post("/api/voicebot/asr", async (req, res) => {
    try {
        if (!FISH_AUDIO_API_KEY) {
            return res.status(500).json({ error: "Falta FISH_AUDIO_API_KEY en el servidor." });
        }

        const audioBase64 = String(req.body?.audioBase64 || "").replace(/^data:[^;]+;base64,/, "");
        const mimeType = String(req.body?.mimeType || "audio/webm");
        const language = String(req.body?.language || "es").trim();
        const ignoreTimestamps = req.body?.ignore_timestamps !== false;

        if (!audioBase64) {
            return res.status(400).json({ error: "Falta el audio." });
        }

        const audioBuffer = Buffer.from(audioBase64, "base64");
        const form = new FormData();
        form.append("audio", new Blob([audioBuffer], { type: mimeType }), `chunk.${mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm"}`);
        if (language) form.append("language", language);
        form.append("ignore_timestamps", String(Boolean(ignoreTimestamps)));

        const fishRes = await fetch("https://api.fish.audio/v1/asr", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${FISH_AUDIO_API_KEY}`,
            },
            body: form,
        });

        const data = await fishRes.json().catch(() => ({}));
        if (fishRes.status === 402) {
            return res.status(402).json({
                error: data?.error || "Fish Audio devolvió 402 Payment Required para ASR. Revisa créditos, plan o permisos de tu cuenta.",
                details: data,
            });
        }
        return res.status(fishRes.status).json(data);
    } catch (err) {
        return res.status(500).json({ error: err?.message || "No se pudo transcribir el audio." });
    }
});


function normalizeVoiceSpoofText(text) {
    return stripDiacriticsPreservingEnye(text)
        .toLowerCase()
        .replace(/[0]/g, "o")
        .replace(/[1!|]/g, "i")
        .replace(/[2]/g, "z")
        .replace(/[3]/g, "e")
        .replace(/[4@]/g, "a")
        .replace(/[5$]/g, "s")
        .replace(/[6]/g, "g")
        .replace(/[7]/g, "t")
        .replace(/[8]/g, "b")
        .replace(/[9]/g, "g")
        .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function stripDiacriticsPreservingEnye(value) {
    const raw = String(value || "");
    if (!raw) return "";
    const lower = "__STREAMFUSION_ENYE_LOWER__";
    const upper = "__STREAMFUSION_ENYE_UPPER__";
    return raw
        .replace(/ñ/g, lower)
        .replace(/Ñ/g, upper)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(new RegExp(lower, "g"), "ñ")
        .replace(new RegExp(upper, "g"), "Ñ");
}


function buildProfanityFilterRegex() {
    const badWords = [
        "mierda", "mierdas", "mierdero", "mierderos", "mierdoso", "mierdosa", "mierd", "mrd", "mierda seca",
        "puta", "puta madre", "puto", "putos", "putas", "putísima", "putisima",
        "phuta", "phutha", "putha", "phuto", "phutho", "putho",
        "cabron", "cabrona", "cabrones", "cabronazo", "cabroncete",
        "coño", "cojon", "cojones", "coñazo", "coñito",
        "joder", "jodido", "jodida", "jodón", "jodona", "jodete",
        "chingar", "chingada", "chingado", "chingón", "chingona",
        "pendejo", "pendeja", "pendejazo", "pendejita",
        "mariquita", "marikita", "mariqta", "marica", "mariko", "marico", "maricon", "maricón", "marikon", "marikón", "marik", "maric", "marikhon", "mari khon", "maric hon", "mari con",
        "gay", "gey", "gei", "gai", "ghey", "ghei",
        "cachar", "kachar", "ca char", "ka char", "ca-char", "ka-char", "cchar", "kchar", "ch char", "ch-char",
        "verga", "vergon", "vergón", "vergota", "vergudo", "pinga", "gampi", "ganpi", "culo", "culero", "culera",
        "cagar", "cagada", "cagon", "cagón",
        "imbecil", "imbécil", "idiota", "gilipollas", "hijo de puta", "hijodeputa", "hijoputa",
        "hdp", "hp", "mrd", "pn", "phenhe", "violar", "zhemen", "cmen", "zemen", "semen",
        "maricon", "maricón", "marica", "mariko", "marik", "maricao", "putero", "mamon", "mamón",
        "estupido", "estúpido", "tarado", "subnormal", "mongol", "boludo", "boluda", "pelotudo", "pelotuda",
        "huevon", "huevona", "huevones", "huevonazo", "huevada", "huevadas", "weon", "weona", "weá", "wea", "weón", "wey", "guey", "güey", "webon", "webona", "webón",
        "zorra", "perra", "bitch", "fuck", "shit", "asshole",
        "coji", "cojí", "cojer", "coger", "cogi", "cogí", "cogida", "cogido", "cogeme", "cógeme",
        "teta", "tetas", "vagina", "vaginas", "pene", "penetrar", "penetracion", "penetración", "sexo", "sexual",
        "malparido", "malparida", "malparío", "malparia", "chupamela", "chupamelo", "chupame", "mamamela", "mamamelo", "mamame",
        "conchetumadre", "conchasumadre", "conchesumadre", "conchetumare", "conchatumadre",
        "qlo", "qliao", "ctmre", "csmre", "csmr", "ctmr", "ptm", "ptmr", "pta",
  "pito",
  "pene",
  "nepe",
  "pinga",
  "piho",
  "phito",
  "phinga",
  "culo",
  "culos",
  "culitos",
  "culero",
  "culera",
  "culiao",
  "culiada",
  "culh0",
  "culho",
  "teta",
  "tetas",
  "pezon",
  "pezones",
  "teton",
  "tetona",
  "tetonas",
  "vagina",
  "vaginas",
  "vulva",
  "clitoris",
  "clit",
  "anal",
  "ano",
  "ahno",
  "porno",
  "pornografia",
  "pornográfico",
  "pornografico",
  "pornhub",
  "sexo",
  "sexual",
  "semen",
  "masturbar",
  "masturbacion",
  "masturbación",
  "puta",
  "puto",
  "putos",
  "putas",
  "putísima",
  "putisima",
  "put4",
  "put0",
  "phuta",
  "phutha",
  "putha",
  "phuto",
  "phutho",
  "putho",
  "phu tha",
  "pu tha",
  "phu-tha",
  "pu-tha",
  "verga",
  "vergas",
  "vergon",
  "vergón",
  "vergota",
  "vergudo",
  "vrga",
  "v3rga",
  "verg4",
  "vergha",
  "v3rg4",
  "cabro",
  "cabrona",
  "cabrones",
  "cabron",
  "cabronazo",
  "cabroncete",
  "kbro",
  "ca bro",
  "c a b r o",
  "k bro",
  "marica",
  "marico",
  "maricon",
  "maricón",
  "marikon",
  "marik",
  "maric",
  "marikhon",
  "mariquita",
  "marikita",
  "mariqta",
  "mari khon",
  "mari k",
  "mari-k",
  "mari con",
  "mari c on",
  "maricona",
  "mariconazo",
  "gay",
  "gey",
  "gei",
  "gai",
  "ghey",
  "ghei",
  "g4y",
  "g3y",
  "weon",
  "weona",
  "weón",
  "weá",
  "wea",
  "webon",
  "webona",
  "webón",
  "wueon",
  "wueona",
  "guey",
  "güey",
  "guei",
  "güei",
  "huevon",
  "huevón",
  "huevona",
  "huevones",
  "huevonazo",
  "huevada",
  "huevadas",
  "pendejo",
  "pendeja",
  "pendejos",
  "pendejas",
  "pendejazo",
  "pendejita",
  "pinche",
  "pinchis",
  "pajero",
  "pajera",
  "pajear",
  "pajazo",
  "pelotudo",
  "pelotuda",
  "boludo",
  "boluda",
  "forro",
  "gilipollas",
  "capullo",
  "idiota",
  "imbecil",
  "imbécil",
  "tarado",
  "tarada",
  "baboso",
  "babosa",
  "subnormal",
  "mongol",
  "mierda",
  "mierdas",
  "mierdero",
  "mierderos",
  "mierdoso",
  "mierdosa",
  "mierd",
  "mrd",
  "mierda seca",
  "mierd4",
  "mi3rda",
  "m1erda",
  "m13rda",
  "mierdha",
  "cagar",
  "cagada",
  "cagado",
  "cagon",
  "cagón",
  "cagona",
  "chingar",
  "chingada",
  "chingado",
  "chingon",
  "chingón",
  "chingona",
  "ching4r",
  "chingad0",
  "joder",
  "jodido",
  "jodida",
  "jodón",
  "jodona",
  "jodete",
  "coño",
  "cojon",
  "cojones",
  "coñazo",
  "coñito",
  "cojudo",
  "cojuda",
  "gonorrea",
  "malparido",
  "malparida",
  "malparío",
  "malparia",
  "pirobo",
  "careverga",
  "careculo",
  "carepinga",
  "caremonda",
  "hdp",
  "hp",
  "ctm",
  "ctmr",
  "csm",
  "csmr",
  "ctmre",
  "csmre",
  "tmr",
  "ptm",
  "ptmr",
  "pta",
  "qlo",
  "qliao",
  "hijoputa",
  "hijo de puta",
  "hijodeputa",
  "hijueputa",
  "bitch",
  "fuck",
  "shit",
  "asshole",
  "chucha",
  "chucha madre",
  "chuchamadre",
  "chuchetu mare",
  "chu che tu mare",
  "con che tu mare",
  "conche tu mare",
  "conchetumadre",
  "conchetumare",
  "conchasumadre",
  "conchesumadre",
  "conchetu madre",
  "concha de tu madre",
  "concha tu madre",
  "violar",
  "coger",
  "cojer",
  "cogi",
  "coji",
  "cogido",
  "cogida",
  "cogeme",
  "cógeme",
  "mamon",
  "mamón",
  "mamada",
  "mamame",
,
        'byolar',
        'b.iolar',
        'b yolar',
        'bhyolar',
        'b-yolar',
        'b_yolar',
        'b y o l a r',
        'b.y.o.l.a.r',
        'violar',
        'biolar',
        'v i o l a r',
        'v.i.o.l.a.r',
        'v-yolar',
        'v_yolar',
        'vhyolar',
        'coji',
        'cojí',
        'cojer',
        'cojerse',
        'cojiendo',
        'cojido',
        'cojida',
        'cojan',
        'cojas',
        'cojo',
        'coja',
        'cogi',
        'cogí',
        'coger',
        'cogerse',
        'cogiendo',
        'cogido',
        'cogida',
        'cogeme',
        'cógeme',
        'kche',
        'kches',
        'kchar',
        'kchao',
        'kcharse',
        'kchando',
        'kchado',
        'kchada',
        'cchar',
        'cchao',
        'ccharse',
        'chchar',
              'carajo',
        'carajos',
        'carajito',
        'carajita',
        'carajazo',
        'carajear',
        'chingada madre',
        'chingadamadre',
        'chingadazo',
        'chingadera',
        'chingaderas',
        'chingón',
        'chingona',
        'chingon',
        'chingar',
        'chingue',
        'chingues',
        'chinga',
        'chingas',
        'chingado',
        'chingada',
        'chingados',
        'chingadas',
        'no mames',
        'nomames',
        'mames',
        'mamada',
        'mamadas',
        'mamon',
        'mamón',
        'mamona',
        'mamones',
        'pinche',
        'pinches',
        'pinchi',
        'pinchis',
        'pinche wey',
        'pinchewey',
        'pinche pendejo',
        'pinchependejo',
        'putamadre',
        'puta madre',
        'putazo',
        'putazos',
        'putiza',
        'putizas',
        'putear',
        'puteando',
        'puteo',
        'putero',
        'putera',
        'putón',
        'putona',
        'putones',
        'putonas',
        'putísimo',
        'putisima',
        'putisimo',
        'cabrón',
        'cabrona',
        'cabrones',
        'cabronazo',
        'cabronazos',
        'cabronería',
        'cabroneria',
        'cabronear',
        'cabrón de mierda',
        'cabron de mierda',
        'pendejo',
        'pendeja',
        'pendejos',
        'pendejas',
        'pendejez',
        'pendejada',
        'pendejadas',
        'pendejear',
        'pendejito',
        'pendejita',
        'pendejazo',
        'pendejazos',
        'culero',
        'culera',
        'culeros',
        'culeras',
        'culiado',
        'culiada',
        'culiaos',
        'culiadas',
        'culiao',
        'culiar',
        'culiando',
        'culiadito',
        'culiadita',
        'culo',
        'culos',
        'culote',
        'culotes',
        'culón',
        'culona',
        'verga',
        'vergas',
        'vergazo',
        'vergazos',
        'vergota',
        'vergotas',
        'vergudo',
        'verguero',
        'verguera',
        'vergüenza',
        'vale verga',
        'valeverga',
        'me vale verga',
        'mevaleverga',
        'a la verga',
        'alaverga',
        'pinga',
        'pingazo',
        'pingazos',
        'pingón',
        'pingona',
        'pito',
        'pitos',
        'pichula',
        'pichulazo',
        'pichulear',
        'pija',
        'pijas',
        'pijazo',
        'pijazos',
        'pijudo',
        'pijuda',
        'concha',
        'conchudo',
        'conchuda',
        'conchudos',
        'conchudas',
        'conchatumadre',
        'conchetumadre',
        'conchetumare',
        'conchesumadre',
        'conchasumadre',
        'concha de tu madre',
        'conchadetumadre',
        'chucha',
        'chuchamadre',
        'chucha madre',
        'chuchatumadre',
        'chuchetumadre',
        'chuchetu madre',
        'chucha tu madre',
        'gonorrea',
        'gonorreas',
        'gonorreo',
        'gonorrea hijueputa',
        'pirobo',
        'piroba',
        'pirobo hijueputa',
        'malparido',
        'malparida',
        'malparidos',
        'malparidas',
        'malparición',
        'malparicion',
        'hijueputa',
        'hijueputas',
        'hijueputada',
        'hijoputa',
        'hijos de puta',
        'hijodeputa',
        'hijo de puta',
        'hijuepucha',
        'maricón',
        'maricon',
        'marica',
        'marico',
        'maricas',
        'maricos',
        'maricona',
        'mariconazo',
        'mariconazos',
        'marikón',
        'marikon',
        'mariko',
        'marik',
        'mariquita',
        'marikita',
        'mariqta',
        'boludo',
        'boluda',
        'boludos',
        'boludas',
        'pelotudo',
        'pelotuda',
        'pelotudos',
        'pelotudas',
        'pelotudez',
        'pelotudear',
        'forro',
        'forra',
        'forros',
        'forras',
        'orto',
        'ortudo',
        'ortuda',
        'ortear',
        'la puta que te parió',
        'la puta que te pario',
        'weon',
        'weona',
        'weones',
        'weonas',
        'weón',
        'weónazo',
        'weonazo',
        'webon',
        'webona',
        'webones',
        'webonazo',
        'huevon',
        'huevón',
        'huevona',
        'huevones',
        'huevada',
        'huevadas',
        'huevonazo',
        'huevonazos',
        'huevear',
        'hueveando',
        'hueveo',
        'joder',
        'jodido',
        'jodida',
        'jodidos',
        'jodidas',
        'jodete',
        'jodanse',
        'jódete',
        'no jodas',
        'nojodas',
        'jodón',
        'jodona',
        'jodones',
        'mierda',
        'mierdas',
        'mierdero',
        'mierdera',
        'mierderos',
        'mierderas',
        'mierdoso',
        'mierdosa',
        'mierdón',
        'mierdon',
        'mierdazo',
        'mierdazos',
        'mierdada',
        'mierdadas',
        'mierd4',
        'mi3rda',
        'm1erda',
        'm13rda',
        'mierdha',
        'mrd',
        'mrdas',
        'mrdazo',
        'cagada',
        'cagadas',
        'cagado',
        'cagón',
        'cagona',
        'cagones',
        'cagonas',
        'cagar',
        'cagarse',
        'cagando',
        'cago',
        'cague',
        'cagues',
        'cagón de mierda',
        'cagon de mierda',
        'pajero',
        'pajera',
        'pajeros',
        'pajeras',
        'pajazo',
        'pajazos',
        'pajear',
        'pajeando',
        'pajeo',
        'pajas',
        'pajita',
        'pajitas',
        'idiota',
        'idiotas',
        'imbecil',
        'imbécil',
        'imbeciles',
        'imbéciles',
        'estupido',
        'estúpido',
        'estupida',
        'estúpida',
        'estupidos',
        'estúpidos',
        'tarado',
        'tarada',
        'tarados',
        'taradas',
        'baboso',
        'babosa',
        'babosos',
        'babosas',
                                'bruto',
        'bruta',
        'brutos',
        'brutas',
        'zoquete',
        'zoquetes',
        'majadero',
        'majadera',
        'menso',
        'mensa',
        'mensos',
        'mensas',
        'sonso',
        'sonsa',
        'zorra',
        'zorras',
        'perra',
        'perras',
        'perra maldita',
        'perramaldita',
        'maldita',
        'maldito',
        'malditos',
        'malditas',
        'desgraciado',
        'desgraciada',
        'desgraciados',
        'desgraciadas',
        'bastardo',
        'bastarda',
        'bastardos',
        'bastardas',
        'ctm',
        'ctmr',
        'ctmre',
        'csm',
        'csmr',
        'csmre',
        'tmr',
        'ptm',
        'ptmr',
        'pta',
        'qlo',
        'qliao',
        'qlia',
        'hdp',
        'hp',
        'hpt',
        'hpta',
        'nmm',
        'nmms',
        'ntp',
        ...PROFANITY_EXTRA,
    ];
    const makePattern = (word) => {
        const normalized = normalizeVoiceSpoofText(word).trim().replace(/\s+/g, " ");
        if (!normalized) return "";
        const collapsed = normalized.replace(/\s+/g, "");
        const spoofClass = (ch) => {
            const table = { a:"a4@", e:"e3", i:"i1!|", o:"o0", s:"s5$", t:"t7", b:"b8", g:"g69", z:"z2" };
            const raw = table[ch] || ch;
            const unique = [...new Set(raw.split(""))].join("");
            if (unique.length === 1) return unique.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
            return `[${unique.replace(/[-\\^\]\[]/g, "\\$&")}]`;
        };
        const core = normalized
            .split(" ")
            .filter(Boolean)
            .map((piece) => piece
                .split("")
                .map((ch, index, arr) => {
                    const safe = spoofClass(ch);
                    return index < arr.length - 1
                        ? `${safe}+[\\s._-]*(?:h+[\\s._-]*)?`
                        : `${safe}+`;
                })
                .join(""))
            .join("[\\s._-]+");
        return collapsed.length <= 4
            ? `(^|[^\\p{L}\\p{N}])(?:${core})(?=$|[^\\p{L}\\p{N}])`
            : `(?:${core})`;
    };
    const parts = [...new Set(badWords.map(makePattern).filter(Boolean))];
    return parts.length ? new RegExp(parts.join("|"), "giu") : null;
}

const VOICE_PROFANITY_RE = buildProfanityFilterRegex();
const VOICE_PROFANITY_RE_CACHE = new Map();

function getVoiceProfanityRegex() {
    return VOICE_PROFANITY_RE;
}

function censorVoiceProfanity(text, ownerId = "") {
    const source = String(text || "");
    const regex = getVoiceProfanityRegex(ownerId);
    if (!source || !regex) return source;
    let out = stripDiacriticsPreservingEnye(source);
    out = out.replace(regex, " ");
    out = out.replace(/\s+/g, " ").trim();
    return out;
}

const VOICE_EXPRESSION_CATALOG = {
    s: { emotion: "singing", marker: "[singing]" },
    a: { emotion: "angry", marker: "[angry]" },
    w: { emotion: "whispering", marker: "[whispering]" },
    g: { emotion: "laughing", marker: "[laughing]" },
    l: { emotion: "laughing", marker: "[laughing]" },
    e: { emotion: "excited", marker: "[excited]" },
    c: { emotion: "crying", marker: "[crying]" },
    p: { emotion: "pause", marker: "[pause]" },
    b: { emotion: "break", marker: "[break]" },
};

function parseVoiceExpressionPrefix(text, enabled = true) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return { text: "", emotion: "", markers: [], used: false };
    if (!enabled) return { text: raw, emotion: "", markers: [], used: false };

    const tokens = raw.split(" ").filter(Boolean);
    const markers = [];
    const remaining = [];
    let emotion = "";

    const commandSpecForToken = (token) => {
        const tokenText = String(token || "").trim();
        if (!tokenText) return null;
        const trimmed = tokenText.replace(/[.,;:!?]+$/g, "");
        const match = trimmed.match(/^([!/])([sawglecpb])$/i);
        if (match) return VOICE_EXPRESSION_CATALOG[match[2].toLowerCase()] || null;
        return null;
    };

    let consuming = true;
    for (const token of tokens) {
        const spec = consuming ? commandSpecForToken(token) : null;
        if (spec) {
            if (!emotion && spec.emotion) emotion = spec.emotion;
            if (!markers.includes(spec.marker)) markers.push(spec.marker);
            continue;
        }
        consuming = false;
        remaining.push(token);
    }

    const cleanText = remaining.join(" ").replace(/\s+/g, " ").trim();
    return { text: cleanText, emotion, markers, used: markers.length > 0 };
}

function fishEmotionMarker(emotion) {
    const key = String(emotion || "").trim().toLowerCase();
    if (!key) return "";
    return FISH_AUDIO_MODEL && String(FISH_AUDIO_MODEL).toLowerCase().startsWith("s1")
        ? `(${key})`
        : `[${key}]`;
}

function composeFishAudioText(rawText, emotion = "", singSlashCommand = true) {
    let safeText = String(rawText || "").trim();
    if (!safeText) return { text: "", emotion: "" };

    const parsed = parseVoiceExpressionPrefix(safeText, singSlashCommand);
    safeText = parsed.text;
    const effectiveEmotion = String(emotion || parsed.emotion || "").trim();

    if (!safeText) return { text: "", emotion: effectiveEmotion };
    if (effectiveEmotion && !/^\s*[\[\(][^\]\)]+[\]\)]/.test(safeText)) {
        safeText = `${fishEmotionMarker(effectiveEmotion)} ${safeText}`;
    }

    return { text: safeText, emotion: effectiveEmotion };
}

async function fishAudioTtsBuffer({ text, voiceId, customOwnerId = "", noFilter = false }) {
    if (!FISH_AUDIO_API_KEY) throw new Error("Falta FISH_AUDIO_API_KEY en el servidor.");
    const resolvedVoiceId = String(voiceId || "").startsWith("fish:") ? String(voiceId).slice(5) : String(voiceId || "");
    if (!resolvedVoiceId) throw new Error("Falta voiceId.");

    if (String(voiceId || "").startsWith("fish:")) {
        if (!customOwnerId || !database.listUserVoices(customOwnerId).some((voice) => String(voice.fishId) === resolvedVoiceId)) {
            const error = new Error("Esta voz personalizada no pertenece a esta cuenta.");
            error.statusCode = 403;
            throw error;
        }
    }

    let safeText = String(text || "").trim();
    if (!safeText) throw new Error("El texto está vacío.");
    if (customOwnerId) {
        safeText = sanitizeRepeatedSpamComment(safeText);
        safeText = censorVoiceCustomFilter(safeText, customOwnerId);
    }
    if (!noFilter) safeText = censorVoiceProfanity(safeText, customOwnerId);
    if (!safeText) throw new Error("El texto quedó vacío después del filtro.");

    const resolved = composeFishAudioText(safeText, "", true);
    safeText = resolved.text;
    if (!safeText) throw new Error("El texto quedó vacío después de quitar la expresión.");

    const fishRes = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${FISH_AUDIO_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            model: FISH_AUDIO_MODEL,
        },
        body: JSON.stringify({
            text: safeText,
            reference_id: resolvedVoiceId,
            format: "wav",
            latency: "balanced",
            temperature: 0.7,
            top_p: 0.7,
            chunk_length: 160,
            normalize: true,
            sample_rate: 44100,
            max_new_tokens: 1024,
            repetition_penalty: 1.2,
            min_chunk_length: 50,
            condition_on_previous_chunks: true,
            early_stop_threshold: 1,
        }),
    });

    const bytes = Buffer.from(await fishRes.arrayBuffer());
    if (!fishRes.ok) {
        const message = bytes.toString("utf8");
        const error = new Error(message || "Fish Audio devolvió un error.");
        error.statusCode = fishRes.status;
        throw error;
    }
    return bytes;
}

function getFfmpegBinary() {
    const configured = String(process.env.FFMPEG_PATH || "").trim();
    if (configured) return configured;
    if (ffmpegStatic) return ffmpegStatic;
    return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function transcodeAudio(buffer, format) {
    const normalized = String(format || "").toLowerCase();
    const args = normalized === "mp3"
        ? ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3", "pipe:1"]
        : normalized === "ogg"
            ? ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-c:a", "libvorbis", "-q:a", "5", "-f", "ogg", "pipe:1"]
            : null;
    if (!args) return Promise.resolve({ buffer, contentType: "audio/wav" });

    return new Promise((resolve, reject) => {
        const child = spawn(getFfmpegBinary(), args, { windowsHide: true });
        const chunks = [];
        const errors = [];
        child.stdout.on("data", (chunk) => chunks.push(chunk));
        child.stderr.on("data", (chunk) => errors.push(chunk));
        child.on("error", (error) => {
            if (error?.code === "ENOENT") {
                return reject(new Error("No se encontró FFmpeg para convertir el audio. Instala las dependencias del proyecto o configura FFMPEG_PATH."));
            }
            reject(error);
        });
        child.on("close", (code) => {
            if (code !== 0) return reject(new Error(Buffer.concat(errors).toString("utf8") || `FFmpeg salió con código ${code}.`));
            resolve({
                buffer: Buffer.concat(chunks),
                contentType: normalized === "mp3" ? "audio/mpeg" : "audio/ogg",
            });
        });
        child.stdin.end(buffer);
    });
}

app.post("/api/user/voice-test", requireUser, async (req, res) => {
    try {
        const text = String(req.body?.text || "").trim();
        const voiceId = String(req.body?.voiceId || "").trim();
        const format = String(req.body?.format || "wav").toLowerCase();
        if (!text) return res.status(400).json({ error: "Escribe un texto para probar la voz." });
        if (!voiceId) return res.status(400).json({ error: "Falta la voz seleccionada." });
        if (!['wav', 'mp3', 'ogg'].includes(format)) return res.status(400).json({ error: "Formato no compatible." });

        const wav = await fishAudioTtsBuffer({ text, voiceId, customOwnerId: req.user.id, noFilter: false });
        const converted = await transcodeAudio(wav, format);
        res.setHeader("Content-Type", converted.contentType);
        res.setHeader("Content-Disposition", `attachment; filename="voice-test.${format}"`);
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        return res.send(converted.buffer);
    } catch (err) {
        const status = Number(err?.statusCode || 500);
        return res.status(status).json({ error: err?.message || "No se pudo generar el audio de prueba." });
    }
});

app.post("/api/voicebot/tts", async (req, res) => {
    try {
        if (!FISH_AUDIO_API_KEY) {
            return res.status(500).json({ error: "Falta FISH_AUDIO_API_KEY en el servidor." });
        }

        const text = String(req.body?.text || "").trim();
        const voiceId = String(req.body?.voiceId || "").trim();
        const ownerId = String(req.body?.ownerId || "").trim();
        const overlayKey = String(req.body?.overlayKey || "").trim();
        const customOwner = ownerId && overlayKey && database.getUserByOverlayKey(overlayKey)?.id === ownerId ? ownerId : "";
        const customVoiceId = voiceId.startsWith("fish:") ? voiceId.slice(5) : "";
        if (customVoiceId && !customOwner) return res.status(403).json({ error: "La voz personalizada no pertenece a esta sesión." });
        if (customVoiceId && !database.listUserVoices(customOwner).some((voice) => String(voice.fishId) === customVoiceId)) {
            return res.status(404).json({ error: "Esta voz personalizada ya no existe en la biblioteca de esta cuenta." });
        }
        const resolvedVoiceId = customVoiceId || voiceId;
        const noFilter = Boolean(req.body?.noFilter || String(req.body?.source || "").toLowerCase() === "realtime-voice");
        const profanityFilter = Boolean(req.body?.profanityFilter) && !noFilter;
        const emotion = String(req.body?.emotion || "").trim();
        const singSlashCommand = req.body?.singSlashCommand !== false;
        const antiSpamEnabled = Boolean(req.body?.antiSpamFilter) && !noFilter;
        const antiSpamPlatform = String(req.body?.platform || "tiktok").toLowerCase() === "twitch" ? "twitch" : "tiktok";
        const antiSpamUser = String(req.body?.antiSpamUser || "").trim();

        if (!text) return res.status(400).json({ error: "El texto está vacío." });
        if (!resolvedVoiceId) return res.status(400).json({ error: "Falta voiceId." });

        if (antiSpamEnabled && customOwner && antiSpamUser && shouldDropRepeatedComment(customOwner, antiSpamPlatform, antiSpamUser, String(req.body?.antiSpamText || text))) {
            return res.status(204).end();
        }

        let safeText = profanityFilter ? censorVoiceProfanity(text, customOwner) : text;
        if (!safeText) return res.status(400).json({ error: "El texto quedó vacío después del filtro." });

        const resolved = composeFishAudioText(safeText, emotion, singSlashCommand);
        safeText = resolved.text;
        const effectiveEmotion = resolved.emotion;
        if (!safeText) return res.status(400).json({ error: "El texto quedó vacío después de quitar la expresión." });

        const payload = {
            text: safeText,
            reference_id: resolvedVoiceId,
            format: "mp3",
            latency: "balanced",
            temperature: 0.7,
            top_p: 0.7,
            chunk_length: 120,
            normalize: true,
            repetition_penalty: 1.2,
        };

        const ttsController = new AbortController();
        // Timeout holgado solo para evitar conexiones colgadas; no cortamos un
        // stream sano por superar el tiempo de generación inicial.
        const ttsTimeout = setTimeout(() => ttsController.abort(), 45000);
        let fishRes;
        try {
            fishRes = await fetch("https://api.fish.audio/v1/tts", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${FISH_AUDIO_API_KEY}`,
                    "Content-Type": "application/json",
                    Accept: "audio/mpeg",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    model: FISH_AUDIO_MODEL,
                },
                body: JSON.stringify(payload),
                signal: ttsController.signal,
            });
        } finally {
            clearTimeout(ttsTimeout);
        }

        const contentType = fishRes.headers.get("content-type") || "audio/mpeg";

        res.status(fishRes.status);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("X-StreamFusion-TTS", "stream");

        if (!fishRes.ok) {
            const message = await fishRes.text().catch(() => "");
            return res.send(message || JSON.stringify({ error: "Fish Audio devolvió un error." }));
        }

        if (!fishRes.body) return res.end();
        try {
            for await (const chunk of fishRes.body) {
                if (res.destroyed) break;
                res.write(Buffer.from(chunk));
                try { if (typeof res.flushHeaders === 'function' && !res.headersSent) res.flushHeaders(); } catch {}
            }
        } catch (streamErr) {
            if (!res.destroyed) {
                try { res.end(); } catch {}
            }
        }
        return res.end();
    } catch (err) {
        return res.status(500).json({
            error: err?.message || "No se pudo generar audio.",
        });
    }
});


app.get("/api/realtime-voice/config", (req, res) => {
    res.json({
        voiceChangerWsUrl: FISH_AUDIO_VOICE_CHANGER_WS,
        hasVoiceChangerWsUrl: Boolean(FISH_AUDIO_VOICE_CHANGER_WS),
        ttsEndpoint: "/api/voicebot/tts",
        model: FISH_AUDIO_MODEL,
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        online: true,
        app: "StreamFusion",
        version: "3.0.0",
    });
});

io.use((socket, next) => {
    const token = String(socket.handshake.auth?.token || "").trim();
    const overlayKey = String(socket.handshake.auth?.overlayKey || "").trim();
    const widget = String(socket.handshake.auth?.widget || "").trim().toLowerCase();
    socket.user = database.getSession(token);
    socket.isOverlay = false;
    socket.isVoiceList = false;
    if (!socket.user && overlayKey) {
        socket.user = database.getUserByOverlayKey(overlayKey);
        socket.isOverlay = Boolean(socket.user);
        socket.isVoiceList = socket.isOverlay && widget === "voicelist";
    socket.isAnnouncement = socket.isOverlay && widget === "announcement";
    socket.isMusic = socket.isOverlay && widget === "music";
    }
    next();
});

function scopedEventEmitter(userId) {
    const room = `user:${String(userId || '').trim()}`;

    // Los servicios TikTok/Twitch usan tanto io.emit(...) como io.to(...).emit(...).
    // El emisor sigue completamente aislado al room del propietario, pero conserva
    // una interfaz compatible con esos servicios para no perder eventos.
    return {
        emit: (event, payload) => io.to(room).emit(event, payload),
        to: (targetRoom) => ({
            emit: (event, payload) => {
                // Nunca permitir que un servicio salga del room de su propietario.
                const requested = String(targetRoom || '');
                if (requested !== room) return;
                io.to(room).emit(event, payload);
            }
        })
    };
}

io.on("connection", (socket) => {
    console.log("Cliente conectado");

    if (socket.user) {
        socket.join(`user:${socket.user.id}`);
        setCustomVoiceRules(socket.user.id, database.listUserVoices(socket.user.id));
        if (socket.isVoiceList) addVoiceListPresence(socket.user.id);
    }

    socket.emit("system", {
        message: "Conectado a StreamFusion.",
    });

    const initialSettings = socket.user
        ? deepMerge(structuredClone(DEFAULT_SETTINGS), database.getUserSettings(socket.user.id))
        : getMergedSettings();
    socket.emit("settings", initialSettings);
    socket.emit("voiceListSettings", initialSettings.voiceList || DEFAULT_SETTINGS.voiceList);
    socket.emit("announcementsSettings", normalizeAnnouncements(initialSettings.announcements || []));
    socket.emit("announcementDraftSettings", initialSettings.announcementDraft ? normalizeAnnouncements([initialSettings.announcementDraft])[0] : null);
    socket.emit("musicSettings", music.getMusicConfig(socket.user?.id || ""));
    socket.emit("musicState", music.getPublicSnapshot(socket.user?.id || ""));
    if (socket.user && !socket.isVoiceList) socket.emit("voiceListPresence", voiceListPresencePayload(socket.user.id));
    socket.emit("roulette:sync", roulette.getPublicSnapshot(socket.user?.id || ""));
    for (const platform of ["tiktok", "twitch"]) {
        const savedProfile = socket.user ? getSavedConnectionProfile(socket.user.id, platform) : {};
        const visible = { username: savedProfile.username || "", avatarUrl: savedProfile.avatarUrl || "", connected: false, live: false, mode: "saved" };
        if (socket.user) Object.assign(visible, getUserAccountState(socket.user.id, platform));
        socket.emit("accountState", { ...visible, platform });
    }
    const history = socket.user && (liveSession.isActive(socket.user.id, "tiktok") || liveSession.isActive(socket.user.id, "twitch"))
        ? liveHistorySnapshot(socket.user.id)
        : { chat: [], events: [] };
    socket.emit("liveHistory", history);

    socket.on("connectTikTok", async (username) => {
        const cleanName = String(username || "").replace(/^@+/, "").trim();
        if (!socket.user) { socket.emit("system", { message: "Sesión requerida para conectar TikTok." }); return; }
        if (!cleanName) { socket.emit("system", { message: "Escribe un unique ID de TikTok." }); return; }
        let resolvedUsername = cleanName;
        try {
            emitAccountState("tiktok", { username: cleanName, connected:false, live:false, mode:"connecting", clearFeeds:false, stateReason:"connecting" }, socket.user.id);
            const savedBeforePhoto = getSavedConnectionProfile(socket.user.id, "tiktok");
            const savedAvatar = String(savedBeforePhoto.avatarUrl || "");
            saveConnectionProfile(socket.user.id, "tiktok", { username: cleanName, avatarUrl: savedAvatar });
            liveSession.begin(socket.user.id, "tiktok");

            // Pre-cargamos el perfil en paralelo con la conexión al LIVE. Si el
            // avatar ya está guardado se muestra de inmediato; si es una cuenta
            // nueva, el lookup puede resolver y publicar la foto antes de que
            // termine de estabilizarse la conexión, sin bloquear el socket.
            const profilePromise = lookupPublicProfile("tiktok", cleanName).catch(() => null);
            const connectionPromise = tiktok.connect(cleanName, scopedEventEmitter(socket.user.id), socket.user.id);
            profilePromise.then(async profile => {
                if (!profile) return;
                const resolved = String(profile.username || cleanName).replace(/^@+/, "").trim() || cleanName;
                const avatarUrl = String(profile.avatarUrl || savedAvatar || "");
                saveConnectionProfile(socket.user.id, "tiktok", { username: resolved, avatarUrl });
                try {
                    if (profile.photoData?.buffer) await syncConnectedProfilePhotoData(socket.user.id, "tiktok", resolved, profile.photoData);
                    else if (avatarUrl) await syncConnectedProfilePhoto(socket.user.id, "tiktok", resolved, avatarUrl);
                } catch (photoError) { console.warn(`[connections] foto TikTok:`, photoError?.message || photoError); }
                emitAccountState("tiktok", { username:resolved, avatarUrl, connected:true, live:false, mode:"connecting" }, socket.user.id);
            }).catch(() => {});
            await connectionPromise;
            emitAccountState("tiktok", { username:cleanName, avatarUrl:savedAvatar, connected:true, live:false, mode:"waiting", clearFeeds:false }, socket.user.id);
            socket.emit("system", { message: `TikTok conectado con @${cleanName}.` });

        } catch (err) {
            globalThis.__STREAMFUSION_LIVE_END_HOOK__?.(socket.user.id, "tiktok");
            const savedProfile = getSavedConnectionProfile(socket.user.id, "tiktok");
            emitAccountState("tiktok", { username:resolvedUsername, avatarUrl:savedProfile.avatarUrl || "", connected:false, live:false, mode:"saved", stateReason:"error" }, socket.user.id);
            socket.emit("system", { message: err?.message || "Error al conectar TikTok." });
        }
    });

    socket.on("connectTwitch", async (channel) => {
        const cleanChannel = String(channel || "").replace(/^#+/, "").trim();
        let profile = null;
        try {
            if (!socket.user) throw new Error("Sesión requerida para conectar Twitch.");
            if (!cleanChannel) throw new Error("Escribe un canal de Twitch.");
            emitAccountState("twitch", {
                username: cleanChannel,
                connected: false,
                live: false,
                mode: "connecting",
                clearFeeds: false,
                stateReason: "connecting"
            }, socket.user.id);

            // El avatar del canal se obtiene independientemente del estado del directo.
            profile = await lookupPublicProfile("twitch", cleanChannel).catch((lookupError) => {
                console.warn(`[connections] No se pudo obtener el perfil Twitch @${cleanChannel}:`, lookupError?.message || lookupError);
                return null;
            });

            const savedBeforeAvatar = getSavedConnectionProfile(socket.user.id, "twitch");
            const resolvedUsername = String(profile?.username || cleanChannel).replace(/^#+/, "").trim();
            const sameTwitchUser = String(savedBeforeAvatar.username || "").replace(/^#+/, "").toLowerCase() === resolvedUsername.toLowerCase();
            const avatarUrl = String(profile?.avatarUrl || (sameTwitchUser ? savedBeforeAvatar.avatarUrl || "" : ""));

            // Guardamos el perfil antes de intentar la conexión; así también queda disponible
            // aunque Twitch no llegue a establecer el canal.
            saveConnectionProfile(socket.user.id, "twitch", { username: resolvedUsername, avatarUrl });
            if (avatarUrl) await syncConnectedProfilePhoto(socket.user.id, "twitch", resolvedUsername, avatarUrl);
            emitAccountState("twitch", {
                username: resolvedUsername,
                avatarUrl,
                connected: false,
                live: false,
                mode: "connecting",
                clearFeeds: false,
                stateReason: "connecting",
            }, socket.user?.id || "");

            await twitch.connect(resolvedUsername, scopedEventEmitter(socket.user.id), socket.user.id);
            emitAccountState("twitch", {
                username: resolvedUsername,
                avatarUrl,
                connected: true,
                live: false,
                mode: "waiting",
            }, socket.user?.id || "");
            socket.emit("system", {
                message: `Twitch conectado a ${resolvedUsername}.`,
            });
        } catch (err) {
            const savedProfile = getSavedConnectionProfile(socket.user?.id || "", "twitch");
            emitAccountState("twitch", {
                username: savedProfile.username || cleanChannel,
                avatarUrl: savedProfile.avatarUrl || String(profile?.avatarUrl || ""),
                connected: false,
                live: false,
                mode: "saved",
            }, socket.user?.id || "");
            socket.emit("system", {
                message: err?.message || "Error al conectar Twitch.",
            });
        }
    });

    socket.on("disconnectTikTok", async () => {
        try {
            await tiktok.disconnect(socket.user?.id || "");
            globalThis.__STREAMFUSION_LIVE_END_HOOK__?.(socket.user?.id || "", "tiktok");
            const savedProfile = getSavedConnectionProfile(socket.user?.id || "", "tiktok");
            emitAccountState("tiktok", {
                username: savedProfile.username || "",
                connected: false,
                live: false,
                mode: "saved",
                avatarUrl: savedProfile.avatarUrl || "",
                clearFeeds: true,
                stateReason: "manual-disconnect",
            }, socket.user?.id || "");
            socket.emit("system", {
                message: "TikTok desconectado.",
            });
        } catch (err) {
            socket.emit("system", {
                message: err?.message || "No se pudo desconectar TikTok.",
            });
        }
    });

    socket.on("disconnectTwitch", async () => {
        try {
            await twitch.disconnect(socket.user?.id || "");
            globalThis.__STREAMFUSION_LIVE_END_HOOK__?.(socket.user?.id || "", "twitch");
            const savedProfile = getSavedConnectionProfile(socket.user?.id || "", "twitch");
            emitAccountState("twitch", {
                username: savedProfile.username || "",
                connected: false,
                live: false,
                mode: "saved",
                avatarUrl: savedProfile.avatarUrl || "",
                clearFeeds: true,
                stateReason: "manual-disconnect",
            }, socket.user?.id || "");
            socket.emit("system", {
                message: "Twitch desconectado.",
            });
        } catch (err) {
            socket.emit("system", {
                message: err?.message || "No se pudo desconectar Twitch.",
            });
        }
    });

    socket.on("roulette:getState", () => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) return socket.emit("roulette:error", { message: "Sesión requerida." });
        socket.emit("roulette:sync", roulette.getPublicSnapshot(ownerId));
    });

    socket.on("roulette:update", (patch, ack) => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) {
            socket.emit("roulette:error", { message: "Sesión requerida." });
            if (typeof ack === "function") ack({ ok: false, error: "Sesión requerida." });
            return;
        }
        try {
            roulette.updateConfig(patch || {}, ownerId);
            socket.emit("roulette:sync", roulette.getPublicSnapshot(ownerId));
            if (typeof ack === "function") ack({ ok: true });
        } catch (error) {
            socket.emit("roulette:error", { message: error?.message || "No se pudo guardar la ruleta." });
            if (typeof ack === "function") ack({ ok: false, error: error?.message || "No se pudo guardar la ruleta." });
        }
    });

    socket.on("roulette:start", () => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) return socket.emit("roulette:error", { message: "Sesión requerida." });
        const result = roulette.startSpin(ownerId);
        if (!result?.ok) {
            socket.emit("roulette:error", { message: result?.reason === "empty" ? "No hay participantes para iniciar la ruleta." : "No se pudo iniciar la ruleta." });
        }
    });

    socket.on("roulette:stop", () => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) return socket.emit("roulette:error", { message: "Sesión requerida." });
        roulette.stopSpin(ownerId);
        socket.emit("roulette:sync", roulette.getPublicSnapshot(ownerId));
    });

    socket.on("roulette:reset", () => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) return socket.emit("roulette:error", { message: "Sesión requerida." });
        roulette.reset(ownerId);
        socket.emit("roulette:sync", roulette.getPublicSnapshot(ownerId));
    });

    socket.on("roulette:clearParticipants", () => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) return socket.emit("roulette:error", { message: "Sesión requerida." });
        roulette.clearParticipants(ownerId);
        socket.emit("roulette:sync", roulette.getPublicSnapshot(ownerId));
    });

    socket.on("roulette:clearWinnerHistory", () => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) return socket.emit("roulette:error", { message: "Sesión requerida." });
        roulette.clearWinnerHistory(ownerId);
        socket.emit("roulette:sync", roulette.getPublicSnapshot(ownerId));
    });

    socket.on("voiceFixedUsers:upsert", (assignment) => {
        const saved = upsertVoiceFixedUser(assignment || {}, socket.user?.id || "");
        if (saved) {
            socket.emit("system", {
                message: `Voz sincronizada para @${saved.username}.`,
            });
        }
    });

    socket.on("voiceFixedUsers:delete", (entry) => {
        const removed = deleteVoiceFixedUser(entry || {}, socket.user?.id || "");
        if (removed) {
            socket.emit("system", {
                message: "Voz sincronizada eliminada.",
            });
        }
    });

    socket.on("saveSettings", (settings) => {
        if (socket.user) {
            const current = database.getUserSettings(socket.user.id) || {};
            const oldRules = Array.isArray(current?.voiceBot?.power?.powerRules) ? current.voiceBot.power.powerRules.map(r=>String(r?.id||"")).filter(Boolean) : [];
            const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, settings || {}));
            const newRuleIds = new Set(Array.isArray(merged?.voiceBot?.power?.powerRules) ? merged.voiceBot.power.powerRules.map(r=>String(r?.id||"")).filter(Boolean) : []);
            for (const id of oldRules) if (!newRuleIds.has(id)) liveSession.revokePowersByRule(socket.user.id, id);
            database.saveUserSettings(socket.user.id, merged);
            io.to(`user:${socket.user.id}`).emit("settings", merged);
            io.to(`user:${socket.user.id}`).emit("voiceListSettings", merged.voiceList || DEFAULT_SETTINGS.voiceList);
            return;
        }
        const current = database.getSettings() || {};
        const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), deepMerge(current, settings || {}));
        database.saveSettings(merged);
        io.emit("settings", merged);
        io.emit("voiceListSettings", merged.voiceList || DEFAULT_SETTINGS.voiceList);
        socket.emit("system", {
            message: "Configuración guardada.",
        });
    });

    socket.on("pointsWidget:simulate", (payload, ack) => {
        const ownerId = String(socket.user?.id || "").trim();
        if (!ownerId) {
            if (typeof ack === "function") ack({ ok: false, error: "Sesión requerida." });
            return;
        }

        try {
            const current = database.getUserSettings(ownerId) || {};
            const widget = current?.points?.widget && typeof current.points.widget === "object"
                ? current.points.widget
                : {};
            if (widget.enabled === false) {
                if (typeof ack === "function") ack({ ok: false, error: "El widget de Puntos está desactivado." });
                return;
            }

            const platform = String(payload?.platform || "tiktok").toLowerCase() === "twitch" ? "twitch" : "tiktok";
            const username = String(payload?.username || "").trim();
            if (!username) {
                if (typeof ack === "function") ack({ ok: false, error: "Falta el usuario de prueba." });
                return;
            }

            const trigger = {
                ownerId,
                platform,
                username,
                displayName: String(payload?.displayName || username).trim(),
                avatarUrl: String(payload?.avatarUrl || "").trim(),
                points: Number.isFinite(Number(payload?.points)) ? Number(payload.points) : 0,
                command: String(payload?.command || `${String(widget.commandPrefix || "!")}${Array.isArray(widget.commandWords) && widget.commandWords[0] ? widget.commandWords[0] : "point"}`),
                displaySeconds: Math.max(1, Math.min(30, Number(payload?.displaySeconds || widget.displaySeconds || 5))),
                cooldownMinutes: 0,
                timestamp: Number(payload?.timestamp || Date.now()) || Date.now(),
                simulated: true
            };

            io.to(`user:${ownerId}`).emit("pointsWidgetTrigger", trigger);
            if (typeof ack === "function") ack({ ok: true });
        } catch (error) {
            console.error("[pointsWidget:simulate]", error);
            if (typeof ack === "function") ack({ ok: false, error: error?.message || "No se pudo simular el comentario." });
        }
    });

    music.attachSocketHandlers(io, socket);
    socket.on("music:control", (action, ack) => { const ownerId=String(socket.user?.id||'').trim(); if(!ownerId){if(typeof ack==='function')ack({ok:false,error:'Sesión requerida.'});return;} const act=String(action||'').toLowerCase(); try{ let state; if(act==='pause'||act==='resume'){state=music.togglePause(ownerId,act==='pause');io.to(`user:${ownerId}`).emit('musicState',state);io.to(`user:${ownerId}`).emit('musicCommand',{action:act});} else if(act==='previous'||act==='back'||act==='retroceder'){state=music.previous(ownerId,io);io.to(`user:${ownerId}`).emit('musicCommand',{action:'previous'});} else if(act==='stop'){state=music.stop(ownerId);io.to(`user:${ownerId}`).emit('musicState',state);io.to(`user:${ownerId}`).emit('musicCommand',{action:'stop'});} else if(act==='skip'){state=music.skip(ownerId,io);} else if(act==='repeat'){state=music.toggleRepeat(ownerId);io.to(`user:${ownerId}`).emit('musicState',state);} if(typeof ack==='function')ack({ok:true,state:music.getPublicSnapshot(ownerId)});}catch(error){if(typeof ack==='function')ack({ok:false,error:error?.message||'No se pudo controlar la música.'});} });
    socket.on("music:volume", (value, ack) => { const ownerId=String(socket.user?.id||'').trim(); if(!ownerId){if(typeof ack==='function')ack({ok:false,error:'Sesión requerida.'});return;} try{ const n=Number(value); if(!Number.isFinite(n)||n<0||n>100){if(typeof ack==='function')ack({ok:false,error:'El volumen debe estar entre 0 y 100.'});return;} const cfg=music.getMusicConfig(ownerId); const state=music.setVolume(ownerId,Math.round(n),io); if(typeof ack==='function')ack({ok:true,state}); }catch(error){if(typeof ack==='function')ack({ok:false,error:error?.message||'No se pudo cambiar el volumen.'});} });

    socket.on("loadSettings", () => {
        socket.emit("settings", socket.user
            ? deepMerge(structuredClone(DEFAULT_SETTINGS), database.getUserSettings(socket.user.id))
            : getMergedSettings());
    });

    socket.on("disconnect", () => {
        if (socket.isVoiceList && socket.user?.id) removeVoiceListPresence(socket.user.id);
        console.log("Cliente desconectado");
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("=================================");
    console.log(" StreamFusion iniciado");
    console.log(" Puerto:", PORT);
    console.log("=================================");
});
