import { json } from "../../_lib/http.js";
import { cacheHeaders, readWclCache, wclCacheKey, writeWclCache } from "../../_lib/wcl-cache.js";
import { wclConfigured, wclGraphql } from "../../_lib/wcl.js";

/**
 * GET /api/wcl/zone?zoneId=53
 * 존 보스 목록 (WCL Encounter ID 확인용)
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!wclConfigured(env)) {
    return json({ ok: false, configured: false, error: "WCL credentials missing" }, 503);
  }
  const zoneId = Number(new URL(request.url).searchParams.get("zoneId") || 0);
  if (!zoneId) return json({ ok: false, error: "zoneId required" }, 400);

  const cacheKey = wclCacheKey(["zone", zoneId]);
  const cached = await readWclCache(env, request, cacheKey);
  if (cached) return json(cached, 200, cacheHeaders(true));

  const query = `
    query ZoneEncounters($zoneID: Int!) {
      worldData {
        zone(id: $zoneID) {
          id
          name
          encounters {
            id
            name
          }
        }
      }
    }
  `;
  try {
    const data = await wclGraphql(env, query, { zoneID: zoneId });
    const zone = data?.worldData?.zone;
    const payload = {
      ok: true,
      cached: false,
      zone: zone
        ? {
            id: zone.id,
            name: zone.name,
            encounters: (zone.encounters || []).map((e) => ({ id: e.id, name: e.name })),
          }
        : null,
    };
    await writeWclCache(env, cacheKey, "zone", payload);
    return json(payload, 200, cacheHeaders(false));
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 502);
  }
}
