import {
    TikTokLiveConnection,
    WebcastEvent,
    ControlEvent
} from "tiktok-live-connector";
import { recordChat, recordEvent } from "./live-history.js";
import * as database from "./database.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const connections = new Map();
const sessionStatsByOwner = new Map();

// Reconexion resiliente por cuenta: un corte de transporte no se trata como
// fin del LIVE. Solo una desconexion manual o STREAM_END cancela el reintento.
const reconnectStates = new Map();
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

function getReconnectState(ownerId) {
    const owner = String(ownerId || '').trim();
    if (!reconnectStates.has(owner)) {
        reconnectStates.set(owner, {
            username: '',
            io: null,
            timer: null,
            attempt: 0,
            intentional: false,
            connectedOnce: false,
            ending: false,
            reconnecting: false,
        });
    }
    return reconnectStates.get(owner);
}

function clearReconnectTimer(state) {
    if (!state?.timer) return;
    clearTimeout(state.timer);
    state.timer = null;
}

function cancelReconnect(ownerId, removeState = false) {
    const owner = String(ownerId || '').trim();
    const state = reconnectStates.get(owner);
    if (!state) return;
    clearReconnectTimer(state);
    state.intentional = true;
    state.ending = true;
    state.reconnecting = false;
    if (removeState) reconnectStates.delete(owner);
}

function scheduleReconnect(ownerId) {
    const owner = String(ownerId || '').trim();
    const state = reconnectStates.get(owner);
    if (!owner || !state || state.intentional || state.ending || !state.connectedOnce) return;
    clearReconnectTimer(state);
    const attemptIndex = Math.min(state.attempt, RECONNECT_DELAYS_MS.length - 1);
    const delay = RECONNECT_DELAYS_MS[attemptIndex];
    state.attempt += 1;
    state.timer = setTimeout(async () => {
        state.timer = null;
        if (state.intentional || state.ending) return;
        state.reconnecting = true;
        state.io?.to?.(`user:${owner}`).emit("accountState", {
            platform: "tiktok",
            username: state.username,
            connected: false,
            live: true,
            mode: "reconnecting",
            stateReason: "transport-reconnect"
        });
        emitSystem(state.io, `TikTok perdió la conexión. Reintentando en ${Math.ceil(delay / 1000)} s…`);
        try {
            await connect(state.username, state.io, owner, { reconnect: true });
            const fresh = reconnectStates.get(owner);
            if (fresh) {
                fresh.attempt = 0;
                fresh.reconnecting = false;
            }
            emitSystem(state.io, "TikTok reconectado correctamente.");
        } catch (error) {
            const fresh = reconnectStates.get(owner);
            if (!fresh || fresh.intentional || fresh.ending) return;
            fresh.reconnecting = false;
            emitSystem(fresh.io, `No se pudo reconectar todavía: ${error?.message || "error de conexión"}.`);
            scheduleReconnect(owner);
        }
    }, delay);
}


function getSessionStats(ownerId = "") {
    const id = String(ownerId || "").trim();
    if (!sessionStatsByOwner.has(id)) sessionStatsByOwner.set(id, { viewers: 0, likes: 0, gifts: 0, followers: 0, shares: 0 });
    return sessionStatsByOwner.get(id);
}

const E = {
    CHAT: WebcastEvent.CHAT ?? "chat",
    GIFT: WebcastEvent.GIFT ?? "gift",
    LIKE: WebcastEvent.LIKE ?? "like",
    MEMBER: WebcastEvent.MEMBER ?? "member",
    SOCIAL: WebcastEvent.SOCIAL ?? "social",
    FOLLOW: WebcastEvent.FOLLOW ?? "follow",
    SHARE: WebcastEvent.SHARE ?? "share",
    EMOTE: WebcastEvent.EMOTE ?? "emote",
    QUESTION_NEW: WebcastEvent.QUESTION_NEW ?? "questionNew",
    ROOM_USER: WebcastEvent.ROOM_USER ?? "roomUser",
    LIVE_INTRO: WebcastEvent.LIVE_INTRO ?? "liveIntro",
    STREAM_END: WebcastEvent.STREAM_END ?? "streamEnd",
    ENVELOPE: WebcastEvent.ENVELOPE ?? "envelope",
    SUPER_FAN: WebcastEvent.SUPER_FAN ?? "superFan",
    SUPER_FAN_JOIN: WebcastEvent.SUPER_FAN_JOIN ?? "superFanJoin",
    SUPER_FAN_BOX: WebcastEvent.SUPER_FAN_BOX ?? "superFanBox"
};

const avatarCache = new Map();
const pendingAvatarRequests = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GIFT_CATALOG_PATH = path.join(__dirname, "../Public/data/tiktok-gifts.json");
let giftCatalog = [];
let giftCatalogByKey = new Map();

