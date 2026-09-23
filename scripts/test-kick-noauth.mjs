/**
 * Banco de pruebas del conector de Kick SIN OAuth.
 *
 * Levanta un falso realtime de Kick (Pusher) en local, conecta services/kick.js
 * contra él y verifica que el chat y los eventos propios de Kick se normalizan y
 * se emiten por Socket.IO exactamente igual que TikTok/Twitch.
 *
 * Uso:  node scripts/test-kick-noauth.mjs
 *
 * No necesita acceso a kick.com ni credenciales: todo el transporte público de
 * Kick es anónimo, que es justo lo que se está probando aquí.
 */

const PORT = Number(process.env.FAKE_KICK_PORT || 4599);
const CHATROOM_ID = 7777;
const CHANNEL_ID = 5555;
const BROADCASTER_ID = 9999;
const OWNER = "owner-test-1";
const OWNER_TOLERANT = "owner-test-2";

import { createFakePusher } from "./kick-fake-pusher.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* Falso Pusher de Kick                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Emisor Socket.IO falso + hooks globales                             */
/* ------------------------------------------------------------------ */

const emissions = [];
function createFakeIo() {
  return {
    to(room) {
      return {
        emit(event, payload) { emissions.push({ room, event, payload, at: Date.now() }); },
      };
    },
  };
}

const hookCalls = { state: [], transport: [], avatar: [], points: [], music: [], roulette: [] };
globalThis.__STREAMFUSION_KICK_STATE_HOOK__ = (ownerId, normalized) => hookCalls.state.push({ ownerId, normalized });
globalThis.__STREAMFUSION_KICK_TRANSPORT_HOOK__ = (ownerId, transport) => hookCalls.transport.push({ ownerId, transport });
globalThis.__STREAMFUSION_KICK_AVATAR_REMEMBER__ = (payload) => hookCalls.avatar.push(payload);
globalThis.__STREAMFUSION_POINTS_HOOK__ = (ownerId, payload) => { hookCalls.points.push(payload); return payload; };
globalThis.__STREAMFUSION_MUSIC_HOOK__ = (ownerId, payload) => { hookCalls.music.push(payload); return payload; };
globalThis.__STREAMFUSION_ROULETTE_HOOK__ = {
  ingestChat(ownerId, payload) { hookCalls.roulette.push({ kind: "chat", payload }); return payload; },
  ingestEvent(ownerId, payload) { hookCalls.roulette.push({ kind: "event", payload }); return payload; },
};

const fake = createFakePusher();
process.env.KICK_PUSHER_URL = fake.url;
process.env.KICK_RESUBSCRIBE_INTERVAL_MS = "1000";

const kick = await import("../services/kick.js");

/* ------------------------------------------------------------------ */
/* Utilidades de aserción                                              */
/* ------------------------------------------------------------------ */

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  const icon = condition ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

function lastEvents(event, room = `user:${OWNER}`) {
  return emissions.filter((x) => x.event === event && x.room === room);
}

function lastEvent(event, room = `user:${OWNER}`) {
  const list = lastEvents(event, room);
  return list[list.length - 1]?.payload;
}

/* ------------------------------------------------------------------ */
/* Payloads reales del realtime público de Kick                        */
/* ------------------------------------------------------------------ */

const chatPayload = (id, content, username = "viewer_one") => ({
  id,
  chatroom_id: CHATROOM_ID,
  content,
  type: "message",
  created_at: new Date().toISOString(),
  sender: {
    id: 4242,
    username,
    slug: username,
    identity: { color: "#53fc18", badges: [{ type: "verified", label: "Verified", text: "Verified" }] },
    profile_picture: "https://assets.kick.com/avatar.png",
  },
});

const CHAT_TOPIC = `chatrooms.${CHATROOM_ID}.v2`;
const CHANNEL_TOPIC = `channel_${CHANNEL_ID}`;

/* ------------------------------------------------------------------ */
/* Prueba                                                              */
/* ------------------------------------------------------------------ */

