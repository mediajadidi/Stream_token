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
    
    // 🔬 DEEP SCAN - Check Next.js RSC payload
    if (path === '/deepscan') {
      const gameUrl = url.searchParams.get('url') || 
        'https://www.camel1.tv/football/nacional-montevideo-vs-club-atletico-tigre/live/jw2r09hkgoe2rz8';
      
      const match = gameUrl.match(/\/live\/([a-zA-Z0-9]+)/);
      const gameId = match ? match[1] : '';
      
      const results = {
        gameId,
        gameUrl,
        findings: []
      };
      
      // 1. Fetch page with RSC header
      const pageResp = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'RSC': '1',
          'Next-Router-State-Tree': '%5B%22%22%2C%22football%22%2C%22nacional-montevideo-vs-club-atletico-tigre%22%2C%22live%22%2C%22jw2r09hkgoe2rz8%22%5D'
        }
      });
      
      const text = await pageResp.text();
      results.pageStatus = pageResp.status;
      results.pageSize = text.length;
      
      // Search for stream/m3u8 in any form
      const streamKeywords = ['m3u8', 'stream', 'video', 'hls', 'play', 'source', 'liveplay', 'txSecret'];
      for (const keyword of streamKeywords) {
        const regex = new RegExp(`[^"'\\s<>]*${keyword}[^"'\\s<>]*`, 'gi');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          results.findings.push({ keyword, matches: [...new Set(matches)].slice(0, 10) });
        }
      }
      
      // 2. Try alternative URLs
      const altUrls = [
        gameUrl.replace('/live/', '/video/'),
        gameUrl.replace('/live/', '/stream/'),
        `https://www.camel1.tv/api/stream/${gameId}`,
        `https://www.camel1.tv/_next/data/stream/${gameId}`,
        `https://distributor.cameltv.live/api/v1/match/${gameId}/stream`,
        `https://distributor.cameltv.live/api/stream/${gameId}`,
        `https://distributor.cameltv.live/v1/match/${gameId}`,
      ];
      
      results.altUrlTests = {};
      for (const altUrl of altUrls) {
        try {
          const resp = await fetch(altUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Origin': 'https://www.camel1.tv',
              'Referer': 'https://www.camel1.tv/'
            }
          });
          const body = await resp.text();
          let json;
          try { json = JSON.parse(body); } catch { json = body.substring(0, 200); }
          results.altUrlTests[altUrl] = { status: resp.status, data: json };
        } catch (e) {
          results.altUrlTests[altUrl] = { error: e.message };
        }
      }
      
      // 3. Check if the game is actually live/upcoming
      const upcomingMatch = text.match(/startDate["\s:]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (upcomingMatch) {
        const startDate = new Date(upcomingMatch[1]);
        results.gameStartTime = startDate.toISOString();
        results.gameIsPast = startDate < new Date();
        results.gameIsFuture = startDate > new Date();
      }
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Simple proxy
    if (path.startsWith('/proxy/')) {
      const gamePath = path.replace('/proxy/', '');
      const gameUrl = 'https://www.camel1.tv/' + gamePath;
      
      return new Response(JSON.stringify({
        error: 'Run /deepscan first to find stream source',
        deepscanUrl: `${url.origin}/deepscan?url=${encodeURIComponent(gameUrl)}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    return new Response(JSON.stringify({
      message: 'Go to /deepscan?url=GAME_URL'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
