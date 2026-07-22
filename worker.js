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
    
    // 🧬 DECODE BASE64 BLOBS
    if (path === '/decode') {
      const gameUrl = url.searchParams.get('url');
      if (!gameUrl) return error('Missing ?url=', 400, corsHeaders);
      
      // Fetch with proper mobile headers (maybe they serve differently)
      const resp = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      const html = await resp.text();
      
      // Extract all base64 strings
      const b64Regex = /[A-Za-z0-9+/]{40,}={0,2}/g;
      const allB64 = html.match(b64Regex) || [];
      
      const decodedResults = [];
      const streamRelated = [];
      
      for (const b64 of [...new Set(allB64)].slice(0, 100)) {
        try {
          const decoded = atob(b64);
          
          // Check if decoded contains stream-related keywords
          if (decoded.includes('m3u8') || 
              decoded.includes('liveplay') || 
              decoded.includes('stream') ||
              decoded.includes('video') ||
              decoded.includes('.ts') ||
              decoded.includes('camel') ||
              decoded.includes('txSecret') ||
              decoded.includes('http')) {
            
            streamRelated.push({
              base64: b64.substring(0, 50) + '...',
              decoded: decoded.substring(0, 500)
            });
          }
        } catch (e) {
          // Invalid base64, skip
        }
      }
      
      // Also try to find any API calls in the page
      const apiCallPattern = /fetch\s*\(\s*["']([^"']+)["']\)/g;
      const apiCalls = [];
      let apiMatch;
      while ((apiMatch = apiCallPattern.exec(html)) !== null) {
        apiCalls.push(apiMatch[1]);
      }
      
      // Find any URLs in the page
      const allUrls = html.match(/https?:\/\/[^"'\s<>]+/gi) || [];
      const interestingUrls = allUrls.filter(u => 
        u.includes('api') || 
        u.includes('stream') || 
        u.includes('live') ||
        u.includes('m3u8') ||
        u.includes('camel') ||
        u.includes('distributor')
      );
      
      return new Response(JSON.stringify({
        pageStatus: resp.status,
        pageSize: html.length,
        totalBase64Blobs: allB64.length,
        streamRelatedBlobs: streamRelated,
        apiCalls: [...new Set(apiCalls)],
        interestingUrls: [...new Set(interestingUrls)].slice(0, 30),
        responseHeaders: Object.fromEntries(resp.headers.entries())
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 🎯 DIRECT FETCH - Try to get stream from the API the app uses
    if (path === '/direct') {
      const gameId = url.searchParams.get('id');
      if (!gameId) return error('Missing ?id=', 400, corsHeaders);
      
      const results = {};
      
      // Try the WebSocket HTTP fallback
      const wsHttpUrl = `https://mimo-ws.cameltv.live/ws/connect`;
      
      // Try POST to WebSocket endpoint
      try {
        const wsResp = await fetch(wsHttpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://www.camel1.tv',
            'Referer': 'https://www.camel1.tv/'
          },
          body: JSON.stringify({
            type: 'join_room',
            roomId: gameId,
            channel: 'live_stream'
          })
        });
        const wsData = await wsResp.text();
        results.wsPostResponse = { status: wsResp.status, data: wsData.substring(0, 500) };
      } catch (e) {
        results.wsPostError = e.message;
      }
      
      // Try GET to mimo with query params
      try {
        const mimoResp = await fetch(`https://mimo-ws.cameltv.live/ws/connect?roomId=${gameId}&channel=live_stream`, {
          headers: {
            'Origin': 'https://www.camel1.tv',
            'Referer': 'https://www.camel1.tv/'
          }
        });
        results.mimoGetResponse = { 
          status: mimoResp.status, 
          headers: Object.fromEntries(mimoResp.headers.entries()),
          data: (await mimoResp.text()).substring(0, 500)
        };
      } catch (e) {
        results.mimoGetError = e.message;
      }
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    return new Response(JSON.stringify({
      active: true,
      endpoints: {
        decode: '/decode?url=GAME_URL',
        direct: '/direct?id=GAME_ID'
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};

function error(msg, status, corsHeaders) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
    }
