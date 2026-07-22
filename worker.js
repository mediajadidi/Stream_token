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
    
    // 🔬 Deep scan for live game
    if (path === '/deepscan') {
      const gameUrl = url.searchParams.get('url');
      if (!gameUrl) return error('Missing ?url=', 400, corsHeaders);
      
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : '';
      
      const results = {
        gameId,
        gameUrl,
        discoveries: []
      };
      
      // 1. Get page with RSC header
      const pageResp = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'RSC': '1'
        }
      });
      
      const html = await pageResp.text();
      
      // 2. Search for video/stream data in Next.js payloads
      const rscPattern = /self\.__next_f\.push\(\[1,\"([^\"]+)\"\]\)/g;
      let rscMatch;
      const rscPayloads = [];
      
      while ((rscMatch = rscPattern.exec(html)) !== null) {
        try {
          const decoded = rscMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '')
            .replace(/\\\\/g, '\\');
          rscPayloads.push(decoded);
        } catch (e) {}
      }
      
      results.rscPayloadCount = rscPayloads.length;
      
      // 3. Search in all payloads for stream info
      for (const payload of rscPayloads) {
        // Look for m3u8 URLs
        const m3u8Match = payload.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/gi);
        if (m3u8Match) {
          results.discoveries.push({ source: 'rsc_payload', m3u8: m3u8Match });
        }
        
        // Look for stream/room data
        const roomMatch = payload.match(/roomLiveVideo[^}]*/gi);
        if (roomMatch) {
          results.discoveries.push({ source: 'rsc_payload', roomData: roomMatch });
        }
        
        // Look for liveplay URLs
        const liveplayMatch = payload.match(/https?:\/\/[^"'\s]*liveplay[^"'\s]*/gi);
        if (liveplayMatch) {
          results.discoveries.push({ source: 'rsc_payload', liveplay: liveplayMatch });
        }
      }
      
      // 4. Search entire HTML for any stream URL
      const allStreamUrls = html.match(/https?:\/\/[^"'\s<>]*(?:m3u8|liveplay|stream|video)[^"'\s<>]*/gi) || [];
      results.streamUrlsFound = [...new Set(allStreamUrls)].slice(0, 20);
      
      // 5. Search for distributor API patterns
      const apiMatches = html.match(/https?:\/\/[^"'\s<>]*distributor[^"'\s<>]*/gi) || [];
      results.apiEndpoints = [...new Set(apiMatches)];
      
      // 6. Search for WebSocket connections
      const wsMatches = html.match(/wss?:\/\/[^"'\s<>]+/gi) || [];
      results.webSocketUrls = [...new Set(wsMatches)];
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 🎬 STREAM PROXY - Now with Next.js awareness
    if (path.startsWith('/proxy/')) {
      const gamePath = path.replace('/proxy/', '');
      const gameUrl = 'https://www.camel1.tv/' + gamePath;
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : '';
      
      // Get page
      const pageResp = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      
      const html = await pageResp.text();
      
      // Strategy 1: Extract from RSC payloads
      const rscPattern = /self\.__next_f\.push\(\[1,\"([^\"]+)\"\]\)/g;
      let rscMatch;
      let m3u8Url = null;
      
      while ((rscMatch = rscPattern.exec(html)) !== null) {
        try {
          const decoded = rscMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '');
          const m3u8Match = decoded.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/i);
          if (m3u8Match) {
            m3u8Url = m3u8Match[0];
            break;
          }
        } catch (e) {}
      }
      
      // Strategy 2: Extract from HTML directly
      if (!m3u8Url) {
        const htmlMatch = html.match(/https?:\/\/[^"'\s<>]*\.m3u8[^"'\s<>]*/i);
        if (htmlMatch) m3u8Url = htmlMatch[0];
      }
      
      // Strategy 3: Try to find liveplay pattern  
      if (!m3u8Url) {
        const lpMatch = html.match(/https?:\/\/[^"'\s<>]*liveplay[^"'\s<>]*\.m3u8[^"'\s<>]*/i);
        if (lpMatch) m3u8Url = lpMatch[0];
      }
      
      if (m3u8Url) {
        return await serveM3u8(m3u8Url, corsHeaders, url.origin);
      }
      
      return new Response(JSON.stringify({
        error: 'No m3u8 found in page',
        gameId,
        suggestion: `Try: ${url.origin}/deepscan?url=${encodeURIComponent(gameUrl)}`
      }), {
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
      endpoints: {
        deepscan: '/deepscan?url=GAME_URL',
        proxy: '/proxy/PATH_TO_GAME'
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
