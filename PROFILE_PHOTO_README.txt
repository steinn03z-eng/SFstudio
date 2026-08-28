IMPLEMENTACIÓN: FOTO DE PERFIL DE LA CUENTA

Se añadió en Ajustes > Cuenta un selector de foto con cuatro fuentes:
- Archivo local
- URL
- Twitch
- TikTok

La foto confirmada se guarda en backend, asociada a la cuenta de StreamFusion, dentro de user_settings/profilePhoto y como archivo en data/profile-photos.

TikTok:
- Usa únicamente GET /tiktok/users/{unique_id}/basic de Euler.
- No resuelve roomId ni abre WebSocket adicional.
- Busca avatar_larger, avatar_medium y avatar_thumb.

Twitch:
- Usa el endpoint público de avatar de DecAPI para obtener la URL del avatar del canal.

La imagen se descarga al backend y se sirve desde /profile-photo/{token}, evitando depender de URLs externas que puedan expirar.

La conexión de TikTok existente no fue sustituida por este sistema. La foto se configura de forma independiente desde Ajustes.

La clave de Euler sigue saliendo de EULER_API_KEY del .env existente.
