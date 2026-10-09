/**
 * Viserio 타임라인의 페이즈 전환 시각(기준값) 역산
 * WCL 킬 로그에서 "전환 k 이후 보스 기술 첫 시전까지의 오프셋"을 모아
 * Viserio 이벤트 시각 − 오프셋 으로 투표 → 가장 많이 겹치는 시각을 전환 k 의 기준 시각으로 사용
 *   node scripts/derive-phase-starts.mjs           → scripts/phase-starts.json (신화)
 *   node scripts/derive-phase-starts.mjs --heroic  → scripts/phase-starts-heroic.json
 * .dev.vars 의 WCL_CLIENT_ID / WCL_CLIENT_SECRET 사용
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const heroic = process.argv.includes("--heroic");
const wclDifficulty = heroic ? 4 : 5;
const dumpDir = path.join(root, heroic ? "tmp-viserio-heroic" : "tmp-viserio");
const outPath = path.join(__dirname, heroic ? "phase-starts-heroic.json" : "phase-starts.json");

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
  const raw = fs.readFileSync(path.join(dumpDir, `${id}.json`), "utf8").replace(/^\uFEFF/, "");
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

  const d = await gql(
    `query($e:Int!,$d:Int!){worldData{encounter(id:$e){fightRankings(difficulty:$d, metric: speed)}}}`,
    { e: enc, d: wclDifficulty }
  );
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

  // 전환 순서대로 시각이 증가하면서 총점이 최대인 조합 (동점이면 이른 시각).
  // 짧은 킬을 긴 Viserio 템플릿에 얹으면 같은 루프의 뒷사이클이 1~2점 더 나올 수 있다.
  // 고른 시각이 그 전환의 WCL 중앙값 × 2.3 보다 크면, 같은 전환의 이른 후보로 당긴다.
  const K = cands.length;
  const paths = [];
  function walk(k, prevT, total, path) {
    if (k === K) {
      paths.push({ total, path: path.slice() });
      return;
    }
    const list = cands[k] || [];
    if (!list.length) return;
    for (const c of list) {
      if (c.t < prevT + 3) continue;
      path.push(c);
      walk(k + 1, c.t, total + c.score, path);
      path.pop();
    }
  }
  walk(0, 0, 0, []);
  const bestTotal = paths.reduce((m, p) => Math.max(m, p.total), -Infinity);
  const top = paths
    .filter((p) => p.total === bestTotal)
    .sort((a, b) => {
      for (let i = 0; i < a.path.length; i++) {
        const dt = a.path[i].t - b.path[i].t;
        if (dt) return dt;
      }
      return 0;
    });
  const picked = top[0]?.path || [];
  const sampleTimes = seqs.map((s) => s.split(" ").map((x) => Number(x.split("@")[1])));
  function median(nums) {
    const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const starts = [];
  for (let k = 0; k < picked.length; k++) {
    const med = median(sampleTimes.map((row) => row[k]));
    const bestScore = Math.max(0, ...(cands[k] || []).map((c) => c.score));
    let c = picked[k];
    const prevT = starts[k - 1]?.t ?? 0;
    if (med != null && c.t > med * 2.3) {
      const alt = (cands[k] || [])
        .filter((x) => x.t >= prevT + 3 && x.score >= bestScore * 0.7)
        .sort((a, b) => a.t - b.t)[0];
      if (alt) c = alt;
    }
    starts.push({ index: k, t: c.t, score: c.score });
  }
  result[id] = { phaseStarts: starts, samples: seqs, candidates };
  console.log(`- ${id}: ${starts.map((s) => `#${s.index + 1}@${s.t}(${s.score})`).join(" ")}  | logs: ${seqs.join(" || ")}`);
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log("wrote", outPath);
