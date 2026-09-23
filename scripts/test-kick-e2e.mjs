/**
 * Prueba punta a punta de Kick SIN OAuth sobre el servidor real.
 *
 * Arranca server.js, crea una cuenta, conecta el panel y un overlay generado por
 * Socket.IO, conecta un canal de Kick contra el falso realtime público y verifica
 * que el chat y los eventos propios de Kick llegan a AMBOS destinos con la misma
 * lógica que TikTok/Twitch.
 *
 * Uso:  node scripts/test-kick-e2e.mjs
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { createFakePusher } from "./kick-fake-pusher.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.E2E_PORT || 4611);
const FAKE_PORT = Number(process.env.FAKE_KICK_PORT || 4612);
const BASE = `http://127.0.0.1:${PORT}`;
const CHATROOM_ID = 31337;
const CHANNEL_ID = 4242;
const CHAT_TOPIC = `chatrooms.${CHATROOM_ID}.v2`;
const CHANNEL_TOPIC = `channel_${CHANNEL_ID}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/* ------------------------------------------------------------------ */
/* Cliente Socket.IO mínimo (Engine.IO v4 sobre WebSocket)             */
/* ------------------------------------------------------------------ */

class RawSocketIO {
  constructor(auth = {}) {
    this.auth = auth;
    this.handlers = new Map();
    this.ackHandlers = new Map();
    this.ackSeq = 0;
    this.connected = false;
    this.logs = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${BASE}/socket.io/?EIO=4&transport=websocket`);
      this.ws = ws;
      const timeout = setTimeout(() => reject(new Error("timeout esperando el namespace")), 10_000);

      ws.on("message", (raw) => {
        const text = String(raw);
        this.logs.push(text.slice(0, 200));
        const engineType = text[0];
        const body = text.slice(1);
        if (engineType === "0") { ws.send(`40${JSON.stringify(this.auth)}`); return; }
        if (engineType === "2") { ws.send("3"); return; }
        if (engineType !== "4") return;
        const ioType = body[0];
        const rest = body.slice(1);
        if (ioType === "0") {
          this.connected = true;
          clearTimeout(timeout);
          resolve(this);
          return;
        }
        if (ioType === "4") { clearTimeout(timeout); reject(new Error(`connect_error: ${rest}`)); return; }
        if (ioType === "2" || ioType === "3") {
          const idMatch = /^(\d+)/.exec(rest);
          const ackId = idMatch?.[1] || "";
          const json = ackId ? rest.slice(ackId.length) : rest;
          let payload = null;
          try { payload = JSON.parse(json); } catch { return; }
          if (ioType === "3" && ackId) {
            const handler = this.ackHandlers.get(ackId);
            if (handler) { this.ackHandlers.delete(ackId); handler(payload?.[0]); }
            return;
          }
          const [event, ...args] = Array.isArray(payload) ? payload : [];
          if (!event) return;
          for (const handler of this.handlers.get(event) || []) handler(...args);
        }
      });
      ws.on("error", (error) => { clearTimeout(timeout); reject(error); });
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
    return this;
  }

  emit(event, payload, ack) {
    if (!this.connected) throw new Error("socket no conectado");
    if (typeof ack === "function") {
      const id = String(++this.ackSeq);
      this.ackHandlers.set(id, ack);
      this.ws.send(`42${id}${JSON.stringify([event, payload])}`);
      return;
    }
    this.ws.send(`42${JSON.stringify([event, payload])}`);
  }

  close() { try { this.ws?.close(); } catch {} }
}

/* ------------------------------------------------------------------ */
/* Utilidades HTTP                                                     */
/* ------------------------------------------------------------------ */

async function waitForServer(timeoutMs = 40_000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/me`);
      if (response.status === 401 || response.status === 200) return true;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await wait(500);
  }
  throw new Error(`El servidor no arrancó: ${lastError}`);
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  return data;
}

/* ------------------------------------------------------------------ */
/* Prueba                                                              */
/* ------------------------------------------------------------------ */

const fake = createFakePusher({ port: FAKE_PORT });
await new Promise((resolve) => fake.server.on("listening", resolve));

