/**
 * Kick connector.
 *
 * This adapter intentionally follows the same contract used by TikTok/Twitch:
 *   - connect/disconnect per owner
 *   - emit chat/event/stats/system through the shared Socket.IO emitter
 *   - feed the existing points/music/roulette/database hooks
 *
 * It uses Kick's current anonymous realtime chat transport (no user OAuth):
 * a realtime descriptor selects Kick's Centrifugo WebSocket endpoint, then the
 * adapter subscribes to the channel chatroom. No Kick user login is requested.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const clients = new Map();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const KICK_BASE = "https://kick.com";
const KICK_PUSHER_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";
const KICK_REALTIME_CONNECTION_URL = "https://web.kick.com/api/v1/realtime/channels";

function cleanChannel(value) {
  let channel = String(value || "").trim();
  if (!channel) return "";
  channel = channel.replace(/^@+/, "");
  channel = channel.replace(/^https?:\/\/(?:www\.)?kick\.com\//i, "");
  channel = channel.split(/[?#/]/)[0];
  return channel.trim().toLowerCase();
}

function ownerKey(ownerId) {
  return String(ownerId || "").trim();
}

function decodeMaybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeBadges(badges) {
  if (!Array.isArray(badges)) return [];
  return badges
    .map((badge) => {
      if (typeof badge === "string") return badge;
      if (!badge || typeof badge !== "object") return "";
      return String(
        badge.name || badge.type || badge.badge || badge.text || "",
      ).trim();
    })
    .filter(Boolean);
}

function resolveSender(data, preferred = []) {
  const candidates = [
    ...preferred.map((key) => data?.[key]),
    data?.sender,
    data?.user,
    data?.author,
    data?.owner,
    data?.follower,
    data?.subscriber,
    data?.gifter,
    data?.redeemer,
    data?.gifter?.user,
    data?.subscriber?.user,
    data?.follower?.user,
  ].filter((value) => value && typeof value === "object");

  const sender = candidates.find((candidate) =>
    Boolean(candidate?.username || candidate?.slug || candidate?.display_name || candidate?.id || candidate?.user_id),
  ) || {};
  const identity = sender?.identity || data?.identity || {};

  const username = String(
    sender.username ||
      sender.slug ||
      sender.display_name ||
      data?.username ||
      data?.gifter_username ||
      data?.gifter?.username ||
      data?.subscriber?.username ||
      data?.follower?.username ||
      data?.gifted_by ||
      data?.host_username ||
      "Usuario",
  ).trim();

  const displayName = String(
    sender.display_name || sender.displayName || sender.name || username,
  ).trim();

  const uniqueId = String(
    sender.id || sender.user_id || sender.userId || data?.user_id || data?.gifter_id || username,
  ).trim();
  const color = String(
    identity.color || identity.username_color || sender.username_color || sender.color || "",
  ).trim();
  // Kick's Pusher payloads have appeared with several avatar field names.
  // Some older frames use profile_thumb; current websocket frames may omit it entirely.
  const avatar = String(
    sender.profile_picture ||
      sender.profilePicture ||
      sender.profile_pic ||
      sender.profile_thumb ||
      sender.profile_thumb_url ||
      sender.avatar ||
      sender.avatar_url ||
      sender.avatarUrl ||
      sender.picture ||
      sender.picture_url ||
      "",
  ).trim();

  const badges = normalizeBadges(
    identity.badges || sender.badges || sender.follower_badges || data?.badges || [],
  );

  return { username, displayName, uniqueId, color, avatar, badges };
}

function timestampOf(data) {
  const candidate =
    data?.created_at ??
    data?.timestamp ??
    data?.createdAt ??
    data?.time ??
    Date.now();
  const numeric = typeof candidate === "number" ? candidate : Number(candidate);
  const time = Number.isFinite(numeric)
    ? (numeric > 0 && numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(candidate).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function normalizeEventType(name, data) {
  const eventName = String(name || "").toLowerCase();
  if (eventName.includes("follow") || eventName.includes("follower")) return "follow";
  if (eventName.includes("subscription") || eventName.includes("sub")) {
    if (eventName.includes("gift") || eventName.includes("luckyuserswhogotgift")) return "subscription-gift";
    return "sub";
  }
  if (eventName.includes("kicks") && eventName.includes("gift")) return "gift";
  if (eventName.includes("gift")) return "gift";
  if (eventName.includes("streamhost") || eventName.includes("host")) return "host";
  if (eventName.includes("raid")) return "raid";
  if (eventName.includes("ban")) return "system";
  if (eventName.includes("reward") || eventName.includes("redemption")) return "system";
  if (eventName.includes("streamerislive") || eventName.includes("stopstream") || eventName.includes("livestreamupdated") || eventName.includes("updatedlivestream")) return "system";
  if (data?.followed === true || data?.followed === "true" || data?.follower?.username) return "follow";
  if (data?.subscription || data?.months_subscribed || data?.is_subscribed === true) return "sub";
  if (data?.gifted_quantity || data?.gift_transaction_id || data?.gift) return "gift";
  if (data?.type && typeof data.type === "string") return data.type.toLowerCase();
  return "event";
}

function normalizeEvent(data, eventName) {
  const raw = data && typeof data === "object" ? data : {};
  const payload = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const type = normalizeEventType(eventName, payload);
  const preferred =
    type === "follow" ? ["follower", "user", "sender"] :
    type === "sub" ? ["subscriber", "user", "sender"] :
    type === "subscription-gift" ? ["gifter", "sender", "user"] :
    type === "gift" ? ["sender", "gifter", "user"] :
    type === "raid" || type === "host" ? ["hoster", "sender", "user"] :
    ["sender", "user", "author", "owner"];

  const sender = resolveSender(payload, preferred);
  const gift = payload?.gift && typeof payload.gift === "object" ? payload.gift : null;
  const giftees = Array.isArray(payload?.giftees)
    ? payload.giftees
    : Array.isArray(payload?.gifted_users)
      ? payload.gifted_users
      : Array.isArray(payload?.recipients)
        ? payload.recipients
        : [];
  const quantity = Number(
    payload?.quantity ??
      payload?.total ??
      payload?.count ??
      payload?.gifted_quantity ??
      payload?.months ??
      payload?.coins ??
      payload?.kicks ??
      (type === "subscription-gift" ? giftees.length : 0) ??
      0,
  ) || 0;
  const amount = Number(
    payload?.amount ??
      payload?.value ??
      gift?.amount ??
      quantity ??
      0,
  ) || 0;
  const giftId = String(
    payload?.gift_id || payload?.giftId || gift?.gift_id || gift?.id || "",
  ).trim();
  const giftName = String(
    payload?.giftName ?? payload?.gift_name ?? gift?.name ?? gift?.title ??
      (type === "sub" ? "Suscripción" : type === "subscription-gift" ? "Suscripciones regaladas" : type === "gift" ? "Regalo" : ""),
  ).trim();
  const message = String(
    payload?.message ?? payload?.content ?? gift?.message ?? "",
  ).trim();
  const sourceId = String(
    payload?.id || payload?.event_id || payload?.eventId || payload?.message_id || payload?.gift_transaction_id || "",
  ).trim();
  return {
    type,
    group: ["gift", "sub", "subscription", "resub", "bits", "raid", "host", "subscription-gift"].includes(type)
      ? "gift"
      : ["follow", "like", "share", "join"].includes(type)
        ? "event"
        : "system",
    action:
      type === "follow" ? "Follow" :
      type === "sub" ? "Suscripción" :
      type === "subscription-gift" ? "Suscripciones regaladas" :
      type === "gift" ? "Regalo" :
      type === "raid" ? "Raid" :
      type === "host" ? "Host" :
      "Evento",
    username: sender.username,
    displayName: sender.displayName,
    uniqueId: sender.uniqueId,
    identityKey: sender.uniqueId || sender.username,
    avatar: sender.avatar,
    avatarUrl: sender.avatar,
    profilePictureUrl: sender.avatar,
    color: sender.color,
    badges: sender.badges,
    platform: "kick",
    source: "event",
    timestamp: timestampOf(source),
    event: eventName,
    eventId: sourceId || undefined,
    message,
    gift: gift || undefined,
    giftName: giftName || undefined,
    giftId: giftId || undefined,
    quantity,
    gifteeCount: giftees.length || undefined,
    amount,
    giftCoins: Number(payload?.gift_coins ?? payload?.coins ?? gift?.amount ?? payload?.amount ?? 0) || 0,
    data: payload,
  };
}

function emitScoped(io, ownerId, event, payload) {
  if (!io) return;
  const room = `user:${ownerId}`;
  io.to(room).emit(event, payload);
}

function recordChat(ownerId, payload) {
  try {
    globalThis.__STREAMFUSION_RECORD_CHAT__?.(ownerId, payload);
  } catch (error) {
    console.error("[Kick] recordChat hook failed:", error);
  }
}

function recordEvent(ownerId, payload) {
  try {
    globalThis.__STREAMFUSION_RECORD_EVENT__?.(ownerId, payload);
  } catch (error) {
    console.error("[Kick] recordEvent hook failed:", error);
  }
}

function awardPoints(ownerId, payload) {
  try {
    return globalThis.__STREAMFUSION_POINTS_HOOK__?.(ownerId, payload) || payload;
  } catch (error) {
    console.error("[Kick] points hook failed:", error);
    return payload;
  }
}

function musicHook(ownerId, payload) {
  try {
    return globalThis.__STREAMFUSION_MUSIC_HOOK__?.(ownerId, payload);
  } catch (error) {
    console.error("[Kick] music hook failed:", error);
    return null;
  }
}

function rouletteHook(ownerId, payload) {
  try {
    const hook = globalThis.__STREAMFUSION_ROULETTE_HOOK__;
    if (hook?.ingestChat && payload?.source === "chat") return hook.ingestChat(ownerId, payload);
    if (hook?.ingestEvent && payload?.source === "event") return hook.ingestEvent(ownerId, payload);
    return null;
  } catch (error) {
    console.error("[Kick] roulette hook failed:", error);
    return null;
  }
}

async function fetchJson(url, { headers = {} } = {}) {
  const requestHeaders = {
    accept: "application/json, text/plain, */*",
    "user-agent": USER_AGENT,
    referer: "https://kick.com/",
    origin: "https://kick.com",
    ...headers,
  };


  const response = await fetch(url, { headers: requestHeaders });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail =
      typeof data === "string"
        ? data.slice(0, 300)
        : data?.message || data?.error || `${response.statusText}`;
    throw new Error(`HTTP ${response.status} en ${url}: ${detail}`);
  }

  return data;
}

