StreamFusion · Música

Motor de Música actual
- ytmusicapi se usa únicamente para buscar canciones y obtener metadatos/videoId.
- La reproducción se realiza con el reproductor oficial de YouTube mediante IFrame Player API en el navegador/OBS.
- No se usan yt-dlp, PO Tokens, bgutil ni cookies de YouTube para este flujo.
- La búsqueda no requiere YouTube Data API ni una API key de YouTube.
- El overlay y la vista previa consumen el mismo renderer visual y el mismo modelo de estado de música.
- El botón Guardar solo persiste la configuración; los cambios visuales se emiten en tiempo real.

Despliegue
- En Railway se incluye Dockerfile para garantizar Node + Python 3 + ytmusicapi.
- requirements.txt fija ytmusicapi 1.12.2 y Python 3.10+ es el mínimo requerido por esa versión.
- El servidor prueba python3/python y permite definir el intérprete mediante la variable PYTHON.

Importante
La reproducción depende de las políticas y disponibilidad del reproductor de YouTube. Algunos vídeos pueden no permitir reproducción embebida. StreamFusion muestra un aviso para esos casos en lugar de intentar extraer su audio directamente.
