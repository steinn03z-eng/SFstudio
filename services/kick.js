/**
 * Kick connector.
 *
 * This adapter intentionally follows the same contract used by TikTok/Twitch:
 *   - connect/disconnect per owner
 *   - emit chat/event/stats/system through the shared Socket.IO emitter
 *   - feed the existing points/music/roulette/database hooks
 *
 * It uses Kick's anonymous realtime chat transport (no user OAuth):
 * the existing public Pusher transport is opened directly and the adapter
 * subscribes to the channel chatroom/activity channels. No Kick user login is requested.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { recordChat, recordEvent } from "./live-history.js";

const execFileAsync = promisify(execFile);
const clients = new Map();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const KICK_BASE = "https://kick.com";
const KICK_PUSHER_URL =
  String(process.env.KICK_PUSHER_URL || "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false").trim();
const KICK_REALTIME_CONNECTION_URL = "https://web.kick.com/api/v1/realtime/channels";
const KICK_API_BASE = "https://api.kick.com/public/v1";
const KICK_OAUTH_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_CLIENT_ID = String(process.env.KICK_CLIENT_ID || "").trim();
const KICK_CLIENT_SECRET = String(process.env.KICK_CLIENT_SECRET || "").trim();
let kickAppToken = "";
let kickAppTokenExpiresAt = 0;
let kickAppTokenPromise = null;
const kickUserApiCache = new Map();
const kickUserApiInflight = new Map();
const globalSeenChatIds = new Map();
const globalSeenEventIds = new Map();
const webhookSeenIds = new Map();

function cleanChannel(value) {
  let channel = String(value || "").trim();
  if (!channel) return "";
  channel = channel.replace(/^@+/, "");
  channel = channel.replace(/^(?:https?:\/\/)?(?:www\.)?kick\.com\//i, "");
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

function trimSeenMap(map, ttlMs, maxSize = 5000) {
  const now = Date.now();
  for (const [key, at] of map) {
    if (now - Number(at || 0) > ttlMs) map.delete(key);
  }
  while (map.size > maxSize) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

async function getKickAppAccessToken() {
  if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) return "";
  if (kickAppToken && Date.now() < kickAppTokenExpiresAt - 60_000) return kickAppToken;
  if (kickAppTokenPromise) return kickAppTokenPromise;

  kickAppTokenPromise = (async () => {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
    });
    const response = await fetch(KICK_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok || !data?.access_token) {
      throw new Error(`Kick App Access Token HTTP ${response.status}: ${data?.error || data?.message || text.slice(0, 200)}`);
    }
    kickAppToken = String(data.access_token);
    kickAppTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    return kickAppToken;
  })().finally(() => { kickAppTokenPromise = null; });

  return kickAppTokenPromise;
}

async function kickPublicApi(pathname, options = {}) {
  const token = await getKickAppAccessToken();
  if (!token) return null;
  const response = await fetch(`${KICK_API_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`Kick API HTTP ${response.status}: ${data?.message || data?.error || text.slice(0, 200)}`);
  return data;
}

async function getKickUserById(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const key = String(Math.trunc(id));
  const cached = kickUserApiCache.get(key);
  if (cached) {
    const ttl = cached.profile ? 86_400_000 : 15_000;
    if (Date.now() - cached.updatedAt < ttl) return cached.profile || null;
  }
  if (kickUserApiInflight.has(key)) return kickUserApiInflight.get(key);
  const promise = (async () => {
    try {
      const data = await kickPublicApi(`/users?id=${encodeURIComponent(key)}`);
      const profile = Array.isArray(data?.data) ? data.data.find((u) => Number(u?.user_id) === id) : null;
      if (profile) {
        kickUserApiCache.set(key, { profile, updatedAt: Date.now() });
        return profile;
      }
    } catch (error) {
      // Official API enrichment is optional; legacy website fallback remains below.
    }
    // Do not cache a failed/unauthenticated lookup for a long period:
    // credentials can be added/reloaded and Kick can transiently reject requests.
    kickUserApiCache.set(key, { profile: null, updatedAt: Date.now() });
    return null;
  })().finally(() => kickUserApiInflight.delete(key));
  kickUserApiInflight.set(key, promise);
  return promise;
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

function scalarText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function firstScalarText(...values) {
  for (const value of values) {
    const text = scalarText(value);
    if (text) return text;
  }
  return "";
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
    data?.broadcaster,
    data?.banned_user,
    data?.moderator,
    data?.hoster,
    data?.raider,
    data?.gifter?.user,
    data?.subscriber?.user,
    data?.follower?.user,
    data?.banned_user?.user,
    data?.redeemer?.user,
  ].filter((value) => value && typeof value === "object");

  const preferredCandidates = preferred
    .map((key) => data?.[key])
    .filter((value) => value && typeof value === "object");
  // Preserve the semantic actor selected by the event type even when Kick marks
  // that actor anonymous and therefore supplies no username/user_id (for example
  // an anonymous subscription gifter). Falling back to the broadcaster in that
  // case would make the gift look like it was sent by the streamer.
  const selected = preferredCandidates.find((candidate) =>
    Boolean(candidate?.username || candidate?.slug || candidate?.display_name || candidate?.displayName),
  ) || preferredCandidates.find((candidate) => candidate?.is_anonymous === true) ||
    candidates.find((candidate) =>
      Boolean(candidate?.username || candidate?.slug || candidate?.display_name || candidate?.displayName),
    ) || candidates.find((candidate) => Boolean(candidate?.id || candidate?.user_id)) || {};
  const nestedUser = selected?.user && typeof selected.user === "object" ? selected.user : null;
  const sender = nestedUser ? { ...selected, ...nestedUser } : selected;
  const identity = sender?.identity || nestedUser?.identity || data?.identity || {};

  const username = firstScalarText(
    sender.username,
    sender.slug,
    sender.display_name,
    data?.username,
    data?.gifter_username,
    data?.gifter?.username,
    data?.subscriber?.username,
    data?.follower?.username,
    data?.gifted_by,
    data?.host_username,
    data?.hoster,
    data?.raider,
    data?.hosted_by,
    "Usuario",
  );

  const displayName = firstScalarText(
    sender.display_name,
    sender.displayName,
    sender.name,
    username,
  );

  const userId = String(
    sender.user_id || sender.userId || sender.id || data?.user_id || data?.gifter_id || data?.follower?.user_id || data?.subscriber?.user_id || data?.gifter?.user_id || data?.redeemer?.user_id || data?.banned_user?.user_id || data?.moderator?.user_id || data?.hoster?.user_id || data?.raider?.user_id || "",
  ).trim();
  const uniqueId = userId || username;
  const color = String(
    identity.color || identity.username_color || sender.username_color || sender.color || "",
  ).trim();
  // Kick's Pusher payloads have appeared with several avatar field names.
  // Some older frames use profile_thumb; current websocket frames may omit it entirely.
  const avatar = String(
    sender.profile_picture ||
      sender.profilepic ||
      sender.profilePicture ||
      sender.profile_pic ||
      sender.profile_thumb ||
      sender.profile_thumb_url ||
      sender.avatar ||
      sender.avatar_url ||
      sender.avatarUrl ||
      sender.picture ||
      sender.picture_url ||
      sender.profile_picture_url ||
      sender.profileImage ||
      sender.profile_image ||
      sender.photo ||
      sender.image ||
      sender.image_url ||
      "",
  ).trim();

  const badges = normalizeBadges(
    identity.badges || sender.badges || sender.follower_badges || data?.badges || [],
  );

  return { username, displayName, uniqueId, userId, color, avatar, badges };
}

function kickAvatarProxyUrl(channel, username, userId = "") {
  const c = cleanChannel(channel);
  const u = String(username || "").trim().replace(/^@+/, "").toLowerCase();
  const id = Number(userId);
  const idParam = Number.isFinite(id) && id > 0 ? `&userId=${encodeURIComponent(String(Math.trunc(id)))}` : "";
  if (!c || (!u && !idParam)) return "";
  const userParam = u ? `username=${encodeURIComponent(u)}&` : "";
  return `/api/kick-avatar?${userParam}channel=${encodeURIComponent(c)}${idParam}`;
}

function isRealKickAvatar(url) {
  const value = String(url || '').trim();
  return /^https?:\/\//i.test(value) && !/default-profile-pictures|default-avatar[-_]/i.test(value);
}

function rememberKickAvatarLocal(channel, username, userId, avatarUrl) {
  const avatar = String(avatarUrl || '').trim();
  if (!isRealKickAvatar(avatar)) return;
  const c = cleanChannel(channel);
  const u = String(username || '').trim().replace(/^@+/, '').toLowerCase();
  const id = Number(userId);
  if (c && u) userAvatarCache.set(`${c}:${Number.isFinite(id) && id > 0 ? Math.trunc(id) : ''}:${u}`, { avatarUrl: avatar, updatedAt: Date.now() });
  return avatar;
}

function timestampOf(data) {
  const candidate =
    data?.created_at ??
    data?.updated_at ??
    data?.timestamp ??
    data?.createdAt ??
    data?.ended_at ??
    data?.started_at ??
    data?.time ??
    Date.now();
  const numeric = typeof candidate === "number" ? candidate : Number(candidate);
  const time = Number.isFinite(numeric)
    ? (numeric > 0 && numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(candidate).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function normalizeEventType(name, data) {
  const eventName = String(name || "").toLowerCase().trim();
  const raw = data && typeof data === "object" ? data : {};
  const hasUser = (value) => Boolean(value && typeof value === "object" && (value.username || value.slug || value.id || value.user_id));

  // Chat is its own stream. Keep it out of the generic event bucket so that
  // any future/legacy path that hands chat.message.sent to normalizeEvent()
  // still follows the exact same chat routing contract as emitChat().
  if (eventName === "chat.message.sent" || eventName.includes("chatmessage")) return "chat";

  // Explicit event names: current official webhook names + historical realtime names.
  if (eventName === "channel.followed" || eventName.endsWith("\\events\\channelfollowedevent") || eventName.endsWith("followedevent")) return "follow";
  if (eventName === "channel.subscription.gifts" || eventName.includes("giftedsubscriptions") || eventName.includes("subscriptiongifted")) return "subscription-gift";
  if (eventName === "channel.subscription.renewal" || eventName.includes("subscriptionrenewal")) return "resub";
  if (eventName === "channel.subscription.new" || eventName.includes("subscriptionevent") || eventName.includes("subscription.new")) return "sub";
  if (eventName === "kicks.gifted" || eventName.includes("kicks.gift") || eventName.includes("kicksgifted")) return "gift";
  if (eventName.includes("streamhost") || eventName.includes("stream.host") || eventName.endsWith("hostevent")) return "host";
  if (eventName === "channel.raid" || eventName.includes("raid")) return "raid";
  if (eventName === "channel.reward.redemption.updated" || eventName.includes("rewardredeem") || eventName.includes("reward.redemption") || eventName.includes("rewardredeemed") || eventName.includes("redemption")) return "reward";
  if (eventName === "moderation.banned" || eventName.includes("userbannedevent") || eventName.endsWith(".banned")) return "moderation-ban";
  if (eventName.includes("userunbannedevent") || eventName.endsWith(".unbanned")) return "moderation-unban";
  if (eventName.includes("messagedeletedevent") || eventName.includes("message.deleted")) return "message-deleted";
  if (eventName.includes("pinnedmessagecreated") || eventName.includes("pinned.message.created")) return "pinned-message";
  if (eventName.includes("pinnedmessagedeleted") || eventName.includes("pinned.message.deleted")) return "pinned-message-deleted";
  if (eventName.includes("pollupdate")) return "poll-update";
  if (eventName.includes("polldelete")) return "poll-delete";
  if (eventName === "livestream.status.updated" || eventName.includes("livestreamstatus") || eventName.includes("streamerislive") || eventName.includes("stopstream")) return "stream-status";
  if (eventName === "livestream.metadata.updated" || eventName.includes("livestreammetadata")) return "stream-metadata";

  // Aggregate/telemetry events: useful for stats, but NOT a user activity.
  if (
    eventName.includes("followersupdated") ||
    eventName.includes("giftsleaderboardupdated") ||
    eventName.includes("kicksleaderboardupdated") ||
    eventName.includes("goalprogressupdate") ||
    eventName.includes("goalupdated") ||
    eventName.includes("goalachieved") ||
    eventName.includes("goalcanceled") ||
    eventName.includes("chatroomupdated") ||
    eventName.includes("chatsettingschanged") ||
    eventName.includes("pointsupdated") ||
    eventName.includes("livestreamupdated") ||
    eventName.includes("updatedlivestream") ||
    eventName.includes("activityupdated")
  ) {
    const reason = String(raw?.reason || raw?.message || raw?.description || "").toLowerCase();
    if (eventName.includes("pointsupdated") && (reason.includes("canje") || reason.includes("redeem") || raw?.reward || raw?.reward_title || raw?.redemption)) return "reward";
    return "stats";
  }

  // Payload inference for legacy frames that do not carry the canonical event name.
  if (raw?.gifted_quantity || raw?.giftees || raw?.gifted_users || raw?.recipients) return "subscription-gift";
  if (raw?.gift_transaction_id || raw?.gift || raw?.kicks || raw?.gift_coins) return "gift";
  if (raw?.followed === true || raw?.followed === "true" || raw?.follower || raw?.follower_username) return "follow";
  if (raw?.subscription || raw?.subscriber || raw?.months_subscribed || raw?.is_subscribed === true) return "sub";
  if (raw?.raider || raw?.raid) return "raid";
  if (raw?.hoster || raw?.host_username) return "host";
  if (raw?.reward || raw?.reward_title || raw?.redemption || raw?.redeemer) return "reward";
  if (raw?.banned_user || raw?.moderator || raw?.banned_username) return "moderation-ban";
  if (raw?.poll_id || raw?.pollId) return "poll-update";
  if (raw?.status && (raw?.is_live !== undefined || raw?.livestream_id)) return "stream-status";
  if (raw?.metadata && raw?.broadcaster) return "stream-metadata";
  if (raw?.type && typeof raw.type === "string" && raw.type.toLowerCase() !== "event") return raw.type.toLowerCase();

  return "event";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeIncomingKickEvent(data, eventName) {
  const raw = data && typeof data === "object" ? data : {};
  const payload = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const type = normalizeEventType(eventName, payload);
  const preferred =
    type === "follow" ? ["follower", "user", "sender"] :
    type === "sub" || type === "resub" ? ["subscriber", "user", "sender"] :
    type === "subscription-gift" ? ["gifter", "sender", "user"] :
    type === "gift" ? ["sender", "gifter", "user"] :
    type === "raid" ? ["raider", "sender", "user"] :
    type === "host" ? ["hoster", "sender", "user"] :
    type === "reward" ? ["redeemer", "user", "sender"] :
    ["sender", "user", "author", "owner"];

  let sender = resolveSender(payload, preferred);
  const gift = payload?.gift && typeof payload.gift === "object" ? payload.gift : null;
  if ((!sender.username || sender.username === "Usuario") && (type === "reward" || eventName.toLowerCase().includes("points"))) {
    const reasonText = firstNonEmpty(payload?.reason, payload?.message, payload?.description, "");
    const match = /^@?([^\s]+)\s+(?:canje[oó]|redeemed|redeem)(?=\s|$)/i.exec(reasonText);
    if (match?.[1]) sender = { ...sender, username: match[1], displayName: match[1], uniqueId: sender.uniqueId || match[1] };
  }
  const giftees = Array.isArray(payload?.giftees) ? payload.giftees
    : Array.isArray(payload?.gifted_users) ? payload.gifted_users
      : Array.isArray(payload?.recipients) ? payload.recipients : [];
  const duration = Number(payload?.duration ?? payload?.months ?? payload?.months_subscribed ?? payload?.count ?? payload?.metadata?.subscription?.months ?? 0) || 0;
  const quantity = Math.max(0, Number(payload?.quantity ?? payload?.total ?? payload?.gifted_quantity ?? payload?.gifted_total ?? payload?.count ?? payload?.metadata?.gifted_subscriptions?.quantity ?? (type === "subscription-gift" ? giftees.length : 0)) || 0);
  const amount = Number(payload?.amount ?? payload?.value ?? gift?.amount ?? payload?.coins ?? payload?.kicks ?? 0) || 0;
  const giftId = firstNonEmpty(payload?.gift_id, payload?.giftId, gift?.gift_id, gift?.id);
  const giftName = firstNonEmpty(
    payload?.giftName, payload?.gift_name, gift?.name, gift?.title,
    type === "sub" || type === "resub" ? "Suscripción" :
    type === "subscription-gift" ? "Suscripciones regaladas" :
    type === "gift" ? "Regalo" : ""
  );
  const eventId = firstNonEmpty(payload?.id, payload?.event_id, payload?.eventId, payload?.message_id, payload?.gift_transaction_id, payload?.correlation_id);
  const eventText = firstNonEmpty(payload?.message, payload?.content, payload?.description, payload?.user_input, gift?.message);

  let action = "Evento";
  let message = eventText;
  let icon = "✨";
  let group = "system";
  let currency = "";

  switch (type) {
    case "chat":
      action = "Mensaje";
      message = firstNonEmpty(payload?.content, payload?.message, eventText, "");
      icon = "💬";
      group = "chat";
      break;
    case "follow":
      action = "Nuevo seguidor";
      message = `${sender.username || "Alguien"} comenzó a seguir el canal.`;
      icon = "➕";
      group = "event";
      break;
    case "sub":
      action = "Nueva suscripción";
      message = `${sender.username || "Alguien"} se suscribió${duration > 1 ? ` por ${duration} meses` : ""}.`;
      icon = "⭐";
      group = "event";
      break;
    case "resub":
      action = "Suscripción renovada";
      message = `${sender.username || "Alguien"} renovó su suscripción${duration > 1 ? ` por ${duration} meses` : ""}.`;
      icon = "🔄";
      group = "event";
      break;
    case "subscription-gift": {
      const count = Math.max(1, quantity || giftees.length || 1);
      action = "Suscripciones regaladas";
      message = `${sender.username || "Alguien"} regaló ${count} suscripción${count === 1 ? "" : "es"}.`;
      icon = "🎟️";
      group = "event";
      break;
    }
    case "gift":
      action = giftName && giftName !== "Regalo" ? giftName : "Regalo";
      message = `${sender.username || "Alguien"} envió ${giftName || "un regalo"}${quantity > 1 ? ` ×${quantity}` : ""}.`;
      icon = "🎁";
      group = "gift";
      currency = firstNonEmpty(payload?.currency, payload?.gift_currency, eventName.toLowerCase().includes("kicks") ? "KICKS" : "");
      break;
    case "raid": {
      const raidCount = Number(payload?.viewers ?? payload?.viewers_count ?? payload?.count ?? 0) || 0;
      const from = firstNonEmpty(payload?.raider?.username, payload?.raider?.slug, sender.username, payload?.from, "Alguien");
      action = "Raid";
      message = raidCount > 0 ? `${from} llegó con ${raidCount} espectadores.` : `${from} llegó en raid.`;
      icon = "🚀";
      group = "event";
      break;
    }
    case "host": {
      const from = firstNonEmpty(payload?.hoster?.username, payload?.hoster, sender.username, payload?.host_username, "Alguien");
      if ((!sender.username || sender.username === "Usuario") && from && from !== "Alguien") {
        sender = { ...sender, username: from, displayName: from, uniqueId: sender.uniqueId || from };
      }
      action = "Host";
      message = `${from} te está hosteando.`;
      icon = "📣";
      group = "event";
      break;
    }
    case "reward": {
      const redemption = payload?.redemption && typeof payload.redemption === "object" ? payload.redemption : {};
      const reward = payload?.reward && typeof payload.reward === "object" ? payload.reward : redemption?.reward || {};
      const title = firstNonEmpty(reward?.title, payload?.reward_title, redemption?.reward_title, "Canje de puntos");
      const cost = Number(reward?.cost ?? payload?.cost ?? redemption?.cost ?? 0) || 0;
      action = title;
      const existing = firstNonEmpty(payload?.message, payload?.reason, payload?.description, payload?.user_input, redemption?.user_input);
      const status = firstNonEmpty(payload?.status, redemption?.status).toLowerCase();
      const statusLabel = status === 'accepted' ? ' · aceptado' : status === 'rejected' ? ' · rechazado' : status === 'pending' ? ' · pendiente' : '';
      message = existing || `${sender.username || "Alguien"} canjeó ${title}${cost > 0 ? ` · ${cost.toLocaleString("es-ES")} puntos` : ""}${statusLabel}.`;
      if (!message.toLowerCase().includes((sender.username || "alguien").toLowerCase()) && sender.username) message = `${sender.username} · ${message}`;
      icon = "🎟️";
      group = "event";
      break;
    }
    case "moderation-ban": {
      const banned = resolveSender(payload, ["banned_user", "user", "sender"]);
      const moderator = resolveSender(payload, ["moderator", "sender", "user"]);
      const target = banned.username || payload?.banned_username || "Un usuario";
      const actor = moderator.username || "Moderación";
      action = "Usuario baneado";
      message = actor && actor !== target ? `${actor} baneó a ${target}.` : `${target} fue baneado.`;
      icon = "🔨";
      group = "event";
      // The affected user is the visual identity of the moderation card.
      if (banned.username) sender = banned;
      break;
    }
    case "moderation-unban": {
      action = "Usuario desbaneado";
      message = `${sender.username || payload?.username || payload?.unbanned_username || "Un usuario"} fue desbaneado.`;
      icon = "🔓";
      group = "event";
      break;
    }
    case "message-deleted":
      action = "Mensaje eliminado";
      message = `Se eliminó un mensaje del chat.`;
      icon = "🗑️";
      group = "event";
      sender.username = sender.username || "Moderación";
      sender.displayName = sender.displayName || sender.username;
      break;
    case "pinned-message": {
      const pinned = payload?.message && typeof payload.message === "object" ? payload.message : payload;
      const pinnedSender = resolveSender(pinned, ["sender", "user"]);
      if (pinnedSender.username && sender.username === "Usuario") sender = pinnedSender;
      action = "Mensaje fijado";
      message = `${sender.username || "Un usuario"} fijó un mensaje${pinned?.content ? `: ${String(pinned.content).slice(0, 120)}` : "."}`;
      icon = "📌";
      group = "event";
      break;
    }
    case "pinned-message-deleted":
      action = "Mensaje fijado retirado";
      message = "Se retiró un mensaje fijado del chat.";
      icon = "📍";
      group = "event";
      break;
    case "poll-update":
      action = "Encuesta actualizada";
      message = `${firstNonEmpty(payload?.question, "La encuesta")} está disponible o fue actualizada.`;
      icon = "📊";
      group = "event";
      sender.username = sender.username || "Canal";
      sender.displayName = sender.displayName || "Canal";
      break;
    case "poll-delete":
      action = "Encuesta finalizada";
      message = "Se eliminó o finalizó una encuesta.";
      icon = "📊";
      group = "event";
      sender.username = sender.username || "Canal";
      sender.displayName = sender.displayName || "Canal";
      break;
    case "stream-status": {
      const isLive = payload?.is_live === true || payload?.isLive === true || String(payload?.status || '').toLowerCase() === 'live';
      action = isLive ? "Directo iniciado" : (payload?.ended_at || payload?.is_live === false || payload?.isLive === false ? "Directo finalizado" : "Estado del directo");
      message = isLive ? "El directo de Kick ha comenzado." : firstNonEmpty(payload?.ended_at ? "El directo de Kick ha terminado." : "El estado del directo cambió.");
      icon = isLive ? "🔴" : "📡";
      group = "event";
      break;
    }
    case "stream-metadata": {
      const title = firstNonEmpty(payload?.metadata?.title, payload?.title);
      action = "Información del directo actualizada";
      message = title ? `Título: ${title}` : "Se actualizó la información del directo.";
      icon = "📝";
      group = "event";
      break;
    }
    case "stats":
      // Aggregate counters are not individual user activity; keep them out of the
      // activity feed so we never fabricate "Usuario: actividad del canal" cards.
      action = "";
      message = "";
      icon = "";
      group = "system";
      break;
    case "system":
      action = firstNonEmpty(payload?.action, payload?.title, "Actividad");
      message = firstNonEmpty(payload?.message, payload?.content, payload?.description, "Se produjo una actualización del canal.");
      icon = "•";
      group = "event";
      break;
    default:
      // Unknown but concrete application events are retained with their actual
      // event name instead of the misleading generic "Actividad de Kick".
      action = firstNonEmpty(payload?.action, payload?.title, payload?.type, eventName || "Evento Kick");
      message = message || firstNonEmpty(payload?.message, payload?.content, payload?.description, `Evento de Kick: ${action}.`);
      icon = "✨";
      group = "event";
  }

  return {
    type,
    group,
    activityKind: group === "gift" ? "gift" : group === "chat" ? "chat" : "event",
    action,
    message,
    emoji: icon,
    username: sender.username,
    displayName: sender.displayName,
    uniqueId: sender.uniqueId,
    identityKey: sender.uniqueId || sender.username,
    avatar: sender.avatar,
    avatarUrl: sender.avatar,
    profilePictureUrl: sender.avatar,
    userId: sender.userId || undefined,
    color: sender.color,
    badges: sender.badges,
    verified: Boolean(payload?.is_verified || sender?.verified || payload?.verified),
    platform: "kick",
    source: "event",
    activityEligible: type !== "stats",
    timestamp: timestampOf(payload),
    event: eventName,
    eventId: eventId || undefined,
    messageId: eventId || undefined,
    gift: gift || undefined,
    giftName: giftName || undefined,
    giftId: giftId || undefined,
    quantity: type === "subscription-gift" ? Math.max(1, quantity || giftees.length || 1) : quantity || undefined,
    gifteeCount: giftees.length || undefined,
    duration: duration || undefined,
    amount: amount || undefined,
    giftCoins: Number(payload?.gift_coins ?? payload?.coins ?? gift?.amount ?? payload?.amount ?? 0) || undefined,
    currency: currency || undefined,
    data: payload,
  };
}

// Compatibility wrapper retained for the rest of the adapter.
function normalizeEvent(data, eventName) {
  return normalizeIncomingKickEvent(data, eventName);
}

function emitScoped(io, ownerId, event, payload) {
  if (!io) return;
  // Dashboard and generated overlays both join the canonical user room.
  // Emitting once here avoids duplicate deliveries when an overlay is open.
  io.to(`user:${ownerId}`).emit(event, payload);
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

  const urls = [
    `${KICK_BASE}/api/v1/channels/${encodeURIComponent(slug)}`,
    `${KICK_BASE}/api/v1/${encodeURIComponent(slug)}/chatroom`,
    `${KICK_BASE}/api/v2/channels/${encodeURIComponent(slug)}/chatroom`,
    `${KICK_BASE}/api/v2/channels/${encodeURIComponent(slug)}`,
  ];
  const errors = [];
  let channelData = null;
  let chatroomId = 0;
  let channelId = 0;
  let user = {};

  for (const url of urls) {
    try {
      const data = await curlJson(url, { timeoutSeconds: 10 });
      const candidateUser = data?.user || data?.data?.user || data?.broadcaster || {};
      const candidateChannelId = Number(
        data?.id || data?.channel_id || data?.broadcaster_user_id || data?.user_id ||
        candidateUser?.id || data?.data?.id || 0
      );
      const candidateChatroomId = Number(
        data?.chatroom?.id || data?.chatroom_id || data?.chatroom?.chatroom_id ||
        data?.data?.chatroom?.id || data?.data?.chatroom_id || data?.data?.chatroom?.chatroom_id || 0
      );
      if (candidateChatroomId > 0) {
        channelData = data;
        chatroomId = candidateChatroomId;
        channelId = candidateChannelId;
        user = candidateUser;
        break;
      }
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }

  if (!chatroomId) {
    const detail = errors.find(Boolean);
    throw new Error(`Kick no devolvió un chatroom para @${slug}${detail ? `: ${detail}` : ''}`);
  }

  // Normalize the shape expected by the rest of StreamFusion.
  return {
    ...(channelData && typeof channelData === 'object' ? channelData : {}),
    id: channelId || Number(channelData?.id || 0),
    slug,
    user: {
      ...(user && typeof user === 'object' ? user : {}),
      username: String(user?.username || user?.slug || slug),
      name: String(user?.name || user?.display_name || user?.username || slug),
      profile_picture: String(
        user?.profile_picture || user?.profile_pic || user?.profilePicture ||
        user?.avatar || user?.avatar_url || channelData?.profile_picture || channelData?.profile_pic || ''
      ).trim(),
    },
    chatroom: { id: chatroomId },
    livestream: channelData?.livestream ?? null,
  };
}

const userAvatarCache = new Map();
const userAvatarInflight = new Map();
const USER_AVATAR_TTL = 24 * 60 * 60 * 1000;
const KICK_AVATAR_LOOKUP_TIMEOUT_SECONDS = 4;

async function lookupKickUserAvatar(channelName, username, userId = "") {
  const channel = cleanChannel(channelName);
  const user = String(username || '').trim().replace(/^@+/, '').toLowerCase();
  if (!channel || !user) return '';
  const numericUserId = Number(userId);
  const stableId = Number.isFinite(numericUserId) && numericUserId > 0 ? String(Math.trunc(numericUserId)) : '';
  const key = `${channel}:${stableId}:${user}`;

  // Reuse avatars already learned by server.js from another event (for example a
  // gift may contain profile_picture even when the chat frame does not).
  try {
    const sharedCache = globalThis.__STREAMFUSION_KICK_AVATAR_CACHE__;
    if (sharedCache) {
      const shared = stableId ? sharedCache.get(`id:${stableId}`) : sharedCache.get(user);
      if (shared?.avatarUrl && isRealKickAvatar(shared.avatarUrl)) return shared.avatarUrl;
    }
  } catch {}
  const cached = userAvatarCache.get(key);
  const ttl = cached?.avatarUrl ? USER_AVATAR_TTL : 30_000;
  if (cached && Date.now() - Number(cached.updatedAt || 0) < ttl) return cached.avatarUrl || '';
  if (userAvatarInflight.has(key)) return userAvatarInflight.get(key);

  const promise = (async () => {
    // Prefer the official Public API when the chat/event payload contains a user id.
    // App Access Tokens are server-to-server and do not require a Kick login from the streamer.
    const officialProfile = await getKickUserById(userId);
    const officialAvatar = String(officialProfile?.profile_picture || officialProfile?.profile_picture_url || '').trim();
    if (isRealKickAvatar(officialAvatar)) {
      rememberKickAvatarLocal(channel, user, userId, officialAvatar);
      return officialAvatar;
    }

    const endpoints = [
      // The web client exposes the viewer profile in the context of the channel.
      // This is preferable for chatters because it is the same resource Kick uses
      // to render a user's profile from a live channel.
      `${KICK_BASE}/api/v1/channels/${encodeURIComponent(channel)}/${encodeURIComponent(user)}`,
      `${KICK_BASE}/channels/${encodeURIComponent(channel)}/${encodeURIComponent(user)}`,
      `${KICK_BASE}/api/v1/users/${encodeURIComponent(user)}`,
      `${KICK_BASE}/api/v2/channels/users/${encodeURIComponent(user)}`,
    ];
    try {
      for (const url of endpoints) {
        try {
          const data = await curlJson(url, { timeoutSeconds: KICK_AVATAR_LOOKUP_TIMEOUT_SECONDS });
          const profile = data?.user || data?.data?.user || data?.data || data || {};
          const avatarUrl = String(
            profile?.profile_picture || profile?.profilepic || profile?.profile_pic || profile?.profilePicture ||
            profile?.profile_picture_url || profile?.profilepic_url || profile?.avatar || profile?.avatar_url || profile?.picture || profile?.picture_url ||
            profile?.profile_thumb || profile?.profile_thumb_url ||
            data?.profile_picture || data?.profilepic || data?.profile_picture_url || data?.profilepic_url || data?.profile_pic || data?.avatar || data?.profilepic || ''
          ).trim();
          if (/^https?:\/\//i.test(avatarUrl)) {
            userAvatarCache.set(key, { avatarUrl, updatedAt: Date.now() });
            return avatarUrl;
          }
        } catch {
          // Try the next public website shape. Avatar enrichment must never block chat.
        }
      }
    } catch (error) {
      console.warn(`[Kick] no se pudo enriquecer avatar de @${user}:`, error?.message || error);
    } finally {
      userAvatarInflight.delete(key);
    }
    // Negative results are intentionally short-lived so a temporary Kick/API
    // failure never locks a chatter into the initials fallback for the session.
    userAvatarCache.set(key, { avatarUrl: '', updatedAt: Date.now() });
    return '';
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

function clearTransportReadyWait(client, error = null) {
  if (client.readyTimer) {
    clearTimeout(client.readyTimer);
    client.readyTimer = null;
  }
  const rejector = client.readyRejector;
  const resolver = client.readyResolver;
  client.readyResolver = null;
  client.readyRejector = null;
  if (error && rejector) rejector(error);
  return { rejector, resolver };
}

function markRealtimeNotReady(client) {
  client.realtimeReady = false;
  if (client.subscribedChannels?.clear) client.subscribedChannels.clear();
}

function markRealtimeReady(client, reason = "realtime-ready") {
  if (!isCurrentClient(client)) return;
  client.realtimeReady = true;
  if (client.readyTimer) {
    clearTimeout(client.readyTimer);
    client.readyTimer = null;
  }
  const resolver = client.readyResolver;
  client.readyResolver = null;
  client.readyRejector = null;
  if (resolver) resolver();
  notifyTransportState(client, true, reason);
}

function closeSocket(client) {
  markRealtimeNotReady(client);
  if (client.readyTimer) {
    clearTimeout(client.readyTimer);
    client.readyTimer = null;
  }
  const rejector = client.readyRejector;
  client.readyResolver = null;
  client.readyRejector = null;
  if (rejector) rejector(new Error("La conexión realtime de Kick fue cerrada."));
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
  // Kick/Pusher sends the heartbeat to the client. We reply with pusher:pong in
  // handleFrame; do not inject client-originated pusher:ping frames because they
  // are unnecessary and can confuse strict Pusher servers.
  stopPing(client);
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
  // Kick has emitted both flat payloads and the historical
  // { message: {...}, user: {...} } shape. Normalize both before routing.
  const messageData = raw?.message && typeof raw.message === "object" ? raw.message : raw;
  const userData = raw?.user && typeof raw.user === "object" ? raw.user : null;
  const source = {
    ...raw,
    ...messageData,
    ...(userData ? { user: userData, sender: raw?.sender || userData } : {}),
  };
  const sender = resolveSender(source, userData ? ["user", "sender"] : []);
  const content = String(
    messageData?.content || messageData?.message || raw?.content || raw?.text || raw?.message_text || "",
  ).trim();
  const messageId = String(
    messageData?.id || messageData?.message_id || raw?.id || raw?.message_id || raw?.messageId || "",
  ).trim();
  if (!content || content === "[object Object]") return;

  trimSeenMap(globalSeenChatIds, 30_000, 5000);
  const globalChatKey = messageId ? `${client.ownerId}|${messageId}` : '';
  const incomingAvatar = sender.avatar || '';
  const emitDuplicateAvatarPatch = () => {
    if (!incomingAvatar || !isRealKickAvatar(incomingAvatar) || !sender.username) return;
    globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.({
      platform:'kick', username:sender.username, uniqueId:sender.uniqueId, userId:sender.userId || undefined,
      avatar:incomingAvatar, displayName:sender.displayName,
    });
    const proxyUrl = kickAvatarProxyUrl(client.channelName, sender.username, sender.userId) || incomingAvatar;
    emitScoped(client.io, client.ownerId, 'kickAvatarUpdate', {
      platform:'kick', username:sender.username, uniqueId:sender.uniqueId, userId:sender.userId || undefined,
      avatar:proxyUrl, avatarUrl:proxyUrl, profilePictureUrl:proxyUrl, messageId:messageId || undefined,
    });
  };
  if (globalChatKey && globalSeenChatIds.has(globalChatKey)) { emitDuplicateAvatarPatch(); return; }
  if (globalChatKey) globalSeenChatIds.set(globalChatKey, Date.now());
  if (messageId && client.seenMessageIds.has(messageId)) { emitDuplicateAvatarPatch(); return; }
  if (messageId) {
    client.seenMessageIds.add(messageId);
    if (client.seenMessageIds.size > 1500) {
      const first = client.seenMessageIds.values().next().value;
      client.seenMessageIds.delete(first);
    }
  } else {
    const fp = `fp|${sender.uniqueId || sender.username}|${content}|${Math.floor(timestampOf(messageData) / 1500)}`;
    const now = Date.now();
    for (const [key, at] of client.seenMessageFingerprints) {
      if (now - at > 6000) client.seenMessageFingerprints.delete(key);
    }
    if (client.seenMessageFingerprints.has(fp)) return;
    client.seenMessageFingerprints.set(fp, now);
  }

  const avatar = sender.avatar || "";

  globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.({
    platform: "kick",
    username: sender.username,
    uniqueId: sender.uniqueId,
    userId: sender.userId || undefined,
    avatar,
    displayName: sender.displayName,
  });

  const chat = {
    id: messageId || undefined,
    type: "chat",
    source: "chat",
    platform: "kick",
    username: sender.username,
    displayName: sender.displayName,
    uniqueId: sender.uniqueId,
    userId: sender.userId || undefined,
    avatar,
    avatarUrl: avatar || undefined,
    profilePictureUrl: avatar || undefined,
    color: sender.color,
    badges: sender.badges,
    comment: content,
    message: content,
    timestamp: timestampOf(messageData),
    verified: Boolean(userData?.verified || source?.verified),
  };

  const enrichedPayload = awardPoints(client.ownerId, chat) || chat;
  emitScoped(client.io, client.ownerId, "chat", enrichedPayload);
  recordChat(client.ownerId, enrichedPayload);
  musicHook(client.ownerId, enrichedPayload);
  rouletteHook(client.ownerId, enrichedPayload);

  // Avatar enrichment must never delay chat, TTS, music or points. Resolve it
  // asynchronously and send a small patch event so the dashboard/overlay can
  // replace the fallback avatar once Kick's profile endpoint answers.
  if (sender.username) {
    void lookupKickUserAvatar(client.channelName, sender.username, sender.userId).then((avatarUrl) => {
      if (!avatarUrl) return;
      globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.({
        platform: "kick",
        username: sender.username,
        uniqueId: sender.uniqueId,
        avatar: avatarUrl,
        displayName: sender.displayName,
      });
      const proxyUrl = kickAvatarProxyUrl(client.channelName, sender.username, sender.userId) || avatarUrl;
      emitScoped(client.io, client.ownerId, "kickAvatarUpdate", {
        platform: "kick",
        username: sender.username,
        uniqueId: sender.uniqueId,
        avatar: proxyUrl,
        avatarUrl: proxyUrl,
        profilePictureUrl: proxyUrl,
        userId: sender.userId || undefined,
        messageId: enrichedPayload?.id || undefined,
      });
    }).catch(() => {});
  }
}

function hasConcreteFollowPayload(data) {
  const payload = data && typeof data === "object" ? data : {};
  const candidates = [
    payload?.follower,
    payload?.user,
    payload?.sender,
    payload?.follower?.user,
  ];
  return candidates.some((value) => value && typeof value === "object" && (value.username || value.slug || value.id || value.user_id)) ||
    Boolean(payload?.username || payload?.uniqueId || payload?.user_name || payload?.follower_username);
}

function eventFingerprint(eventName, payload) {
  const item = payload && typeof payload === "object" ? payload : {};
  const normalized = normalizeEvent(item, eventName);
  const ts = Number(normalized.timestamp || 0);
  const bucket = ts ? Math.floor(ts / 1500) : 0;
  const id = String(normalized.eventId || item?.id || item?.event_id || item?.message_id || item?.gift_transaction_id || item?.correlation_id || "").trim();
  if (id) return `id|${normalized.type}|${id}`;
  return [
    "fp", normalized.type, normalized.uniqueId || normalized.username,
    normalized.action, normalized.giftId || normalized.giftName || "", normalized.quantity || "", normalized.amount || "", bucket,
  ].join("|");
}

function emitEvent(client, eventName, payload) {
  const dedupKey = eventFingerprint(eventName, payload);
  trimSeenMap(globalSeenEventIds, 30_000, 5000);
  const globalEventId = normalizeEvent(payload, eventName)?.eventId;
  const globalKey = `${client.ownerId}|${String(globalEventId || dedupKey)}`;
  const emitDuplicateEventAvatar = () => {
    const duplicate = normalizeEvent(payload, eventName);
    if (!duplicate?.username || !duplicate?.avatar || !isRealKickAvatar(duplicate.avatar)) return;
    globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.(duplicate);
    const proxyUrl = kickAvatarProxyUrl(client.channelName, duplicate.username, duplicate.userId || duplicate.uniqueId) || duplicate.avatar;
    emitScoped(client.io, client.ownerId, 'kickAvatarUpdate', {
      platform:'kick', username:duplicate.username, uniqueId:duplicate.uniqueId, userId:duplicate.userId || undefined,
      avatar:proxyUrl, avatarUrl:proxyUrl, profilePictureUrl:proxyUrl,
      eventId:duplicate.eventId || undefined, messageId:duplicate.messageId || undefined,
    });
  };
  if (globalSeenEventIds.has(globalKey)) { emitDuplicateEventAvatar(); return; }
  globalSeenEventIds.set(globalKey, Date.now());
  const now = Date.now();
  for (const [key, at] of client.seenEventKeys) {
    if (now - at > 15000) client.seenEventKeys.delete(key);
  }
  if (client.seenEventKeys.has(dedupKey)) { emitDuplicateEventAvatar(); return; }
  client.seenEventKeys.set(dedupKey, now);

  const normalized = normalizeEvent(payload, eventName);
  globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__?.(normalized);
  if (normalized?.platform === 'kick' && normalized?.username) {
    const proxy = kickAvatarProxyUrl(client.channelName, normalized.username, normalized.uniqueId);
    if (proxy && (!normalized.avatar || String(normalized.avatar).includes('default-avatar') || String(normalized.avatar).includes('default-profile-pictures'))) {
      normalized.avatar = normalized.avatarUrl = normalized.profilePictureUrl = proxy;
    }
    void lookupKickUserAvatar(client.channelName, normalized.username, normalized.uniqueId).then((avatarUrl) => {
      if (!avatarUrl) return;
      const proxyUrl = kickAvatarProxyUrl(client.channelName, normalized.username, normalized.userId || normalized.uniqueId) || avatarUrl;
      emitScoped(client.io, client.ownerId, 'kickAvatarUpdate', {
        platform:'kick', username:normalized.username, uniqueId:normalized.uniqueId, userId:normalized.userId || undefined,
        avatar:proxyUrl, avatarUrl:proxyUrl, profilePictureUrl:proxyUrl,
        eventId:normalized.eventId || undefined, messageId: normalized.messageId || undefined,
      });
    }).catch(()=>{});
  }
  if (normalized?.type === "stream-status") {
    try {
      globalThis.__STREAMFUSION_KICK_STATE_HOOK__?.(client.ownerId, normalized);
    } catch (error) {
      console.error("[Kick] stream state hook failed:", error);
    }
  }

  if (normalized?.activityEligible === false) {
    // Aggregate channel counters are handled as stats, never as fake user activity.
    emitStats(client);
    return;
  }
  const enrichedPayload = awardPoints(client.ownerId, normalized) || normalized;
  emitScoped(client.io, client.ownerId, "event", enrichedPayload);
  recordEvent(client.ownerId, enrichedPayload);
  // Keep the generic event stream for Dashboard/TikTok/Twitch compatibility,
  // but also expose a dedicated gift stream so the gifts overlay never has to
  // guess whether an event should be rendered as a gift.
  if (String(enrichedPayload?.activityKind || "").toLowerCase() === "gift" &&
      String(enrichedPayload?.type || "").toLowerCase() === "gift") {
    emitScoped(client.io, client.ownerId, "gift", enrichedPayload);
  }

  if (enrichedPayload.type === "gift" && Number(enrichedPayload.amount || enrichedPayload.giftCoins || 0) > 0) {
    musicHook(client.ownerId, enrichedPayload);
  }

  rouletteHook(client.ownerId, enrichedPayload);
}

async function handleFrame(client, raw) {
  const frame = decodeMaybeJson(raw);
  if (!frame || typeof frame !== 'object') return;

  // Current/legacy Pusher and current Centrifugo payloads are both accepted.
  if (Object.keys(frame).length === 0) {
    send(client, {});
    return;
  }
  if (frame.push && typeof frame.push === 'object') {
    const push = frame.push;
    const channel = String(push.channel || '');
    const pub = push.pub && typeof push.pub === 'object' ? push.pub : null;
    const payload = pub?.data && typeof pub.data === 'object' ? pub.data : null;
    const eventName = String(payload?.event || '');
    const data = decodeMaybeJson(payload?.data);
    if (!eventName || !channel) return;
    const lower = eventName.toLowerCase();
    if (lower.includes('chatmessage') || lower === 'chat.message.sent' || lower.endsWith('chat.message.sent')) {
      await emitChat(client, data);
      return;
    }
    if (lower.startsWith('pusher:') || lower.startsWith('pusher_internal:')) return;
    emitEvent(client, eventName, data);
    return;
  }

  const eventName = String(frame.event || frame.type || '');
  const data = decodeMaybeJson(frame.data);
  if (!eventName) return;

  // Heartbeats must be handled before the generic control-frame filter.
  if (eventName === 'pusher:ping') { sendPusherPong(client); return; }
  if (eventName.toLowerCase() === 'ping') { send(client, { type: 'pong' }); return; }

  if (eventName === 'pusher:subscription_succeeded' || eventName === 'pusher_internal:subscription_succeeded') {
    const subscribedChannel = String(
      frame?.channel ||
      (data && typeof data === 'object' ? data.channel : '') ||
      ''
    ).trim();
    if (subscribedChannel) client.subscribedChannels?.add(subscribedChannel);
    const expected = client.chatroomChannel || (client.chatroomId ? `chatrooms.${client.chatroomId}.v2` : '');
    if (subscribedChannel && expected && subscribedChannel === expected) {
      markRealtimeReady(client, 'chatroom-subscription-ready');
    }
    return;
  }

  const controlType = eventName.toLowerCase();
  if (["ack", "pong", "subscribe", "unsubscribe", "channel_handshake", "connection_established"].includes(controlType)) return;
  if (
    eventName === 'pusher:pong' ||
    eventName === 'pusher:connection_established' ||
    eventName.startsWith('pusher_internal:')
  ) return;
  if (eventName === 'pusher:error' || eventName === 'pusher:subscription_error') {
    const message = typeof data === 'object' ? JSON.stringify(data) : String(data || '');
    emitSystem(client, 'Kick devolvió un error de suscripción/realtime.', { detail: message.slice(0, 400) });
    if (!client.realtimeReady && isCurrentClient(client)) {
      const error = new Error(`Kick no pudo suscribir el realtime: ${message.slice(0, 240)}`);
      const rejector = client.readyRejector;
      client.readyRejector = null;
      client.readyResolver = null;
      if (client.readyTimer) { clearTimeout(client.readyTimer); client.readyTimer = null; }
      rejector?.(error);
    }
    return;
  }

  const normalizedEvent = eventName.toLowerCase();
  if (normalizedEvent.includes('chatmessage') || normalizedEvent === 'chat.message.sent' || normalizedEvent.endsWith('chat.message.sent')) {
    await emitChat(client, data);
    return;
  }
  // Everything else at this level is an application event. New Kick event names
  // should appear in Dashboard activity without needing a code change.
  emitEvent(client, eventName, data);
}

function isCurrentClient(client) {
  return Boolean(client && !client.manualDisconnect && clients.get(client.ownerId) === client);
}

function scheduleReconnect(client) {
  if (client.manualDisconnect || !clients.has(client.ownerId)) return;
  clearReconnectTimer(client);

  const delay = Math.min(30_000, Math.max(5_000, client.reconnectDelay));
  client.reconnectDelay = Math.min(30_000, delay * 2);
  client.reconnectTimer = setTimeout(() => {
    client.reconnectTimer = null;
    if (!isCurrentClient(client)) return;
    openSocket(client).catch((error) => {
      console.error(`[Kick] reconnect failed for ${client.ownerId}:`, error);
      emitSystem(client, "No se pudo reconectar a Kick.", {
        detail: String(error?.message || error),
      });
      scheduleReconnect(client);
    });
  }, delay);
}

function webhookClient(ownerId, io, channelName = "", broadcasterUserId = 0) {
  const key = ownerKey(ownerId);
  const client = clients.get(key);
  if (!client || client.manualDisconnect) return null;

  client.io = io || client.io;
  if (channelName) client.channelName = cleanChannel(channelName);
  // A Kick channel ID and broadcaster user ID are different identifiers. Keep
  // them separate: the channel ID is still required by the realtime descriptor
  // fallback, while broadcasterUserId is the stable webhook routing key.
  if (broadcasterUserId) {
    client.broadcasterUserId = Number(broadcasterUserId);
  }
  return client;
}

export async function handleWebhookEvent(ownerId, io, eventName, payload, meta = {}) {
  const data = payload && typeof payload === "object" ? payload : {};
  const broadcaster = data?.broadcaster && typeof data.broadcaster === "object" ? data.broadcaster : {};
  const channel = cleanChannel(meta.channelSlug || broadcaster?.channel_slug || data?.channel_slug || "");
  const broadcasterUserId = Number(meta.broadcasterUserId || broadcaster?.user_id || 0);
  const client = webhookClient(ownerId, io, channel, broadcasterUserId);
  if (!client) return { ok: true, ignored: true, reason: "Kick session is not active." };
  const messageId = String(meta.messageId || "").trim();
  if (messageId) {
    trimSeenMap(webhookSeenIds, 86_400_000, 10_000);
    if (webhookSeenIds.has(messageId)) return { ok: true, duplicate: true };
    webhookSeenIds.set(messageId, Date.now());
  }
  const lower = String(eventName || "").toLowerCase();
  if (lower === "chat.message.sent" || lower.includes("chatmessage")) {
    await emitChat(client, data);
    return { ok: true, type: "chat" };
  }
  emitEvent(client, eventName, data);
  return { ok: true, type: "event" };
}

function notifyTransportState(client, realtimeConnected, reason = "") {
  try {
    globalThis.__STREAMFUSION_KICK_TRANSPORT_HOOK__?.(client.ownerId, {
      realtimeConnected: Boolean(realtimeConnected),
      sessionActive: clients.has(client.ownerId) && !client.manualDisconnect,
      provider: client.provider || "",
      reason,
      broadcasterUserId: Number(client.broadcasterUserId || 0) || 0,
      channelName: client.channelName || "",
    });
  } catch (error) {
    console.error("[Kick] transport state hook failed:", error);
  }
}

async function openWebSocketTransport(client, url, provider = "pusher") {
  const WS = globalThis.WebSocket;
  if (typeof WS !== "function") {
    throw new Error("La versión de Node no expone WebSocket global. Usa Node.js 22+ para Kick.");
  }

  if (!isCurrentClient(client)) {
    throw new Error("La sesión de Kick ya no está activa.");
  }

  markRealtimeNotReady(client);
  clearTransportReadyWait(client);

  const ws = new WS(url);
  client.ws = ws;
  client.provider = provider;

  // Kick's live chat/activity stream is carried by this public chatroom channel.
  // Do not mix in legacy channel names: a failed legacy subscription can poison
  // an otherwise valid Pusher session and leave chat connected but activity dead.
  const chatroomChannel = client.chatroomId ? `chatrooms.${client.chatroomId}.v2` : "";
  client.chatroomChannel = chatroomChannel;
  const channelList = chatroomChannel ? [chatroomChannel] : [];

  await new Promise((resolve, reject) => {
    let socketOpen = false;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (client.readyTimer) {
        clearTimeout(client.readyTimer);
        client.readyTimer = null;
      }
      client.readyResolver = null;
      client.readyRejector = null;
      fn(value);
    };

    client.readyResolver = () => {
      finish(resolve);
    };
    client.readyRejector = (error) => {
      finish(reject, error);
    };
    client.readyTimer = setTimeout(() => {
      if (!client.realtimeReady) {
        finish(reject, new Error("Kick abrió el WebSocket pero no confirmó la suscripción al chatroom."));
        try { ws.close(); } catch {}
      }
    }, 12_000);

    ws.onopen = () => {
      if (!isCurrentClient(client)) {
        finish(reject, new Error("La sesión de Kick fue reemplazada o desconectada."));
        try { ws.close(); } catch {}
        return;
      }
      socketOpen = true;
      client.reconnectDelay = 5_000;
      for (const channel of channelList) {
        send(client, {
          event: "pusher:subscribe",
          data: { auth: "", channel },
        });
      }
      startPing(client);
    };

    ws.onmessage = (messageEvent) => {
      void handleFrame(client, messageEvent.data).catch((error) => {
        console.error("[Kick] frame parse failed:", error);
      });
    };

    ws.onerror = (event) => {
      const error = new Error("Error de WebSocket realtime de Kick");
      error.cause = event;
      if (!socketOpen || !client.realtimeReady) {
        finish(reject, error);
      } else {
        emitSystem(client, "Kick devolvió un error de transporte realtime.", { detail: String(event || "").slice(0, 240) });
      }
    };

    ws.onclose = (event) => {
      stopPing(client);
      client.ws = null;
      client.realtimeReady = false;
      if (!settled) {
        finish(reject, new Error(`Kick WebSocket cerrado durante la conexión (${event?.code || 0})`));
        return;
      }
      if (!isCurrentClient(client)) return;
      notifyTransportState(client, false, "realtime-closed");
      emitSystem(client, "La conexión de Kick se cerró; intentando reconectar.", {
        code: event?.code || 0,
        reason: event?.reason || "",
      });
      scheduleReconnect(client);
    };
  });

  if (!client.realtimeReady) {
    throw new Error("Kick no confirmó el chatroom realtime.");
  }
  notifyTransportState(client, true, "realtime-ready");
}

let discoveredPusherKey = "";

async function discoverPusherUrl() {
  try {
    const response = await fetch(`${KICK_BASE}/`, {
      headers: {
        "user-agent": USER_AGENT,
        "accept": "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return "";
    const html = await response.text();
    const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["'][^>]*>/gi)]
      .slice(0, 15)
      .map((m) => m[1])
      .filter(Boolean);
    for (const scriptUrl of scriptUrls) {
      const url = scriptUrl.startsWith("http") ? scriptUrl : `${KICK_BASE}${scriptUrl.startsWith("/") ? "" : "/"}${scriptUrl}`;
      try {
        const js = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept": "*/*" } });
        if (!js.ok) continue;
        const text = await js.text();
        const match = text.match(/NEXT_PUBLIC_PUSHER_KEY[^}]*?default\(["']([a-f0-9]+)["']\)/i);
        if (match?.[1]) {
          discoveredPusherKey = match[1];
          return `wss://ws-us2.pusher.com/app/${discoveredPusherKey}?protocol=7&client=js&version=7.6.0&flash=false`;
        }
      } catch {}
    }
  } catch {}
  return "";
}