function normalizeGiftKey(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

function loadGiftCatalog() {
    try {
        const raw = readFileSync(GIFT_CATALOG_PATH, "utf8");
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
        giftCatalog = items;
        giftCatalogByKey = new Map();
        for (const item of items) {
            for (const candidate of [item?.id, item?.key, item?.name, item?.alt]) {
                const key = normalizeGiftKey(candidate);
                if (key && !giftCatalogByKey.has(key)) giftCatalogByKey.set(key, item);
            }
        }
    } catch {
        giftCatalog = [];
        giftCatalogByKey = new Map();
    }
}

function resolveGiftMedia(data) {
    // TikTok no siempre entrega nombre + id juntos. Probamos todas las
    // variantes conocidas y, si el evento ya trae una imagen, la usamos
    // como respaldo inmediato antes de caer en el icono generico.
    const candidates = [
        data?.giftDetails?.giftId,
        data?.giftId,
        data?.gift?.id,
        data?.giftDetails?.giftName,
        data?.giftName,
        data?.gift?.name,
        data?.gift?.giftName,
        data?.gift?.title,
        data?.giftDetails?.title
    ];
    const eventImage = clean(
        data?.giftImage ||
        data?.giftDetails?.giftImage ||
        data?.giftDetails?.image ||
        data?.gift?.image ||
        data?.gift?.icon ||
        data?.gift?.imageUrl ||
        data?.gift?.url,
        ""
    );

    for (const candidate of candidates) {
        const key = normalizeGiftKey(candidate);
        if (!key) continue;
        const gift = giftCatalogByKey.get(key);
        if (gift) {
            return {
                id: String(gift.id ?? candidate ?? ""),
                key: clean(gift.key, normalizeGiftKey(gift.name || candidate)),
                name: clean(gift.name, clean(candidate, "Regalo")),
                image: clean(gift.image, eventImage),
                coins: toNumber(gift.coins, 0),
                alt: clean(gift.alt, clean(gift.name, clean(candidate, "Regalo")))
            };
        }
    }

    const fallbackName = clean(
        data?.giftDetails?.giftName || data?.giftName || data?.gift?.name || data?.gift?.title || candidates.find(Boolean),
        "Regalo"
    );
    return {
        id: String(data?.giftId || data?.giftDetails?.giftId || data?.gift?.id || ""),
        key: normalizeGiftKey(fallbackName),
        name: fallbackName,
        image: eventImage,
        coins: 0,
        alt: fallbackName
    };
}

function firstNonEmptyUrl(values) {
    const queue = Array.isArray(values) ? values : [values];
    for (const value of queue) {
        if (!value) continue;
        if (Array.isArray(value)) {
            const nested = firstNonEmptyUrl(value);
            if (nested) return nested;
            continue;
        }
        if (typeof value === "object") {
            const nested = firstNonEmptyUrl([
                value?.url,
                value?.uri,
                value?.src,
                value?.link,
                value?.imageUrl,
                value?.image_url,
                value?.urlList,
                value?.url_list,
                value?.urls,
                value?.image?.url,
                value?.image?.uri,
                value?.image?.src,
                value?.image?.link,
                value?.image?.urlList,
                value?.image?.url_list,
                value?.image?.urls,
            ]);
            if (nested) return nested;
            continue;
        }

        const text = clean(value, "");
        if (/^https?:\/\//i.test(text) || /^data:image\//i.test(text)) return text.replace(/&amp;/g, "&");
    }
    return "";
}

function resolveStickerMedia(data) {
    const sticker = data?.sticker || data?.stickerInfo || data?.stickerDetails || null;
    const emote = Array.isArray(data?.emoteList) ? data.emoteList[0] : (data?.emote || null);

    const nameCandidates = [
        sticker?.name,
        sticker?.title,
        sticker?.stickerName,
        sticker?.stickerTitle,
        data?.stickerName,
        data?.stickerTitle,
        data?.stickerText,
        emote?.emoteName,
        emote?.name,
        emote?.title,
        emote?.emoteId,
        data?.emoteName,
        data?.emoteId
    ];

    const imageCandidates = [
        sticker?.image,
        sticker?.imageUrl,
        sticker?.imageURL,
        sticker?.url,
        sticker?.uri,
        sticker?.urlList,
        sticker?.url_list,
        sticker?.images,
        sticker?.image?.url,
        sticker?.image?.uri,
        sticker?.image?.src,
        sticker?.image?.urlList,
        sticker?.image?.url_list,
        sticker?.image?.images,
        data?.stickerImage,
        data?.stickerUrl,
        data?.sticker?.imageUrl,
        data?.sticker?.urlList,
        data?.sticker?.url_list,
        data?.sticker?.images,
        emote?.image,
        emote?.imageUrl,
        emote?.imageURL,
        emote?.url,
        emote?.uri,
        emote?.urlList,
        emote?.url_list,
        emote?.images,
        emote?.image?.url,
        emote?.image?.uri,
        emote?.image?.src,
        emote?.image?.urlList,
        emote?.image?.url_list,
        emote?.image?.images,
        data?.emoteImage,
        data?.emoteUrl,
        data?.emote?.imageUrl,
        data?.emote?.urlList,
        data?.emote?.url_list,
        data?.emote?.images
    ];

    const image = firstNonEmptyUrl(imageCandidates);
    const name = clean(nameCandidates.find((value) => clean(value, "")), image ? "Sticker" : "Sticker");
    const id = clean(
        sticker?.id ??
        sticker?.stickerId ??
        data?.stickerId ??
        emote?.emoteId ??
        emote?.id ??
        data?.emoteId,
        ""
    );

    return {
        name: clean(name, image ? "Sticker" : "Sticker"),
        image,
        alt: clean(sticker?.alt ?? sticker?.ariaLabel ?? sticker?.accessibilityLabel ?? name ?? id, name || "Sticker"),
        id
    };
}

function clean(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text.length ? text : fallback;
}

function stripBracketedSegments(value) {
    return String(value ?? "")
        .replace(/\s*\[[^\]]*\]\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function typeEmoji(type, fallback = "") {
    const t = String(type || "").toLowerCase();
    if (t.includes("gift")) return "🎁";
    if (t.includes("sub")) return "⭐";
    if (t.includes("bits") || t.includes("superchat")) return "💎";
    if (t.includes("raid") || t.includes("host")) return "⚡";
    if (t.includes("follow")) return "💚";
    if (t.includes("share")) return "📣";
    if (t.includes("join") || t.includes("member") || t.includes("heartme")) return "💖";
    if (t.includes("fanclub") || t.includes("superfan")) return "🌟";
    if (t.includes("like")) return "❤️";
    if (t.includes("question")) return "❓";
    if (t.includes("emote")) return "😄";
    if (t.includes("social")) return "✨";
    return fallback || "💬";
}

function avatarFallback(seed) {
    const label = String(seed || "TikTok").replace(/^@+/, "").replace(/^#+/, "").trim();
    const initial = (label.match(/[A-Za-z0-9]/)?.[0] || "T").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fe2c55"/><stop offset="100%" stop-color="#111827"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="57%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="700" fill="#fff">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

function cleanLogin(value) {
    return clean(value, "")
        .replace(/^@+/, "")
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
        .split(/[/?#]/)[0]
        .trim();
}

function getAvatarFromUserObject(user) {
    const candidates = [
        user?.avatarThumb?.urlList?.[0],
        user?.avatarThumb?.url,
        user?.avatarMedium?.urlList?.[0],
        user?.avatarMedium?.url,
        user?.avatarLarge?.urlList?.[0],
        user?.avatarLarge?.url,
        user?.profilePictureUrl,
        user?.profile_picture_url,
        user?.avatarUrl,
        user?.avatar,
        user?.imageUrl,
    ].map((value) => clean(value, "")).filter(Boolean);
    return candidates[0] || "";
}

async function resolveTiktokAvatar(username, userObj = null) {
    const fromObject = getAvatarFromUserObject(userObj);
    if (fromObject) return fromObject;

    const login = cleanLogin(username).toLowerCase();
    if (!login) return "";

    if (avatarCache.has(login)) return avatarCache.get(login);
    if (pendingAvatarRequests.has(login)) return pendingAvatarRequests.get(login);

    const request = (async () => {
        const html = await fetchText(`https://www.tiktok.com/@${encodeURIComponent(login)}`);
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
    })().then((avatar) => {
        const resolved = String(avatar || "").trim();
        avatarCache.set(login, resolved);
        return resolved;
    }).catch(() => {
        const resolved = "";
        avatarCache.set(login, resolved);
        return resolved;
    }).finally(() => {
        pendingAvatarRequests.delete(login);
    });

    pendingAvatarRequests.set(login, request);
    return request;
}

function normalizeUsername(username) {
    let value = clean(username);

    value = value
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
        .replace(/^@/i, "");

    value = value.split(/[/?#]/)[0].trim();
    return value;
}

function pickUser(data) {
    const user =
        data?.user ||
        data?.details?.user ||
        data?.anchorInfo?.user ||
        data?.shareUser ||
        data?.memberUser ||
        data?.author ||
        data?.sender ||
        null;

    const uniqueId = clean(
        user?.uniqueId ??
        user?.uniqueID ??
        user?.displayId ??
        user?.username ??
        user?.nickName ??
        user?.nickname,
        "Usuario"
    );

    const nickname = clean(
        user?.nickname ??
        user?.nickName ??
        user?.displayName ??
        user?.displayId ??
        user?.uniqueId ??
        uniqueId,
        "Usuario"
    );

    return { uniqueId, nickname, user };
}

function collectBadges(data, user = null) {
    const source = user || data?.user || data?.details?.user || data?.author || data?.memberUser || null;
    const raw = [];

    const push = (value) => {
        if (value === null || value === undefined || value === false) return;
        if (Array.isArray(value)) {
            value.forEach(push);
            return;
        }
        if (typeof value === "object") {
            if (value.name || value.type || value.label || value.id) raw.push(value.name || value.type || value.label || value.id);
            return;
        }
        const text = String(value).trim();
        if (text) raw.push(text);
    };

    push(data?.badges);
    push(data?.badge);
    push(data?.badgeList);
    push(data?.badgeInfo);
    push(data?.badgeInfos);
    push(source?.badges);
    push(source?.badge);
    push(source?.badgeList);
    push(source?.badgeInfo);
    push(source?.badgeInfos);

    if (source?.isModerator || source?.moderator) push("moderator");
    if (source?.isVerified || source?.verified) push("verified");
    if (source?.isBroadcaster || source?.isOwner || source?.owner) push("broadcaster");
    if (source?.isSubscriber || source?.subscriber || source?.subscribed) push("subscriber");
    if (source?.isMember || source?.member || source?.fanClubMember || source?.isFanClubMember) push("member");
    if (source?.isSuperFan || source?.superFan || source?.superfan) push("superfan");
    if (source?.vip) push("vip");

    return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
}

function getIO() {
    return globalThis.__STREAMFUSION_IO__ || null;
}

function configuredTikTokModerator(uniqueId, ownerId = "") {
    const id = String(uniqueId || "").trim().toLowerCase();
    if (!id || !ownerId) return false;
    try {
        const settings = database.getUserSettings(ownerId) || {};
        const list = Array.isArray(settings.tiktokModerators) ? settings.tiktokModerators : [];
        return list.some((value) => {
            const identity = value && typeof value === "object" ? (value.uniqueId || value.username || value.user || value.identityKey || "") : value;
            return String(identity || "").trim().toLowerCase() === id;
        });
    } catch {
        return false;
    }
}

function withConfiguredModeratorBadge(badges, uniqueId, ownerId = "") {
    const next = Array.isArray(badges) ? [...badges] : [];
    if (configuredTikTokModerator(uniqueId, ownerId) && !next.some((b) => String(b || "").toLowerCase().includes("moderator"))) {
        next.push("moderator");
    }
    return [...new Set(next)];
}

function emitSystem(io, message) {
    io?.emit("system", {
        platform: "tiktok",
        type: "system",
        emoji: "ℹ️",
        message: clean(message, "Error desconocido"),
        timestamp: Date.now()
    });
}

function emitChat(io, event, ownerId = "") {
    const payload = {
        platform: "tiktok",
        timestamp: Date.now(),
        type: clean(event.type, "chat"),
        action: clean(event.action, "Comentario"),
        user: clean(event.user || event.displayName || "Usuario", "Usuario"),
        displayName: clean(event.displayName || event.user || "Usuario", "Usuario"),
        uniqueId: clean(event.uniqueId, ""),
        message: clean(event.message, ""),
        source: "chat",
        emoji: clean(event.emoji, typeEmoji(event.type, "💬")),
        avatar: event.avatar !== undefined ? event.avatar : undefined,
        color: event.color !== undefined ? event.color : undefined,
        badges: withConfiguredModeratorBadge(event.badges, event.uniqueId, ownerId),
        viewer: event.viewer !== undefined ? event.viewer : undefined,
        persistentDonor: event.persistentDonor !== undefined ? Boolean(event.persistentDonor) : undefined,
        everDonated: event.everDonated !== undefined ? Boolean(event.everDonated) : undefined,
        persistentFollowed: event.persistentFollowed !== undefined ? Boolean(event.persistentFollowed) : undefined,
        followedBefore: event.followedBefore !== undefined ? Boolean(event.followedBefore) : undefined,
        gift: event.gift !== undefined ? event.gift : undefined,
        amount: event.amount !== undefined ? event.amount : undefined,
        likes: event.likes !== undefined ? event.likes : undefined,
        sticker: event.sticker !== undefined ? event.sticker : undefined,
        stickerImage: event.stickerImage !== undefined ? event.stickerImage : undefined,
        stickerAlt: event.stickerAlt !== undefined ? event.stickerAlt : undefined,
        stickerId: event.stickerId !== undefined ? event.stickerId : undefined
    };
    const enrichedPayload = globalThis.__STREAMFUSION_POINTS_HOOK__?.(ownerId, payload) || payload;
    globalThis.__STREAMFUSION_MUSIC_HOOK__?.(ownerId, enrichedPayload);
    globalThis.__STREAMFUSION_ROULETTE_HOOK__?.ingestChat?.({ ...enrichedPayload, _ownerId: ownerId });
    recordChat(ownerId, enrichedPayload);
    io?.to?.(`user:${ownerId}`).emit("chat", enrichedPayload);
}

loadGiftCatalog();

function emitEvent(io, event, ownerId = "") {
    const payload = {
        platform: "tiktok",
        timestamp: Date.now(),
        type: clean(event.type, "system"),
        emoji: clean(event.emoji, typeEmoji(event.type, "✨")),
        action: clean(event.action, "Evento"),
        user: clean(event.user || event.displayName || "Usuario", "Usuario"),
        displayName: clean(event.displayName || event.user || "Usuario", "Usuario"),
        uniqueId: clean(event.uniqueId, ""),
        message: clean(event.message, ""),
        source: "event",
        avatar: event.avatar !== undefined ? event.avatar : undefined,
        badges: withConfiguredModeratorBadge(event.badges, event.uniqueId, ownerId),
        viewer: event.viewer !== undefined ? event.viewer : undefined,
        persistentDonor: event.persistentDonor !== undefined ? Boolean(event.persistentDonor) : undefined,
        everDonated: event.everDonated !== undefined ? Boolean(event.everDonated) : undefined,
        persistentFollowed: event.persistentFollowed !== undefined ? Boolean(event.persistentFollowed) : undefined,
        followedBefore: event.followedBefore !== undefined ? Boolean(event.followedBefore) : undefined,
        gift: event.gift !== undefined ? event.gift : undefined,
        giftImage: event.giftImage !== undefined ? event.giftImage : undefined,
        giftCoins: event.giftCoins !== undefined ? event.giftCoins : undefined,
        giftAlt: event.giftAlt !== undefined ? event.giftAlt : undefined,
        amount: event.amount !== undefined ? event.amount : undefined,
        likes: event.likes !== undefined ? event.likes : undefined,
        sticker: event.sticker !== undefined ? event.sticker : undefined,
        stickerImage: event.stickerImage !== undefined ? event.stickerImage : undefined,
        stickerAlt: event.stickerAlt !== undefined ? event.stickerAlt : undefined,
        stickerId: event.stickerId !== undefined ? event.stickerId : undefined
    };
    const enrichedPayload = globalThis.__STREAMFUSION_POINTS_HOOK__?.(ownerId, payload) || payload;
    globalThis.__STREAMFUSION_ROULETTE_HOOK__?.ingestEvent?.({ ...enrichedPayload, _ownerId: ownerId });
    recordEvent(ownerId, enrichedPayload);
    io?.to?.(`user:${ownerId}`).emit("event", enrichedPayload);
}

function emitStats(io, ownerId = "") {
    io?.to?.(`user:${ownerId}`).emit("stats", {
        tiktok: { ...getSessionStats(ownerId) }
    });
}

function resetSessionStats(ownerId = "") {
    sessionStatsByOwner.set(String(ownerId || "").trim(), { viewers: 0, likes: 0, gifts: 0, followers: 0, shares: 0 });
}

function setViewerCount(io, value) {
    return;
}

function normalizeLikeCount(data) {
    const candidates = [
        data?.likeCount,
        data?.totalLikeCount,
        data?.likes,
        data?.like_count,
        data?.count
    ];

    for (const candidate of candidates) {
        const n = toNumber(candidate, NaN);
        if (Number.isFinite(n) && n >= 0) return n;
    }

    return 1;
}

function normalizeGiftAmount(data) {
    const candidates = [
        data?.repeatCount,
        data?.repeatEndCount,
        data?.count,
        data?.giftCount,
        data?.amount
    ];

    for (const candidate of candidates) {
        const n = toNumber(candidate, NaN);
        if (Number.isFinite(n) && n > 0) return n;
    }

    return 1;
}

async function avatarFor(data, nickname, uniqueId) {
    return await resolveTiktokAvatar(uniqueId || nickname, data?.user || data?.details?.user || null);
}

function resolveChatMessage(data) {
    const emoteText = clean(
        data?.emoteList?.map?.((entry) => clean(entry?.emoteId || entry?.emoteName, "")).filter(Boolean).join(" "),
        ""
    );
    const stickerMedia = resolveStickerMedia(data);
    const stickerText = clean(
        stickerMedia?.name ??
        data?.sticker?.name ??
        data?.sticker?.title ??
        data?.stickerName ??
        data?.sticker?.stickerName ??
        data?.sticker?.stickerTitle,
        ""
    );

    const candidates = [
        data?.comment,
        data?.text,
        data?.message,
        data?.msg,
        data?.content,
        data?.emoji,
        emoteText,
        stickerText ? `Sticker: ${stickerText}` : "",
    ];

    for (const candidate of candidates) {
        const value = clean(stripBracketedSegments(candidate), "");
        if (value) return value;
    }

    return "";
}

async function handleSocialEvent(io, data, forcedType = null, ownerId = "") {
    const { nickname, uniqueId } = pickUser(data);

    const rawAction = clean(
        forcedType ||
        data?.action ||
        data?.socialType ||
        data?.shareType ||
        data?.type,
        "social"
    ).toLowerCase();

    const badges = collectBadges(data, data?.user || data?.details?.user || null);

    if (rawAction.includes("follow") || rawAction.includes("followed")) {
        getSessionStats(ownerId).followers += 1;
        const viewerProfile = database.markViewerFollow(ownerId, "tiktok", uniqueId, nickname);
        const viewer = {
            followedBefore: true,
            everDonated: Boolean(viewerProfile?.everDonated),
            totalDonations: Number(viewerProfile?.totalDonations || 0),
            vipRgb: Boolean(viewerProfile?.vipRgb),
        };
        emitEvent(io, {
            type: "follow",
            emoji: "👤",
            action: "Follow",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            viewer,
            followedBefore: true,
            persistentFollowed: true,
            message: `${nickname} comenzó a seguir`
        }, ownerId);
        emitStats(io, ownerId);
        return;
    }

    if (rawAction.includes("share")) {
        getSessionStats(ownerId).shares += 1;
        emitEvent(io, {
            type: "share",
            emoji: "🗣",
            action: "Share",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            message: `${nickname} compartió el LIVE`
        }, ownerId);
        emitStats(io, ownerId);
        return;
    }

    emitEvent(io, {
        type: "system",
        action: "Acción social",
        user: nickname,
        uniqueId,
        avatar: await avatarFor(data, nickname, uniqueId),
        message: clean(data?.message ?? data?.text ?? data?.action, "Acción social")
    }, ownerId);
}

export async function connect(username, io, ownerId = "", options = {}) {
    const owner = String(ownerId || "").trim();
    if (!owner) throw new Error("Cuenta no identificada.");
    const state = getReconnectState(owner);
    const isReconnect = Boolean(options?.reconnect);
    clearReconnectTimer(state);
    state.username = String(username || state.username || '').replace(/^@+/, '').trim();
    state.io = io;
    state.intentional = false;
    state.ending = false;
    state.reconnecting = isReconnect;

    const existing = connections.get(owner);
    if (existing) {
        try { await existing.disconnect(); } catch {}
        connections.delete(owner);
    }
    const normalizedUser = normalizeUsername(username);

    if (!normalizedUser) {
        throw new Error("Debes ingresar un usuario válido de TikTok.");
    }

    // Las reconexiones mantienen las estadisticas acumuladas del LIVE.
    if (!isReconnect) resetSessionStats(owner);
    const stats = getSessionStats(owner);
    const currentConnection = new TikTokLiveConnection(normalizedUser, {
        signApiKey: process.env.EULER_API_KEY
    });

    // Register the connection before awaiting connect() so event handlers can reject
    // any late callbacks from an older connection during rapid reconnects.
    connections.set(owner, currentConnection);
    const isCurrentConnection = () => connections.get(owner) === currentConnection;
    const emitChatForOwner = (event) => { if (isCurrentConnection()) emitChat(io, event, owner); };
    const emitEventForOwner = (event) => { if (isCurrentConnection()) emitEvent(io, event, owner); };
    const emitStatsForOwner = () => { if (isCurrentConnection()) emitStats(io, owner); };

    currentConnection.on(ControlEvent.CONNECTED, (connectionState) => {
        if (!isCurrentConnection()) return;
        const reconnectState = getReconnectState(owner);
        reconnectState.connectedOnce = true;
        reconnectState.attempt = 0;
        reconnectState.reconnecting = false;
        io?.to?.(`user:${owner}`).emit("accountState", { platform:"tiktok", username:normalizedUser, connected:true, live:true, mode:"live", liveId: `live-${Date.now()}` });
        emitSystem(io, `TikTok conectado a @${normalizedUser}.`);

        if (connectionState?.roomId) {
            emitSystem(io, `Room ID: ${connectionState.roomId}`);
        }

        emitStatsForOwner();
    });

    currentConnection.on(ControlEvent.DISCONNECTED, () => {
        if (!isCurrentConnection()) return;
        const reconnectState = getReconnectState(owner);
        // Invalidamos esta conexión antes de programar el reemplazo. Así los
        // callbacks tardíos de la instancia vieja nunca pueden duplicar eventos.
        connections.delete(owner);
        reconnectState.reconnecting = false;

        if (reconnectState.intentional || reconnectState.ending || !reconnectState.connectedOnce) {
            io?.to?.(`user:${owner}`).emit("accountState", {
                platform:"tiktok", username:normalizedUser, connected:false, live:false,
                mode:"saved", stateReason:"transport-disconnect"
            });
            emitSystem(io, "TikTok desconectado.");
            return;
        }

        io?.to?.(`user:${owner}`).emit("accountState", {
            platform:"tiktok", username:normalizedUser, connected:false, live:true,
            mode:"reconnecting", stateReason:"transport-disconnect"
        });
        scheduleReconnect(owner);
    });

    currentConnection.on(ControlEvent.ERROR, (data) => {
        if (!isCurrentConnection()) return;
        const msg =
            data?.exception?.message ||
            data?.info ||
            data?.message ||
            "Error de TikTok";
        emitSystem(io, msg);
    });

    currentConnection.on(E.CHAT, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);
        const viewerProfile = database.findViewerProfile(owner, "tiktok", uniqueId) || null;
        const viewer = viewerProfile ? {
            everDonated: Boolean(viewerProfile.everDonated),
            totalDonations: Number(viewerProfile.totalDonations || 0),
            followedBefore: Boolean(viewerProfile.followedBefore),
            vipRgb: Boolean(viewerProfile.vipRgb),
            giftBadge: viewerProfile.giftBadge || null,
        } : { everDonated:false, totalDonations:0, followedBefore:false, vipRgb:false, giftBadge:null };
        const stickerMedia = resolveStickerMedia(data);

        const message = resolveChatMessage(data) || clean(stripBracketedSegments(data?.comment ?? data?.text ?? data?.message), "");
        const isSticker = Boolean(
            stickerMedia?.image ||
            data?.sticker ||
            data?.stickerName ||
            data?.sticker?.name ||
            data?.sticker?.title ||
            data?.emoteList?.length
        );
        const emoji = isSticker ? "🧩" : typeEmoji("chat", "💬");

        const immediateAvatar = getAvatarFromUserObject(data?.user || data?.details?.user || null);
        emitChatForOwner({
            type: isSticker ? "sticker" : "chat",
            emoji,
            action: isSticker ? "Sticker" : "Comentario",
            user: nickname,
            uniqueId,
            avatar: immediateAvatar,
            badges,
            viewer,
            persistentDonor: viewer.everDonated,
            everDonated: viewer.everDonated,
            sticker: stickerMedia?.name || "",
            stickerImage: stickerMedia?.image || "",
            stickerAlt: stickerMedia?.alt || "",
            stickerId: stickerMedia?.id || "",
            message: message || (isSticker ? clean(stickerMedia?.name || data?.sticker?.name || data?.stickerName || data?.sticker?.title, "Sticker") : "")
        });
    });

    currentConnection.on(E.GIFT, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);
        const giftMedia = resolveGiftMedia(data);
        const giftName = giftMedia.name;

        const amount = normalizeGiftAmount(data);
        const viewerProfile = database.markViewerDonated(owner, "tiktok", uniqueId, nickname, amount);
        const lastGiftBadge = {
            image: giftMedia.image || "",
            name: giftMedia.name || "Regalo",
            key: giftMedia.key || normalizeGiftKey(giftMedia.name || ""),
            id: String(giftMedia.id || data?.giftId || data?.giftDetails?.giftId || ""),
            updatedAt: Date.now(),
        };
        // Persistir el ultimo regalo aqui mismo garantiza que Dashboard Chat y
        // Chat Overlay compartan la misma fuente de verdad, independientemente
        // del modulo de puntos o del orden de los hooks.
        const persistedGiftProfile = database.setViewerLastGift(owner, "tiktok", uniqueId, lastGiftBadge, nickname);
        const viewer = {
            everDonated: true,
            donorBadge: true,
            totalDonations: Number(viewerProfile?.totalDonations || 0),
            followedBefore: Boolean(viewerProfile?.followedBefore),
            vipRgb: Boolean(persistedGiftProfile?.vipRgb ?? viewerProfile?.vipRgb),
            giftBadge: persistedGiftProfile?.giftBadge || lastGiftBadge,
            liveBadges: {
                donor: true,
                giftBadge: lastGiftBadge,
            },
        };
        stats.gifts += amount;
        emitStatsForOwner();

        const isStreak = data?.giftDetails?.giftType === 1;
        const suffix = isStreak && data?.repeatEnd === false ? " (en curso)" : "";

        emitEventForOwner({
            type: "gift",
            emoji: "🎁",
            action: "Regalo",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            viewer,
            persistentDonor: true,
            everDonated: true,
            gift: giftName,
            giftImage: giftMedia.image,
            giftCoins: giftMedia.coins,
            giftAlt: giftMedia.alt,
            amount,
            message: `🎁 ${giftName} x${amount}${suffix}`
        });
    });

    currentConnection.on(E.LIKE, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);
        const likes = normalizeLikeCount(data);

        stats.likes += likes;
        emitStatsForOwner();

        emitEventForOwner({
            type: "like",
            emoji: "❤️",
            action: "Like",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            likes,
            message: `${nickname} dio ${likes} like${likes === 1 ? "" : "s"}`
        });
    });

    currentConnection.on(E.MEMBER, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);

        emitEventForOwner({
            type: "join",
            emoji: "👻",
            action: "Entrada",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            message: `${nickname} entró al directo`
        });
    });

    currentConnection.on(E.SOCIAL, async (data) => {
        if (!isCurrentConnection()) return;
        handleSocialEvent(io, data, null, owner);
    });

    if (E.FOLLOW !== E.SOCIAL) {
        currentConnection.on(E.FOLLOW, async (data) => { if (isCurrentConnection()) handleSocialEvent(io, data, "follow", owner); });
    }

    if (E.SHARE !== E.SOCIAL) {
        currentConnection.on(E.SHARE, async (data) => { if (isCurrentConnection()) handleSocialEvent(io, data, "share", owner); });
    }

    currentConnection.on(E.EMOTE, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);
        const stickerMedia = resolveStickerMedia(data);

        const emoteId = clean(
            data?.emoteList?.[0]?.emoteId ??
            data?.emoteId ??
            data?.emoteName,
            "emote"
        );

        emitChatForOwner({
            type: "sticker",
            emoji: "🧩",
            action: "Sticker",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            sticker: stickerMedia?.name || emoteId,
            stickerImage: stickerMedia?.image || "",
            stickerAlt: stickerMedia?.alt || emoteId,
            stickerId: stickerMedia?.id || emoteId,
            message: stickerMedia?.name || `Sticker: ${emoteId}`
        });
    });

    currentConnection.on(E.QUESTION_NEW, async (data) => {
        const { nickname, uniqueId } = pickUser(data);
        const question = clean(
            data?.details?.questionText ??
            data?.questionText ??
            data?.text ??
            data?.message,
            "Pregunta"
        );

        emitEventForOwner({
            type: "question",
            emoji: "❓",
            action: "Pregunta",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            message: question
        });
    });



    currentConnection.on(E.LIVE_INTRO, async (data) => {
        const { nickname, uniqueId } = pickUser(data);

        emitEventForOwner({
            type: "system",
            emoji: "🎬",
            action: "Intro del directo",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            message: "Comenzó la intro del live"
        });
    });

    currentConnection.on(E.STREAM_END, () => {
        const reconnectState = getReconnectState(owner);
        reconnectState.ending = true;
        reconnectState.connectedOnce = false;
        clearReconnectTimer(reconnectState);
        if (connections.get(owner) === currentConnection) connections.delete(owner);
        emitEventForOwner({
            type: "system",
            emoji: "⏹️",
            action: "Fin del live",
            user: "TikTok",
            uniqueId: "",
            avatar: avatarFallback("TikTok"),
            message: "TikTok cerró el directo"
        });
    });

    currentConnection.on(E.ENVELOPE, async (data) => {
        const envelope = data?.envelopeInfo || {};
        const diamondCount = toNumber(envelope?.diamondCount ?? 0, 0);

        emitEventForOwner({
            type: "system",
            emoji: "💌",
            action: "Sobre",
            user: clean(envelope?.sendUserName ?? "TikTok"),
            uniqueId: "",
            avatar: avatarFallback(clean(envelope?.sendUserName ?? "TikTok")),
            message: `💌 Sobre: ${diamondCount} diamantes`
        });
    });

    currentConnection.on(E.SUPER_FAN, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);

        emitEventForOwner({
            type: "system",
            emoji: "🌟",
            action: "Super Fan",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            message: `${nickname} activó Super Fan`
        });
    });

    currentConnection.on(E.SUPER_FAN_JOIN, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);

        emitEventForOwner({
            type: "system",
            emoji: "🌟",
            action: "Super Fan",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            message: `${nickname} se unió como Super Fan`
        });
    });

    currentConnection.on(E.SUPER_FAN_BOX, async (data) => {
        const { nickname, uniqueId, user } = pickUser(data);
        const badges = collectBadges(data, user);

        emitEventForOwner({
            type: "system",
            emoji: "🎁",
            action: "Caja Super Fan",
            user: nickname,
            uniqueId,
            avatar: await avatarFor(data, nickname, uniqueId),
            badges,
            message: `${nickname} recibió una caja Super Fan`
        });
    });

    try {
        await currentConnection.connect();
    } catch (error) {
        if (connections.get(owner) === currentConnection) connections.delete(owner);
        throw error;
    }
}

export async function disconnect(ownerId = "") {
    const owner = String(ownerId || "").trim();
    if (!owner) return;
    cancelReconnect(owner, false);
    const current = connections.get(owner);
    if (current) {
        try { await current.disconnect(); } catch {}
        connections.delete(owner);
    }
    sessionStatsByOwner.delete(owner);
    reconnectStates.delete(owner);
}
