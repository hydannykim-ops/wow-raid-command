/**
 * Import Viserio bossTimeline dumps into planner-catalog.js
 *   node scripts/import-viserio-timelines.mjs           # 신화 (tmp-viserio)
 *   node scripts/import-viserio-timelines.mjs --heroic  # 영웅 (tmp-viserio-heroic)
 * Majors = types includes "Raid AOE" | "Raid Damage"
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const heroic = process.argv.includes("--heroic");
const dumpDir = path.join(root, heroic ? "tmp-viserio-heroic" : "tmp-viserio");
const catalogPath = path.join(root, "js", "planner-catalog.js");

const META = {
  nekzali: {
    journalId: 2888,
    npcId: 253563,
    wclEncounterId: 3470,
    order: 1,
    name: "Nek'zali the Soulcoiler",
    nameKo: "영혼살무사 네크잘리",
    iconSlug: "priestess",
  },
  "entombed-sentinels": {
    journalId: 2874,
    wclEncounterId: 3445,
    order: 2,
    name: "Entombed Sentinels",
    nameKo: "매장된 파수꾼",
    iconSlug: "golems",
  },
  "lost-explorers": {
    journalId: 2894,
    wclEncounterId: 3497,
    order: 3,
    name: "The Lost Explorers",
    nameKo: "길 잃은 탐험가",
    iconSlug: "tortollans",
  },
  vashnik: {
    journalId: 2882,
    npcId: 266403,
    wclEncounterId: 3455,
    order: 4,
    name: "Vashnik the Malignant",
    nameKo: "악성의 바쉬니크",
    iconSlug: "alchemist",
  },
  sszorak: {
    journalId: 2871,
    npcId: 257347,
    wclEncounterId: 3420,
    order: 5,
    name: "Sszorak",
    nameKo: "스조라크",
    iconSlug: "brute",
  },
  "twin-fangs": {
    journalId: 2887,
    wclEncounterId: 3421,
    order: 6,
    name: "The Twin Fangs",
    nameKo: "쌍둥이 송곳니",
    iconSlug: "twins",
  },
  "coiled-altar": {
    journalId: 2883,
    wclEncounterId: 3429,
    order: 7,
    name: "The Coiled Altar",
    nameKo: "똬리의 제단",
    iconSlug: "zuljanmalacrass",
  },
  ulatek: {
    journalId: 2895,
    npcId: 268956,
    wclEncounterId: 3492,
    order: 8,
    name: "Ula'tek",
    nameKo: "울라텍",
    iconSlug: "ulatek",
  },
};

const ABILITY_SLUG = {
  nekzali: "nekzali-the-soulcoiler",
};

/** 스킬 ID → 공식 한국어 이름 (scripts/fetch-spell-names-ko.mjs 로 생성) */
const koPath = path.join(__dirname, "spell-names-ko.json");
const KO = fs.existsSync(koPath) ? JSON.parse(fs.readFileSync(koPath, "utf8")) : {};

/** Viserio 타임라인 기준 페이즈 전환 시각 (scripts/derive-phase-starts.mjs [--heroic] 로 생성) */
const phasePath = path.join(__dirname, heroic ? "phase-starts-heroic.json" : "phase-starts.json");
const PHASES = fs.existsSync(phasePath) ? JSON.parse(fs.readFileSync(phasePath, "utf8")) : {};

