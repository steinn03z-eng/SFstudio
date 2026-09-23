/**
 * Falso realtime público de Kick (Pusher) para pruebas locales.
 *
 * Reproduce el comportamiento del transporte anónimo de Kick: handshake Pusher,
 * suscripción a topics, confirmaciones, rechazos por topic y entrega de eventos
 * con el nombre real que usa Kick (App\Events\...).
 *
 * No requiere acceso a kick.com ni credenciales.
 */

import { WebSocketServer } from "ws";

const DEFAULT_PORT = Number(process.env.FAKE_KICK_PORT || 4599);

export function createFakePusher({ rejectChannels = new Set(), port = DEFAULT_PORT } = {}) {
  const state = {
    subscriptions: [],
    rejected: [],
    received: [],
    connections: 0,
    sockets: new Set(),
  };

  const server = new WebSocketServer({ host: "127.0.0.1", port });

  const broadcast = (frame) => {
    const text = JSON.stringify(frame);
    for (const socket of state.sockets) {
      if (socket.readyState === 1) socket.send(text);
    }
  };

  server.on("connection", (socket) => {
    state.connections += 1;
    state.sockets.add(socket);
    socket.send(JSON.stringify({
      event: "pusher:connection_established",
      data: JSON.stringify({ activity_timeout: "120", socket_id: `1234.${state.connections}` }),
    }));

    socket.on("message", (raw) => {
      let frame = null;
      try { frame = JSON.parse(String(raw)); } catch { return; }
      state.received.push(frame);
      if (frame?.event !== "pusher:subscribe") return;
      const channel = String(frame?.data?.channel || "");
      if (!channel) return;
      if (rejectChannels.has(channel)) {
        state.rejected.push(channel);
        socket.send(JSON.stringify({
          event: "pusher:subscription_error",
          channel,
          data: JSON.stringify({ type: "AuthError", error_data: { reason: "Channel is private" }, status: 403 }),
        }));
        return;
      }
      state.subscriptions.push(channel);
      socket.send(JSON.stringify({
        event: "pusher_internal:subscription_succeeded",
        channel,
        data: "{}",
      }));
    });

    socket.on("close", () => state.sockets.delete(socket));
    socket.on("error", () => state.sockets.delete(socket));
  });

  return {
    server,
    state,
    url: `ws://127.0.0.1:${port}/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false`,
    // Kick entrega los datos del evento como un string JSON dentro de "data".
    push(channel, eventName, payload) {
      broadcast({ event: eventName, channel, data: JSON.stringify(payload) });
    },
    ping() {
      broadcast({ event: "pusher:ping", data: "{}" });
    },
    async close() {
      for (const socket of state.sockets) { try { socket.close(); } catch {} }
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