async function curlJson(url, { method = "GET", body = null, timeoutSeconds = 20 } = {}) {
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--compressed",
    "--http1.1",
    "--max-time",
    String(timeoutSeconds),
    "--user-agent",
    USER_AGENT,
    "--header",
    "accept: application/json, text/plain, */*",
    "--header",
    "referer: https://kick.com/",
    "--header",
    "origin: https://kick.com",
  ];
  if (method !== "GET") args.push("--request", method);
  if (body !== null && body !== undefined) {
    args.push("--header", "content-type: application/json", "--data-binary", typeof body === "string" ? body : JSON.stringify(body));
  }
  args.push(url);

  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(curl, args, { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    stdout = String(result?.stdout || "");
    stderr = String(result?.stderr || "");
  } catch (error) {
    const detail = String(error?.stderr || error?.message || stderr || "curl falló").trim();
    throw new Error(`No se pudo consultar Kick mediante curl: ${detail.slice(0, 400)}`);
  }

  const text = stdout.trim();
  if (!text) throw new Error("Kick no devolvió datos de canal.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Kick devolvió una respuesta no JSON: ${text.slice(0, 300)}`);
  }
}

async function getChannelInfo(channelName) {
  const slug = cleanChannel(channelName);
  if (!slug) throw new Error("El canal de Kick está vacío");

  // Kick blocks server-side HTTP clients on this internal endpoint with a 403
  // when the TLS/client fingerprint does not look like a normal browser. curl uses
  // a native TLS stack and is also the approach used by current community clients.
  const data = await curlJson(
    `${KICK_BASE}/api/v2/channels/${encodeURIComponent(slug)}`,
  );

  if (!data?.chatroom?.id) {
    throw new Error(`Kick no devolvió un chatroom para @${slug}`);
  }

  return data;
}