function phaseList(id, dump) {
  const info = PHASES[id];
  const starts = info?.phaseStarts || [];
  if (starts.length) {
    const idsFromSample = (info.samples || [])
      .map((s) => s.split(" ").map((x) => Number(x.split("@")[0])))
      .find((ids) => ids.length >= starts.length) || [];
    return starts.map((s, i) => ({ t: s.t, id: idsFromSample[s.index] ?? i + 2 }));
  }
  const seen = new Set();
  const out = [];
  for (const e of dump?.events || []) {
    if (!(e.types || []).includes("Phase Change")) continue;
    const t = Math.round(Number(e.time) || 0);
    if (t < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push({ t, id: out.length + 2 });
  }
  return out;
}

/** Viserio tags these Raid Damage, but they are not majors for our grid. */
const MAJOR_EXCLUDE = {
  nekzali: [1307939], // Corpse Blight
};

function isMajor(types) {
  return (types || []).some((t) => t === "Raid AOE" || t === "Raid Damage");
}

function isBossMajor(bossId, e) {
  if ((MAJOR_EXCLUDE[bossId] || []).includes(Number(e.spellId))) return false;
  return isMajor(e.types);
}

function mapType(types) {
  const t = types || [];
  if (t.includes("Phase Change") || t.includes("Intermission")) return "phase";
  if (t.includes("Add Spawn")) return "add";
  if (t.some((x) => /Soak/i.test(x))) return "soak";
  if (t.includes("Movement") || t.includes("Knock")) return "movement";
  if (t.includes("Tankbuster") || t.includes("Tank Debuff") || t.includes("Frontal")) return "tank";
  if (t.includes("Enrage")) return "enrage";
  return "damage";
}

function esc(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slugify(name) {
  return String(name || "ability")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
}

function dumpDuration(dump) {
  return Math.round(Number(dump.timelineEnd) || Number(dump.fightEnd) || 480);
}

function dumpMajors(id, dump) {
  const fromEvents = [...new Set((dump.events || []).filter((e) => isBossMajor(id, e)).map((e) => Number(e.spellId)))];
  if (fromEvents.length) return fromEvents;
  const exclude = new Set(MAJOR_EXCLUDE[id] || []);
  return [...new Set((dump.majorSpellIds || []).map(Number).filter((n) => n && !exclude.has(n)))];
}

function buildEventLines(id, dump, indent) {
  const duration = dumpDuration(dump);
  const seen = new Set();
  const raw = [];
  for (const e of dump.events || []) {
    const key = `${e.spellId}:${e.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    raw.push(e);
  }
  raw.sort((a, b) => a.time - b.time || String(a.spellName).localeCompare(String(b.spellName)));
  const counters = Object.create(null);
  const lines = [];
  lines.push(`${indent}ev({ id: "pull", t: 0, name: "Pull", nameKo: "풀", type: "phase", icon: "ability_warrior_charge" }),`);
  for (const e of raw) {
    const name = e.spellName || `Spell ${e.spellId}`;
    const nameKo = KO[e.spellId] || name;
    const major = isBossMajor(id, e);
    const type = mapType(e.types || []);
    const base = slugify(name);
    counters[base] = (counters[base] || 0) + 1;
    const eid = `${base}-${counters[base]}`;
    const iconUrl = e.spellIcon
      ? `https://wowutils.com${e.spellIcon}`
      : e.spellId
        ? `https://wowutils.com/viserio-cooldowns/images/boss-abilities/${ABILITY_SLUG[id] || id}/${e.spellId}.jpg`
        : null;
    const parts = [
      `id: "${eid}"`,
      `t: ${Math.round(Number(e.time) || 0)}`,
      `name: "${esc(name)}"`,
      `nameKo: "${esc(nameKo)}"`,
      `type: "${type}"`,
      `spellId: ${Number(e.spellId)}`,
    ];
    if (iconUrl) parts.push(`iconUrl: "${esc(iconUrl)}"`);
    if (major) parts.push(`major: true`);
    lines.push(`${indent}ev({ ${parts.join(", ")} }),`);
  }
  lines.push(
    `${indent}ev({ id: "fight-end", t: ${duration}, name: "Fight End", nameKo: "전투 종료", type: "enrage", icon: "achievement_bg_killxenemies_generalsroom" }),`
  );
  return lines;
}

function buildHeroicJs(id, dump) {
  const duration = dumpDuration(dump);
  const majors = dumpMajors(id, dump);
  const majorNames = [...new Set((dump.events || []).filter((e) => isBossMajor(id, e)).map((e) => e.spellName))].join(" · ");
  const phasesJs = phaseList(id, dump).map((p) => `{ t: ${p.t}, id: ${p.id} }`).join(", ");
  return `      heroic: {
        duration: ${duration},
        phases: [${phasesJs}],
        /**
         * Heroic: Viserio bossTimeline (official HC template)
         * majors = Raid AOE / Raid Damage → ${majorNames || "(none)"}
         */
        majorSpellIds: [${majors.join(", ")}],
        events: [
${buildEventLines(id, dump, "          ").join("\n")}
        ],
      },`;
}

function bossAnchor(src, id) {
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
  const nextBoss = src.indexOf("\n    {", start + 8);
  const heroStart = src.indexOf("heroic:", start);
  return { start, insertAt, nextBoss, heroStart };
}

function extractHeroicBlock(src, id) {
  const { start, nextBoss, heroStart } = bossAnchor(src, id);
  if (heroStart < 0 || (nextBoss >= 0 && heroStart > nextBoss)) return "";
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
  if (heroEnd < 0) return "";
  const from = src.lastIndexOf("\n", heroStart);
  return src.slice(from, heroEnd);
}

function upsertHeroic(src, id, block) {
  const { start, insertAt, nextBoss, heroStart } = bossAnchor(src, id);
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
    let after = heroEnd;
    while (src[after] === ",") after += 1;
    return src.slice(0, from) + "\n" + block + src.slice(after);
  }
  return src.slice(0, insertAt) + "\n" + block + src.slice(insertAt);
}

function buildBoss(id, dump) {
  const meta = META[id];
  if (!meta) throw new Error(`no meta for ${id}`);
  const duration = dumpDuration(dump);
  const majorSpellIds = dumpMajors(id, dump);
  const lines = buildEventLines(id, dump, "        ");

  const npcLine = meta.npcId != null ? `\n      npcId: ${meta.npcId},` : "";
  const majorsList = majorSpellIds.join(", ");
  const majorNames = [...new Set((dump.events || []).filter((e) => isBossMajor(id, e)).map((e) => e.spellName))].join(" · ");

  return `    {
      id: "${id}",
      journalId: ${meta.journalId},${npcLine}
      wclEncounterId: ${meta.wclEncounterId === null ? "null" : meta.wclEncounterId},
      wclDifficulty: 5,
      order: ${meta.order},
      name: "${esc(meta.name)}",
      nameKo: "${esc(meta.nameKo)}",
      duration: ${duration},
      /** 이 타임라인 기준 페이즈 전환 (id = WCL 페이즈 번호) */
      phases: [${phaseList(id, dump).map((p) => `{ t: ${p.t}, id: ${p.id} }`).join(", ")}],
      iconUrl: bossIcon("${meta.iconSlug}"),
      /**
       * Mythic: Viserio bossTimeline
       * majors = Raid AOE / Raid Damage → ${majorNames || "(none)"}
       */
      majorSpellIds: [${majorsList}],
      events: [
${lines.join("\n")}
      ],
    }`;
}

const dumps = Object.keys(META).map((id) => {
  const file = path.join(dumpDir, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing dump ${file}`);
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return { id, dump: JSON.parse(raw) };
});

let src = fs.readFileSync(catalogPath, "utf8");

if (heroic) {
  for (const { id, dump } of dumps) src = upsertHeroic(src, id, buildHeroicJs(id, dump));
} else {
  const keptHeroic = Object.fromEntries(Object.keys(META).map((id) => [id, extractHeroicBlock(src, id)]));
  const bossesJs = `  const BOSSES = [\n${dumps.map(({ id, dump }) => buildBoss(id, dump)).join(",\n")},\n  ];`;
  const start = src.indexOf("  const BOSSES = [");
  const end = src.indexOf("\n  const STUB_CATALOG");
  if (start < 0 || end < 0) throw new Error("BOSSES block not found");
  src = src.slice(0, start) + bossesJs + src.slice(end);
  for (const id of Object.keys(META)) {
    if (keptHeroic[id]) src = upsertHeroic(src, id, keptHeroic[id].trim());
  }
}

src = src.replace(/version: \d+/, "version: 7");
try {
  new Function(src);
} catch (e) {
  throw new Error("catalog syntax error after import: " + e.message);
}
fs.writeFileSync(catalogPath, src, "utf8");

console.log("Updated", catalogPath, heroic ? "(heroic)" : "(mythic)");
for (const { id, dump } of dumps) {
  console.log(
    `- ${id}: ${dump.events?.length || 0} events, majors=[${dumpMajors(id, dump).join(",")}], end=${dump.timelineEnd}`
  );
}
