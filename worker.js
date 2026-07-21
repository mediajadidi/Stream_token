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
    
    // 🔍 API DISCOVERY
    if (path === '/discover') {
      const gameUrl = url.searchParams.get('url') || 
        'https://www.camel1.tv/football/nacional-montevideo-vs-club-atletico-tigre/live/jw2r09hkgoe2rz8';
      
      // Extract game ID
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : gameUrl.split('/').pop();
      
      const results = {};
      
      // Test API endpoints
      const apis = [
        `https://api.cameltv.live/v1/stream/${gameId}`,
        `https://api.cameltv.live/v1/match/${gameId}`,
        `https://api.cameltv.live/stream/${gameId}`,
        `https://distributor.cameltv.live/stream/${gameId}`,
        `https://distributor.cameltv.live/v1/stream/${gameId}`,
        `https://api.cameltv.live/v1/stream/info/${gameId}`,
        `https://api.cameltv.live/v1/game/stream/${gameId}`,
        `https://sensors.cameltv.live/sa.gif?project=production`,
      ];
      
      for (const api of apis) {
        try {
          const resp = await fetch(api, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Origin': 'https://www.camel1.tv',
              'Referer': 'https://www.camel1.tv/'
            }
          });
          
          const text = await resp.text();
          let data;
          try { data = JSON.parse(text); } catch { data = text.substring(0, 500); }
          
          results[api] = {
            status: resp.status,
            data: data
          };
        } catch (e) {
          results[api] = { error: e.message };
        }
      }
      
      // Also fetch the page and search Next.js data
      const pageResp = await fetch(gameUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await pageResp.text();
      
      // Search for Next.js data
      const nextDataMatch = html.match(/self\.__next_f\.push\(\[1,\"([^\"]+)\"\]\)/g);
      const nextDataDecoded = nextDataMatch ? nextDataMatch.map(m => {
        try {
          const str = m.match(/\"([^\"]+)\"/)[1];
          return JSON.parse(str.replace(/\\"/g, '"').replace(/\\n/g, ''));
        } catch { return null; }
      }).filter(Boolean) : [];
      
      return new Response(JSON.stringify({
        gameId,
        apiResults: results,
        nextDataFound: nextDataDecoded.length,
        nextDataSample: nextDataDecoded.slice(0, 3)
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 🎬 PROXY
    if (path.startsWith('/proxy/')) {
      const gamePath = path.replace('/proxy/', '');
      const gameUrl = 'https://www.camel1.tv/' + gamePath;
      
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : null;
      
      if (gameId) {
        // Try distributor API
        try {
          const apiResp = await fetch(`https://distributor.cameltv.live/stream/${gameId}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Origin': 'https://www.camel1.tv',
              'Referer': 'https://www.camel1.tv/'
            }
          });
          
          if (apiResp.ok) {
            const data = await apiResp.json();
            if (data.url || data.m3u8 || data.stream) {
              const m3u8Url = data.url || data.m3u8 || data.stream;
              return await serveM3u8(m3u8Url, corsHeaders, url.origin);
            }
          }
        } catch (e) {}
      }
      
      return new Response(JSON.stringify({
        error: 'Could not extract stream',
        gameId: gameId,
        tryDiscovery: `${url.origin}/discover?url=${encodeURIComponent(gameUrl)}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 📦 SEGMENT
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
      message: 'Go to /discover first to find the API'
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
    return new Response(JSON.stringify({ error: `M3U8 fetch failed: ${resp.status}` }), {
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
    return `/seg/${encodeURIComponent(segUrl)}`;
  });
  
  return new Response(newLines.join('\n'), {
    headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache', ...corsHeaders }
  });
          }
