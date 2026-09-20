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

const clients = new Map();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const KICK_BASE = "https://kick.com";
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

function resolveSender(data) {
  const sender = data?.sender || data?.user || data?.author || data?.owner || {};
  const identity = sender?.identity || data?.identity || {};

  const username = String(
    sender.username ||
      sender.slug ||
      sender.display_name ||
      data?.username ||
      data?.user?.username ||
      "Usuario",
  ).trim();

  const displayName = String(
    sender.display_name || sender.name || username,
  ).trim();

  const uniqueId = String(sender.id || sender.user_id || username).trim();
  const color = String(
    identity.color || sender.username_color || sender.color || "",
  ).trim();
  const avatar = String(
    sender.profile_picture ||
      sender.profile_pic ||
      sender.avatar ||
      sender.avatar_url ||
      "",
  ).trim();

  const badges = normalizeBadges(
    identity.badges || sender.badges || data?.badges || [],
  );

  return { username, displayName, uniqueId, color, avatar, badges };
}

function timestampOf(data) {
  const candidate =
    data?.created_at ||
    data?.timestamp ||
    data?.createdAt ||
    data?.time ||
    Date.now();
  const time = new Date(candidate).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function normalizeEventType(name, data) {
  const eventName = String(name || "").toLowerCase();
  if (eventName.includes("follow")) return "follow";
  if (eventName.includes("subscription") || eventName.includes("sub")) {
    if (eventName.includes("gift")) return "subscription-gift";
    return "sub";
  }
  if (eventName.includes("gift")) return "gift";
  if (eventName.includes("host") || eventName.includes("raid")) return "raid";
  if (eventName.includes("ban")) return "system";
  if (data?.type && typeof data.type === "string") return data.type;
  return "event";
}

function normalizeEvent(data, eventName) {
  const payload = data && typeof data === "object" ? data : {};
  const sender = resolveSender(payload);
  const type = normalizeEventType(eventName, payload);

  return {
    type,
    action:
      type === "follow"
        ? "Follow"
        : type === "sub"
          ? "Suscripción"
          : type === "subscription-gift"
            ? "Suscripciones regaladas"
            : type === "gift"
              ? "Regalo"
              : type === "raid"
                ? "Raid"
                : "Evento",
    username: sender.username,
    displayName: sender.displayName,
    uniqueId: sender.uniqueId,
    avatar: sender.avatar,
    color: sender.color,
    badges: sender.badges,
    platform: "kick",
    source: "event",
    timestamp: timestampOf(payload),
    event: eventName,
    data: payload,
    amount: Number(
      payload.amount ||
        payload.quantity ||
        payload.total ||
        payload.coins ||
        payload.kicks ||
        0,
    ),
    giftCoins: Number(
      payload.gift_coins || payload.coins || payload.amount || 0,
    ),
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

async function getChannelInfo(channelName) {
  const slug = cleanChannel(channelName);
  if (!slug) throw new Error("El canal de Kick está vacío");

  const data = await fetchJson(
    `${KICK_BASE}/api/v2/channels/${encodeURIComponent(slug)}`,
  );

  if (!data?.chatroom?.id) {
    throw new Error(`Kick no devolvió un chatroom para @${slug}`);
  }

  return data;
}

async function getRealtimeDescriptor(channelId) {
  const response = await fetch(`${KICK_REALTIME_CONNECTION_URL}/${encodeURIComponent(channelId)}/chat/connection`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      referer: `https://kick.com/`,
      origin: "https://kick.com",
    },
    body: "{}",
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const detail = data?.message || data?.error || raw?.slice(0, 300) || response.statusText;
    throw new Error(`HTTP ${response.status} en descriptor realtime de Kick: ${detail}`);
  }

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

function emitChat(client, payload) {
  const sender = resolveSender(payload);
  const content = String(payload?.content || payload?.message || "").trim();
  const messageId = String(
    payload?.id || payload?.message_id || payload?.messageId || "",
  ).trim();
  if (!content) return;
  if (messageId && client.seenMessageIds.has(messageId)) return;
  if (messageId) {
    client.seenMessageIds.add(messageId);
    if (client.seenMessageIds.size > 1500) {
      const first = client.seenMessageIds.values().next().value;
      client.seenMessageIds.delete(first);
    }
  }

  const chat = {
    id: messageId || undefined,
    type: "chat",
    source: "chat",
    platform: "kick",
    username: sender.username,
    displayName: sender.displayName,
    uniqueId: sender.uniqueId,
    avatar: sender.avatar,
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

function emitEvent(client, eventName, payload) {
  const normalized = normalizeEvent(payload, eventName);
  const enrichedPayload = awardPoints(client.ownerId, normalized) || normalized;
  emitScoped(client.io, client.ownerId, "event", enrichedPayload);
  recordEvent(client.ownerId, enrichedPayload);

  if (enrichedPayload.type === "gift" || enrichedPayload.type === "subscription-gift") {
    musicHook(client.ownerId, enrichedPayload);
  }

  rouletteHook(client.ownerId, enrichedPayload);
}

function handleFrame(client, raw) {
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
      if (lower.includes("chatmessage")) emitChat(client, data);
      else if (lower.includes("follow") || lower.includes("subscription") || lower.includes("gift") || lower.includes("host") || lower.includes("raid") || lower.includes("ban")) emitEvent(client, eventName, data);
      else if (lower.includes("livestreamupdated") || lower.includes("updatedlivestream")) emitEvent(client, eventName, data);
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
    emitChat(client, data);
    return;
  }

  if (
    normalizedEvent.includes("follow") ||
    normalizedEvent.includes("subscription") ||
    normalizedEvent.includes("gift") ||
    normalizedEvent.includes("host") ||
    normalizedEvent.includes("raid") ||
    normalizedEvent.includes("ban")
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

  const descriptor = await getRealtimeDescriptor(client.channelId);
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
        send(client, {
          event: "pusher:subscribe",
          data: { auth: "", channel: `chatrooms.${client.chatroomId}.v2` },
        });
        send(client, {
          event: "pusher:subscribe",
          data: { auth: "", channel: `channel.${client.channelId}` },
        });
      } else {
        // Kick's current chat transport is Centrifugo JSON protocol v2.
        send(client, { id: 1, connect: {} });
        send(client, { id: 2, subscribe: { channel: `chatrooms.${client.chatroomId}.v2` } });
      }
      settle(resolve);
    };

    ws.onmessage = (messageEvent) => {
      try {
        handleFrame(client, messageEvent.data);
      } catch (error) {
        console.error("[Kick] frame parse failed:", error);
      }
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

export { cleanChannel, getChannelInfo };
