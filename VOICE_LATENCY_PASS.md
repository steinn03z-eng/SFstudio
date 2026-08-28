StreamFusion Voice latency/stability pass

- Preserva el texto completo del comentario (sin truncarlo a 220 caracteres).
- Divide mensajes largos en segmentos naturales para que el primer fragmento se genere y reproduzca rápido mientras los siguientes se preparan en paralelo.
- TTS preparation concurrency: 3, manteniendo reproducción FIFO y sin solapamiento.
- Mantiene streaming HTTP -> MediaSource para comenzar a reproducir cuando llegan los primeros datos.
- Fish Audio TTS usa MP3, latency=balanced y chunk_length=120 para reducir tiempo hasta primer audio sin cambiar la voz/temperatura.
- Pool/keep-alive se favorece en las solicitudes HTTP al proveedor.
- La conexión de TikTok y la precarga/consulta del perfil/avatar se ejecutan en paralelo; el avatar guardado se muestra inmediatamente y el nuevo se sincroniza en cuanto está disponible.
