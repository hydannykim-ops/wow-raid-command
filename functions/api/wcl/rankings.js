import { json } from "../../_lib/http.js";
import { cacheHeaders, readWclCache, wclCacheKey, writeWclCache } from "../../_lib/wcl-cache.js";
import { wclConfigured, wclGraphql } from "../../_lib/wcl.js";

/**
 * GET /api/wcl/rankings?encounterId=&className=&specName=&metric=hps&difficulty=5&pageSize=10
 * 힐러 기본 metric=hps
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!wclConfigured(env)) {
    return json(
      {
        ok: false,
        error: "WCL_CLIENT_ID / WCL_CLIENT_SECRET 이 없습니다. Cloudflare env에 넣어 주세요.",
        configured: false,
      },
      503
    );
  }

  const url = new URL(request.url);
  const encounterId = Number(url.searchParams.get("encounterId") || 0);
  const className = String(url.searchParams.get("className") || "").trim();
  const specName = String(url.searchParams.get("specName") || "").trim();
  const metric = String(url.searchParams.get("metric") || "hps").trim().toLowerCase();
  const difficulty = Number(url.searchParams.get("difficulty") || 5);
  const pageSize = Math.min(10, Math.max(1, Number(url.searchParams.get("pageSize") || 10)));
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const partition = url.searchParams.get("partition");
  const serverRegion = url.searchParams.get("serverRegion") || undefined;

  if (!encounterId || !className || !specName) {
    return json({ ok: false, error: "encounterId, className, specName 이 필요합니다." }, 400);
  }

  const cacheKey = wclCacheKey([
    "rankings",
    encounterId,
    className,
    specName,
    metric,
    difficulty,
    page,
    pageSize,
    partition || "",
    serverRegion || "",
  ]);
  const cached = await readWclCache(env, request, cacheKey);
  if (cached) return json(cached, 200, cacheHeaders(true));

  const query = `
    query EncounterRankings(
      $encounterID: Int!
      $className: String
      $specName: String
      $metric: CharacterRankingMetricType
      $difficulty: Int
      $partition: Int
      $serverRegion: String
      $page: Int
    ) {
      worldData {
        encounter(id: $encounterID) {
          id
          name
          characterRankings(
            className: $className
            specName: $specName
            metric: $metric
            difficulty: $difficulty
            partition: $partition
            serverRegion: $serverRegion
            page: $page
            includeCombatantInfo: false
          )
        }
      }
    }
  `;

  try {
    const variables = {
      encounterID: encounterId,
      className,
      specName,
      metric,
      difficulty,
      page,
    };
    if (partition != null && partition !== "") variables.partition = Number(partition);
    if (serverRegion) variables.serverRegion = serverRegion;

    const data = await wclGraphql(env, query, variables);
    const enc = data?.worldData?.encounter;
    const raw = enc?.characterRankings;
    // API returns JSON blob
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    const list = Array.isArray(parsed.rankings) ? parsed.rankings : [];
    const totalCount = Number(parsed.count) || list.length;
    const rankOffset = (page - 1) * pageSize;
    const rankings = list.slice(0, pageSize).map((r, i) => {
      const reportCode = r.reportID || r.report?.code || r.reportCode || "";
      const fightId = r.fightID ?? r.report?.fightID ?? r.fight?.id ?? null;
      const durationMs = Number(r.duration) || 0;
      const durationSec = Math.round(durationMs / 1000);
      return {
        rank: rankOffset + i + 1,
        name: r.name || r.characterName || "?",
        server: r.server?.name || r.serverName || "",
        region: r.server?.region || r.serverRegion || "",
        amount: r.amount ?? r.total ?? null,
        durationMs,
        durationSec,
        reportCode,
        fightId,
        startTime: r.startTime ?? null,
        logUrl:
          reportCode && fightId != null
            ? `https://www.warcraftlogs.com/reports/${reportCode}#fight=${fightId}`
            : reportCode
              ? `https://www.warcraftlogs.com/reports/${reportCode}`
              : null,
      };
    });

    const payload = {
      ok: true,
      configured: true,
      encounterId,
      encounterName: enc?.name || null,
      className,
      specName,
      metric,
      difficulty,
      page,
      pageSize,
      count: totalCount,
      rankings,
      cached: false,
    };
    await writeWclCache(env, cacheKey, "rankings", payload);
    return json(payload, 200, cacheHeaders(false));
  } catch (err) {
    return json({ ok: false, configured: true, error: String(err.message || err) }, 502);
  }
}
