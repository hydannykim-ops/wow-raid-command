/**
 * Import Viserio Mythic bossTimeline dumps into planner-catalog.js
 * Majors = types includes "Raid AOE" | "Raid Damage"
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dumpDir = path.join(root, "tmp-viserio");
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

/** Viserio 타임라인 기준 페이즈 전환 시각 (scripts/derive-phase-starts.mjs 로 생성) */
const phasePath = path.join(__dirname, "phase-starts.json");
const PHASES = fs.existsSync(phasePath) ? JSON.parse(fs.readFileSync(phasePath, "utf8")) : {};

function phaseList(id) {
  const info = PHASES[id];
  const starts = info?.phaseStarts || [];
  if (!starts.length) return [];
  const idsFromSample = (info.samples || [])
    .map((s) => s.split(" ").map((x) => Number(x.split("@")[0])))
    .find((ids) => ids.length >= starts.length) || [];
  return starts.map((s, i) => ({ t: s.t, id: idsFromSample[s.index] ?? i + 2 }));
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

function buildBoss(id, dump) {
  const meta = META[id];
  if (!meta) throw new Error(`no meta for ${id}`);
  const duration = Math.round(Number(dump.timelineEnd) || Number(dump.fightEnd) || 480);
  const majorSpellIds = [...new Set((dump.events || []).filter((e) => isBossMajor(id, e)).map((e) => Number(e.spellId)))];
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
  lines.push(`        ev({ id: "pull", t: 0, name: "Pull", nameKo: "풀", type: "phase", icon: "ability_warrior_charge" }),`);

  for (const e of raw) {
    const name = e.spellName || `Spell ${e.spellId}`;
    const nameKo = KO[e.spellId] || name;
    const types = e.types || [];
    const major = isBossMajor(id, e);
    const type = mapType(types);
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
    lines.push(`        ev({ ${parts.join(", ")} }),`);
  }

  lines.push(
    `        ev({ id: "fight-end", t: ${duration}, name: "Fight End", nameKo: "전투 종료", type: "enrage", icon: "achievement_bg_killxenemies_generalsroom" }),`
  );

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
      phases: [${phaseList(id).map((p) => `{ t: ${p.t}, id: ${p.id} }`).join(", ")}],
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

const bossesJs = `  const BOSSES = [\n${dumps.map(({ id, dump }) => buildBoss(id, dump)).join(",\n")},\n  ];`;

let src = fs.readFileSync(catalogPath, "utf8");
const start = src.indexOf("  const BOSSES = [");
const end = src.indexOf("\n  const STUB_CATALOG");
if (start < 0 || end < 0) throw new Error("BOSSES block not found");
src = src.slice(0, start) + bossesJs + src.slice(end);
src = src.replace(/version: \d+/, "version: 5");
fs.writeFileSync(catalogPath, src, "utf8");

console.log("Updated", catalogPath);
for (const { id, dump } of dumps) {
  console.log(
    `- ${id}: ${dump.events?.length || 0} events, majors=[${[...new Set((dump.events || []).filter((e) => isBossMajor(id, e)).map((e) => e.spellId))].join(",")}], end=${dump.timelineEnd}`
  );
}
