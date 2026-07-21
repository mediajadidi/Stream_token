// ═══════════════════════════════════════════════════════════
// 🎯 CAMEL TV ULTIMATE TOKEN BREAKER v3.0
// ═══════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // ──── CORS Preflight ────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    
    // ──── Main Proxy Route ────
    if (path.startsWith('/proxy/')) {
      const gamePath = path.replace('/proxy/', '');
      const gameUrl = `https://www.camel1.tv/${gamePath}`;
      return handleStreamRequest(request, gameUrl, env, ctx);
    }
    
    // ──── Direct m3u8 route (with query param) ────
    if (path === '/stream.m3u8') {
      const gameUrl = url.searchParams.get('game');
      if (!gameUrl) return errorResponse('Missing game parameter', 400);
      return handleStreamRequest(request, gameUrl, env, ctx);
    }
    
    // ──── Segment proxy route ────
    if (path.startsWith('/seg/')) {
      return handleSegmentRequest(request, env);
    }
    
    // ──── Status & Debug endpoint ────
    if (path === '/status') {
      return handleStatusRequest(request, env);
    }
    
    // ──── API: Get direct m3u8 ────
    if (path === '/api/extract') {
      const gameUrl = url.searchParams.get('url');
      if (!gameUrl) return errorResponse('Missing URL parameter', 400);
      return handleExtractRequest(gameUrl);
    }
    
    // ──── Player page ────
    if (path === '/' || path === '/player') {
      return servePlayerPage(url);
    }
    
    return errorResponse('Route not found', 404);
  }
};

// ═══════════════════════════════════════════════════════════
// 🧠 CORE: Token Pool Manager
// ═══════════════════════════════════════════════════════════

class TokenPool {
  constructor() {
    this.tokens = new Map(); // gameId -> { m3u8, expiry, segments }
    this.extracting = new Map(); // gameId -> Promise (prevent race conditions)
  }
  
  getGameId(gameUrl) {
    // Create unique ID from URL
    const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
    return match ? match[1] : btoa(gameUrl).substring(0, 20);
  }
  
  async getToken(gameUrl, env) {
    const gameId = this.getGameId(gameUrl);
    const now = Date.now();
    
    // Check if we have a valid token
    const existing = this.tokens.get(gameId);
    if (existing && existing.expiry > now + 10000) {
      return existing;
    }
    
    // Prevent multiple simultaneous extractions for same game
    if (this.extracting.has(gameId)) {
      return await this.extracting.get(gameId);
    }
    
    // Extract new token
    const extractionPromise = this.extractToken(gameUrl, env);
    this.extracting.set(gameId, extractionPromise);
    
    try {
      const token = await extractionPromise;
      this.tokens.set(gameId, token);
      return token;
    } finally {
      this.extracting.delete(gameId);
    }
  }
  
  async extractToken(gameUrl, env) {
    console.log(`🔍 Extracting token for: ${gameUrl}`);
    
    // Multiple extraction strategies
    const strategies = [
      this.strategy_embeddedJSON,
      this.strategy_scriptVariables,
      this.strategy_iframeSource,
      this.strategy_networkRequests,
      this.strategy_regexDeep
    ];
    
    for (const strategy of strategies) {
      try {
        const result = await strategy.call(this, gameUrl, env);
        if (result) {
          console.log(`✅ Token extracted via ${strategy.name}`);
          return {
            m3u8: result.m3u8,
            expiry: Date.now() + (result.ttl || 55) * 1000, // Default 55s TTL
            baseUrl: result.baseUrl,
            headers: result.headers || {},
            extracted: Date.now()
          };
        }
      } catch (e) {
        console.log(`❌ Strategy ${strategy.name} failed: ${e.message}`);
      }
    }
    
    throw new Error('All extraction strategies failed');
  }
  
