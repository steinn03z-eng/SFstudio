#!/usr/bin/env python3
import json, sys, re

def emit(obj, code=0):
    print(json.dumps(obj, ensure_ascii=False, separators=(',', ':')))
    raise SystemExit(code)

try:
    from ytmusicapi import YTMusic
except Exception as exc:
    emit({"ok": False, "error": f"ytmusicapi no está disponible: {exc}"}, 2)

mode = sys.argv[1] if len(sys.argv) > 1 else 'search'
value = sys.argv[2] if len(sys.argv) > 2 else ''
if not value.strip():
    emit({"ok": False, "error": "Consulta vacía."}, 2)

try:
    yt = YTMusic()
    if mode == 'video':
        video_id = value.strip()
        data = yt.get_song(video_id)
        details = data.get('videoDetails') or {}
        micro = data.get('microformat', {}).get('microformatDataRenderer', {}) or {}
        length = int(details.get('lengthSeconds') or 0)
        thumbs = (micro.get('thumbnail', {}) or {}).get('thumbnails', []) or []
        emit({"ok": True, "track": {
            "videoId": video_id,
            "title": details.get('title') or micro.get('title') or 'Sin título',
            "artists": [{"name": details.get('author') or 'Artista desconocido'}],
            "duration_seconds": length,
            "thumbnail": thumbs[-1].get('url') if thumbs else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        }})
    else:
        results = yt.search(value, filter='songs', limit=8) or []
        songs = []
        for item in results:
            vid = item.get('videoId')
            if not vid:
                continue
            # Prefer a song that YouTube reports as embeddable. We do not use
            # the returned streaming URLs; this check is only for playback
            # compatibility with the official IFrame Player.
            try:
                detail = yt.get_song(vid) or {}
                playability = detail.get('playabilityStatus') or {}
                if playability.get('playableInEmbed') is False:
                    continue
                details = detail.get('videoDetails') or {}
                length = int(details.get('lengthSeconds') or item.get('duration_seconds') or 0)
            except Exception:
                length = int(item.get('duration_seconds') or 0)
            artists = item.get('artists') or []
            thumbs = item.get('thumbnails') or []
            songs.append({
                "videoId": vid,
                "title": item.get('title') or 'Sin título',
                "artists": artists,
                "duration": item.get('duration'),
                "duration_seconds": length,
                "thumbnail": thumbs[-1].get('url') if thumbs else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
            })
            if len(songs) >= 5:
                break
        if not songs:
            emit({"ok": False, "error": "No encontré una canción reproducible en el reproductor de YouTube."}, 1)
        emit({"ok": True, "results": songs})
except Exception as exc:
    emit({"ok": False, "error": str(exc) or "No se pudo consultar YouTube Music."}, 1)