const userAvatarCache = new Map();
const userAvatarInflight = new Map();
const USER_AVATAR_TTL = 24 * 60 * 60 * 1000;
const KICK_AVATAR_LOOKUP_TIMEOUT_SECONDS = 4;

async function lookupKickUserAvatar(channelName, username) {
  const channel = cleanChannel(channelName);
  const user = String(username || "").trim().replace(/^@+/, "").toLowerCase();
  if (!channel || !user) return "";
  const key = `${channel}:${user}`;
  const cached = userAvatarCache.get(key);
  if (cached && Date.now() - Number(cached.updatedAt || 0) < USER_AVATAR_TTL) return cached.avatarUrl || "";
  if (userAvatarInflight.has(key)) return userAvatarInflight.get(key);

  const promise = (async () => {
    try {
      const data = await curlJson(
        `${KICK_BASE}/api/v2/channels/${encodeURIComponent(channel)}/users/${encodeURIComponent(user)}`,
        { timeoutSeconds: KICK_AVATAR_LOOKUP_TIMEOUT_SECONDS },
      );
      const profile = data?.user || data || {};
      const avatarUrl = String(
        profile?.profile_pic || profile?.profile_picture || profile?.profilePicture ||
        profile?.avatar || profile?.avatar_url || profile?.picture ||
        data?.profile_pic || data?.profile_picture || data?.avatar || "",
      ).trim();
      if (/^https?:\/\//i.test(avatarUrl)) {
        userAvatarCache.set(key, { avatarUrl, updatedAt: Date.now() });
        return avatarUrl;
      }
    } catch (error) {
      // Avatar enrichment must never break chat delivery. Cache the miss briefly
      // so a chatter cannot trigger one HTTP request per message.
      userAvatarCache.set(key, { avatarUrl: "", updatedAt: Date.now() });
      console.warn(`[Kick] no se pudo obtener avatar de @${user}:`, error?.message || error);
    } finally {
      userAvatarInflight.delete(key);
    }
    return "";
  })();
  userAvatarInflight.set(key, promise);
  return promise;
}

