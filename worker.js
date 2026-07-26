// ================================================================
// 🚀 WORKER ساده و تضمینی - فقط Proxy به Render
// ================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ۱. همه درخواست‌ها مستقیماً به Render
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    headers.set('X-Cloudflare-Worker', 'true');
    
    // ساخت URL کامل برای Render
    const renderUrl = env.RENDER_URL + url.pathname + url.search;
    
    // ارسال درخواست به Render
    const response = await fetch(renderUrl, {
      method: method,
      headers: headers,
      body: method !== 'GET' && method !== 'HEAD' ? request.body : undefined,
    });
    
    return response;
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