  // Strategy 1: Find embedded JSON with stream data
  async strategy_embeddedJSON(gameUrl, env) {
    const html = await this.fetchPage(gameUrl);
    
    // Look for JSON objects containing m3u8
    const jsonPatterns = [
      /\{[^}]*"(?:source|file|url|src|m3u8|stream|video)"[^}]*\}/gi,
      /\{[^}]*"(?:liveplay|camel)[^}]*\.m3u8[^}]*\}/gi,
      /var\s+\w+\s*=\s*(\{[^}]*m3u8[^}]*\})/gi
    ];
    
    for (const pattern of jsonPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          try {
            const cleanJson = match.replace(/^var\s+\w+\s*=\s*/, '').replace(/;$/, '');
            const data = JSON.parse(cleanJson);
            const m3u8Url = this.findM3u8InObject(data);
            if (m3u8Url) return { m3u8: m3u8Url, baseUrl: this.getBaseUrl(m3u8Url), ttl: 60 };
          } catch (e) {
            // Continue to next match
          }
        }
      }
    }
    return null;
  }
  
  // Strategy 2: Search in script variables
  async strategy_scriptVariables(gameUrl, env) {
    const html = await this.fetchPage(gameUrl);
    
    // Extract all script contents
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const script = scriptMatch[1];
      
      // Look for m3u8 URL assignments
      const varPatterns = [
        /["'](https?:\/\/[^"']*camel[^"']*\.m3u8[^"']*)["']/gi,
        /(?:source|file|url|src|stream|video|m3u8)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/gi,
        /["']([^"']*liveplay[^"']*\.m3u8[^"']*)["']/gi
      ];
      
      for (const pattern of varPatterns) {
        const matches = script.match(pattern);
        if (matches) {
          const m3u8Url = matches[0].replace(/^["']|["']$/g, '').replace(/^.*?["']/, '').replace(/["'].*$/, '');
          if (m3u8Url.includes('.m3u8')) {
            return { m3u8: m3u8Url.startsWith('http') ? m3u8Url : `https:${m3u8Url}`, baseUrl: this.getBaseUrl(m3u8Url), ttl: 60 };
          }
        }
      }
    }
    return null;
  }
  
  // Strategy 3: Check iframe sources
  async strategy_iframeSource(gameUrl, env) {
    const html = await this.fetchPage(gameUrl);
    
    // Find iframe with stream source
    const iframeMatch = html.match(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (iframeMatch) {
      let iframeUrl = iframeMatch[1];
      if (!iframeUrl.startsWith('http')) iframeUrl = `https:${iframeUrl}`;
      
      const iframeHtml = await this.fetchPage(iframeUrl, {
        'Referer': gameUrl
      });
      
      // Search in iframe content
      const m3u8Match = iframeHtml.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/i);
      if (m3u8Match) {
        return { m3u8: m3u8Match[0], baseUrl: this.getBaseUrl(m3u8Match[0]), ttl: 60 };
      }
    }
    return null;
  }
  
  // Strategy 4: Monitor network-like requests in page
  async strategy_networkRequests(gameUrl, env) {
    const html = await this.fetchPage(gameUrl);
    
    // Look for dynamic loading patterns
    const loadPatterns = [
      /loadSource\s*\(\s*["']([^"']+\.m3u8[^"']*)["']\s*\)/gi,
      /\.src\s*=\s*["']([^"']+\.m3u8[^"']*)["']/gi,
      /play\s*\(\s*["']([^"']+\.m3u8[^"']*)["']\s*\)/gi,
      /source:\s*["']([^"']+\.m3u8[^"']*)["']/gi
    ];
    
    for (const pattern of loadPatterns) {
      const match = html.match(pattern);
      if (match) {
        const m3u8Url = match[1] || match[0].replace(/^.*?["']/, '').replace(/["'].*$/, '');
        return { m3u8: m3u8Url, baseUrl: this.getBaseUrl(m3u8Url), ttl: 60 };
      }
    }
    return null;
  }
  
  // Strategy 5: Deep regex fallback
  async strategy_regexDeep(gameUrl, env) {
    const html = await this.fetchPage(gameUrl);
    
    // Ultimate regex patterns
    const patterns = [
      /https?:\/\/liveplay\d*\.camel\d*\.live\/[^"'\s<>]*\.m3u8[^"'\s<>]*/g,
      /https?:\/\/[^"'\s<>]*camel[^"'\s<>]*\.m3u8[^"'\s<>]*/g,
      /https?:\/\/[^"'\s<>]*\.m3u8\?[^"'\s<>]*txSecret=[^"'\s<>]*/g,
      /https?:\/\/[^"'\s<>]*\.m3u8[^"'\s<>]*/g
    ];
    
    const allMatches = [];
    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches) allMatches.push(...matches);
    }
    
    // Filter and rank matches
    const validUrls = allMatches
      .filter(url => url.includes('.m3u8'))
      .filter(url => url.includes('txSecret') || url.includes('camel'))
      .sort((a, b) => {
        // Prioritize URLs with tokens
        const aHasToken = a.includes('txSecret') ? 1 : 0;
        const bHasToken = b.includes('txSecret') ? 1 : 0;
        return bHasToken - aHasToken;
      });
    
    if (validUrls.length > 0) {
      return { m3u8: validUrls[0], baseUrl: this.getBaseUrl(validUrls[0]), ttl: 60 };
    }
    
    return null;
  }
  
  // Helper: Fetch page with proper headers
  async fetchPage(url, extraHeaders = {}) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        ...extraHeaders
      },
      redirect: 'follow'
    });
    
    return await response.text();
  }
  
  // Helper: Find m3u8 in nested object
  findM3u8InObject(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object') return null;
    
    const keys = ['source', 'file', 'url', 'src', 'm3u8', 'stream', 'video', 'hls', 'play_url'];
    
    for (const key of keys) {
      if (obj[key] && typeof obj[key] === 'string' && obj[key].includes('.m3u8')) {
        return obj[key];
      }
    }
    
    // Search nested
    for (const value of Object.values(obj)) {
      if (typeof value === 'object') {
        const found = this.findM3u8InObject(value, depth + 1);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  // Helper: Get base URL from m3u8 URL
  getBaseUrl(m3u8Url) {
    const lastSlash = m3u8Url.lastIndexOf('/');
    return m3u8Url.substring(0, lastSlash + 1);
  }
}

// ═══════════════════════════════════════════════════════════
// 🌊 Stream Handler with Auto-Refresh
// ═══════════════════════════════════════════════════════════

const tokenPool = new TokenPool();

async function handleStreamRequest(request, gameUrl, env, ctx) {
  const url = new URL(request.url);
  const refreshToken = url.searchParams.get('refresh');
  
  try {
    // Get fresh token
    const token = await tokenPool.getToken(gameUrl, env);
    
    if (!token || !token.m3u8) {
      return errorResponse('Failed to extract stream URL', 502);
    }
    
    // Fetch the actual m3u8
    const m3u8Response = await fetch(token.m3u8, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.camel1.tv',
        'Referer': 'https://www.camel1.tv/',
        'Accept': '*/*'
      }
    });
    
    if (!m3u8Response.ok) {
      // Token might be expired, force refresh
      tokenPool.tokens.delete(tokenPool.getGameId(gameUrl));
      throw new Error(`M3U8 fetch failed: ${m3u8Response.status}`);
    }
    
    let m3u8Content = await m3u8Response.text();
    const baseUrl = token.baseUrl || tokenPool.getBaseUrl(token.m3u8);
    
    // Process m3u8 content
    const processedContent = processM3u8Content(m3u8Content, baseUrl, url);
    
    // Set auto-refresh header (VLC and some players respect this)
    const headers = {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Token-Expires': new Date(token.expiry).toISOString(),
      'X-Refresh-After': '30' // Seconds
    };
    
    return new Response(processedContent, { headers });
    
  } catch (error) {
    console.error(`Stream error: ${error.message}`);
    return errorResponse(`Stream error: ${error.message}`, 502);
  }
}

function processM3u8Content(content, baseUrl, workerUrl) {
  const lines = content.split('\n');
  const processed = [];
  
  for (let line of lines) {
    const trimmed = line.trim();
    
    // Pass through comments
    if (trimmed.startsWith('#') || trimmed === '') {
      // Add refresh hint for players
      if (trimmed.startsWith('#EXT-X-ENDLIST')) {
        // Don't include ENDLIST - we want live playback
        continue;
      }
      processed.push(line);
      continue;
    }
    
    // Process segment URLs
    let segmentUrl;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      segmentUrl = trimmed;
    } else if (trimmed.startsWith('/')) {
      // Absolute path without domain
      const baseUrlObj = new URL(baseUrl);
      segmentUrl = `${baseUrlObj.origin}${trimmed}`;
    } else {
      // Relative path
      segmentUrl = baseUrl + trimmed;
    }
    
    // Encode and proxy through worker
    const encoded = encodeURIComponent(segmentUrl);
    processed.push(`/seg/${encoded}`);
  }
  
  return processed.join('\n');
}

async function handleSegmentRequest(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/seg/');
  
  if (pathParts.length < 2) {
    return errorResponse('Invalid segment path', 400);
  }
  
  const segmentUrl = decodeURIComponent(pathParts[1]);
  
  try {
    const response = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.camel1.tv',
        'Referer': 'https://www.camel1.tv/',
        'Accept': '*/*'
      }
    });
    
    if (!response.ok) {
      console.error(`Segment fetch failed: ${response.status} for ${segmentUrl}`);
      return errorResponse('Segment fetch failed', response.status);
    }
    
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Cache-Control', 'public, max-age=10');
    modifiedResponse.headers.set('X-Content-Type-Options', 'nosniff');
    
    return modifiedResponse;
    
  } catch (error) {
    console.error(`Segment error: ${error.message}`);
    return errorResponse(`Segment error: ${error.message}`, 502);
  }
}

