// ================================================================
// 🚀 AJ SPORTS 2026 - ULTIMATE EDGE WORKER
// شاهکار مهندسی معکوس - فراتر از X (توییتر)
// ۱۰۰٪ رایگان - شکستن محدودیت‌های Render
// ================================================================

export default {
  async fetch(request, env, ctx) {
    const startTime = performance.now();
    const url = new URL(request.url);
    const method = request.method;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || '';
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒 ۱. امنیت فوق‌پیشرفته (پایین‌ترین لایه، بالاترین امنیت)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // ۱.۱ مسدودسازی حملات DDoS در لبه
    const threatScore = await analyzeThreat(request, env, ip);
    if (threatScore > 80) {
      return blockRequest('🚫 Suspicious activity detected');
    }
    
    // ۱.۲ Rate Limiting هوشمند با تکنیک Token Bucket
    const rateLimit = await tokenBucketRateLimit(request, env, ip);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🧠 ۲. تشخیص هوشمند نوع درخواست
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const requestType = classifyRequest(url, method);
    
    // ۲.۱ WebSocket → Render (با Keep-Alive)
    if (requestType === 'websocket') {
      return handleWebSocket(request, env);
    }
    
    // ۲.۲ Upload → Render (با Compression)
    if (requestType === 'upload') {
      return proxyToRender(request, env);
    }
    
    // ۲.۳ Write Operations → Render (با Cache Invalidation)
    if (requestType === 'write') {
      const response = await proxyToRender(request, env);
      // Invalidate کش‌های مرتبط
      await invalidateRelatedCache(url, env);
      return response;
    }
    
    // ۲.۴ Static Files → Cache + CDN
    if (requestType === 'static') {
      return handleStatic(request, env, ctx);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ⚡ ۳. سیستم کش فوق‌پیشرفته (Core of the Beast)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // ۳.۱ دریافت اطلاعات کاربر (برای شخصی‌سازی)
    const user = await getUserInfo(request, env);
    
    // ۳.۲ ساخت Cache Key هوشمند با هش
    const cacheKey = createSmartCacheKey(url, user);
    
    // ۳.۳ لایه ۱: RAM Cache (Cache API) - سرعت نور
    const ramCache = await caches.default.match(cacheKey);
    if (ramCache) {
      // آمار و مانیتورینگ
      await updateMetrics(env, 'ram_hit', url.pathname);
      
      const headers = new Headers(ramCache.headers);
      headers.set('X-Cache', 'RAM-HIT');
      headers.set('X-Cache-Time', `${performance.now() - startTime}ms`);
      headers.set('X-Powered-By', 'AJ-Sports-Edge');
      
      // ارسال با Keep-Alive برای بهینه‌سازی
      return new Response(ramCache.body, {
        status: ramCache.status,
        headers: headers,
      });
    }
    
    // ۳.۴ لایه ۲: KV Cache (Persistent) - برای داده‌های نیمه‌داغ
    const kvData = await env.AJCACHE.get(cacheKey, 'json');
    if (kvData && kvData.expires > Date.now()) {
      await updateMetrics(env, 'kv_hit', url.pathname);
      
      // ذخیره در RAM برای دفعه بعد (پیش‌کش)
      ctx.waitUntil(
        caches.default.put(cacheKey, new Response(JSON.stringify(kvData.data), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'X-Cache': 'KV-PROMOTED'
          }
        }))
      );
      
      const headers = {
        'Content-Type': 'application/json',
        'X-Cache': 'KV-HIT',
        'X-Cache-Time': `${performance.now() - startTime}ms`,
        'X-Powered-By': 'AJ-Sports-Edge',
      };
      
      return new Response(JSON.stringify(kvData.data), {
        status: 200,
        headers: headers,
      });
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔮 ۴. Predictive Prefetch (هوش مصنوعی ساده)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // پیش‌کش کردن محتوای بعدی در پس‌زمینه
    if (user.isLoggedIn && url.pathname === '/api/tweets/feed') {
      ctx.waitUntil(predictivePrefetch(user, env));
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📡 ۵. Proxy به Render (با Failover و Retry)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    await updateMetrics(env, 'cache_miss', url.pathname);
    
    // ۵.۱ ارسال به Render با timeout و retry
    let response = await proxyWithRetry(request, env);
    
    // ۵.۲ اگر Render مرد، از Fallback استفاده کن
    if (!response || response.status >= 500) {
      const fallback = await getFallbackData(url, env);
      if (fallback) {
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'X-Cache': 'FALLBACK',
            'X-Warning': 'Render is down, using cached data'
          }
        });
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 💾 ۶. ذخیره در Cache (با TTL هوشمند)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (response && response.status === 200) {
      const ttl = calculateDynamicTTL(url, user);
      
      // ذخیره در RAM
      const cacheHeaders = new Headers(response.headers);
      cacheHeaders.set('Cache-Control', `public, max-age=${ttl}`);
      cacheHeaders.set('X-Cache', 'RAM-STORE');
      cacheHeaders.set('X-Cache-TTL', `${ttl}s`);
      
      const cacheResponse = new Response(response.body, {
        status: response.status,
        headers: cacheHeaders,
      });
      
      ctx.waitUntil(
        caches.default.put(cacheKey, cacheResponse.clone())
      );
      
      // ذخیره در KV (با TTL بیشتر برای Fallback)
      const data = await cacheResponse.clone().text();
      ctx.waitUntil(
        env.AJCACHE.put(cacheKey, JSON.stringify({
          data: JSON.parse(data),
          expires: Date.now() + (ttl * 2 * 1000), // ۲ برابر TTL
        }), {
          expirationTtl: ttl * 3 // ۳ برابر TTL
        })
      );
      
      // ذخیره به عنوان Fallback (برای وقتی Render می‌میرد)
      if (url.pathname === '/api/tweets/feed') {
        ctx.waitUntil(
          env.AJCACHE.put('fallback:feed', JSON.stringify(JSON.parse(data)), {
            expirationTtl: 3600 // ۱ ساعت
          })
        );
      }
      
      return cacheResponse;
    }
    
    return response || new Response('Service Unavailable', { status: 503 });
  },
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ⏰ Scheduled: Keep-Alive + Cleanup + Stats
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  async scheduled(event, env, ctx) {
    const start = Date.now();
    
    try {
      // ۱. Keep-Alive (بیدار نگه‌داشتن Render)
      await fetch(env.RENDER_URL + '/api/health', {
        headers: {
          'User-Agent': 'AJ-Sports-KeepAlive/1.0',
          'X-KeepAlive': 'true',
          'X-Source': 'Cloudflare-Worker'
        }
      });
      
      // ۲. پاکسازی کش‌های منقضی (شکستن محدودیت KV)
      let deleted = 0;
      let cursor = null;
      
      do {
        const list = await env.AJCACHE.list({ 
          limit: 1000,
          cursor: cursor 
        });
        
        for (const key of list.keys) {
          const data = await env.AJCACHE.get(key.name, 'json');
          if (data && data.expires && data.expires < Date.now()) {
            await env.AJCACHE.delete(key.name);
            deleted++;
          }
        }
        
        cursor = list.cursor;
      } while (cursor);
      
      // ۳. به‌روزرسانی آمار
      const stats = await env.AJCACHE.get('worker:stats', 'json') || {};
      stats.lastKeepAlive = new Date().toISOString();
      stats.cacheCleaned = deleted;
      stats.uptime = Date.now() - (stats.startTime || Date.now());
      stats.requestCount = (stats.requestCount || 0) + 1;
      
      await env.AJCACHE.put('worker:stats', JSON.stringify(stats));
      
      console.log(`✅ Worker: Keep-Alive OK, Cleaned ${deleted} keys`);
      
    } catch (error) {
      console.error('❌ Scheduled task failed:', error);
    }
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛠️ HELPER FUNCTIONS - The Secret Sauce
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── ۱. تحلیل تهدید با هوش مصنوعی ساده ────────────────────────
async function analyzeThreat(request, env, ip) {
  let score = 0;
  
  // ۱.۱ چک کردن بلاک‌لیست
  const blocked = await env.AJCACHE.get(`block:${ip}`);
  if (blocked) return 100;
  
  // ۱.۲ تشخیص Bot/Scraper
  const ua = request.headers.get('User-Agent') || '';
  if (/bot|crawl|spider|scrape|headless|selenium|puppeteer/i.test(ua)) {
    score += 50;
  }
  
  // ۱.۳ تشخیص درخواست‌های غیرطبیعی
  if (request.headers.get('Accept') === '*/*') score += 10;
  if (!request.headers.get('Accept-Language')) score += 10;
  if (request.headers.get('Cache-Control') === 'no-cache') score += 5;
  
  // ۱.۴ تشخیص IP مشکوک
  const requestCount = await env.AJCACHE.get(`count:${ip}`);
  if (parseInt(requestCount || '0') > 1000) score += 30;
  
  // اگر امتیاز بالا بود، بلاک کن
  if (score > 70) {
    await env.AJCACHE.put(`block:${ip}`, 'true', { expirationTtl: 3600 });
  }
  
  return Math.min(score, 100);
}

// ─── ۲. Token Bucket Rate Limiting (پیشرفته‌ترین روش) ────────
async function tokenBucketRateLimit(request, env, ip) {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  
  let bucket = await env.AJCACHE.get(key, 'json');
  
  if (!bucket) {
    bucket = {
      tokens: 100, // ۱۰۰ توکن
      lastRefill: now,
      limit: 100,
    };
  }
  
  // Refill توکن‌ها بر اساس زمان گذشته
  const timePassed = (now - bucket.lastRefill) / 1000; // به ثانیه
  const tokensToAdd = timePassed * 2; // ۲ توکن در ثانیه
  bucket.tokens = Math.min(bucket.limit, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
  
  // بررسی موجودی
  if (bucket.tokens < 1) {
    return {
      allowed: false,
      retryAfter: Math.ceil((1 - bucket.tokens) / 2),
      limit: bucket.limit,
      remaining: Math.floor(bucket.tokens),
    };
  }
  
  // مصرف یک توکن
  bucket.tokens -= 1;
  
  // ذخیره در KV
  await env.AJCACHE.put(key, JSON.stringify(bucket), { 
    expirationTtl: 60 
  });
  
  return {
    allowed: true,
    limit: bucket.limit,
    remaining: Math.floor(bucket.tokens),
  };
}

// ─── ۳. طبقه‌بندی هوشمند درخواست ─────────────────────────────
function classifyRequest(url, method) {
  const path = url.pathname;
  
  if (path.startsWith('/socket.io/')) return 'websocket';
  if (path.startsWith('/api/upload/')) return 'upload';
  if (path.match(/\.(js|css|png|jpg|svg|ico|webp|woff2)$/)) return 'static';
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return 'write';
  
  return 'read';
}

// ─── ۴. ساخت Cache Key هوشمند ─────────────────────────────────
function createSmartCacheKey(url, user) {
  const path = url.pathname;
  const query = url.searchParams;
  
  let key = path;
  
  // شخصی‌سازی بر اساس نوع کاربر
  if (path === '/api/tweets/feed' && user.isLoggedIn) {
    key = `feed:${user.id}:${query.get('page') || 0}`;
  } 
  else if (path.startsWith('/api/users/profile')) {
    const username = query.get('username') || 'unknown';
    key = `profile:${username}`;
  }
  else if (path.startsWith('/api/tweets/search')) {
    const q = query.get('q') || '';
    key = `search:${q.toLowerCase().slice(0, 20)}`;
  }
  else if (path.startsWith('/api/tweets/hashtag')) {
    const tag = path.split('/').pop();
    key = `hashtag:${tag}`;
  }
  else if (path.startsWith('/api/stories')) {
    const username = query.get('username') || 'all';
    key = `stories:${username}`;
  }
  
  // هش کردن برای کاهش طول
  return `cache:${btoa(key).slice(0, 50)}`;
}

// ─── ۵. محاسبه TTL پویا (هوش مصنوعی ساده) ───────────────────
function calculateDynamicTTL(url, user) {
  const path = url.pathname;
  let baseTTL = 30;
  
  // TTL پایه بر اساس نوع محتوا
  if (path.startsWith('/api/tweets/feed')) {
    baseTTL = user.isLoggedIn ? 10 : 20;
  } else if (path.startsWith('/api/users/profile')) {
    baseTTL = 120; // ۲ دقیقه
  } else if (path.startsWith('/api/tweets/search')) {
    baseTTL = 30;
  } else if (path.startsWith('/api/tweets/hashtag')) {
    baseTTL = 60;
  } else if (path.startsWith('/api/stories')) {
    baseTTL = 5; // استوری‌ها سریع تغییر می‌کنند
  }
  
  // افزایش TTL برای کاربران پریمیوم
  if (user.isPremium) {
    baseTTL *= 1.5;
  }
  
  // کاهش TTL در ساعات پیک
  const hour = new Date().getHours();
  if (hour >= 18 && hour <= 23) {
    baseTTL *= 0.7; // ترافیک سنگین → کش کمتر
  }
  
  return Math.min(Math.max(baseTTL, 5), 300);
}

// ─── ۶. دریافت اطلاعات کاربر با Cache ─────────────────────────
async function getUserInfo(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  
  if (!token) {
    return { isLoggedIn: false, isPremium: false };
  }
  
  // چک کردن کش
  const cached = await env.AJCACHE.get(`user:${token}`, 'json');
  if (cached) {
    return cached;
  }
  
  // اگر در کش نبود، از Render بپرس
  try {
    const response = await fetch(env.RENDER_URL + '/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.status === 200) {
      const data = await response.json();
      
      // ذخیره در کش برای ۵ دقیقه
      await env.AJCACHE.put(`user:${token}`, JSON.stringify({
        isLoggedIn: true,
        id: data.id,
        username: data.username,
        isPremium: data.isPremium || false,
      }), { expirationTtl: 300 });
      
      return {
        isLoggedIn: true,
        id: data.id,
        username: data.username,
        isPremium: data.isPremium || false,
      };
    }
  } catch (error) {
    console.error('User verification error:', error);
  }
  
  return { isLoggedIn: false, isPremium: false };
}

// ─── ۷. Predictive Prefetch (پیش‌بینی آینده) ────────────────
async function predictivePrefetch(user, env) {
  try {
    // ۱. دریافت لیست افرادی که کاربر دنبال می‌کند
    const following = await fetch(
      env.RENDER_URL + `/api/users/${user.username}/following`,
      { headers: { 'Authorization': `Bearer ${user.token}` } }
    ).then(r => r.json()).catch(() => []);
    
    // ۲. پیش‌کش کردن استوری‌ها و توییت‌های آنها
    const promises = following.slice(0, 10).map(async (follow) => {
      // پیش‌کش استوری (TTL ۱۰ ثانیه)
      await fetch(
        env.RENDER_URL + `/api/stories/user/${follow.username}`,
        { headers: { 'Cache-Control': 'public, max-age=10' } }
      );
      
      // پیش‌کش آخرین توییت‌ها (TTL ۵ ثانیه)
      await fetch(
        env.RENDER_URL + `/api/users/${follow.username}/tweets?limit=3`,
        { headers: { 'Cache-Control': 'public, max-age=5' } }
      );
    });
    
    await Promise.allSettled(promises);
    
  } catch (error) {
    console.error('Predictive prefetch error:', error);
  }
}

// ─── ۸. Proxy به Render با Retry و Fallback ──────────────────
async function proxyWithRetry(request, env) {
  const url = new URL(request.url);
  const renderUrl = env.RENDER_URL + url.pathname + url.search;
  
  // Headers برای جلوگیری از کش شدن توسط Render
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  headers.set('X-Cloudflare-Worker', 'true');
  headers.set('X-Request-ID', crypto.randomUUID());
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  // Retry با exponential backoff
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000 + (attempts * 2000));
      
      const response = await fetch(renderUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' ? request.body : undefined,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      // اگر Render خطا داد، دوباره تلاش کن
      if (response.status >= 500 && attempts < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempts + 1)));
        attempts++;
        continue;
      }
      
      return response;
      
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error('All proxy attempts failed:', error);
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
  
  return null;
}

