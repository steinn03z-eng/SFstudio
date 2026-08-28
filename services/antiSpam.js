import { sanitizeSpeechText } from "./textFilter.js";

// Conversational antispam is scoped by account + platform + user.
// Each user remembers only the two most recent distinct comments that were
// actually accepted for speech. Repeating either one is suppressed. Once the
// user sends a third distinct comment, the oldest remembered phrase expires.
const recentCommentsByScope = new Map();
const RECENT_DISTINCT_COMMENT_LIMIT = 2;
const MAX_USERS_PER_SCOPE = 6000;

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeMessage(value) {
  return sanitizeSpeechText(value, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scopeKey(ownerId = "", platform = "tiktok") {
  const owner = normalizeKey(ownerId) || "anonymous";
  const p = String(platform || "tiktok").toLowerCase() === "twitch" ? "twitch" : "tiktok";
  return `${owner}:${p}`;
}

function getScope(scope) {
  let store = recentCommentsByScope.get(scope);
  if (!store) {
    store = new Map();
    recentCommentsByScope.set(scope, store);
  }
  return store;
}

function evictOldest(store, maxEntries = MAX_USERS_PER_SCOPE) {
  while (store.size > maxEntries) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function resetRepeatCache(ownerId = "", platform = "") {
  const owner = String(ownerId || "").trim();
  const p = String(platform || "").trim();
  if (!owner && !p) {
    recentCommentsByScope.clear();
    return;
  }
  for (const key of recentCommentsByScope.keys()) {
    const [storedOwner, storedPlatform] = String(key).split(":");
    if (owner && storedOwner !== normalizeKey(owner)) continue;
    if (p && storedPlatform !== (String(p).toLowerCase() === "twitch" ? "twitch" : "tiktok")) continue;
    recentCommentsByScope.delete(key);
  }
}

/**
 * Returns true only when the normalized comment is one of the user's two
 * remembered distinct comments. A blocked duplicate does NOT update history.
 * Example: hola -> hola(drop) -> adios -> hola(drop) -> adios(drop) -> que tal -> hola(read).
 */
export function shouldDropRepeatedComment(ownerId, platform, userKey, message) {
  const owner = String(ownerId || "").trim();
  const user = normalizeKey(userKey);
  const normalizedMessage = normalizeMessage(message);
  if (!owner || !user || !normalizedMessage) return false;

  const store = getScope(scopeKey(owner, platform));
  const history = Array.isArray(store.get(user)) ? store.get(user).slice() : [];

  if (history.includes(normalizedMessage)) return true;

  history.push(normalizedMessage);
  store.set(user, history.slice(-RECENT_DISTINCT_COMMENT_LIMIT));
  evictOldest(store);
  return false;
}

export function normalizeRepeatUserKey(value) { return normalizeKey(value); }
export function normalizeRepeatMessage(value) { return normalizeMessage(value); }
