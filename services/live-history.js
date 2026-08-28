const LIMIT = 600;
const history = new Map();

function normalizeOwner(ownerId){
  return String(ownerId || "").trim();
}

function ownerHistory(ownerId, create=true){
  const owner = normalizeOwner(ownerId);
  if(!owner) return null;
  let entry = history.get(owner);
  if(!entry && create){
    entry = { chat: [], events: [] };
    history.set(owner, entry);
  }
  return entry || null;
}

function push(ownerId, bucket, payload) {
  const entry = ownerHistory(ownerId);
  const list = entry?.[bucket];
  if (!list) return;
  list.push({ ...payload, timestamp: payload?.timestamp || Date.now() });
  if (list.length > LIMIT) list.splice(0, list.length - LIMIT);
}

export function recordChat(ownerId, payload) { push(ownerId, 'chat', payload); }
export function recordEvent(ownerId, payload) { push(ownerId, 'events', payload); }
export function snapshot(ownerId) {
  const entry = ownerHistory(ownerId, false);
  if (!entry) return { chat: [], events: [] };
  return { chat: entry.chat.slice(), events: entry.events.slice() };
}
export function clear(ownerId) {
  const owner = normalizeOwner(ownerId);
  if(!owner){ history.clear(); return; }
  history.delete(owner);
}
