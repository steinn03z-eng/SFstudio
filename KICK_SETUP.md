# Configuración de Kick en StreamFusion

Esta versión separa el login OAuth de Kick de la configuración pública y utiliza el token OAuth del propietario del canal para registrar los eventos oficiales.

## Variables de entorno

Configura en el servidor:

```env
KICK_CLIENT_ID=TU_CLIENT_ID
KICK_CLIENT_SECRET=TU_CLIENT_SECRET
KICK_WEBHOOK_ENABLED=true
KICK_WEBHOOK_URL=https://TU_DOMINIO/api/kick/webhook
KICK_OAUTH_REDIRECT_URI=https://TU_DOMINIO/api/kick/oauth/callback
KICK_PUBLIC_BASE_URL=https://TU_DOMINIO
```

`KICK_OAUTH_REDIRECT_URI` debe coincidir exactamente con la URL registrada en Kick Developer. La URL pública del webhook debe apuntar a:

`POST /api/kick/webhook`

## Flujo

1. En StreamFusion escribe el canal de Kick y pulsa **Conectar**.
2. StreamFusion resuelve el canal/chatroom y abre la autorización OAuth de Kick.
3. Kick devuelve el código al callback con PKCE.
4. El servidor guarda el access/refresh token en su propia tabla privada (`platform_oauth_tokens`), no dentro de `user_settings`.
5. El servidor registra los eventos oficiales con el scope `events:subscribe`.
6. El chat realtime llega por el WebSocket público del chatroom.
7. Chat y eventos se emiten a `user:<id>`; por eso dashboard y overlays reciben la misma fuente sin duplicarse.

## Eventos cubiertos

- `chat.message.sent`
- `channel.followed`
- `channel.subscription.new`
- `channel.subscription.renewal`
- `channel.subscription.gifts`
- `channel.reward.redemption.updated`
- `livestream.status.updated`
- `livestream.metadata.updated`
- `moderation.banned`
- `kicks.gifted`

Los eventos de Kick se normalizan a tipos internos: `chat`, `follow`, `sub`, `resub`, `subscription-gift`, `gift`, `reward`, `raid`, `host` y eventos de sistema/moderación.

## Bot de voz

Kick usa únicamente sus eventos válidos en el selector de reglas:

- Follow
- Suscripción
- Renovación
- Suscripciones regaladas
- Raid
- Host
- Recompensa
- Regalo

No se muestran como eventos de Kick los conceptos exclusivos de TikTok (likes, shares, joins) ni los Bits de Twitch.

## Diagnóstico

El dashboard puede consultar `/api/kick/oauth/status` para saber si la cuenta está autorizada y si el token tiene `events:subscribe`.

Una suscripción a `kicks.gifted` se registra cuando está disponible, pero la entrega final de ese webhook depende del servicio de eventos de Kick. Si Kick no entrega ese webhook, el código no puede inventarlo; el resto de rutas permanece operativo.
