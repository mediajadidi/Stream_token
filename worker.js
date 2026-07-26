/**
 * =========================================================================
 *  AJ Sports - Cloudflare Worker (Edge Cache Layer) — نسخه ۲
 * =========================================================================
 *
 *  تغییر اصلی نسبت به نسخه قبل:
 *  فید و پروفایل واقعاً بین کاربران به‌اشتراک گذاشته می‌شوند، چون بخش
 *  سنگین (کوئری DB اصلی) از بخش شخصی‌سازی (has_liked/is_following) جدا شد:
 *
 *    ۱) فراخوانی به origin بدون username/me  → پاسخ برای همه یکسان → کش می‌شود
 *    ۲) فراخوانی سبک و همیشه-تازه به origin برای شخصی‌سازی (بدون کش)
 *    ۳) merge دو نتیجه در همین Worker، بدون نیاز به تغییر فرانت‌اند
 *
 *  نکته صادقانه (بدون اغراق):
 *  - Cache API مشمول سقف 100k/day مخصوص KV نیست، اما per-colo و best-effort
 *    (LRU) است، نه "نامحدود واقعی".
 *  - اگر Workers شما روی پلن Free است، خود Worker هم سقف 100k req/day دارد؛
 *    برای مقیاس واقعی چند ده‌هزار کاربر همزمان، Workers Paid لازم است.
 *  - Render free tier هم CPU/پهنای‌باند محدود دارد؛ حتی با cache hit بالا،
 *    نرخ MISS باقی‌مانده (بخصوص personalization که همیشه به Render می‌رود)
 *    باید داخل ظرفیت Render جا شود.
 * =========================================================================
 */

