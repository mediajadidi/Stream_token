// ================================================================
// 🚀 مرحله ۳: کش هوشمند + Cache Invalidation
// ================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۱. POST/PUT/DELETE → Invalidate کش + Proxy
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      
      // ۱.۱ اگر توییت جدید بود، کش فید رو پاک کن
      if (url.pathname.startsWith('/api/tweets')) {
        await invalidateFeedCache();
      }
      
      // ۱.۲ اگر پروفایل به‌روز شد، کش پروفایل رو پاک کن
      if (url.pathname.startsWith('/api/users/profile')) {
        const username = url.searchParams.get('username');
        if (username) {
          await invalidateProfileCache(username);
        }
      }
      
      // ۱.۳ ارسال به Render
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      headers.set('X-Cloudflare-Worker', 'true');
      
      const renderUrl = env.RENDER_URL + url.pathname + url.search;
      return fetch(renderUrl, {
        method: method,
        headers: headers,
        body: request.body,
      });
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۲. GET ها → کش + Proxy
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (method === 'GET') {
      const cacheKey = new Request(url.toString(), request);
      
      // ۲.۱ چک کردن کش
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
      
      // ۲.۲ ارسال به Render
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      headers.set('X-Cloudflare-Worker', 'true');
      
      const renderUrl = env.RENDER_URL + url.pathname + url.search;
      const response = await fetch(renderUrl, {
        method: method,
        headers: headers,
      });
      
      // ۲.۳ ذخیره در کش
      if (response.status === 200) {
        const headers = new Headers(response.headers);
        
        let ttl = 30;
        if (url.pathname.startsWith('/api/tweets/feed')) ttl = 15;
        else if (url.pathname.startsWith('/api/users/profile')) ttl = 60;
        else if (url.pathname.startsWith('/api/tweets/search')) ttl = 20;
        else if (url.pathname.startsWith('/api/tweets/hashtag')) ttl = 45;
        else if (url.pathname.startsWith('/api/stories')) ttl = 10;
        
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
    // ۳. سایر درخواست‌ها → Proxy
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

// ─── توابع Invalidation ──────────────────────────────────────

async function invalidateFeedCache() {
  try {
    // حذف همه کش‌های فید
    const cacheKeys = await caches.default.keys();
    for (const key of cacheKeys) {
      if (key.url.includes('/api/tweets/feed')) {
        await caches.default.delete(key);
      }
    }
    console.log('✅ Feed cache invalidated');
  } catch (error) {
    console.error('❌ Invalidation error:', error);
  }
}

async function invalidateProfileCache(username) {
  try {
    // حذف کش پروفایل خاص
    const cacheKeys = await caches.default.keys();
    for (const key of cacheKeys) {
      if (key.url.includes(`/api/users/profile/${username}`)) {
        await caches.default.delete(key);
      }
    }
    console.log(`✅ Profile cache invalidated: ${username}`);
  } catch (error) {
    console.error('❌ Invalidation error:', error);
  }
}