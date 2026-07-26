// ================================================================
// 🚀 WORKER نهایی با مسیریابی کامل - جایگزین Worker فعلی
// ================================================================

const rateLimitCache = new Map();

function tokenBucketRateLimit(ip) {
  const now = Date.now();
  let bucket = rateLimitCache.get(ip);
  
  if (!bucket) {
    bucket = { tokens: 100, lastRefill: now, limit: 100 };
    rateLimitCache.set(ip, bucket);
  }
  
  const timePassed = (now - bucket.lastRefill) / 1000;
  const tokensToAdd = timePassed * 2;
  bucket.tokens = Math.min(bucket.limit, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
  
  if (bucket.tokens < 1) {
    return {
      allowed: false,
      retryAfter: Math.ceil((1 - bucket.tokens) / 2),
    };
  }
  
  bucket.tokens -= 1;
  return { allowed: true };
}

function buildCacheKey(url) {
  const cacheUrl = new URL(url.pathname + url.search, url.origin);
  return cacheUrl.toString();
}

function getTTL(path) {
  if (path.startsWith('/api/tweets/feed')) return 15;
  if (path.startsWith('/api/users/profile')) return 60;
  if (path.startsWith('/api/tweets/search')) return 20;
  if (path.startsWith('/api/tweets/hashtag')) return 45;
  if (path.startsWith('/api/stories')) return 10;
  return 30;
}

export default {
  async fetch(request, env, ctx) {
    const startTime = performance.now();
    const url = new URL(request.url);
    const method = request.method;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    // ۱. Rate Limiting (فقط RAM)
    const rateResult = tokenBucketRateLimit(ip);
    if (!rateResult.allowed) {
      return new Response(JSON.stringify({
        error: 'Too Many Requests',
        retry_after: rateResult.retryAfter,
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': rateResult.retryAfter.toString(),
        }
      });
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۲. مسیریابی هوشمند (همه درخواست‌ها به Render میروند)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // ✅ Write Operations → مستقیم به Render (بدون کش)
    const isWriteMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    const isSocketIO = url.pathname.startsWith('/socket.io/');
    const isUpload = url.pathname.startsWith('/api/upload/');
    const isAuth = url.pathname.startsWith('/api/auth/');
    const isFollow = url.pathname.startsWith('/api/follow') || url.pathname.startsWith('/api/unfollow');
    const isBlock = url.pathname.startsWith('/api/blocks/');
    const isReport = url.pathname.startsWith('/api/reports');
    const isSettings = url.pathname.startsWith('/api/settings/');
    const isAdmin = url.pathname.startsWith('/api/admin/');
    const isFootball = url.pathname.startsWith('/api/football/');
    
    // همه Write/Upload/Auth/Follow/Block/Report/Settings/Admin → مستقیم به Render
    if (isWriteMethod || isSocketIO || isUpload || isAuth || isFollow || isBlock || isReport || isSettings || isAdmin || isFootball) {
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      headers.set('X-Cloudflare-Worker', 'true');
      
      const response = await fetch(env.RENDER_URL + url.pathname + url.search, {
        method: method,
        headers: headers,
        body: method !== 'GET' ? request.body : undefined,
      });
      
      return response;
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۳. GET Requests → Cache + Proxy به Render
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (method === 'GET') {
      const cacheKey = buildCacheKey(url);
      
      // RAM Cache
      const ramCache = await caches.default.match(cacheKey);
      if (ramCache) {
        return new Response(ramCache.body, {
          status: ramCache.status,
          headers: {
            ...ramCache.headers,
            'X-Cache': 'RAM-HIT',
            'X-Cache-Time': `${performance.now() - startTime}ms`,
          }
        });
      }
      
      // KV Cache
      try {
        const kvData = await env.AJCACHE.get(cacheKey, 'json');
        if (kvData && kvData.expires > Date.now()) {
          ctx.waitUntil(
            caches.default.put(cacheKey, new Response(JSON.stringify(kvData.data), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }))
          );
          
          return new Response(JSON.stringify(kvData.data), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Cache': 'KV-HIT',
            }
          });
        }
      } catch (e) {
        // خطای KV رو نادیده بگیر
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۴. Proxy به Render (با هدرهای کامل)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    headers.set('X-Cloudflare-Worker', 'true');
    
    const response = await fetch(env.RENDER_URL + url.pathname + url.search, {
      method: method,
      headers: headers,
      body: method !== 'GET' ? request.body : undefined,
    });
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۵. ذخیره در Cache (فقط GET های موفق)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (response.status === 200 && method === 'GET') {
      const ttl = getTTL(url.pathname);
      const cacheKey = buildCacheKey(url);
      
      const cacheResponse = new Response(response.body, {
        status: response.status,
        headers: {
          ...response.headers,
          'Cache-Control': `public, max-age=${ttl}`,
          'X-Cache': 'RAM-STORE',
        }
      });
      ctx.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()));
      
      if (ttl > 30) {
        const data = await cacheResponse.clone().text();
        ctx.waitUntil(
          env.AJCACHE.put(cacheKey, JSON.stringify({
            data: JSON.parse(data),
            expires: Date.now() + (ttl * 1000),
          }), { expirationTtl: ttl })
        );
      }
      
      return cacheResponse;
    }
    
    return response;
  },
  
  // ─── Scheduled ──────────────────────────────────────────────
  
  async scheduled(event, env, ctx) {
    try {
      await fetch(env.RENDER_URL + '/api/health');
      console.log('✅ Keep-Alive OK');
    } catch (error) {
      console.error('❌ Keep-Alive failed:', error);
    }
    
    const now = Date.now();
    for (const [key, data] of rateLimitCache) {
      if (now - data.lastRefill > 60000) {
        rateLimitCache.delete(key);
      }
    }
  }
};