await new Promise((resolve) => fake.server.on("listening", resolve));
console.log(`\nFalso realtime de Kick escuchando en ${fake.url}\n`);

const io = createFakeIo();
const info = await kick.connect("canaldeprueba", io, OWNER, {
  channelId: CHANNEL_ID,
  chatroomId: CHATROOM_ID,
  broadcasterUserId: BROADCASTER_ID,
  username: "canaldeprueba",
  displayName: "Canal de Prueba",
  avatarUrl: "",
  isLive: true,
});

await wait(400);

check("Conecta sin OAuth y sin pedir credenciales", info?.sessionActive === true, `sessionActive=${info?.sessionActive}`);
check("El realtime queda listo (chatroom confirmado)", info?.realtimeConnected === true, `realtimeConnected=${info?.realtimeConnected}`);
check("Se suscribe al topic principal de chat", fake.state.subscriptions.includes(CHAT_TOPIC), fake.state.subscriptions.join(", "));
check("Se suscribe a los topics públicos de eventos de Kick", fake.state.subscriptions.includes(CHANNEL_TOPIC), fake.state.subscriptions.join(", "));
check("Suscribe los topics alternativos del chatroom", fake.state.subscriptions.includes(`chatroom_${CHATROOM_ID}`) && fake.state.subscriptions.includes(`chatrooms.${CHATROOM_ID}`));
check("No se pidió ningún token OAuth", hookCalls.transport.every((x) => !String(x.transport?.provider || "").includes("oauth")));

/* --- Chat --- */
fake.push(CHAT_TOPIC, "App\\Events\\ChatMessageEvent", chatPayload("msg-1", "Hola desde Kick sin OAuth"));
await wait(250);
const chat = lastEvent("chat");
check("El chat llega al dashboard/overlay", chat?.platform === "kick" && chat?.message === "Hola desde Kick sin OAuth", JSON.stringify({ platform: chat?.platform, message: chat?.message }));
check("El chat conserva usuario, id y badges", chat?.username === "viewer_one" && chat?.id === "msg-1" && Array.isArray(chat?.badges));
check("El chat alimenta puntos, música y ruleta", hookCalls.points.some((p) => p?.id === "msg-1") && hookCalls.music.some((p) => p?.id === "msg-1") && hookCalls.roulette.some((r) => r.kind === "chat"));

fake.push(CHAT_TOPIC, "App\\Events\\ChatMessageEvent", chatPayload("msg-1", "Hola desde Kick sin OAuth"));
await wait(200);
check("Los mensajes duplicados no se repiten", lastEvents("chat").filter((x) => x.payload?.id === "msg-1").length === 1);