async function openSocket(client) {
  closeSocket(client);
  stopPing(client);
  if (!isCurrentClient(client)) throw new Error("La sesión de Kick ya no está activa.");

  let pusherError = null;
  try {
    await openWebSocketTransport(client, KICK_PUSHER_URL, "pusher");
    return;
  } catch (error) {
    pusherError = error;
    closeSocket(client);
    stopPing(client);
  }

  // Kick publishes its anonymous Pusher app key in the public web client. When
  // the compiled key is stale, refresh it from the public homepage without OAuth.
  if (isCurrentClient(client)) {
    try {
      const discoveredUrl = await discoverPusherUrl();
      if (discoveredUrl && discoveredUrl !== KICK_PUSHER_URL) {
        await openWebSocketTransport(client, discoveredUrl, "pusher-discovered");
        return;
      }
    } catch (discoveryError) {
      if (!pusherError) pusherError = discoveryError;
      closeSocket(client);
      stopPing(client);
    }
  }

  // Optional compatibility fallback. It is deliberately secondary: the primary
  // anonymous transport does not require OAuth or a Kick API application.
  if (client.channelId > 0 && isCurrentClient(client)) {
    try {
      const descriptor = await getRealtimeDescriptor(client.channelId);
      const url = String(descriptor?.url || "").trim();
      if (url) {
        await openWebSocketTransport(client, url, descriptor.provider || "realtime-descriptor");
        return;
      }
    } catch (fallbackError) {
      const primary = String(pusherError?.message || pusherError || "Pusher realtime error").slice(0, 220);
      const fallback = String(fallbackError?.message || fallbackError || "descriptor realtime error").slice(0, 220);
      throw new Error(`Kick realtime no disponible. Pusher: ${primary}. Fallback: ${fallback}.`);
    }
  }

  throw new Error(String(pusherError?.message || pusherError || "No se pudo abrir el realtime de Kick."));
}