async function getRealtimeDescriptor(channelId) {
  const data = await curlJson(
    `${KICK_REALTIME_CONNECTION_URL}/${encodeURIComponent(channelId)}/chat/connection`,
    { method: "POST", body: "{}", timeoutSeconds: 10 },
  );

  const connections = Array.isArray(data?.data?.connections) ? data.data.connections : [];
  const preferred = connections.find((entry) => String(entry?.provider || '').toLowerCase() === 'centrifugo') || connections[0];
  const url = String(preferred?.credentials?.url || '').trim();
  if (!url) throw new Error("Kick no devolvió una URL de WebSocket realtime para ese canal.");
  return { provider: String(preferred?.provider || '').toLowerCase(), url };
}

function clearReconnectTimer(client) {
  if (client.reconnectTimer) {
    clearTimeout(client.reconnectTimer);
    client.reconnectTimer = null;
  }
}

function closeSocket(client) {
  if (!client.ws) return;
  try {
    client.ws.onclose = null;
    client.ws.onerror = null;
    client.ws.onmessage = null;
    client.ws.onopen = null;
    client.ws.close();
  } catch {
    // no-op
  }
  client.ws = null;
}

function send(client, payload) {
  if (!client.ws) return false;
  try {
    if (client.ws.readyState !== 1) return false;
    client.ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("[Kick] send failed:", error);
    return false;
  }
}

function sendPusherPong(client) {
  return send(client, { event: "pusher:pong", data: "{}" });
}

function startPing(client) {
  if (client.pingTimer) clearInterval(client.pingTimer);
  client.pingTimer = null;
}

function stopPing(client) {
  if (client.pingTimer) {
    clearInterval(client.pingTimer);
    client.pingTimer = null;
  }
}

function emitSystem(client, message, extra = {}) {
  emitScoped(client.io, client.ownerId, "system", {
    platform: "kick",
    message,
    ...extra,
  });
}

function emitStats(client) {
  emitScoped(client.io, client.ownerId, "stats", {
    kick: {
      viewers: Number(client.channelInfo?.livestream?.viewer_count || 0),
      likes: 0,
      followers: Number(client.channelInfo?.followers_count || 0),
      subscriptions: 0,
      gifts: 0,
    },
  });
}

