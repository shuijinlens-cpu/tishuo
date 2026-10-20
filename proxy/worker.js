/**
 * 题说 · 极简代理（Cloudflare Workers）
 * ------------------------------------------------------------
 * 作用有两个：
 *   1. 把 API Key 藏在服务端（前端不需要填 Key，也不会泄露）；
 *   2. 解决浏览器直连大模型接口时的 CORS 限制。
 *
 * 部署步骤：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → 创建 Worker
 *   2. 把本文件内容整段粘进去，保存部署
 *   3. 在 Worker 的 Settings → Variables 里加：
 *        UPSTREAM_BASE = https://dashscope.aliyuncs.com/compatible-mode   （只到域名/v1 的上一级）
 *        API_KEY       = 你的 Key
 *      （可选）ALLOW_ORIGIN = https://你的用户名.github.io
 *   4. 在 app 的"设置"里，接口地址填：https://你的worker.workers.dev/compatible-mode/v1
 *      Key 留空即可。
 */

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const upstream = (env.UPSTREAM_BASE || '').replace(/\/+$/, '');
    if (!upstream) {
      return new Response('UPSTREAM_BASE 未配置', { status: 500, headers: cors });
    }

    const target = upstream + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('origin');
    headers.delete('referer');
    headers.delete('cf-connecting-ip');
    if (env.API_KEY) headers.set('Authorization', `Bearer ${env.API_KEY}`);

    const init = {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
    };

    const res = await fetch(target, init);
    const out = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    out.headers.delete('content-security-policy');
    return out;
  },
};