const server = spawn(process.execPath, ["server.js"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    KICK_PUSHER_URL: `ws://127.0.0.1:${FAKE_PORT}/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false`,
    KICK_WEBHOOK_ENABLED: "false",
    KICK_CLIENT_ID: "",
    KICK_CLIENT_SECRET: "",
    KICK_RESUBSCRIBE_INTERVAL_MS: "2000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const serverLog = [];
server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

try {
  await waitForServer();
  console.log("\nServidor StreamFusion arrancado sin credenciales de Kick.\n");

  const email = `kick-e2e-${Date.now()}@example.com`;
  const account = await json(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "StreamFusion2026", displayName: "Prueba Kick" }),
  });
  check("La cuenta se crea por API", Boolean(account?.token && account?.user?.id));

  const overlay = await json(`${BASE}/api/overlay/key`, { headers: { authorization: `Bearer ${account.token}` } });
  check("El overlay generado tiene su clave", Boolean(overlay?.key));

  const dashboard = new RawSocketIO({ token: account.token });
  const overlaySocket = new RawSocketIO({ overlayKey: overlay.key, owner: account.user.id });
  await dashboard.open();
  await overlaySocket.open();
  check("Panel y overlay se conectan por Socket.IO", dashboard.connected && overlaySocket.connected);

  const received = {
    dashboard: { chat: [], event: [], gift: [], stats: [], system: [], accountState: [], chatClear: [] },
    overlay: { chat: [], event: [], gift: [], stats: [], system: [], accountState: [], chatClear: [] },
  };
  for (const [label, socket] of [["dashboard", dashboard], ["overlay", overlaySocket]]) {
    for (const event of Object.keys(received[label])) {
      socket.on(event, (payload) => received[label][event].push(payload));
    }
  }
  await wait(400);

  const ack = await new Promise((resolve) => {
    dashboard.emit("connectKick", {
      channel: "canale2e",
      channelId: CHANNEL_ID,
      chatroomId: CHATROOM_ID,
      broadcasterUserId: 0,
      profile: { username: "canale2e", displayName: "Canal E2E", avatarUrl: "", isLive: true },
    }, (response) => resolve(response));
  });
  await wait(600);

  check("connectKick responde OK sin OAuth", ack?.ok === true, JSON.stringify(ack));
  check("El servidor se suscribió al chat público de Kick", fake.state.subscriptions.includes(CHAT_TOPIC), fake.state.subscriptions.join(", "));
  check("El servidor se suscribió a los eventos públicos del canal", fake.state.subscriptions.includes(CHANNEL_TOPIC), fake.state.subscriptions.join(", "));
  const kickState = received.dashboard.accountState.filter((x) => x?.platform === "kick").pop();
  check("El estado de la cuenta Kick queda conectado", kickState?.connected === true && kickState?.realtimeConnected === true, JSON.stringify(kickState));

  fake.push(CHAT_TOPIC, "App\\Events\\ChatMessageEvent", {
    id: "e2e-msg-1",
    chatroom_id: CHATROOM_ID,
    content: "Chat de Kick sin OAuth",
    created_at: new Date().toISOString(),
    sender: { id: 77, username: "viewer_e2e", slug: "viewer_e2e", identity: { color: "#53fc18", badges: [] }, profile_picture: "" },
  });
  await wait(500);

  const dashChat = received.dashboard.chat.find((x) => x?.id === "e2e-msg-1");
  const overlayChat = received.overlay.chat.find((x) => x?.id === "e2e-msg-1");
  check("El chat de Kick llega al panel", Boolean(dashChat) && dashChat.platform === "kick", dashChat?.message || "no llegó");
  check("El mismo chat llega al overlay (misma fuente que Twitch/TikTok)", Boolean(overlayChat) && overlayChat.platform === "kick", overlayChat?.message || "no llegó");

  fake.push(CHANNEL_TOPIC, "App\\Events\\SubscriptionEvent", {
    chatroom_id: CHATROOM_ID, user_id: 77, username: "viewer_e2e", months: 2,
    user: { id: 77, username: "viewer_e2e" },
  });
  fake.push(CHANNEL_TOPIC, "KicksGifted", {
    gift_transaction_id: "e2e-tx-1", sender: { id: 88, username: "whale_e2e" }, gift: { id: 3, name: "Diamond", amount: 900 },
  });
  fake.push(CHANNEL_TOPIC, "App\\Events\\StreamHostedEvent", { hoster: { username: "host_e2e" }, viewers: 12 });
  fake.push(CHANNEL_TOPIC, "App\\Events\\LivestreamUpdated", { livestream: { viewer_count: 64, title: "E2E", is_live: true }, followers_count: 1500 });
  fake.push(CHAT_TOPIC, "App\\Events\\ChatroomClearEvent", { chatroom_id: CHATROOM_ID });
  await wait(900);

  const dashEvents = received.dashboard.event;
  const overlayEvents = received.overlay.event;
  const findType = (list, type) => list.find((x) => x?.type === type);
  check("Suscripción de Kick visible en el panel", Boolean(findType(dashEvents, "sub")), findType(dashEvents, "sub")?.action || "no llegó");
  check("Suscripción de Kick visible en el overlay", Boolean(findType(overlayEvents, "sub")));
  check("Regalo KICKS visible en el panel", Boolean(findType(dashEvents, "gift")), findType(dashEvents, "gift")?.action || "no llegó");
  check("Regalo KICKS también por el stream de gifts", received.dashboard.gift.length > 0 && received.overlay.gift.length > 0, `panel=${received.dashboard.gift.length} overlay=${received.overlay.gift.length}`);
  check("Host de Kick visible", Boolean(findType(dashEvents, "host")) && Boolean(findType(overlayEvents, "host")));
  check("Estado del directo actualiza contadores", received.dashboard.stats.some((x) => x?.kick?.viewers === 64 && x?.kick?.followers === 1500), JSON.stringify(received.dashboard.stats.at(-1)?.kick || {}));
  check("Limpieza de chat avisada al panel y al overlay", received.dashboard.chatClear.length > 0 && received.overlay.chatClear.length > 0);

  const systemMessages = [...received.dashboard.system, ...received.overlay.system].map((x) => String(x?.message || ""));
  check("El panel informa que los eventos de Kick están activos sin OAuth", systemMessages.some((m) => m.includes("sin OAuth")), systemMessages.filter((m) => m.toLowerCase().includes("kick")).join(" | ").slice(0, 200));

  dashboard.emit("disconnectKick");
  await wait(400);
  const afterDisconnect = received.dashboard.accountState.filter((x) => x?.platform === "kick").pop();
  check("Desconectar Kick deja la cuenta en modo guardado", afterDisconnect?.connected === false, JSON.stringify(afterDisconnect?.mode));

  dashboard.close();
  overlaySocket.close();
} catch (error) {
  check("Prueba punta a punta sin excepciones", false, error?.message || String(error));
  console.log("\n--- últimas 40 líneas del servidor ---");
  console.log(serverLog.join("").split("\n").slice(-40).join("\n"));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await fake.close();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${"=".repeat(64)}`);
console.log(`E2E Kick sin OAuth: ${results.length - failed.length}/${results.length} comprobaciones OK`);
if (failed.length) for (const item of failed) console.log(`  - FALLA: ${item.name}`);
console.log(`${"=".repeat(64)}\n`);
process.exit(failed.length ? 1 : 0);