async function emitChat(client, payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const nested = raw?.message && typeof raw.message === "object" ? raw.message : {};
  const source = Object.keys(nested).length ? { ...raw, ...nested } : raw;
  const sender = resolveSender(source);
  const content = String(
    source?.content || source?.message || raw?.message?.message || raw?.data?.content || "",
  ).trim();
  const messageId = String(
    source?.id || source?.message_id || source?.messageId || raw?.id || raw?.message?.id || "",
  ).trim();
  if (!content) return;
  if (messageId && client.seenMessageIds.has(messageId)) return;
  if (messageId) {
    client.seenMessageIds.add(messageId);
    if (client.seenMessageIds.size > 1500) {
      const first = client.seenMessageIds.values().next().value;
      client.seenMessageIds.delete(first);
    }
  } else {
    const fp = `fp|${sender.uniqueId || sender.username}|${content}|${Math.floor(timestampOf(source) / 1500)}`;
    const now = Date.now();
    for (const [key, at] of client.seenMessageFingerprints) {
      if (now - at > 6000) client.seenMessageFingerprints.delete(key);
    }
    if (client.seenMessageFingerprints.has(fp)) return;
    client.seenMessageFingerprints.set(fp, now);
  }

  let avatar = sender.avatar;
  if (!avatar) avatar = await lookupKickUserAvatar(client.channelName, sender.username);

  globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.({ platform: "kick", username: sender.username, uniqueId: sender.uniqueId, avatar });

  const chat = {
    id: messageId || undefined,
    type: "chat",
    source: "chat",
    platform: "kick",
    username: sender.username,
    displayName: sender.displayName,
    uniqueId: sender.uniqueId,
    avatar,
    color: sender.color,
    badges: sender.badges,
    comment: content,
    message: content,
    timestamp: timestampOf(payload),
    verified: false,
  };

  const enrichedPayload = awardPoints(client.ownerId, chat) || chat;
  emitScoped(client.io, client.ownerId, "chat", enrichedPayload);
  recordChat(client.ownerId, enrichedPayload);
  musicHook(client.ownerId, enrichedPayload);
  rouletteHook(client.ownerId, enrichedPayload);
}

function eventFingerprint(eventName, payload) {
  const item = payload && typeof payload === "object" ? payload : {};
  const normalized = normalizeEvent(item, eventName);
  const ts = Number(normalized.timestamp || 0);
  const bucket = ts ? Math.floor(ts / 1500) : 0;
  const id = String(normalized.eventId || item?.id || item?.event_id || item?.message_id || item?.gift_transaction_id || item?.correlation_id || "").trim();
  if (id) return `id|${String(eventName).toLowerCase()}|${id}`;
  return [
    "fp", String(eventName).toLowerCase(), normalized.type, normalized.uniqueId || normalized.username,
    normalized.action, normalized.giftId || normalized.giftName || "", normalized.quantity || "", normalized.amount || "", bucket,
  ].join("|");
}

function emitEvent(client, eventName, payload) {
  const dedupKey = eventFingerprint(eventName, payload);
  const now = Date.now();
  for (const [key, at] of client.seenEventKeys) {
    if (now - at > 15000) client.seenEventKeys.delete(key);
  }
  if (client.seenEventKeys.has(dedupKey)) return;
  client.seenEventKeys.set(dedupKey, now);

  const normalized = normalizeEvent(payload, eventName);
  globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.(normalized);
  const enrichedPayload = awardPoints(client.ownerId, normalized) || normalized;
  emitScoped(client.io, client.ownerId, "event", enrichedPayload);
  recordEvent(client.ownerId, enrichedPayload);

  if (enrichedPayload.type === "gift" || enrichedPayload.type === "subscription-gift") {
    musicHook(client.ownerId, enrichedPayload);
  }

  rouletteHook(client.ownerId, enrichedPayload);
}