// ---------------------------------------------------------------------
// 1. تنظیمات کش به تفکیک مسیر (برای مسیرهای ساده و کاملاً public)
// ---------------------------------------------------------------------
const CACHE_RULES = [
  // ترتیب مهم است: قوانین دقیق‌تر باید قبل از قوانین عمومی‌تر بیایند
  { pattern: /^\/api\/tweets\/search/,           ttl: 20,  swr: 40,  tag: 'search' },
  { pattern: /^\/api\/tweets\/hashtag\//,        ttl: 45,  swr: 90,  tag: 'hashtag' },
  { pattern: /^\/api\/users\/search/,            ttl: 20,  swr: 40,  tag: 'user-search' },
  { pattern: /^\/api\/stories\//,                ttl: 15,  swr: 30,  tag: 'stories' },
  { pattern: /^\/api\/health/,                   ttl: 10,  swr: 20,  tag: 'health' },
  { pattern: /^\/api\/football\/teams\/search/,   ttl: 300, swr: 600, tag: 'football' },
  { pattern: /^\/api\/football\/players\/search/, ttl: 300, swr: 600, tag: 'football' },
  // توجه: feed و profile اینجا نیستند — این دو مسیر handler اختصاصی خودشان
  // را دارند چون نیاز به جداسازی public/personalized دارند (پایین‌تر).
];

// مسیرهایی که هرگز نباید کش شوند — همیشه مستقیم به Render
const BYPASS_PATTERNS = [
  /^\/socket\.io\//,
  /^\/api\/auth\//,
  /^\/api\/upload\//,
  /^\/api\/dm\//,
  /^\/api\/settings\/sessions\//,
  /^\/api\/admin\//,
  /^\/api\/tweets\/personalization/,
  /^\/api\/follow\/status/,
];

const isBypass = (pathname) => BYPASS_PATTERNS.some((re) => re.test(pathname));
const matchRule = (pathname) => CACHE_RULES.find((r) => r.pattern.test(pathname));

function originUrlFor(env, path, search) {
  const u = new URL(env.RENDER_URL);
  u.pathname = path;
  u.search = search || '';
  return u.toString();
}

// ---------------------------------------------------------------------
// 2. لایه‌ی خواندن/نوشتن Cache API (RAM/SSD همان colo) با TTL دستی
// ---------------------------------------------------------------------
async function readFromEdgeCache(cacheKey) {
  const cache = caches.default;
  const res = await cache.match(cacheKey);
  if (!res) return null;
  const storedAt = Number(res.headers.get('x-stored-at') || 0);
  const ttl = Number(res.headers.get('x-ttl') || 0);
  const swr = Number(res.headers.get('x-swr') || 0);
  const age = (Date.now() - storedAt) / 1000;
  return { res, age, ttl, swr, fresh: age <= ttl, staleButUsable: age <= ttl + swr };
}

async function writeToEdgeCache(cacheKey, bodyText, contentType, ttl, swr, ctx, corsOrigin) {
  const cache = caches.default;
  const headers = new Headers({
    'content-type': contentType || 'application/json; charset=utf-8',
    'access-control-allow-origin': corsOrigin || '*',
    'x-stored-at': String(Date.now()),
    'x-ttl': String(ttl),
    'x-swr': String(swr),
    'cache-control': `public, max-age=${ttl}`,
  });
  const stored = new Response(bodyText, { headers });
  ctx.waitUntil(cache.put(cacheKey, stored.clone()));
  return stored;
}

// ---------------------------------------------------------------------
// 3. لایه KV به‌عنوان fallback مشترک بین colo ها
// ---------------------------------------------------------------------
async function readFromKV(env, kvKey) {
  try {
    const raw = await env.AJCACHE.get(kvKey, { type: 'text' });
    if (!raw) return null;
    return JSON.parse(raw); // { body, contentType, corsOrigin, storedAt, ttl, swr }
  } catch (e) {
    return null;
  }
}

async function writeToKV(env, kvKey, payload, ctx) {
  try {
    const safeTtl = Math.max(60, payload.ttl + payload.swr);
    ctx.waitUntil(
      env.AJCACHE.put(kvKey, JSON.stringify(payload), { expirationTtl: safeTtl })
    );
  } catch (e) {
    // نوشتن KV هیچ‌وقت نباید کل درخواست را fail کند
  }
}

// ---------------------------------------------------------------------
// 4. هسته‌ی مشترک: گرفتن یک منبعِ "کاملاً public" از سه لایه
//    (استفاده می‌شود هم برای قوانین ساده هم برای بخش عمومیِ feed/profile)
// ---------------------------------------------------------------------
async function getPublicResource(env, ctx, originPath, originSearch, rule) {
  const cacheKey = new Request(`https://cache-key.internal${originPath}${originSearch}`, { method: 'GET' });
  const kvKey = `v1:${originPath}${originSearch}`;

  const edge = await readFromEdgeCache(cacheKey);
  if (edge && edge.fresh) {
    return { body: await edge.res.text(), contentType: edge.res.headers.get('content-type'), cacheStatus: 'HIT-EDGE' };
  }

  if (edge && edge.staleButUsable) {
    ctx.waitUntil(refreshOrigin(env, ctx, originPath, originSearch, rule, cacheKey, kvKey).catch(() => {}));
    return { body: await edge.res.text(), contentType: edge.res.headers.get('content-type'), cacheStatus: 'STALE-REVALIDATING' };
  }

  const kvHit = await readFromKV(env, kvKey);
  if (kvHit) {
    const age = (Date.now() - kvHit.storedAt) / 1000;
    await writeToEdgeCache(cacheKey, kvHit.body, kvHit.contentType, kvHit.ttl, kvHit.swr, ctx, kvHit.corsOrigin);
    if (age <= kvHit.ttl + kvHit.swr) {
      return { body: kvHit.body, contentType: kvHit.contentType, cacheStatus: 'HIT-KV' };
    }
  }

  const fresh = await refreshOrigin(env, ctx, originPath, originSearch, rule, cacheKey, kvKey);
  return { body: fresh.body, contentType: fresh.contentType, cacheStatus: 'MISS' };
}

async function refreshOrigin(env, ctx, originPath, originSearch, rule, cacheKey, kvKey) {
  const res = await fetch(originUrlFor(env, originPath, originSearch));
  if (!res.ok) {
    // خطای origin کش نمی‌شود؛ پرتاب می‌کنیم تا caller مستقیم برگرداند
    throw new Error(`origin ${res.status}`);
  }
  const body = await res.text();
  const contentType = res.headers.get('content-type') || 'application/json';
  const corsOrigin = res.headers.get('access-control-allow-origin') || '*';

  await writeToEdgeCache(cacheKey, body, contentType, rule.ttl, rule.swr, ctx, corsOrigin);
  await writeToKV(env, kvKey, { body, contentType, corsOrigin, storedAt: Date.now(), ttl: rule.ttl, swr: rule.swr }, ctx);

  return { body, contentType };
}

// ---------------------------------------------------------------------
// 5. FEED: جدا کردن بخش عمومی (کش‌شونده) از شخصی‌سازی (بدون کش)
// ---------------------------------------------------------------------
const FEED_RULE = { ttl: 30, swr: 60 };

async function handleFeed(request, env, ctx) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const page = url.searchParams.get('page') || '0';
  const limit = url.searchParams.get('limit') || '20';

  // بخش عمومی: بدون username، برای همه کاربران یکسان و قابل اشتراک
  const publicSearch = `?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;

  let publicResult;
  try {
    publicResult = await getPublicResource(env, ctx, '/api/tweets/feed', publicSearch, FEED_RULE);
  } catch (e) {
    // اگر origin خطا داد، مستقیم و بدون کش تلاش کن
    const direct = await fetch(originUrlFor(env, '/api/tweets/feed', url.search));
    return direct;
  }

  let tweets;
  try {
    tweets = JSON.parse(publicResult.body);
  } catch (e) {
    return new Response(publicResult.body, {
      headers: { 'content-type': publicResult.contentType, 'x-cache': publicResult.cacheStatus },
    });
  }

  if (!username || !Array.isArray(tweets) || tweets.length === 0) {
    return new Response(JSON.stringify(tweets), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        // ✅ private چون پاسخ به ازای هر بیننده فرق دارد؛ فقط همان مرورگر
        // اجازه کش کردن دارد (نه پراکسی مشترک) — کاهش واقعی درخواست تکراری
        'cache-control': `private, max-age=${FEED_RULE.ttl}`,
        'x-cache': publicResult.cacheStatus,
        'x-personalized': 'no',
      },
    });
  }

  // بخش شخصی‌سازی: سبک، همیشه مستقیم به Render، هرگز کش نمی‌شود
  const ids = tweets.map((t) => t.id).join(',');
  let personalization = {};
  try {
    const pRes = await fetch(
      originUrlFor(env, '/api/tweets/personalization', `?username=${encodeURIComponent(username)}&ids=${ids}`)
    );
    if (pRes.ok) personalization = await pRes.json();
  } catch (e) {
    // اگر شخصی‌سازی fail شد، فید بدون آن (has_liked=false) برمی‌گردد — بهتر از خطای کامل
  }

  const merged = tweets.map((t) => ({
    ...t,
    has_liked: personalization[t.id]?.has_liked ?? false,
    has_retweeted: personalization[t.id]?.has_retweeted ?? false,
    has_bookmarked: personalization[t.id]?.has_bookmarked ?? false,
  }));

  return new Response(JSON.stringify(merged), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': `private, max-age=${FEED_RULE.ttl}`,
      'x-cache': publicResult.cacheStatus, // وضعیت کش بخش سنگین (public)
      'x-personalized': 'yes',
    },
  });
}

// ---------------------------------------------------------------------
// 6. PROFILE: جدا کردن بخش عمومی از is_following
// ---------------------------------------------------------------------
const PROFILE_RULE = { ttl: 60, swr: 120 };

async function handleProfile(request, env, ctx, username) {
  const url = new URL(request.url);
  const me = url.searchParams.get('me');

  let publicResult;
  try {
    publicResult = await getPublicResource(env, ctx, `/api/users/profile/${username}`, '', PROFILE_RULE);
  } catch (e) {
    return fetch(originUrlFor(env, `/api/users/profile/${username}`, url.search));
  }

  let profile;
  try {
    profile = JSON.parse(publicResult.body);
  } catch (e) {
    return new Response(publicResult.body, {
      headers: { 'content-type': publicResult.contentType, 'x-cache': publicResult.cacheStatus },
    });
  }

  if (!me) {
    return new Response(JSON.stringify(profile), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': `public, max-age=${PROFILE_RULE.ttl}`,
        'x-cache': publicResult.cacheStatus,
        'x-personalized': 'no',
      },
    });
  }

  // is_following: سبک، همیشه مستقیم به Render (endpoint از قبل موجود)، بدون کش
  let isFollowing = false;
  try {
    const fRes = await fetch(
      originUrlFor(env, '/api/follow/status', `?follower=${encodeURIComponent(me)}&following=${encodeURIComponent(username)}`)
    );
    if (fRes.ok) {
      const data = await fRes.json();
      isFollowing = !!data.is_following;
    }
  } catch (e) {
    // اگر خطا داد، is_following=false برمی‌گردد (بهتر از خطای کامل صفحه پروفایل)
  }

  return new Response(JSON.stringify({ ...profile, is_following: isFollowing }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': `private, max-age=${Math.min(PROFILE_RULE.ttl, 20)}`,
      'x-cache': publicResult.cacheStatus,
      'x-personalized': 'yes',
    },
  });
}

// ---------------------------------------------------------------------
// 7. مسیرهای ساده‌ی cacheable (بدون شخصی‌سازی): hashtag, search, stories, ...
// ---------------------------------------------------------------------
async function handleSimpleCacheable(request, env, ctx, rule) {
  const url = new URL(request.url);
  try {
    const result = await getPublicResource(env, ctx, url.pathname, url.search, rule);
    return new Response(result.body, {
      headers: {
        'content-type': result.contentType,
        'access-control-allow-origin': '*',
        // ✅ اضافه شد: مرورگر خودش نتیجه را تا این مدت نگه می‌دارد،
        // یعنی رفرش/برگشت سریع کاربر اصلاً به Worker نمی‌رسد
        'cache-control': `public, max-age=${rule.ttl}`,
        'x-cache': result.cacheStatus,
      },
    });
  } catch (e) {
    return fetch(originUrlFor(env, url.pathname, url.search));
  }
}

// ---------------------------------------------------------------------
// 8. Keep-alive برای Render
// ---------------------------------------------------------------------
async function pingRender(env) {
  try {
    await fetch(originUrlFor(env, '/api/health', ''));
  } catch (e) {
    // silent fail
  }
}

// ---------------------------------------------------------------------
// 9. Worker entrypoints
// ---------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // متدهای نوشتن، و مسیرهای auth/upload/dm/socket.io همیشه مستقیم
    if (request.method !== 'GET' || isBypass(pathname)) {
      return fetch(originUrlFor(env, pathname, url.search), {
        method: request.method,
        headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });
    }

    // فید: handler اختصاصی (جداسازی public/personalized)
    if (pathname === '/api/tweets/feed') {
      return handleFeed(request, env, ctx);
    }

    // پروفایل: handler اختصاصی
    const profileMatch = pathname.match(/^\/api\/users\/profile\/([^/]+)$/);
    if (profileMatch) {
      return handleProfile(request, env, ctx, profileMatch[1]);
    }

    // سایر مسیرهای cacheable ساده
    const rule = matchRule(pathname);
    if (rule) {
      return handleSimpleCacheable(request, env, ctx, rule);
    }

    // بدون قانون کش → مستقیم به Render
    return fetch(originUrlFor(env, pathname, url.search));
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingRender(env));
  },
};
