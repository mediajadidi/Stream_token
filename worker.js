export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 🔍 DEBUG - Show what's inside the page
    if (path === '/debug') {
      const gameUrl = url.searchParams.get('url');
      if (!gameUrl) {
        return new Response(JSON.stringify({ error: 'Add ?url=GAME_URL' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      try {
        const resp = await fetch(gameUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        
        const html = await resp.text();
        
        // Extract all URLs
        const allUrls = html.match(/https?:\/\/[^"'\s<>]+/gi) || [];
        const uniqueUrls = [...new Set(allUrls)];
        
        // Find m3u8 URLs
        const m3u8Urls = uniqueUrls.filter(u => u.includes('.m3u8'));
        
        // Find camel URLs
        const camelUrls = uniqueUrls.filter(u => u.includes('camel'));
        
        // Find script tags
        const scripts = [];
        const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
          const content = match[1].trim();
          if (content && (content.includes('m3u8') || content.includes('stream') || content.includes('video') || content.includes('play'))) {
            scripts.push(content.substring(0, 1500));
          }
        }
        
        return new Response(JSON.stringify({
          status: resp.status,
          url: gameUrl,
          htmlLength: html.length,
          m3u8Found: m3u8Urls,
          camelUrlsFound: camelUrls.slice(0, 20),
          relevantScripts: scripts.slice(0, 5),
          htmlStart: html.substring(0, 3000)
        }, null, 2), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
        
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    // 🎬 PROXY - Simple stream proxy
    if (path.startsWith('/proxy/')) {
      const gamePath = path.replace('/proxy/', '');
      const gameUrl = 'https://www.camel1.tv/' + gamePath;
      
      try {
        // 1. Get page
        const pageResp = await fetch(gameUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const html = await pageResp.text();
        
        // 2. Find ANY m3u8 URL
        const allUrls = html.match(/https?:\/\/[^"'\s<>]+/gi) || [];
        const m3u8Url = allUrls.find(u => u.includes('.m3u8'));
        
        if (!m3u8Url) {
          // Try to find in base64
          const b64Match = html.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/);
          if (b64Match) {
            try {
              const decoded = atob(b64Match[1]);
              const decodedM3u8 = decoded.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
              if (decodedM3u8) {
                return await serveM3u8(decodedM3u8[0], corsHeaders);
              }
            } catch (e) {}
          }
          
          return new Response(JSON.stringify({
            error: 'No m3u8 found',
            debugUrl: `${url.origin}/debug?url=${encodeURIComponent(gameUrl)}`
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        return await serveM3u8(m3u8Url, corsHeaders, url.origin);
        
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    // 📦 SEGMENT PROXY
    if (path.startsWith('/seg/')) {
      const segUrl = decodeURIComponent(path.replace('/seg/', ''));
      
      try {
        const resp = await fetch(segUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://www.camel1.tv',
            'Referer': 'https://www.camel1.tv/'
          }
        });
        
        const newResp = new Response(resp.body, resp);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newResp.headers.set(key, value);
        });
        return newResp;
      } catch (e) {
        return new Response('Segment error', { status: 502, headers: corsHeaders });
      }
    }
    
    // Home
    return new Response(JSON.stringify({
      message: 'Camel Proxy Active',
      endpoints: {
        debug: '/debug?url=GAME_URL',
        proxy: '/proxy/PATH',
        segment: '/seg/ENCODED_URL'
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};

async function serveM3u8(m3u8Url, corsHeaders, workerOrigin) {
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  
  const m3u8Resp = await fetch(m3u8Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://www.camel1.tv',
      'Referer': 'https://www.camel1.tv/'
    }
  });
  
  if (!m3u8Resp.ok) {
    return new Response(JSON.stringify({
      error: `M3U8 fetch failed: ${m3u8Resp.status}`,
      m3u8Url: m3u8Url
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  
  let content = await m3u8Resp.text();
  
  // Rewrite segments
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    if (line.startsWith('#') || !line.trim()) return line;
    
    let segUrl = line.trim();
    if (!segUrl.startsWith('http')) {
      segUrl = baseUrl + segUrl;
    }
    
    return `/seg/${encodeURIComponent(segUrl)}`;
  });
  
  return new Response(newLines.join('\n'), {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
      ...corsHeaders
    }
  });
                                    }
