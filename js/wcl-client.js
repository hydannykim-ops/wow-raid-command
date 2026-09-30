/**
 * WCL 클라이언트 — 랭킹 / 파스 / 페이즈 상대 시각 매핑
 */
(function (global) {
  "use strict";

  const NO_API_MSG =
    "WCL API 서버에 연결할 수 없습니다. 프로젝트 폴더에서 `npm run dev` 로 실행한 뒤 http://localhost:8788 로 열어 주세요.";

  async function getJson(url) {
    if (location.protocol === "file:") throw new Error(NO_API_MSG);
    let res;
    try {
      res = await fetch(url);
    } catch (_) {
      throw new Error(NO_API_MSG);
    }
    const data = await res.json().catch(() => null);
    if (!data && (res.status === 404 || res.status === 405 || res.ok)) throw new Error(NO_API_MSG);
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data || {};
      throw err;
    }
    return data;
  }

  function rankingsUrl({ encounterId, className, specName, metric, difficulty, pageSize, page, serverRegion }) {
    const q = new URLSearchParams({
      encounterId: String(encounterId),
      className,
      specName,
      metric: metric || "hps",
      difficulty: String(difficulty || 5),
      pageSize: String(pageSize || 10),
      page: String(page || 1),
    });
    if (serverRegion) q.set("serverRegion", serverRegion);
    return `/api/wcl/rankings?${q}`;
  }

  function parseUrl({ reportCode, fightId, abilityIds, phasesOnly, playerName }) {
    const q = new URLSearchParams({
      reportCode,
      fightId: String(fightId),
    });
    if (phasesOnly || !(abilityIds || []).length) {
      q.set("phasesOnly", "1");
    } else {
      q.set("abilityIds", (abilityIds || []).join(","));
      if (playerName) q.set("playerName", playerName);
    }
    return `/api/wcl/parse?${q}`;
  }

  async function fetchRankings(opts) {
    return getJson(rankingsUrl(opts));
  }

  async function fetchParse(opts) {
    return getJson(parseUrl(opts));
  }

  /** 킬 속도 랭킹 상위·하위 N 로그의 페이즈 전환 시각 */
  async function fetchPhaseSync({ encounterId, difficulty = 5, count = 10 }) {
    const q = new URLSearchParams({ encounterId: String(encounterId), difficulty: String(difficulty), count: String(count) });
    return getJson(`/api/wcl/phase-sync?${q}`);
  }

  async function fetchPhases(opts) {
    return getJson(parseUrl({ ...opts, phasesOnly: true, abilityIds: [] }));
  }

  /** 플래너 페이즈 이벤트 → [{ t, label }] (0초 시작 보장) */
  function plannerPhaseStarts(bossEvents) {
    const phases = (bossEvents || [])
      .filter((e) => e && (e.type === "phase" || /phase|페이즈/i.test(String(e.name || "") + String(e.nameKo || ""))))
      .map((e) => ({
        t: Number(e.t) || 0,
        label: e.nameKo || e.name || "Phase",
        id: e.id,
      }))
      .sort((a, b) => a.t - b.t);
    if (!phases.length || phases[0].t > 0) {
      phases.unshift({ t: 0, label: "Phase 1", id: "pull-phase" });
    }
    // 동일 t 제거
    const out = [];
    phases.forEach((p) => {
      if (out.length && out[out.length - 1].t === p.t) return;
      out.push(p);
    });
    return out;
  }

  /**
   * 로그 전투초 → 플래너 초 (페이즈 상대)
   * logPhases: [{ startSec }], plannerPhases: [{ t }]
   */
  function mapFightSecToPlanner(castSec, logPhases, plannerPhases, duration) {
    const logs = logPhases?.length ? logPhases : [{ startSec: 0 }];
    const plans = plannerPhases?.length ? plannerPhases : [{ t: 0 }];
    let idx = 0;
    for (let i = 0; i < logs.length; i++) {
      if (castSec >= Number(logs[i].startSec) || logs[i].startSec === 0) idx = i;
    }
    // 마지막 startSec 이하인 구간
    for (let i = logs.length - 1; i >= 0; i--) {
      if (castSec >= Number(logs[i].startSec)) {
        idx = i;
        break;
      }
    }
    const logStart = Number(logs[idx]?.startSec) || 0;
    const offset = Math.max(0, castSec - logStart);
    const planIdx = Math.min(idx, plans.length - 1);
    const planStart = Number(plans[planIdx]?.t) || 0;
    const t = planStart + offset;
    const cap = Number(duration) || t;
    return Math.max(0, Math.min(cap, Math.round(t)));
  }

  function fmtFightDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function mean(nums) {
    const list = (nums || []).filter((n) => Number.isFinite(n));
    if (!list.length) return null;
    return list.reduce((a, b) => a + b, 0) / list.length;
  }

  /**
   * 상위·하위 샘플의 페이즈 시작초를 인덱스별로 평균/편차 집계
   * samples: [{ band: "top"|"bottom", phases: [{ startSec }] }]
   */
  function summarizePhaseStats(samples, plannerPhases, opts) {
    const minSpread = Number(opts?.minSpreadSec) || 15;
    const byIdx = new Map();
    (samples || []).forEach((sample) => {
      const phases = [...(sample.phases || [])].sort((a, b) => a.startSec - b.startSec);
      phases.forEach((p, idx) => {
        if (idx === 0 && Number(p.startSec) === 0) return;
        if (!byIdx.has(idx)) byIdx.set(idx, { top: [], bottom: [], all: [] });
        const bucket = byIdx.get(idx);
        const sec = Number(p.startSec);
        if (!Number.isFinite(sec)) return;
        bucket.all.push(sec);
        if (sample.band === "bottom") bucket.bottom.push(sec);
        else bucket.top.push(sec);
      });
    });

    const plan = (plannerPhases || []).filter((p) => Number(p.t) > 0);
    const indices = [...byIdx.keys()].sort((a, b) => a - b);
    const phases = indices.map((idx, i) => {
      const bucket = byIdx.get(idx);
      const topAvg = mean(bucket.top);
      const bottomAvg = mean(bucket.bottom);
      const avgParts = [topAvg, bottomAvg].filter((n) => n != null);
      const avgSec = avgParts.length
        ? Math.round(mean(avgParts))
        : Math.round(mean(bucket.all) || 0);
      const minSec = Math.round(Math.min(...bucket.all));
      const maxSec = Math.round(Math.max(...bucket.all));
      const spread = maxSec - minSec;
      const planHit = plan[i] || plan.find((p) => Math.abs(p.t - avgSec) < 40) || null;
      return {
        index: idx,
        id: planHit?.id || `wcl-phase-${idx}`,
        label: planHit?.label || `Phase ${idx + 1}`,
        t: avgSec,
        topAvg: topAvg != null ? Math.round(topAvg) : null,
        bottomAvg: bottomAvg != null ? Math.round(bottomAvg) : null,
        minSec,
        maxSec,
        spread,
        varied: spread >= minSpread,
        samples: bucket.all.length,
      };
    });

    return {
      phases,
      sampleCount: (samples || []).length,
      topCount: (samples || []).filter((s) => s.band !== "bottom").length,
      bottomCount: (samples || []).filter((s) => s.band === "bottom").length,
    };
  }

  async function mapPool(items, limit, worker) {
    const out = new Array(items.length);
    let cursor = 0;
    async function run() {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i], i);
      }
    }
    const n = Math.max(1, Math.min(limit || 4, items.length || 1));
    await Promise.all(Array.from({ length: n }, () => run()));
    return out;
  }

  global.WclClient = {
    fetchRankings,
    fetchParse,
    fetchPhases,
    fetchPhaseSync,
    plannerPhaseStarts,
    mapFightSecToPlanner,
    fmtFightDuration,
    summarizePhaseStats,
    mapPool,
  };
})(window);
