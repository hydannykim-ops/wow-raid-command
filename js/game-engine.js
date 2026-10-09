/**
 * WoW Raid Commander — Race Simulation Engine
 * Tunables live in js/game-balance.js (RAID_GAME_BALANCE).
 * Core formulas D(s)/M_dmg/P(s)/F(M) follow the fixed ruleset.
 */
(function (global) {
  "use strict";

  const BAL = global.RAID_GAME_BALANCE || {};
  let combatEventSink = null;

  function emitCombatEvent(raid, type, data) {
    if (!raid || !raid.isPlayer || typeof combatEventSink !== "function") return;
    combatEventSink({
      type,
      raidId: raid.id,
      t: raid.combat?.t ?? 0,
      ...(data || {}),
    });
  }

  const B = {
    raid: BAL.raid || {},
    combat: BAL.combat || {},
    unit: BAL.unit || {},
    hazard: BAL.hazard || {},
    survival: BAL.survival || {},
    growth: BAL.growth || {},
    condition: BAL.condition || {},
    bossBonus: BAL.bossBonus || {},
    pool: BAL.pool || {},
    recruit: BAL.recruit || {},
    healer: BAL.healer || {},
    bosses: BAL.bosses || [],
    sim: BAL.sim || {},
    gameSynergies: BAL.gameSynergies || [],
    adSpecs: BAL.adSpecs || [],
    cooldown: BAL.cooldown || {},
    arena: BAL.arena || {},
  };

  const BASE_DPS = B.combat.baseDps ?? 100000;
  const ENRAGE_SEC = B.combat.enrageSec ?? 300;
  const HP_BASELINE_SEC = B.combat.hpBaselineSec ?? ENRAGE_SEC;
  const RAID_SIZE = B.raid.size ?? 20;
  const NEED = B.raid.need || { Tank: 2, Heal: 4, HealMax: 5, DPS: 14 };
  const TANK_NEED = NEED.Tank ?? 2;
  const HEAL_MIN = NEED.Heal ?? 4;
  const HEAL_MAX = NEED.HealMax ?? Math.max(HEAL_MIN, 5);
  const BENCH_MAX = B.raid.benchMax ?? 4;
  const POOL_SIZE = B.raid.poolSize ?? 300;
  const AI_COUNT = B.raid.aiCount ?? 10;
  const D_EXP = B.combat.dExponent ?? 0.65;
  const BASELINE_S = B.combat.baselineScore ?? 70;
  const D70 = 1 + Math.pow(BASELINE_S / 100, D_EXP);
  const EFF_DEALERS = B.combat.effectiveDealerSlots ?? 15;
  const BOSS_HP = BASE_DPS * D70 * EFF_DEALERS * HP_BASELINE_SEC;
  const ENRAGE_DMG_MULT = B.combat.enrageDamageMult ?? 5;
  const APPLY_EXPIRE_SEC = B.recruit.applyExpireSec ?? 30;
  const UNIT_MAX_HP = B.unit.maxHp || {
    Tank: 1500000,
    Heal: 1000000,
    Melee: 1000000,
    Ranged: 1000000,
  };
  const BASE_HPS = B.combat.baseHps ?? 180000;
  const TANK_DPS_FACTOR = B.combat.tankDpsFactor ?? 0.5;
  const BATTLE_REZ_PER_TRY = B.survival.battleRezPerTry ?? 3;
  const BATTLE_REZ_HP = B.survival.battleRezHpRatio ?? 0.4;
  const TANK_WIPE_SEC = B.survival.tankWipeSec ?? 10;

  const SPECIALTIES = ["Single", "TwoTarget", "MultiTarget", "SpreadMulti", "AllRounder"];
  const SPECIALTY_KO = {
    Single: "단일",
    TwoTarget: "2타겟",
    MultiTarget: "광역",
    SpreadMulti: "분산광역",
    AllRounder: "만능",
  };
  const HEALER_TYPES = ["BlanketAoE", "SingleBurst", "Smart", "TankSave"];
  const HEALER_TYPE_KO = {
    BlanketAoE: "광역힐러",
    SingleBurst: "단일특화",
    Smart: "스마트",
    TankSave: "탱세이버",
  };
  const TARGET_TYPE_KO = {
    Single: "단일",
    TwoTarget: "2타겟",
    MultiTarget: "광역",
  };

  const NICK_KO_A = [
    "어둠", "불꽃", "서리", "폭풍", "별빛", "핏빛", "철벽", "그림자", "천둥", "달빛",
    "혼돈", "신성", "야생", "독", "번개", "서리바람", "황금", "심연", "운명", "영광",
  ];
  const NICK_KO_B = [
    "검사", "사수", "수호", "치유사", "학살자", "방랑자", "사냥꾼", "마법사", "수도", "기사",
    "약탈자", "수호자", "예언자", "전사", "암살자", "정복자", "파수꾼", "파괴자", "성자", "용병",
  ];
  const NICK_EN_A = [
    "Dark", "Frost", "Storm", "Blood", "Shadow", "Holy", "Wild", "Iron", "Moon", "Chaos",
    "Golden", "Abyss", "Thunder", "Silent", "Crimson", "Swift", "Ancient", "Eternal", "Night", "Dawn",
  ];
  const NICK_EN_B = [
    "Blade", "Arrow", "Guard", "Healer", "Slayer", "Wanderer", "Hunter", "Mage", "Monk", "Knight",
    "Raider", "Warden", "Prophet", "Warrior", "Assassin", "Conqueror", "Sentinel", "Breaker", "Saint", "Merc",
  ];

  const BOSSES =
    B.bosses.length > 0
      ? B.bosses
      : [
          {
            id: "boss_tyrant",
            name: "Midnight Tyrant",
            nameKo: "한밤의 폭군",
            targetType: "Single",
            hpSec: HP_BASELINE_SEC,
            enrageSec: ENRAGE_SEC,
            phases: [
              {
                phase: 1,
                hpPctStart: 100,
                hpPctEnd: 70,
                skills: [{ id: "raid_pulse", type: "aoe1", nameKo: "광역 파동", interval: 10, hitMult: 1 }],
              },
            ],
          },
        ];

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function rndInt(a, b) {
    return Math.floor(rnd(a, b + 1));
  }
  function pick(arr) {
    return arr[rndInt(0, arr.length - 1)];
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  /** D(s) = 1 + (s/100)^exponent */
  function D(s) {
    return 1 + Math.pow(clamp(s, 0, 100) / 100, D_EXP);
  }

  /** M_dmg(M) proficiency damage multiplier */
  function M_dmg(M) {
    M = clamp(M, 0, 100);
    if (M >= 70) return 1.0 + ((M - 70) / 30) * 0.2;
    return 0.7 + (M / 70) * 0.3;
  }

  /** P(s) base hazard from survival score */
  function P(s) {
    const h = B.hazard;
    const base = h.pBase ?? 1;
    const scale = h.pScale ?? 89;
    const exp = h.pExp ?? 1.16;
    return base + scale * Math.pow(1 - clamp(s, 0, 100) / 100, exp);
  }

  /** F(M) survival proficiency factor */
  function F(M) {
    const h = B.hazard;
    const fBase = h.fBase ?? 1.0;
    const pivot = h.fPivot ?? 70;
    const span = h.fSpan ?? 60;
    return fBase - (clamp(M, 0, 100) - pivot) / span;
  }

  /** Pf_double / Pf_fatal (%) */
  function hitChances(survivalScore, proficiencyM) {
    const h = B.hazard;
    const pfCap = h.pfCap ?? 100;
    const fatalDiv = h.fatalDiv ?? 10;
    const dMult = h.doubleChanceMult ?? 1;
    const fMult = h.fatalChanceMult ?? 1;
    const pfDouble = Math.min(pfCap, P(survivalScore) * F(proficiencyM)) * dMult;
    const pfFatal = (pfDouble / fatalDiv) * fMult;
    return {
      pfDouble: Math.min(pfCap, Math.max(0, pfDouble)),
      pfFatal: Math.min(pfCap, Math.max(0, pfFatal)),
    };
  }

  function bossBonus(specialty, bossTarget) {
    const bb = B.bossBonus;
    if (specialty === "AllRounder") return bb.allRounder ?? 1.05;
    if (specialty === bossTarget) return bb.match ?? 1.15;
    return bb.mismatch ?? 1.0;
  }

  function getPhase(boss, hpPct) {
    return (
      boss.phases.find((p) => hpPct <= p.hpPctStart && hpPct > p.hpPctEnd) ||
      boss.phases[boss.phases.length - 1]
    );
  }

  function getBossEnrage(boss) {
    return boss?.enrageSec ?? ENRAGE_SEC;
  }

  /** BossHP = baseDps * D(70) * 15 * hpSec (광폭화와 독립) */
  function getBossHp(boss) {
    const hpSec = boss?.hpSec ?? HP_BASELINE_SEC;
    return BASE_DPS * D70 * EFF_DEALERS * hpSec;
  }

  function skillKind(skill) {
    const t = skill?.type || "raid";
    if (t === "tankBuster" || t === "buster") return "tankBuster";
    if (t === "random" || t === "soak" || t === "shared" || t === "drop") return "random";
    return "raid";
  }

  function getPhaseSkills(phaseInfo) {
    if (Array.isArray(phaseInfo?.skills) && phaseInfo.skills.length) return phaseInfo.skills;
    return [
      {
        id: "raid_pulse",
        type: "aoe1",
        name: "Raid Pulse",
        nameKo: "광역 파동",
        interval: phaseInfo?.skillInterval || 10,
        hitMult: 1,
      },
    ];
  }

  function pickN(arr, n) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = rndInt(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.max(0, n));
  }

  function selectSkillTargets(skill, living) {
    const kind = skillKind(skill);
    const alive = (living || []).filter((m) => m.alive);
    if (kind === "tankBuster") {
      const tanks = alive.filter((m) => m.role === "Tank");
      if (!tanks.length) return [];
      const ordered = [...tanks].sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp);
      if (skill.count == null) return ordered;
      return ordered.slice(0, Math.min(skill.count, ordered.length));
    }
    if (kind === "random") {
      let pool = alive;
      if (skill.includeTanks === false) pool = pool.filter((m) => m.role !== "Tank");
      if (Array.isArray(skill.roles) && skill.roles.length) {
        pool = pool.filter((m) => skill.roles.includes(m.role));
      }
      return pickN(pool, Math.min(skill.count ?? 3, pool.length));
    }
    return alive;
  }

  function healerTypeFromSpec(spec) {
    if (!spec || spec.role !== "Heal") return undefined;
    const map = B.healer?.specTypes || {};
    const key = `${spec.class}||${spec.spec}`;
    return map[key] || "Smart";
  }

  /** 딜러만: 스펙 고정표 → 없으면 임시 twoMinChance. 탱/힐은 null */
  function assignCdSec(spec) {
    if (!spec || (spec.role !== "Melee" && spec.role !== "Ranged")) return null;
    const CD = B.cooldown || {};
    const key = `${spec.class}||${spec.spec}`;
    const mapped = CD.specCds?.[key];
    if (mapped === 90 || mapped === 120) return mapped;
    return Math.random() < (CD.twoMinChance ?? 0.5) ? 120 : 90;
  }

  function cooldownTypeCfg(cdSec) {
    const CD = B.cooldown || {};
    if (cdSec === 120) return CD.cd120 || { cdSec: 120, burstMin: 29 / 14 - 0.25, burstMax: 29 / 14 + 0.25 };
    if (cdSec === 90) return CD.cd90 || { cdSec: 90, burstMin: 1.5, burstMax: 2.0 };
    return null;
  }

  /**
   * 전투 초 t(1..) 기준 쿨기 배율.
   * 창 시작 시 burstMult 1회 롤. 평타 = fillerMult.
   * m.bursting = 폭딜(사용) 중, m.onCd = 쿨타임 대기 중.
   */
  function getCooldownMult(m, t, raid) {
    if (!m || m.role === "Heal" || m.role === "Tank") {
      if (m) {
        m.bursting = false;
        m.onCd = false;
        m.cdRemain = 0;
      }
      return 1;
    }
    const cdSec = m.cdSec;
    if (!cdSec) {
      m.bursting = false;
      m.onCd = false;
      m.cdRemain = 0;
      return 1;
    }
    const CD = B.cooldown || {};
    const burstSec = CD.burstSec ?? 20;
    const filler = CD.fillerMult ?? 11 / 14;
    const cfg = cooldownTypeCfg(cdSec);
    if (!cfg) {
      m.bursting = false;
      m.onCd = false;
      m.cdRemain = 0;
      return 1;
    }
    const pos = (Math.max(1, t) - 1) % cdSec;
    if (pos < burstSec) {
      const windowStart = t - pos;
      if (m.burstWindowStart !== windowStart) {
        m.burstWindowStart = windowStart;
        m.burstMult = rnd(cfg.burstMin ?? 1.5, cfg.burstMax ?? 2.0);
        if (raid) emitCombatEvent(raid, "burst", { memberId: m.id, cdSec });
      }
      m.bursting = true;
      m.onCd = false;
      m.cdRemain = 0;
      return m.burstMult ?? 1;
    }
    m.bursting = false;
    m.onCd = true;
    m.cdRemain = cdSec - pos; // 다음 폭딜까지 남은 초
    return filler;
  }

  function getProficiency(c, bossId, phase) {
    const b = c.proficiency[bossId];
    if (!b) return 0;
    return b[phase] ?? 0;
  }

  function setProficiency(c, bossId, phase, value) {
    if (!c.proficiency[bossId]) c.proficiency[bossId] = {};
    c.proficiency[bossId][phase] = clamp(value, 0, 100);
  }

  const AD_SPEC_KEYS = new Set(
    (B.adSpecs || []).map((s) => `${s.class}||${s.spec}`)
  );

  /** Heal → null (공증 제외). 그 외 AD 목록이면 AD, 아니면 AP */
  function getDamageSchool(c) {
    if (!c || c.role === "Heal") return null;
    return AD_SPEC_KEYS.has(`${c.class}||${c.spec}`) ? "AD" : "AP";
  }

  /**
   * 구인 Game 시너지 집계 (곱연산).
   * atkAd / atkAp / atkAll / drMult
   */
  function computeGameBuffs(members) {
    const list = B.gameSynergies || [];
    const covered = {};
    list.forEach((syn) => {
      covered[syn.id] = (members || []).some((m) => (syn.providers || []).includes(m.class));
    });
    let atkAd = 1;
    let atkAp = 1;
    let atkAll = 1;
    let drMult = 1;
    list.forEach((syn) => {
      if (!covered[syn.id]) return;
      if (syn.atkAd) atkAd *= 1 + syn.atkAd;
      if (syn.atkAp) atkAp *= 1 + syn.atkAp;
      if (syn.atkAll) atkAll *= 1 + syn.atkAll;
      if (syn.dr) drMult *= 1 - syn.dr;
    });
    return {
      covered,
      atkAd: atkAd * atkAll,
      atkAp: atkAp * atkAll,
      drMult,
      list,
    };
  }

  function synergyAtkMult(buffs, school) {
    if (!buffs || !school) return 1;
    if (school === "AD") return buffs.atkAd || 1;
    if (school === "AP") return buffs.atkAp || 1;
    return 1;
  }

  function calcFinalDPS(c, boss, phase, condition, buffs) {
    if (c.role === "Heal") return 0;
    const M = getProficiency(c, boss.id, phase);
    const base = c.role === "Tank" ? BASE_DPS * TANK_DPS_FACTOR : BASE_DPS;
    const school = c.damageSchool || getDamageSchool(c);
    const syn = synergyAtkMult(buffs, school);
    return (
      base *
      D(c.performanceScore) *
      M_dmg(M) *
      condition *
      bossBonus(c.specialty, boss.targetType) *
      syn
    );
  }

  function calcFinalHPS(c, boss, phase, condition) {
    if (c.role !== "Heal") return 0;
    const M = getProficiency(c, boss.id, phase);
    const mults = B.healer?.typeHpsMult || {};
    const typeMult = mults[c.healerType] ?? 1;
    return BASE_HPS * D(c.performanceScore) * M_dmg(M) * condition * typeMult;
  }

  function hasTankSaveAura(members) {
    return (members || []).some(
      (m) => m.alive && m.role === "Heal" && m.healerType === "TankSave"
    );
  }

  function makeNickname(langBias) {
    const ko = langBias === "ko" || (langBias !== "en" && Math.random() < 0.55);
    if (ko) return pick(NICK_KO_A) + pick(NICK_KO_B) + rndInt(1, 99);
    return pick(NICK_EN_A) + pick(NICK_EN_B) + rndInt(1, 99);
  }

  function weightedRoleSpec(specs) {
    const w = B.pool.roleWeights || {};
    const roll = Math.random();
    let role;
    if (roll < (w.Tank ?? 0.12)) role = "Tank";
    else if (roll < (w.Heal ?? 0.32)) role = "Heal";
    else if (roll < (w.Melee ?? 0.66)) role = "Melee";
    else role = "Ranged";
    const pool = specs.filter((s) => s.role === role);
    return pool.length ? pick(pool) : pick(specs);
  }

  function createCandidate(specs, bossList) {
    const spec = weightedRoleSpec(specs);
    const perf = B.pool.performance || {};
    const surv = B.pool.survival || {};
    const pot = B.pool.potential || {};
    const sp = B.pool.startProficiency || {};
    const performanceScore = Math.round(
      clamp(
        rnd(perf.min ?? 35, perf.max ?? 98) +
          (Math.random() < (perf.eliteChance ?? 0.08) ? rnd(0, perf.eliteBonus ?? 8) : 0),
        0,
        100
      )
    );
    const survivalScore = Math.round(clamp(rnd(surv.min ?? 30, surv.max ?? 97), 0, 100));
    const potential = Math.round(rnd(pot.min ?? 1.0, pot.max ?? 2.0) * 100) / 100;
    const proficiency = {};
    const vet = sp.veteran || { min: 5, max: 45 };
    const rook = sp.rookie || { min: 0, max: 20 };
    bossList.forEach((b) => {
      proficiency[b.id] = {};
      b.phases.forEach((p) => {
        proficiency[b.id][p.phase] =
          Math.random() < (sp.veteranChance ?? 0.25)
            ? rndInt(vet.min, vet.max)
            : rndInt(rook.min, rook.max);
      });
    });
    const damageSchool = getDamageSchool(spec);
    return {
      id: uid("c"),
      name: makeNickname(),
      class: spec.class,
      spec: spec.spec,
      role: spec.role,
      classKo: spec.classKo,
      specKo: spec.specKo,
      color: spec.color,
      synergies: [...(spec.synergies || [])],
      damageSchool,
      performanceScore,
      survivalScore,
      potential,
      proficiency,
      status: "idle",
      currentRaidId: null,
      rejectedRaidIds: [],
      specialty: spec.role === "Melee" || spec.role === "Ranged" ? pick(SPECIALTIES) : undefined,
      healerType: healerTypeFromSpec(spec),
      cdSec: assignCdSec(spec),
      applyingTo: null,
      appliedAt: null,
    };
  }

  function createPool(specs, bossList, n = POOL_SIZE) {
    return Array.from({ length: n }, () => createCandidate(specs, bossList));
  }

  function makeFixedMember(spec, bossList, score, prof) {
    const proficiency = {};
    bossList.forEach((b) => {
      proficiency[b.id] = {};
      b.phases.forEach((p) => {
        proficiency[b.id][p.phase] = prof;
      });
    });
    return {
      id: uid("dev"),
      name: makeNickname(),
      class: spec.class,
      spec: spec.spec,
      role: spec.role,
      classKo: spec.classKo,
      specKo: spec.specKo,
      color: spec.color,
      synergies: [...(spec.synergies || [])],
      damageSchool: getDamageSchool(spec),
      performanceScore: score,
      survivalScore: score,
      potential: 1.5,
      proficiency,
      status: "accepted",
      currentRaidId: "player",
      rejectedRaidIds: [],
      specialty: spec.role === "Melee" || spec.role === "Ranged" ? pick(SPECIALTIES) : undefined,
      healerType: healerTypeFromSpec(spec),
      cdSec: assignCdSec(spec),
      applyingTo: null,
      appliedAt: null,
    };
  }

  /**
   * 제작자용: 선발 20명을 딜/힐 점수·숙련 고정 + 시너지 전부 랜덤 스펙으로 채움
   */
  function fillDevTestRaid(raid, specs, bossList) {
    const score = 70;
    const prof = 10;
    const byRole = (role) => specs.filter((s) => s.role === role);
    const byClassRole = (cls, role) => specs.filter((s) => s.class === cls && s.role === role);
    const pickSpec = (pool) => (pool.length ? pick(pool) : null);

    // 기존 선발/후보 풀 복귀
    [...(raid.members || []), ...(raid.bench || [])].forEach((m) => {
      m.status = "idle";
      m.currentRaidId = null;
      m.applyingTo = null;
    });
    raid.members = [];
    raid.bench = [];
    raid.applicants = [];
    raid.combat = null;
    if (raid.state === "fighting") raid.state = "recruiting";

    const providers = [
      ...new Set((B.gameSynergies || []).flatMap((s) => s.providers || [])),
    ];

    /** 역할 슬롯: 탱2 힐4 딜14 — 시너지 제공 클래스 우선 배치 */
    const slots = [
      ...Array(TANK_NEED).fill("Tank"),
      ...Array(HEAL_MIN).fill("Heal"),
      ...Array(RAID_SIZE - TANK_NEED - HEAL_MIN).fill("DPS"),
    ];

    const usedClass = new Set();
    const chosenSpecs = [];

    // 1) 시너지 클래스부터 가능한 역할에 배치
    const providerQueue = [...providers].sort(() => Math.random() - 0.5);
    providerQueue.forEach((cls) => {
      const preferRoles = ["Tank", "Heal", "Melee", "Ranged"];
      let placed = false;
      for (const role of preferRoles) {
        const slotIdx = slots.findIndex((s, i) => {
          if (chosenSpecs[i]) return false;
          if (s === "DPS") return role === "Melee" || role === "Ranged";
          return s === role;
        });
        if (slotIdx < 0) continue;
        const pool =
          slots[slotIdx] === "DPS"
            ? specs.filter((s) => s.class === cls && (s.role === "Melee" || s.role === "Ranged"))
            : byClassRole(cls, slots[slotIdx]);
        const spec = pickSpec(pool);
        if (!spec) continue;
        chosenSpecs[slotIdx] = spec;
        usedClass.add(cls);
        placed = true;
        break;
      }
      if (!placed) {
        // 아무 빈 슬롯에라도
        const slotIdx = slots.findIndex((_, i) => !chosenSpecs[i]);
        if (slotIdx < 0) return;
        const want = slots[slotIdx];
        const pool =
          want === "DPS"
            ? specs.filter((s) => s.class === cls && (s.role === "Melee" || s.role === "Ranged"))
            : byClassRole(cls, want);
        const spec = pickSpec(pool.length ? pool : specs.filter((s) => s.class === cls));
        if (spec) {
          // 역할이 슬롯과 안 맞으면 스펙 역할에 맞는 빈 슬롯 재탐색
          const roleSlot = slots.findIndex((s, i) => {
            if (chosenSpecs[i]) return false;
            if (s === "DPS") return spec.role === "Melee" || spec.role === "Ranged";
            return s === spec.role;
          });
          if (roleSlot >= 0) {
            chosenSpecs[roleSlot] = spec;
            usedClass.add(cls);
          }
        }
      }
    });

    // 2) 빈 슬롯 랜덤 채우기
    for (let i = 0; i < slots.length; i++) {
      if (chosenSpecs[i]) continue;
      const want = slots[i];
      const pool =
        want === "DPS"
          ? specs.filter((s) => s.role === "Melee" || s.role === "Ranged")
          : byRole(want);
      chosenSpecs[i] = pickSpec(pool) || pick(specs);
    }

    raid.members = chosenSpecs.map((spec) => makeFixedMember(spec, bossList, score, prof));
    raid.state = isFull(raid) ? "ready" : "recruiting";
    return {
      ok: isFull(raid),
      covered: Object.values(computeGameBuffs(raid.members).covered).filter(Boolean).length,
      total: (B.gameSynergies || []).length,
      members: raid.members.length,
    };
  }

  /** AI 명성: min~max 균등 간격(높은 순) + 소폭 흔들림 → 페르소나 매칭 후 공대 번호에 무작위 배정 */
  function buildAiProfiles(n) {
    const R = B.recruit;
    const min = R.aiRep?.min ?? 40;
    const max = R.aiRep?.max ?? 95;
    const jitter = R.aiRep?.jitter ?? 2;
    const order = R.aiPersonaByRank || [];
    const usedNames = new Set();
    const profiles = Array.from({ length: n }, (_, k) => {
      const base = n > 1 ? max - ((max - min) * k) / (n - 1) : (min + max) / 2;
      const reputation = Math.round(clamp(base + rnd(-jitter, jitter), 1, 100));
      const personaId = order.length ? order[Math.min(order.length - 1, Math.floor((k / n) * order.length))] : null;
      const free = (R.aiPersonas?.[personaId]?.guilds || []).filter((g) => !usedNames.has(g.ko));
      const guild = free.length ? pick(free) : null;
      if (guild) usedNames.add(guild.ko);
      return { reputation, personaId, guild };
    });
    for (let i = profiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
    }
    return profiles;
  }

  function createRaid(id, name, nameKo, isPlayer, reputation, personaId) {
    const persona = !isPlayer && personaId ? B.recruit.aiPersonas?.[personaId] : null;
    const greedR = persona?.greed || [B.recruit.aiGreed?.min ?? 0.35, B.recruit.aiGreed?.max ?? 0.85];
    const speedR = persona?.speed || [B.recruit.aiSpeed?.min ?? 0.4, B.recruit.aiSpeed?.max ?? 1.0];
    return {
      id,
      name,
      nameKo,
      isPlayer: !!isPlayer,
      reputation,
      members: [],
      bench: [],
      applicants: [],
      state: "recruiting", // recruiting | ready | fighting | dead | victory
      tries: 0,
      bestPct: 100,
      firstKillSec: null,
      killOrder: null,
      combat: null,
      logs: [],
      aiGreed: rnd(greedR[0], greedR[1]),
      aiSpeed: rnd(speedR[0], speedR[1]),
      aiPersona: persona ? personaId : null,
      aiWeights: persona?.weights || null,
      aiProcMax: persona?.procMax ?? 2,
      aiRetryMult: persona?.retryMult ?? 1,
      battleRezMode: isPlayer ? "auto_tank_heal" : "auto_tank_heal",
    };
  }

  function roleCounts(members) {
    const c = { Tank: 0, Melee: 0, Ranged: 0, Heal: 0, DPS: 0 };
    members.forEach((m) => {
      c[m.role]++;
      if (m.role === "Melee" || m.role === "Ranged") c.DPS++;
    });
    return c;
  }

  /** 선발 명단(members)에 해당 역할 자리가 있는지 */
  function needsRole(raid, role) {
    const c = roleCounts(raid.members);
    const size = raid.members.length;
    if (size >= RAID_SIZE) return false;
    const tankLeft = Math.max(0, TANK_NEED - c.Tank);
    const healMinLeft = Math.max(0, HEAL_MIN - c.Heal);

    if (role === "Tank") return c.Tank < TANK_NEED;

    if (role === "Heal") {
      if (c.Heal >= HEAL_MAX) return false;
      // 탱 최소 자리 확보
      if (size + 1 + tankLeft > RAID_SIZE) return false;
      return true;
    }

    if (role === "Melee" || role === "Ranged") {
      // 탱·힐 최소 자리 확보 후 DPS
      if (size + 1 + tankLeft + healMinLeft > RAID_SIZE) return false;
      return true;
    }
    return false;
  }

  /** 플레이어: 선발 자리 또는 후보석이 있으면 지원 수신 */
  function canReceiveApplicant(raid, role) {
    if (needsRole(raid, role)) return true;
    if (raid.isPlayer && (raid.bench || []).length < BENCH_MAX) return true;
    return false;
  }

  function isFull(raid) {
    const c = roleCounts(raid.members);
    return (
      raid.members.length >= RAID_SIZE &&
      c.Tank >= TANK_NEED &&
      c.Heal >= HEAL_MIN &&
      c.Heal <= HEAL_MAX
    );
  }

  function canStart(raid) {
    return (
      isFull(raid) &&
      (raid.state === "recruiting" ||
        raid.state === "ready" ||
        raid.state === "dead" ||
        raid.state === "victory")
    );
  }

  function findOwned(raid, candidateId) {
    const mi = raid.members.findIndex((m) => m.id === candidateId);
    if (mi >= 0) return { list: "members", index: mi, member: raid.members[mi] };
    const bi = (raid.bench || []).findIndex((m) => m.id === candidateId);
    if (bi >= 0) return { list: "bench", index: bi, member: raid.bench[bi] };
    return null;
  }

  /** 선발 ↔ 후보 이동 / 서로 교체. 클릭 방출 대신 드래그용 */
  function relocateMember(raid, candidateId, targetList, swapWithId) {
    if (raid.state === "fighting") return false;
    if (targetList !== "members" && targetList !== "bench") return false;
    const from = findOwned(raid, candidateId);
    if (!from) return false;

    if (swapWithId) {
      const other = findOwned(raid, swapWithId);
      if (!other || other.member.id === from.member.id) return false;
      const aList = from.list === "members" ? raid.members : raid.bench;
      const bList = other.list === "members" ? raid.members : raid.bench;
      const tmp = aList[from.index];
      aList[from.index] = bList[other.index];
      bList[other.index] = tmp;
    } else {
      if (from.list === targetList) return true;
      if (targetList === "bench" && (raid.bench || []).length >= BENCH_MAX) return false;
      if (targetList === "members" && raid.members.length >= RAID_SIZE) return false;
      const [m] = (from.list === "members" ? raid.members : raid.bench).splice(from.index, 1);
      if (targetList === "members") raid.members.push(m);
      else {
        if (!raid.bench) raid.bench = [];
        raid.bench.push(m);
      }
    }

    if (isFull(raid) && raid.state === "recruiting") raid.state = "ready";
    else if (!isFull(raid) && (raid.state === "ready" || raid.state === "dead")) raid.state = "recruiting";
    return true;
  }

  /** 풀 생성 범위에서 나온 스탯 평균 — 가중치가 달라도 평균 점수가 같아지도록 보정용 */
  function poolStatMeans() {
    const perf = B.pool.performance || {};
    const surv = B.pool.survival || {};
    const sp = B.pool.startProficiency || {};
    const vet = sp.veteran || { min: 5, max: 45 };
    const rook = sp.rookie || { min: 0, max: 20 };
    const vc = sp.veteranChance ?? 0.25;
    return {
      perf: ((perf.min ?? 35) + (perf.max ?? 98)) / 2,
      surv: ((surv.min ?? 30) + (surv.max ?? 97)) / 2,
      prof: vc * ((vet.min + vet.max) / 2) + (1 - vc) * ((rook.min + rook.max) / 2),
      pot: 50,
    };
  }

  function weightedStatScore(stats, w) {
    return (
      stats.perf * (w.perf ?? 0) +
      stats.surv * (w.surv ?? 0) +
      stats.prof * (w.prof ?? 0) +
      stats.pot * (w.pot ?? 0)
    );
  }

  function scoreApplicant(c, boss, weights) {
    const base = B.recruit.scoreWeights || { perf: 0.45, surv: 0.35, prof: 0.2 };
    const w = weights || base;
    const stats = {
      perf: c.performanceScore,
      surv: c.survivalScore,
      prof: getProficiency(c, boss.id, 1),
      pot: clamp(((c.potential ?? 1) - 1) * 100, 0, 100),
    };
    const raw = weightedStatScore(stats, w);
    if (!weights) return raw;
    const means = poolStatMeans();
    const scale = weightedStatScore(means, base) / Math.max(1, weightedStatScore(means, w));
    return raw * scale;
  }

  /* =========================================================
   * 공간 시뮬 (전장) — 좌표는 오더 그림판과 같은 1024×576
   * ========================================================= */
  const AR = B.arena;
  const TICK = AR.tickSec ?? 0.1;
  const SUBSTEPS = Math.max(1, Math.round(1 / TICK));
  const RUN_SPEED = AR.runSpeed ?? 55;
  const BOSS_RADIUS = AR.bossRadius ?? 26;
  const MELEE_RANGE = AR.meleeRange ?? 48;
  const DEG = Math.PI / 180;
  const SPATIAL_SHAPES = new Set(["circle", "cone", "line"]);

  function arenaConfig(bossId) {
    const cfg = AR.maps?.[bossId] || {};
    return {
      mapBossId: cfg.mapBossId || null,
      bounds: cfg.bounds || AR.defaultBounds || { type: "circle", cx: 512, cy: 288, r: 236 },
      boss: { x: cfg.boss?.x ?? 512, y: cfg.boss?.y ?? 260, units: cfg.boss?.units ?? 1 },
      layout: { ...(AR.layout || {}), ...(cfg.layout || {}) },
    };
  }

  function insideBounds(b, x, y, pad = 8) {
    if (b.type === "rect") return x >= b.x0 + pad && x <= b.x1 - pad && y >= b.y0 + pad && y <= b.y1 - pad;
    return Math.hypot(x - b.cx, y - b.cy) <= b.r - pad;
  }

  function clampToBounds(b, x, y, pad = 8) {
    if (b.type === "rect") {
      return { x: clamp(x, b.x0 + pad, b.x1 - pad), y: clamp(y, b.y0 + pad, b.y1 - pad) };
    }
    const dx = x - b.cx;
    const dy = y - b.cy;
    const d = Math.hypot(dx, dy);
    const lim = b.r - pad;
    if (d <= lim) return { x, y };
    return { x: b.cx + (dx / d) * lim, y: b.cy + (dy / d) * lim };
  }

  /** 플레이어가 정한 자리: 전장 안, 보스 몸통 밖 */
  function fixHome(cfg, x, y) {
    let p = clampToBounds(cfg.bounds, x, y, 14);
    const dx = p.x - cfg.boss.x;
    const dy = p.y - cfg.boss.y;
    const d = Math.hypot(dx, dy);
    const min = BOSS_RADIUS + 10;
    if (d < min) {
      const k = d > 0.01 ? min / d : 1;
      p = clampToBounds(cfg.bounds, cfg.boss.x + (d > 0.01 ? dx * k : 0), cfg.boss.y + (d > 0.01 ? dy * k : min), 14);
    }
    return p;
  }

  /** 역할별 기본 자리. 보스는 +y(아래) 방향의 메인탱을 바라봄 · custom = 플레이어가 드래그로 정한 자리 */
  function computeLayout(members, bossId, custom) {
    const cfg = arenaConfig(bossId);
    const L = cfg.layout;
    const bx = cfg.boss.x;
    const by = cfg.boss.y;
    const tf = L.tankFront ?? 50;
    const side = L.offTankSide ?? 62;
    const tankSpots = [
      { x: bx, y: by + tf },
      { x: bx + side, y: by + tf * 0.7 },
      { x: bx - side, y: by + tf * 0.7 },
    ];
    const homes = {};
    members
      .filter((m) => m.role === "Tank")
      .forEach((m, i) => {
        homes[m.id] = { ...tankSpots[Math.min(i, tankSpots.length - 1)] };
      });
    const back = -Math.PI / 2;
    const ring = (list, rRange, arcDeg) => {
      const n = list.length;
      list.forEach((m, i) => {
        const f = n > 1 ? i / (n - 1) : 0.5;
        const a = back + (f - 0.5) * arcDeg * DEG;
        const r = i % 2 === 0 ? rRange[0] : rRange[1];
        homes[m.id] = { x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r };
      });
    };
    const arc = L.rangedArc ?? 250;
    ring(members.filter((m) => m.role === "Melee"), L.meleeR || [46, 66], L.meleeArc ?? 150);
    ring(members.filter((m) => m.role === "Ranged"), L.rangedR || [150, 205], arc);
    ring(members.filter((m) => m.role === "Heal"), L.healR || [118, 160], arc * 0.8);
    Object.keys(homes).forEach((id) => {
      const c = custom?.[id];
      homes[id] = c ? fixHome(cfg, c.x, c.y) : clampToBounds(cfg.bounds, homes[id].x, homes[id].y, 14);
    });
    return { homes, cfg, tankSpots };
  }

  function combatNow(cbt) {
    return (cbt?.t ?? 0) + (cbt?.sub ?? 0) * TICK;
  }

  function pointInHazard(h, x, y, margin = 0) {
    const dx = x - h.x;
    const dy = y - h.y;
    if (h.shape === "circle") return Math.hypot(dx, dy) <= h.radius + margin;
    if (h.shape === "cone") {
      const d = Math.hypot(dx, dy);
      if (d > h.len + margin) return false;
      if (d < BOSS_RADIUS * 0.6) return true;
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - h.rot), Math.cos(Math.atan2(dy, dx) - h.rot));
      return Math.abs(diff) <= (h.spread * DEG) / 2 + margin / Math.max(d, 1);
    }
    if (h.shape === "line") {
      const c = Math.cos(h.rot);
      const s = Math.sin(h.rot);
      const along = dx * c + dy * s;
      const across = -dx * s + dy * c;
      return along >= -margin && along <= h.len + margin && Math.abs(across) <= h.width / 2 + margin;
    }
    return false;
  }

  /** 피해야 할 영역: 대기 장판(같이 맞기 · 본인이 들고 있는 바닥 제외) + 남아있는 웅덩이 */
  function dangerAreas(cbt, m) {
    const list = cbt.hazards.filter((h) => h.mode !== "shared" && h.followId !== m?.id);
    return cbt.pools?.length ? list.concat(cbt.pools) : list;
  }

  /** (x,y)에서 가장 적게 움직이면서 areas 밖이고 prefer에 가까운 지점 */
  function freeSpot(cbt, x, y, areas, prefer, margin) {
    const unsafe = (px, py) => areas.some((h) => pointInHazard(h, px, py, margin));
    if (!unsafe(x, y)) return { x, y };
    const b = cbt.arena.bounds;
    const stepD = 14;
    let best = null;
    let bestScore = Infinity;
    for (let ring = 1; ring <= 30; ring++) {
      const d = ring * stepD;
      if (d > bestScore) break;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d;
        if (!insideBounds(b, px, py, 10) || unsafe(px, py)) continue;
        const score = d + 0.35 * Math.hypot(px - prefer.x, py - prefer.y);
        if (score < bestScore) {
          bestScore = score;
          best = { x: px, y: py };
        }
      }
    }
    return best || { x, y };
  }

  function findSafePoint(cbt, m) {
    return freeSpot(cbt, m.x, m.y, dangerAreas(cbt, m), cbt.homes[m.id] || m, AR.safeMargin ?? 10);
  }

  const MAX_CROSS = 6;

  /** 플레이어가 배치한 징표 (보스별) — square: 같이 맞는 바닥 1개 · cross: 장판 남기는 바닥 [여러 개] */
  function getMarkers(raid, bossId) {
    const mk = raid?.markers?.[bossId];
    if (!mk) return { cross: [] };
    if (mk.cross && !Array.isArray(mk.cross)) mk.cross = [mk.cross];
    if (!mk.cross) mk.cross = [];
    return mk;
  }

  /** 웅덩이에 덮인 기본 자리는 가장 가까운 빈 곳으로 옮기고, 웅덩이가 사라지면 원래 자리로 */
  function relocateHomes(cbt) {
    const pools = cbt.pools || [];
    Object.keys(cbt.baseHomes || {}).forEach((id) => {
      const base = cbt.baseHomes[id];
      const next = pools.length ? freeSpot(cbt, base.x, base.y, pools, base, 8) : { ...base };
      const cur = cbt.homes[id];
      if (!cur || Math.hypot(cur.x - next.x, cur.y - next.y) > 0.5) cbt.homes[id] = next;
    });
  }

  /**
   * 장판 깔 자리: X 징표마다 "웅덩이·다른 운반자 자리 밖에서 X에 가장 가까운 곳"을 구하고,
   * 그중 운반자에게 가장 가까운 곳으로 간다. X가 없으면 제자리.
   */
  function dropSpot(raid, cbt, m, h) {
    const crosses = getMarkers(raid, cbt.bossId).cross;
    if (!crosses.length) return { x: m.x, y: m.y };
    const pr = h.skill?.poolRadius ?? h.radius * 1.3;
    const taken = cbt.hazards.filter((o) => o !== h && o.mode === "drop" && o.dropSpot).map((o) => o.dropSpot);
    const blocked = (x, y) =>
      cbt.pools.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius + pr * 0.55) ||
      taken.some((s) => Math.hypot(x - s.x, y - s.y) < pr * 1.2);
    const b = cbt.arena.bounds;
    const spotNear = (X) => {
      const start = clampToBounds(b, X.x, X.y, 12);
      if (!blocked(start.x, start.y)) return start;
      for (let ring = 1; ring <= 40; ring++) {
        const d = ring * 10;
        let best = null;
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          const x = start.x + Math.cos(a) * d;
          const y = start.y + Math.sin(a) * d;
          if (!insideBounds(b, x, y, 12) || blocked(x, y)) continue;
          const toMe = Math.hypot(x - m.x, y - m.y);
          if (!best || toMe < best.toMe) best = { x, y, toMe };
        }
        if (best) return { x: best.x, y: best.y };
      }
      return start;
    };
    let best = null;
    crosses.forEach((X, i) => {
      const p = spotNear(X);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (!best || d < best.d) best = { x: p.x, y: p.y, d, crossIndex: i };
    });
    return { x: best.x, y: best.y, crossIndex: best.crossIndex };
  }

  /** 반응 지연(초) = base + scale × (1 − s/100) × F(M) ± jitter */
  function reactionDelay(s, M) {
    const R = AR.reaction || {};
    const j = R.jitter ?? 0.2;
    const v = (R.base ?? 0.3) + (R.scale ?? 1.5) * (1 - clamp(s, 0, 100) / 100) * Math.max(0, F(M));
    return Math.max(0.1, v + rnd(-j, j));
  }

  function spatialSpec(skill) {
    const def = AR.skillDefaults?.[skill.type] || {};
    const kind = skillKind(skill);
    const fallback = kind === "tankBuster" ? "buster" : kind === "random" ? "circle" : "raid";
    return { ...def, ...skill, shape: skill.shape || def.shape || fallback };
  }

  function pushFx(cbt, fx) {
    if (!cbt.fx) cbt.fx = [];
    cbt.fx.push({ t0: combatNow(cbt), dur: 0.8, ...fx });
  }

  function pruneFx(cbt, now) {
    if (cbt.fx?.length) cbt.fx = cbt.fx.filter((f) => f.t0 + f.dur >= now);
  }

  function livingTanks(cbt) {
    return cbt.members.filter((m) => m.alive && m.role === "Tank");
  }

  function sendHome(cbt, m, now) {
    if (!m.alive || m.reactAt != null || m.task) return;
    m.returnAt = now;
  }

  function swapHomes(cbt, a, b) {
    [cbt.homes[a], cbt.homes[b]] = [cbt.homes[b], cbt.homes[a]];
    if (cbt.baseHomes) [cbt.baseHomes[a], cbt.baseHomes[b]] = [cbt.baseHomes[b], cbt.baseHomes[a]];
  }

  /** 메인탱이 죽었으면 살아있는 탱이 정면 자리를 이어받음 */
  function ensureActiveTank(raid) {
    const cbt = raid.combat;
    const active = cbt.members.find((m) => m.id === cbt.activeTankId);
    if (active?.alive) return active;
    const next = livingTanks(cbt)[0];
    if (!next) return null;
    if (active) swapHomes(cbt, active.id, next.id);
    cbt.activeTankId = next.id;
    sendHome(cbt, next, combatNow(cbt));
    return next;
  }

  function swapTanks(raid) {
    const cbt = raid.combat;
    const active = ensureActiveTank(raid);
    const other = livingTanks(cbt).find((m) => m.id !== active?.id);
    if (!active || !other) return;
    swapHomes(cbt, active.id, other.id);
    cbt.activeTankId = other.id;
    const now = combatNow(cbt);
    sendHome(cbt, active, now);
    sendHome(cbt, other, now);
    pushFx(cbt, { kind: "taunt", memberId: other.id, dur: 1.4 });
    pushLog(raid, `탱 교대 — ${other.name} 도발`, "info");
    emitCombatEvent(raid, "taunt", { memberId: other.id });
  }

  function pickAimTarget(cbt, spec) {
    let pool = cbt.members.filter((m) => m.alive);
    if (spec.aim === "tank") {
      const act = cbt.members.find((m) => m.id === cbt.activeTankId && m.alive);
      if (act) return act;
    }
    if (spec.includeTanks !== true) pool = pool.filter((m) => m.role !== "Tank");
    return pool.length ? pick(pool) : null;
  }

  /** 장판 시전: 예고 → telegraph초 뒤 폭발. 안에 있는 대원은 반응 지연 후 회피 */
  function castSpatialSkill(raid, boss, phaseInfo, spec) {
    const cbt = raid.combat;
    const now = combatNow(cbt);
    const bp = cbt.bossPos;
    const castId = ++cbt.hazardSeq;
    const base = {
      castId,
      skillId: spec.id || spec.type,
      name: spec.nameKo || spec.name || spec.id,
      shape: spec.shape,
      radius: spec.radius ?? 52,
      spread: spec.spread ?? 60,
      len: spec.len ?? 300,
      width: spec.width ?? 54,
      castAt: now,
      at: now + (spec.telegraph ?? 3),
      fatal: !!spec.fatal,
      phase: phaseInfo.phase,
      mode: spec.mode || "zone",
      skill: spec,
    };
    const made = [];
    if (spec.at === "target" && spec.shape === "circle") {
      const carried = base.mode !== "zone";
      const pool = cbt.members.filter((m) => !m.task);
      const count = spec.count ?? (carried ? 1 : 3);
      selectSkillTargets({ ...spec, type: "random", count }, pool).forEach((m) => {
        made.push({
          ...base,
          id: `${castId}:${m.id}`,
          x: m.x,
          y: m.y,
          rot: 0,
          targetId: m.id,
          followId: carried ? m.id : null,
        });
      });
    } else {
      let rot = Math.PI / 2;
      if (spec.shape !== "circle") {
        const tgt = pickAimTarget(cbt, spec);
        rot = tgt ? Math.atan2(tgt.y - bp.y, tgt.x - bp.x) : rnd(0, Math.PI * 2);
      }
      made.push({ ...base, id: `${castId}:boss`, x: bp.x, y: bp.y, rot });
    }
    if (!made.length) return;
    cbt.hazards.push(...made);
    made.forEach((h) => {
      if (h.mode === "shared") assignSoak(raid, boss, h);
      else {
        if (h.mode === "drop") assignDrop(raid, boss, h);
        alertMembers(raid, boss, h);
      }
    });
    const label = spec.nameKo || spec.name || spec.id;
    const tag = base.mode === "shared" ? "같이 맞기" : base.mode === "drop" ? "장판 남김" : "예고";
    pushLog(raid, `[${tag}] ${label}${made.length > 1 ? ` ×${made.length}` : ""}`, "warn");
    emitCombatEvent(raid, "telegraph", { skillId: spec.id, count: made.length, mode: base.mode });
  }

  /** 운반/집결 임무 부여 — 반응 지연 후 시작, 멍때리면 제자리 */
  function giveTask(m, task, boss, phase, now) {
    const M = getProficiency(m, boss.id, phase || 1);
    m.task = task;
    m.reactAt = now + reactionDelay(m.survivalScore, M);
    const pf = hitChances(m.survivalScore, M).pfFatal * (AR.blunderMult ?? 1);
    m.blunder = Math.random() * 100 < pf ? "freeze" : null;
    m.returnAt = null;
  }

  /** 장판 남기는 바닥: 대상자가 X 징표(없으면 제자리)로 들고 감 */
  function assignDrop(raid, boss, h) {
    const cbt = raid.combat;
    const m = cbt.members.find((x) => x.id === h.followId);
    if (m) giveTask(m, { kind: "dropCarry", hazardId: h.id }, boss, h.phase, combatNow(cbt));
  }

  /** 같이 맞는 바닥: 대상자는 네모 징표(없으면 제자리)로, 가까운 대원들이 모여서 나눠 맞음 */
  function assignSoak(raid, boss, h) {
    const cbt = raid.combat;
    const now = combatNow(cbt);
    const carrier = cbt.members.find((x) => x.id === h.followId);
    if (carrier) giveTask(carrier, { kind: "soakCarry", hazardId: h.id }, boss, h.phase, now);
    const sq = getMarkers(raid, cbt.bossId).square;
    const dest = sq || { x: h.x, y: h.y };
    const need = Math.max(1, h.skill?.soakers ?? 5);
    cbt.members
      .filter((m) => m.alive && !m.task && m.role !== "Tank" && m.id !== h.followId)
      .sort((a, b) => Math.hypot(a.x - dest.x, a.y - dest.y) - Math.hypot(b.x - dest.x, b.y - dest.y))
      .slice(0, need - 1)
      .forEach((m) => {
        const a = rnd(0, Math.PI * 2);
        const r = rnd(0, h.radius * 0.55);
        const task = { kind: "soakHelp", hazardId: h.id, ox: Math.cos(a) * r, oy: Math.sin(a) * r };
        if (sq) task.anchor = clampToBounds(cbt.arena.bounds, sq.x, sq.y, 12);
        giveTask(m, task, boss, h.phase, now);
      });
  }

  function startTask(raid, cbt, m) {
    const h = cbt.hazards.find((x) => x.id === m.task.hazardId);
    if (!h) {
      m.task = null;
      return;
    }
    if (m.blunder === "freeze") {
      m.task.frozen = true;
      m.tx = m.x;
      m.ty = m.y;
      m.dodgeBlunder = "freeze";
      return;
    }
    m.task.active = true;
    m.task.phase = h.phase;
    if (m.task.kind === "dropCarry") {
      const p = dropSpot(raid, cbt, m, h);
      h.dropSpot = p;
      m.task.goal = p;
    } else if (m.task.kind === "soakCarry") {
      const sq = getMarkers(raid, cbt.bossId).square;
      let goal = sq ? clampToBounds(cbt.arena.bounds, sq.x, sq.y, 12) : { x: m.x, y: m.y };
      const dist = Math.hypot(goal.x - m.x, goal.y - m.y);
      const reach = Math.max(0, (h.at - combatNow(cbt) - 0.6) * RUN_SPEED);
      if (dist > reach && dist > 0) {
        const k = reach / dist;
        goal = { x: m.x + (goal.x - m.x) * k, y: m.y + (goal.y - m.y) * k };
      }
      m.task.goal = goal;
      h.meet = goal;
    }
    if (m.task.goal) {
      m.tx = m.task.goal.x;
      m.ty = m.task.goal.y;
    }
  }

  /** 임무 수행 중에도 다른 장판이 자기 자리/목표를 덮으면 반응 지연 후 피했다가 복귀 (웅덩이는 지나가기만 함) */
  function updateTask(cbt, m, now) {
    const task = m.task;
    if (!task.active) return;
    const h = cbt.hazards.find((x) => x.id === task.hazardId);
    if (!h) {
      m.task = null;
      return;
    }
    const anchor = h.meet || task.anchor || h;
    const goal =
      task.kind === "soakHelp"
        ? clampToBounds(cbt.arena.bounds, anchor.x + task.ox, anchor.y + task.oy, 10)
        : task.goal || { x: m.x, y: m.y };
    const threats = cbt.hazards.filter((o) => o.mode !== "shared" && o.followId !== m.id);
    const threatened = threats.some((o) => pointInHazard(o, m.x, m.y, 2) || pointInHazard(o, goal.x, goal.y, 2));
    if (threatened) {
      if (task.dodgeAt == null) {
        const M = getProficiency(m, cbt.bossId, task.phase || 1);
        task.dodgeAt = now + reactionDelay(m.survivalScore, M);
      }
      if (now >= task.dodgeAt - 1e-6) {
        const p = freeSpot(cbt, m.x, m.y, threats, goal, AR.safeMargin ?? 10);
        m.tx = p.x;
        m.ty = p.y;
      }
      return;
    }
    task.dodgeAt = null;
    m.tx = goal.x;
    m.ty = goal.y;
  }

  function clearTasksFor(cbt, hazardId) {
    cbt.members.forEach((m) => {
      if (m.task?.hazardId !== hazardId) return;
      m.task = null;
      m.reactAt = null;
      m.blunder = null;
      m.dodgeBlunder = null;
    });
  }

  function alertMembers(raid, boss, hz) {
    const cbt = raid.combat;
    const now = combatNow(cbt);
    cbt.members.forEach((m) => {
      if (!m.alive || m.reactAt != null || m.task || hz.followId === m.id) return;
      const inNow = pointInHazard(hz, m.x, m.y, 2);
      const inTarget = pointInHazard(hz, m.tx ?? m.x, m.ty ?? m.y, 2);
      const inHome = pointInHazard(hz, cbt.homes[m.id]?.x ?? m.x, cbt.homes[m.id]?.y ?? m.y, 2);
      if (!inNow && !inTarget && !(inHome && m.returnAt != null)) return;
      const M = getProficiency(m, boss.id, hz.phase || 1);
      m.reactAt = now + reactionDelay(m.survivalScore, M);
      const pf = hitChances(m.survivalScore, M).pfFatal * (AR.blunderMult ?? 1);
      m.blunder = Math.random() * 100 < pf ? (Math.random() < 0.5 ? "freeze" : "wrong") : null;
    });
  }

  function hitContext(cbt) {
    return {
      synDr: cbt.buffs?.drMult ?? 1,
      tankSaveDr: hasTankSaveAura(cbt.members) ? 1 - (B.healer?.tankSaveDr ?? 0.1) : 1,
      enrageAtk: cbt.enraged ? ENRAGE_DMG_MULT : 1,
    };
  }

  const DEATH_TEXT = {
    fatal: "즉사",
    zone: "장판 피격으로 사망",
    pool: "웅덩이에 서 있다가 사망",
    soak: "같이 맞기 인원 부족으로 사망",
    hit: "피격으로 사망",
  };

  /** 피해 1회 적용 (fatal은 받피 무시). 사망 시 true */
  function dealHit(raid, m, amount, reason, ctx) {
    const cbt = raid.combat;
    const dr = reason === "fatal" ? 1 : m.role === "Tank" ? ctx.synDr * ctx.tankSaveDr : ctx.synDr;
    const died = applyUnitDamage(m, reason === "fatal" ? m.hp : amount, reason, cbt.t, dr, raid);
    if (died) {
      cbt.deadCount += 1;
      pushLog(raid, `${m.name} ${DEATH_TEXT[reason] || "사망"}`, "bad");
    }
    return died;
  }

  /** 같이 맞는 바닥: 안에 있는 인원이 나눠 맞음. 1인 피해 = 기본 피격 × 필요인원 / 들어온 인원 */
  function detonateShared(raid, boss, h) {
    const cbt = raid.combat;
    const spec = h.skill || {};
    const ctx = hitContext(cbt);
    const need = Math.max(1, spec.soakers ?? 5);
    const inside = cbt.members.filter((m) => m.alive && pointInHazard(h, m.x, m.y, 4));
    clearTasksFor(cbt, h.id);
    pushFx(cbt, { kind: "soak", x: h.x, y: h.y, radius: h.radius, ok: inside.length >= need, dur: 0.8 });
    let deaths = 0;
    if (!inside.length) {
      cbt.members
        .filter((m) => m.alive)
        .forEach((m) => {
          if (dealHit(raid, m, skillBaseHit(m, spec, ctx.enrageAtk), "soak", ctx)) deaths += 1;
        });
      pushLog(raid, `[같이 맞기] ${h.name} — 아무도 안 맞음! 공대 전체 피해`, "bad");
    } else {
      const mult = need / inside.length;
      const reason = inside.length < need ? "soak" : "hit";
      inside.forEach((m) => {
        if (dealHit(raid, m, skillBaseHit(m, spec, ctx.enrageAtk) * mult, reason, ctx)) deaths += 1;
      });
      pushLog(raid, `[같이 맞기] ${h.name} — ${inside.length}/${need}명`, inside.length >= need ? "ok" : "warn");
    }
    emitCombatEvent(raid, "skill", {
      skillKind: "random",
      skillType: spec.type,
      skillId: spec.id,
      deaths,
      doubles: Math.max(0, need - inside.length),
    });
  }

  /** 장판 남기는 바닥: 운반자는 기본 피격, 같이 서 있던 사람은 2배 → 그 자리에 웅덩이 */
  function detonateDrop(raid, boss, h) {
    const cbt = raid.combat;
    const spec = h.skill || {};
    const ctx = hitContext(cbt);
    const doubleMult = B.unit.doubleHitMult ?? 2;
    let deaths = 0;
    cbt.members.forEach((m) => {
      if (!m.alive || !pointInHazard(h, m.x, m.y, 0)) return;
      const carrier = m.id === h.followId;
      const dmg = skillBaseHit(m, spec, ctx.enrageAtk) * (carrier ? 1 : doubleMult);
      if (dealHit(raid, m, dmg, carrier ? "hit" : "zone", ctx)) deaths += 1;
    });
    clearTasksFor(cbt, h.id);
    const now = combatNow(cbt);
    const pool = {
      id: `pool:${h.id}`,
      shape: "circle",
      mode: "pool",
      name: h.name,
      x: h.x,
      y: h.y,
      radius: spec.poolRadius ?? h.radius * 1.3,
      castAt: now,
      until: now + (spec.poolSec ?? 40),
      tickPct: spec.poolTickPct ?? 0.08,
      phase: h.phase,
    };
    cbt.pools.push(pool);
    pushFx(cbt, { kind: "boom", hazard: { ...h, skill: null }, dur: 0.6 });
    relocateHomes(cbt);
    alertMembers(raid, boss, pool);
    const crosses = getMarkers(raid, cbt.bossId).cross;
    const hasX = crosses.length > 0;
    const nearIdx = crosses.findIndex((X) => Math.hypot(pool.x - X.x, pool.y - X.y) <= pool.radius * 2.2);
    const xTag = !hasX ? "" : nearIdx >= 0 ? ` (X${crosses.length > 1 ? nearIdx + 1 : ""} 징표)` : " (X 징표 못 감)";
    pushLog(raid, `[장판 남김] ${h.name} → 웅덩이 생성${xTag}`, nearIdx >= 0 || !hasX ? "info" : "warn");
    emitCombatEvent(raid, "skill", { skillKind: "random", skillType: spec.type, skillId: spec.id, deaths, doubles: 0 });
  }

  /** 웅덩이: 초당 피해 · 만료 시 기본 자리 복구 */
  function tickPools(raid) {
    const cbt = raid.combat;
    if (!cbt.pools?.length) return;
    const before = cbt.pools.length;
    cbt.pools = cbt.pools.filter((p) => p.until > cbt.t);
    if (cbt.pools.length !== before) relocateHomes(cbt);
    if (!cbt.pools.length) return;
    const ctx = hitContext(cbt);
    cbt.members.forEach((m) => {
      if (!m.alive) return;
      const p = cbt.pools.find((pl) => pointInHazard(pl, m.x, m.y, 0));
      if (p) dealHit(raid, m, m.maxHp * p.tickPct * ctx.enrageAtk, "pool", ctx);
    });
  }

  function detonateGroup(raid, boss, group) {
    const cbt = raid.combat;
    const h0 = group[0];
    if (h0.mode === "shared") return group.forEach((h) => detonateShared(raid, boss, h));
    if (h0.mode === "drop") return group.forEach((h) => detonateDrop(raid, boss, h));
    const spec = h0.skill || {};
    const ctx = hitContext(cbt);
    const doubleMult = B.unit.doubleHitMult ?? 2;
    const hitNames = new Set();
    let deaths = 0;
    group.forEach((h) => {
      pushFx(cbt, { kind: "boom", hazard: { ...h, skill: null }, dur: 0.6 });
      cbt.members.forEach((m) => {
        if (!m.alive || !pointInHazard(h, m.x, m.y, 0)) return;
        hitNames.add(m.name);
        const reason = h.fatal ? "fatal" : "zone";
        if (dealHit(raid, m, skillBaseHit(m, spec, ctx.enrageAtk) * doubleMult, reason, ctx)) deaths += 1;
      });
    });
    const label = h0.name || spec.id;
    if (hitNames.size) pushLog(raid, `[장판] ${label} → 피격 ${[...hitNames].join(", ")}`, "warn");
    else pushLog(raid, `[장판] ${label} — 전원 회피`, "ok");
    emitCombatEvent(raid, "skill", {
      skillKind: skillKind(spec),
      skillType: spec.type,
      skillId: spec.id,
      deaths,
      doubles: hitNames.size,
    });
  }

  /** 0.1초 단위: 반응 → 복귀 판단 → 이동 → 장판 폭발 */
  function spatialStep(raid, boss) {
    const cbt = raid.combat;
    const now = combatNow(cbt);
    const bp = cbt.bossPos;
    const margin = AR.safeMargin ?? 10;
    const homeUnsafe = (m) => {
      const hm = cbt.homes[m.id];
      return !!hm && dangerAreas(cbt, m).some((h) => pointInHazard(h, hm.x, hm.y, margin));
    };

    cbt.members.forEach((m) => {
      if (!m.alive) {
        m.moving = false;
        m.task = null;
        return;
      }
      if (m.reactAt != null && now >= m.reactAt - 1e-6) {
        m.reactAt = null;
        if (m.task) {
          startTask(raid, cbt, m);
          m.blunder = null;
          return;
        }
        if (m.blunder === "freeze") {
          m.tx = m.x;
          m.ty = m.y;
        } else if (m.blunder === "wrong") {
          const a = rnd(0, Math.PI * 2);
          const p = clampToBounds(cbt.arena.bounds, m.x + Math.cos(a) * rnd(18, 36), m.y + Math.sin(a) * rnd(18, 36));
          m.tx = p.x;
          m.ty = p.y;
        } else {
          const p = findSafePoint(cbt, m);
          m.tx = p.x;
          m.ty = p.y;
        }
        m.dodgeBlunder = m.blunder;
        m.blunder = null;
        m.returnAt = null;
        return;
      }
      if (m.reactAt != null) return;
      if (m.task) {
        updateTask(cbt, m, now);
        return;
      }
      const hm = cbt.homes[m.id];
      if (!hm) return;
      const atHome = Math.hypot((m.tx ?? m.x) - hm.x, (m.ty ?? m.y) - hm.y) < 1;
      if (atHome || homeUnsafe(m)) {
        if (!atHome) m.returnAt = null;
        return;
      }
      if (m.returnAt == null) m.returnAt = now + (AR.returnDelay ?? 0.5);
      if (now >= m.returnAt - 1e-6) {
        m.tx = hm.x;
        m.ty = hm.y;
        m.returnAt = null;
        m.dodgeBlunder = null;
      }
    });

    const step = RUN_SPEED * TICK;
    const reach = BOSS_RADIUS + MELEE_RANGE;
    cbt.members.forEach((m) => {
      if (!m.alive) return;
      const dx = (m.tx ?? m.x) - m.x;
      const dy = (m.ty ?? m.y) - m.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const k = Math.min(1, step / d);
        m.x += dx * k;
        m.y += dy * k;
        m.moveAcc += TICK;
        m.moving = true;
      } else m.moving = false;
      if ((m.role === "Melee" || m.role === "Tank") && Math.hypot(m.x - bp.x, m.y - bp.y) > reach) {
        m.outAcc += TICK;
      }
    });

    cbt.hazards.forEach((h) => {
      if (!h.followId) return;
      const f = cbt.members.find((x) => x.id === h.followId);
      if (f?.alive) {
        h.x = f.x;
        h.y = f.y;
      }
      if (h.mode === "drop") alertMembers(raid, boss, h);
    });

    const due = cbt.hazards.filter((h) => now >= h.at - 1e-6);
    if (due.length) {
      cbt.hazards = cbt.hazards.filter((h) => now < h.at - 1e-6);
      const groups = new Map();
      due.forEach((h) => {
        if (!groups.has(h.castId)) groups.set(h.castId, []);
        groups.get(h.castId).push(h);
      });
      groups.forEach((g) => detonateGroup(raid, boss, g));
    }
    pruneFx(cbt, now);
  }

  /** 지난 1초의 이동/사거리 이탈 비율 → 출력 배율 (호출 시 누적치 초기화) */
  function takeMovementMult(m) {
    const moveFrac = clamp(m.moveAcc || 0, 0, 1);
    const outFrac = clamp(m.outAcc || 0, 0, 1);
    m.moveAcc = 0;
    m.outAcc = 0;
    if (m.role === "Melee" || m.role === "Tank") return 1 - outFrac;
    return 1 - moveFrac * (1 - (AR.moveOutputMult ?? 0.5));
  }

  /**
   * Discrete combat simulation for one try.
   * Returns result object; also mutates combat state for live playback.
   */
  function startCombat(raid, boss, speed = 20) {
    const members = raid.members.map((m) => {
      const maxHp = UNIT_MAX_HP[m.role] || 1000000;
      return {
        ...m,
        alive: true,
        condition: rnd(B.condition.min ?? 0.8, B.condition.max ?? 1.2),
        dpsDone: 0,
        hpsDone: 0, // effective healing only (actual HP restored)
        healCapacityDone: 0, // raw heal output attempted (includes overheal)
        tankHealDone: 0, // effective heal applied to tanks
        maxHp,
        hp: maxHp,
        damageTaken: 0,
        avoidableTaken: 0, // 즉사 전량 + 2배피격의 초과분만 (가피)
        healingTaken: 0,
        lastDamage: 0,
        lastDamageAt: -99,
        deathReason: null,
        lastDeathReason: null,
        diedAt: null,
        deathOrder: null,
        burstMult: null,
        burstWindowStart: null,
        bursting: false,
        onCd: false,
        cdRemain: 0,
        x: 0,
        y: 0,
        tx: null,
        ty: null,
        moving: false,
        reactAt: null,
        blunder: null,
        dodgeBlunder: null,
        returnAt: null,
        task: null,
        moveAcc: 0,
        outAcc: 0,
        mvMult: 1,
      };
    });
    const layout = computeLayout(members, boss.id, raid.formation?.[boss.id]);
    members.forEach((m) => {
      const hm = layout.homes[m.id] || { x: layout.cfg.boss.x, y: layout.cfg.boss.y + 120 };
      m.x = m.tx = hm.x;
      m.y = m.ty = hm.y;
    });
    const conditions = Object.fromEntries(members.map((m) => [m.id, m.condition]));
    const buffs = computeGameBuffs(members);
    const activeSyn = (B.gameSynergies || []).filter((s) => buffs.covered[s.id]).map((s) => s.nameKo || s.name);

    const bossHp = getBossHp(boss);
    const enrageSec = getBossEnrage(boss);
    raid.state = "fighting";
    raid.tries += 1;
    raid.combat = {
      bossId: boss.id,
      bossHp,
      bossMaxHp: bossHp,
      t: 0,
      enrage: enrageSec,
      enraged: false,
      members,
      conditions,
      buffs,
      lastSkillAt: {},
      deadCount: 0,
      speed,
      finished: false,
      result: null,
      phaseReached: 1,
      phasesCleared: new Set(),
      meter: { dps: 0, hps: 0 },
      events: [],
      healPool: 0,
      battleRezLeft: BATTLE_REZ_PER_TRY,
      tankWipeAt: null,
      deathLog: [],
      rezLog: [],
      sub: 0,
      arena: layout.cfg,
      bossPos: { x: layout.cfg.boss.x, y: layout.cfg.boss.y },
      homes: layout.homes,
      baseHomes: Object.fromEntries(Object.entries(layout.homes).map(([id, p]) => [id, { ...p }])),
      pools: [],
      hazards: [],
      hazardSeq: 0,
      fx: [],
      activeTankId: members.find((m) => m.role === "Tank")?.id || null,
    };
    raid.logs = [];
    pushLog(raid, `Try #${raid.tries} — ${boss.nameKo || boss.name} 시작`);
    emitCombatEvent(raid, "pull", { bossId: boss.id });
    if (activeSyn.length) {
      pushLog(raid, `시너지 ${activeSyn.length}개 활성`, "ok");
    }
    return raid.combat;
  }

  function memberSnapshot(m) {
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      class: m.class,
      classKo: m.classKo,
      spec: m.spec,
      specKo: m.specKo,
      color: m.color,
      alive: !!m.alive,
    };
  }

  function analyzeWipeCause(cbt, reason) {
    if (reason === "tank_wipe") {
      return { key: "tank_wipe", ko: "탱커 전멸", en: "Tank wipe" };
    }
    if (reason === "enrage") {
      return { key: "enrage", ko: "광폭화", en: "Enrage" };
    }
    const deaths = cbt.deathLog || [];
    const hitN = deaths.filter((d) => d.reason === "hit").length;
    const fatalN = deaths.filter((d) => d.reason === "fatal").length;
    const doubleN = deaths.filter((d) => d.reason === "double").length;
    const soakN = deaths.filter((d) => d.reason === "soak").length;
    const zoneN = deaths.filter((d) => d.reason === "zone" || d.reason === "pool").length;
    const total = deaths.length;
    if (cbt.enraged && (reason === "wipe" || total >= 5)) {
      return { key: "enrage", ko: "광폭화 이후 전멸", en: "Wipe after enrage" };
    }
    if (total >= 3 && hitN >= Math.max(3, Math.ceil(total * 0.45))) {
      return {
        key: "heal_starve",
        ko: "힐업 부족으로 말라죽는 사람 많음",
        en: "Many deaths from insufficient healing",
      };
    }
    if (soakN >= 3 && soakN >= zoneN) {
      return { key: "soak", ko: "같이 맞는 바닥 인원 부족", en: "Not enough soakers" };
    }
    if (zoneN >= 3 && zoneN >= fatalN + doubleN) {
      return { key: "zone", ko: "장판 회피 실패로 연쇄 사망", en: "Chain deaths from standing in zones" };
    }
    if (fatalN >= 3 && fatalN >= doubleN) {
      return { key: "fatal", ko: "즉사·생존 실패 다수", en: "Many fatal deaths" };
    }
    if (doubleN >= 3) {
      return { key: "double", ko: "2배 피격으로 연쇄 사망", en: "Chain deaths from double hits" };
    }
    return { key: "wipe", ko: "공대 전멸", en: "Raid wipe" };
  }

  function firstDeathsUnique(deathLog, n = 3) {
    const out = [];
    const seen = new Set();
    for (const d of deathLog || []) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
      if (out.length >= n) break;
    }
    return out;
  }

  function pickMvp(members) {
    if (!members?.length) return null;
    const dealers = members.filter((m) => m.role === "Melee" || m.role === "Ranged");
    const healers = members.filter((m) => m.role === "Heal");
    const avgD =
      dealers.reduce((s, m) => s + (m.dpsDone || 0), 0) / Math.max(1, dealers.length);
    const avgH =
      healers.reduce((s, m) => s + (m.hpsDone || 0), 0) / Math.max(1, healers.length);
    const maxAvoid = Math.max(1, ...members.map((m) => m.avoidableTaken || 0));
    let best = null;
    members.forEach((m) => {
      // 딜러 평균(or 힐러 평균) = 1인분. 탱도 딜러 평균 대비.
      const portions =
        m.role === "Heal"
          ? (m.hpsDone || 0) / Math.max(1, avgH)
          : (m.dpsDone || 0) / Math.max(1, avgD);
      // 가피(피할 수 있는 피해): 적을수록 좋음 → 1등이 0이면 clean=1
      const avoidNorm = (m.avoidableTaken || 0) / maxAvoid;
      const cleanPart = 1 - avoidNorm;
      let score = portions * 0.65 + cleanPart * 0.35;
      if (m.alive) score *= 1.08;
      if (!best || score > best.score) {
        best = {
          ...memberSnapshot(m),
          score,
          portions,
          cleanPart,
          avoidNorm,
          dpsDone: m.dpsDone || 0,
          hpsDone: m.hpsDone || 0,
          damageTaken: m.damageTaken || 0,
          avoidableTaken: m.avoidableTaken || 0,
        };
      }
    });
    return best;
  }

  function buildTrySummary(cbt, reason) {
    const members = cbt.members || [];
    const tSec = Math.max(1, cbt.t || 1);
    const dealers = members.filter((m) => m.role === "Melee" || m.role === "Ranged");
    const healers = members.filter((m) => m.role === "Heal");
    const avgD =
      dealers.reduce((s, m) => s + (m.dpsDone || 0), 0) / Math.max(1, dealers.length);
    const avgH =
      healers.reduce((s, m) => s + (m.hpsDone || 0), 0) / Math.max(1, healers.length);
    const dpsRank = [...members]
      .filter((m) => m.role !== "Heal")
      .sort((a, b) => (b.dpsDone || 0) - (a.dpsDone || 0))
      .map((m, i) => ({
        ...memberSnapshot(m),
        rank: i + 1,
        total: m.dpsDone || 0,
        rate: (m.dpsDone || 0) / tSec,
        portions: (m.dpsDone || 0) / Math.max(1, avgD),
      }));
    const hpsRank = [...members]
      .filter((m) => m.role === "Heal")
      .sort((a, b) => (b.hpsDone || 0) - (a.hpsDone || 0))
      .slice(0, 7)
      .map((m, i) => ({
        ...memberSnapshot(m),
        rank: i + 1,
        total: m.hpsDone || 0,
        rate: (m.hpsDone || 0) / tSec,
        overheal: Math.max(0, (m.healCapacityDone || 0) - (m.hpsDone || 0)),
        portions: (m.hpsDone || 0) / Math.max(1, avgH),
        tankHeal: m.tankHealDone || 0,
      }));
    const dtRank = [...members]
      .sort((a, b) => (b.avoidableTaken || 0) - (a.avoidableTaken || 0))
      .map((m, i) => ({
        ...memberSnapshot(m),
        rank: i + 1,
        total: m.avoidableTaken || 0,
        rawTaken: m.damageTaken || 0,
      }));
    const ok = reason === "kill";
    return {
      dpsRank,
      hpsRank,
      dtRank,
      avgDealerDps: avgD,
      avgHealerHps: avgH,
      firstDeaths: firstDeathsUnique(cbt.deathLog, 3),
      rezList: [...(cbt.rezLog || [])],
      wipeCause: ok ? null : analyzeWipeCause(cbt, reason),
      mvp: ok ? pickMvp(members) : null,
      enraged: !!cbt.enraged,
      t: cbt.t,
      hpPct: (cbt.bossHp / cbt.bossMaxHp) * 100,
    };
  }

  function applyUnitDamage(m, amount, reason, atTime, drMult, raid) {
    if (!m.alive) return false;
    let dmg = Math.max(0, amount);
    // 즉사(체력 전량)는 받피 시너지 미적용 — 그 외 피격은 곱연산 DR
    if (reason !== "fatal" && drMult != null && drMult !== 1) {
      dmg = Math.max(0, dmg * drMult);
    }
    m.hp = Math.max(0, m.hp - dmg);
    m.damageTaken += dmg;
    m.lastDamage = dmg;
    m.lastDamageAt = atTime ?? 0;
    // 가피: 즉사=전량, 2배피격=정상 1히트 초과분, 일반 피격=0
    if (!m.avoidableTaken) m.avoidableTaken = 0;
    if (reason === "fatal" || reason === "zone" || reason === "soak" || reason === "pool") {
      m.avoidableTaken += dmg;
    } else if (reason === "double") {
      const doubleMult = B.unit.doubleHitMult ?? 2;
      m.avoidableTaken += dmg * (1 - 1 / doubleMult);
    }
    if (m.hp <= 0) {
      m.alive = false;
      m.deathReason = reason || "death";
      m.lastDeathReason = m.deathReason;
      m.diedAt = atTime ?? raid?.combat?.t ?? 0;
      const cbt = raid?.combat;
      if (cbt) {
        const order = (cbt.deathLog?.length || 0) + 1;
        m.deathOrder = order;
        if (!cbt.deathLog) cbt.deathLog = [];
        cbt.deathLog.push({
          ...memberSnapshot(m),
          order,
          t: m.diedAt,
          reason: m.deathReason,
        });
        m.moving = false;
        m.reactAt = null;
        pushFx(cbt, { kind: "death", x: m.x, y: m.y, dur: 1 });
      }
      if (raid) emitCombatEvent(raid, "death", { memberId: m.id, reason: m.deathReason });
      return true;
    }
    return false;
  }

  function applyUnitHeal(m, amount) {
    if (!m.alive) return 0;
    const miss = m.maxHp - m.hp;
    const heal = Math.min(miss, Math.max(0, amount));
    m.hp += heal;
    m.healingTaken += heal;
    return heal;
  }

  function pushLog(raid, text, kind = "info") {
    raid.logs.unshift({ t: raid.combat?.t ?? 0, text, kind });
    if (raid.logs.length > 80) raid.logs.length = 80;
    if (raid.combat) {
      raid.combat.events.push({ t: raid.combat.t, text, kind });
    }
  }

  /** steps = 0.1초(TICK) 단위 서브스텝 수. SUBSTEPS번마다 1초 로직(딜/힐/스킬 시전) */
  function tickCombat(raid, boss, steps = SUBSTEPS) {
    const cbt = raid.combat;
    if (!cbt || cbt.finished) return cbt?.result || null;
    for (let s = 0; s < steps && !cbt.finished; s++) {
      cbt.sub = (cbt.sub || 0) + 1;
      if (cbt.sub >= SUBSTEPS) {
        cbt.sub = 0;
        _tickOneSecond(raid, boss);
        if (cbt.finished) break;
      }
      spatialStep(raid, boss);
      if (!cbt.members.some((m) => m.alive)) finishTry(raid, boss, "wipe");
    }
    return cbt.result;
  }

  function _tickOneSecond(raid, boss) {
    const cbt = raid.combat;
    cbt.t += 1;
    const living = cbt.members.filter((m) => m.alive);
    if (!living.length) {
      return finishTry(raid, boss, "wipe");
    }
    if (cbt.t > cbt.enrage && !cbt.enraged) {
      cbt.enraged = true;
      pushLog(raid, "광폭화! 보스가 격노합니다", "bad");
      emitCombatEvent(raid, "enrage", {});
    }

    // Tank wipe timer: no living tanks → wipe after TANK_WIPE_SEC
    const livingTanks = living.filter((m) => m.role === "Tank");
    if (!livingTanks.length) {
      if (cbt.tankWipeAt == null) {
        cbt.tankWipeAt = cbt.t + TANK_WIPE_SEC;
        pushLog(raid, `탱커 전멸! ${TANK_WIPE_SEC}초 후 전멸`, "bad");
      } else if (cbt.t >= cbt.tankWipeAt) {
        return finishTry(raid, boss, "tank_wipe");
      }
    } else {
      cbt.tankWipeAt = null;
    }

    // Auto battle rez (may revive tanks/healers before damage phase)
    processBattleRez(raid);

    const livingNow = cbt.members.filter((m) => m.alive);
    if (!livingNow.length) return finishTry(raid, boss, "wipe");
    ensureActiveTank(raid);
    cbt.members.forEach((m) => {
      m.mvMult = takeMovementMult(m);
    });

    const hpPct = (cbt.bossHp / cbt.bossMaxHp) * 100;
    const phaseInfo = getPhase(boss, hpPct);
    cbt.phaseReached = Math.max(cbt.phaseReached, phaseInfo.phase);

    boss.phases.forEach((p) => {
      if (hpPct <= p.hpPctEnd && !cbt.phasesCleared.has(p.phase)) {
        cbt.phasesCleared.add(p.phase);
        pushLog(raid, `페이즈 ${p.phase} 클리어`, "ok");
      }
    });

    let dpsSum = 0;
    let hpsSum = 0;

    // Dealers/tanks: damage boss (+ game synergy ATK). Healers excluded from ATK.
    const buffs = cbt.buffs || computeGameBuffs(cbt.members);
    livingNow.forEach((m) => {
      const cond = cbt.conditions[m.id];
      const dps =
        calcFinalDPS(m, boss, phaseInfo.phase, cond, buffs) * getCooldownMult(m, cbt.t, raid) * (m.mvMult ?? 1);
      m.dpsDone += dps;
      dpsSum += dps;
    });
    cbt.bossHp = Math.max(0, cbt.bossHp - dpsSum);

    if (cbt.bossHp <= 0) {
      cbt.meter = { dps: dpsSum, hps: 0 };
      return finishTry(raid, boss, "kill");
    }

    // Boss skills this phase (each skill has its own interval)
    const skills = getPhaseSkills(phaseInfo);
    skills.forEach((skill) => {
      const key = `p${phaseInfo.phase}:${skill.id || skill.type}`;
      if (cbt.lastSkillAt[key] == null) cbt.lastSkillAt[key] = cbt.t;
      const interval = skill.interval || phaseInfo.skillInterval || 10;
      if (cbt.t - cbt.lastSkillAt[key] >= interval) {
        cbt.lastSkillAt[key] = cbt.t;
        resolveBossSkill(raid, boss, phaseInfo, skill);
      }
    });
    tickPools(raid);

    const livingAfterHit = cbt.members.filter((m) => m.alive);
    if (!livingAfterHit.length) {
      cbt.meter = { dps: dpsSum, hps: 0 };
      return finishTry(raid, boss, "wipe");
    }

    // Healers: capacity = FinalHPS. Order: SingleBurst → Smart → BlanketAoE → TankSave
    const HEAL_ORDER = { SingleBurst: 0, Smart: 1, BlanketAoE: 2, TankSave: 3 };
    livingAfterHit
      .filter((m) => m.role === "Heal")
      .sort(
        (a, b) =>
          (HEAL_ORDER[a.healerType] ?? 99) - (HEAL_ORDER[b.healerType] ?? 99) ||
          a.name.localeCompare(b.name)
      )
      .forEach((h) => {
        const cond = cbt.conditions[h.id];
        const capacity = calcFinalHPS(h, boss, phaseInfo.phase, cond) * (h.mvMult ?? 1);
        h.healCapacityDone = (h.healCapacityDone || 0) + capacity;
        const effective = applyHealerHps(cbt, h, capacity);
        h.hpsDone += effective;
        hpsSum += effective;
      });

    cbt.meter = { dps: dpsSum, hps: hpsSum };

    if (!cbt.members.some((m) => m.alive)) finishTry(raid, boss, "wipe");
  }

  function battleRezCandidates(mode, dead) {
    if (mode === "auto_tank_heal") {
      // 탱/힐만 부활 — 딜러는 절대 자동 부활하지 않음
      return dead
        .filter((m) => m.role === "Tank" || m.role === "Heal")
        .sort(
          (a, b) =>
            (a.role === "Tank" ? 0 : 1) - (b.role === "Tank" ? 0 : 1) ||
            (a.lastDamageAt || 0) - (b.lastDamageAt || 0)
        );
    }
    // auto_any: 누구나, 죽은 시각 순
    return [...dead].sort((a, b) => (a.lastDamageAt || 0) - (b.lastDamageAt || 0));
  }

  function doBattleRez(raid, member) {
    const cbt = raid.combat;
    if (!cbt || cbt.finished || cbt.battleRezLeft <= 0) return false;
    if (!member || member.alive) return false;
    member.alive = true;
    member.hp = member.maxHp * BATTLE_REZ_HP;
    member.deathReason = null;
    member.diedAt = null;
    member.deathOrder = null;
    cbt.battleRezLeft -= 1;
    cbt.deadCount = Math.max(0, cbt.deadCount - 1);
    if (!cbt.rezLog) cbt.rezLog = [];
    cbt.rezLog.push({
      ...memberSnapshot(member),
      t: cbt.t,
      left: cbt.battleRezLeft,
    });
    if (cbt.members.some((m) => m.alive && m.role === "Tank")) cbt.tankWipeAt = null;
    member.tx = member.x;
    member.ty = member.y;
    member.reactAt = null;
    member.returnAt = null;
    member.moveAcc = 0;
    member.outAcc = 0;
    if (cbt.fx) pushFx(cbt, { kind: "rez", x: member.x, y: member.y, dur: 1.2 });
    pushLog(raid, `전투부활 → ${member.name} (남은 ${cbt.battleRezLeft})`, "ok");
    emitCombatEvent(raid, "rez", { memberId: member.id });
    return true;
  }

  function processBattleRez(raid) {
    const cbt = raid.combat;
    if (!cbt || cbt.battleRezLeft <= 0) return;
    const mode = raid.battleRezMode || "manual";
    if (mode === "manual") return;
    const dead = cbt.members.filter((m) => !m.alive);
    if (!dead.length) return;
    const ordered = battleRezCandidates(mode, dead);
    if (!ordered.length) return; // e.g. auto_tank_heal with only DPS dead
    doBattleRez(raid, ordered[0]);
  }

  /**
   * 힐러 타입별 분배 (용량은 calcFinalHPS에 타입 배수 반영됨)
   *  - BlanketAoE: 생존자 전원 균등 (1/N) — 만피에도 투입 → 오버힐 많음
   *  - TankSave: 비탱 1몫 · 탱 3몫 (동일 용량 가중) — 1몫=100이면 탱 300
   *  - SingleBurst: 최저 HP 1명에게 전부 → 풀피면 남는 양만 2번째 최저에게 (최대 2타겟, 추가 연쇄 없음)
   *  - Smart: HP% 최저 5명 균등
   * 반환 = 실힐(실제로 찬 HP)
   */
  function applyHealerHps(cbt, healer, capacity) {
    if (capacity <= 0) return 0;
    const type = healer.healerType || "Smart";
    const living = cbt.members.filter((m) => m.alive);
    if (!living.length) return 0;

    const byLowest = (arr) => [...arr].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    let effective = 0;
    const cast = (target, amount) => {
      if (!target || amount <= 0) return 0;
      const got = applyUnitHeal(target, amount);
      effective += got;
      if (got > 0 && target.role === "Tank") {
        healer.tankHealDone = (healer.tankHealDone || 0) + got;
      }
      return got;
    };
    const healEqual = (targets) => {
      if (!targets.length) return;
      const slice = capacity / targets.length;
      targets.forEach((m) => cast(m, slice));
    };

    const smartN = B.healer?.smartTargets ?? 5;

    if (type === "SingleBurst") {
      const ordered = byLowest(living);
      const primary = ordered[0];
      const secondary = ordered[1];
      const used = cast(primary, capacity);
      const leftover = capacity - used;
      // 1타겟 풀피 잉여분만 2번째에게 — 더 이상 연쇄하지 않음
      if (leftover > 0 && secondary) cast(secondary, leftover);
      return effective;
    }
    if (type === "Smart") {
      healEqual(byLowest(living).slice(0, smartN));
      return effective;
    }
    if (type === "TankSave") {
      const tankW = B.healer?.tankSaveTankWeight ?? 3;
      const tanks = living.filter((m) => m.role === "Tank");
      const others = living.filter((m) => m.role !== "Tank");
      const weightSum = others.length * 1 + tanks.length * tankW;
      if (weightSum <= 0) return 0;
      const oneShare = capacity / weightSum; // 1몫
      others.forEach((m) => cast(m, oneShare));
      tanks.forEach((m) => cast(m, oneShare * tankW));
      return effective;
    }
    // BlanketAoE (베이스 광역) — 전원 1/N
    healEqual(living);
    return effective;
  }

  function distributeHeals() {
    /* legacy no-op */
  }

  function skillBaseHit(m, skill, enrageAtk) {
    const hitPct = B.unit.hitPct || {};
    const abs = skill.hitPct;
    let pct;
    if (typeof abs === "number") pct = abs;
    else if (abs && typeof abs === "object") {
      pct = m.role === "Tank" ? abs.Tank ?? abs.Other ?? 0.1 : abs.Other ?? abs.Tank ?? 0.14;
    } else {
      pct = m.role === "Tank" ? hitPct.Tank ?? 0.1 : hitPct.Other ?? 0.14;
    }
    return m.maxHp * pct * enrageAtk * (skill.hitMult ?? 1);
  }

  /**
   * 공간 형태별 처리
   *  circle/cone/line : 예고 장판 생성 (폭발 판정은 spatialStep)
   *  raid             : 피할 수 없는 전체 피해 (기존 2배 피격 주사위 유지 · 즉사 없음)
   *  buster           : 메인탱 피격(생존기 타이밍 = 기존 2배/즉사 주사위) → 탱 교대
   */
  function resolveBossSkill(raid, boss, phaseInfo, skill) {
    const cbt = raid.combat;
    if (!cbt || !skill) return;
    const spec = spatialSpec(skill);
    if (SPATIAL_SHAPES.has(spec.shape)) {
      castSpatialSkill(raid, boss, phaseInfo, spec);
      return;
    }
    const living = cbt.members.filter((m) => m.alive);
    let targets;
    if (spec.shape === "buster") {
      const active = ensureActiveTank(raid);
      const tanks = livingTanks(cbt).sort((a, b) => (a.id === active?.id ? -1 : b.id === active?.id ? 1 : 0));
      targets = tanks.slice(0, Math.max(1, spec.count ?? 1));
    } else {
      targets = living;
    }
    if (!targets.length) return;
    const unavoidable = spec.shape === "raid";

    const kind = skillKind(skill);
    const doubleMult = B.unit.doubleHitMult ?? 2;
    const synDr = cbt.buffs?.drMult ?? 1;
    const tankSaveDr = hasTankSaveAura(cbt.members) ? 1 - (B.healer?.tankSaveDr ?? 0.1) : 1;
    const enrageAtk = cbt.enraged ? ENRAGE_DMG_MULT : 1;
    const fatalMult = skill.fatalMult ?? 1;
    const doubleChanceMult = skill.doubleMult ?? 1;
    let doubles = 0;
    let deaths = 0;
    const t = cbt.t;
    const hitNames = [];

    targets.forEach((m) => {
      if (!m.alive) return;
      const M = getProficiency(m, boss.id, phaseInfo.phase);
      const chances = hitChances(m.survivalScore, M);
      const pfDouble = Math.min(100, chances.pfDouble * doubleChanceMult);
      const pfFatal = unavoidable ? 0 : Math.min(100, chances.pfFatal * fatalMult);
      const roll = rnd(0, 100);
      const baseHit = skillBaseHit(m, skill, enrageAtk);
      const drMult = m.role === "Tank" ? synDr * tankSaveDr : synDr;
      hitNames.push(m.name);
      if (roll < pfFatal) {
        if (applyUnitDamage(m, m.hp, "fatal", t, 1, raid)) {
          cbt.deadCount += 1;
          deaths += 1;
          pushLog(raid, `${m.name} 즉사`, "bad");
        }
      } else if (roll < pfDouble) {
        if (applyUnitDamage(m, baseHit * doubleMult, "double", t, drMult, raid)) {
          cbt.deadCount += 1;
          deaths += 1;
          pushLog(raid, `${m.name} 2배 피격으로 사망`, "bad");
        }
        doubles += 1;
      } else {
        if (applyUnitDamage(m, baseHit, "hit", t, drMult, raid)) {
          cbt.deadCount += 1;
          deaths += 1;
          pushLog(raid, `${m.name} 피격으로 사망`, "bad");
        }
      }
    });

    const label = skill.nameKo || skill.name || skill.id || kind;
    const kindKo =
      kind === "tankBuster" ? "탱버스터" : kind === "random" ? `랜덤×${hitNames.length}` : skill.type === "aoe2" ? "광역2" : "광역";
    if (kind === "raid") {
      pushLog(raid, `[${kindKo}] ${label}`, "warn");
    } else {
      pushLog(raid, `[${kindKo}] ${label} → ${hitNames.join(", ")}`, "warn");
    }
    if (doubles) pushLog(raid, `2배 피격 ${doubles}명`, "warn");
    if (unavoidable) pushFx(cbt, { kind: "pulse", x: cbt.bossPos.x, y: cbt.bossPos.y, dur: 0.9 });
    else targets.forEach((m) => pushFx(cbt, { kind: "slam", memberId: m.id, x: m.x, y: m.y, dur: 0.7 }));
    emitCombatEvent(raid, "skill", {
      skillKind: kind,
      skillType: skill.type,
      skillId: skill.id,
      deaths,
      doubles,
    });
    if (spec.shape === "buster" && spec.swap !== false) swapTanks(raid);
  }

  function finishTry(raid, boss, reason) {
    const cbt = raid.combat;
    cbt.finished = true;
    const hpPct = (cbt.bossHp / cbt.bossMaxHp) * 100;
    raid.bestPct = Math.min(raid.bestPct, hpPct);

    // Proficiency growth for all members who participated
    applyGrowth(raid, boss, cbt);

    const summary = buildTrySummary(cbt, reason);
    let result;
    if (reason === "kill") {
      raid.state = "victory";
      result = { ok: true, reason, t: cbt.t, hpPct: 0, summary };
      pushLog(raid, `처치 성공! ${formatTime(cbt.t)}`, "ok");
      emitCombatEvent(raid, "kill", { title: "KILL" });
    } else {
      raid.state = "dead";
      result = { ok: false, reason, t: cbt.t, hpPct, summary };
      const cause = summary.wipeCause;
      pushLog(
        raid,
        `${cause?.ko || "전멸"} (${hpPct.toFixed(1)}% 남음 · ${formatTime(cbt.t)})`,
        "bad"
      );
      emitCombatEvent(raid, "wipe", { reason, title: "WIPE", cause: cause?.key });
    }
    cbt.result = result;
    cbt.summary = summary;
    return result;
  }

  function applyGrowth(raid, boss, cbt) {
    const BASE_GAIN = B.growth.baseGain ?? 6.5;
    const timeFactor = clamp(cbt.t / (cbt.enrage || getBossEnrage(boss) || ENRAGE_SEC), B.growth.minTimeFactor ?? 0.2, 1);
    const phaseBonus = B.growth.phaseClearBonus ?? 3.5;
    const deathPen = B.growth.deathPenalty ?? 0.75;

    cbt.members.forEach((m) => {
      const real = raid.members.find((x) => x.id === m.id);
      if (!real) return;
      const maxPhase = cbt.phaseReached;
      for (let ph = 1; ph <= maxPhase; ph++) {
        const cur = getProficiency(real, boss.id, ph);
        let gain = BASE_GAIN * real.potential * timeFactor * (0.55 + 0.45 * (ph / maxPhase));
        if (cbt.phasesCleared.has(ph)) gain += phaseBonus * real.potential;
        if (!m.alive && ph === maxPhase) gain *= deathPen;
        setProficiency(real, boss.id, ph, cur + gain);
      }
      m.proficiency = real.proficiency;
    });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function acceptCandidate(raid, candidate) {
    if (candidate.status === "accepted") return false;

    const preferMembers = needsRole(raid, candidate.role) && raid.members.length < RAID_SIZE;
    const canBench = raid.isPlayer && (raid.bench || []).length < BENCH_MAX;
    if (!preferMembers && !canBench) return false;

    candidate.status = "accepted";
    candidate.currentRaidId = raid.id;
    candidate.applyingTo = null;
    candidate.appliedAt = null;
    raid.applicants = raid.applicants.filter((a) => a.id !== candidate.id);

    if (preferMembers) raid.members.push(candidate);
    else {
      if (!raid.bench) raid.bench = [];
      raid.bench.push(candidate);
    }

    if (isFull(raid) && raid.state === "recruiting") raid.state = "ready";
    return true;
  }

  function rejectCandidate(raid, candidate) {
    // 거절해도 재지원 가능 — rejectedRaidIds에 기록하지 않음
    candidate.status = "idle";
    candidate.applyingTo = null;
    candidate.appliedAt = null;
    candidate.currentRaidId = null;
    raid.applicants = raid.applicants.filter((a) => a.id !== candidate.id);
  }

  /** Timeout return to pool — NOT a reject; can re-apply to same raid */
  function expireApplicant(raid, candidate) {
    candidate.status = "idle";
    candidate.applyingTo = null;
    candidate.appliedAt = null;
    candidate.currentRaidId = null;
    raid.applicants = raid.applicants.filter((a) => a.id !== candidate.id);
  }

  function expireStaleApplicants(raids, nowSec) {
    raids.forEach((r) => {
      [...r.applicants].forEach((c) => {
        if (c.appliedAt == null) c.appliedAt = nowSec;
        if (nowSec - c.appliedAt >= APPLY_EXPIRE_SEC) {
          expireApplicant(r, c);
        }
      });
    });
  }

  function releaseMember(raid, candidateId) {
    const found = findOwned(raid, candidateId);
    if (!found) return null;
    const list = found.list === "members" ? raid.members : raid.bench;
    const [m] = list.splice(found.index, 1);
    m.status = "idle";
    m.currentRaidId = null;
    m.applyingTo = null;
    if (raid.state === "ready" || raid.state === "dead") raid.state = "recruiting";
    return m;
  }

  /** 인재풀 전체 기준 실력 백분위 (0=최하 · 1=최상) */
  function poolQualityPct(pool, boss) {
    const scored = pool.map((c) => ({ id: c.id, s: scoreApplicant(c, boss) })).sort((a, b) => a.s - b.s);
    const n = Math.max(1, scored.length - 1);
    const pct = new Map();
    scored.forEach((x, i) => pct.set(x.id, i / n));
    return pct;
  }

  function repRange(raids) {
    const reps = raids.map((r) => r.reputation);
    const lo = Math.min(...reps);
    const hi = Math.max(...reps);
    return { lo, hi, span: Math.max(1, hi - lo) };
  }

  /** 지원자 → 공대 선호 가중 (자기 실력대 명성 공대에 몰림) */
  function applyWeight(raid, candPct, range) {
    const m = B.recruit.repMatch || {};
    const aim = range.lo + candPct * range.span;
    const d = raid.reputation - aim;
    const sigma = d > 0 ? m.sigmaUp ?? 13 : m.sigmaDown ?? 7;
    const match = Math.max(m.floor ?? 0.02, Math.exp(-0.5 * (d / sigma) ** 2));
    const popularity = Math.pow(Math.max(0.15, raid.reputation) / 100, m.popularityExp ?? 0.6);
    return match * popularity * (raid.isPlayer ? B.recruit.playerApplyWeight ?? 1.35 : 1);
  }

  /** AI 공대가 요구하는 최소 실력 백분위 */
  function aiRequiredPct(raid, range, globalClock, scarce) {
    const q = B.recruit.aiReqPct || {};
    const rank = (raid.reputation - range.lo) / range.span;
    let req = (q.lo ?? 0.12) + ((q.hi ?? 0.78) - (q.lo ?? 0.12)) * rank + (raid.aiGreed - 0.6) * (q.greedK ?? 0.15);
    if (scarce) req *= q.scarceMult ?? 0.8;
    const relaxStart = q.relaxStartSec ?? 150;
    if (globalClock > relaxStart) {
      const relaxed = req - Math.floor((globalClock - relaxStart) / 30) * (q.relaxPer30s ?? 0.03);
      req = Math.max(req * (q.relaxFloorMult ?? 0.6), relaxed);
    }
    return clamp(req, 0, 0.95);
  }

  /**
   * Each second: idle candidates apply — weighted toward raids whose reputation matches their skill.
   */
  function tickApplications(pool, raids, boss, nowSec) {
    const idle = pool.filter((c) => c.status === "idle");
    const openRaids = raids.filter((r) => r.state === "recruiting" || r.state === "ready" || r.state === "dead");
    if (!openRaids.length || !idle.length) return;
    const qualityPct = poolQualityPct(pool, boss);
    const range = repRange(raids);

    const ap = B.recruit.applyPerSec || {};
    const applyCount = Math.min(
      idle.length,
      rndInt(ap.baseMin ?? 1, ap.baseMax ?? 4) +
        (Math.random() < (ap.bonusChance ?? 0.55) ? 1 : 0) +
        (idle.length > (ap.idleBonusOver ?? 100) ? rndInt(0, ap.idleBonusMax ?? 3) : 0)
    );

    for (let i = 0; i < applyCount; i++) {
      const c = pick(idle.filter((x) => x.status === "idle"));
      if (!c) break;

      const targets = openRaids.filter(
        (r) =>
          canReceiveApplicant(r, c.role) &&
          r.applicants.length < (r.isPlayer ? B.recruit.playerQueueMax ?? 12 : B.recruit.aiQueueMax ?? 6) &&
          !r.applicants.some((a) => a.id === c.id)
      );
      if (!targets.length) continue;

      const candPct = qualityPct.get(c.id) ?? 0.5;
      const weights = targets.map((r) => applyWeight(r, candPct, range));
      const sum = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * sum;
      let chosen = targets[0];
      for (let j = 0; j < targets.length; j++) {
        roll -= weights[j];
        if (roll <= 0) {
          chosen = targets[j];
          break;
        }
      }

      c.status = "applying";
      c.applyingTo = chosen.id;
      c.appliedAt = nowSec;
      chosen.applicants.push(c);
    }

    expireStaleApplicants(raids, nowSec);

    // AI auto-recruit
    raids
      .filter((r) => !r.isPlayer && (r.state === "recruiting" || r.state === "ready" || r.state === "dead"))
      .forEach((r) => aiRecruitTick(r, boss, nowSec, qualityPct, range));
  }

  function aiRecruitTick(raid, boss, globalClock, qualityPct, range) {
    if (!raid.applicants.length) return;
    const R = B.recruit;
    const slowUntil = R.aiSlowUntil ?? 55;
    const midUntil = R.aiMidUntil ?? 100;
    const slowGate =
      globalClock < slowUntil ? R.aiSlowGate ?? 0.28 : globalClock < midUntil ? R.aiMidGate ?? 0.55 : 1;
    if (Math.random() > slowGate) return;

    // 성격 가중 점수 기준으로 좋은 지원자부터 검토
    const own = new Map(raid.applicants.map((c) => [c.id, scoreApplicant(c, boss, raid.aiWeights)]));
    raid.applicants.sort((a, b) => own.get(b.id) - own.get(a.id));

    const n = globalClock < slowUntil ? (Math.random() < 0.55 ? 1 : 0) : rndInt(0, raid.aiProcMax ?? 2);
    for (let i = 0; i < n && raid.applicants.length; i++) {
      const c = raid.applicants[0];
      if (!needsRole(raid, c.role)) {
        rejectCandidate(raid, c);
        continue;
      }
      const scarce =
        (c.role === "Tank" && roleCounts(raid.members).Tank < TANK_NEED) ||
        (c.role === "Heal" && roleCounts(raid.members).Heal < HEAL_MIN);
      const candPct = qualityPct.get(c.id) ?? 0.5;
      if (candPct >= aiRequiredPct(raid, range, globalClock, scarce)) {
        acceptCandidate(raid, c);
      } else if (
        !scarce &&
        Math.random() < (R.aiRejectChanceBase ?? 0.3) + raid.aiGreed * (R.aiRejectChanceGreed ?? 0.35)
      ) {
        rejectCandidate(raid, c);
      } else {
        raid.applicants.push(raid.applicants.shift());
      }
    }

    if (canStart(raid) && raid.state !== "fighting" && raid.state !== "victory") {
      if (
        globalClock > (R.aiStartAfterSec ?? 40) &&
        Math.random() < (R.aiPullChanceBase ?? 0.2) + raid.aiSpeed * (R.aiPullChanceSpeed ?? 0.35)
      ) {
        raid.state = "ready";
      }
    }
  }

  function GameEngine(opts) {
    const specs = opts.specs;
    this.bosses = BOSSES;
    this.bossIndex = 0;
    this.boss = BOSSES[0];
    this.pool = createPool(specs, BOSSES, POOL_SIZE);
    this.player = createRaid(
      "player",
      "Your Raid",
      "내 공대",
      true,
      opts.playerReputation ?? B.recruit.playerRepDefault ?? 86
    );
    const aiProfiles = buildAiProfiles(AI_COUNT);
    this.ai = aiProfiles.map((prof, i) =>
      createRaid(
        `ai_${i + 1}`,
        prof.guild?.en || `AI Raid ${i + 1}`,
        prof.guild?.ko || `AI 공대 ${i + 1}`,
        false,
        prof.reputation,
        prof.personaId
      )
    );
    this.raids = [this.player, ...this.ai];
    this.clock = 0;
    this.raceClock = 0;
    this.killCount = 0;
    this.running = false;
    this.paused = true;
    this.startedOnce = false;
    this.phase = "recruit";
    this.speed = 1;
    this.combatSpeed = B.sim.defaultCombatSpeed ?? 2;
    this._combatAcc = 0;
    this._timer = null;
    this.onUpdate = opts.onUpdate || (() => {});
    this.onCombatEvent = opts.onCombatEvent || (() => {});
    this.listeners = [];
    this._specs = specs;
    combatEventSink = (ev) => this.onCombatEvent(ev);
  }

  GameEngine.prototype.fillDevTestRaid = function () {
    if (this.player.state === "fighting") return { ok: false, reason: "fighting" };
    const result = fillDevTestRaid(this.player, this._specs, this.bosses);
    this.onUpdate();
    return result;
  };

  GameEngine.prototype.getRaids = function () {
    return this.raids;
  };

  GameEngine.prototype.setBoss = function (index) {
    this.bossIndex = index;
    this.boss = this.bosses[index];
  };

  GameEngine.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    const self = this;
    let acc = 0;
    let last = performance.now();
    const loop = (now) => {
      if (!self.running) return;
      const dt = (now - last) / 1000;
      last = now;
      if (!self.paused) {
        acc += dt * self.speed;
        while (acc >= 1) {
          self._tickSecond();
          acc -= 1;
        }
        self._tickCombats(dt);
      }
      self.onUpdate(self);
      self._timer = requestAnimationFrame(loop);
    };
    this._timer = requestAnimationFrame(loop);
  };

  GameEngine.prototype.pause = function () {
    this.paused = true;
  };

  GameEngine.prototype.resume = function () {
    if (!this.running) this.start();
    this.paused = false;
    this.startedOnce = true;
  };

  GameEngine.prototype.togglePause = function () {
    if (this.paused || !this.running) this.resume();
    else this.pause();
  };

  GameEngine.prototype.stop = function () {
    this.running = false;
    this.paused = true;
    if (this._timer) cancelAnimationFrame(this._timer);
    this._timer = null;
    if (combatEventSink && this.onCombatEvent) {
      /* keep sink while engine exists; cleared on next engine replace */
    }
  };

  GameEngine.prototype._tickSecond = function () {
    this.clock += 1;
    tickApplications(this.pool, this.raids, this.boss, this.clock);

    // AI auto-start tries
    this.ai.forEach((r) => {
      if (r.state === "ready" && isFull(r)) {
        startCombat(r, this.boss, this.combatSpeed);
      } else if (
        r.state === "dead" &&
        isFull(r) &&
        Math.random() < (B.recruit.aiRetryChance ?? 0.4) * r.aiSpeed * (r.aiRetryMult ?? 1)
      ) {
        startCombat(r, this.boss, this.combatSpeed);
      }
    });
  };

  GameEngine.prototype._tickCombats = function (dt) {
    // Nx = 실시간 1초당 전투 N초. 탭 복귀 시 폭주 방지로 dt 상한
    this._combatAcc = (this._combatAcc || 0) + this.combatSpeed * Math.min(dt, 0.25);
    const steps = Math.floor(this._combatAcc / TICK + 1e-9);
    if (steps < 1) return;
    this._combatAcc -= steps * TICK;
    this.raids.forEach((r) => {
      if (r.state === "fighting" && r.combat && !r.combat.finished) {
        const result = tickCombat(r, this.boss, steps);
        if (result?.ok) this._registerKill(r);
      }
    });
  };

  GameEngine.prototype._registerKill = function (raid) {
    if (raid.killOrder != null) return;
    this.killCount += 1;
    raid.killOrder = this.killCount;
    raid.firstKillSec = this.clock;
    raid.state = "victory";
  };

  GameEngine.prototype.accept = function (candidateId) {
    const c = this.pool.find((x) => x.id === candidateId);
    if (!c) return false;
    return acceptCandidate(this.player, c);
  };

  GameEngine.prototype.reject = function (candidateId) {
    const c = this.pool.find((x) => x.id === candidateId);
    if (!c) return;
    rejectCandidate(this.player, c);
  };

  GameEngine.prototype.startPlayerTry = function () {
    if (!canStart(this.player)) return false;
    if (this.paused || !this.running) this.resume();
    startCombat(this.player, this.boss, this.combatSpeed);
    return true;
  };

  GameEngine.prototype.retryPlayer = function () {
    if (!isFull(this.player)) return false;
    if (this.paused || !this.running) this.resume();
    startCombat(this.player, this.boss, this.combatSpeed);
    return true;
  };

  GameEngine.prototype.release = function (candidateId) {
    return releaseMember(this.player, candidateId);
  };

  GameEngine.prototype.relocate = function (candidateId, targetList, swapWithId) {
    return relocateMember(this.player, candidateId, targetList, swapWithId || null);
  };

  GameEngine.prototype.getMarkers = function () {
    return getMarkers(this.player, this.boss.id);
  };

  /**
   * kind: "square"(같이 맞는 바닥, 1개) | "cross"(장판 남기는 바닥, 최대 MAX_CROSS개)
   * cross는 index를 주면 그 징표를 옮기고, 없으면 새로 추가. 전투 중에도 즉시 반영. 반환: 배치된 index
   */
  GameEngine.prototype.setMarker = function (kind, x, y, index) {
    if (kind !== "square" && kind !== "cross") return null;
    const p = clampToBounds(arenaConfig(this.boss.id).bounds, x, y, 12);
    if (!this.player.markers) this.player.markers = {};
    const mk = getMarkers(this.player, this.boss.id);
    this.player.markers[this.boss.id] = mk;
    if (kind === "square") {
      mk.square = { x: p.x, y: p.y };
      return 0;
    }
    if (Number.isInteger(index) && mk.cross[index]) {
      mk.cross[index] = { x: p.x, y: p.y };
      return index;
    }
    if (mk.cross.length >= MAX_CROSS) return null;
    mk.cross.push({ x: p.x, y: p.y });
    return mk.cross.length - 1;
  };

  GameEngine.prototype.removeMarker = function (kind, index) {
    const mk = this.player.markers?.[this.boss.id];
    if (!mk) return;
    if (kind === "square") delete mk.square;
    else if (kind === "cross") getMarkers(this.player, this.boss.id).cross.splice(index, 1);
  };

  GameEngine.prototype.clearMarkers = function (kind) {
    const cur = this.player.markers?.[this.boss.id];
    if (!cur) return;
    if (kind === "cross") cur.cross = [];
    else if (kind) delete cur[kind];
    else delete this.player.markers[this.boss.id];
  };

  GameEngine.prototype.getFormation = function () {
    return this.player.formation?.[this.boss.id] || {};
  };

  /** 트라이 전 기본 자리 지정 (전투 중엔 불가) */
  GameEngine.prototype.setHome = function (memberId, x, y) {
    if (this.player.state === "fighting") return null;
    if (!this.player.members.some((m) => m.id === memberId)) return null;
    const p = fixHome(arenaConfig(this.boss.id), x, y);
    if (!this.player.formation) this.player.formation = {};
    const cur = this.player.formation[this.boss.id] || {};
    this.player.formation[this.boss.id] = { ...cur, [memberId]: { x: p.x, y: p.y } };
    return p;
  };

  GameEngine.prototype.resetFormation = function () {
    if (this.player.state === "fighting") return false;
    if (this.player.formation) delete this.player.formation[this.boss.id];
    return true;
  };

  GameEngine.prototype.setBattleRezMode = function (mode) {
    if (!["manual", "auto_any", "auto_tank_heal"].includes(mode)) return;
    this.player.battleRezMode = mode;
  };

  GameEngine.prototype.battleRez = function (memberId) {
    if (this.player.state !== "fighting" || !this.player.combat) return false;
    if (this.player.battleRezMode !== "manual") return false;
    const m = this.player.combat.members.find((x) => x.id === memberId);
    return doBattleRez(this.player, m);
  };

  GameEngine.prototype.standings = function () {
    return [...this.raids]
      .map((r) => ({
        id: r.id,
        name: r.nameKo || r.name,
        nameEn: r.name,
        isPlayer: r.isPlayer,
        reputation: r.reputation,
        persona: r.aiPersona,
        tries: r.tries,
        bestPct: r.bestPct,
        state: r.state,
        members: r.members.length,
        killOrder: r.killOrder,
        hpPct: r.combat && r.state === "fighting" ? (r.combat.bossHp / r.combat.bossMaxHp) * 100 : r.bestPct,
        combatT: r.combat?.t ?? 0,
      }))
      .sort((a, b) => {
        if (a.killOrder != null && b.killOrder != null) return a.killOrder - b.killOrder;
        if (a.killOrder != null) return -1;
        if (b.killOrder != null) return 1;
        return a.bestPct - b.bestPct || b.tries - a.tries;
      });
  };

  GameEngine.CONST = {
    BASE_DPS,
    ENRAGE_SEC,
    HP_BASELINE_SEC,
    ENRAGE_DMG_MULT,
    RAID_SIZE,
    NEED,
    TANK_NEED,
    HEAL_MIN,
    HEAL_MAX,
    BENCH_MAX,
    POOL_SIZE,
    AI_COUNT,
    D70,
    BOSS_HP,
    APPLY_EXPIRE_SEC,
    BATTLE_REZ_PER_TRY,
    TANK_WIPE_SEC,
    SPECIALTIES,
    SPECIALTY_KO,
    HEALER_TYPES,
    HEALER_TYPE_KO,
    TARGET_TYPE_KO,
  };
  GameEngine.BALANCE = BAL;
  GameEngine.math = {
    D,
    M_dmg,
    P,
    F,
    hitChances,
    bossBonus,
    getProficiency,
    formatTime,
    getDamageSchool,
    computeGameBuffs,
    synergyAtkMult,
    getBossHp,
    getBossEnrage,
    getPhaseSkills,
    skillKind,
    healerTypeFromSpec,
    getCooldownMult,
    assignCdSec,
  };
  GameEngine.arena = {
    TICK,
    SUBSTEPS,
    BOSS_RADIUS,
    MELEE_RANGE,
    config: arenaConfig,
    layout: computeLayout,
    MAX_CROSS,
    pointInHazard,
    combatNow,
    getMarkers,
  };

  global.RaidGameEngine = GameEngine;
})(window);
