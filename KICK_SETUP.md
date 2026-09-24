# Kick — modo realtime público (sin OAuth)

Esta versión NO utiliza Kick OAuth para conectar el canal. El streamer solo introduce su canal de Kick.

## Cómo funciona

1. El navegador resuelve el `chatroomId` desde Kick.
2. StreamFusion abre el WebSocket público de Kick/Pusher.
3. Se suscribe anónimamente a `chatrooms.<chatroomId>.v2`.
4. Los mensajes de chat y los eventos que Kick publique por ese transporte se normalizan en el mismo bus que Twitch/TikTok.
5. Overlay Chat, Overlay Eventos, Overlay Regalos, puntos, música y reglas del bot de voz reciben el mismo payload normalizado.

No necesitas `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_OAUTH_REDIRECT_URI` ni autorización OAuth del streamer para este modo.

**Qué llega sin OAuth:** el adaptador usa el realtime público de Kick para chat y las actividades que Kick publique en ese canal (por ejemplo FollowEvent, SubscriptionEvent, GiftedSubscriptionsEvent y otros eventos realtime disponibles). Los overlays consumen todos esos eventos mediante Socket.IO. Las Kicks/gifts monetarias (`kicks.gifted`) no se pueden garantizar mediante el transporte público; Kick actualmente puede no publicar ese evento allí. No se simula ni se inventa un regalo si Kick no lo entrega.

## Importante sobre la API oficial

Kick documenta `events:subscribe` como un scope OAuth de usuario para webhooks oficiales. Ese mecanismo no se utiliza en este proyecto porque el diseño de StreamFusion aquí es realtime público sin OAuth.

El transporte Pusher público no forma parte de la API pública oficial documentada, por lo que Kick podría cambiarlo sin aviso.
