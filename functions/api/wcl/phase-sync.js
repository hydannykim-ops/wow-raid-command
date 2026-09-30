import { json } from "../../_lib/http.js";
import { wclConfigured, wclGraphql } from "../../_lib/wcl.js";

/**
 * GET /api/wcl/phase-sync?encounterId=&difficulty=5&count=10
 * 킬 속도 랭킹 상위 N · 하위 N 개 로그의 페이즈 전환 시각(전투 시작 기준 초)
 * 전환 기록이 없는 로그는 건너뜀
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!wclConfigured(env)) {
    return json({ ok: false, error: "WCL_CLIENT_ID / WCL_CLIENT_SECRET 이 없습니다.", configured: false }, 503);
  }
  const url = new URL(request.url);
  const encounterId = Number(url.searchParams.get("encounterId") || 0);
  const difficulty = Number(url.searchParams.get("difficulty") || 5);
  const count = Math.min(15, Math.max(3, Number(url.searchParams.get("count") || 10)));
  if (!encounterId) return json({ ok: false, error: "encounterId 가 필요합니다." }, 400);

  const rankQuery = `
    query($e: Int!, $d: Int, $p: Int) {
      worldData { encounter(id: $e) { name fightRankings(difficulty: $d, metric: speed, page: $p) } }
    }`;
  async function page(p) {
    const data = await wclGraphql(env, rankQuery, { e: encounterId, d: difficulty, p });
    const raw = data?.worldData?.encounter?.fightRankings;
    const fr = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    return { name: data?.worldData?.encounter?.name || null, fr };
  }

  async function transitionsFor(entries) {
    if (!entries.length) return [];
    const parts = entries.map(
      (e, i) =>
        `r${i}: report(code: "${String(e.code).replace(/[^A-Za-z0-9]/g, "")}") { fights(fightIDs: [${Number(e.fightId)}]) { startTime endTime phaseTransitions { id startTime } } }`
    );
    const data = await wclGraphql(env, `query { reportData { ${parts.join("\n")} } }`);
    return entries.map((e, i) => {
      const f = data?.reportData?.[`r${i}`]?.fights?.[0];
      if (!f) return null;
      const trans = (f.phaseTransitions || [])
        .map((t) => ({ id: Number(t.id), sec: Math.round((Number(t.startTime) - Number(f.startTime)) / 1000) }))
        .filter((t) => t.sec > 0)
        .sort((a, b) => a.sec - b.sec);
      return {
        ...e,
        durationSec: Math.round((Number(f.endTime) - Number(f.startTime)) / 1000),
        transitions: trans,
      };
    });
  }

  const toEntries = (list) =>
    (list || [])
      .map((r) => ({ code: r.report?.code, fightId: r.report?.fightID, guild: r.guild?.name || "" }))
      .filter((e) => e.code && e.fightId != null);

  async function collect(list) {
    const out = [];
    const entries = toEntries(list);
    for (let i = 0; i < entries.length && out.length < count; i += count) {
      const got = await transitionsFor(entries.slice(i, i + count));
      got.forEach((g) => {
        if (g && g.transitions.length && out.length < count) out.push(g);
      });
    }
    return out;
  }

  try {
    const first = await page(1);
    const top = await collect(first.fr.rankings);

    // 마지막 페이지 탐색 (hasMorePages 기준)
    let lo = 1;
    let hi = 1;
    let lastFr = first.fr;
    while (lastFr.hasMorePages && hi < 512) {
      lo = hi;
      hi *= 2;
      lastFr = (await page(hi)).fr;
      if (!(lastFr.rankings || []).length) break;
    }
    if ((lastFr.rankings || []).length && !lastFr.hasMorePages) {
      lo = hi;
    } else {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        const fr = (await page(mid)).fr;
        if ((fr.rankings || []).length) {
          lo = mid;
          lastFr = fr;
          if (!fr.hasMorePages) break;
        } else {
          hi = mid;
        }
      }
      if (lo !== hi) lastFr = (await page(lo)).fr;
    }
    let bottomList = [...(lastFr.rankings || [])].reverse();
    if (bottomList.length < count * 2 && lo > 1) {
      const prev = (await page(lo - 1)).fr;
      bottomList = bottomList.concat([...(prev.rankings || [])].reverse());
    }
    const topKeys = new Set(top.map((t) => `${t.code}:${t.fightId}`));
    const bottom = (await collect(bottomList.filter((r) => !topKeys.has(`${r.report?.code}:${r.report?.fightID}`))));

    return json({
      ok: true,
      encounterId,
      encounterName: first.name,
      difficulty,
      top,
      bottom,
    });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 502);
  }
}
