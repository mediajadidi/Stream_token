// ================================================================
// 🚀 مرحله ۲: کش هوشمند برای GET ها + Keep-Alive
// ================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۱. GET ها → کش + Proxy
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (method === 'GET') {
      const cacheKey = new Request(url.toString(), request);
      
      // ۱.۱ چک کردن کش
      const cachedResponse = await caches.default.match(cacheKey);
      if (cachedResponse) {
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Cache', 'HIT');
        headers.set('X-Cache-Status', 'HIT');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          headers: headers,
        });
      }
      
      // ۱.۲ ارسال به Render
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      headers.set('X-Cloudflare-Worker', 'true');
      
      const renderUrl = env.RENDER_URL + url.pathname + url.search;
      const response = await fetch(renderUrl, {
        method: method,
        headers: headers,
      });
      
      // ۱.۳ ذخیره در کش (فقط پاسخ‌های موفق)
      if (response.status === 200) {
        const headers = new Headers(response.headers);
        
        // TTL بر اساس مسیر
        let ttl = 30; // پیش‌فرض
        if (url.pathname.startsWith('/api/tweets/feed')) ttl = 15;
        else if (url.pathname.startsWith('/api/users/profile')) ttl = 60;
        else if (url.pathname.startsWith('/api/tweets/search')) ttl = 20;
        else if (url.pathname.startsWith('/api/tweets/hashtag')) ttl = 45;
        else if (url.pathname.startsWith('/api/stories')) ttl = 10;
        else if (url.pathname === '/') ttl = 5;
        
        headers.set('Cache-Control', `public, max-age=${ttl}`);
        headers.set('X-Cache-Status', 'MISS');
        
        const cacheResponse = new Response(response.body, {
          status: response.status,
          headers: headers,
        });
        
        ctx.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()));
        return cacheResponse;
      }
      
      return response;
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۲. POST/PUT/DELETE → مستقیم به Render (بدون کش)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    headers.set('X-Cloudflare-Worker', 'true');
    
    const renderUrl = env.RENDER_URL + url.pathname + url.search;
    return fetch(renderUrl, {
      method: method,
      headers: headers,
      body: request.body,
    });
  },
  
  // ─── Keep-Alive ──────────────────────────────────────────────
  
  async scheduled(event, env, ctx) {
    try {
      await fetch(env.RENDER_URL + '/api/health');
      console.log('✅ Keep-Alive OK');
    } catch (error) {
      console.error('❌ Keep-Alive failed:', error);
    }
  }
};