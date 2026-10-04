/**
 * WoW Raid Commander — Balance Patch Table
 * -------------------------------------------------
 * 여기 숫자만 바꿔서 밸런스 패치하세요.
 * 수식 형태(D/M_dmg/P/F)는 유지하고, 계수·배율은 hazard / combat 등에서 조절합니다.
 *
 * 로드 순서: data.js → game-balance.js → game-engine.js → game-ui.js
 */
(function (global) {
  "use strict";

  global.RAID_GAME_BALANCE = {
    /* =========================================================
     * 1) 레이드 / 풀 / 경쟁 규모
     * ========================================================= */
    raid: {
      size: 20,
      // Tank 고정 2 · Heal 4~5 (5힐이면 DPS 13)
      need: { Tank: 2, Heal: 4, HealMax: 5, DPS: 14 },
      benchMax: 4, // 플레이어 후보 선수
      poolSize: 1000,
      aiCount: 10,
    },

    /* =========================================================
     * 2) 보스 HP · 광폭화 · 기준 딜 (스펙 기준점)
     *    기본 HP = baseDps * D(70) * effectiveDealers * hpBaselineSec
     *    보스 HP = 기본 HP * (boss.hpSec / hpBaselineSec)  또는 boss.hpSec 직접
     *    보스 HP = baseDps * D(70) * effectiveDealers * (boss.hpSec ?? hpBaselineSec)
     *    광폭화 시각 = boss.enrageSec ?? enrageSec  (HP와 독립)
     *    effectiveDealers = 14딜 + 탱2(=1인분) = 15
     * ========================================================= */
    combat: {
      baseDps: 100000, // 딜러 1인 기준 BaseDPS
      tankDpsFactor: 0.5, // 탱커는 BaseDPS의 몇 배
      baseHps: 90000, // 힐러 1인 기준 BaseHPS (D(s)·M_dmg 적용 전)
      hpBaselineSec: 300, // HP 산출 기준 초 (보스 hpSec 미지정 시)
      enrageSec: 300, // 보스 enrageSec 미지정 시 기본 광폭화
      enrageDamageMult: 5, // 광폭화 후 보스 피격 배율
      effectiveDealerSlots: 15, // HP 산출용 (14딜 + 탱 1인분)
      // D(s)=1+(s/100)^exponent  — 스펙 고정값, 참고용으로만 노출
      dExponent: 0.65,
      baselineScore: 70, // D(70) 기준점
    },

    /* =========================================================
     * 3) 유닛 HP · 피격 피해량
     * ========================================================= */
    unit: {
      maxHp: {
        Tank: 1500000,
        Heal: 1000000,
        Melee: 1000000,
        Ranged: 1000000,
      },
      // 보스 스킬 1회 기본 피격 (maxHp 비율) — 실제 HP에서 차감, 0이면 사망
      hitPct: { Tank: 0.1, Other: 0.14 },
      doubleHitMult: 2, // 2배 피격 시 baseHit 배수
    },

    /* =========================================================
     * 3b) 2배 피격 / 즉사 확률 (보스 스킬마다 주사위 0~100)
     *
     *   P(s) = pBase + pScale * (1 - s/100)^pExp     (s = 생존점수 0~100)
     *   F(M) = fBase - (M - fPivot) / fSpan           (M = 페이즈 숙련 0~100)
     *   Pf_double = min(pfCap, P(s) * F(M)) * doubleChanceMult   (%)
     *   Pf_fatal  = Pf_double / fatalDiv * fatalChanceMult       (%)
     *
     *   주사위 < Pf_fatal  → 즉사 (HP=0)
     *   주사위 < Pf_double → 2배 피격
     *   그 외              → 기본 피격
     *
     * 예시 (기본값, M=70 → F=1):
     *   s=0  → P=90,  double≈90%,  fatal≈9%
     *   s=70 → P≈23,  double≈23%,  fatal≈2.3%
     *   s=100→ P=1,   double≈1%,   fatal≈0.1%
     * ========================================================= */
    hazard: {
      // P(s)
      pBase: 1,
      pScale: 89,
      pExp: 1.16,
      // F(M)
      fBase: 1.0,
      fPivot: 70, // 숙련 기준점 (M=70 → F=1)
      fSpan: 60, // (M-70)/60 → M=100이면 F=0.5, M=0이면 F≈2.167
      // 최종 확률
      pfCap: 100, // Pf_double 상한 (%)
      fatalDiv: 10, // Pf_fatal = Pf_double / fatalDiv
      // 추가 배율 (난이도 패치용, 기본 1)
      doubleChanceMult: 1.0,
      fatalChanceMult: 0.1,
    },

    /* =========================================================
     * 4) 전투부활 · 탱커 전멸
     * ========================================================= */
    survival: {
      battleRezPerTry: 3,
      battleRezHpRatio: 0.4, // 부활 시 현재 HP = maxHp * 이 값
      tankWipeSec: 10, // 탱커 전원 사망 후 전멸까지 초
    },

    /* =========================================================
     * 5) 숙련도 성장 (트라이 후 ΔM)
     * ========================================================= */
    growth: {
      baseGain: 6.5, // 기본 상승분 (× potential)
      phaseClearBonus: 3.5, // 페이즈 클리어 보너스 (× potential)
      minTimeFactor: 0.2, // 생존 시간 비율 하한
      deathPenalty: 0.75, // 해당 페이즈에서 죽은 멤버 배율
    },

    /* =========================================================
     * 6) 트라이 컨디션 · 보스 특성 보너스
     * ========================================================= */
    condition: {
      min: 0.8,
      max: 1.2,
    },
    bossBonus: {
      match: 1.15, // 특성 일치
      mismatch: 1.0,
      allRounder: 1.05,
    },

    /* =========================================================
     * 6b) 딜러 쿨기 (트라이 중 DPS 리듬)
     *    - 오프닝 t=0(첫 초)부터 전원 폭딜 20초
     *    - 1.5분(90s) / 2분(120s) · LCM=6분(360s)에 재정렬
     *    - 평타·폭딜 배율은 6분 기대 DPS=1.0 기준 (현재 선형 DPS와 동일)
     *    - 폭딜 배율은 창(20초) 시작 시 1회 롤 → 추월 연출
     *    - 스펙별 배정(specCds)은 나중에 채움 · 지금은 임시 비율
     * ========================================================= */
    cooldown: {
      burstSec: 20,
      alignSec: 360,
      fillerMult: 11 / 14, // ≈0.7857
      // 1.5분: 폭딜 80초 · 평타 280초 → burst 평균 1.75면 6분 평균 1.0
      cd90: { cdSec: 90, burstMin: 1.5, burstMax: 2.0 },
      // 2분: 폭딜 60초 · 평타 300초 → burst 평균 29/14≈2.0714면 6분 평균 1.0
      cd120: {
        cdSec: 120,
        burstMin: 29 / 14 - 0.25, // ≈1.8214
        burstMax: 29 / 14 + 0.25, // ≈2.3214
      },
      // 임시: 딜러 중 2분 쿨 비율 (스펙 고정 전까지)
      twoMinChance: 0.5,
      // 나중에: "Class||Spec" → 90 | 120
      specCds: {},
      // 폭딜 중 레이드프레임 중앙 아이콘 (Wowhead CDN 파일명)
      burstIcons: {
        "Death Knight|Frost": { icon: "spell_deathknight_pillaroffrost", nameKo: "냉기의 기둥", name: "Pillar of Frost" },
        "Death Knight|Unholy": { icon: "ability_deathknight_summongargoyle", nameKo: "가고일 소환", name: "Summon Gargoyle" },
        "Demon Hunter|Havoc": { icon: "ability_demonhunter_metamorphasisdps", nameKo: "탈태", name: "Metamorphosis" },
        "Demon Hunter|Devourer": { icon: "ability_demonhunter_eyebeam", nameKo: "안광", name: "Eye Beam" },
        "Druid|Balance": { icon: "spell_nature_starfall", nameKo: "천체의 정렬", name: "Celestial Alignment" },
        "Druid|Feral": { icon: "ability_druid_berserk", nameKo: "광폭화", name: "Berserk" },
        "Evoker|Devastation": { icon: "ability_evoker_dragonrage", nameKo: "용의 분노", name: "Dragonrage" },
        "Evoker|Augmentation": { icon: "ability_evoker_black_attunement", nameKo: "영원의 힘", name: "Ebon Might" },
        "Hunter|Beast Mastery": { icon: "ability_hunter_bestialwrath", nameKo: "야수의 격노", name: "Bestial Wrath" },
        "Hunter|Marksmanship": { icon: "ability_trueshot", nameKo: "정조준", name: "Trueshot" },
        "Hunter|Survival": { icon: "ability_hunter_coordinationshots", nameKo: "협공", name: "Coordinated Assault" },
        "Mage|Arcane": { icon: "ability_mage_arcanesurge", nameKo: "비전 쇄도", name: "Arcane Surge" },
        "Mage|Fire": { icon: "spell_fire_sealoffire", nameKo: "발화", name: "Combustion" },
        "Mage|Frost": { icon: "spell_frost_coldhearted", nameKo: "얼음 핏줄", name: "Icy Veins" },
        "Monk|Windwalker": { icon: "spell_monk_stormearthandfire", nameKo: "폭풍·대지·불", name: "Storm, Earth, and Fire" },
        "Paladin|Retribution": { icon: "spell_holy_avenginewrath", nameKo: "응징의 격노", name: "Avenging Wrath" },
        "Priest|Shadow": { icon: "spell_priest_voidform", nameKo: "공허의 형상", name: "Voidform" },
        "Rogue|Assassination": { icon: "ability_rogue_deadlybrew", nameKo: "죽음표식", name: "Deathmark" },
        "Rogue|Outlaw": { icon: "ability_rogue_adrenaline_rush", nameKo: "아드레날린 촉진", name: "Adrenaline Rush" },
        "Rogue|Subtlety": { icon: "ability_stealth", nameKo: "어둠의 춤", name: "Shadow Dance" },
        "Shaman|Elemental": { icon: "spell_fire_elemental_totem", nameKo: "폭풍의 정령", name: "Storm Elemental" },
        "Shaman|Enhancement": { icon: "spell_fire_elementaldevastation", nameKo: "승천", name: "Ascendance" },
        "Warlock|Affliction": { icon: "spell_shadow_soulleech_3", nameKo: "암흑시선 소환", name: "Summon Darkglare" },
        "Warlock|Demonology": { icon: "ability_warlock_demonicempowerment", nameKo: "악마 폭군 소환", name: "Summon Demonic Tyrant" },
        "Warlock|Destruction": { icon: "spell_shadow_summoninfernal", nameKo: "지옥불정령 소환", name: "Summon Infernal" },
        "Warrior|Arms": { icon: "ability_warrior_colossussmash", nameKo: "거인의 강타", name: "Colossus Smash" },
        "Warrior|Fury": { icon: "warrior_talent_icon_innerrage", nameKo: "무모한 희생", name: "Recklessness" },
        _default: { icon: "ability_warrior_innerrage", nameKo: "쿨기", name: "Burst" },
      },
    },

    /* =========================================================
     * 7) 인재풀 생성 (스탯·역할 분포)
     * ========================================================= */
    pool: {
      // 역할 가중 (누적 확률)
      roleWeights: {
        // 공대 수요 비율에 맞춤: 탱 2/20=10% · 힐 4~5/20≈22% · 딜 ~68%
        Tank: 0.11, // 탱 ~11% (풀 1000 기준 ~110명)
        Heal: 0.33, // Tank~Heal → 힐 ~22%
        Melee: 0.66, // 근딜 ~33% · 나머지 원딜 ~34%
      },
      performance: { min: 35, max: 98, eliteChance: 0.08, eliteBonus: 8 },
      survival: { min: 30, max: 97 },
      potential: { min: 1.0, max: 2.0 },
      // 시작 숙련도
      startProficiency: {
        veteranChance: 0.25,
        veteran: { min: 5, max: 45 },
        rookie: { min: 0, max: 20 },
      },
    },

    /* =========================================================
     * 8) 구인 · 지원 유입
     * ========================================================= */
    recruit: {
      applyExpireSec: 30, // 지원 만료 (거절 아님)
      playerRepDefault: 86,
      // AI 명성: min~max 균등 간격 분포 (+ 소폭 흔들림) · 공대 번호와는 무작위 매칭
      aiRep: { min: 40, max: 95, jitter: 2 },
      playerApplyWeight: 1.35, // 플레이어 공대 지원 가중
      playerQueueMax: 12,
      aiQueueMax: 6,
      // 초당 지원 유입량 (전체 공대 합산 후 명성 가중 분배)
      // v1.3: ~3/s → ~0.75/s (약 1/4)
      applyPerSec: { baseMin: 1, baseMax: 2, bonusChance: 0.25, idleBonusOver: 150, idleBonusMax: 1 },
      // AI 초반 슬로우스타트 (초)
      aiSlowUntil: 55,
      aiMidUntil: 100,
      aiSlowGate: 0.28, // 초반 AI 처리 확률
      aiMidGate: 0.55,
      aiStartAfterSec: 40, // 이 시각 이후부터 AI 트라이 준비
      // AI 수락 기준
      aiScoreBase: 42,
      aiScoreGreed: 35, // threshold = base + greed * aiGreed
      aiEarlyFill: 0.35, // 인원 비율 미만이면 문턱 완화
      aiEarlyBarMult: 0.7,
      aiScarceBarMult: 0.45, // 탱/힐 부족 시 수락 문턱 배율
      aiRejectChanceBase: 0.3,
      aiRejectChanceGreed: 0.35,
      aiPullChanceBase: 0.2,
      aiPullChanceSpeed: 0.35,
      aiRetryChance: 0.4, // 전멸 후 재도전 확률 × aiSpeed
      // AI 성격 범위 (페르소나 미지정 시 폴백)
      aiGreed: { min: 0.35, max: 0.85 },
      aiSpeed: { min: 0.4, max: 1.0 },
      // 지원자 평가 가중
      scoreWeights: { perf: 0.45, surv: 0.35, prof: 0.2 },

      /*
       * AI 구인 성격 (페르소나)
       *  greed    : 높을수록 수락 문턱↑ · 미달자 거절 확률↑
       *  speed    : 높을수록 문턱 완화 · 출발/재도전 빠름
       *  weights  : 지원자 평가 가중 (perf/surv/prof/pot) — 평균 점수가 같도록 자동 보정
       *  procMax  : 초당 지원서 처리 최대 수
       *  retryMult: 전멸 후 재도전 확률 배수
       *  guilds   : 이 성격 공대가 쓸 이름 후보 (시즌마다 겹치지 않게 무작위)
       */
      aiPersonas: {
        elite: {
          nameKo: "명문", name: "Elite",
          descKo: "고스펙만 엄선 · 거절 많음 · 신중한 출발", desc: "Picky, high standards, careful pulls",
          greed: [0.85, 0.95], speed: [0.5, 0.6],
          weights: { perf: 0.5, surv: 0.35, prof: 0.15 }, procMax: 2, retryMult: 0.9,
          guilds: [
            { ko: "왕좌의 서약", en: "Oath of the Throne" },
            { ko: "황금 사자단", en: "Golden Lions" },
            { ko: "은빛 왕관", en: "Silver Crown" },
          ],
        },
        hardcore: {
          nameKo: "하드코어", name: "Hardcore",
          descKo: "딜 최우선 · 빠른 트라이", desc: "DPS first, fast pulls",
          greed: [0.7, 0.8], speed: [0.9, 1.0],
          weights: { perf: 0.65, surv: 0.2, prof: 0.15 }, procMax: 3, retryMult: 1.3,
          guilds: [
            { ko: "핏빛 칼날", en: "Crimson Blades" },
            { ko: "광전사 연대", en: "Berserker Legion" },
            { ko: "폭주 기관차", en: "Runaway Engine" },
          ],
        },
        veteran: {
          nameKo: "숙련 우대", name: "Veteran",
          descKo: "보스 숙련도 높은 사람 우선", desc: "Prefers boss proficiency",
          greed: [0.6, 0.7], speed: [0.55, 0.65],
          weights: { perf: 0.3, surv: 0.25, prof: 0.45 }, procMax: 2, retryMult: 1,
          guilds: [
            { ko: "백전노장", en: "Hundred Battles" },
            { ko: "노병의 맹세", en: "Veterans' Vow" },
            { ko: "옛 전장의 그림자", en: "Shades of Old Wars" },
          ],
        },
        survival: {
          nameKo: "생존 중시", name: "Survivor",
          descKo: "안 죽는 사람 우선", desc: "Prefers survival",
          greed: [0.5, 0.6], speed: [0.5, 0.6],
          weights: { perf: 0.25, surv: 0.6, prof: 0.15 }, procMax: 2, retryMult: 1,
          guilds: [
            { ko: "철벽 수호대", en: "Ironwall Wardens" },
            { ko: "불사의 방패", en: "Undying Shield" },
            { ko: "끝까지 산다", en: "Last One Standing" },
          ],
        },
        balanced: {
          nameKo: "실속형", name: "Balanced",
          descKo: "무난한 균형형", desc: "Balanced",
          greed: [0.45, 0.55], speed: [0.6, 0.7],
          weights: { perf: 0.45, surv: 0.35, prof: 0.2 }, procMax: 2, retryMult: 1,
          guilds: [
            { ko: "균형의 저울", en: "Scales of Balance" },
            { ko: "실속 상회", en: "Practical Company" },
            { ko: "평원 순찰대", en: "Plains Patrol" },
            { ko: "중도 연합", en: "Middle Path" },
          ],
        },
        growth: {
          nameKo: "육성형", name: "Growth",
          descKo: "잠재력 높은 신입 선호", desc: "Prefers high potential",
          greed: [0.4, 0.5], speed: [0.45, 0.55],
          weights: { perf: 0.25, surv: 0.2, prof: 0.05, pot: 0.5 }, procMax: 2, retryMult: 1,
          guilds: [
            { ko: "새싹 원정대", en: "Sprout Expedition" },
            { ko: "떠오르는 별", en: "Rising Stars" },
            { ko: "내일의 영웅", en: "Heroes of Tomorrow" },
          ],
        },
        casual: {
          nameKo: "친목형", name: "Casual",
          descKo: "느긋 · 웬만하면 받음", desc: "Relaxed, accepts most",
          greed: [0.2, 0.3], speed: [0.3, 0.4],
          weights: { perf: 0.4, surv: 0.4, prof: 0.2 }, procMax: 1, retryMult: 0.7,
          guilds: [
            { ko: "주말 모닥불", en: "Weekend Campfire" },
            { ko: "느긋한 여관", en: "Lazy Inn" },
            { ko: "수다 길드", en: "Chatterbox Guild" },
          ],
        },
        rush: {
          nameKo: "속공형", name: "Rush",
          descKo: "아무나 받고 바로 출발", desc: "Takes anyone, pulls ASAP",
          greed: [0.1, 0.2], speed: [0.95, 1.0],
          weights: { perf: 0.5, surv: 0.3, prof: 0.2 }, procMax: 3, retryMult: 1.5,
          guilds: [
            { ko: "번개 돌격대", en: "Lightning Rush" },
            { ko: "일단 쳐", en: "Pull First" },
            { ko: "급행 열차", en: "Express Train" },
            { ko: "닥돌 원정대", en: "Charge Squad" },
          ],
        },
      },
      // 명성 높은 순서대로 배정 (AI 수가 다르면 비율로 매핑)
      aiPersonaByRank: ["elite", "hardcore", "veteran", "survival", "balanced", "growth", "balanced", "casual", "rush", "rush"],
    },

    /* =========================================================
     * 9) 힐러 아키타입 — 전문화 고정 (같은 spec이면 항상 동일)
     *    SingleBurst(단일특화): 최저 HP 1명 우선 · 풀피 잉여만 2번째 (최대 2타겟) · HPS×0.8 — 신기
     *    BlanketAoE(광역힐러): 전원 1/N · HPS×1.2 — 회복 / 보존 / 수양
     *    Smart: 최저 HP 5명 · HPS×1.0 — 복원 / 신성사제
     *    TankSave: 전원 1몫 + 탱은 3몫(동일 용량 가중 분배) · HPS×0.9 · 생존 시 탱 받피 -10% — 운무
     *              예) 1몫=100이면 비탱 100 · 탱 300
     * ========================================================= */
    healer: {
      typeHpsMult: {
        BlanketAoE: 1.2,
        SingleBurst: 0.8,
        Smart: 1.0,
        TankSave: 0.9,
      },
      tankSaveDr: 0.1, // 탱세이버 생존 시 탱커 추가 뎀감 (곱연산)
      tankSaveTankWeight: 3, // 탱 몫 (비탱=1)
      singleTargets: 2,
      smartTargets: 5,
      specTypes: {
        "Paladin||Holy": "SingleBurst",
        "Druid||Restoration": "BlanketAoE",
        "Evoker||Preservation": "BlanketAoE",
        "Priest||Discipline": "BlanketAoE",
        "Shaman||Restoration": "Smart",
        "Priest||Holy": "Smart",
        "Monk||Mistweaver": "TankSave",
      },
    },

    /* =========================================================
     * 10) 보스 — HP / 광폭화 / 페이즈별 스킬
     *
     *  hpSec     : BossHP = baseDps * D(70) * 15 * hpSec   (광폭화와 독립)
     *  enrageSec : 이 시각 이후 피격 × enrageDamageMult (즉시 패배 아님)
     *
     *  phases[].skills[]
     *    type     : tankBuster | random | aoe1 | aoe2 | raid
     *    interval : 시전 주기(초)
     *    hitMult  : unit.hitPct 배수 (쎈 스킬은 1.5~3)
     *    count    : random = 대상 수 / tankBuster = 맞을 탱 수 (생략=전원)
     *    includeTanks : random만, 기본 true
     *    hitPct   : 숫자 또는 { Tank, Other } — 있으면 hitMult 대신 절대 비율
     * ========================================================= */
    bosses: [
      {
        id: "boss_tyrant",
        name: "Midnight Tyrant",
        nameKo: "한밤의 폭군",
        targetType: "Single",
        icon: "👑",
        image: null, // 나중에 assets/bosses/tyrant.webp 경로
        theme: {
          accent: "#f2b84b",
          glow: "#f2b84b66",
          bg1: "#3a2812",
          bg2: "#140e08",
        },
        hpSec: 360,
        enrageSec: 360,
        phases: [
          {
            phase: 1,
            hpPctStart: 100,
            hpPctEnd: 70,
            skills: [
              { id: "tyrant_pulse", type: "aoe1", name: "Tyrant Pulse", nameKo: "폭군의 파동", interval: 10, hitMult: 1.0 },
              { id: "crush", type: "tankBuster", name: "Crush", nameKo: "분쇄", interval: 16, hitMult: 2.4 },
            ],
          },
          {
            phase: 2,
            hpPctStart: 70,
            hpPctEnd: 35,
            skills: [
              { id: "tyrant_pulse", type: "aoe1", name: "Tyrant Pulse", nameKo: "폭군의 파동", interval: 8, hitMult: 1.1 },
              { id: "crush", type: "tankBuster", name: "Crush", nameKo: "분쇄", interval: 12, hitMult: 2.6 },
              { id: "marked_ruin", type: "random", name: "Marked Ruin", nameKo: "파멸 낙인", interval: 14, hitMult: 1.85, count: 3 },
            ],
          },
          {
            phase: 3,
            hpPctStart: 35,
            hpPctEnd: 0,
            skills: [
              { id: "tyrant_pulse", type: "aoe1", name: "Tyrant Pulse", nameKo: "폭군의 파동", interval: 6, hitMult: 1.15 },
              { id: "tyrant_nova", type: "aoe2", name: "Tyrant Nova", nameKo: "폭군 신성", interval: 11, hitMult: 1.55 },
              { id: "crush", type: "tankBuster", name: "Crush", nameKo: "분쇄", interval: 9, hitMult: 2.8 },
              { id: "marked_ruin", type: "random", name: "Marked Ruin", nameKo: "파멸 낙인", interval: 10, hitMult: 2.0, count: 4 },
            ],
          },
        ],
      },
      {
        id: "boss_twins",
        name: "Echo Twins",
        nameKo: "메아리 쌍둥이",
        targetType: "TwoTarget",
        icon: "☯",
        image: null,
        theme: {
          accent: "#69b0ff",
          glow: "#69b0ff66",
          bg1: "#142844",
          bg2: "#0a121e",
        },
        hpSec: 240,
        enrageSec: 210,
        phases: [
          {
            phase: 1,
            hpPctStart: 100,
            hpPctEnd: 60,
            skills: [
              { id: "echo_wave", type: "aoe1", name: "Echo Wave", nameKo: "메아리 파동", interval: 8, hitMult: 0.9 },
              { id: "twin_link", type: "random", name: "Twin Link", nameKo: "쌍생 연결", interval: 7, hitMult: 2.2, count: 2 },
            ],
          },
          {
            phase: 2,
            hpPctStart: 60,
            hpPctEnd: 0,
            skills: [
              { id: "split_smash", type: "tankBuster", name: "Split Smash", nameKo: "분열 강타", interval: 11, hitMult: 2.3 },
              { id: "twin_link", type: "random", name: "Twin Link", nameKo: "쌍생 연결", interval: 6, hitMult: 2.0, count: 4 },
              { id: "echo_wave", type: "aoe1", name: "Echo Wave", nameKo: "메아리 파동", interval: 7, hitMult: 1.15 },
              { id: "resonance", type: "aoe2", name: "Resonance", nameKo: "공명", interval: 13, hitMult: 1.7 },
            ],
          },
        ],
      },
      {
        id: "boss_swarm",
        name: "Void Swarm",
        nameKo: "공허 무리",
        targetType: "MultiTarget",
        icon: "☠",
        image: null,
        theme: {
          accent: "#a330c9",
          glow: "#a330c966",
          bg1: "#2a1240",
          bg2: "#0e0816",
        },
        hpSec: 310,
        enrageSec: 270,
        phases: [
          {
            phase: 1,
            hpPctStart: 100,
            hpPctEnd: 50,
            skills: [
              { id: "swarm_bite", type: "aoe1", name: "Swarm Bite", nameKo: "무리의 이빨", interval: 6, hitMult: 1.05 },
              { id: "void_infest", type: "random", name: "Void Infest", nameKo: "공허 감염", interval: 12, hitMult: 1.55, count: 5 },
            ],
          },
          {
            phase: 2,
            hpPctStart: 50,
            hpPctEnd: 0,
            skills: [
              { id: "swarm_bite", type: "aoe1", name: "Swarm Bite", nameKo: "무리의 이빨", interval: 5, hitMult: 1.15 },
              { id: "devour", type: "tankBuster", name: "Devour", nameKo: "포식", interval: 14, hitMult: 5.0 },
              { id: "void_infest", type: "random", name: "Void Infest", nameKo: "공허 감염", interval: 8, hitMult: 4, count: 6 },
            ],
          },
        ],
      },
    ],

    /* =========================================================
     * 11) 시뮬 기본 배속 (UI 기본값)
     * ========================================================= */
    sim: {
      defaultCombatSpeed: 10,
    },

    /* =========================================================
     * 12) 구인 Game 전용 단순 시너지 (도우미 카탈로그와 분리)
     *    - 제공: 해당 클래스 전 전문화
     *    - 공증: 힐러 제외 / 탱커 포함 · 서로 곱연산
     *    - 받피: 전원 · 서로 곱연산 (1 - dr)
     *    - 블러드/영웅심 미사용
     * ========================================================= */
    gameSynergies: [
      {
        id: "arcane_intellect",
        name: "Arcane Intellect",
        nameKo: "신비한 지능",
        providers: ["Mage"],
        providerKo: "마법사",
        color: "#3FC7EB",
        atkAp: 0.05,
        effectKo: "AP 딜러 공격력 +5%",
        effect: "AP dealers ATK +5%",
      },
      {
        id: "atrophic_poison",
        name: "Atrophic Poison",
        nameKo: "위축의 독",
        providers: ["Rogue"],
        providerKo: "도적",
        color: "#FFF468",
        dr: 0.05,
        effectKo: "받는 피해 -5%",
        effect: "Damage taken -5%",
      },
      {
        id: "devotion_aura",
        name: "Devotion Aura",
        nameKo: "헌신의 오라",
        providers: ["Paladin"],
        providerKo: "성기사",
        color: "#F48CBA",
        dr: 0.05,
        effectKo: "받는 피해 -5%",
        effect: "Damage taken -5%",
      },
      {
        id: "battle_shout",
        name: "Battle Shout",
        nameKo: "전투의 외침",
        providers: ["Warrior"],
        providerKo: "전사",
        color: "#C69B6D",
        atkAd: 0.05,
        effectKo: "AD 딜러 공격력 +5%",
        effect: "AD dealers ATK +5%",
      },
      {
        id: "evoker_ward",
        name: "Evoker Ward",
        nameKo: "기원사",
        providers: ["Evoker"],
        providerKo: "기원사",
        color: "#33937F",
        dr: 0.01,
        effectKo: "받는 피해 -1%",
        effect: "Damage taken -1%",
      },
      {
        id: "chaos_brand",
        name: "Chaos Brand",
        nameKo: "혼돈의 낙인",
        providers: ["Demon Hunter"],
        providerKo: "악마사냥꾼",
        color: "#A330C9",
        atkAp: 0.05,
        effectKo: "AP 딜러 공격력 +5%",
        effect: "AP dealers ATK +5%",
      },
      {
        id: "hunters_mark",
        name: "Hunters Mark",
        nameKo: "사냥꾼의 징표",
        providers: ["Hunter"],
        providerKo: "사냥꾼",
        color: "#AAD372",
        atkAll: 0.03,
        effectKo: "모든 딜러 공격력 +3%",
        effect: "All dealers ATK +3%",
      },
      {
        id: "mark_of_the_wild",
        name: "Mark of the Wild",
        nameKo: "야생의 징표",
        providers: ["Druid"],
        providerKo: "드루이드",
        color: "#FF7C0A",
        atkAll: 0.03,
        dr: 0.01,
        effectKo: "모든 딜러 공격력 +3% · 받는 피해 -1%",
        effect: "All dealers ATK +3% · DT -1%",
      },
      {
        id: "mystic_touch",
        name: "Mystic Touch",
        nameKo: "신비한 손길",
        providers: ["Monk"],
        providerKo: "수도사",
        color: "#00FF98",
        atkAd: 0.05,
        effectKo: "AD 딜러 공격력 +5%",
        effect: "AD dealers ATK +5%",
      },
      {
        id: "power_word_fortitude",
        name: "Power Word: Fortitude",
        nameKo: "신의 권능: 인내",
        providers: ["Priest"],
        providerKo: "사제",
        color: "#FFFFFF",
        dr: 0.05,
        effectKo: "받는 피해 -5%",
        effect: "Damage taken -5%",
      },
      {
        id: "skyfury",
        name: "Skyfury",
        nameKo: "하늘격노",
        providers: ["Shaman"],
        providerKo: "주술사",
        color: "#0070DD",
        atkAll: 0.05,
        effectKo: "모든 딜러 공격력 +5%",
        effect: "All dealers ATK +5%",
      },
    ],

    /* AD 딜러 (그 외 비힐러 = AP). 힐러는 공증 대상에서 제외 */
    adSpecs: [
      { class: "Death Knight", spec: "Blood" },
      { class: "Druid", spec: "Guardian" },
      { class: "Monk", spec: "Brewmaster" },
      { class: "Warrior", spec: "Protection" },
      { class: "Druid", spec: "Feral" },
      { class: "Monk", spec: "Windwalker" },
      { class: "Rogue", spec: "Outlaw" },
      { class: "Rogue", spec: "Subtlety" },
      { class: "Warrior", spec: "Arms" },
      { class: "Warrior", spec: "Fury" },
      { class: "Hunter", spec: "Beast Mastery" },
      { class: "Hunter", spec: "Marksmanship" },
      { class: "Monk", spec: "Mistweaver" },
    ],

    /* =========================================================
     * 패치 노트 (사람이 읽는 용)
     * ========================================================= */
    patchNotes: [
      "v1 초기값 — 엔진에서 흩어져 있던 매직넘버 통합",
      "v1.2 — HPS 미터=유효 치유만. 힐은 healerType 우선순위로 실HP에 투입",
      "v1.3 — 구인 Game 단순 시너지: 전투 DPS/받피만 곱연산 적용 (블러드 제외)",
      "v1.4 — 보스별 hpSec/enrageSec, 광폭화 ×5, 페이즈별 tankBuster/random/aoe 스킬, 힐러 타입 전문화 고정",
      "v1.5 — 딜러 1.5분/2분 쿨기(20초 폭딜). 6분 정렬·기대 DPS=1.0. 평타 11/14, 폭딜 롤은 창당 1회",
      "v1.6 — 트라이창 FX: 보스 초상/테마, Web Audio SFX, 스킬·킬/전멸 연출, 음소거",
      "v1.7 — 인재풀 300→1000. 역할 비율 탱 18→11% · 힐 ~22% · 근딜 ~33% · 원딜 ~34%",
      "v1.8 — AI 명성 40~95 균등 분포 · 명성 순 구인 성격(명문/하드코어/숙련/생존/실속/육성/친목/속공). 진행도 표에 전 공대 베스트%",
      "v1.9 — AI 공대 이름을 성격별 길드명으로 (시즌마다 무작위 · 중복 없음)",
      "난이도 올리고 싶으면: bosses[].skills[].interval ↓ 또는 hitMult ↑, unit.hitPct ↑, hazard.doubleChanceMult ↑",
      "즉사만 줄이려면: hazard.fatalChanceMult ↓ 또는 fatalDiv ↑",
      "2배 피격만 줄이려면: hazard.doubleChanceMult ↓",
      "구인이 너무 빠르면: recruit.applyPerSec ↓, aiSlowGate ↓",
      "지원이 너무 많으면: applyPerSec baseMax/bonusChance ↓ (현재 ~0.75/s)",
      "첫킬이 너무 어려우면: combat.baseHps ↑, unit.hitPct ↓, growth.baseGain ↑",
      "시너지로 공대가 세지면: combat.baseDps ↓ 또는 BossHP 계수↑ / unit.hitPct ↑",
    ],
  };
})(window);
