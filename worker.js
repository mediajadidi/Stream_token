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
            max-height: 200px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
            color: #0f0;
        }
        .log-line { margin: 2px 0; }
        .log-line.error { color: #f44; }
        .log-line.success { color: #0f0; }
        .log-line.warn { color: #fa0; }
        .log-line.info { color: #88f; }
        .btn {
            display: block;
            margin: 10px auto;
            padding: 12px 24px;
            background: #e94560;
            color: #fff;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
        }
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
        
        function log(msg, type = 'info') {
            const line = document.createElement('div');
            line.className = 'log-line ' + type;
            const time = new Date().toLocaleTimeString();
            line.textContent = '[' + time + '] ' + msg;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
            console.log(msg);
        }
        
        function setStatus(msg, isError = false) {
            statusEl.textContent = msg;
            statusEl.style.color = isError ? '#f44' : '#0f0';
        }
        
        // 🔍 Check if URL is a direct stream or needs more processing
        async function checkAndProcessUrl(url) {
            log('📋 Checking URL: ' + url.substring(0, 80) + '...', 'info');
            
            try {
                const resp = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Origin': 'https://www.camel1.tv',
                        'Referer': GAME_URL,
                        'Accept': '*/*'
                    }
                });
                
                const contentType = resp.headers.get('content-type') || '';
                const text = await resp.text();
                
                log('  Status: ' + resp.status + ', Type: ' + contentType + ', Size: ' + text.length, 'info');
                
                // Check if it's M3U8
                if (text.includes('#EXTM3U') || text.includes('#EXT-X-')) {
                    log('✅ This IS an M3U8 playlist!', 'success');
                    return { type: 'm3u8', url: url, content: text };
                }
                
                // Check if it's JSON with stream info
                if (contentType.includes('json') || text.startsWith('{')) {
                    try {
                        const data = JSON.parse(text);
                        log('  JSON Response: ' + JSON.stringify(data).substring(0, 300), 'info');
                        
                        // Look for stream URL in JSON
                        const jsonStr = JSON.stringify(data);
                        const m3u8Match = jsonStr.match(/https?:\\/\\/[^"'\s]*\.m3u8[^"'\s]*/i);
                        if (m3u8Match) {
                            log('✅ Found m3u8 URL in JSON response!', 'success');
                            return await checkAndProcessUrl(m3u8Match[0]);
                        }
                        
                        // Check for other URL fields
                        for (const key of ['url', 'stream_url', 'm3u8', 'hls', 'source', 'play_url', 'video_url']) {
                            if (data[key] && typeof data[key] === 'string' && data[key].startsWith('http')) {
                                log('✅ Found ' + key + ' in JSON, following...', 'success');
                                return await checkAndProcessUrl(data[key]);
                            }
                        }
                    } catch(e) {}
                }
                
                // Check for redirect URL in response
                if (text.includes('http') && text.length < 500) {
                    const urlMatch = text.match(/https?:\\/\\/[^"'\s<>]+/i);
                    if (urlMatch && urlMatch[0] !== url) {
                        log('🔄 Following redirect URL...', 'warn');
                        return await checkAndProcessUrl(urlMatch[0]);
                    }
                }
                
                // Look for m3u8 in text response
                const m3u8Match = text.match(/https?:\\/\\/[^"'\s<>]*\.m3u8[^"'\s<>]*/i);
                if (m3u8Match) {
                    log('✅ Found m3u8 URL embedded in response!', 'success');
                    return await checkAndProcessUrl(m3u8Match[0]);
                }
                
                log('  ⚠️ Could not find stream in this response', 'warn');
                return null;
                
            } catch(e) {
                log('  ❌ Error: ' + e.message, 'error');
                return null;
            }
        }
        
        // 🎬 Play the stream
        function playStream(url) {
            if (foundStreamUrl === url) return; // Already playing this
            foundStreamUrl = url;
            
            log('🎬 Playing: ' + url, 'success');
            setStatus('Starting playback...');
            
            loaderEl.style.display = 'none';
            video.classList.add('active');
            
            // Clean up previous HLS instance
            if (hls) {
                hls.destroy();
                hls = null;
            }
            
            if (Hls.isSupported()) {
                hls = new Hls({
                    debug: false,
                    maxBufferLength: 30,
                    manifestLoadingMaxRetry: 10,
                    manifestLoadingRetryDelay: 1000,
                    levelLoadingMaxRetry: 10,
                    fragLoadingMaxRetry: 10
                });
                
                hls.loadSource(url);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('✅ Playing LIVE!', 'success');
                    setStatus('✅ Streaming LIVE');
                    video.play().catch(e => log('Autoplay blocked: ' + e.message, 'warn'));
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        log('❌ Fatal HLS error: ' + data.type + ' - ' + (data.error?.message || ''), 'error');
                        
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            log('🔄 Retrying...', 'warn');
                            setTimeout(() => {
                                if (hls) hls.startLoad();
                            }, 2000);
                        } else {
                            // Try to recover
                            log('🔄 Attempting recovery...', 'warn');
                            hls.recoverMediaError();
                        }
                    }
                });
                
                hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                    log('📊 Level loaded: ' + (data.level === -1 ? 'auto' : data.level), 'info');
                });
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.addEventListener('loadedmetadata', () => {
                    log('✅ Native HLS playing!', 'success');
                    setStatus('✅ Streaming LIVE');
                });
                video.play().catch(e => log('Autoplay blocked: ' + e.message, 'warn'));
            } else {
                log('❌ HLS not supported in this browser', 'error');
                setStatus('Browser does not support HLS', true);
            }
        }
        
        // Strategy 1: Try distributor API with proper processing
        async function tryDistributorAPI() {
            log('🔍 Strategy 1: Distributor API...', 'info');
            
            const endpoints = [
                'https://distributor.cameltv.live/stream/' + GAME_ID,
                'https://distributor.cameltv.live/api/stream/' + GAME_ID,
                'https://distributor.cameltv.live/api/v1/stream/' + GAME_ID,
                'https://distributor.cameltv.live/room/' + GAME_ID + '/stream',
                'https://distributor.cameltv.live/live/' + GAME_ID + '/m3u8',
            ];
            
            for (const endpoint of endpoints) {
                log('  Trying: ' + endpoint, 'info');
                const result = await checkAndProcessUrl(endpoint);
                if (result && result.type === 'm3u8') {
                    playStream(result.url);
                    return;
                }
            }
        }
        
        // Strategy 2: Monitor page network
        async function monitorPageNetwork() {
            log('🔍 Strategy 2: Monitoring page network...', 'info');
            
            // Override fetch
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const requestUrl = typeof args[0] === 'string' ? args[0] : args[0].url;
                const response = await originalFetch.apply(this, args);
                
                if (typeof requestUrl === 'string' && 
                    (requestUrl.includes('.m3u8') || 
                     requestUrl.includes('liveplay') || 
                     requestUrl.includes('camel4.live') ||
                     requestUrl.includes('txSecret'))) {
                    
                    log('🎯 Intercepted stream URL: ' + requestUrl, 'success');
                    playStream(requestUrl);
                }
                
                return response;
            };
            
            // Override XMLHttpRequest
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, requestUrl) {
                this.addEventListener('load', function() {
                    if (requestUrl.includes('.m3u8') || 
                        requestUrl.includes('liveplay') ||
                        requestUrl.includes('txSecret')) {
                        log('🎯 XHR intercepted: ' + requestUrl, 'success');
                        playStream(requestUrl);
                    }
                });
                return origOpen.apply(this, arguments);
            };
            
            // Load game in iframe
            if (GAME_URL) {
                const iframe = document.createElement('iframe');
                iframe.src = GAME_URL;
                iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
                iframe.onload = () => log('✅ Game page loaded', 'success');
                iframe.onerror = () => log('❌ Failed to load game page', 'error');
                document.body.appendChild(iframe);
            }
        }
        
        // Strategy 3: WebSocket
        async function tryWebSocket() {
            log('🔍 Strategy 3: WebSocket...', 'info');
            
            try {
                const ws = new WebSocket('wss://mimo-ws.cameltv.live/ws/connect');
                
                ws.onopen = () => {
                    log('✅ WebSocket connected', 'success');
                    
                    // Send join room
                    const joinMsg = JSON.stringify({
                        type: 'join_room',
                        roomId: GAME_ID,
                        channel: 'live_stream'
                    });
                    ws.send(joinMsg);
                    log('📤 Sent: ' + joinMsg, 'info');
                    
                    // Also try get_stream message
                    const getStreamMsg = JSON.stringify({
                        type: 'get_stream',
                        roomId: GAME_ID
                    });
                    ws.send(getStreamMsg);
                    log('📤 Sent: ' + getStreamMsg, 'info');
                };
                
                ws.onmessage = (event) => {
                    log('📥 WS: ' + event.data.substring(0, 200), 'info');
                    
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Search for stream URLs
                        const dataStr = JSON.stringify(data);
                        const m3u8Match = dataStr.match(/https?:\\/\\/[^"'\s]*\.m3u8[^"'\s]*/i);
                        if (m3u8Match) {
                            log('🎯 Found m3u8 in WS response!', 'success');
                            playStream(m3u8Match[0]);
                            return;
                        }
                        
                        // Check common fields
                        for (const key of ['stream_url', 'url', 'm3u8', 'hls', 'source']) {
                            if (data[key] && typeof data[key] === 'string' && data[key].startsWith('http')) {
                                checkAndProcessUrl(data[key]).then(result => {
                                    if (result && result.type === 'm3u8') {
                                        playStream(result.url);
                                    }
                                });
                                return;
                            }
                        }
                    } catch(e) {}
                };
                
                ws.onerror = (e) => log('❌ WebSocket error', 'error');
                ws.onclose = (e) => log('🔌 WebSocket closed: code=' + e.code, 'warn');
                
            } catch(e) {
                log('❌ WebSocket exception: ' + e.message, 'error');
            }
        }
        
        // Start all strategies
        async function start() {
            log('🚀 Starting Ultimate Token Breaker...', 'info');
            log('Game ID: ' + GAME_ID, 'info');
            log('Game URL: ' + GAME_URL, 'info');
            setStatus('Searching for stream...');
            
            // Run strategies
            tryDistributorAPI();
            monitorPageNetwork();
            tryWebSocket();
            
            // Timeout
            setTimeout(() => {
                if (!foundStreamUrl) {
                    log('⚠️ No stream found after 45 seconds', 'warn');
                    setStatus('Stream not found. Game may not be live or requires authentication.', true);
                }
            }, 45000);
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
