# Kick en StreamFusion

Kick funciona **sin OAuth**: el chat y los eventos públicos del canal se leen del
realtime anónimo de Kick (el mismo que usa kick.com), igual que TikTok y Twitch.
No hace falta crear una aplicación en Kick Developer ni autorizar nada para
streamear.

La vinculación OAuth es **opcional** y solo aporta los webhooks oficiales
(básicamente los *follows individuales*, que Kick no publica en abierto).

## Conexión (sin OAuth)

1. En **Conexiones** escribe el canal de Kick y pulsa **Conectar**.
2. El navegador intenta resolver `chatroomId` y `channelId` en kick.com.
3. Si el navegador no puede (CORS/Cloudflare), el servidor lo resuelve por su
   cuenta: `api/v2/channels/{slug}` → `api/v1/channels/{slug}` → chatroom v2/v1 →
   HTML del canal (`__NEXT_DATA__`).
4. El servidor abre el WebSocket público de Kick y se suscribe a los topics del
   canal. En cuanto Kick confirma el chatroom, la conexión queda **lista**.
5. Chat y eventos se emiten a la sala `user:<id>`: dashboard y overlays generados
   reciben exactamente la misma fuente, sin duplicarse.

### Topics públicos que se suscriben

| Topic | Contenido | ¿Obligatorio? |
| --- | --- | --- |
| `chatrooms.{chatroomId}.v2` | Chat en vivo | Sí: marca la conexión como lista |
| `chatroom_{chatroomId}` | Frames alternativos/legacy del chatroom | No |
| `chatrooms.{chatroomId}` | Nomenclatura alternativa del chatroom | No |
| `channel_{channelId}` | Eventos propios del canal | No |

Los tres últimos son *best effort*: si Kick los rechaza, se registran en
`failedTopics`, se dejan de reintentar y **la sesión sigue viva**. La
suscripción se reenvía cada 45 s (`KICK_RESUBSCRIBE_INTERVAL_MS`) porque Kick
descarta suscripciones inactivas en sesiones largas.

## Eventos de Kick cubiertos sin OAuth

| Evento real de Kick | Tipo interno | Se ve como |
| --- | --- | --- |
| `App\Events\ChatMessageEvent` | `chat` | Chat unificado + bot de voz |
| `App\Events\SubscriptionEvent` | `sub` | Nueva suscripción |
| `GiftedSubscriptionsEvent` | `subscription-gift` | Suscripciones regaladas |
| `KicksGifted` | `gift` | Regalo KICKS (también por el stream `gift`) |
| `App\Events\StreamHostedEvent` | `host` | Host |
| `RewardRedeemedEvent` | `reward` | Canje de puntos |
| `App\Events\UserBannedEvent` / `UserUnbannedEvent` | `moderation-ban` / `moderation-unban` | Baneo / desbaneo |
| `App\Events\MessageDeletedEvent` | `message-deleted` | Mensaje eliminado |
| `App\Events\PinnedMessageCreatedEvent` / `...DeletedEvent` | `pinned-message` / `pinned-message-deleted` | Mensaje fijado / retirado |
| `App\Events\PollUpdateEvent` / `PollDeleteEvent` | `poll-update` / `poll-delete` | Encuestas |
| `App\Events\ChatroomClearEvent` | `chat-clear` | Limpia el chat del overlay (solo Kick) |
| `App\Events\ChatMoveToSupportedChannelEvent` | `chat-move` | Re-suscribe al nuevo chatroom automáticamente |
| `App\Events\StreamerIsLive` / `StopStreamBroadcast` | `stream-status` | Directo iniciado / finalizado |
| `App\Events\LivestreamUpdated` | `stats` | Viewers, título y seguidores en los contadores |
| `Goal*Event`, `FollowersUpdatedEvent` | `stats` | Contadores, nunca actividad falsa de usuario |

Contadores de sesión en `stats.kick`: `viewers`, `followers`, `subscriptions`,
`gifts`, `follows`, `raids`, `hosts`, `title`, `isLive` y `eventsTopic` (true
cuando Kick confirmó el topic público de eventos).

### Lo único que sigue necesitando OAuth

Kick **no publica follows individuales** en su realtime anónimo. Sin OAuth se
ven los cambios agregados de seguidores (`followers_count`), pero no
"@usuario te siguió". Si necesitas ese evento (y el filtro *Solo seguidores* del
bot de voz aplicado a Kick), usa **Vincular eventos oficiales (opcional)** en la
tarjeta de Kick.

## Variables de entorno

Ninguna es obligatoria para Kick.

```env
# Opcional: solo si quieres los webhooks oficiales (follows individuales)
KICK_CLIENT_ID=TU_CLIENT_ID
KICK_CLIENT_SECRET=TU_CLIENT_SECRET
KICK_WEBHOOK_ENABLED=true
KICK_WEBHOOK_URL=https://TU_DOMINIO/api/kick/webhook
KICK_OAUTH_REDIRECT_URI=https://TU_DOMINIO/api/kick/oauth/callback
KICK_PUBLIC_BASE_URL=https://TU_DOMINIO

# Opcional: ajustes del realtime público
KICK_PUSHER_URL=wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false
KICK_PUSHER_VERSION=8.4.0-rc2
KICK_RESUBSCRIBE_INTERVAL_MS=45000
```

Si Kick rota su clave pública de Pusher, `openSocket()` la redescubre
automáticamente desde la portada de kick.com; también puedes fijarla con
`KICK_PUSHER_URL`.

## Bot de voz

El bot de voz tiene **opciones de plataforma** independientes (TikTok / Twitch /
Kick) en *Quién puede ser leído → Plataformas que lee el bot*. Se combinan con el
filtro global (todo el chat, donadores, seguidores, moderadores, personalizado).

Kick usa únicamente sus eventos válidos en el selector de reglas: suscripción,
renovación, suscripciones regaladas, raid, host, recompensa y regalo. No se
ofrecen conceptos exclusivos de TikTok (likes, shares, joins) ni Bits de Twitch.

## Pruebas

Sin acceso a kick.com ni credenciales:

```bash
npm run test:kick        # conector: topics, eventos, tolerancia a fallos, dedupe
npm run test:kick:e2e    # servidor real: chat y eventos llegan a panel + overlay
npm test                 # ambas
```

`scripts/kick-fake-pusher.mjs` simula el realtime público de Kick (handshake
Pusher, suscripciones, rechazos por topic y eventos con los nombres reales).

## Diagnóstico

- `/api/kick/oauth/status` → estado de la vinculación opcional.
- `kick.getState(ownerId)` → `realtimeReady`, `eventsTopics`, `subscribedTopics`,
  `failedTopics`, `live`, `viewers`.
- Mensajes de sistema en el panel: `Kick conectado a @canal.` y
  `Eventos de Kick activos (subs, regalos, hosts y estado del directo) sin OAuth.`
- Si Kick protege los endpoints JSON con Cloudflare para tu servidor, la
  resolución cae al HTML del canal. Si tampoco puede, conecta una vez desde el
  navegador (el panel resuelve los IDs y se los pasa al servidor).
