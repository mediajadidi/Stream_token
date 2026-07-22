export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
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
        }
        h1 { font-size: 20px; color: #e94560; }
        .video-box {
            background: #000;
            border: 1px solid #2a2a4a;
            aspect-ratio: 16/9;
            position: relative;
        }
        video { width: 100%; height: 100%; display: none; }
        video.active { display: block; }
        #loader {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            color: #888;
        }
        #status { text-align: center; padding: 15px; color: #888; font-size: 14px; }
        .log-box {
            background: #111;
            border: 1px solid #333;
            border-radius: 0 0 12px 12px;
            padding: 15px;
            max-height: 250px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 11px;
            color: #0f0;
        }
        .log-line { margin: 2px 0; word-break: break-all; }
        .log-line.error { color: #f44; }
        .log-line.success { color: #0f0; }
        .log-line.warn { color: #fa0; }
        .log-line.info { color: #88f; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 Token Breaker Ultimate</h1>
        </div>
        
        <div class="video-box">
            <video id="video" controls autoplay playsinline></video>
            <div id="loader">⏳ Searching for stream...</div>
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
        
        let foundStreamUrl = null;
        let hls = null;
        let authToken = null;
        
        function log(msg, type = 'info') {
            const line = document.createElement('div');
            line.className = 'log-line ' + type;
            const time = new Date().toLocaleTimeString();
            line.textContent = '[' + time + '] ' + msg;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
            console.log(type, msg);
        }
        
        function setStatus(msg, isError = false) {
            statusEl.textContent = msg;
            statusEl.style.color = isError ? '#f44' : '#0f0';
        }
        
        // 🔑 Extract JWT/Auth token from page
        async function extractAuthToken() {
            log('🔑 Looking for auth token...', 'info');
            
            try {
                // Fetch the game page
                const resp = await fetch(GAME_URL, {
                    credentials: 'include',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                const html = await resp.text();
                
                // Look for JWT tokens
                const jwtMatch = html.match(/[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/);
                if (jwtMatch) {
                    authToken = jwtMatch[0];
                    log('✅ Found JWT: ' + authToken.substring(0, 50) + '...', 'success');
                    return authToken;
                }
                
                // Look for bearer tokens
                const bearerMatch = html.match(/["'](?:token|accessToken|auth)["']\s*[:=]\s*["']([^"']+)["']/i);
                if (bearerMatch) {
                    authToken = bearerMatch[1];
                    log('✅ Found token in page: ' + authToken.substring(0, 30) + '...', 'success');
                    return authToken;
                }
                
                // Look in Next.js data
                const nextData = html.match(/self\.__next_f\.push\(\[1,"([^"]+)"\]\)/g);
                if (nextData) {
                    for (const match of nextData) {
                        const tokenMatch = match.match(/[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/);
                        if (tokenMatch) {
                            authToken = tokenMatch[0];
                            log('✅ Found JWT in Next.js data', 'success');
                            return authToken;
                        }
                    }
                }
                
                // Look for localStorage/sessionStorage references
                const storageMatch = html.match(/localStorage\.(?:getItem|setItem)\s*\(\s*["']([^"']+)["']/g);
                if (storageMatch) {
                    log('Found storage keys: ' + storageMatch.join(', '), 'info');
                }
                
                log('⚠️ No auth token found in page', 'warn');
                
            } catch(e) {
                log('❌ Error extracting token: ' + e.message, 'error');
            }
            
            return null;
        }
        
        // 🎬 Play stream
        function playStream(url) {
            if (foundStreamUrl === url) return;
            foundStreamUrl = url;
            
            log('🎬 PLAYING: ' + url, 'success');
            setStatus('Starting playback...');
            
            loaderEl.style.display = 'none';
            video.classList.add('active');
            
            if (hls) { hls.destroy(); hls = null; }
            
            if (Hls.isSupported()) {
                hls = new Hls({
                    debug: false,
                    maxBufferLength: 30,
                    manifestLoadingMaxRetry: 10,
                    manifestLoadingRetryDelay: 1000,
                    levelLoadingMaxRetry: 10,
                    fragLoadingMaxRetry: 10,
                    xhrSetup: function(xhr, url) {
                        // Add auth if we have it
                        if (authToken) {
                            xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
                        }
                        xhr.setRequestHeader('Origin', 'https://www.camel1.tv');
                        xhr.setRequestHeader('Referer', GAME_URL);
                    }
                });
                
                hls.loadSource(url);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('✅ Playing LIVE!', 'success');
                    setStatus('✅ Streaming LIVE');
                    video.play().catch(e => log('Autoplay: ' + e.message, 'warn'));
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        log('❌ HLS Error: ' + data.type, 'error');
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            log('🔄 Retrying in 2s...', 'warn');
                            setTimeout(() => { if (hls) hls.startLoad(); }, 2000);
                        }
                    }
                });
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.addEventListener('loadedmetadata', () => {
                    log('✅ Native HLS playing!', 'success');
                    setStatus('✅ Streaming LIVE');
                });
                video.play().catch(e => log('Autoplay: ' + e.message, 'warn'));
            }
        }
        
        // Check URL response
        async function checkUrl(url) {
            const headers = {
                'User-Agent': 'Mozilla/5.0',
                'Origin': 'https://www.camel1.tv',
                'Referer': GAME_URL,
                'Accept': '*/*'
            };
            
            if (authToken) {
                headers['Authorization'] = 'Bearer ' + authToken;
            }
            
            try {
                const resp = await fetch(url, { headers });
                const text = await resp.text();
                
                // Is it M3U8?
                if (text.includes('#EXTM3U') || text.includes('#EXT-X-')) {
                    log('✅ Direct M3U8 found!', 'success');
                    return { type: 'm3u8', url };
                }
                
                // Is it JSON with stream info?
                if (text.startsWith('{')) {
                    try {
                        const data = JSON.parse(text);
                        log('  JSON: ' + JSON.stringify(data).substring(0, 200), 'info');
                        
                        // Search for stream URL in JSON
                        const jsonStr = JSON.stringify(data);
                        const m3u8Match = jsonStr.match(/https?:\\/\\/[^"'\s]*\.m3u8[^"'\s]*/i);
                        if (m3u8Match) return { type: 'm3u8', url: m3u8Match[0] };
                        
                        // Check known fields
                        for (const key of ['stream_url', 'url', 'm3u8', 'hls', 'source', 'play_url']) {
                            if (data[key]?.startsWith('http')) {
                                return await checkUrl(data[key]);
                            }
                        }
                    } catch(e) {}
                }
                
                // Check for m3u8 in text
                const m3u8InText = text.match(/https?:\\/\\/[^"'\s<>]*\.m3u8[^"'\s<>]*/i);
                if (m3u8InText) return { type: 'm3u8', url: m3u8InText[0] };
                
            } catch(e) {
                log('  Error: ' + e.message, 'error');
            }
            return null;
        }
        
        // Strategy 1: Intercept page network
        function interceptNetwork() {
            log('🔍 Strategy 1: Intercepting page requests...', 'info');
            
            // Override fetch
            const origFetch = window.fetch;
            window.fetch = async function(...args) {
                const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                const resp = await origFetch.apply(this, args);
                
                if (requestUrl.includes('.m3u8') || requestUrl.includes('liveplay') || requestUrl.includes('txSecret')) {
                    log('🎯 Intercepted: ' + requestUrl, 'success');
                    playStream(requestUrl);
                }
                
                return resp;
            };
            
            // Load game in hidden iframe
            if (GAME_URL) {
                const iframe = document.createElement('iframe');
                iframe.src = GAME_URL;
                iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
                iframe.onload = () => log('✅ Game page loaded in iframe', 'success');
                document.body.appendChild(iframe);
            }
        }
        
        // Strategy 2: Try WebSocket with auth
        async function tryWebSocket() {
            log('🔍 Strategy 2: WebSocket with auth...', 'info');
            
            try {
                const wsUrl = authToken 
                    ? 'wss://mimo-ws.cameltv.live/ws/connect?token=' + encodeURIComponent(authToken)
                    : 'wss://mimo-ws.cameltv.live/ws/connect';
                
                const ws = new WebSocket(wsUrl);
                
                ws.onopen = () => {
                    log('✅ WebSocket connected', 'success');
                    
                    const joinMsg = {
                        type: 'join_room',
                        roomId: GAME_ID,
                        channel: 'live_stream'
                    };
                    
                    if (authToken) joinMsg.token = authToken;
                    
                    ws.send(JSON.stringify(joinMsg));
                    log('📤 ' + JSON.stringify(joinMsg), 'info');
                };
                
                ws.onmessage = (event) => {
                    log('📥 WS: ' + event.data.substring(0, 300), 'info');
                    
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Look for stream URLs
                        const dataStr = JSON.stringify(data);
                        const m3u8Match = dataStr.match(/https?:\\/\\/[^"'\s]*\.m3u8[^"'\s]*/i);
                        if (m3u8Match) {
                            playStream(m3u8Match[0]);
                            return;
                        }
                        
                        // Check for stream_url
                        if (data.stream_url || data.url || data.m3u8) {
                            const streamUrl = data.stream_url || data.url || data.m3u8;
                            checkUrl(streamUrl).then(result => {
                                if (result) playStream(result.url);
                            });
                        }
                    } catch(e) {}
                };
                
                ws.onerror = () => log('WebSocket error', 'error');
                ws.onclose = (e) => log('WS closed: ' + e.code, 'warn');
                
            } catch(e) {
                log('WS exception: ' + e.message, 'error');
            }
        }
        
        // Strategy 3: Try common stream URL patterns directly
        async function tryDirectPatterns() {
            log('🔍 Strategy 3: Direct stream patterns...', 'info');
            
            // Common CDN patterns for camel
            const patterns = [
                'https://liveplay.camel4.live/live/' + GAME_ID + '.m3u8',
                'https://liveplay1.camel4.live/live/' + GAME_ID + '.m3u8',
                'https://liveplay.cameltv.live/live/' + GAME_ID + '.m3u8',
                'https://stream.cameltv.live/' + GAME_ID + '/index.m3u8',
                'https://cdn.cameltv.live/stream/' + GAME_ID + '/index.m3u8',
            ];
            
            for (const url of patterns) {
                const result = await checkUrl(url);
                if (result) {
                    playStream(result.url);
                    return;
                }
            }
        }
        
        // Main
        async function start() {
            log('🚀 Token Breaker Ultimate', 'info');
            log('Game: ' + GAME_ID, 'info');
            setStatus('Extracting auth token...');
            
            // First get auth token
            await extractAuthToken();
            
            setStatus('Searching for stream...');
            
            // Run all strategies
            interceptNetwork();
            tryWebSocket();
            tryDirectPatterns();
            
            setTimeout(() => {
                if (!foundStreamUrl) {
                    log('⚠️ Stream not found after 60s', 'warn');
                    setStatus('Not found. Try opening the game on camel1.tv first to get authenticated.', true);
                }
            }, 60000);
        }
        
        start();
    </script>
</body>
</html>`;
      
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    return new Response('Go to /player?game=PATH', {
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
