/**
 * WCL 응답을 D1에 24시간 보관.
 * 같은 보스/전문화/리포트 요청은 WCL을 다시 치지 않는다.
 */

export function wclCacheKey(parts) {
  return parts
    .map((p) =>
      String(p ?? "")
        .trim()
        .toLowerCase()
        .replace(/\|+/g, "/")
    )
    .join("|");
}

function wantsFresh(request) {
  return new URL(request.url).searchParams.get("fresh") === "1";
}

export async function readWclCache(env, request, key) {
  if (!env?.DB || !key || wantsFresh(request)) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT payload, created_at
       FROM wcl_cache
       WHERE cache_key = ? AND expires_at > datetime('now')`
    )
      .bind(key)
      .first();
    if (!row?.payload) return null;
    const body = JSON.parse(row.payload);
    if (!body || body.ok === false) return null;
    return {
      ...body,
      cached: true,
      cachedAt: row.created_at,
    };
  } catch {
    return null;
  }
}

export async function writeWclCache(env, key, endpoint, payload) {
  if (!env?.DB || !key || !payload || payload.ok === false) return;
  const stored = { ...payload };
  delete stored.cached;
  delete stored.cachedAt;
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM wcl_cache WHERE expires_at <= datetime('now')`),
      env.DB.prepare(
        `INSERT INTO wcl_cache (cache_key, endpoint, payload, created_at, expires_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now', '+24 hours'))
         ON CONFLICT(cache_key) DO UPDATE SET
           endpoint = excluded.endpoint,
           payload = excluded.payload,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`
      ).bind(key, endpoint, JSON.stringify(stored)),
    ]);
  } catch {
    /* 캐시 실패해도 WCL 응답은 그대로 내려줌 */
  }
}

export function cacheHeaders(hit) {
  return { "x-wcl-cache": hit ? "hit" : "miss" };
}
