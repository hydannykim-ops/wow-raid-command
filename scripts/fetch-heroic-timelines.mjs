/**
 * WCL 영웅 킬 로그의 적 시전으로 영웅 타임라인을 만들고 planner-catalog.js 에 넣는다.
 * .dev.vars 의 WCL_CLIENT_ID / WCL_CLIENT_SECRET 사용
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "js", "planner-catalog.js");
const outJson = path.join(__dirname, "heroic-timelines.json");

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

function loadVars() {
  const raw = fs.readFileSync(path.join(root, ".dev.vars"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

const vars = loadVars();
if (!vars.WCL_CLIENT_ID || !vars.WCL_CLIENT_SECRET) {
  throw new Error("WCL_CLIENT_ID / WCL_CLIENT_SECRET missing in .dev.vars");
}

const tok = await fetch("https://www.warcraftlogs.com/oauth/token", {
  method: "POST",
  headers: {
    authorization: "Basic " + Buffer.from(`${vars.WCL_CLIENT_ID}:${vars.WCL_CLIENT_SECRET}`).toString("base64"),
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
}).then((r) => r.json());
if (!tok.access_token) throw new Error("WCL token failed");

async function gql(query, variables) {
  const r = await fetch("https://www.warcraftlogs.com/api/v2/client", {
    method: "POST",
    headers: { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }).then((x) => x.json());
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

function parseRankings(raw) {
  const fr = typeof raw === "string" ? JSON.parse(raw) : raw || {};
  return Array.isArray(fr.rankings) ? fr.rankings : [];
}

async function enemyCasts(code, fightId) {
  let start = null;
  let all = [];
  for (let page = 0; page < 8; page++) {
    const d = await gql(
      `query($c:String!,$f:Int!,$s:Float){reportData{report(code:$c){events(fightIDs:[$f],dataType:Casts,hostilityType:Enemies,limit:10000,startTime:$s){data nextPageTimestamp}}}}`,
      { c: code, f: fightId, s: start }
    );
    const ev = d.reportData.report.events;
    all = all.concat(ev.data || []);
    if (ev.nextPageTimestamp == null) break;
    start = ev.nextPageTimestamp;
  }
  return all.filter((e) => e.type === "cast" && Number(e.abilityGameID) > 1);
}

function slugify(name) {
  return String(name || "ability")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
}

function esc(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseSpellMeta(block) {
  const meta = new Map();
  const majors = [];
  for (const line of block.split("\n")) {
    const m = line.match(
      /name: "([^"]+)", nameKo: "([^"]+)", type: "([^"]+)", spellId: (\d+)(?:, iconUrl: "([^"]+)")?(, major: true)?/
    );
    if (!m) continue;
    const spellId = Number(m[4]);
    const major = Boolean(m[6]);
    if (!meta.has(spellId)) {
      meta.set(spellId, {
        name: m[1],
        nameKo: m[2],
        type: m[3],
        iconUrl: m[5] || "",
        major,
      });
    } else if (major) meta.get(spellId).major = true;
    if (major) majors.push(spellId);
  }
  return { meta, majors: [...new Set(majors)] };
}

function bossBlock(src, id) {
  const start = src.indexOf(`id: "${id}"`);
  if (start < 0) throw new Error(`boss ${id} not found`);
  const eventsStart = src.indexOf("events: [", start);
  if (eventsStart < 0) throw new Error(`events for ${id} not found`);
  let depth = 0;
  let eventsEnd = -1;
  for (let i = eventsStart; i < src.length; i++) {
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        eventsEnd = i;
        break;
      }
    }
  }
  if (eventsEnd < 0) throw new Error(`events end for ${id} not found`);
  let insertAt = eventsEnd + 1;
  if (src[insertAt] === ",") insertAt += 1;
  return {
    start,
    eventsStart,
    eventsEnd,
    eventsSlice: src.slice(eventsStart, eventsEnd),
    insertAt,
  };
}

function buildEventsJs(meta, casts, duration) {
  const counters = Object.create(null);
  const lines = [
    `          ev({ id: "pull", t: 0, name: "Pull", nameKo: "풀", type: "phase", icon: "ability_warrior_charge" }),`,
  ];
  const bySpell = new Map();
  for (const c of casts) {
    const sid = Number(c.spellId);
    bySpell.set(sid, (bySpell.get(sid) || 0) + 1);
  }
  const usable = casts.filter((c) => (bySpell.get(Number(c.spellId)) || 0) <= 60);
  const seen = new Set();
  for (const c of usable) {
    const info = meta.get(Number(c.spellId));
    if (!info) continue;
    const t = Math.round(Number(c.t) || 0);
    if (t < 1 || t > duration) continue;
    const key = `${c.spellId}:${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = slugify(info.name);
    counters[base] = (counters[base] || 0) + 1;
    const parts = [
      `id: "${base}-${counters[base]}"`,
      `t: ${t}`,
      `name: "${esc(info.name)}"`,
      `nameKo: "${esc(info.nameKo)}"`,
      `type: "${info.type}"`,
      `spellId: ${Number(c.spellId)}`,
    ];
    if (info.iconUrl) parts.push(`iconUrl: "${esc(info.iconUrl)}"`);
    if (info.major) parts.push(`major: true`);
    lines.push(`          ev({ ${parts.join(", ")} }),`);
  }
  lines.push(
    `          ev({ id: "fight-end", t: ${duration}, name: "Fight End", nameKo: "전투 종료", type: "enrage", icon: "achievement_bg_killxenemies_generalsroom" }),`
  );
  return lines.join("\n");
}

const catalogSrc = fs.readFileSync(catalogPath, "utf8");
const result = {};

for (const [id, enc] of Object.entries(BOSSES)) {
  const { eventsSlice } = bossBlock(catalogSrc, id);
  const { meta, majors } = parseSpellMeta(eventsSlice);
  const wantPhases = (eventsSlice.match(/type: "phase"/g) || []).length > 1;

  const rankQuery = `query($e:Int!,$p:Int){worldData{encounter(id:$e){name fightRankings(difficulty:4, metric: speed, page:$p)}}}`;
  const page1 = parseRankings((await gql(rankQuery, { e: enc, p: 1 })).worldData.encounter.fightRankings);
  const pageSlow = parseRankings((await gql(rankQuery, { e: enc, p: 8 })).worldData.encounter.fightRankings);
  const kills = [...pageSlow.slice(0, 12), ...page1.slice(0, 8)];
  const entries = kills
    .map((k) => ({ code: k.report?.code, fightId: k.report?.fightID, durationMs: Number(k.duration) || 0 }))
    .filter((e) => e.code && e.fightId != null);

  const details = [];
  for (let i = 0; i < entries.length && details.length < 8; i += 4) {
    const batch = entries.slice(i, i + 4);
    const parts = batch.map(
      (e, j) =>
        `r${j}: report(code: "${String(e.code).replace(/[^A-Za-z0-9]/g, "")}") { fights(fightIDs: [${Number(e.fightId)}]) { startTime endTime phaseTransitions { id startTime } } }`
    );
    const data = await gql(`query { reportData { ${parts.join("\n")} } }`);
    batch.forEach((e, j) => {
      const f = data?.reportData?.[`r${j}`]?.fights?.[0];
      if (!f) return;
      const trans = (f.phaseTransitions || [])
        .map((t) => ({ id: Number(t.id), sec: Math.round((Number(t.startTime) - Number(f.startTime)) / 1000) }))
        .filter((t) => t.sec > 0)
        .sort((a, b) => a.sec - b.sec);
      details.push({
        ...e,
        startTime: Number(f.startTime),
        durationSec: Math.round((Number(f.endTime) - Number(f.startTime)) / 1000),
        transitions: trans,
      });
    });
  }

  const withPhases = details.filter((x) => x.transitions.length);
  const pool = wantPhases && withPhases.length ? withPhases : details;
  if (!pool.length) {
    console.log(`skip ${id}: no heroic kills`);
    continue;
  }
  pool.sort((a, b) => b.durationSec - a.durationSec);
  const picked = pool[0];
  const castsRaw = await enemyCasts(picked.code, picked.fightId);
  const casts = castsRaw
    .map((e) => ({
      spellId: Number(e.abilityGameID),
      t: (Number(e.timestamp) - picked.startTime) / 1000,
    }))
    .filter((e) => meta.has(e.spellId) && e.t > 0.4)
    .sort((a, b) => a.t - b.t || a.spellId - b.spellId);

  const duration = Math.max(picked.durationSec, Math.round(casts[casts.length - 1]?.t || 0) + 8);
  const phases = picked.transitions.map((t) => ({ t: t.sec, id: t.id }));
  const usedMajors = majors.filter((sid) => casts.some((c) => Number(c.spellId) === sid));

  result[id] = {
    encounterId: enc,
    duration,
    phases,
    majorSpellIds: usedMajors,
    report: { code: picked.code, fightId: picked.fightId, durationSec: picked.durationSec },
    events: casts,
  };
  console.log(
    `${id}: ${casts.length} casts, ${phases.length} phases, ${duration}s from ${picked.code}#${picked.fightId}`
  );
}

fs.writeFileSync(outJson, JSON.stringify(result, null, 2), "utf8");

let src = catalogSrc;
for (const [id, data] of Object.entries(result)) {
  const { eventsSlice, insertAt, start } = bossBlock(src, id);
  const { meta } = parseSpellMeta(eventsSlice);
  const phasesJs = data.phases.map((p) => `{ t: ${p.t}, id: ${p.id} }`).join(", ");
  const majorsJs = data.majorSpellIds.join(", ");
  const eventsJs = buildEventsJs(meta, data.events, data.duration);
  const block = `      heroic: {
        duration: ${data.duration},
        phases: [${phasesJs}],
        majorSpellIds: [${majorsJs}],
        events: [
${eventsJs}
        ],
      },`;
  const nextBoss = src.indexOf("\n    {", start + 8);
  const heroStart = src.indexOf("heroic:", start);
  if (heroStart > 0 && (nextBoss < 0 || heroStart < nextBoss)) {
    let depth = 0;
    let heroEnd = -1;
    const objStart = src.indexOf("{", heroStart);
    for (let i = objStart; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          heroEnd = i + 1;
          break;
        }
      }
    }
    const from = src.lastIndexOf("\n", heroStart);
    src = src.slice(0, from) + "\n" + block + src.slice(heroEnd);
  } else {
    src = src.slice(0, insertAt) + "\n" + block + src.slice(insertAt);
  }
}

src = src.replace(/version: \d+/, "version: 6");
fs.writeFileSync(catalogPath, src, "utf8");
console.log("Updated", catalogPath);