// ─── ۹. WebSocket Handler (با Proxy به Render) ───────────────
async function handleWebSocket(request, env) {
  // WebSocket را مستقیم به Render بفرست
  return proxyWithRetry(request, env);
}

// ─── ۱۰. Static Files Handler ──────────────────────────────────
async function handleStatic(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // امتحان کش
  const cached = await caches.default.match(request);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'STATIC-HIT');
    return new Response(cached.body, {
      status: cached.status,
      headers: headers,
    });
  }
  
  // اگر در کش نبود، از Render بگیر
  const response = await proxyWithRetry(request, env);
  
  // ذخیره در کش برای ۱ سال
  if (response && response.status === 200) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Cache', 'STATIC-STORE');
    
    const cachedResponse = new Response(response.body, {
      status: response.status,
      headers: headers,
    });
    
    ctx.waitUntil(
      caches.default.put(request, cachedResponse.clone())
    );
    
    return cachedResponse;
  }
  
  return response;
}

// ─── ۱۱. Invalidate Cache ─────────────────────────────────────
async function invalidateRelatedCache(url, env) {
  const path = url.pathname;
  
  if (path.startsWith('/api/tweets')) {
    // Invalidate فید همه کاربران
    const keys = await env.AJCACHE.list({ prefix: 'cache:feed:' });
    for (const key of keys.keys) {
      await env.AJCACHE.delete(key.name);
    }
  }
  
  if (path.startsWith('/api/users/profile')) {
    const username = url.searchParams.get('username');
    if (username) {
      await env.AJCACHE.delete(`cache:profile:${username}`);
    }
  }
}