export async function connect(channelName, io, ownerId, resolvedInfo = null) {
  const id = ownerKey(ownerId);
  if (!id) throw new Error("ownerId es obligatorio para conectar Kick");

  disconnect(id);

  const slug = cleanChannel(channelName);
  if (!slug) throw new Error("Introduce un canal de Kick, por ejemplo @nombre");

  // Preferimos los IDs resueltos por el navegador. Kick protege el endpoint
  // server-side con Cloudflare, así que el servidor no debe depender de esa llamada
  // cuando el usuario ya pudo resolver el canal desde kick.com en su navegador.
  const supplied = resolvedInfo && typeof resolvedInfo === "object" ? resolvedInfo : null;
  const channelInfo = supplied?.chatroomId ? {
    id: Number(supplied.channelId || 0),
    slug,
    user: {
      username: String(supplied.username || slug),
      name: String(supplied.displayName || supplied.username || slug),
      profile_picture: String(supplied.avatarUrl || ""),
    },
    chatroom: { id: Number(supplied.chatroomId) },
    livestream: supplied.isLive ? { is_live: true } : null,
  } : await getChannelInfo(slug);

  const channelId = Number(supplied?.channelId || channelInfo?.id || channelInfo?.user_id || 0);
  const chatroomId = Number(supplied?.chatroomId || channelInfo?.chatroom?.id || 0);

  if (!chatroomId) {
    throw new Error(`No se encontró el chatroom del canal @${slug}`);
  }

  const client = {
    ownerId: id,
    io,
    channelName: slug,
    channelId,
    broadcasterUserId: Number(supplied?.broadcasterUserId || channelInfo?.user?.id || channelInfo?.broadcaster_user_id || 0),
    chatroomId,
    channelInfo,
    ws: null,
    pingTimer: null,
    reconnectTimer: null,
    reconnectDelay: 5_000,
    manualDisconnect: false,
    realtimeReady: false,
    chatroomChannel: `chatrooms.${chatroomId}.v2`,
    subscribedChannels: new Set(),
    readyTimer: null,
    readyResolver: null,
    readyRejector: null,
    seenMessageIds: new Set(),
    seenMessageFingerprints: new Map(),
    seenEventKeys: new Map(),
  };

  clients.set(id, client);

  let realtimeConnected = false;
  try {
    await openSocket(client);
    realtimeConnected = isConnected(id);
  } catch (error) {
    realtimeConnected = false;
    // Keep the owner session alive while the realtime gateway retries. This is
    // important because the same session may also be receiving official Kick
    // webhook events; a transient websocket/token failure must not tear down the
    // Socket.IO feed, points processing, TTS, or the generated overlay.
    client.provider = 'webhook-or-reconnecting';
    emitSystem(client, `Kick está conectado, pero el realtime está reintentando.`, {
      code: 'REALTIME_RETRY',
      detail: String(error?.message || error).slice(0, 400),
    });
    scheduleReconnect(client);
  }

  emitStats(client);

  const user = channelInfo?.user || {};
  if (!isCurrentClient(client)) {
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
      sessionActive: false,
      realtimeConnected: false,
      provider: client.provider || "",
      stale: true,
    };
  }

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
    sessionActive: true,
    realtimeConnected: Boolean(realtimeConnected),
    provider: client.provider || "",
  };
}