async function handleFrame(client, raw) {
  const frame = decodeMaybeJson(raw);
  if (!frame || typeof frame !== "object") return;

  // Current Kick realtime transport: Centrifugo JSON protocol v2.
  if (Object.keys(frame).length === 0) {
    // Centrifugo heartbeat. Echo an empty JSON object.
    send(client, {});
    return;
  }
  if (frame.push && typeof frame.push === "object") {
    const push = frame.push;
    const channel = String(push.channel || "");
    const pub = push.pub && typeof push.pub === "object" ? push.pub : null;
    const payload = pub?.data && typeof pub.data === "object" ? pub.data : null;
    const eventName = String(payload?.event || "");
    const data = decodeMaybeJson(payload?.data);
    if (eventName && channel) {
      const lower = eventName.toLowerCase();
      if (lower.includes("chatmessage")) await emitChat(client, data);
      else if (lower.includes("followersupdated")) {
        if (data?.followed === true || data?.followed === "true") emitEvent(client, eventName, data);
      }
      else if (
        lower.includes("follow") ||
        lower.includes("follower") ||
        lower.includes("subscription") ||
        lower.includes("gift") ||
        lower.includes("host") ||
        lower.includes("raid") ||
        lower.includes("ban") ||
        lower.includes("redemption") ||
        lower.includes("streamerislive") ||
        lower.includes("stopstream") ||
        lower.includes("livestreamupdated") ||
        lower.includes("updatedlivestream") ||
      lower.includes("giftsleaderboardupdated") ||
      lower.includes("luckyuserswhogotgift") ||
      lower.includes("redemption")
      ) emitEvent(client, eventName, data);
    }
    return;
  }

  const eventName = String(frame.event || frame.type || "");
  const data = decodeMaybeJson(frame.data);

  if (eventName === "pusher:ping") {
    sendPusherPong(client);
    return;
  }
  if (eventName === "pusher:pong") return;
  if (eventName === "pusher:connection_established") return;

  if (eventName === "pusher:error") {
    const message = typeof data === "object" ? JSON.stringify(data) : String(data || "");
    emitSystem(client, "Kick devolvió un error de transporte.", {
      detail: message.slice(0, 400),
    });
    return;
  }

  const normalizedEvent = eventName.toLowerCase();
  if (normalizedEvent.includes("chatmessage")) {
    await emitChat(client, data);
    return;
  }

  if (normalizedEvent.includes("followersupdated") && !(data?.followed === true || data?.followed === "true")) {
    return;
  }

  if (
    normalizedEvent.includes("follow") ||
    normalizedEvent.includes("follower") ||
    normalizedEvent.includes("subscription") ||
    normalizedEvent.includes("gift") ||
    normalizedEvent.includes("host") ||
    normalizedEvent.includes("raid") ||
    normalizedEvent.includes("ban") ||
    normalizedEvent.includes("redemption") ||
    normalizedEvent.includes("streamerislive") ||
    normalizedEvent.includes("stopstream") ||
    normalizedEvent.includes("livestreamupdated") ||
    normalizedEvent.includes("updatedlivestream") ||
    normalizedEvent.includes("giftsleaderboardupdated") ||
    normalizedEvent.includes("luckyuserswhogotgift") ||
    normalizedEvent.includes("redemption")
  ) {
    emitEvent(client, eventName, data);
  }
}

function scheduleReconnect(client) {
  if (client.manualDisconnect || !clients.has(client.ownerId)) return;
  clearReconnectTimer(client);

  const delay = Math.min(30_000, Math.max(5_000, client.reconnectDelay));
  client.reconnectDelay = Math.min(30_000, delay * 2);
  client.reconnectTimer = setTimeout(() => {
    client.reconnectTimer = null;
    openSocket(client).catch((error) => {
      console.error(`[Kick] reconnect failed for ${client.ownerId}:`, error);
      emitSystem(client, "No se pudo reconectar a Kick.", {
        detail: String(error?.message || error),
      });
      scheduleReconnect(client);
    });
  }, delay);
}

