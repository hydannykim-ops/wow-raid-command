const DATA = window.RAID_DATA || { raid: { specs: [], synergies: [], roles: [] }, balance: {}, classes: {} };
if (!window.RAID_DATA || !window.RAID_DATA.raid) {
  console.error("레이드 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
}
const S = DATA.raid.specs;
const SY = DATA.raid.synergies;
const ROLES = DATA.raid.roles;
const BAL = DATA.balance;
const CLS = DATA.classes;
const CLASS_ORDER = [
  "Death Knight",
  "Demon Hunter",
  "Druid",
  "Evoker",
  "Hunter",
  "Mage",
  "Monk",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
];

const BLOODLUST_NAME = "Bloodlust / Heroism";

function normalizeBloodlust() {
  const bloodlust = SY.find((x) => x.name === BLOODLUST_NAME || x.id === "bloodlust");
  if (!bloodlust) return;

  bloodlust.providers = [
    ...new Set([
      ...(bloodlust.providers || []),
      "Shaman",
      "Mage",
      "Evoker",
      "Hunter",
    ]),
  ];

  S.filter((s) => bloodlust.providers.includes(s.class)).forEach((s) => {
    if (!s.synergies.includes(bloodlust.name)) s.synergies.push(bloodlust.name);
  });

  bloodlust.providerSpecs = S.filter((s) => bloodlust.providers.includes(s.class));
}

normalizeBloodlust();

let roster = [];
let instanceSeq = 0;
let filter = "All";
let lang = "ko";
let allSynergiesDone = false;
let celebrateTimer = null;
let aiRecOpen = false;
let applicants = [];

const $ = (x) => document.getElementById(x);

const T = {
  ko: {
    title: "WoW 레이드 구인 도우미",
    homeTitle: "레이드 커맨드",
    homeSub: "공대 구성, 쿨기, 오더를 나눠 두었습니다.",
    enter: "열기",
    backHome: "명령 본부로",
    settingsLabel: "설정",
    langLabel: "언어",
    factionLabel: "진영",
    helperTab: "구인 도우미",
    helperDesc: "빠진 시너지를 보면서 자리를 채웁니다.",
    plannerTab: "레이드 플래너",
    plannerDesc: "보스 타임라인에 생존기와 오더를 올립니다.",
    plannerTitle: "레이드 플래너",
    gameTab: "구인 Game",
    gameDesc: "인재풀과 AI 공대 레이스는 아직 열리지 않았습니다.",
    gameSoonBadge: "준비중",
    gameSoon: "구인 게임을 준비하고 있습니다.",
    plazaTab: "커뮤니티",
    plazaDesc: "광장과 게시판은 아직 열리지 않았습니다.",
    plazaSoonBadge: "준비중",
    plazaSoon: "오그리마 광장과 게시판을 준비하고 있습니다.",
    plazaTitle: "커뮤니티",
    specTitle: "전문화 선택",
    specSub: "전문화를 클릭해 파티에 추가하거나 제거하세요.",
    specSubAi: "AI도우미가 열린 동안 전문화를 클릭하면 신청온 사람에 올라갑니다.",
    search: "직업 / 전문화 검색",
    clear: "초기화",
    raidTitle: "레이드 구성",
    raidSub: "탱커·근딜·원딜·힐 역할별 슬롯",
    size: "인원",
    synTitle: "시너지 표",
    synSub: "미충족 시너지가 위에 먼저 보이며, 필요한 직업을 강조해 표시합니다.",
    synTip:
      "미활성 시너지에 필요한 직업이 강조됩니다. 활성 시너지는 충족 직업 색으로만 점등됩니다.",
    comingTitle: "구인 Game",
    comingSub: "1000명 인재풀과 AI 공대 10개가 레이스합니다.",
    loginBnet: "Battle.net 로그인",
    loginLocal: "로컬 테스트 로그인",
    logout: "로그아웃",
    needJob: "필요 직업",
    coveredBy: "충족",
    celebrateTitle: "시너지 완성!",
    celebrateSub: "모든 시너지를 충족했습니다. 공대 구성 축하드립니다!",
    synComplete: "전 시너지 충족 · 구성 완료!",
    aiRecBtn: "AI도우미",
    aiHelp:
      "현재 구인 인원수에 맞춰 추천 직업을 알려주고, 신청온 직업을 올려두면 받아도 될지 아닐지 조언을 해줍니다.",
    aiRecClose: "닫기",
    planRaidTitle: "공대가 가득 찼습니다",
    planRaidSub: "이 조합으로 바로 레이드 플랜을 짤 수 있습니다.",
    planRaidBtn: "이 파티로 레이드플랜 짜러가기",
  },
  en: {
    title: "WoW Raid Recruiting Helper",
    homeTitle: "Raid Command",
    homeSub: "Roster, cooldowns, and callouts live in separate rooms.",
    enter: "Open",
    backHome: "Command hub",
    settingsLabel: "Settings",
    langLabel: "Language",
    factionLabel: "Faction",
    helperTab: "Recruiting Helper",
    helperDesc: "Fill the raid while watching which synergies are still open.",
    plannerTab: "Raid Planner",
    plannerDesc: "Put defensives and callouts on the boss timeline.",
    plannerTitle: "Raid Planner",
    gameTab: "Recruiting Game",
    gameDesc: "The talent-pool race is still closed.",
    gameSoonBadge: "Soon",
    gameSoon: "The recruiting game is not open yet.",
    plazaTab: "Community",
    plazaDesc: "The plaza and boards are still closed.",
    plazaSoonBadge: "Soon",
    plazaSoon: "The plaza and boards are not open yet.",
    plazaTitle: "Community",
    specTitle: "Choose Specialization",
    specSub: "Click a specialization to add or remove it from the raid.",
    specSubAi: "While AI Helper is open, clicking a spec queues an applicant.",
    search: "Search class / specialization",
    clear: "Clear",
    raidTitle: "Raid Roster",
    raidSub: "Slots grouped by tank, melee, ranged and healer",
    size: "Size",
    synTitle: "Synergy Table",
    synSub: "Missing synergies appear first, with required classes highlighted.",
    synTip:
      "Inactive synergies highlight required classes. Active ones only tint with the covering class color.",
    comingTitle: "Recruiting Game",
    comingSub: "Race 10 AI raids using a pool of 1000 candidates.",
    loginBnet: "Log in with Battle.net",
    loginLocal: "Local test login",
    logout: "Log out",
    needJob: "Required",
    coveredBy: "Covered by",
    celebrateTitle: "Synergies Complete!",
    celebrateSub: "Every raid synergy is covered. Congratulations!",
    synComplete: "All synergies covered · Ready!",
    aiRecBtn: "AI Helper",
    aiHelp:
      "Suggests classes for the current raid size, and advises whether to accept a spec you queue as an applicant.",
    aiRecClose: "Close",
    planRaidTitle: "The raid is full",
    planRaidSub: "Take this roster into the raid planner.",
    planRaidBtn: "Plan this raid",
  },
};

function tr(k) {
  return T[lang][k] || k;
}

function tx(ko, en) {
  return lang === "ko" ? ko : en;
}

function role(r) {
  return lang === "ko"
    ? { Tank: "탱커", Melee: "근딜", Ranged: "원딜", Heal: "힐" }[r]
    : r;
}

function displaySpec(s) {
  return lang === "ko" ? s.specKo : s.spec;
}

function displayClass(s) {
  return lang === "ko" ? s.classKo : s.class;
}

function displayClassName(className) {
  return lang === "ko" ? CLS[className]?.[0] || className : className;
}

function classColor(className) {
  return CLS[className]?.[1] || "#8ec5ff";
}

function isBloodlust(syn) {
  return syn.id === "bloodlust" || syn.name === BLOODLUST_NAME;
}

const CORE_CLASSES = [
  "Mage",
  "Druid",
  "Hunter",
  "Warrior",
  "Monk",
  "Demon Hunter",
  "Shaman",
];
const CORE_CLASS_SET = new Set(CORE_CLASSES);
const OPTIONAL_SYNERGIES = [
  { class: "Rogue", synKo: "위축의 독", synEn: "Atrophic Poison" },
  { class: "Paladin", synKo: "헌신의 오라", synEn: "Devotion Aura" },
  { class: "Priest", synKo: "신의 권능: 인내", synEn: "Power Word: Fortitude" },
  { class: "Evoker", synKo: "청동의 축복", synEn: "Blessing of the Bronze" },
];
const OPTIONAL_CLASSES = OPTIONAL_SYNERGIES.map((x) => x.class);
const OPTIONAL_CLASS_SET = new Set(OPTIONAL_CLASSES);
const CLASS_ROLES = new Map();
for (const s of S) {
  let roles = CLASS_ROLES.get(s.class);
  if (!roles) {
    roles = new Set();
    CLASS_ROLES.set(s.class, roles);
  }
  roles.add(s.role);
}
const CORE_DPS_PREF = {
  Mage: "Ranged",
  Druid: "Ranged",
  Hunter: "Ranged",
  Warrior: "Melee",
  Monk: "Melee",
  "Demon Hunter": "Melee",
  Shaman: "Ranged",
};
const MELEE_CORE_ORDER = ["Warrior", "Monk", "Demon Hunter"];
const MELEE_SYN_NEEDS = [
  ["Warrior", 1],
  ["Rogue", 1],
  ["Death Knight", 2],
  ["Paladin", 1],
  ["Demon Hunter", 1],
  ["Monk", 1],
];
const RANGED_SYN_NEEDS = [
  ["Mage", 1],
  ["Hunter", 1],
  ["Shaman", 1],
  ["Warlock", 2],
  ["Evoker", 1],
  ["Druid", 1],
  ["Priest", 1],
];
const HEAL_SYN_NEEDS = [
  ["Druid", 1],
  ["Monk", 1],
  ["Shaman", 1],
  ["Paladin", 1],
  ["Priest", 1],
  ["Evoker", 1],
];
const NON_MELEE_SYNERGY = ["Mage", "Evoker", "Warlock", "Hunter"];
const DK_WL_TARGET = 2;
const GROW_CYCLE = ["Heal", "Melee", "Ranged", "Ranged", "Ranged"];
const CORE_ALT_SPEC = {
  Monk: { Tank: ["양조", "Brewmaster"], Heal: ["운무", "Mistweaver"], Melee: ["풍운", "Windwalker"] },
  Warrior: { Tank: ["방어", "Protection"], Melee: ["무기·분노", "Arms / Fury"] },
  Druid: {
    Tank: ["수호", "Guardian"],
    Heal: ["회복", "Restoration"],
    Melee: ["야성", "Feral"],
    Ranged: ["조화", "Balance"],
  },
  "Demon Hunter": {
    Tank: ["복수", "Vengeance"],
    Melee: ["파멸", "Havoc"],
    Ranged: ["포식", "Devourer"],
  },
  Shaman: { Heal: ["복원", "Restoration"], Melee: ["고양", "Enhancement"], Ranged: ["정기", "Elemental"] },
  Hunter: { Melee: ["생존", "Survival"], Ranged: ["야수·사격", "Beast Mastery / Marksmanship"] },
  Paladin: { Tank: ["보호", "Protection"], Heal: ["신성", "Holy"], Melee: ["징벌", "Retribution"] },
  "Death Knight": { Tank: ["혈기", "Blood"], Melee: ["냉기·부정", "Frost / Unholy"] },
  Mage: { Ranged: ["비전·화염·냉기", "Arcane / Fire / Frost"] },
  Priest: { Heal: ["수양·신성", "Discipline / Holy"], Ranged: ["암흑", "Shadow"] },
  Evoker: { Heal: ["보존", "Preservation"], Ranged: ["황폐·증강", "Devastation / Augmentation"] },
};

const TARGET_BY_SIZE = new Map();
function targetComposition(size) {
  let t = TARGET_BY_SIZE.get(size);
  if (t) return t;
  t = {
    Tank: BAL.reservedTank ?? 2,
    Heal: 4,
    DPS: 14,
    Melee: 6,
    Ranged: 8,
  };
  const extra = Math.max(0, size - 20);
  for (let i = 0; i < extra; i++) {
    const r = GROW_CYCLE[i % GROW_CYCLE.length];
    t[r]++;
    if (r === "Melee" || r === "Ranged") t.DPS++;
  }
  TARGET_BY_SIZE.set(size, t);
  return t;
}

function dpsCountOf(counts) {
  return (counts.Melee || 0) + (counts.Ranged || 0);
}

function classHasRole(className, role) {
  return CLASS_ROLES.get(className)?.has(role) || false;
}

function classHasDps(className) {
  return classHasRole(className, "Melee") || classHasRole(className, "Ranged");
}

function canFillAsRanged(spec) {
  return spec.role === "Melee" && classHasRole(spec.class, "Ranged");
}

function classCountOf(className) {
  let n = 0;
  for (const s of roster) if (s.class === className) n++;
  return n;
}

function synStillNeeded(needs) {
  return needs.reduce((n, [c, want]) => n + Math.max(0, want - classCountOf(c)), 0);
}

function fillsOpenSyn(spec, needs) {
  const row = needs.find(([c]) => c === spec.class);
  return !!row && classCountOf(spec.class) < row[1];
}

function synNeededAfter(spec, needs) {
  return Math.max(0, synStillNeeded(needs) - (fillsOpenSyn(spec, needs) ? 1 : 0));
}

function canFillRoleSynAfter(role, spec, nextCounts, target, needs) {
  const left = Math.max(0, target[role] - (nextCounts[role] || 0));
  return left >= synNeededAfter(spec, needs);
}

function coveredNow() {
  return new Set(roster.map((r) => r.class));
}

function classChip(className) {
  return `<span class="provider need ai-class-chip" data-ai-class="${className}" style="--class:${classColor(className)}">${displayClassName(className)}</span>`;
}

function classChipList(classNames) {
  return classNames.map(classChip).join(", ");
}

function allocateSlots(size, counts, filled = roster.length) {
  const target = targetComposition(size);
  const dps = dpsCountOf(counts);
  const need = {
    Tank: Math.max(0, target.Tank - counts.Tank),
    Heal: Math.max(0, target.Heal - counts.Heal),
    DPS: Math.max(0, target.DPS - dps),
    Melee: Math.max(0, target.Melee - counts.Melee),
    Ranged: Math.max(0, target.Ranged - counts.Ranged),
  };
  const over = {
    Tank: Math.max(0, counts.Tank - target.Tank),
    Heal: Math.max(0, counts.Heal - target.Heal),
    DPS: Math.max(0, dps - target.DPS),
    Melee: Math.max(0, counts.Melee - target.Melee),
    Ranged: Math.max(0, counts.Ranged - target.Ranged),
  };
  let remain = Math.max(0, size - filled);
  const alloc = { Tank: 0, Heal: 0, Melee: 0, Ranged: 0, DPS: 0 };
  for (const r of ["Tank", "Heal"]) {
    const take = Math.min(need[r], remain);
    alloc[r] = take;
    remain -= take;
  }
  alloc.DPS = remain;
  alloc.flex = 0;
  return { target, need, over, alloc, empty: Math.max(0, size - filled) };
}

function coreFitsRemaining(className, alloc) {
  if (alloc.flex > 0 || alloc.DPS > 0) return true;
  return ROLES.some((r) => alloc[r] > 0 && classHasRole(className, r));
}

function remainBits(alloc, missingCore) {
  const bits = [];
  if (alloc.Tank) {
    bits.push(lang === "ko" ? `탱${alloc.Tank}` : `${alloc.Tank} tank`);
  }
  if (alloc.Heal) {
    bits.push(lang === "ko" ? `힐${alloc.Heal}` : `${alloc.Heal} heal`);
  }
  const dpsLeft = alloc.DPS || alloc.flex;
  if (dpsLeft) {
    bits.push(
      lang === "ko"
        ? `${missingCore.length ? "" : "아무 "}딜${dpsLeft}`
        : `${dpsLeft} ${missingCore.length ? "DPS" : "any DPS"}`
    );
  }
  return bits;
}

function nowPicks(alloc, missingCore, needDk, needWl) {
  const slot = {
    Tank: alloc.Tank,
    Heal: alloc.Heal,
    Melee: alloc.Melee,
    Ranged: alloc.Ranged,
    DPS: alloc.DPS,
    flex: alloc.flex,
  };
  const picks = [];

  function consume(roles, count) {
    let n = 0;
    for (let i = 0; i < count; i++) {
      const role = roles.find((r) => slot[r] > 0);
      if (!role) break;
      slot[role]--;
      n++;
    }
    return n;
  }

  function rolesFor(className) {
    const roles = [];
    if (slot.Tank > 0 && classHasRole(className, "Tank")) roles.push("Tank");
    if (slot.Heal > 0 && classHasRole(className, "Heal")) roles.push("Heal");
    const pref = CORE_DPS_PREF[className];
    if (pref && classHasRole(className, pref) && slot[pref] > 0) roles.push(pref);
    if (slot.DPS > 0 && classHasDps(className)) roles.push("DPS");
    if (slot.flex > 0) roles.push("flex");
    return roles;
  }

  for (const c of missingCore) {
    const n = consume(rolesFor(c), 1);
    if (n) picks.push({ class: c, n, kind: "core" });
  }

  if (needDk) {
    const n = consume(["Tank", "Melee", "DPS", "flex"], needDk);
    if (n) picks.push({ class: "Death Knight", n, kind: "stack" });
  }
  if (needWl) {
    const n = consume(["Ranged", "DPS", "flex"], needWl);
    if (n) picks.push({ class: "Warlock", n, kind: "stack" });
  }
  return picks;
}

function recPhrase(picks) {
  if (!picks.length) return "";
  const names = picks.map((p) =>
    lang === "ko"
      ? `${displayClassName(p.class)}${p.n > 1 ? ` ${p.n}명` : ""}`
      : `${displayClassName(p.class)}${p.n > 1 ? ` x${p.n}` : ""}`
  );
  if (names.length > 4) {
    return lang === "ko"
      ? `${names.slice(0, 4).join(", ")} 등`
      : `${names.slice(0, 4).join(", ")}, …`;
  }
  return names.join(", ");
}

function altSpecName(className, roleName) {
  const pair = CORE_ALT_SPEC[className]?.[roleName];
  if (!pair) return role(roleName);
  return lang === "ko" ? pair[0] : pair[1];
}

function hasBatchim(word) {
  const ch = word.charCodeAt(word.length - 1);
  return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
}

function forcedSpecPhrase(className, roles) {
  const names = roles.map((r) => altSpecName(className, r));
  if (lang !== "ko") return names.join(" / ");
  if (names.length === 1) return names[0];
  let s = names[0];
  for (let i = 1; i < names.length; i++) {
    s += (hasBatchim(names[i - 1]) ? "이나 " : "나 ") + names[i];
  }
  return s;
}

function tankHealForceState(rem, covered) {
  const missing = CORE_CLASSES.filter((c) => !covered.has(c) && classHasDps(c));
  const overflow = Math.max(0, missing.length - rem.dpsLeft);
  const parts = overflow
    ? missing
        .map((c) => {
          const alts = [];
          if (classHasRole(c, "Tank") && rem.tankLeft > 0) alts.push("Tank");
          if (classHasRole(c, "Heal") && rem.healLeft > 0) alts.push("Heal");
          return alts.length ? { className: c, alts } : null;
        })
        .filter(Boolean)
    : [];
  return { overflow, parts };
}

function forceTankHealAdvice(parts) {
  const who = parts
    .map((p) => {
      const specName = forcedSpecPhrase(p.className, p.alts);
      return lang === "ko"
        ? `${classChip(p.className)}는 ${specName}`
        : `${classChip(p.className)} as ${specName}`;
    })
    .join(", ");
  return tx(
    `이 사람을 받으면 딜러 자리가 부족해서 ${who}로 받아가야 합니다.`,
    `If you take this player, not enough DPS slots would be left, so ${who} would have to come.`
  );
}

function roleCountsNow() {
  const c = { Tank: 0, Melee: 0, Ranged: 0, Heal: 0 };
  for (const s of roster) c[s.role]++;
  return c;
}

function stackRoomAfter(nextCounts, nextEmpty, target) {
  const tankLeft = Math.max(0, target.Tank - nextCounts.Tank);
  const healLeft = Math.max(0, target.Heal - nextCounts.Heal);
  return {
    tankLeft,
    healLeft,
    dpsLeft: Math.max(0, nextEmpty - tankLeft - healLeft),
  };
}

function nonMeleeSynergyDps(rem, covered) {
  let heal = rem.healLeft;
  let n = 0;
  for (const c of NON_MELEE_SYNERGY) {
    if (covered.has(c)) continue;
    if (classHasRole(c, "Heal") && heal > 0) {
      heal--;
      continue;
    }
    n++;
  }
  return n;
}

function fullRaidMeleeRanged(nextCounts, rem, covered, needDk) {
  let melee = nextCounts.Melee;
  let ranged = nextCounts.Ranged;
  let dpsLeft = rem.dpsLeft;
  const addRanged = Math.min(nonMeleeSynergyDps(rem, covered), dpsLeft);
  ranged += addRanged;
  dpsLeft -= addRanged;
  const meleeSynLeft =
    MELEE_CORE_ORDER.filter((c) => !covered.has(c)).length + needDk;
  const addMelee = Math.min(meleeSynLeft, dpsLeft);
  melee += addMelee;
  dpsLeft -= addMelee;
  ranged += dpsLeft;
  return { melee, ranged };
}

function closedSlotWhy(rem) {
  const noHeal = rem.healLeft === 0;
  const noTank = rem.tankLeft === 0;
  if (noHeal && noTank) {
    return { ko: "탱커·힐러 자리가 없어서", en: "no tank or healer slot would be left" };
  }
  if (noHeal) return { ko: "힐러 자리가 없어서", en: "no healer slot would be left" };
  if (noTank) return { ko: "탱커 자리가 없어서", en: "no tank slot would be left" };
  return { ko: "자리가 없어서", en: "no matching slot would be left" };
}

function mustComeAsMsg(className, specKo, specEn, rem) {
  const chip = classChip(className);
  const why = closedSlotWhy(rem);
  return tx(
    `이 사람을 받으면 ${why.ko} ${chip}는 ${specKo}로 받아가야 합니다.`,
    `If you take this player, ${why.en}, so a ${chip} would have to come as ${specEn}.`
  );
}

function forcedDpsSpecMsgs(rem, covered, blocked) {
  const skip = blocked instanceof Set ? blocked : new Set();
  const open = (className) => !covered.has(className) && !skip.has(className);
  const msgs = [];
  if (rem.dpsLeft <= 0) return msgs;
  if (rem.healLeft === 0) {
    if (open("Priest")) msgs.push(mustComeAsMsg("Priest", "암사", "Shadow", rem));
    if (open("Evoker")) {
      msgs.push(mustComeAsMsg("Evoker", "황폐나 증강", "Devastation / Augmentation", rem));
    }
    if (open("Shaman")) {
      msgs.push(mustComeAsMsg("Shaman", "정기나 고양", "Elemental / Enhancement", rem));
    }
    if (open("Druid")) {
      msgs.push(
        rem.tankLeft === 0
          ? mustComeAsMsg("Druid", "야성이나 조화", "Feral / Balance", rem)
          : mustComeAsMsg("Druid", "수호나 야성이나 조화", "Guardian / Feral / Balance", rem)
      );
    }
    if (open("Paladin")) {
      msgs.push(
        rem.tankLeft === 0
          ? mustComeAsMsg("Paladin", "징벌", "Retribution", rem)
          : mustComeAsMsg("Paladin", "보호나 징벌", "Protection / Retribution", rem)
      );
    }
  }
  if (!open("Monk")) return msgs;
  if (rem.tankLeft === 0 && rem.healLeft === 0) {
    msgs.push(mustComeAsMsg("Monk", "풍운", "Windwalker", rem));
  } else if (rem.tankLeft === 0) {
    msgs.push(mustComeAsMsg("Monk", "운무나 풍운", "Mistweaver or Windwalker", rem));
  } else if (rem.healLeft === 0) {
    msgs.push(mustComeAsMsg("Monk", "양조나 풍운", "Brewmaster or Windwalker", rem));
  }
  return msgs;
}

function isFillingCore(spec) {
  return CORE_CLASS_SET.has(spec.class) && classCountOf(spec.class) === 0;
}

function isFillingOptional(spec) {
  return OPTIONAL_CLASS_SET.has(spec.class) && classCountOf(spec.class) === 0;
}

function occupySeat(className, room, mode) {
  const takeDps = () => {
    if (room.dps <= 0 || !classHasDps(className)) return false;
    room.dps--;
    return true;
  };
  if (mode === "core") {
    const pref = CORE_DPS_PREF[className];
    if (pref && room.dps > 0 && classHasRole(className, pref)) {
      room.dps--;
      return true;
    }
  } else if (takeDps()) {
    return true;
  }
  if (classHasRole(className, "Heal") && room.heal > 0) {
    room.heal--;
    return true;
  }
  if (classHasRole(className, "Tank") && room.tank > 0) {
    room.tank--;
    return true;
  }
  return mode === "core" && takeDps();
}

function seatRoom(src) {
  return {
    dps: src.dps ?? src.dpsLeft ?? 0,
    tank: src.tank ?? src.tankLeft ?? 0,
    heal: src.heal ?? src.healLeft ?? 0,
  };
}

function seatClasses(roomSrc, classNames, covered, mode) {
  const room = seatRoom(roomSrc);
  const unplaced = [];
  for (const c of classNames) {
    if (covered.has(c)) continue;
    if (!occupySeat(c, room, mode)) unplaced.push(c);
  }
  return { ...room, unplaced };
}

function seatMissingCores(rem, covered) {
  return seatClasses(rem, CORE_CLASSES, covered, "core");
}

function seatMissingOptionals(seated, covered) {
  return seatClasses(seated, OPTIONAL_CLASSES, covered, "opt");
}

function reserveDkWlRoom(seated, dkCount, wlCount) {
  const shared = dkWlShared(seated, dkCount, wlCount);
  if (!shared.ok) {
    return { ok: false, tank: seated.tank, heal: seated.heal, dps: seated.dps };
  }
  const dkTank = Math.min(shared.needDk, seated.tank);
  return {
    ok: true,
    tank: seated.tank - dkTank,
    heal: seated.heal,
    dps: seated.dps - (shared.needDk - dkTank + shared.needWl),
  };
}

function remainingSynAfter(rem, covered, dkCount, wlCount, seatedCores) {
  const seated = seatedCores || seatMissingCores(rem, covered);
  if (seated.unplaced.length) {
    return { ok: false, cores: seated.unplaced, optionals: [], stackOk: false };
  }
  const reserved = reserveDkWlRoom(seated, dkCount, wlCount);
  if (!reserved.ok) {
    return { ok: false, cores: [], optionals: [], stackOk: false };
  }
  const opt = seatMissingOptionals(reserved, covered);
  return {
    ok: opt.unplaced.length === 0,
    cores: [],
    optionals: opt.unplaced,
    stackOk: true,
  };
}

function leftoverSynAdvice(fit) {
  if (!fit.stackOk) {
    return tx(
      "이 사람을 받으면 2죽기·2흑마를 모두 채울 자리가 없습니다.",
      "Taking this player leaves no room for both 2 Death Knights and 2 Warlocks."
    );
  }
  if (fit.optionals.length) {
    return tx(
      `이 사람을 받으면 남는 자리가 없어서 ${classChipList(fit.optionals)} 시너지를 챙겨갈 수 없습니다.`,
      `If you take this player, no slot would be left for ${classChipList(fit.optionals)} synergies.`
    );
  }
  return tx(
    "이 사람을 받으면 남은 시너지를 다 채울 자리가 없습니다.",
    "Taking this player would leave no room to finish remaining synergies."
  );
}

function dkWlShared(seated, dkCount, wlCount) {
  const needDk = Math.max(0, DK_WL_TARGET - dkCount);
  const needWl = Math.max(0, DK_WL_TARGET - wlCount);
  const dkTank = Math.min(needDk, seated.tank);
  const ok = needDk - dkTank + needWl <= seated.dps;
  let dk = dkCount + dkTank;
  let wl = wlCount;
  let dps = seated.dps;
  while (dps > 0 && (dk < DK_WL_TARGET || wl < DK_WL_TARGET)) {
    if (wl < DK_WL_TARGET && wl <= dk) wl++;
    else if (dk < DK_WL_TARGET) dk++;
    else wl++;
    dps--;
  }
  return { dk, wl, ok, needDk, needWl };
}

function dkWlFit(seated, dkCount, wlCount) {
  const shared = dkWlShared(seated, dkCount, wlCount);
  return {
    needDk: shared.ok ? shared.needDk : 0,
    needWl: shared.ok ? shared.needWl : 0,
    dkOk: shared.ok,
    wlOk: shared.ok,
  };
}

function verdict(kind, extra = {}) {
  return {
    verdict: kind,
    deny: extra.deny || [],
    advice: extra.advice || [],
    nice: extra.nice || [],
  };
}

function noSynergySeatMsg(classes) {
  return tx(
    `이 사람을 받으면 ${classChipList(classes)} 시너지를 넣을 자리가 없습니다.`,
    `If you take this player, there is no slot left for ${classChipList(classes)}.`
  );
}

function tankHealSlotDeny(spec, rem) {
  const deny = [];
  if (rem.healLeft > 0 && spec.role !== "Heal") {
    deny.push(tx("이 사람을 받으면 힐러 자리가 없습니다.", "If you take this player, no healer slot would be left."));
  }
  if (rem.tankLeft > 0 && spec.role !== "Tank") {
    deny.push(tx("이 사람을 받으면 탱커 자리가 없습니다.", "If you take this player, no tank slot would be left."));
  }
  if (!deny.length) {
    deny.push(
      tx("이 사람을 받으면 탱커·힐러 자리가 부족합니다.", "If you take this player, too few tank/healer slots would be left.")
    );
  }
  return deny;
}

function dkWlRecommendMsg(spec) {
  const n = classCountOf(spec.class);
  if (spec.class === "Death Knight" && n < DK_WL_TARGET) {
    return n === 0
      ? tx("죽기 1명은 필수 시너지급입니다. 지금 받으면 좋습니다.", "The first Death Knight is required-tier. Good to take now.")
      : tx("2죽기를 채웁니다. 지금 받으면 좋습니다.", "This completes 2 Death Knights. Good to take now.");
  }
  if (spec.class === "Warlock" && n < DK_WL_TARGET) {
    return n === 0
      ? tx("흑마 1명은 필수 시너지급입니다. 지금 받으면 좋습니다.", "The first Warlock is required-tier. Good to take now.")
      : tx("2흑마를 채웁니다. 지금 받으면 좋습니다.", "This completes 2 Warlocks. Good to take now.");
  }
  return "";
}

function synergyOfClass(className) {
  return SY.find((s) => (s.providers || []).includes(className));
}

function synergyFillReason(className) {
  const syn = synergyOfClass(className);
  if (!syn) return "";
  const labels = {
    mystic_touch: ["물리 시너지", "a physical synergy"],
    chaos_brand: ["마법 시너지", "a magic synergy"],
    battle_shout: ["공격력 시너지", "an attack-power synergy"],
    arcane_intellect: ["지능 시너지", "an intellect synergy"],
  }[syn.id];
  if (labels) {
    return tx(`${labels[0]}를 채워줍니다.`, `This fills ${labels[1]}.`);
  }
  const name = lang === "ko" ? syn.nameKo : syn.name;
  return tx(`${name} 시너지를 채워줍니다.`, `This fills ${name}.`);
}

function roleRoomReason(spec, nextCounts, target) {
  if (spec.role === "Tank" && nextCounts.Tank <= target.Tank) {
    return tx("탱커 자리에 여유가 있습니다.", "There is still room for a tank.");
  }
  if (spec.role === "Heal" && nextCounts.Heal <= target.Heal) {
    return tx("힐러 자리에 여유가 있습니다.", "There is still room for a healer.");
  }
  if (spec.role === "Melee" && nextCounts.Melee <= target.Melee) {
    return tx("근딜 자리에 여유가 있습니다.", "There is still room in melee.");
  }
  if (spec.role === "Ranged" && nextCounts.Ranged <= target.Ranged) {
    return tx("원딜 자리에 여유가 있습니다.", "There is still room in ranged.");
  }
  return "";
}

function recommendWhy(spec, fillingCore, fillingOpt, nextCounts, target) {
  const reasons = [];
  if (fillingCore || fillingOpt) {
    const syn = synergyFillReason(spec.class);
    if (syn) reasons.push(syn);
  }
  const room = roleRoomReason(spec, nextCounts, target);
  if (room) reasons.push(room);
  if (!reasons.length) reasons.push(tx("지금 받으면 좋습니다.", "Good to take now."));
  return reasons;
}

function meleeCapOf(size, target) {
  const extra = size >= 30 ? 3 : size >= 25 ? 2 : 1;
  return target.Melee + extra;
}

const MELEE_PLAN_CLASSES = ["Rogue", "Warrior", "Monk", "Demon Hunter"];

function meleeCountOf(className) {
  let n = 0;
  for (const s of roster) if (s.class === className && s.role === "Melee") n++;
  return n;
}

function designatedMeleeAfter(spec) {
  let n = 0;
  for (const c of MELEE_PLAN_CLASSES) {
    if (meleeCountOf(c) + (spec.class === c ? 1 : 0) > 0) n += 1;
  }
  if (meleeCountOf("Death Knight") + (spec.class === "Death Knight" ? 1 : 0) > 0) n += 1;
  return n;
}

function fillsMissingClassSynergy(spec) {
  if (classCountOf(spec.class) > 0) return false;
  return (spec.synergies || []).some((name) => {
    if (name === BLOODLUST_NAME) return false;
    const syn = SY.find((s) => s.name === name);
    return syn && !isSynergyCovered(syn);
  });
}

function guaranteedMeleeSeat(spec) {
  if (spec.role !== "Melee") return false;
  if (spec.class !== "Death Knight" && !MELEE_PLAN_CLASSES.includes(spec.class)) return false;
  return classCountOf(spec.class) === 0;
}

function raidSynergiesCovered() {
  return SY.every((syn) => isSynergyCovered(syn));
}

function secondDeathKnight(spec) {
  return spec.class === "Death Knight" && classCountOf("Death Knight") >= 1;
}

function meleeSeventh(spec) {
  if (guaranteedMeleeSeat(spec)) return false;
  if (secondDeathKnight(spec)) return true;
  if (MELEE_PLAN_CLASSES.includes(spec.class)) return false;
  return fillsMissingClassSynergy(spec);
}

function meleeFlexSeats(target) {
  return Math.max(0, target.Melee - 5);
}

// 근딜 자리는 규모별 목표(20인 6, 30인 8)를 따른다.
// 비어 있는 도적·전사·죽기·풍운·파멸은 항상 받는다.
// 시너지가 모두 찼으면 목표 인원까지 아무 근딜이나 추천하고, 그 다음은 두 번째 죽기만 받는다.
// 시너지가 남아 있으면 위 다섯 직업과 남은 여유 자리까지이고, 한 명 추가는 두 번째 죽기나 없는 시너지다.
function meleeOverPlan(spec, nextMelee, target) {
  if (guaranteedMeleeSeat(spec)) return false;
  if (raidSynergiesCovered()) {
    return nextMelee > target.Melee + (secondDeathKnight(spec) ? 1 : 0);
  }
  const allowed = designatedMeleeAfter(spec) + meleeFlexSeats(target) + (meleeSeventh(spec) ? 1 : 0);
  return nextMelee > allowed;
}

function meleePlanAdvice(spec, nextCounts, target) {
  const roles = [];
  if (classHasRole(spec.class, "Tank") && nextCounts.Tank < target.Tank) roles.push("Tank");
  if (classHasRole(spec.class, "Heal") && nextCounts.Heal < target.Heal) roles.push("Heal");
  if (canFillAsRanged(spec)) roles.push("Ranged");
  if (!roles.length) {
    return tx("근딜이 많습니다.", "Melee is already crowded.");
  }
  const alt = forcedSpecPhrase(spec.class, roles);
  const particle = lang === "ko" && hasBatchim(alt) ? "으로" : "로";
  return tx(
    `근딜이 많습니다. ${alt}${particle} 받으면 근딜을 늘리지 않습니다.`,
    `Melee is already crowded. As ${alt}, they would not add a melee.`
  );
}

function extraMeleeAdvice(nextCounts, rem, covered, needDk, meleeCap) {
  if (nextCounts.Melee > meleeCap) {
    return tx(
      `근딜이 ${nextCounts.Melee}명으로 한도를 초과합니다.`,
      `Melee would be ${nextCounts.Melee}, over the cap.`
    );
  }
  const full = fullRaidMeleeRanged(nextCounts, rem, covered, needDk);
  if (full.melee > full.ranged) {
    return tx(
      "이 사람을 받고 근딜로 시너지를 다 채우면 풀파티에서 근딜이 원딜보다 많아질 수 있습니다.",
      "If you take this player and fill remaining melee synergies as melee, melee could outnumber ranged in a full raid."
    );
  }
  return "";
}

function evaluateApplicant(spec) {
  const size = +$("raidSize").value;
  const target = targetComposition(size);
  const counts = roleCountsNow();

  if (roster.length >= size) {
    return verdict("deny", { deny: [tx("공대가 가득 찼습니다.", "The raid is already full.")] });
  }
  if ((spec.role === "Tank" || spec.role === "Heal") && counts[spec.role] >= target[spec.role]) {
    return verdict("deny", {
      deny: [
        tx(
          `${displaySpec(spec)}을 채용할 시 권장 ${role(spec.role)} 수가 초과됩니다.`,
          `Hiring ${displaySpec(spec)} would exceed the recommended ${spec.role} count.`
        ),
      ],
    });
  }

  const nextCounts = { ...counts, [spec.role]: counts[spec.role] + 1 };
  const nextEmpty = Math.max(0, size - (roster.length + 1));
  const rem = stackRoomAfter(nextCounts, nextEmpty, target);
  if (nextEmpty < rem.tankLeft + rem.healLeft) {
    return verdict("deny", { deny: tankHealSlotDeny(spec, rem) });
  }

  const nowCovered = coveredNow();
  const covered = new Set(nowCovered);
  covered.add(spec.class);
  const seated = seatMissingCores(rem, covered);
  if (seated.unplaced.length) {
    return verdict("deny", { deny: [noSynergySeatMsg(seated.unplaced)] });
  }

  const fillingCore = isFillingCore(spec);
  const fillingTank = spec.role === "Tank" && counts.Tank < target.Tank;
  const fillingHeal = spec.role === "Heal" && counts.Heal < target.Heal;
  const fillingOpt = isFillingOptional(spec);
  const skipLower = fillingCore || fillingTank || fillingHeal;
  const meleeCap = meleeCapOf(size, target);
  if (guaranteedMeleeSeat(spec) && spec.class !== "Death Knight") {
    return verdict("recommend", {
      advice: recommendWhy(spec, fillingCore, fillingOpt, nextCounts, target),
    });
  }
  if (spec.role === "Melee" && meleeOverPlan(spec, nextCounts.Melee, target)) {
    return verdict("warn", { advice: [meleePlanAdvice(spec, nextCounts, target)] });
  }

  const nextDk = classCountOf("Death Knight") + (spec.class === "Death Knight" ? 1 : 0);
  const nextWl = classCountOf("Warlock") + (spec.class === "Warlock" ? 1 : 0);
  const needDk = Math.max(0, DK_WL_TARGET - nextDk);
  const advice = [];
  const nice = [];
  const fitAfter = remainingSynAfter(rem, covered, nextDk, nextWl, seated);

  const closedTank = counts.Tank < target.Tank && nextCounts.Tank >= target.Tank;
  const closedHeal = counts.Heal < target.Heal && nextCounts.Heal >= target.Heal;
  const stackRec = dkWlRecommendMsg(spec);
  const firstStack = !!stackRec && classCountOf(spec.class) === 0;
  if (stackRec && (firstStack || fitAfter.ok) && !closedTank && !closedHeal) {
    const room = roleRoomReason(spec, nextCounts, target);
    return verdict("recommend", { advice: room ? [stackRec, room] : [stackRec] });
  }

  const nowRem = stackRoomAfter(counts, Math.max(0, size - roster.length), target);
  const noSeat = new Set(fitAfter.optionals);
  const forcedFresh =
    closedTank || closedHeal
      ? forcedDpsSpecMsgs(rem, covered, noSeat).filter(
          (m) => !forcedDpsSpecMsgs(nowRem, nowCovered).includes(m)
        )
      : [];
  if (stackRec && !forcedFresh.length && (firstStack || fitAfter.ok)) {
    const room = roleRoomReason(spec, nextCounts, target);
    return verdict("recommend", { advice: room ? [stackRec, room] : [stackRec] });
  }

  if (
    nextCounts.Melee > meleeCap &&
    fillingCore &&
    canFillAsRanged(spec) &&
    !guaranteedMeleeSeat(spec)
  ) {
    const alt = altSpecName(spec.class, "Ranged");
    return verdict("positive", {
      advice: [
        tx(
          `필수 시너지는 채우지만 근딜이 ${nextCounts.Melee}명이 됩니다. ${alt}로 받을 수 있습니다.`,
          `This fills a required synergy, but melee would be ${nextCounts.Melee}. They could come as ${alt}.`
        ),
      ],
    });
  }

  let forceTH = "";
  if (!skipLower && spec.role !== "Tank" && spec.role !== "Heal") {
    const forcedAfter = tankHealForceState(rem, covered);
    const forcedBefore = tankHealForceState(nowRem, nowCovered);
    if (forcedAfter.parts.length && forcedAfter.overflow > forcedBefore.overflow) {
      forceTH = forceTankHealAdvice(forcedAfter.parts);
    }
  }

  const extraMelee =
    spec.role === "Melee" && !fillingCore && !fillingTank && !fillingHeal && !fillingOpt;
  const extraRanged = spec.role === "Ranged" && !fillingCore && !fillingOpt;
  const canFillMelee = canFillRoleSynAfter("Melee", spec, nextCounts, target, MELEE_SYN_NEEDS);
  const canFillHeal = canFillRoleSynAfter("Heal", spec, nextCounts, target, HEAL_SYN_NEEDS);
  const flexMelee = extraMelee && canFillMelee && nextCounts.Melee <= meleeCap;
  const flexRanged = extraRanged;
  const flexHeal =
    fillingHeal &&
    !fillingCore &&
    !fillingOpt &&
    !fillsOpenSyn(spec, HEAL_SYN_NEEDS) &&
    canFillHeal &&
    nextCounts.Heal <= target.Heal;
  const flexRole = flexMelee || flexRanged || flexHeal;
  if (extraMelee && !(raidSynergiesCovered() && nextCounts.Melee <= target.Melee)) {
    const msg = extraMeleeAdvice(nextCounts, rem, covered, needDk, meleeCap);
    if (msg) advice.push(msg);
  }

  if (advice.length) return verdict("warn", { advice, nice });

  if (!fitAfter.ok && !fillingCore && !firstStack) {
    return verdict("positive", {
      advice: [
        ...recommendWhy(spec, fillingCore, fillingOpt, nextCounts, target),
        leftoverSynAdvice(fitAfter),
        forceTH,
        ...forcedFresh,
      ].filter(Boolean),
      nice,
    });
  }

  if (forcedFresh.length || forceTH) {
    return verdict("positive", {
      advice: [
        ...recommendWhy(spec, fillingCore, fillingOpt, nextCounts, target),
        forceTH,
        ...forcedFresh,
      ].filter(Boolean),
      nice,
    });
  }

  if (fillingOpt) {
    return verdict("recommend", {
      advice: recommendWhy(spec, fillingCore, fillingOpt, nextCounts, target),
      nice,
    });
  }

  if (flexRole) {
    const room = roleRoomReason(spec, nextCounts, target);
    const extra =
      flexMelee
        ? raidSynergiesCovered() || synNeededAfter(spec, MELEE_SYN_NEEDS) === 0
          ? tx(
              "근딜 시너지는 이미 채워져 아무 근딜이나 받아도 됩니다.",
              "Melee synergies are already covered, so any melee is fine."
            )
          : tx(
              "이 사람을 받아도 남은 근딜 자리로 시너지를 채울 수 있습니다.",
              "Taking this player still leaves enough melee seats to finish synergies."
            )
        : flexRanged
          ? synNeededAfter(spec, RANGED_SYN_NEEDS) === 0
            ? tx(
                "원딜 시너지는 이미 채워져 아무 원딜이나 받아도 됩니다.",
                "Ranged synergies are already covered, so any ranged is fine."
              )
            : tx(
                "이 사람을 받아도 남은 원딜 자리로 시너지를 채울 수 있습니다.",
                "Taking this player still leaves enough ranged seats to finish synergies."
              )
          : tx(
              "힐러 시너지용 자리는 아직 남아서 지금 받아도 됩니다.",
              "A healer synergy seat is still open, so this healer is fine for now."
            );
    return verdict("recommend", {
      advice: [room, extra].filter(Boolean),
      nice,
    });
  }

  const stillMissingOpt = OPTIONAL_CLASSES.some(
    (c) => c !== spec.class && classCountOf(c) === 0
  );
  if (
    !advice.length &&
    !skipLower &&
    !fillingOpt &&
    !stillMissingOpt &&
    spec.role === "Melee" &&
    nextCounts.Melee > target.Melee
  ) {
    nice.push(
      tx(
        `이 사람을 받으면 근딜이 ${nextCounts.Melee}명이 됩니다.`,
        `Taking this player would make melee ${nextCounts.Melee}.`
      )
    );
  }

  return verdict("recommend", {
    advice: recommendWhy(spec, fillingCore, fillingOpt, nextCounts, target),
    nice,
  });
}

function defaultSpecForClass(className) {
  const size = +$("raidSize").value;
  const target = targetComposition(size);
  const counts = roleCountsNow();
  const specs = S.filter((s) => s.class === className);
  const dpsNow = dpsCountOf(counts);
  const open = specs.filter((s) => {
    if (s.role === "Tank" || s.role === "Heal") return counts[s.role] < target[s.role];
    return dpsNow < target.DPS;
  });
  const pref = CORE_DPS_PREF[className];
  return (
    open.find((s) => s.role === pref) ||
    open[0] ||
    specs[0] ||
    null
  );
}

function addApplicant(s) {
  applicants.unshift({ id: String(++instanceSeq), spec: s });
  if (applicants.length > 10) applicants.pop();
  renderSpecs();
  renderAiAdvice();
}

function fillRandomApplicants(n = 10) {
  const pool = S.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  applicants = pool.slice(0, Math.min(n, pool.length)).map((spec) => ({
    id: String(++instanceSeq),
    spec,
  }));
  aiRecOpen = true;
  renderSpecs();
  renderAiAdvice();
  $("statusBox")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function acceptApplicant(id) {
  const i = applicants.findIndex((a) => a.id === String(id));
  if (i < 0) return;
  const spec = applicants[i].spec;
  applicants.splice(i, 1);
  if (roster.length < +$("raidSize").value) {
    roster.push({ ...spec, instanceId: String(++instanceSeq) });
  }
  renderAll();
}

function rejectApplicant(id) {
  applicants = applicants.filter((a) => a.id !== String(id));
  renderSpecs();
  renderAiAdvice();
}

function applicantCardHtml(app) {
  const spec = app.spec;
  const ev = evaluateApplicant(spec);
  const ui = {
    recommend: { tag: tx("추천", "Recommend"), kind: tx("추천", "Recommend") },
    positive: { tag: tx("긍정", "Positive"), kind: tx("긍정", "Positive") },
    warn: { tag: tx("권고", "Caution"), kind: tx("권고 메시지", "Advice") },
    deny: { tag: tx("부정", "No"), kind: tx("부정", "No") },
  }[ev.verdict];
  const nice = ev.nice || [];
  const msgs =
    ev.verdict === "recommend"
      ? ev.advice.length
        ? ev.advice
        : [tx("지금 받으면 좋습니다.", "Good to take now.")]
      : ev.verdict === "deny"
        ? ev.deny
        : ev.advice;
  return `<article class="ai-app ${ev.verdict}">
    <div class="ai-app-top">
      <div class="ai-app-who" style="--class:${spec.color}">
        <b>${displayClass(spec)} · ${displaySpec(spec)}</b>
        <span>${role(spec.role)}</span>
      </div>
      <span class="ai-app-tag">${ui.tag}</span>
    </div>
    <div class="ai-app-msgs">
      ${ui.kind ? `<div class="ai-app-kind">${ui.kind}</div>` : ""}
      ${msgs.map((m) => `<p>${m}</p>`).join("")}
      ${
        nice.length
          ? `<div class="ai-app-kind">${tx("있으면 좋음", "Nice to have")}</div>${nice.map((m) => `<p>${m}</p>`).join("")}`
          : ""
      }
    </div>
    <div class="ai-app-actions">
      <button type="button" class="ghost" data-app-reject="${app.id}">${tx("거절", "Decline")}</button>
      <button type="button" class="primary" data-app-accept="${app.id}">${tx("수락", "Accept")}</button>
    </div>
  </article>`;
}

function buildAiAdviceHtml() {
  const size = +$("raidSize").value;
  const counts = Object.fromEntries(
    ROLES.map((r) => [r, roster.filter((s) => s.role === r).length])
  );
  const { target, need, alloc, empty } = allocateSlots(size, counts);
  const missingCore = CORE_CLASSES.filter((c) => classCountOf(c) === 0);
  const fitCore = missingCore.filter((c) => coreFitsRemaining(c, alloc));
  const dk = classCountOf("Death Knight");
  const wl = classCountOf("Warlock");
  const nowFit = dkWlFit(
    seatMissingCores(stackRoomAfter(counts, empty, target), coveredNow()),
    dk,
    wl
  );
  const needDk = nowFit.dkOk ? nowFit.needDk : 0;
  const needWl = nowFit.wlOk ? nowFit.needWl : 0;
  const must = need.Tank + need.Heal + missingCore.length;
  const slack = empty - must;
  const allBucketsOpen =
    counts.Tank < target.Tank &&
    counts.Heal < target.Heal &&
    dpsCountOf(counts) < target.DPS;
  const missingOpt = OPTIONAL_SYNERGIES.filter((x) => classCountOf(x.class) === 0);
  const plentiful =
    empty > 0 &&
    slack >= 2 &&
    allBucketsOpen &&
    missingCore.length === 0 &&
    needDk === 0 &&
    needWl === 0 &&
    missingOpt.length === 0 &&
    counts.Melee <= target.Melee;
  const mustTH = need.Tank + need.Heal;
  const tight =
    (empty > 0 && mustTH > 0 && empty <= mustTH) ||
    (empty === 0 && mustTH > 0);
  const picks = nowPicks(alloc, fitCore, needDk, needWl);
  const remain = remainBits(alloc, missingCore);
  const recPicks = picks.filter((p) => p.kind === "core" || p.kind === "stack");
  const rec = recPhrase(recPicks);
  const hasCoreRec = recPicks.some((p) => p.kind === "core");
  const recLine = hasCoreRec
    ? lang === "ko"
      ? "필수 시너지를 먼저 권장합니다."
      : "Fill required synergies first."
    : rec
      ? lang === "ko"
        ? `${rec} 권장합니다.`
        : `Take ${rec}.`
      : "";
  const meleeOver = counts.Melee > target.Melee;
  const ratioNote =
    missingCore.length === 0 &&
    needDk === 0 &&
    needWl === 0 &&
    missingOpt.length === 0 &&
    meleeOver
      ? lang === "ko"
        ? `근딜이 ${counts.Melee}명입니다. 근딜이 너무 많아지지 않게 주의하세요.`
        : `Melee is at ${counts.Melee}. Be careful not to take too many melee.`
      : "";

  let nowText = "";
  if (!empty && tight) {
    nowText = lang === "ko"
      ? `자리가 없습니다. ${need.Tank ? "탱커" : "힐러"}로 교체하세요.`
      : `No empty slots. Swap in a ${need.Tank ? "tank" : "healer"}.`;
  } else if (remain.length && recLine) {
    nowText = lang === "ko"
      ? `${remain.join(" · ")} 남았습니다. ${recLine}`
      : `${remain.join(" · ")} left. ${recLine}`;
  } else if (remain.length && tight) {
    nowText = lang === "ko"
      ? `${remain.join(" · ")} 남았습니다. 이 역할로만 받으세요.`
      : `${remain.join(" · ")} left. Fill those roles only.`;
  } else if (remain.length) {
    nowText = lang === "ko"
      ? `${remain.join(" · ")} 남았습니다.`
      : `${remain.join(" · ")} left.`;
  } else if (recLine) {
    nowText = recLine;
  } else {
    nowText = lang === "ko"
      ? "목표 인원 배분은 맞습니다."
      : "Role split is on target.";
  }

  const applicantBlock = `<section class="ai-rank">
      <div class="ai-rank-h ai-apps-head">
        <span>${lang === "ko" ? "신청온 사람" : "Applicants"}</span>
        <button class="ghost" type="button" id="aiTestFill">${
          lang === "ko" ? "TEST 10명" : "TEST 10"
        }</button>
      </div>
      ${
        applicants.length
          ? `<div class="ai-apps">${applicants.map(applicantCardHtml).join("")}</div>`
          : `<p class="ai-app-empty">${
              lang === "ko"
                ? "전문화를 클릭하면 여기에 올라가고, 받아도 되는지 바로 보여 줍니다."
                : "Click a spec to queue an applicant and see if they fit."
            }</p>`
      }
    </section>`;

  return `<div class="ai-rec">
    <div class="ai-rec-head">
      <div>
        <b>${lang === "ko" ? "지금 받으면 좋은 직업" : "Take these now"}</b>
        <div class="ai-rec-meta">${
          lang === "ko"
            ? `${size}인 · 현재 ${roster.length}/${size} · 목표 탱 ${target.Tank} · 딜 ${target.DPS} · 힐 ${target.Heal}`
            : `${size}-man · ${roster.length}/${size} · target T${target.Tank} / DPS ${target.DPS} / H${target.Heal}`
        }</div>
      </div>
      <button class="ghost" type="button" id="aiRecClose">${tr("aiRecClose")}</button>
    </div>
    <section class="ai-rank${plentiful ? " ok" : ""}">
      <div class="ai-rank-h">${lang === "ko" ? "권장 사항" : "Recommended"}</div>
      ${
        plentiful
          ? `<p>${lang === "ko" ? "현재는 아무 직업이나 받아도 됩니다." : "Any class is fine right now."}</p>`
          : ""
      }
      <p class="ai-now">${nowText}</p>
      ${picks.length ? `<div class="ai-chips">${picks.map((p) => classChip(p.class)).join("")}</div>` : ""}
      ${
        missingOpt.length || ratioNote
          ? `<div class="ai-nice">
              <span class="ai-nice-lbl">${lang === "ko" ? "있으면 좋음" : "Nice to have"}</span>
              ${ratioNote ? `<p>${ratioNote}</p>` : ""}
              ${
                missingOpt.length
                  ? `<div class="ai-chips">${missingOpt.map((x) => classChip(x.class)).join("")}</div>`
                  : ""
              }
            </div>`
          : ""
      }
    </section>
    ${applicantBlock}
  </div>`;
}

function refreshSpecSub() {
  const el = document.querySelector('[data-i18n="specSub"]');
  if (!el) return;
  el.textContent = aiRecOpen ? tr("specSubAi") : tr("specSub");
}

function bindAiAdvice() {
  const close = $("aiRecClose");
  if (close) {
    close.onclick = () => {
      aiRecOpen = false;
      renderAiAdvice();
    };
  }
  const testFill = $("aiTestFill");
  if (testFill) testFill.onclick = () => fillRandomApplicants(10);
  document.querySelectorAll("[data-app-accept]").forEach((b) => {
    b.onclick = () => acceptApplicant(b.dataset.appAccept);
  });
  document.querySelectorAll("[data-app-reject]").forEach((b) => {
    b.onclick = () => rejectApplicant(b.dataset.appReject);
  });
  document.querySelectorAll("[data-ai-class]").forEach((el) => {
    el.onclick = () => {
      const spec = defaultSpecForClass(el.dataset.aiClass);
      if (spec) addApplicant(spec);
    };
  });
}

function renderAiAdvice() {
  const box = $("statusBox");
  const btn = $("aiRecBtn");
  if (btn) btn.classList.toggle("on", aiRecOpen);
  refreshSpecSub();
  if (!box) return;
  if (!aiRecOpen) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = buildAiAdviceHtml();
  bindAiAdvice();
}

function isSynergyCovered(syn) {
  const providers = syn.providers || [];
  return roster.some(
    (r) =>
      (r.synergies || []).includes(syn.name) || providers.includes(r.class)
  );
}

function coveringRoster(syn) {
  const providers = syn.providers || [];
  return roster.filter(
    (r) =>
      (r.synergies || []).includes(syn.name) || providers.includes(r.class)
  );
}

function uniqueByClass(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = typeof item === "string" ? item : item.class;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueBySpec(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.class}|${item.spec}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function providerChip(className, label, kind = "") {
  const cls = kind ? `provider ${kind}` : "provider";
  return `<span class="${cls}" style="--class:${classColor(className)}">${label}</span>`;
}

function renderProviderRow(syn, isOn) {
  if (isOn) return "";

  const classes = uniqueByClass(syn.providers || []);
  if (!classes.length) return "";
  return `<div class="syn-providers">
    <span class="syn-prov-label">${tr("needJob")}</span>
    <div class="providers need">${classes
      .map((c) => providerChip(c, displayClassName(c), "need"))
      .join("")}</div>
  </div>`;
}

let currentView = "home";
let currentRoute = { view: "home" };
const COMMUNITY_READY = false;
const GAME_READY = false;
const PLAZA_BOARDS = ["info", "recruit", "seek", "free"];
const PLAZA_KINDS = ["regular", "pickup"];
const PLAZA_INTENTS = ["recruit", "seek"];

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((e) => {
    e.textContent = tr(e.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((e) => {
    e.placeholder = tr(e.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((e) => {
    e.setAttribute("aria-label", tr(e.dataset.i18nLabel));
  });
  const titleEl = document.querySelector(".title");
  if (titleEl) {
    titleEl.textContent =
      currentView === "planner"
        ? tr("plannerTitle")
        : currentView === "game"
          ? tr("comingTitle")
          : currentView === "helper"
            ? tr("helperTab")
            : currentView === "plaza"
              ? COMMUNITY_READY && window.CommunityPlaza && typeof CommunityPlaza.pageTitle === "function"
                ? CommunityPlaza.pageTitle(currentRoute)
                : tr("plazaTitle")
              : tr("homeTitle");
  }
  document.title = `${titleEl ? titleEl.textContent : tr("homeTitle")} · WoW Raid Command`;
  if (COMMUNITY_READY && currentView === "plaza" && window.CommunityPlaza && typeof CommunityPlaza.relabel === "function") {
    CommunityPlaza.relabel();
  }
  $("langBtn").textContent = lang === "ko" ? "EN" : "한글";
  $("patch").textContent = DATA.raid.targetPatch;
  const back = $("backHome");
  if (back) back.setAttribute("title", tr("backHome"));
  renderAll();
}

function renderFilters() {
  $("filters").innerHTML = ["All", ...ROLES]
    .map(
      (r) =>
        `<button class="chip ${filter === r ? "on" : ""}" data-filter="${r}">${
          r === "All" ? (lang === "ko" ? "전체" : "All") : role(r)
        }</button>`
    )
    .join("");
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.filter;
      renderFilters();
      renderSpecs();
    };
  });
}

function renderSpecs() {
  const q = $("search").value.toLowerCase();
  const arr = S.filter(
    (s) =>
      (filter === "All" || s.role === filter) &&
      `${s.class} ${s.spec} ${s.classKo} ${s.specKo}`.toLowerCase().includes(q)
  );
  $("specList").innerHTML =
    arr
      .map((s) => {
        const sel = roster.some((r) => r.class === s.class && r.spec === s.spec);
        const queued =
          aiRecOpen &&
          applicants.some((a) => a.spec.class === s.class && a.spec.spec === s.spec);
        return `<div class="spec ${sel ? "selected" : ""} ${queued ? "queued" : ""}" role="button" tabindex="0" data-cell="${S.indexOf(s)}" style="--class:${s.color}" aria-pressed="${sel}"><div class="spec-main"><div class="spec-title">${displayClass(s)} · ${displaySpec(s)}</div><div class="spec-en">${
          lang === "ko" ? `${s.spec} · ${s.class}` : `${s.specKo} · ${s.classKo}`
        }</div></div><span class="role ${s.role}">${role(s.role)}</span></div>`;
      })
      .join("") ||
    `<div class="empty">${
      lang === "ko" ? "조건에 맞는 전문화가 없습니다." : "No matching specialization."
    }</div>`;

  document.querySelectorAll("[data-cell]").forEach((c) => {
    const act = () => {
      const spec = S[+c.dataset.cell];
      if (aiRecOpen) addApplicant(spec);
      else addSpec(spec);
    };
    c.onclick = act;
    c.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        act();
      }
    };
  });
}

function addSpec(s) {
  if (roster.length < +$("raidSize").value) {
    roster.push({ ...s, instanceId: String(++instanceSeq) });
  }
  renderAll();
}

function removeInstance(id) {
  const i = roster.findIndex((s) => s.instanceId === String(id));
  if (i >= 0) {
    roster.splice(i, 1);
    renderAll();
  }
}

function renderColumns() {
  const classRank = (c) => {
    const n = CLASS_ORDER.indexOf(c);
    return n < 0 ? 999 : n;
  };
  $("columns").innerHTML = ROLES.map((r) => {
    const list = roster
      .filter((s) => s.role === r)
      .sort(
        (a, b) =>
          classRank(a.class) - classRank(b.class) ||
          displaySpec(a).localeCompare(displaySpec(b))
      );
    return `<div class="role-column"><div class="role-title"><span>${role(r)}</span><span>${list.length}</span></div>${
      list.length
        ? list
            .map(
              (s) =>
                `<div class="slot" role="button" tabindex="0" data-instance="${s.instanceId}" style="--class:${s.color}"><b>${displayClass(s)} · ${displaySpec(s)}</b><span>${
                  lang === "ko"
                    ? `${s.spec} / ${s.class}`
                    : `${s.specKo} / ${s.classKo}`
                }</span></div>`
            )
            .join("")
        : `<div class="empty">${lang === "ko" ? "아직 없음" : "Empty"}</div>`
    }</div>`;
  }).join("");

  document.querySelectorAll("[data-instance]").forEach((c) => {
    c.title = lang === "ko" ? "클릭해서 제거" : "Click to remove";
    c.onclick = () => removeInstance(c.dataset.instance);
    c.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        removeInstance(c.dataset.instance);
      }
    };
  });
}

function renderSynergies() {
  const ordered = [...SY].sort(
    (a, b) =>
      Number(isSynergyCovered(a)) - Number(isSynergyCovered(b)) ||
      a.name.localeCompare(b.name)
  );

  $("synergies").innerHTML = ordered
    .map((x) => {
      const isOn = isSynergyCovered(x);
      const coveredBy = isOn ? coveringRoster(x) : [];
      const accentClass =
        coveredBy[0]?.class ||
        (x.providers || [])[0] ||
        null;
      const accent = accentClass ? classColor(accentClass) : "#58677a";
      return `<div class="synergy ${isOn ? "covered" : "inactive"}" data-syn-card="${x.id || x.name}" style="--class:${accent}">
        <div class="syn-head">
          <div class="syn-title-wrap">
            <div class="syn-name">${lang === "ko" ? x.nameKo : x.name}</div>
            <div class="syn-en">${lang === "ko" ? x.name : x.nameKo}</div>
          </div>
          <span class="syn-badge">${isOn ? (lang === "ko" ? "활성" : "ACTIVE") : lang === "ko" ? "미활성" : "OFF"}</span>
        </div>
        <div class="syn-effect">${lang === "ko" ? x.effectKo : x.effect}</div>
        ${renderProviderRow(x, isOn)}
        <div class="syn-detail">${(x.providerSpecs || [])
          .map((p) => `${displayClass(p)} · ${displaySpec(p)}`)
          .join(" / ")}</div>
      </div>`;
    })
    .join("");

  document.querySelectorAll("[data-syn-card]").forEach((c) => {
    c.onclick = () => c.classList.toggle("expanded");
  });

  const missing = SY.filter((x) => !isSynergyCovered(x)).length;
  updateSynergyComplete(missing);
}

function playCelebrate() {
  const overlay = $("celebrateOverlay");
  const burst = $("celebrateBurst");
  if (!overlay || !burst) return;

  $("celebrateTitle").textContent = tr("celebrateTitle");
  $("celebrateSub").textContent = tr("celebrateSub");

  const colors = Object.values(CLS).map((c) => c[1]);
  burst.innerHTML = Array.from({ length: 36 }, (_, i) => {
    const color = colors[i % colors.length];
    const angle = (i / 36) * 360;
    const dist = 90 + (i % 5) * 28;
    const delay = (i % 8) * 0.03;
    const size = 6 + (i % 4) * 3;
    return `<i class="spark" style="--a:${angle}deg;--d:${dist}px;--delay:${delay}s;--c:${color};--s:${size}px"></i>`;
  }).join("");

  overlay.classList.remove("hidden");
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  $("synPanel")?.classList.add("syn-glow");

  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => {
    overlay.classList.remove("show");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    $("synPanel")?.classList.remove("syn-glow");
  }, 2800);
}

