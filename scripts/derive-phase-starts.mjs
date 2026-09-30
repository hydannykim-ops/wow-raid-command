/**
 * Viserio 타임라인의 페이즈 전환 시각(기준값) 역산
 * WCL 킬 로그에서 "전환 k 이후 보스 기술 첫 시전까지의 오프셋"을 모아
 * Viserio 이벤트 시각 − 오프셋 으로 투표 → 가장 많이 겹치는 시각을 전환 k 의 기준 시각으로 사용
 *   node scripts/derive-phase-starts.mjs  → scripts/phase-starts.json
 * .dev.vars 의 WCL_CLIENT_ID / WCL_CLIENT_SECRET 사용
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(__dirname, "phase-starts.json");

const BOSSES = {
  nekzali: 3470,
  "entombed-sentinels": 3445,
  "lost-explorers": 3497,
  vashnik: 3455,
  sszorak: 3420,
  "twin-fangs": 3421,
  "coiled-altar": 3429,
  ulatek: 3492,
};
const SAMPLE_LOGS = 6;
const TOL = 3;

const vars = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".dev.vars"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const tok = await fetch("https://www.warcraftlogs.com/oauth/token", {
  method: "POST",
  headers: {
    authorization: "Basic " + Buffer.from(`${vars.WCL_CLIENT_ID}:${vars.WCL_CLIENT_SECRET}`).toString("base64"),
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
}).then((r) => r.json());

async function gql(query, variables) {
  const r = await fetch("https://www.warcraftlogs.com/api/v2/client", {
    method: "POST",
    headers: { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }).then((x) => x.json());
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

async function enemyCasts(code, fightId) {
  let start = null;
  let all = [];
  for (let page = 0; page < 6; page++) {
    const d = await gql(
      `query($c:String!,$f:Int!,$s:Float){reportData{report(code:$c){events(fightIDs:[$f],dataType:Casts,hostilityType:Enemies,limit:10000,startTime:$s){data nextPageTimestamp}}}}`,
      { c: code, f: fightId, s: start }
    );
    const ev = d.reportData.report.events;
    all = all.concat(ev.data || []);
    if (ev.nextPageTimestamp == null) break;
    start = ev.nextPageTimestamp;
  }
  return all.filter((e) => e.type === "cast");
}

function loadViserio(id) {
  const raw = fs.readFileSync(path.join(root, "tmp-viserio", `${id}.json`), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

const result = {};
for (const [id, enc] of Object.entries(BOSSES)) {
  const vis = loadViserio(id);
  const visBySpell = new Map();
  for (const e of vis.events || []) {
    const s = Number(e.spellId);
    if (!visBySpell.has(s)) visBySpell.set(s, []);
    visBySpell.get(s).push(Number(e.time));
  }

  const d = await gql(`query($e:Int!){worldData{encounter(id:$e){fightRankings(difficulty:5, metric: speed)}}}`, { e: enc });
  const kills = (d.worldData.encounter.fightRankings?.rankings || []).slice(0, 20);

  // votes[k] = Map(roundedSec → count)
  const votes = [];
  const seqs = [];
  let used = 0;
  for (const k of kills) {
    if (used >= SAMPLE_LOGS) break;
    const code = k.report?.code;
    const fid = k.report?.fightID;
    if (!code || fid == null) continue;
    const f = (await gql(
      `query($c:String!,$f:Int!){reportData{report(code:$c){fights(fightIDs:[$f]){startTime endTime phaseTransitions{id startTime}}}}}`,
      { c: code, f: fid }
    )).reportData.report.fights[0];
    const trans = (f.phaseTransitions || [])
      .map((t) => ({ id: t.id, sec: (t.startTime - f.startTime) / 1000 }))
      .filter((t) => t.sec > 0.5)
      .sort((a, b) => a.sec - b.sec);
    if (!trans.length) continue;
    used += 1;
    seqs.push(trans.map((t) => `${t.id}@${Math.round(t.sec)}`).join(" "));
    const casts = await enemyCasts(code, fid);
    trans.forEach((t, k) => {
      const end = trans[k + 1]?.sec ?? Infinity;
      const firstBySpell = new Map();
      for (const c of casts) {
        const sec = (c.timestamp - f.startTime) / 1000;
        if (sec < t.sec || sec >= end) continue;
        const s = Number(c.abilityGameID);
        if (!visBySpell.has(s) || firstBySpell.has(s)) continue;
        firstBySpell.set(s, sec - t.sec);
      }
      if (!votes[k]) votes[k] = new Map();
      firstBySpell.forEach((off, s) => {
        for (const v of visBySpell.get(s)) {
          const b = Math.round(v - off);
          if (b <= 0) continue;
          votes[k].set(b, (votes[k].get(b) || 0) + 1);
        }
      });
    });
  }

  if (!used) {
    result[id] = { phaseStarts: [], note: "no phase transitions" };
    console.log(`- ${id}: 페이즈 없음`);
    continue;
  }

  // 전환별 후보(창 안 가중 평균 시각 + 점수) 상위 8개
  const cands = votes.map((m) => {
    const scored = [...m.keys()]
      .filter((b) => b < Number(vis.timelineEnd))
      .map((b) => {
        let score = 0;
        let sum = 0;
        for (const [b2, n] of m) if (Math.abs(b2 - b) <= TOL) (score += n), (sum += b2 * n);
        return { b, t: Math.round(sum / score), score };
      });
    scored.sort((a, b) => b.score - a.score || a.b - b.b);
    const picked = [];
    for (const c of scored) {
      if (c.score < 3) break;
      if (picked.some((p) => Math.abs(p.b - c.b) <= TOL * 2)) continue;
      picked.push(c);
      if (picked.length >= 8) break;
    }
    return picked;
  });
  const candidates = cands.map((list) => list.map((c) => `${c.t}:${c.score}`).join(" "));

  // 전환 순서대로 시각이 증가하면서 총점이 최대인 조합 (동점이면 이른 시각)
  const K = cands.length;
  const dp = cands.map((list) => list.map(() => ({ total: -Infinity, prev: -1 })));
  cands[0]?.forEach((c, i) => (dp[0][i] = { total: c.score, prev: -1 }));
  for (let k = 1; k < K; k++) {
    cands[k].forEach((c, i) => {
      cands[k - 1].forEach((p, j) => {
        if (dp[k - 1][j].total === -Infinity || c.t < p.t + 3) return;
        const total = dp[k - 1][j].total + c.score;
        const cur = dp[k][i];
        if (total > cur.total || (total === cur.total && p.t < cands[k - 1][cur.prev]?.t)) {
          dp[k][i] = { total, prev: j };
        }
      });
    });
  }
  const starts = [];
  let lastK = K - 1;
  while (lastK >= 0 && !dp[lastK].some((x) => x.total > -Infinity)) lastK -= 1;
  if (lastK >= 0) {
    let bi = 0;
    dp[lastK].forEach((x, i) => {
      const b = dp[lastK][bi];
      if (x.total > b.total || (x.total === b.total && cands[lastK][i].t < cands[lastK][bi].t)) bi = i;
    });
    for (let k = lastK; k >= 0 && bi >= 0; k--) {
      const c = cands[k][bi];
      starts.unshift({ index: k, t: c.t, score: c.score });
      bi = dp[k][bi].prev;
    }
  }
  result[id] = { phaseStarts: starts, samples: seqs, candidates };
  console.log(`- ${id}: ${starts.map((s) => `#${s.index + 1}@${s.t}(${s.score})`).join(" ")}  | logs: ${seqs.join(" || ")}`);
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log("wrote", outPath);
