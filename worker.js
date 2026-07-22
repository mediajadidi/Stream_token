export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 🚀 ATTACK VECTOR 1: Try distributor API with different patterns
    if (path === '/attack') {
      const gameUrl = url.searchParams.get('url');
      if (!gameUrl) return error('Missing ?url=', 400, corsHeaders);
      
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : '';
      
      const results = { gameId, findings: {} };
      
      // Fetch page first to get any tokens
      const pageResp = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      const html = await pageResp.text();
      
      // Extract any JWT or token
      const tokenMatch = html.match(/[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/);
      results.jwtFound = tokenMatch ? tokenMatch[0] : null;
      
      // Extract any base64 encoded data
      const b64Matches = html.match(/[A-Za-z0-9+/]{50,}={0,2}/g) || [];
      results.base64Blobs = b64Matches.length;
      
      // Try different distributor API patterns
      const apiPatterns = [
        `https://distributor.cameltv.live/api/stream/${gameId}`,
        `https://distributor.cameltv.live/api/v1/stream/${gameId}`,
        `https://distributor.cameltv.live/stream/${gameId}/m3u8`,
        `https://distributor.cameltv.live/stream/info/${gameId}`,
        `https://distributor.cameltv.live/match/${gameId}/stream`,
        `https://distributor.cameltv.live/room/${gameId}`,
        `https://distributor.cameltv.live/room/${gameId}/stream`,
        `https://distributor.cameltv.live/live/${gameId}`,
      ];
      
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.camel1.tv',
        'Referer': gameUrl,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      if (results.jwtFound) {
        headers['Authorization'] = `Bearer ${results.jwtFound}`;
      }
      
      for (const apiUrl of apiPatterns) {
        try {
          const resp = await fetch(apiUrl, { headers });
          const text = await resp.text();
          let data;
          try { data = JSON.parse(text); } catch { data = text.substring(0, 300); }
          
          if (resp.status !== 404 && resp.status !== 500) {
            results.findings[apiUrl] = { status: resp.status, data };
          }
        } catch (e) {
          // skip
        }
      }
      
      // Try WebSocket connection params
      results.wsEndpoint = 'wss://mimo-ws.cameltv.live/ws/connect';
      results.possibleRoomId = gameId;
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 🔌 WebSocket Bridge (experimental)
    if (path === '/ws-bridge') {
      const gameId = url.searchParams.get('id');
      if (!gameId) return error('Missing ?id=', 400, corsHeaders);
      
      // Create WebSocket connection
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      // Connect to mimo WebSocket
      const ws = new WebSocket('wss://mimo-ws.cameltv.live/ws/connect');
      
      ws.accept();
      
      // Handle messages
      server.accept();
      
      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          server.send(JSON.stringify({ type: 'mimo_response', data }));
        } catch {
          server.send(event.data);
        }
      });
      
      server.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Join room
          if (data.type === 'join') {
            ws.send(JSON.stringify({
              type: 'join_room',
              roomId: gameId,
              channel: 'live_stream'
            }));
          }
        } catch {}
      });
      
      // Send initial join message
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: gameId,
          channel: 'live_stream'
        }));
      }, 500);
      
      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }
    
    // 🎬 PROXY with all strategies
    if (path.startsWith('/proxy/')) {
      const gamePath = path.replace('/proxy/', '');
      const gameUrl = 'https://www.camel1.tv/' + gamePath;
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : '';
      
      // Strategy 1: Get page with full headers
      const pageResp = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      const html = await pageResp.text();
      let m3u8Url = null;
      
      // Strategy A: Find in script tags
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let scriptMatch;
      while ((scriptMatch = scriptRegex.exec(html)) !== null) {
        const script = scriptMatch[1];
        if (script.includes('.m3u8') || script.includes('liveplay')) {
          const urlMatch = script.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/i);
          if (urlMatch) {
            m3u8Url = urlMatch[0];
            break;
          }
        }
      }
      
      // Strategy B: Search entire HTML
      if (!m3u8Url) {
        const allM3u8 = html.match(/https?:\/\/[^"'\s<>]*\.m3u8[^"'\s<>]*/gi);
        if (allM3u8) m3u8Url = allM3u8[0];
      }
      
      // Strategy C: Check for camel4.live pattern
      if (!m3u8Url) {
        const camelMatch = html.match(/https?:\/\/[^"'\s<>]*camel\d*\.live[^"'\s<>]*/gi);
        if (camelMatch) {
          for (const u of camelMatch) {
            if (u.includes('.m3u8')) {
              m3u8Url = u;
              break;
            }
          }
        }
      }
      
      if (m3u8Url) {
        return await serveM3u8(m3u8Url, corsHeaders, url.origin);
      }
      
      // No m3u8 found - try distributor API as last resort
      try {
        const distResp = await fetch(`https://distributor.cameltv.live/api/stream/${gameId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://www.camel1.tv',
            'Referer': gameUrl
          }
        });
        
        if (distResp.ok) {
          const data = await distResp.json();
          if (data.url || data.m3u8 || data.stream_url) {
            m3u8Url = data.url || data.m3u8 || data.stream_url;
            return await serveM3u8(m3u8Url, corsHeaders, url.origin);
          }
        }
      } catch (e) {}
      
      return new Response(JSON.stringify({
        error: 'Could not find stream URL',
        gameId,
        pageSize: html.length,
        hasWebSocket: html.includes('mimo-ws'),
        tryAttack: `${url.origin}/attack?url=${encodeURIComponent(gameUrl)}`
      }, null, 2), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 📦 SEGMENT PROXY
    if (path.startsWith('/seg/')) {
      const segUrl = decodeURIComponent(path.replace('/seg/', ''));
      const resp = await fetch(segUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://www.camel1.tv',
          'Referer': 'https://www.camel1.tv/'
        }
      });
      const newResp = new Response(resp.body, resp);
      Object.entries(corsHeaders).forEach(([k, v]) => newResp.headers.set(k, v));
      return newResp;
    }
    
    return new Response(JSON.stringify({
      active: true,
      gameUrl: 'https://www.camel1.tv/football/atletico-mineiro-mg-vs-bahia-ba/live/965mkyhk2lpjr1g',
      endpoints: {
        attack: '/attack?url=GAME_URL',
        proxy: '/proxy/PATH',
        wsBridge: '/ws-bridge?id=GAME_ID'
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};

async function serveM3u8(m3u8Url, corsHeaders, workerOrigin) {
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  
  const resp = await fetch(m3u8Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://www.camel1.tv',
      'Referer': 'https://www.camel1.tv/'
    }
  });
  
  if (!resp.ok) {
    return new Response(JSON.stringify({
      error: `M3U8 fetch failed: ${resp.status}`,
      m3u8Url
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  
  let content = await resp.text();
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    if (line.startsWith('#') || !line.trim()) return line;
    let segUrl = line.trim();
    if (!segUrl.startsWith('http')) segUrl = baseUrl + segUrl;
    return '/seg/' + encodeURIComponent(segUrl);
  });
  
  return new Response(newLines.join('\n'), {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
      ...corsHeaders
    }
  });
}

function error(msg, status, corsHeaders) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
        }