function updateSynergyComplete(missing) {
  const banner = $("synCompleteBanner");
  const done = missing === 0;
  if (banner) {
    banner.classList.toggle("hidden", !done);
    if (done) banner.textContent = tr("synComplete");
  }
  if (done && !allSynergiesDone) playCelebrate();
  allSynergiesDone = done;
  if (!done) $("synPanel")?.classList.remove("syn-glow");
}

function renderHeadcount() {
  const size = +$("raidSize").value;
  const by = Object.fromEntries(
    ROLES.map((r) => [r, roster.filter((s) => s.role === r).length])
  );
  $("headcount").innerHTML = `<div class="headcount-main">${
    lang === "ko" ? "현재" : "Current"
  } <em>${roster.length}</em> / ${size}${
    lang === "ko" ? "명" : " players"
  }</div><div class="headcount-roles">${
    lang === "ko"
      ? `탱커 ${by.Tank} · 근딜 ${by.Melee} · 원딜 ${by.Ranged} · 힐 ${by.Heal}`
      : `Tank ${by.Tank} · Melee ${by.Melee} · Ranged ${by.Ranged} · Healer ${by.Heal}`
  }</div>`;
}

function renderPlanRaidBanner() {
  const banner = $("planRaidBanner");
  if (!banner) return;
  const full = roster.length >= +$("raidSize").value;
  banner.classList.toggle("hidden", !full);
}