/* --- Eventos propios de Kick --- */
const cases = [
  {
    label: "Suscripción (SubscriptionEvent)",
    event: "App\\Events\\SubscriptionEvent",
    topic: CHANNEL_TOPIC,
    payload: { chatroom_id: CHATROOM_ID, user_id: 4242, username: "viewer_one", months: 3, user: { id: 4242, username: "viewer_one" } },
    expect: { type: "sub" },
  },
  {
    label: "Subs regaladas (GiftedSubscriptionsEvent)",
    event: "GiftedSubscriptionsEvent",
    topic: CHANNEL_TOPIC,
    payload: { gifter_username: "generous", gifted_usernames: ["a", "b", "c"], gifter_total: 12, gifted_total: 3 },
    expect: { type: "subscription-gift", quantity: 3 },
  },
  {
    label: "Regalo KICKS (KicksGifted)",
    event: "KicksGifted",
    topic: CHANNEL_TOPIC,
    payload: { gift_transaction_id: "tx-1", sender: { id: 7, username: "whale" }, gift: { id: 5, name: "Rocket", amount: 500 } },
    expect: { type: "gift", amount: 500 },
  },
  {
    label: "Host (StreamHostedEvent)",
    event: "App\\Events\\StreamHostedEvent",
    topic: CHANNEL_TOPIC,
    payload: { hoster: { username: "hostfriend" }, viewers: 25 },
    expect: { type: "host" },
  },
  {
    label: "Baneo (UserBannedEvent)",
    event: "App\\Events\\UserBannedEvent",
    topic: CHAT_TOPIC,
    payload: { banned_user: { username: "troll" }, moderator: { username: "mod_one" }, chatroom_id: CHATROOM_ID },
    expect: { type: "moderation-ban" },
  },
  {
    label: "Mensaje eliminado (MessageDeletedEvent)",
    event: "App\\Events\\MessageDeletedEvent",
    topic: CHAT_TOPIC,
    payload: { id: "del-1", chatroom_id: CHATROOM_ID },
    expect: { type: "message-deleted" },
  },
  {
    label: "Mensaje fijado (PinnedMessageCreatedEvent)",
    event: "App\\Events\\PinnedMessageCreatedEvent",
    topic: CHAT_TOPIC,
    payload: { message: { content: "Sorteo a las 22h", sender: { username: "mod_one" } } },
    expect: { type: "pinned-message" },
  },
  {
    label: "Canje de puntos (RewardRedeemedEvent)",
    event: "RewardRedeemedEvent",
    topic: CHANNEL_TOPIC,
    payload: { redemption: { reward: { title: "Hidratar", cost: 500 }, user_input: "¡Toma agua!", status: "accepted" }, user: { username: "viewer_one" } },
    expect: { type: "reward" },
  },
  {
    label: "Encuesta (PollUpdateEvent)",
    event: "App\\Events\\PollUpdateEvent",
    topic: CHANNEL_TOPIC,
    payload: { question: "¿Jugamos ranked?" },
    expect: { type: "poll-update" },
  },
];

for (const testCase of cases) {
  const before = lastEvents("event").length;
  fake.push(testCase.topic, testCase.event, testCase.payload);
  await wait(200);
  const list = lastEvents("event");
  const payload = list[list.length - 1]?.payload;
  const isNew = list.length > before;
  const matches = Object.entries(testCase.expect).every(([key, value]) => payload?.[key] === value);
  check(testCase.label, isNew && matches, isNew ? `type=${payload?.type} action=${payload?.action}` : "no llegó ningún evento");
}

/* --- Regalo también por el canal dedicado de gifts --- */
const giftEmissions = lastEvents("gift");
check("Los regalos KICKS se emiten también por el stream 'gift'", giftEmissions.length > 0, `gifts=${giftEmissions.length}`);

/* --- Estado del directo y contadores --- */
fake.push(CHANNEL_TOPIC, "App\\Events\\LivestreamUpdated", { livestream: { viewer_count: 128, title: "Directo de prueba", is_live: true }, followers_count: 4200 });
await wait(250);
const stats = lastEvent("stats")?.kick;
check("El estado del directo actualiza viewers/seguidores sin crear actividad falsa", stats?.viewers === 128 && stats?.followers === 4200, JSON.stringify(stats));

fake.push(CHANNEL_TOPIC, "App\\Events\\StreamerIsLive", { channel_id: CHANNEL_ID, is_live: true });
await wait(250);
check("StreamerIsLive avisa al hook de estado del directo", hookCalls.state.some((x) => x.normalized?.type === "stream-status"));

fake.push(CHANNEL_TOPIC, "GoalProgressUpdateEvent", { amount: 40, goal_amount: 100, title: "Meta de subs" });
await wait(250);
const goalsInActivity = lastEvents("event").filter((x) => String(x.payload?.event || "").toLowerCase().includes("goal"));
check("Las metas/goals se tratan como estadística, no como actividad de usuario", goalsInActivity.length === 0);

/* --- Limpieza de chat --- */
fake.push(CHAT_TOPIC, "App\\Events\\ChatroomClearEvent", { chatroom_id: CHATROOM_ID });
await wait(250);
check("ChatroomClearEvent avisa para limpiar el chat del overlay", lastEvents("chatClear").length > 0, `chatClear=${lastEvents("chatClear").length}`);

