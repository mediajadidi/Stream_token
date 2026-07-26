// ================================================================
// 🚀 AJ SPORTS 2026 - ULTIMATE EDGE WORKER (نسخه بدون محدودیت KV)
// ================================================================

// ─── Rate Limiting In-Memory (جایگزین KV) ────────────────────
const rateLimitCache = new Map();
const userCache = new Map();
const fallbackCache = new Map();

// ─── Cleanup هر ۵ دقیقه ──────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitCache) {
    if (now - data.lastRefill > 60000) {
      rateLimitCache.delete(key);
    }
  }
}, 300000);

export default {
  async fetch(request, env, ctx) {
    const startTime = performance.now();
    const url = new URL(request.url);
    const method = request.method;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۱. Rate Limiting (In-Memory - بدون KV)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const rateResult = await tokenBucketRateLimit(request, ip);
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
    // ۲. Cache (RAM First, KV Only For Important Data)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // ۲.۱ فقط برای درخواست‌های GET
    if (method === 'GET') {
      const cacheKey = buildCacheKey(url);
      
      // RAM Cache (اولویت اول)
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
      
      // KV Cache (فقط برای داده‌های مهم)
      try {
        const kvData = await env.AJCACHE.get(cacheKey, 'json');
        if (kvData && kvData.expires > Date.now()) {
          // ذخیره در RAM برای دفعه بعد
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
        // اگر KV خطا داد، نادیده بگیر
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۳. Proxy به Render
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const response = await fetch(env.RENDER_URL + url.pathname + url.search, {
      method: method,
      headers: request.headers,
      body: method !== 'GET' ? request.body : undefined,
    });
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۴. ذخیره در Cache (فقط داده‌های با ارزش)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (response.status === 200 && method === 'GET') {
      const ttl = getTTL(url.pathname);
      
      // ذخیره در RAM
      const cacheResponse = new Response(response.body, {
        status: response.status,
        headers: {
          ...response.headers,
          'Cache-Control': `public, max-age=${ttl}`,
          'X-Cache': 'RAM-STORE',
        }
      });
      ctx.waitUntil(caches.default.put(buildCacheKey(url), cacheResponse.clone()));
      
      // ذخیره در KV فقط برای داده‌های با TTL بالا
      if (ttl > 30) {
        const data = await cacheResponse.clone().text();
        ctx.waitUntil(
          env.AJCACHE.put(buildCacheKey(url), JSON.stringify({
            data: JSON.parse(data),
            expires: Date.now() + (ttl * 1000),
          }), { expirationTtl: ttl })
        );
      }
      
      return cacheResponse;
    }
    
    return response;
  },
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ⏰ Scheduled (کمتر کردن KV استفاده)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  async scheduled(event, env, ctx) {
    try {
      await fetch(env.RENDER_URL + '/api/health');
      console.log('✅ Keep-Alive OK');
    } catch (error) {
      console.error('❌ Keep-Alive failed:', error);
    }
  }
};

// ─── Helper Functions ──────────────────────────────────────────

function tokenBucketRateLimit(request, ip) {
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
  return `cache:${url.pathname}${url.search || ''}`;
}

function getTTL(path) {
  if (path.startsWith('/api/tweets/feed')) return 15;
  if (path.startsWith('/api/users/profile')) return 60;
  if (path.startsWith('/api/tweets/search')) return 20;
  if (path.startsWith('/api/tweets/hashtag')) return 45;
  if (path.startsWith('/api/stories')) return 10;
  return 30;
}