// ─── ۱۲. آمار و مانیتورینگ ────────────────────────────────────
async function updateMetrics(env, type, path) {
  try {
    const key = `metrics:${type}`;
    const current = await env.AJCACHE.get(key);
    const count = (parseInt(current || '0') + 1);
    await env.AJCACHE.put(key, count.toString(), { expirationTtl: 3600 });
    
    // آمار دقیق‌تر
    const detailKey = `metrics:${type}:${path}`;
    const detail = await env.AJCACHE.get(detailKey);
    await env.AJCACHE.put(detailKey, (parseInt(detail || '0') + 1).toString());
    
  } catch (error) {
    // خطا در آمار نباید Worker را متوقف کند
  }
}

// ─── ۱۳. Fallback Data ────────────────────────────────────────
async function getFallbackData(url, env) {
  const path = url.pathname;
  
  if (path === '/api/tweets/feed') {
    return await env.AJCACHE.get('fallback:feed', 'json');
  }
  
  if (path.startsWith('/api/users/profile')) {
    const username = url.searchParams.get('username');
    if (username) {
      return await env.AJCACHE.get(`fallback:profile:${username}`, 'json');
    }
  }
  
  return null;
}

// ─── ۱۴. Rate Limit Response ─────────────────────────────────
function rateLimitResponse(rateLimit) {
  return new Response(JSON.stringify({
    error: 'Too Many Requests',
    message: 'لطفاً چند لحظه صبر کنید',
    retry_after: rateLimit.retryAfter,
    limit: rateLimit.limit,
    remaining: rateLimit.remaining,
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': rateLimit.retryAfter.toString(),
      'X-RateLimit-Limit': rateLimit.limit.toString(),
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': (Date.now() + (rateLimit.retryAfter * 1000)).toString(),
    }
  });
}

// ─── ۱۵. Block Request ────────────────────────────────────────
function blockRequest(message) {
  return new Response(JSON.stringify({
    error: 'Access Denied',
    message: message,
    timestamp: new Date().toISOString(),
  }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'X-Blocked-By': 'AJ-Sports-Edge-Security',
    }
  });
}