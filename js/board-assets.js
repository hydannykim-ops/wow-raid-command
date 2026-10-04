/**
 * 오더 그림판 스탬프/아이콘 자산.
 * 직업·전문화·역할 아이콘은 assets/icons 에 로컬 저장.
 * 없으면 Wowhead CDN으로 폴백. 보스 쫄·네임드는 BOSS_UNITS에 등록.
 */
(function (global) {
  "use strict";

  const LOCAL_ICON_DIR = "assets/icons/";
  const CDN_ICON_BASE = "https://wow.zamimg.com/images/wow/icons/large/";
  const MARKER_SHEET = "assets/icons/markers/UI-RaidTargetingIcons.png";

  // UI-RaidTargetingIcons.png 스프라이트 좌표 (2x4 그리드)
  const MARKER_SHEET_UV = {
    star: [0, 0],
    circle: [1, 0],
    diamond: [2, 0],
    triangle: [3, 0],
    moon: [0, 1],
    square: [1, 1],
    cross: [2, 1],
    skull: [3, 1],
  };

  let markerSheetImg = null;
  let markerSheetTried = false;

  function ensureMarkerSheet(onReady) {
    if (markerSheetImg?.complete && markerSheetImg.naturalWidth) return markerSheetImg;
    if (markerSheetTried && markerSheetImg && !markerSheetImg.complete) return null;
    if (!markerSheetTried) {
      markerSheetTried = true;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        markerSheetImg = img;
        if (typeof onReady === "function") onReady(img);
      };
      img.onerror = () => {
        markerSheetImg = null;
      };
      img.src = MARKER_SHEET;
      markerSheetImg = img;
    }
    return markerSheetImg?.complete && markerSheetImg.naturalWidth ? markerSheetImg : null;
  }

  function localIconPath(name) {
    if (!name) return null;
    return `${LOCAL_ICON_DIR}${String(name).replace(/\.jpg$/i, "")}.jpg`;
  }

  function iconUrl(name) {
    if (!name) return null;
    if (/^https?:\/\//i.test(name) || name.startsWith("assets/") || name.startsWith("./") || name.startsWith("/")) {
      return name;
    }
    return localIconPath(name);
  }

  function iconCdnUrl(name) {
    if (!name) return null;
    if (/^https?:\/\//i.test(name) || name.startsWith("assets/") || name.startsWith("./") || name.startsWith("/")) {
      return null;
    }
    return `${CDN_ICON_BASE}${String(name).replace(/\.jpg$/i, "")}.jpg`;
  }

  const CLASS_ICONS = {
    "Death Knight": "classicon_deathknight",
    "Demon Hunter": "classicon_demonhunter",
    Druid: "classicon_druid",
    Evoker: "classicon_evoker",
    Hunter: "classicon_hunter",
    Mage: "classicon_mage",
    Monk: "classicon_monk",
    Paladin: "classicon_paladin",
    Priest: "classicon_priest",
    Rogue: "classicon_rogue",
    Shaman: "classicon_shaman",
    Warlock: "classicon_warlock",
    Warrior: "classicon_warrior",
  };

  const SPEC_ICONS = {
    "Death Knight|Blood": "spell_deathknight_bloodpresence",
    "Death Knight|Frost": "spell_deathknight_frostpresence",
    "Death Knight|Unholy": "spell_deathknight_unholypresence",
    "Demon Hunter|Havoc": "ability_demonhunter_specdps",
    "Demon Hunter|Vengeance": "ability_demonhunter_spectank",
    "Demon Hunter|Devourer": "ability_demonhunter_eyebeam",
    "Druid|Balance": "spell_nature_starfall",
    "Druid|Feral": "ability_druid_catform",
    "Druid|Guardian": "ability_racial_bearform",
    "Druid|Restoration": "spell_nature_healingtouch",
    "Evoker|Augmentation": "classicon_evoker_augmentation",
    "Evoker|Devastation": "classicon_evoker_devastation",
    "Evoker|Preservation": "classicon_evoker_preservation",
    "Hunter|Beast Mastery": "ability_hunter_bestialdiscipline",
    "Hunter|Marksmanship": "ability_hunter_focusedaim",
    "Hunter|Survival": "ability_hunter_camouflage",
    "Mage|Arcane": "spell_holy_magicalsentry",
    "Mage|Fire": "spell_fire_firebolt02",
    "Mage|Frost": "spell_frost_frostbolt02",
    "Monk|Brewmaster": "spell_monk_brewmaster_spec",
    "Monk|Mistweaver": "spell_monk_mistweaver_spec",
    "Monk|Windwalker": "spell_monk_windwalker_spec",
    "Paladin|Holy": "spell_holy_holybolt",
    "Paladin|Protection": "ability_paladin_shieldofthetemplar",
    "Paladin|Retribution": "spell_holy_auraoflight",
    "Priest|Discipline": "spell_holy_powerwordshield",
    "Priest|Holy": "spell_holy_guardianspirit",
    "Priest|Shadow": "spell_shadow_shadowwordpain",
    "Rogue|Assassination": "ability_rogue_deadlybrew",
    "Rogue|Outlaw": "ability_rogue_waylay",
    "Rogue|Subtlety": "ability_stealth",
    "Shaman|Elemental": "spell_nature_lightning",
    "Shaman|Enhancement": "spell_shaman_improvedstormstrike",
    "Shaman|Restoration": "spell_nature_magicimmunity",
    "Warlock|Affliction": "spell_shadow_deathcoil",
    "Warlock|Demonology": "spell_shadow_metamorphosis",
    "Warlock|Destruction": "spell_shadow_rainoffire",
    "Warrior|Arms": "ability_warrior_savageblow",
    "Warrior|Fury": "ability_warrior_innerrage",
    "Warrior|Protection": "ability_warrior_defensivestance",
  };

  const RAID_MARKERS = [
    { id: "mark-star", name: "Star", nameKo: "별", drawStyle: "marker-star", color: "#f2d45c", sheetKey: "star" },
    { id: "mark-circle", name: "Circle", nameKo: "동그라미", drawStyle: "marker-circle", color: "#e8913a", sheetKey: "circle" },
    { id: "mark-diamond", name: "Diamond", nameKo: "다이아", drawStyle: "marker-diamond", color: "#c45de0", sheetKey: "diamond" },
    { id: "mark-triangle", name: "Triangle", nameKo: "세모", drawStyle: "marker-triangle", color: "#5ecf5a", sheetKey: "triangle" },
    { id: "mark-moon", name: "Moon", nameKo: "달", drawStyle: "marker-moon", color: "#cfd8e6", sheetKey: "moon" },
    { id: "mark-square", name: "Square", nameKo: "네모", drawStyle: "marker-square", color: "#5b9dff", sheetKey: "square" },
    { id: "mark-cross", name: "Cross", nameKo: "가위표", drawStyle: "marker-cross", color: "#ff5b5b", sheetKey: "cross" },
    { id: "mark-skull", name: "Skull", nameKo: "해골", drawStyle: "marker-skull", color: "#f5f5f5", sheetKey: "skull" },
  ];

  const ROLE_ELEMENTS = [
    { id: "role-tank", name: "Tank", nameKo: "탱", color: "#4f86c6", icon: "inv_shield_06" },
    { id: "role-heal", name: "Healer", nameKo: "힐", color: "#5ecf7a", icon: "spell_holy_flashheal" },
    { id: "role-melee", name: "Melee", nameKo: "근딜", color: "#e0674a", icon: "ability_warrior_challange" },
    { id: "role-ranged", name: "Ranged", nameKo: "원딜", color: "#d4a017", icon: "ability_marksmanship" },
  ];

  /**
   * 보스별 쫄/네임드. 이미지는 직접 넣고 iconUrl을 채우면 된다.
   * 예) iconUrl: "assets/bosses/dummy-1/add-imp.png"
   */
  const BOSS_UNITS = {
    // "dummy-1": [
    //   { id: "add-1", name: "Add", nameKo: "쫄", iconUrl: "assets/bosses/dummy-1/add-1.png", color: "#ff6b72" },
    // ],
  };

  /**
   * 보스별 오더 그림판 배경 맵.
   * 원본 파일명 기준: 네크잘리/파수꾼/탐험가/바쉬니크/스조라크/쌍둥이 송곳니/똬리의제단/울라텍 페이즈들
   * string = 단일 맵, 배열 = 다중(페이즈) 맵
   */
  const BOSS_MAPS = {
    nekzali: "assets/maps/nekzali.jpg",
    "entombed-sentinels": "assets/maps/entombed-sentinels.jpg",
    "lost-explorers": "assets/maps/lost-explorers.jpg",
    vashnik: "assets/maps/vashnik.png",
    sszorak: "assets/maps/sszorak.jpg",
    "twin-fangs": "assets/maps/twin-fangs.jpg",
    "coiled-altar": "assets/maps/coiled-altar.jpg",
    ulatek: [
      { id: "p1", labelKo: "1페이즈", labelEn: "Phase 1", url: "assets/maps/ulatek-p1.jpg" },
      { id: "p2-left", labelKo: "2페이즈 좌", labelEn: "P2 Left", url: "assets/maps/ulatek-p2-left.jpg" },
      { id: "p2-right", labelKo: "2페이즈 우", labelEn: "P2 Right", url: "assets/maps/ulatek-p2-right.jpg" },
      { id: "p3", labelKo: "3페이즈", labelEn: "Phase 3", url: "assets/maps/ulatek-p3.jpg" },
    ],
  };

  const mapImageCache = new Map(); // url -> { img, failed }

  function bossMapEntries(bossId) {
    const entry = BOSS_MAPS[bossId];
    if (!entry) return [];
    if (typeof entry === "string") {
      return [{ id: "default", labelKo: "맵", labelEn: "Map", url: entry }];
    }
    return Array.isArray(entry) ? entry : [];
  }

  function bossMapUrl(bossId, mapId) {
    const list = bossMapEntries(bossId);
    if (!list.length) return null;
    if (mapId) {
      const hit = list.find((m) => m.id === mapId);
      if (hit) return hit.url;
    }
    return list[0].url;
  }

  function loadBossMap(bossId, mapId, onReady) {
    // 구 API: loadBossMap(bossId, onReady)
    if (typeof mapId === "function") {
      onReady = mapId;
      mapId = null;
    }
    const url = bossMapUrl(bossId, mapId);
    if (!url) return null;
    let entry = mapImageCache.get(url);
    if (entry?.img?.complete && entry.img.naturalWidth && !entry.failed) return entry.img;
    if (entry?.failed) return null;
    if (!entry) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        mapImageCache.set(url, { img, failed: false });
        if (typeof onReady === "function") onReady(img);
      };
      img.onerror = () => {
        mapImageCache.set(url, { img, failed: true });
      };
      img.src = url;
      mapImageCache.set(url, { img, failed: false });
      return null;
    }
    return null;
  }

  function classIconUrl(className) {
    return iconUrl(CLASS_ICONS[className] || null);
  }

  function specIconUrl(className, specName) {
    const key = `${className}|${specName}`;
    return iconUrl(SPEC_ICONS[key] || CLASS_ICONS[className] || null);
  }

  function playerIconUrl(player) {
    if (!player) return null;
    if (player.iconUrl) return player.iconUrl;
    return specIconUrl(player.class, player.spec);
  }

  function generalElements() {
    return [
      ...RAID_MARKERS.map((m) => ({
        ...m,
        group: "marker",
        groupKo: "징표",
        groupEn: "Markers",
        iconUrl: null,
        sheetUrl: MARKER_SHEET,
        sheetKey: m.sheetKey,
        label: m.nameKo,
      })),
      ...ROLE_ELEMENTS.map((r) => ({
        ...r,
        group: "role",
        groupKo: "역할",
        groupEn: "Roles",
        iconUrl: iconUrl(r.icon),
        cdnUrl: iconCdnUrl(r.icon),
        label: r.nameKo,
        drawStyle: null,
      })),
    ];
  }

  /**
   * 한 전투에 네임드가 여럿인 보스. 이미지는 Wowhead NPC 모델 렌더를 상체 기준으로 자른 것.
   * 한글명은 공식 번역 확인 전 음역.
   */
  const UNIT_DIR = "assets/bosses/units/";
  const NAMED_UNITS = {
    "entombed-sentinels": [
      { id: "breath-of-ulatek", npcId: 258557, name: "Breath of Ula'tek", nameKo: "울라텍의 숨결", color: "#7bd66b" },
      { id: "blood-of-ulatek", npcId: 258558, name: "Blood of Ula'tek", nameKo: "울라텍의 피", color: "#ff5a5a" },
    ],
    "lost-explorers": [
      { id: "morzahi", npcId: 267077, name: "Mor'zahi", nameKo: "모르자히", color: "#ff6b72" },
      { id: "first-mate-nama", npcId: 267066, name: "First Mate Nama", nameKo: "일등항해사 나마", color: "#f2b84b" },
      { id: "scrollsage-iku", npcId: 267076, name: "Scrollsage Iku", nameKo: "두루마리현자 이쿠", color: "#a98bff" },
      { id: "trader-gebbo", npcId: 267079, name: "Trader Gebbo", nameKo: "상인 게보", color: "#9bd36b" },
    ],
    "twin-fangs": [
      { id: "vexhul", npcId: 257361, name: "Vexhul", nameKo: "벡스훌", color: "#9b7bff" },
      { id: "ithraz", npcId: 257368, name: "Ithraz", nameKo: "이스라즈", color: "#ff5a5a" },
    ],
    "coiled-altar": [
      { id: "zuljan", npcId: 259447, name: "Zul'jan", nameKo: "줄잔", color: "#7bd66b" },
      { id: "malacrass", npcId: 259854, name: "Hex Lord Malacrass", nameKo: "주술 군주 말라크라스", color: "#4fd1c5" },
    ],
  };

  // BOSS_UNITS 미등록 보스: 네임드(없으면 보스 초상화) + 쫄(add) 이벤트 스킬 아이콘으로 구성
  function catalogBossUnits(bossId) {
    const api = global.RaidPlannerAPI;
    const boss = (api?.getCatalog?.()?.bosses || []).find((b) => b.id === bossId);
    if (!boss) return [];
    const named = NAMED_UNITS[bossId];
    const units = named
      ? named.map((u) => ({ ...u, iconUrl: `${UNIT_DIR}${u.id}.png` }))
      : [
          {
            id: "boss",
            name: boss.name,
            nameKo: boss.nameKo,
            iconUrl: api.getBossIcon?.(boss) || boss.iconUrl || null,
            color: "#ff6b72",
          },
        ];
    const seen = new Set();
    (boss.events || []).forEach((ev) => {
      if (ev.type !== "add" || seen.has(ev.name)) return;
      seen.add(ev.name);
      units.push({
        id: `add-${ev.spellId || ev.id}`,
        name: ev.name,
        nameKo: ev.nameKo,
        iconUrl: api.getEventIcon?.(ev) || ev.iconUrl || null,
        color: "#f29b4b",
      });
    });
    return units;
  }

  function bossUnits(bossId) {
    const list = BOSS_UNITS[bossId] || catalogBossUnits(bossId);
    return list.map((u) => ({
      ...u,
      group: "boss",
      iconUrl: u.iconUrl || null,
      label: u.nameKo || u.name,
      color: u.color || "#ff6b72",
    }));
  }

  function findElement(id) {
    return generalElements().find((e) => e.id === id) || null;
  }

  function findBossUnit(bossId, id) {
    return bossUnits(bossId).find((e) => e.id === id) || null;
  }

  function drawMarkerFromSheet(ctx, sheetKey, x, y, r) {
    const img = ensureMarkerSheet();
    const uv = MARKER_SHEET_UV[sheetKey];
    if (!img || !uv) return false;
    const cell = img.naturalWidth / 4;
    const [col, row] = uv;
    const size = r * 2;
    ctx.drawImage(img, col * cell, row * cell, cell, cell, x - r, y - r, size, size);
    return true;
  }

  /** 레이드 징표: 로컬 스프라이트 우선, 없으면 벡터 폴백 */
  function drawRaidMarker(ctx, style, x, y, r, onSheetReady) {
    const kind = String(style || "").replace(/^marker-/, "");
    if (drawMarkerFromSheet(ctx, kind, x, y, r)) return;

    ensureMarkerSheet(onSheetReady);

    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const fill = {
      star: "#f2d45c",
      circle: "#e8913a",
      diamond: "#c45de0",
      triangle: "#5ecf5a",
      moon: "#d7dee8",
      square: "#5b9dff",
      cross: "#ff5b5b",
      skull: "#f0f0f0",
    }[kind] || "#f2b84b";

    ctx.fillStyle = fill;
    ctx.strokeStyle = "#0b1017";

    if (kind === "star") {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === "diamond") {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.75, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === "triangle") {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.9, r * 0.75);
      ctx.lineTo(-r * 0.9, r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === "moon") {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0c121a";
      ctx.beginPath();
      ctx.arc(r * 0.38, -r * 0.08, r * 0.68, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "square") {
      const s = r * 0.75;
      ctx.beginPath();
      ctx.rect(-s, -s, s * 2, s * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === "cross") {
      const w = r * 0.28;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.75);
      ctx.lineTo(r * 0.75, r * 0.75);
      ctx.moveTo(r * 0.75, -r * 0.75);
      ctx.lineTo(-r * 0.75, r * 0.75);
      ctx.lineWidth = w;
      ctx.strokeStyle = fill;
      ctx.stroke();
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.strokeStyle = "#0b1017";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "skull") {
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0b1017";
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.18, r * 0.16, 0, Math.PI * 2);
      ctx.arc(r * 0.28, -r * 0.18, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-r * 0.12, r * 0.05, r * 0.24, r * 0.28);
    }

    ctx.restore();
  }

  global.BoardAssets = {
    iconUrl,
    iconCdnUrl,
    localIconPath,
    classIconUrl,
    specIconUrl,
    playerIconUrl,
    generalElements,
    bossUnits,
    findElement,
    findBossUnit,
    drawRaidMarker,
    ensureMarkerSheet,
    bossMapUrl,
    bossMapEntries,
    loadBossMap,
    MARKER_SHEET,
    MARKER_SHEET_UV,
    CLASS_ICONS,
    SPEC_ICONS,
    BOSS_UNITS,
    BOSS_MAPS,
  };
})(window);
