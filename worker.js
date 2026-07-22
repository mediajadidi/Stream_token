export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 🎮 SMART PLAYER - Works in browser
    if (path === '/' || path === '/player') {
      const gamePath = url.searchParams.get('game') || '';
      const gameId = gamePath.split('/').pop() || '';
      
      const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎯 Stream Player</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0a0a;
            font-family: system-ui, -apple-system, sans-serif;
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .header {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border-radius: 12px 12px 0 0;
            margin-bottom: 0;
        }
        h1 { font-size: 20px; color: #e94560; }
        .video-box {
            background: #000;
            border: 1px solid #2a2a4a;
            aspect-ratio: 16/9;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        video { width: 100%; height: 100%; display: none; }
        video.active { display: block; }
        #status {
            text-align: center;
            padding: 20px;
            color: #888;
            font-size: 14px;
        }
        .log-box {
            background: #111;
            border: 1px solid #333;
            border-radius: 0 0 12px 12px;
            padding: 15px;
            max-height: 200px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
            color: #0f0;
        }
        .log-line { margin: 3px 0; }
        .log-line.error { color: #f44; }
        .log-line.success { color: #0f0; }
        .log-line.info { color: #88f; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 Token Breaker Stream</h1>
        </div>
        
        <div class="video-box">
            <video id="video" controls autoplay playsinline></video>
            <div id="loader">⏳ Connecting...</div>
        </div>
        
        <div id="status">Initializing...</div>
        
        <div class="log-box" id="log"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const GAME_URL = '${gamePath ? 'https://www.camel1.tv/' + gamePath : ''}';
        const GAME_ID = '${gameId}';
        
        const video = document.getElementById('video');
        const statusEl = document.getElementById('status');
        const loaderEl = document.getElementById('loader');
        const logEl = document.getElementById('log');
        
        function log(msg, type = 'info') {
            const line = document.createElement('div');
            line.className = 'log-line ' + type;
            line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
            console.log(msg);
        }
        
        function setStatus(msg, isError = false) {
            statusEl.textContent = msg;
            statusEl.style.color = isError ? '#f44' : '#888';
        }
        
        // Strategy 1: Monitor network requests via Service Worker hack
        async function interceptNetworkRequests() {
            log('🔍 Strategy 1: Monitoring network requests...', 'info');
            
            // Override fetch to capture API calls
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const url = args[0];
                const response = await originalFetch.apply(this, args);
                
                // Clone response to read it
                const clone = response.clone();
                
                if (typeof url === 'string' && (url.includes('m3u8') || url.includes('stream') || url.includes('liveplay'))) {
                    log('🎯 Found stream URL: ' + url, 'success');
                    playStream(url);
                }
                
                // Also check JSON responses
                try {
                    const text = await clone.text();
                    if (text.includes('.m3u8')) {
                        const m3u8Match = text.match(/https?:\\/\\/[^"'\s]*\.m3u8[^"'\s]*/i);
                        if (m3u8Match) {
                            log('🎯 Found m3u8 in response: ' + m3u8Match[0], 'success');
                            playStream(m3u8Match[0]);
                        }
                    }
                } catch(e) {}
                
                return response;
            };
            
            // Load the game page in hidden iframe to trigger API calls
            if (GAME_URL) {
                log('📥 Loading game page: ' + GAME_URL, 'info');
                const iframe = document.createElement('iframe');
                iframe.src = GAME_URL;
                iframe.style.display = 'none';
                iframe.onload = () => {
                    log('✅ Game page loaded in iframe', 'success');
                    // Check iframe content
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        const html = iframeDoc.documentElement.innerHTML;
                        const m3u8Match = html.match(/https?:\\/\\/[^"'\s<>]*\.m3u8[^"'\s<>]*/i);
                        if (m3u8Match) {
                            log('🎯 Found m3u8 in iframe: ' + m3u8Match[0], 'success');
                            playStream(m3u8Match[0]);
                        }
                    } catch(e) {
                        log('⚠️ Cannot access iframe (cross-origin)', 'info');
                    }
                };
                document.body.appendChild(iframe);
            }
        }
        
        // Strategy 2: Try common distributor patterns
        async function tryDistributorPatterns() {
            log('🔍 Strategy 2: Trying distributor patterns...', 'info');
            
            const patterns = [
                \`https://distributor.cameltv.live/stream/\${GAME_ID}\`,
                \`https://distributor.cameltv.live/api/stream/\${GAME_ID}\`,
                \`https://distributor.cameltv.live/room/\${GAME_ID}/stream\`,
            ];
            
            for (const apiUrl of patterns) {
                try {
                    log('  Trying: ' + apiUrl, 'info');
                    const resp = await fetch(apiUrl, {
                        headers: {
                            'Origin': 'https://www.camel1.tv',
                            'Referer': GAME_URL
                        }
                    });
                    
                    if (resp.ok) {
                        const data = await resp.json();
                        log('  Response: ' + JSON.stringify(data).substring(0, 200), 'info');
                        
                        if (data.url || data.m3u8 || data.stream_url) {
                            const streamUrl = data.url || data.m3u8 || data.stream_url;
                            log('🎯 Found stream: ' + streamUrl, 'success');
                            playStream(streamUrl);
                            return;
                        }
                    }
                } catch(e) {
                    log('  Failed: ' + e.message, 'error');
                }
            }
        }
        
        // Strategy 3: Connect via WebSocket
        async function tryWebSocket() {
            log('🔍 Strategy 3: WebSocket connection...', 'info');
            
            try {
                const ws = new WebSocket('wss://mimo-ws.cameltv.live/ws/connect');
                
                ws.onopen = () => {
                    log('✅ WebSocket connected', 'success');
                    ws.send(JSON.stringify({
                        type: 'join_room',
                        roomId: GAME_ID,
                        channel: 'live_stream'
                    }));
                    log('📤 Sent join_room for: ' + GAME_ID, 'info');
                };
                
                ws.onmessage = (event) => {
                    log('📥 WS message: ' + event.data.substring(0, 300), 'info');
                    
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Look for stream URL in response
                        const jsonStr = JSON.stringify(data);
                        const m3u8Match = jsonStr.match(/https?:\\/\\/[^"'\s]*\.m3u8[^"'\s]*/i);
                        if (m3u8Match) {
                            log('🎯 Found m3u8 in WS: ' + m3u8Match[0], 'success');
                            playStream(m3u8Match[0]);
                        }
                        
                        // Check for stream_url field
                        if (data.stream_url || data.url || data.m3u8) {
                            const streamUrl = data.stream_url || data.url || data.m3u8;
                            playStream(streamUrl);
                        }
                    } catch(e) {}
                };
                
                ws.onerror = (e) => {
                    log('❌ WebSocket error', 'error');
                };
                
                ws.onclose = () => {
                    log('🔌 WebSocket closed', 'info');
                };
                
            } catch(e) {
                log('❌ WebSocket failed: ' + e.message, 'error');
            }
        }
        
        function playStream(url) {
            log('🎬 Starting playback: ' + url, 'success');
            setStatus('Stream found! Starting playback...');
            
            loaderEl.style.display = 'none';
            video.classList.add('active');
            
            if (Hls.isSupported()) {
                const hls = new Hls({
                    debug: false,
                    maxBufferLength: 30,
                    manifestLoadingMaxRetry: 10,
                    manifestLoadingRetryDelay: 500
                });
                
                hls.loadSource(url);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('✅ HLS manifest parsed, playing...', 'success');
                    setStatus('✅ Playing live!');
                    video.play();
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        log('❌ HLS fatal error: ' + data.type, 'error');
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            hls.startLoad();
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.play();
            }
        }
        
        // Run all strategies
        async function start() {
            log('🚀 Starting extraction for game: ' + GAME_ID, 'info');
            setStatus('Searching for stream...');
            
            await Promise.all([
                interceptNetworkRequests(),
                tryDistributorPatterns(),
                tryWebSocket()
            ]);
            
            setTimeout(() => {
                if (!video.src && !video.classList.contains('active')) {
                    log('⚠️ No stream found after 30 seconds', 'error');
                    setStatus('Could not find stream. Game might not be live yet.', true);
                }
            }, 30000);
        }
        
        start();
    </script>
</body>
</html>`;
      
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    return new Response('Go to /player?game=PATH', {
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
