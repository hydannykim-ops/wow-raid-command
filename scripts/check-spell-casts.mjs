/**
 * 전문화별 1등 로그에서 그 플레이어가 실제로 시전한 기술 ID/이름 확인 (카탈로그 spellId 가 로그 ID 와 맞는지)
 *   node scripts/check-spell-casts.mjs [encounterId]  (npm run dev 가 켜져 있어야 함)
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ENC = Number(process.argv[2] || 3470);
const API = "http://localhost:8788";

const ALL_SPECS = [
  ["Druid", "Restoration", "hps"],
  ["Druid", "Balance", "dps"],
  ["Druid", "Feral", "dps"],
  ["Druid", "Guardian", "dps"],
  ["Paladin", "Retribution", "dps"],
  ["Evoker", "Augmentation", "dps"],
  ["Evoker", "Devastation", "dps"],
  ["Shaman", "Elemental", "dps"],
  ["Shaman", "Enhancement", "dps"],
  ["Paladin", "Holy", "hps"],
  ["Monk", "Mistweaver", "hps"],
  ["Shaman", "Restoration", "hps"],
  ["Evoker", "Preservation", "hps"],
  ["Priest", "Holy", "hps"],
  ["Priest", "Discipline", "hps"],
  ["DemonHunter", "Havoc", "dps"],
  ["DemonHunter", "Vengeance", "dps"],
  ["DeathKnight", "Unholy", "dps"],
  ["DeathKnight", "Blood", "dps"],
  ["Warrior", "Fury", "dps"],
];
const ONLY = (process.argv[3] || "").toLowerCase();
const SPECS = ONLY ? ALL_SPECS.filter(([c]) => ONLY.split(",").includes(c.toLowerCase())) : ALL_SPECS;
const TOP = Number(process.argv[4] || 1);
const WATCH =
  /stampeding|wind rush|time spiral|sacrifice|ironbark|cocoon|pain suppression|guardian spirit|darkness|rallying|anti-magic zone|aura mastery|spirit link|tranquility|convoke|revival|yu'lon|conduit|avenging|apotheosis|hymn|evangelism|penitence|ascendance|stasis|rewind/i;

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

const out = [];
for (const [cls, spec, metric] of SPECS) {
  const q = new URLSearchParams({ encounterId: String(ENC), className: cls, specName: spec, metric, difficulty: "5", pageSize: "10", page: "1" });
  const rk = await fetch(`${API}/api/wcl/rankings?${q}`).then((r) => r.json());
  const entries = (rk.rankings || []).filter((r) => r.name && r.name !== "Anonymous" && r.reportCode).slice(0, TOP);
  if (!entries.length) {
    out.push(`## ${spec} ${cls}: 랭킹 없음`);
    continue;
  }
  for (const entry of entries) {
  const d = await gql(
    `query($code:String!,$fid:Int!,$f:String){reportData{report(code:$code){
      masterData{abilities{gameID name}}
      events(fightIDs:[$fid],dataType:Casts,filterExpression:$f,limit:10000){data}
    }}}`,
    { code: entry.reportCode, fid: entry.fightId, f: `source.name = "${entry.name}" and type = "cast"` }
  );
  const rep = d.reportData.report;
  const names = new Map((rep.masterData.abilities || []).map((a) => [a.gameID, a.name]));
  const data = typeof rep.events.data === "string" ? JSON.parse(rep.events.data) : rep.events.data;
  const cnt = new Map();
  data.forEach((e) => cnt.set(e.abilityGameID, (cnt.get(e.abilityGameID) || 0) + 1));
  const hits = [...cnt]
    .map(([id, n]) => ({ id, n, name: names.get(id) || "?" }))
    .filter((x) => WATCH.test(x.name))
    .map((x) => `${x.id} ${x.name} x${x.n}`);
  out.push(`## ${spec} ${cls} · #${entry.rank} ${entry.name}: ${hits.join(" | ") || "(관심 기술 없음)"}`);
  }
}
fs.writeFileSync(path.join(os.tmpdir(), "spell-casts.txt"), out.join("\n"), "utf8");
console.log("done");