/* --- Tolerancia a topics rechazados --- */
const beforeReject = lastEvents("chat").length;
fake.state.subscriptions.length = 0;
fake.push(CHAT_TOPIC, "App\\Events\\ChatMessageEvent", chatPayload("msg-2", "Sigo aquí después del rechazo", "viewer_two"));
await wait(200);
check("El chat sigue vivo tras recibir frames normales", lastEvents("chat").length === beforeReject + 1);

/* --- Un segundo cliente con un topic secundario rechazado --- */
const strictFake = createFakePusher({ port: PORT + 1, rejectChannels: new Set([`chatrooms.${CHATROOM_ID}`, `chatroom_${CHATROOM_ID}`]) });
await new Promise((resolve) => strictFake.server.on("listening", resolve));
process.env.KICK_PUSHER_URL = strictFake.url;
const kick2 = await import(`../services/kick.js?tolerant=${Date.now()}`);
const io2 = createFakeIo();
const info2 = await kick2.connect("canaltolerante", io2, OWNER_TOLERANT, {
  channelId: CHANNEL_ID,
  chatroomId: CHATROOM_ID,
  username: "canaltolerante",
  displayName: "Canal Tolerante",
  isLive: true,
});
await wait(400);
check("Un topic secundario rechazado no impide conectar", info2?.realtimeConnected === true, `realtimeConnected=${info2?.realtimeConnected}`);
strictFake.push(CHAT_TOPIC, "App\\Events\\ChatMessageEvent", chatPayload("msg-t1", "Chat OK con topics rechazados", "viewer_three"));
await wait(250);
const tolerantChat = emissions.filter((x) => x.room === `user:${OWNER_TOLERANT}` && x.event === "chat");
check("El chat funciona aunque Kick rechace topics alternativos", tolerantChat.length === 1, `chats=${tolerantChat.length}`);
check("Los topics rechazados quedan registrados y no se reintentan en bucle", strictFake.state.rejected.length >= 2, strictFake.state.rejected.join(", "));
kick2.disconnect(OWNER_TOLERANT);
await strictFake.close();

/* --- Movimiento de chatroom --- */
const NEW_CHATROOM = 8888;
fake.push(CHAT_TOPIC, "App\\Events\\ChatMoveToSupportedChannelEvent", { chatroom_id: NEW_CHATROOM });
await wait(1500);
const movedState = kick.getState(OWNER);
check("ChatMoveToSupportedChannelEvent re-suscribe al nuevo chatroom", Number(movedState?.chatroomId) === NEW_CHATROOM, `chatroomId=${movedState?.chatroomId}`);
check("La sesión sigue activa tras el cambio de chatroom", movedState?.sessionActive === true && movedState?.connected === true);
fake.push(`chatrooms.${NEW_CHATROOM}.v2`, "App\\Events\\ChatMessageEvent", chatPayload("msg-3", "Chat después del cambio", "viewer_four"));
await wait(300);
check("El chat sigue llegando en el nuevo chatroom", lastEvents("chat").some((x) => x.payload?.id === "msg-3"));

/* ---getState expone la cobertura de eventos --- */
const finalState = kick.getState(OWNER);
check("getState expone la cobertura anónima de eventos", typeof finalState?.eventsTopics === "boolean" && Array.isArray(finalState?.subscribedTopics), JSON.stringify({ eventsTopics: finalState?.eventsTopics, subscribed: finalState?.subscribedTopics }));

kick.disconnect(OWNER);
await fake.close();

const failed = results.filter((x) => !x.ok);
console.log(`\n${"=".repeat(64)}`);
console.log(`Resultado: ${results.length - failed.length}/${results.length} comprobaciones OK`);
if (failed.length) {
  console.log("Fallan:");
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}
console.log(`${"=".repeat(64)}\n`);
process.exit(failed.length ? 1 : 0);