// ═══════════════════════════════════════════════════════════
// 📊 Status & Debug
// ═══════════════════════════════════════════════════════════

async function handleStatusRequest(request, env) {
  const status = {
    status: 'active',
    uptime: Date.now(),
    activeTokens: tokenPool.tokens.size,
    tokens: []
  };
  
  for (const [gameId, token] of tokenPool.tokens) {
    status.tokens.push({
      gameId,
      expiresIn: Math.max(0, Math.floor((token.expiry - Date.now()) / 1000)),
      extracted: new Date(token.extracted).toISOString(),
      m3u8: token.m3u8.substring(0, 50) + '...'
    });
  }
  
  return new Response(JSON.stringify(status, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleExtractRequest(gameUrl) {
  try {
    const token = await tokenPool.extractToken(gameUrl);
    return new Response(JSON.stringify({
      success: true,
      m3u8: token.m3u8,
      baseUrl: token.baseUrl,
      ttl: token.ttl
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// 🎮 Player Page
// ═══════════════════════════════════════════════════════════

function servePlayerPage(url) {
  const gamePath = url.searchParams.get('game') || '';
  const streamUrl = gamePath ? `/proxy/${gamePath}` : '';
  
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
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            width: 100%;
            max-width: 900px;
        }
        .header {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 12px 12px 0 0;
            border: 1px solid #2a2a4a;
        }
        .header h1 {
            font-size: 24px;
            background: linear-gradient(90deg, #e94560, #c23152);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .video-wrapper {
            background: #000;
            border: 1px solid #2a2a4a;
            border-top: none;
            border-bottom: none;
        }
        video {
            width: 100%;
            display: block;
            max-height: 500px;
        }
        .controls {
            padding: 15px;
            background: #1a1a2e;
            border: 1px solid #2a2a4a;
            border-radius: 0 0 12px 12px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: center;
        }
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: #e94560;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s;
        }
        button:hover {
            background: #c23152;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(233,69,96,0.3);
        }
        button.secondary {
            background: #0f3460;
        }
        button.secondary:hover {
            background: #1a1a4e;
        }
        .status {
            text-align: center;
            padding: 10px;
            color: #888;
            font-size: 13px;
        }
        .status.active {
            color: #00ff88;
        }
        input {
            width: 100%;
            padding: 12px;
            background: #1a1a2e;
            border: 1px solid #2a2a4a;
            border-radius: 8px;
            color: #fff;
            font-size: 14px;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 Token Breaker Stream</h1>
        </div>
        
        <div class="video-wrapper">
            <video id="video" controls autoplay playsinline></video>
        </div>
        
        <div class="status" id="status">⏳ Waiting for stream...</div>
        
        <div class="controls">
            <button onclick="copyUrl()">📋 Copy Stream URL</button>
            <button onclick="openVLC()">🎬 Open in VLC</button>
            <button class="secondary" onclick="refreshStream()">🔄 Refresh</button>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const streamUrl = '${streamUrl}';
        const workerOrigin = window.location.origin;
        const fullStreamUrl = workerOrigin + streamUrl;
        
        const video = document.getElementById('video');
        const statusEl = document.getElementById('status');
        
        let hls = null;
        
        function initPlayer() {
            if (!streamUrl) {
                statusEl.textContent = '❌ No game URL provided';
                return;
            }
            
            statusEl.textContent = '🔍 Extracting stream token...';
            
            if (Hls.isSupported()) {
                if (hls) hls.destroy();
                
                hls = new Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: false,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 600,
                    liveSyncDurationCount: 3,
                    liveMaxLatencyDurationCount: 10,
                    manifestLoadingTimeOut: 20000,
                    manifestLoadingMaxRetry: 5,
                    manifestLoadingRetryDelay: 1000,
                    levelLoadingTimeOut: 15000,
                    levelLoadingMaxRetry: 5,
                    levelLoadingRetryDelay: 1000,
                    fragLoadingTimeOut: 20000,
                    fragLoadingMaxRetry: 6,
                    fragLoadingRetryDelay: 1000,
                    startFragPrefetch: true,
                    testBandwidth: true
                });
                
                hls.loadSource(fullStreamUrl);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    statusEl.textContent = '✅ Streaming Live';
                    statusEl.className = 'status active';
                    video.play();
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                statusEl.textContent = '🔄 Network error, retrying...';
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                statusEl.textContent = '🔄 Media error, recovering...';
                                hls.recoverMediaError();
                                break;
                            default:
                                statusEl.textContent = '❌ Fatal error, reconnecting...';
                                setTimeout(initPlayer, 2000);
                                break;
                        }
                    }
                });
                
                hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                    const quality = data.level === -1 ? 'Auto' : data.level + 'p';
                    statusEl.textContent = '✅ Streaming - Quality: ' + quality;
                });
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = fullStreamUrl;
                video.addEventListener('loadedmetadata', () => {
                    statusEl.textContent = '✅ Streaming (Native HLS)';
                    statusEl.className = 'status active';
                    video.play();
                });
            } else {
                statusEl.textContent = '❌ HLS not supported in this browser';
            }
        }
        
        function copyUrl() {
            navigator.clipboard.writeText(fullStreamUrl).then(() => {
                alert('✅ Stream URL copied!\\nUse this in VLC or any HLS player');
            });
        }
        
        function openVLC() {
            window.location.href = 'vlc://' + fullStreamUrl;
        }
        
        function refreshStream() {
            initPlayer();
        }
        
        // Auto-start
        initPlayer();
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

// ═══════════════════════════════════════════════════════════
// 🛠️ Utilities
// ═══════════════════════════════════════════════════════════

function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({
    error: true,
    message: message,
    timestamp: Date.now()
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}