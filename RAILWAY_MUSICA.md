# Música en Railway

## Arquitectura
StreamFusion ya no descarga ni extrae audio de YouTube en el servidor.

1. `ytmusicapi` busca canciones y devuelve metadatos/videoId.
2. El navegador/OBS crea un YouTube IFrame Player oculto.
3. El reproductor propio de StreamFusion refleja el estado real del IFrame.
4. Socket.IO comunica estado y configuración, pero no transporta audio.

## Despliegue
El repositorio incluye un `Dockerfile` para Railway. Esto evita el error `spawn python3 ENOENT` porque el contenedor instala Python 3 y `ytmusicapi` antes de arrancar StreamFusion.

`requirements.txt` fija `ytmusicapi==1.12.2`, que requiere Python 3.10 o superior.

## Variables
No hace falta `PYTHON` en Railway (el Dockerfile usa `python3`). Tampoco hace falta `YOUTUBE_API_KEY`, cookies, PO Tokens, `PIPED_API_URLS`, `INVIDIOUS_API_URLS` ni `BGUTIL_PORT` para este motor.

## Estabilidad
Una caída del WebSocket no debe detener directamente el reproductor. Al reconectar, el overlay vuelve a consultar el estado de Música. La posición mostrada proviene del tiempo real del YouTube Player cuando el overlay está reproduciendo.

## Limitación
El reproductor sigue sujeto a la disponibilidad, embed restrictions y políticas de YouTube. No se garantiza ausencia universal de anuncios ni reproducción de vídeos que YouTube no permita incrustar.
