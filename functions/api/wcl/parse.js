import { json } from "../../_lib/http.js";
import { wclConfigured, wclGraphql } from "../../_lib/wcl.js";

/**
 * GET /api/wcl/parse?reportCode=&fightId=&abilityIds=740,115310&playerName=
 * 시전 시각 + 페이즈 전이 (전투 시작 기준 초)
 * playerName 이 있으면 그 플레이어가 시전한 것만 (없으면 공대 전체)
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!wclConfigured(env)) {
    return json(
      {
        ok: false,
        error: "WCL_CLIENT_ID / WCL_CLIENT_SECRET 이 없습니다.",
        configured: false,
      },
      503
    );
  }

  const url = new URL(request.url);
  const reportCode = String(url.searchParams.get("reportCode") || "").trim();
  const fightId = Number(url.searchParams.get("fightId") || 0);
  const abilityIds = String(url.searchParams.get("abilityIds") || "")
    .split(/[,+\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const playerName = String(url.searchParams.get("playerName") || "").trim();

  if (!reportCode || !fightId) {
    return json({ ok: false, error: "reportCode, fightId 가 필요합니다." }, 400);
  }

  const phasesOnly = abilityIds.length === 0 || url.searchParams.get("phasesOnly") === "1";
  const filterExpression = phasesOnly
    ? null
    : `type = "cast" and ability.id in (${abilityIds.join(",")})`;

  const query = phasesOnly
    ? `
    query ParsePhases($code: String!, $fightId: Int!) {
      reportData {
        report(code: $code) {
          code
          title
          fights(fightIDs: [$fightId]) {
            id
            name
            encounterID
            startTime
            endTime
            kill
            phaseTransitions {
              id
              startTime
            }
          }
        }
      }
    }
  `
    : `
    query ParseCasts($code: String!, $fightId: Int!, $filter: String) {
      reportData {
        report(code: $code) {
          code
          title
          masterData {
            actors(type: "Player") {
              id
              name
              server
            }
          }
          fights(fightIDs: [$fightId]) {
            id
            name
            encounterID
            startTime
            endTime
            kill
            phaseTransitions {
              id
              startTime
            }
          }
          events(
            fightIDs: [$fightId]
            dataType: Casts
            filterExpression: $filter
            limit: 10000
          ) {
            data
            nextPageTimestamp
          }
        }
      }
    }
  `;

  try {
    let allEvents = [];
    let nextPage = null;
    let fight = null;
    let title = null;

    // 첫 페이지
    let data = await wclGraphql(
      env,
      query,
      phasesOnly
        ? { code: reportCode, fightId }
        : { code: reportCode, fightId, filter: filterExpression }
    );
    const report = data?.reportData?.report;
    title = report?.title || null;
    fight = (report?.fights || [])[0] || null;

    if (!phasesOnly) {
      const first = report?.events;
      const chunk = typeof first?.data === "string" ? JSON.parse(first.data) : first?.data || [];
      allEvents = allEvents.concat(chunk);
      nextPage = first?.nextPageTimestamp ?? null;

      // 페이지네이션 (최대 5페이지)
      let pages = 0;
      while (nextPage != null && pages < 5) {
        pages += 1;
        const pageQuery = `
          query More($code: String!, $fightId: Int!, $filter: String, $start: Float) {
            reportData {
              report(code: $code) {
                events(
                  fightIDs: [$fightId]
                  dataType: Casts
                  filterExpression: $filter
                  startTime: $start
                  limit: 10000
                ) {
                  data
                  nextPageTimestamp
                }
              }
            }
          }
        `;
        const more = await wclGraphql(env, pageQuery, {
          code: reportCode,
          fightId,
          filter: filterExpression,
          start: nextPage,
        });
        const ev = more?.reportData?.report?.events;
        const part = typeof ev?.data === "string" ? JSON.parse(ev.data) : ev?.data || [];
        allEvents = allEvents.concat(part);
        nextPage = ev?.nextPageTimestamp ?? null;
      }
    }

    if (!fight) {
      return json({ ok: false, error: "fight 를 찾을 수 없습니다." }, 404);
    }

    const fightStart = Number(fight.startTime) || 0;
    const fightEnd = Number(fight.endTime) || fightStart;
    const durationSec = Math.max(0, Math.round((fightEnd - fightStart) / 1000));

    // 페이즈: 전투 시작=1페, transitions는 보고 상대 ms
    const transitions = [...(fight.phaseTransitions || [])].sort(
      (a, b) => Number(a.startTime) - Number(b.startTime)
    );
    const phases = [{ id: 1, startSec: 0, label: "Phase 1" }];
    transitions.forEach((pt) => {
      const startSec = Math.max(0, Math.round((Number(pt.startTime) - fightStart) / 1000));
      const id = Number(pt.id) || phases.length + 1;
      if (startSec <= 0) return;
      if (phases.some((p) => p.startSec === startSec)) return;
      phases.push({
        id,
        startSec,
        label: `Phase ${id}`,
      });
    });
    phases.sort((a, b) => a.startSec - b.startSec);

    let sourceIds = null;
    let source = null;
    if (!phasesOnly && playerName) {
      const want = playerName.toLowerCase();
      const actors = (report?.masterData?.actors || []).filter((a) => String(a.name || "").toLowerCase() === want);
      if (!actors.length) {
        return json({ ok: false, error: `로그에서 플레이어(${playerName})를 찾을 수 없습니다.` }, 404);
      }
      sourceIds = new Set(actors.map((a) => Number(a.id)));
      source = { ids: [...sourceIds], name: actors[0].name, server: actors[0].server || "" };
    }

    const casts = phasesOnly
      ? []
      : allEvents
          .filter((e) => !sourceIds || sourceIds.has(Number(e.sourceID)))
          .filter((e) => e && (e.type === "cast" || e.type == null || e.abilityGameID || e.ability))
          .map((e) => {
            const abilityId = Number(e.abilityGameID ?? e.ability?.guid ?? e.ability?.id ?? e.abilityID) || 0;
            const ts = Number(e.timestamp ?? e.time) || 0;
            const tSec = Math.max(0, Math.round((ts - fightStart) / 1000));
            return {
              abilityId,
              tSec,
              sourceID: e.sourceID ?? null,
            };
          })
          .filter((c) => c.abilityId && abilityIds.includes(c.abilityId))
          .sort((a, b) => a.tSec - b.tSec);

    return json({
      ok: true,
      configured: true,
      reportCode,
      title,
      fight: {
        id: fight.id,
        name: fight.name,
        encounterID: fight.encounterID,
        kill: fight.kill,
        durationSec,
      },
      phases,
      source,
      casts,
      logUrl: `https://www.warcraftlogs.com/reports/${reportCode}#fight=${fightId}`,
    });
  } catch (err) {
    return json({ ok: false, configured: true, error: String(err.message || err) }, 502);
  }
}