export function disconnect(ownerId) {
  const id = ownerKey(ownerId);
  const client = clients.get(id);
  if (!client) return;

  client.manualDisconnect = true;
  clearReconnectTimer(client);
  markRealtimeNotReady(client);
  stopPing(client);
  closeSocket(client);
  clients.delete(id);
}

export function isConnected(ownerId) {
  const client = clients.get(ownerKey(ownerId));
  return Boolean(client?.realtimeReady && client?.ws && client.ws.readyState === 1);
}

export function getState(ownerId) {
  const client = clients.get(ownerKey(ownerId));
  if (!client) {
    return {
      connected: false,
      realtimeReady: false,
      sessionActive: false,
      channel: "",
      channelId: 0,
      broadcasterUserId: 0,
      chatroomId: 0,
      provider: '',
    };
  }
  return {
    connected: isConnected(ownerId),
    realtimeReady: Boolean(client.realtimeReady),
    sessionActive: !client.manualDisconnect && clients.has(ownerKey(ownerId)),
    channel: client.channelName,
    channelId: client.channelId,
    broadcasterUserId: client.broadcasterUserId,
    chatroomId: client.chatroomId,
    provider: client.provider || '',
  };
}

export function isSessionActive(ownerId) {
  const client = clients.get(ownerKey(ownerId));
  return Boolean(client && !client.manualDisconnect);
}

export { cleanChannel, getChannelInfo, lookupKickUserAvatar, getKickAppAccessToken, getKickUserById, normalizeEvent, normalizeIncomingKickEvent };