function goPlanRaid() {
  if (roster.length < +$("raidSize").value) return;
  goToView("planner");
  if (window.RaidPlanner && typeof RaidPlanner.importFromHelper === "function") {
    RaidPlanner.importFromHelper();
  }
}

function renderAll() {
  renderFilters();
  renderSpecs();
  renderColumns();
  renderSynergies();
  renderHeadcount();
  renderPlanRaidBanner();
  renderAiAdvice();
  $("meter").style.width =
    Math.min(100, (roster.length / +$("raidSize").value) * 100) + "%";
  $("counts").innerHTML = ROLES.map(
    (r) =>
      `<div class="count"><b>${
        roster.filter((s) => s.role === r).length
      }</b><span>${role(r)}</span></div>`
  ).join("");
}

const VIEW_PATH = {
  home: "/",
  helper: "/helper",
  planner: "/planner",
  game: "/game",
  plaza: "/plaza",
};

function fileMode() {
  return location.protocol === "file:";
}

function locationPath() {
  if (fileMode()) {
    const hash = String(location.hash || "").replace(/^#/, "");
    return hash || "/";
  }
  return location.pathname;
}

function normalizePath(pathname) {
  const raw = String(pathname || "/").replace(/\/index\.html$/i, "");
  const clean = raw.replace(/\/+$/, "");
  return clean || "/";
}

function parseAppPath(pathname) {
  const parts = normalizePath(pathname).split("/").filter(Boolean);
  const first = parts[0] || "";
  if (first === "helper" || first === "game") return { view: first };
  if (first === "planner") {
    if (parts[1] === "share" && parts[2]) return { view: "planner", shareId: decodeURIComponent(parts[2]) };
    return { view: "planner" };
  }
  if (first !== "plaza") return { view: "home" };
  const a = parts[1] || "";
  if (!a) return { view: "plaza", walk: true };
  if (a === "walk") return { view: "plaza", walk: true };
  if (a === "jobs") {
    const intent = PLAZA_INTENTS.includes(parts[2]) ? parts[2] : "";
    const kind = PLAZA_KINDS.includes(parts[3]) ? parts[3] : "";
    if (!intent) return { view: "plaza", gate: "jobs" };
    if (!kind) return { view: "plaza", gate: "jobs", intent };
    const rest = parts[4] || "";
    const route = { view: "plaza", board: intent, kind, mode: "list" };
    if (rest === "write-pool") {
      route.mode = "write";
      route.writeAs = "pool";
    } else if (rest === "write-raid" || rest === "write") {
      route.mode = "write";
      route.writeAs = rest === "write" && intent === "recruit" ? "pool" : "raid";
    } else if (rest) {
      route.mode = "read";
      route.postId = decodeURIComponent(rest);
    }
    return route;
  }
  if (a === "info" || a === "free") {
    const rest = parts[2] || "";
    const route = { view: "plaza", board: a, mode: "list" };
    if (rest === "write") route.mode = "write";
    else if (rest) {
      route.mode = "read";
      route.postId = decodeURIComponent(rest);
    }
    return route;
  }
  if (PLAZA_BOARDS.includes(a)) return { view: "plaza", board: a, mode: "list" };
  return { view: "plaza" };
}

function pathFromRoute(route) {
  if (!route || route.view === "home") return "/";
  if (route.view === "planner") {
    if (route.shareId) return "/planner/share/" + encodeURIComponent(route.shareId);
    return "/planner";
  }
  if (route.view === "plaza") {
    if (!COMMUNITY_READY) return "/plaza";
    if (route.walk) return "/plaza";
    if (route.board === "info" || route.board === "free") {
      let path = "/plaza/" + route.board;
      if (route.mode === "write") return path + "/write";
      if (route.mode === "read" && route.postId) return path + "/" + encodeURIComponent(route.postId);
      return path;
    }
    if (route.board === "recruit" || route.board === "seek") {
      let path = "/plaza/jobs/" + route.board + "/" + (route.kind || "regular");
      if (route.mode === "write") {
        const as = route.writeAs || (route.board === "recruit" ? "pool" : "raid");
        return path + (as === "pool" ? "/write-pool" : "/write-raid");
      }
      if (route.mode === "read" && route.postId) return path + "/" + encodeURIComponent(route.postId);
      return path;
    }
    if (route.gate === "jobs") return route.intent ? "/plaza/jobs/" + route.intent : "/plaza/jobs";
    return "/plaza";
  }
  return VIEW_PATH[route.view] || "/";
}

function goToView(view, opts) {
  if (view && typeof view === "object") return goToRoute(view, opts);
  if (view === "plaza") return goToRoute({ view: "plaza", walk: true }, opts);
  return goToRoute({ view: view || "home" }, opts);
}

function goToRoute(route, opts) {
  const options = opts || {};
  currentRoute = {
    view:
      route.view === "planner" || route.view === "game" || route.view === "helper" || route.view === "plaza"
        ? route.view
        : "home",
    board: route.view === "plaza" ? route.board || "" : "",
    kind: route.kind || "",
    gate: route.gate || "",
    intent: route.intent || "",
    walk: !!(route.walk || (route.view === "plaza" && !route.board && !route.gate)),
    mode: route.mode || "",
    writeAs: route.writeAs || "",
    postId: route.postId || "",
    shareId: route.view === "planner" ? route.shareId || "" : "",
  };
  currentView = currentRoute.view;
  const onPlaza = currentView === "plaza";
  const plazaLive = onPlaza && COMMUNITY_READY;
  const onWalk = plazaLive && currentRoute.walk;
  const onBoard =
    plazaLive &&
    (currentRoute.board === "info" ||
      currentRoute.board === "free" ||
      ((currentRoute.board === "recruit" || currentRoute.board === "seek") && currentRoute.kind));
  $("homeView")?.classList.toggle("hidden", currentView !== "home");
  $("helperView").classList.toggle("hidden", currentView !== "helper");
  $("plannerView").classList.toggle("hidden", currentView !== "planner");
  $("gameView").classList.toggle("hidden", currentView !== "game");
  $("communityView")?.classList.toggle("hidden", currentView !== "plaza");
  document.querySelector(".app")?.classList.toggle("is-home", currentView === "home");
  document.querySelector(".app")?.classList.toggle("rp-wide", currentView === "planner");
  document.querySelector(".app")?.classList.toggle("plaza-hub-open", plazaLive && !onWalk && !onBoard);
  document.querySelector(".app")?.classList.toggle("mw-open", onWalk);
  document.querySelector(".app")?.classList.toggle("mw-board", !!onBoard);
  if (currentView !== "planner") document.querySelector(".app")?.classList.remove("rp-fit-board");
  $("backHome")?.classList.toggle("hidden", currentView === "home");
  applyI18n();
  if (GAME_READY && currentView === "game" && window.RaidGameUI) {
    RaidGameUI.mount(() => lang);
  }
  if (currentView === "planner" && window.RaidPlanner) {
    RaidPlanner.mount(
      () => lang,
      () => roster.slice(),
      { shareId: currentRoute.shareId || "" }
    );
  }
  if (plazaLive && window.CommunityPlaza) {
    CommunityPlaza.mount(() => lang);
    if (typeof CommunityPlaza.openRoute === "function") CommunityPlaza.openRoute(currentRoute);
  } else if (window.CommunityPlaza) CommunityPlaza.pause();

  const path = pathFromRoute(currentRoute);
  if (!options.silent && normalizePath(locationPath()) !== path) {
    const state = { ...currentRoute };
    const url = fileMode() ? location.pathname + location.search + "#" + path : path;
    if (options.replace) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
  }
}

window.RaidRouter = {
  go(route, opts) {
    goToRoute(route, opts);
  },
};

document.querySelectorAll("[data-view]").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    if (el.tagName === "A") e.preventDefault();
    goToView(el.dataset.view);
  });
});
$("brandHome")?.addEventListener("click", () => {
  if (currentView !== "home") goToView("home");
});
window.addEventListener("popstate", () => {
  goToRoute(parseAppPath(locationPath()), { silent: true });
});
window.addEventListener("hashchange", () => {
  if (!fileMode()) return;
  goToRoute(parseAppPath(locationPath()), { silent: true });
});