async function openSocket(client) {
  closeSocket(client);
  stopPing(client);

  let descriptor;
  try {
    descriptor = await getRealtimeDescriptor(client.channelId);
  } catch (error) {
    // Preserve the previously working anonymous Pusher transport as a fallback.
    console.warn("[Kick] descriptor realtime no disponible; usando Pusher fallback:", error?.message || error);
    descriptor = {
      provider: "pusher",
      url: KICK_PUSHER_URL,
    };
  }
  const WS = globalThis.WebSocket;
  if (typeof WS !== "function") {
    throw new Error("La versión de Node no expone WebSocket global. Usa Node.js 22+ para Kick.");
  }

  const ws = new WS(descriptor.url);
  client.ws = ws;
  client.provider = descriptor.provider || "centrifugo";

  await new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    ws.onopen = () => {
      client.reconnectDelay = 5_000;
      if (client.provider === "pusher") {
        // Keep the previously working Pusher transport, but subscribe to all
        // channel/chatroom variants that Kick clients have used. Some event
        // families are published on `channel.*` while chat is on `chatrooms.*`.
        // Duplicate deliveries are removed by message/event IDs below.
        const channels = [
          `chatroom_${client.chatroomId}`,
          `chatrooms.${client.chatroomId}.v2`,
          `channel_${client.channelId}`,
          `chatrooms.${client.chatroomId}`,
          `channel.${client.channelId}`,
          `predictions-channel-${client.channelId}`,
        ].filter((value, index, all) => value && all.indexOf(value) === index);
        for (const channel of channels) {
          send(client, {
            event: "pusher:subscribe",
            data: { auth: "", channel },
          });
        }
      } else {
        // Kick's current chat transport is Centrifugo JSON protocol v2.
        send(client, { id: 1, connect: {} });
        send(client, { id: 2, subscribe: { channel: `chatrooms.${client.chatroomId}.v2` } });
      }
      settle(resolve);
    };

    ws.onmessage = (messageEvent) => {
      void handleFrame(client, messageEvent.data).catch((error) => {
        console.error("[Kick] frame parse failed:", error);
      });
    };

    ws.onerror = (event) => {
      const error = new Error("Error de WebSocket realtime de Kick");
      error.cause = event;
      settle(reject, error);
    };

    ws.onclose = (event) => {
      stopPing(client);
      client.ws = null;
      if (!settled) {
        settle(reject, new Error(`Kick WebSocket cerrado durante la conexión (${event?.code || 0})`));
        return;
      }
      emitSystem(client, "La conexión de Kick se cerró; intentando reconectar.", {
        code: event?.code || 0,
        reason: event?.reason || "",
      });
      scheduleReconnect(client);
    };
  });
}

export async function connect(channelName, io, ownerId) {
  const id = ownerKey(ownerId);
  if (!id) throw new Error("ownerId es obligatorio para conectar Kick");

  disconnect(id);

  const slug = cleanChannel(channelName);
  if (!slug) throw new Error("Introduce un canal de Kick, por ejemplo @nombre");

  const channelInfo = await getChannelInfo(slug);
  const channelId = Number(channelInfo?.id || channelInfo?.user_id || 0);
  const chatroomId = Number(channelInfo?.chatroom?.id || 0);

  if (!chatroomId) {
    throw new Error(`No se encontró el chatroom del canal @${slug}`);
  }

  const client = {
    ownerId: id,
    io,
    channelName: slug,
    channelId,
    chatroomId,
    channelInfo,
    ws: null,
    pingTimer: null,
    reconnectTimer: null,
    reconnectDelay: 5_000,
    manualDisconnect: false,
    seenMessageIds: new Set(),
    seenMessageFingerprints: new Map(),
    seenEventKeys: new Map(),
  };

  clients.set(id, client);

  try {
    await openSocket(client);
  } catch (error) {
    clients.delete(id);
    stopPing(client);
    clearReconnectTimer(client);
    closeSocket(client);
    throw new Error(
      `Kick no pudo conectarse a @${slug}: ${String(error?.message || error)}`,
    );
  }

  emitStats(client);
  emitSystem(client, `Kick conectado: @${slug}`);

  const user = channelInfo?.user || {};
  return {
    username: String(user.username || user.slug || slug),
    displayName: String(user.name || user.username || slug),
    avatarUrl: String(
      user.profile_pic ||
        user.profile_picture ||
        user.avatar ||
        channelInfo?.profile_pic ||
        "",
    ),
    slug,
    channelId,
    chatroomId,
    isLive: Boolean(channelInfo?.livestream?.is_live || channelInfo?.livestream),
    channelInfo,
  };
}

export function disconnect(ownerId) {
  const id = ownerKey(ownerId);
  const client = clients.get(id);
  if (!client) return;

  client.manualDisconnect = true;
  clearReconnectTimer(client);
  stopPing(client);
  closeSocket(client);
  clients.delete(id);
}

export function isConnected(ownerId) {
  const client = clients.get(ownerKey(ownerId));
  return Boolean(client?.ws && client.ws.readyState === 1);
}

export function getState(ownerId) {
  const client = clients.get(ownerKey(ownerId));
  if (!client) {
    return {
      connected: false,
      channel: "",
      channelId: 0,
      chatroomId: 0,
    };
  }
  return {
    connected: isConnected(ownerId),
    channel: client.channelName,
    channelId: client.channelId,
    chatroomId: client.chatroomId,
  };
}

export { cleanChannel, getChannelInfo, lookupKickUserAvatar };