$("langBtn").onclick = () => {
  lang = lang === "ko" ? "en" : "ko";
  applyI18n();
  document.dispatchEvent(new Event("raid:lang"));
  if (GAME_READY && !$("gameView").classList.contains("hidden") && window.RaidGameUI) {
    RaidGameUI.render(true);
  }
  if (!$("plannerView").classList.contains("hidden") && window.RaidPlanner) {
    RaidPlanner.render(true);
  }
};

window.RaidRoster = {
  snapshot() {
    return {
      size: +$("raidSize").value,
      members: roster.map((s) => ({
        class: s.class,
        spec: s.spec,
        role: s.role,
        playerId: s.instanceId,
      })),
    };
  },
  apply(data) {
    const size = String(data.size || 20);
    const sel = $("raidSize");
    if ([...sel.options].some((o) => o.value === size)) sel.value = size;
    roster = [];
    instanceSeq = 0;
    (data.members || []).forEach((m) => {
      const spec = S.find((s) => s.class === m.class && s.spec === m.spec);
      if (spec) roster.push({ ...spec, instanceId: String(++instanceSeq) });
    });
    renderAll();
  },
};
$("search").oninput = renderSpecs;
$("raidSize").onchange = renderAll;
$("aiRecBtn").onclick = () => {
  aiRecOpen = !aiRecOpen;
  renderAiAdvice();
  if (aiRecOpen) $("statusBox")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
};
$("planRaidBtn")?.addEventListener("click", goPlanRaid);
$("clear").onclick = () => {
  roster = [];
  applicants = [];
  renderAll();
};

goToRoute(parseAppPath(locationPath()), { replace: true });
