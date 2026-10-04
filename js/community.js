/**
 * Synergy Plaza — Orgrimmar draft.
 * Walk the city as a Horde race and open the boards.
 * Character and posts stay in localStorage.
 */
(function (global) {
  "use strict";

  const KEY = "wow-plaza-draft-v2";
  let worldW = 1100;
  const GROUND_SPEED = 280;
  const RUN_SPEED = 460;
  const JUMP_V = 640;
  const GRAV = 1750;
  const RANGE = 120;

  const HAIR = ["bob", "long", "spiky", "twin"];
  const HAT = ["none", "cap", "hood"];
  const RACE = ["orc", "troll", "tauren", "undead", "belf", "goblin"];
  const DAYS = [
    ["mon", "월", "Mon"],
    ["tue", "화", "Tue"],
    ["wed", "수", "Wed"],
    ["thu", "목", "Thu"],
    ["fri", "금", "Fri"],
    ["sat", "토", "Sat"],
    ["sun", "일", "Sun"],
  ];
  const ROLE_GROUPS = [
    ["tank", "모든 탱", "All tanks", "Tank"],
    ["melee", "모든 근딜", "All melee", "Melee"],
    ["ranged", "모든 원딜", "All ranged", "Ranged"],
    ["heal", "모든 힐", "All healers", "Heal"],
  ];
  const CLASSES = [
    ["dk", "죽음의 기사", "Death Knight", "죽기"],
    ["dh", "악마사냥꾼", "Demon Hunter", "악사"],
    ["druid", "드루이드", "Druid", "드루"],
    ["evoker", "기원사", "Evoker", "기원"],
    ["hunter", "사냥꾼", "Hunter", "사냥"],
    ["mage", "마법사", "Mage", "법사"],
    ["monk", "수도사", "Monk", "수도"],
    ["paladin", "성기사", "Paladin", "기사"],
    ["priest", "사제", "Priest", "사제"],
    ["rogue", "도적", "Rogue", "도적"],
    ["shaman", "주술사", "Shaman", "주술"],
    ["warlock", "흑마법사", "Warlock", "흑마"],
    ["warrior", "전사", "Warrior", "전사"],
  ];
  const boardQuery = {};

  function queryOf(id, kind) {
    const key = id === "recruit" || id === "seek" ? id + "-" + (kind || "regular") : id;
    if (!boardQuery[key]) boardQuery[key] = { days: [], from: "", to: "", specs: [] };
    return boardQuery[key];
  }

  const PRESETS = [
    {
      id: "orc",
      nameKo: "오크",
      nameEn: "Orc",
      jobKo: "엄니",
      jobEn: "Tusks",
      race: "orc",
      hair: "spiky",
      hairColor: "#241c14",
      skin: "#5c8a38",
      cloth: "#8d3030",
      cloth2: "#4a1818",
      eye: "#e0b03a",
      hat: "none",
    },
    {
      id: "troll",
      nameKo: "트롤",
      nameEn: "Troll",
      jobKo: "큰 귀",
      jobEn: "Long ears",
      race: "troll",
      hair: "spiky",
      hairColor: "#1a1814",
      skin: "#3d7ea6",
      cloth: "#6b4423",
      cloth2: "#3a2414",
      eye: "#f0d060",
      hat: "none",
    },
    {
      id: "tauren",
      nameKo: "타우렌",
      nameEn: "Tauren",
      jobKo: "뿔",
      jobEn: "Horns",
      race: "tauren",
      hair: "bob",
      hairColor: "#4a3424",
      skin: "#8d5a32",
      cloth: "#c4a574",
      cloth2: "#6b4a28",
      eye: "#3a2418",
      hat: "none",
    },
    {
      id: "undead",
      nameKo: "언데드",
      nameEn: "Forsaken",
      jobKo: "포세이큰",
      jobEn: "Forsaken",
      race: "undead",
      hair: "long",
      hairColor: "#6a6870",
      skin: "#c5d0b4",
      cloth: "#3a3a44",
      cloth2: "#1e1e26",
      eye: "#d6e25a",
      hat: "hood",
    },
    {
      id: "belf",
      nameKo: "블러드 엘프",
      nameEn: "Blood Elf",
      jobKo: "긴 귀",
      jobEn: "Long ears",
      race: "belf",
      hair: "long",
      hairColor: "#f0d48a",
      skin: "#f3c9a8",
      cloth: "#9a2430",
      cloth2: "#c6a15a",
      eye: "#7dff4a",
      hat: "none",
    },
    {
      id: "goblin",
      nameKo: "고블린",
      nameEn: "Goblin",
      jobKo: "소형",
      jobEn: "Small",
      race: "goblin",
      hair: "bob",
      hairColor: "#2a2418",
      skin: "#7dae3a",
      cloth: "#c45a20",
      cloth2: "#5a3010",
      eye: "#1a1a1a",
      hat: "cap",
    },
  ];

  const SPOTS = [
    { id: "info", t: 0.12, x: 0, build: "board" },
    { id: "recruit", t: 0.58, x: 0, build: "hall" },
    { id: "free", t: 0.86, x: 0, build: "cafe" },
  ];

  let langFn = () => "ko";
  let shell = null;
  let stage = null;
  let world = null;
  let back = null;
  let actorsLayer = null;
  let promptEl = null;
  let logEl = null;
  let chipEl = null;
  let room = null;
  let salon = null;
  let hub = null;
  let lastPlazaRoute = { view: "plaza" };
  let built = false;
  let running = false;
  let raf = 0;
  let last = 0;
  let cam = 0;
  let uiOpen = false;
  let salonRequired = false;
  let currentBoard = null;
  let currentKind = "";
  let currentWriteAs = "";
  let currentMode = "list";
  let currentPostId = "";
  let promptId = "";
  let welcomed = false;
  let lurkOk = false;
  let gateEl = null;
  let mailEl = null;
  let moveTarget = null;
  let pending = null;
  let jumpEdge = false;
  const keys = new Set();

  let state = null;
  let me = null;
  let npcs = [];

  function L(ko, en) {
    return (langFn() || "ko") === "ko" ? ko : en;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function hex(v, fb) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb;
  }

  function shade(color, amt) {
    const n = parseInt(String(color).slice(1), 16);
    if (!Number.isFinite(n)) return color;
    const ch = (c) => Math.max(0, Math.min(255, c + amt));
    const r = ch(n >> 16);
    const g = ch((n >> 8) & 255);
    const b = ch(n & 255);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function lookOf(ch) {
    const cloth = hex(ch && ch.cloth, "#8d3030");
    return {
      race: RACE.includes(ch && ch.race) ? ch.race : "orc",
      hair: HAIR.includes(ch && ch.hair) ? ch.hair : "spiky",
      hat: HAT.includes(ch && ch.hat) ? ch.hat : "none",
      hairColor: hex(ch && ch.hairColor, "#241c14"),
      skin: hex(ch && ch.skin, "#5c8a38"),
      cloth,
      cloth2: hex(ch && ch.cloth2, shade(cloth, -42)),
      eye: hex(ch && ch.eye, "#e0b03a"),
    };
  }

  function presetById(id) {
    return PRESETS.find((p) => p.id === id) || PRESETS[0];
  }

  function spotName(id) {
    if (id === "info") return L("정보 게시판", "Info Board");
    if (id === "recruit") return L("공격대·공대원", "Raids · Members");
    if (id === "seek") return L("공대원 찾기", "Find Members");
    if (id === "free") return L("자유 게시판", "Free Board");
    return L("종족", "Race");
  }

  function boardTitle(id) {
    if (id === "recruit") return L("공격대 찾기", "Find a Raid");
    if (id === "seek") return L("공대원 찾기", "Find Members");
    return spotName(id);
  }

  function spotBlurb(id) {
    if (id === "info") return L("패치와 일정을 적는 게시판입니다.", "Patches and schedules.");
    if (id === "recruit") return L("올라온 공대를 보고, 나를 인재풀에 등록해 둘 수 있습니다.", "Browse raids, or list yourself in the talent pool.");
    if (id === "seek") return L("가능한 사람을 보고, 우리 공격대를 올릴 수 있습니다.", "Browse players, or post your raid.");
    if (id === "free") return L("광장에서 하던 이야기를 남기는 게시판입니다.", "Keep the plaza talk going.");
    return L("오그리마에서 쓸 종족을 고릅니다.", "Pick the race you walk as.");
  }

  function chibi(ch) {
    const c = lookOf(ch);
    return `<div class="mw-chibi race-${c.race} hair-${c.hair} hat-${c.hat}" style="--hair:${c.hairColor};--skin:${c.skin};--cloth:${c.cloth};--cloth2:${c.cloth2};--eye:${c.eye}">
      <span class="mw-hair-back"></span>
      <span class="mw-shadow"></span>
      <div class="mw-legs"><span></span><span></span></div>
      <div class="mw-torso"></div>
      <div class="mw-arms"><span></span><span></span></div>
      <div class="mw-head">
        <span class="mw-ear l"></span><span class="mw-ear r"></span>
        <span class="mw-horn l"></span><span class="mw-horn r"></span>
        <div class="mw-face"><i class="mw-eye"></i><i class="mw-eye"></i><i class="mw-blush"></i><i class="mw-blush r"></i><i class="mw-mouth"></i></div>
        <span class="mw-snout"></span>
        <span class="mw-tusk l"></span><span class="mw-tusk r"></span>
        <span class="mw-hair-front"></span>
        <span class="mw-hat"></span>
      </div>
    </div>`;
  }

  function bulkPartyPosts() {
    const specBook = {
      tank: [
        ["Death Knight|Blood", "혈기", "Blood"],
        ["Demon Hunter|Vengeance", "복수", "Vengeance"],
        ["Druid|Guardian", "수호", "Guardian"],
        ["Monk|Brewmaster", "양조", "Brewmaster"],
        ["Paladin|Protection", "보호", "Prot"],
        ["Warrior|Protection", "방어", "Prot"],
      ],
      melee: [
        ["Death Knight|Frost", "냉기", "Frost DK"],
        ["Death Knight|Unholy", "부정", "Unholy"],
        ["Demon Hunter|Havoc", "파멸", "Havoc"],
        ["Druid|Feral", "야성", "Feral"],
        ["Hunter|Survival", "생존", "Survival"],
        ["Monk|Windwalker", "풍운", "Windwalker"],
        ["Paladin|Retribution", "징벌", "Retribution"],
        ["Rogue|Assassination", "암살", "Assassination"],
        ["Rogue|Outlaw", "무법", "Outlaw"],
        ["Rogue|Subtlety", "잠행", "Subtlety"],
        ["Shaman|Enhancement", "고양", "Enhancement"],
        ["Warrior|Arms", "무기", "Arms"],
        ["Warrior|Fury", "분노", "Fury"],
      ],
      ranged: [
        ["Demon Hunter|Devourer", "포식", "Devourer"],
        ["Druid|Balance", "조화", "Balance"],
        ["Evoker|Augmentation", "증강", "Augmentation"],
        ["Evoker|Devastation", "황폐", "Devastation"],
        ["Hunter|Beast Mastery", "야수", "Beast Mastery"],
        ["Hunter|Marksmanship", "사격", "Marksmanship"],
        ["Mage|Arcane", "비전", "Arcane"],
        ["Mage|Fire", "화염", "Fire"],
        ["Mage|Frost", "냉법", "Frost Mage"],
        ["Priest|Shadow", "암흑", "Shadow"],
        ["Shaman|Elemental", "정기", "Elemental"],
        ["Warlock|Affliction", "고통", "Affliction"],
        ["Warlock|Demonology", "악마", "Demonology"],
        ["Warlock|Destruction", "파괴", "Destruction"],
      ],
      heal: [
        ["Druid|Restoration", "회복", "Resto Druid"],
        ["Evoker|Preservation", "보존", "Preservation"],
        ["Monk|Mistweaver", "운무", "Mistweaver"],
        ["Paladin|Holy", "신기", "Holy Paladin"],
        ["Priest|Discipline", "수양", "Discipline"],
        ["Priest|Holy", "신사", "Holy Priest"],
        ["Shaman|Restoration", "복원", "Resto Shaman"],
      ],
    };
    const roleKeys = ["tank", "melee", "ranged", "heal"];
    const daySets = [
      ["mon"],
      ["tue"],
      ["wed"],
      ["thu"],
      ["fri"],
      ["sat"],
      ["sun"],
      ["tue", "thu"],
      ["tue", "fri"],
      ["mon", "wed", "thu"],
      ["sat", "sun"],
      ["fri", "sat"],
      ["wed", "sun"],
      ["mon", "tue", "wed", "thu", "fri"],
      ["thu", "fri"],
      ["sat"],
    ];
    const windows = [
      [21, 23],
      [20, 22],
      [18, 21],
      [22, 24],
      [19, 23],
      [14, 17],
      [13, 16],
      [10, 13],
      [15, 18],
      [9, 12],
      [0, 2],
      [23, 24],
      [17, 20],
      [12, 15],
      [8, 11],
      [16, 19],
    ];
    const people = [
      ["그롬쉬", 0],
      ["나즈그림", 0],
      ["진타", 1],
      ["볼진", 1],
      ["카루", 2],
      ["무르", 2],
      ["나타노스", 3],
      ["실반", 3],
      ["벨렌드라", 4],
      ["리엘", 4],
      ["가즈로", 5],
      ["트릭시", 5],
    ];
    const dayKo = Object.fromEntries(DAYS.map(([id, ko]) => [id, ko]));
    const dayEn = Object.fromEntries(DAYS.map(([id, , en]) => [id, en]));
    const now = Date.now();
    const posts = [];
    for (let n = 0; n < 100; n += 1) {
      const board = n < 50 ? "recruit" : "seek";
      const i = n % 50;
      const role = roleKeys[i % roleKeys.length];
      const pool = specBook[role];
      const whole = i % 7 === 0;
      let picked;
      if (whole) picked = pool.slice();
      else if (i % 5 === 0) {
        const other = specBook[roleKeys[(i + 1) % roleKeys.length]];
        picked = [pool[i % pool.length], other[i % other.length]];
      } else {
        const count = (i % 3) + 1;
        picked = [];
        for (let k = 0; k < count; k += 1) picked.push(pool[(i + k * 2) % pool.length]);
      }
      const days = daySets[i % daySets.length];
      const [hourFrom, hourTo] = windows[(i * 3 + (board === "seek" ? 1 : 0)) % windows.length];
      const who = people[(n + 3) % people.length];
      const daysKo = days.map((id) => dayKo[id]).join("·");
      const daysEn = days.map((id) => dayEn[id]).join("/");
      const span = hourFrom + "~" + hourTo;
      const group = ROLE_GROUPS.find((row) => row[0] === role);
      const specKo = whole ? group[1] : picked.map((spec) => spec[1]).join("·");
      const specEn = whole ? group[2] : picked.map((spec) => spec[2]).join(", ");
      const recruit = board === "recruit";
      posts.push({
        id: "bulk-" + board + "-" + String(i).padStart(2, "0"),
        board,
        titleKo: daysKo + " " + span + " " + specKo + (recruit ? " 구함" : " 가능"),
        titleEn: (recruit ? "Need " : "Can play ") + specEn + " " + daysEn + " " + span,
        bodyKo: recruit
          ? daysKo + " " + span + " 공대 자리입니다. 체크한 전문화로 와 주세요."
          : daysKo + " " + span + "에 가능합니다. 적은 전문화로 들어갈 수 있습니다.",
        bodyEn: recruit
          ? "Open spot on " + daysEn + " " + span + "."
          : "Free on " + daysEn + " " + span + ".",
        author: who[0],
        look: lookOf(PRESETS[who[1]]),
        role: whole ? role : "",
        days: days.slice(),
        hourFrom,
        hourTo,
        specs: picked.map((spec) => spec[0]),
        up: [],
        down: [],
        comments: [],
        raidKind: n % 2 === 0 ? "regular" : "pickup",
        createdAt: now - (n + 1) * 1000 * 60 * 12,
      });
    }
    return posts;
  }

  function seedPosts() {
    const now = Date.now();
    const orc = lookOf(PRESETS[0]);
    const troll = lookOf(PRESETS[1]);
    const tauren = lookOf(PRESETS[2]);
    const belf = lookOf(PRESETS[4]);
    const classic = [
      {
        id: "seed-free-2",
        board: "free",
        titleKo: "화로 앞에서 모이자",
        titleEn: "Meet by the brazier",
        bodyKo: "힘의 골짜기 화로가 시작 지점이에요. 지나가다 인사 남겨 주세요.",
        bodyEn: "The brazier in the Valley of Strength is the start. Say hi if you pass by.",
        author: "카루",
        look: tauren,
        createdAt: now - 1000 * 60 * 40,
      },
      {
        id: "seed-free-1",
        board: "free",
        titleKo: "오늘 먼지바람이 세다",
        titleEn: "Dust is thick today",
        bodyKo: "성문 쪽이 유난히 붉어요. 듀로타 쪽에서 바람이 넘어오는 것 같습니다.",
        bodyEn: "The gate looks extra red. The wind seems to be coming in from Durotar.",
        author: "진타",
        look: troll,
        createdAt: now - 1000 * 60 * 80,
      },
      {
        id: "seed-rec-2",
        board: "recruit",
        raidKind: "regular",
        titleKo: "정규 근딜 한 자리",
        titleEn: "One melee spot",
        bodyKo: "화/금 21시 고정 공대입니다. 시너지 표 보고 근딜이 비어 있어서 올립니다.",
        bodyEn: "Fixed raid, Tue/Fri 21:00. Posting because melee is the open slot.",
        author: "루가",
        look: orc,
        role: "melee",
        days: ["tue", "fri"],
        hourFrom: 21,
        hourTo: 23,
        up: ["카루"],
        down: [],
        comments: [],
        createdAt: now - 1000 * 60 * 60 * 5,
      },
      {
        id: "seed-rec-1",
        board: "recruit",
        raidKind: "pickup",
        titleKo: "영웅 힐러 구함",
        titleEn: "Healer for heroic",
        bodyKo: "한 자리만 비었습니다. 늦어도 20:50까지 화로 앞으로 와 주세요.",
        bodyEn: "One spot left. Be at the brazier by 20:50.",
        author: "벨렌드라",
        look: belf,
        role: "heal",
        days: ["wed"],
        hourFrom: 20,
        hourTo: 22,
        up: ["진타"],
        down: [],
        comments: [
          {
            id: "seed-c1",
            author: "진타",
            bodyKo: "힐러면 저 가능해요.",
            bodyEn: "I can heal.",
            createdAt: now - 1000 * 60 * 50,
          },
        ],
        createdAt: now - 1000 * 60 * 60 * 3,
      },
      {
        id: "seed-seek-1",
        board: "seek",
        raidKind: "regular",
        titleKo: "힐러로 들어갈게요",
        titleEn: "I can heal",
        bodyKo: "사제, 드루이드 둘 다 됩니다. 월·수·목 21시 이후 가능합니다.",
        bodyEn: "Priest or druid. Free Mon/Wed/Thu after 21:00.",
        author: "벨렌드라",
        look: belf,
        character: { id: "seed-char-1", name: "벨렌드라", realm: "줄진", realmSlug: "zuljin", region: "kr", level: 80, className: "사제" },
        days: ["mon", "wed", "thu"],
        hourFrom: 21,
        hourTo: 24,
        classes: ["priest", "druid"],
        specs: ["Priest|Discipline", "Priest|Holy", "Druid|Restoration"],
        up: ["루가"],
        down: [],
        comments: [],
        createdAt: now - 1000 * 60 * 90,
      },
      {
        id: "seed-seek-2",
        board: "seek",
        raidKind: "pickup",
        titleKo: "탱 가능합니다",
        titleEn: "I can tank",
        bodyKo: "전사, 죽음의 기사. 화/금 21시부터 두 시간 됩니다.",
        bodyEn: "Warrior or death knight. Tue/Fri, two hours from 21:00.",
        author: "루가",
        look: orc,
        days: ["tue", "fri"],
        hourFrom: 21,
        hourTo: 23,
        classes: ["warrior", "dk"],
        specs: ["Warrior|Protection", "Death Knight|Blood"],
        up: [],
        down: [],
        comments: [],
        createdAt: now - 1000 * 60 * 70,
      },
      {
        id: "seed-info-2",
        board: "info",
        titleKo: "이번 주 레이드 일정",
        titleEn: "Raid times this week",
        bodyKo: "수요일, 일요일 21:00 영웅.\n결원은 공격대 찾기에 남겨 주세요.",
        bodyEn: "Heroic on Wednesday and Sunday, 21:00.\nLeave open spots on the recruit board.",
        author: "루가",
        look: orc,
        createdAt: now - 1000 * 60 * 60 * 20,
      },
      {
        id: "seed-info-1",
        board: "info",
        titleKo: "광장 이용 안내",
        titleEn: "How the plaza works",
        bodyKo: "이 광장은 게시판으로 가기 전에 모여 이야기하는 곳입니다.\n좌우로 걷고, 원하는 간판 앞에서 E 또는 클릭으로 들어갑니다.\n종족은 위쪽 종족 버튼에서 고릅니다.\n이 초안의 글과 캐릭터는 이 브라우저에만 저장됩니다.",
        bodyEn: "This plaza is where people gather and talk before stepping into a board.\nWalk left or right, then press E or click a sign.\nPick a race with the Race button above.\nThis draft keeps your character and posts in this browser only.",
        author: "카루",
        look: tauren,
        createdAt: now - 1000 * 60 * 60 * 30,
      },
    ];
    return bulkPartyPosts().concat(classic);
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "");
      if (raw && raw.v === 2 && raw.me && Array.isArray(raw.posts)) {
        raw.me = { ...lookOf(raw.me), name: String(raw.me.name || "").slice(0, 12) };
        const guide = raw.posts.find((p) => p && p.id === "seed-info-1");
        const fresh = seedPosts().find((p) => p.id === "seed-info-1");
        if (guide && fresh && /종족 천막|race tent/i.test(`${guide.bodyKo || ""} ${guide.bodyEn || ""}`)) {
          guide.titleKo = fresh.titleKo;
          guide.titleEn = fresh.titleEn;
          guide.bodyKo = fresh.bodyKo;
          guide.bodyEn = fresh.bodyEn;
        }
        const notice = raw.posts.find((p) => p && p.id === "seed-info-2");
        if (notice && typeof notice.bodyKo === "string" && notice.bodyKo.includes("구인 게시판")) {
          notice.bodyKo = notice.bodyKo.replace("구인 게시판", "공격대 찾기");
        }
        raw.posts = migratePosts(raw.posts, !!raw.poolReady);
        raw.poolReady = true;
        raw.mail = Array.isArray(raw.mail) ? raw.mail : [];
        return raw;
      }
    } catch (e) {
      /* fresh draft */
    }
    return {
      v: 2,
      entered: false,
      me: { ...lookOf(PRESETS[0]), name: "" },
      poolReady: true,
      mail: [],
      posts: seedPosts(),
    };
  }

  function hourOf(value) {
    const n = Number(String(value ?? "").slice(0, 2));
    return n >= 0 && n <= 24 ? n : null;
  }

  function normalizePost(post) {
    post.comments = Array.isArray(post.comments) ? post.comments : [];
    post.up = Array.isArray(post.up) ? post.up : [];
    post.down = Array.isArray(post.down) ? post.down : [];
    post.days = Array.isArray(post.days) ? post.days : [];
    post.classes = Array.isArray(post.classes) ? post.classes : [];
    post.specs = Array.isArray(post.specs) ? post.specs : [];
    if (post.hourFrom === 0 || post.hourFrom) {
      post.hourFrom = Number(post.hourFrom);
      post.hourTo = Number(post.hourTo);
      if (!Number.isFinite(post.hourTo)) post.hourTo = post.hourFrom;
    } else {
      const parsed = hourOf(post.timeFrom || post.time);
      post.hourFrom = parsed == null ? null : parsed;
      post.hourTo = parsed == null ? null : hourOf(post.timeTo) || parsed;
    }
    post.raidKind = post.raidKind === "pickup" ? "pickup" : "regular";
    post.apps = Array.isArray(post.apps) ? post.apps : [];
    return post;
  }

  function migratePosts(posts, poolReady) {
    const seeds = seedPosts();
    for (const seed of seeds) {
      const hit = posts.find((p) => p.id === seed.id);
      if (!hit) continue;
      if ((!hit.days || !hit.days.length) && seed.days) hit.days = seed.days.slice();
      if (!hit.hourFrom && seed.hourFrom) {
        hit.hourFrom = seed.hourFrom;
        hit.hourTo = seed.hourTo || seed.hourFrom;
      }
      if ((!hit.classes || !hit.classes.length) && seed.classes) hit.classes = seed.classes.slice();
      if ((!hit.specs || !hit.specs.length) && seed.specs) hit.specs = seed.specs.slice();
      if (!hit.role && seed.role) hit.role = seed.role;
      if (!Array.isArray(hit.comments)) hit.comments = seed.comments || [];
      if (!Array.isArray(hit.up)) hit.up = seed.up || [];
      if (!Array.isArray(hit.down)) hit.down = seed.down || [];
      if (!hit.raidKind && seed.raidKind) hit.raidKind = seed.raidKind;
    }
    if (!poolReady) {
      for (const seed of seeds) {
        if (seed.board === "seek" && !posts.some((p) => p.id === seed.id)) posts.push(seed);
      }
    }
    const extra = seeds.filter((seed) => String(seed.id).startsWith("bulk-") && !posts.some((p) => p.id === seed.id));
    if (extra.length) posts.unshift(...extra);
    return posts.map(normalizePost);
  }

  function persist() {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 2,
        entered: !!state.entered,
        poolReady: state.poolReady !== false,
        me: state.me,
        mail: Array.isArray(state.mail) ? state.mail : [],
        posts: state.posts,
      })
    );
  }

  function fieldText(post, key) {
    if (post[key]) return post[key];
    const ko = post[key + "Ko"];
    const en = post[key + "En"];
    if (ko || en) return L(ko || "", en || ko || "");
    return "";
  }

  function ago(ts) {
    const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (m < 60) return L(m + "분 전", m + "m ago");
    const h = Math.round(m / 60);
    if (h < 24) return L(h + "시간 전", h + "h ago");
    const d = Math.round(h / 24);
    return L(d + "일 전", d + "d ago");
  }

  function typing() {
    const el = document.activeElement;
    if (!el || !shell || !shell.contains(el)) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  function buildProps() {
    const scenery = [
      { t: 0.03, kind: "tree" },
      { t: 0.5, kind: "banner" },
      { t: 0.97, kind: "tree" },
    ]
      .map((b) =>
        b.kind === "banner"
          ? `<div class="mw-banner" data-t="${b.t}"><i class="cloth"></i><i class="pole"></i></div>`
          : `<div class="mw-tree" data-t="${b.t}"><i class="crown"></i><i class="trunk"></i></div>`
      )
      .join("");
    const spots = SPOTS.map((s) => {
      return `<div class="mw-prop build-${s.build}" data-spot="${s.id}">
        <div class="mw-sign">${esc(spotName(s.id))}</div>
        ${buildingHtml(s.build)}
      </div>`;
    }).join("");
    return `${scenery}
      <div class="mw-brazier" data-t="0.36"><i class="flame"></i><i class="bowl"></i><i class="stand"></i></div>
      ${spots}`;
  }

  function buildingHtml(kind) {
    if (kind === "board") {
      return `<div class="b-body"><div class="paper"><i></i><i></i><i></i><i></i></div><i class="pole"></i></div>`;
    }
    if (kind === "hall") {
      return `<div class="b-body"><i class="roof"></i><div class="wall"><i class="door"></i><i class="win"></i></div></div>`;
    }
    if (kind === "cafe") {
      return `<div class="b-body"><i class="awning"></i><div class="wall"><i class="door"></i><i class="cup"></i></div></div>`;
    }
    return `<div class="b-body"><i class="roof"></i><div class="wall"><i class="mirror"></i><i class="door"></i></div></div>`;
  }

  function paint(entry) {
    entry.el.innerHTML = `
      <div class="mw-bubble"${entry.bubble ? "" : " hidden"}>${esc(entry.bubble || "")}</div>
      <div class="mw-nametag">${esc(entry.ch.name || "")}</div>
      ${chibi(entry.ch)}`;
  }

  function setBubble(entry, text) {
    entry.bubble = text || "";
    const b = entry.el.querySelector(".mw-bubble");
    if (!b) return;
    b.textContent = entry.bubble;
    b.hidden = !entry.bubble;
  }

  function place(a) {
    a.el.style.transform = `translate3d(${a.x}px, ${-a.y}px, 0) translateX(-50%)`;
    a.el.classList.toggle("face-left", a.face < 0);
    a.el.classList.toggle("is-walk", a.onGround && Math.abs(a.vx) > 8);
    a.el.classList.toggle("is-air", !a.onGround);
  }

  function createActor(ch, x, className) {
    const el = document.createElement("div");
    el.className = "mw-actor" + (className ? " " + className : "");
    el.style.setProperty("--blink", -Math.random() * 5 + "s");
    actorsLayer.append(el);
    const entry = {
      el,
      x,
      y: 0,
      vx: 0,
      vy: 0,
      face: 1,
      onGround: true,
      ch,
      bubble: "",
    };
    paint(entry);
    place(entry);
    return entry;
  }

  function renderChip() {
    if (!chipEl) return;
    chipEl.innerHTML = `<span class="mw-avatar">${chibi(state.me)}</span><span>${esc(state.me.name || L("여행자", "Traveler"))}</span>`;
  }

  function pushLog(name, text, kind, color) {
    if (!logEl) return;
    const row = document.createElement("div");
    row.className = "mw-logline" + (kind ? " " + kind : "");
    if (name) {
      const b = document.createElement("b");
      b.textContent = name;
      if (color) b.style.color = color;
      row.append(b);
    }
    row.append(document.createTextNode((name ? " " : "") + text));
    logEl.append(row);
    while (logEl.children.length > 16) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function welcome() {
    if (welcomed) return;
    welcomed = true;
    pushLog(
      "",
      L(
        "광장입니다. 이야기하다 원하는 게시판 간판으로 걸어가세요.",
        "This is the plaza. Talk, then walk to the board you want."
      ),
      "sys"
    );
  }

  function closeOverlays() {
    if (mailEl && !mailEl.hidden) {
      closeMailbox();
      return;
    }
    if (salonRequired) return;
    if (salon && !salon.hidden) {
      salon.hidden = true;
      if (currentBoard) return;
    }
    goPlazaBack();
  }

  function goPlazaBack() {
    if (!window.RaidRouter) {
      showWalk();
      return;
    }
    if (currentBoard === "recruit" || currentBoard === "seek") {
      RaidRouter.go({ view: "plaza", gate: "jobs", intent: currentBoard });
      return;
    }
    if (currentBoard) {
      RaidRouter.go({ view: "plaza", walk: true });
      return;
    }
    if (lastPlazaRoute.gate === "jobs" && lastPlazaRoute.intent) {
      RaidRouter.go({ view: "plaza", gate: "jobs" });
      return;
    }
    if (lastPlazaRoute.gate === "jobs") {
      RaidRouter.go({ view: "plaza", walk: true });
      return;
    }
    RaidRouter.go({ view: "home" });
  }

  function plazaRoute(data) {
    if (window.RaidRouter) RaidRouter.go({ view: "plaza", ...data });
  }

  function bindPlazaLinks(root) {
    if (!root) return;
    root.querySelectorAll("[data-plaza]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
        if (el.tagName === "A") e.preventDefault();
        let data = {};
        try {
          data = JSON.parse(el.dataset.plaza || "{}");
        } catch (err) {
          data = {};
        }
        plazaRoute(data);
      });
    });
  }

  function setShellMode(mode) {
    if (!shell) return;
    shell.classList.toggle("is-hub", mode === "hub" || mode === "gate");
    shell.classList.toggle("is-gate", mode === "gate");
    shell.classList.toggle("is-board", mode === "board");
    shell.classList.toggle("is-walk", mode === "walk");
    if (hub) hub.hidden = mode !== "hub" && mode !== "gate";
    if (room) room.hidden = mode !== "board";
  }

  function pickCard(href, data, delay, kicker, title, desc, icon) {
    return `<a class="plaza-pick" href="${esc(href)}" data-plaza='${esc(JSON.stringify(data))}' style="--d:${delay}">
      <span class="plaza-pick-glow" aria-hidden="true"></span>
      <span class="plaza-pick-icon" aria-hidden="true">${icon}</span>
      <span class="plaza-pick-kicker">${esc(kicker)}</span>
      <strong>${esc(title)}</strong>
      <span class="plaza-pick-desc">${esc(desc)}</span>
      <span class="plaza-pick-go">${esc(L("들어가기", "Enter"))}</span>
    </a>`;
  }

  function renderPlazaHub() {
    pause();
    currentBoard = null;
    currentKind = "";
    uiOpen = false;
    setShellMode("hub");
    hub.innerHTML = `<section class="plaza-gate">
      <p class="hub-lead">${esc(L("원하는 게시판을 골라 들어가세요.", "Pick a board and go in."))}</p>
      <div class="plaza-choice plaza-choice-4">
        ${pickCard("/plaza/jobs", { gate: "jobs" }, 0, "01", L("구인구직", "Recruiting"), L("공대와 공대원을 찾고 올립니다.", "Find raids and members."), '<svg viewBox="0 0 48 48" fill="none"><circle cx="16" cy="14" r="5" fill="currentColor"/><path d="M7 33c1.5-7 5.4-11 9-11s7.5 4 9 11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="33" cy="14" r="5" fill="var(--gold)"/><path d="M24 33c1.5-7 5.4-11 9-11s7.5 4 9 11" stroke="var(--gold)" stroke-width="2.6" stroke-linecap="round"/></svg>')}
        ${pickCard("/plaza/info", { board: "info", mode: "list" }, 1, "02", L("정보 게시판", "Info Board"), L("패치와 일정을 모아 둡니다.", "Patches and schedules."), '<svg viewBox="0 0 48 48" fill="none"><rect x="10" y="8" width="28" height="32" rx="4" stroke="currentColor" stroke-width="2.4"/><path d="M16 18h16M16 25h16M16 32h10" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round"/></svg>')}
        ${pickCard("/plaza/free", { board: "free", mode: "list" }, 2, "03", L("자유 게시판", "Free Board"), L("광장에서 하던 이야기를 남깁니다.", "Keep the plaza talk going."), '<svg viewBox="0 0 48 48" fill="none"><path d="M10 14h28v18H18l-8 8V14z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M18 22h12M18 28h8" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round"/></svg>')}
        ${pickCard("/plaza/walk", { walk: true }, 3, "04", L("광장 산책", "Plaza Walk"), L("오그리마를 걷고 간판 앞에서 들어갑니다.", "Walk Orgrimmar and enter a sign."), '<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="12" r="5" fill="var(--gold)"/><path d="M18 44l4-16 2 8 4-10 4 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 28h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>')}
      </div>
    </section>`;
    bindPlazaLinks(hub);
  }

  function renderJobsGate(intent) {
    pause();
    currentBoard = null;
    currentKind = "";
    uiOpen = false;
    setShellMode("gate");
    if (!intent) {
      hub.innerHTML = `<section class="plaza-gate">
        <a class="plaza-back" href="/plaza" data-plaza='{"walk":true}'>${esc(L("← 커뮤니티", "← Community"))}</a>
        <div class="plaza-crumb">${esc(L("구인구직", "Recruiting"))}</div>
        <p class="hub-lead">${esc(L("어디로 들어가시겠습니까?", "Which way in?"))}</p>
        <div class="plaza-choice">
          ${pickCard("/plaza/jobs/recruit", { gate: "jobs", intent: "recruit" }, 0, "01", L("공격대 찾기", "Find a Raid"), L("빈 공대를 보고, 나를 인재풀에 올립니다.", "Browse raids and list yourself."), '<svg viewBox="0 0 48 48" fill="none"><path d="M24 8l14 6v10c0 9-6 16-14 18-8-2-14-9-14-18V14l14-6z" stroke="currentColor" stroke-width="2.4"/><path d="M18 24l5 5 8-10" stroke="var(--gold)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')}
          ${pickCard("/plaza/jobs/seek", { gate: "jobs", intent: "seek" }, 1, "02", L("공대원 찾기", "Find Members"), L("사람을 보고, 우리 공격대를 올립니다.", "Browse players and post your raid."), '<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="15" r="6" fill="var(--gold)"/><path d="M10 36c2-8 7-12 14-12s12 4 14 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>')}
        </div>
      </section>`;
    } else {
      const seek = intent === "seek";
      const title = seek ? L("공대원 찾기", "Find Members") : L("공격대 찾기", "Find a Raid");
      hub.innerHTML = `<section class="plaza-gate is-slide">
        <a class="plaza-back" href="/plaza/jobs" data-plaza='{"gate":"jobs"}'>${esc(L("← 구인구직", "← Recruiting"))}</a>
        <div class="plaza-crumb">${esc(L("구인구직", "Recruiting"))} · ${esc(title)}</div>
        <p class="hub-lead">${esc(L("정공과 막공 중 고르세요.", "Choose scheduled or pickup."))}</p>
        <div class="plaza-choice">
          ${pickCard("/plaza/jobs/" + intent + "/regular", { board: intent, kind: "regular", mode: "list" }, 0, "01", L("정공", "Scheduled"), seek ? L("고정 공대에 들어갈 사람을 봅니다.", "People for a regular raid.") : L("고정 공대 구인글을 봅니다.", "Regular raid listings."), '<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" stroke-width="2.4"/><path d="M8 18h32M16 10v8M32 10v8" stroke="currentColor" stroke-width="2.4"/><rect x="14" y="24" width="8" height="8" rx="2" fill="var(--gold)"/></svg>')}
          ${pickCard("/plaza/jobs/" + intent + "/pickup", { board: intent, kind: "pickup", mode: "list" }, 1, "02", L("막공", "Pickup"), seek ? L("지금 들어갈 수 있는 사람을 봅니다.", "People free for a pickup.") : L("지금 모이는 공대를 봅니다.", "Raids forming now."), '<svg viewBox="0 0 48 48" fill="none"><path d="M26 6L12 26h10l-2 16 16-22H26l2-14z" fill="var(--gold)" stroke="currentColor" stroke-width="2"/></svg>')}
        </div>
      </section>`;
    }
    bindPlazaLinks(hub);
  }

  function likelySignedIn() {
    if (authUser()) return true;
    try {
      return Boolean(localStorage.getItem("wow-raid-preview-session"));
    } catch {
      return false;
    }
  }

  function showLoginGate() {
    if (!gateEl) return;
    uiOpen = true;
    gateEl.hidden = false;
    gateEl.innerHTML = `<div class="mw-card mw-auth-gate" role="dialog" aria-modal="true">
      <h2>${esc(L("커뮤니티", "Community"))}</h2>
      <p>${esc(L("로그인을 하면 광장을 이용할 수 있습니다.", "Log in to use the plaza."))}</p>
      <div class="mw-auth-gate-acts">
        <button type="button" class="mw-btn gold" data-plaza-login>${esc(L("로그인 하기", "Log in"))}</button>
        <button type="button" class="mw-btn" data-plaza-lurk>${esc(L("눈팅만 하기", "Just browse"))}</button>
      </div>
    </div>`;
  }

  function hideLoginGate() {
    if (!gateEl) return;
    gateEl.hidden = true;
    gateEl.innerHTML = "";
    if (!salon || salon.hidden) uiOpen = !!currentBoard;
  }

  function enterAsLurk() {
    lurkOk = true;
    try {
      sessionStorage.setItem("wow-plaza-lurk", "1");
    } catch {
      /* ignore */
    }
    hideLoginGate();
    openRoute(lastPlazaRoute);
  }

  function needsPlazaGate() {
    if (authUser() || lurkOk) return false;
    try {
      if (sessionStorage.getItem("wow-plaza-lurk") === "1") {
        lurkOk = true;
        return false;
      }
    } catch {
      /* ignore */
    }
    return !likelySignedIn();
  }

  function showWalk(opts) {
    const skipSalon = opts && opts.skipSalon;
    setShellMode("walk");
    currentBoard = null;
    currentKind = "";
    uiOpen = false;
    if (salon) salon.hidden = true;
    requestAnimationFrame(() => layoutPlaza());
    if (!skipSalon && !state.entered && authUser()) openSalon(true);
    else welcome();
    if (!running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function pageTitle(route) {
    const r = route || lastPlazaRoute || {};
    if (r.walk) return L("커뮤니티", "Community");
    if (r.board === "recruit" || r.board === "seek") {
      const base = boardTitle(r.board);
      if (r.kind === "pickup") return base + " · " + L("막공", "Pickup");
      if (r.kind === "regular") return base + " · " + L("정공", "Scheduled");
      return base;
    }
    if (r.board) return boardTitle(r.board);
    if (r.gate === "jobs" && r.intent === "recruit") return L("공격대 찾기", "Find a Raid");
    if (r.gate === "jobs" && r.intent === "seek") return L("공대원 찾기", "Find Members");
    if (r.gate === "jobs") return L("구인구직", "Recruiting");
    return L("커뮤니티", "Community");
  }

  function openRoute(route) {
    lastPlazaRoute = route || { view: "plaza", walk: true };
    if (!lastPlazaRoute.board && !lastPlazaRoute.gate) lastPlazaRoute.walk = true;
    if (!built) return;
    if (needsPlazaGate()) {
      if (lastPlazaRoute.walk) showWalk({ skipSalon: true });
      else pause();
      showLoginGate();
      return;
    }
    hideLoginGate();
    if (lastPlazaRoute.walk) {
      showWalk({ skipSalon: !authUser() });
      return;
    }
    pause();
    if (lastPlazaRoute.board === "recruit" || lastPlazaRoute.board === "seek") {
      if (lastPlazaRoute.kind) {
        renderBoardPage(lastPlazaRoute.board, true, lastPlazaRoute);
        return;
      }
      renderJobsGate(lastPlazaRoute.intent || lastPlazaRoute.board);
      return;
    }
    if (lastPlazaRoute.board === "info" || lastPlazaRoute.board === "free") {
      renderBoardPage(lastPlazaRoute.board, true, lastPlazaRoute);
      return;
    }
    if (lastPlazaRoute.gate === "jobs") {
      renderJobsGate(lastPlazaRoute.intent || "");
      return;
    }
    renderPlazaHub();
  }

  function openSpot(spot) {
    if (!spot || uiOpen) return;
    me.vx = 0;
    moveTarget = null;
    pending = null;
    if (spot.id === "salon") openSalon(false);
    else if (spot.id === "recruit") plazaRoute({ gate: "jobs" });
    else plazaRoute({ board: spot.id, mode: "list" });
  }

  function tryInteract() {
    if (uiOpen || !me) return;
    let best = null;
    let bestD = RANGE;
    for (const s of SPOTS) {
      const d = Math.abs(me.x - s.x);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) openSpot(best);
  }

  function updatePrompt(spot) {
    if (!promptEl) return;
    const id = spot ? spot.id : "";
    promptEl.hidden = !spot;
    if (!spot) {
      promptId = "";
      return;
    }
    if (promptId === id) return;
    promptId = id;
    promptEl.textContent = L(spotName(id) + " 들어가기  ·  E", "Enter " + spotName(id) + "  ·  E");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function boardDay(ts) {
    const d = new Date(ts || Date.now());
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function boardStamp(ts) {
    const d = new Date(ts || Date.now());
    return (
      d.getFullYear() +
      "." +
      pad2(d.getMonth() + 1) +
      "." +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function voterName() {
    const user = authUser();
    return state.me.name || (user && user.battletag) || L("여행자", "Traveler");
  }

  function authUser() {
    return window.RaidAuth && typeof RaidAuth.user === "function" ? RaidAuth.user() : null;
  }

  function isLead(post) {
    if (!post) return false;
    const user = authUser();
    if (user && post.authorId && post.authorId === user.id) return true;
    return Boolean(post.author && post.author === voterName());
  }

  function wclCharUrl(ch) {
    if (!ch || !ch.name) return "";
    const region = ch.region || "kr";
    const realm = ch.realmSlug || String(ch.realm || "").toLowerCase().replace(/\s+/g, "-");
    if (!realm) return "";
    return `https://www.warcraftlogs.com/character/${region}/${encodeURIComponent(realm)}/${encodeURIComponent(ch.name)}`;
  }

  function specsForWowClass(className) {
    const raw = String(className || "").trim();
    if (!raw) return [];
    const compact = raw.replace(/\s+/g, "").toLowerCase();
    return specList().filter((s) => {
      return (
        s.classKo === raw ||
        s.classEn === raw ||
        s.classEn.replace(/\s+/g, "").toLowerCase() === compact
      );
    });
  }

  function encodeChar(ch) {
    return encodeURIComponent(JSON.stringify(ch || {}));
  }

  function decodeChar(raw) {
    try {
      return JSON.parse(decodeURIComponent(raw || ""));
    } catch {
      return null;
    }
  }

  function encodeChars(list) {
    return encodeURIComponent(JSON.stringify(Array.isArray(list) ? list : []));
  }

  function decodeChars(raw) {
    const parsed = decodeChar(raw);
    return Array.isArray(parsed) ? parsed.filter((ch) => ch && ch.name) : [];
  }

  function classColorOf(className) {
    const table = (global.RAID_DATA && global.RAID_DATA.classes) || {};
    if (table[className] && table[className][1]) return table[className][1];
    const hit = Object.entries(table).find(([en, row]) => en === className || (row && row[0] === className));
    return hit && hit[1] ? hit[1][1] : "#c9a15c";
  }

  function dayLabel(ids) {
    return (ids || [])
      .map((id) => DAYS.find((d) => d[0] === id))
      .filter(Boolean)
      .map((d) => L(d[1], d[2]))
      .join("·");
  }

  function roleGroup(role) {
    return ROLE_GROUPS.find((row) => row[0] === role) || null;
  }

  function roleGroupLabel(role) {
    const hit = roleGroup(role);
    return hit ? L(hit[1], hit[2]) : "";
  }

  let specCache = null;
  function specList() {
    if (specCache) return specCache;
    const rows = (global.RAID_DATA && global.RAID_DATA.raid && global.RAID_DATA.raid.specs) || [];
    specCache = rows
      .map((row) => {
        const group = ROLE_GROUPS.find((item) => item[3] === row.role);
        const cls = CLASSES.find((item) => item[2] === row.class);
        if (!group || !cls) return null;
        return {
          id: row.class + "|" + row.spec,
          role: group[0],
          classId: cls[0],
          classKo: row.classKo || cls[1],
          classEn: row.class,
          specKo: row.specKo || row.spec,
          specEn: row.spec,
        };
      })
      .filter(Boolean);
    return specCache;
  }

  function specLabel(spec, all) {
    const list = all || specList();
    const shared = list.some((item) => item !== spec && item.specKo === spec.specKo);
    if (!shared) return L(spec.specKo, spec.specEn);
    const cls = CLASSES.find((item) => item[0] === spec.classId);
    const tail = cls ? L(cls[3], cls[2]) : spec.classKo;
    return L(spec.specKo + " " + tail, spec.specEn);
  }

  function classShort(id) {
    const hit = CLASSES.find((c) => c[0] === id);
    return hit ? L(hit[3], hit[2]) : id;
  }

  function classFull(id) {
    const hit = CLASSES.find((c) => c[0] === id);
    return hit ? L(hit[1], hit[2]) : id;
  }

  function parseHour(value) {
    const raw = String(value ?? "").trim();
    if (!/^\d{1,2}$/.test(raw)) return null;
    const n = Number(raw);
    return n <= 24 ? n : null;
  }

  function hasHours(post) {
    const from = Number(post.hourFrom);
    const to = Number(post.hourTo);
    if (!Number.isFinite(from)) return false;
    if (from === 0 && (!Number.isFinite(to) || to === 0) && !(post.days || []).length) return false;
    return true;
  }

  function hourRange(post) {
    if (!hasHours(post)) return "";
    const from = Number(post.hourFrom);
    const to = Number(post.hourTo);
    const end = Number.isFinite(to) ? to : from;
    return end > from ? from + "~" + end : String(from);
  }

  function postSpecIds(post) {
    const catalog = specList();
    const known = new Set(catalog.map((spec) => spec.id));
    if (Array.isArray(post.specs) && post.specs.length) return post.specs.filter((id) => known.has(id));
    const group = roleGroup(post.role);
    if (group) return catalog.filter((spec) => spec.role === group[0]).map((spec) => spec.id);
    const classes = post.classes || [];
    if (!classes.length) return [];
    return catalog.filter((spec) => classes.includes(spec.classId)).map((spec) => spec.id);
  }

  function specSummary(post) {
    const ids = Array.isArray(post.specs) && post.specs.length ? post.specs : [];
    const catalog = specList();
    if (!ids.length) {
      if (post.role) return roleGroupLabel(post.role);
      return (post.classes || []).map(classShort).join(" · ");
    }
    const picked = ids.map((id) => catalog.find((spec) => spec.id === id)).filter(Boolean);
    const used = new Set();
    const chunks = [];
    ROLE_GROUPS.forEach((group) => {
      const all = catalog.filter((spec) => spec.role === group[0]);
      if (all.length && all.every((spec) => ids.includes(spec.id))) {
        chunks.push(L(group[1], group[2]));
        all.forEach((spec) => used.add(spec.id));
      }
    });
    picked.forEach((spec) => {
      if (used.has(spec.id)) return;
      chunks.push(specLabel(spec, catalog));
    });
    return chunks.join(" · ");
  }

  function scheduleText(post) {
    const days = dayLabel(post.days);
    const span = hourRange(post);
    if (days || span) return [days, span].filter(Boolean).join(" ");
    return fieldText(post, "when");
  }

  function scoreOf(post) {
    return (post.up || []).length - (post.down || []).length;
  }

  function matchesQuery(post) {
    const q = queryOf(currentBoard || post.board, currentKind || post.raidKind);
    if (!q) return true;
    const days = post.days || [];
    const picked = q.days || [];
    const seek = post.board === "seek";
    if (picked.length) {
      if (!days.length) return false;
      const ok = seek ? picked.every((d) => days.includes(d)) : days.every((d) => picked.includes(d));
      if (!ok) return false;
    }
    const qFrom = parseHour(q.from);
    const qTo = parseHour(q.to);
    if ((qFrom != null || qTo != null) && !(qFrom != null && qTo != null && qTo < qFrom)) {
      if (!hasHours(post)) return false;
      const from = Number(post.hourFrom);
      const end = Number(post.hourTo);
      const to = Number.isFinite(end) ? end : from;
      if (seek) {
        if (qFrom != null && from > qFrom) return false;
        if (qTo != null && to < qTo) return false;
      } else {
        if (qFrom != null && from < qFrom) return false;
        if (qTo != null && to > qTo) return false;
      }
    }
    const want = q.specs || [];
    if (want.length && !want.some((id) => postSpecIds(post).includes(id))) return false;
    return true;
  }

  function optionList(items, selected, blank) {
    const head = blank ? `<option value="">${esc(blank)}</option>` : "";
    return (
      head +
      items
        .map((item) => {
          const value = item[0];
          const label = item[1];
          return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
        })
        .join("")
    );
  }

  function dayChecks() {
    return `<div class="mw-checks">${DAYS.map(
      ([id, ko, en]) => `<label><input type="checkbox" name="day" value="${id}"> ${esc(L(ko, en))}</label>`
    ).join("")}</div>`;
  }

  function specChecks(selected, filter) {
    const catalog = specList();
    const picked = new Set(selected || []);
    const attr = filter ? "data-filter-spec" : 'name="spec"';
    const masters = ROLE_GROUPS.map(([role, ko, en]) => {
      const ids = catalog.filter((spec) => spec.role === role).map((spec) => spec.id);
      const on = ids.length > 0 && ids.every((id) => picked.has(id));
      return `<label class="is-role"><input type="checkbox" data-role-all="${role}"${on ? " checked" : ""}> ${esc(L(ko, en))}</label>`;
    }).join("");
    const groups = CLASSES.map(([classId, ko, en]) => {
      const mine = catalog.filter((spec) => spec.classId === classId);
      if (!mine.length) return "";
      const boxes = mine
        .map(
          (spec) =>
            `<label><input type="checkbox" ${attr} data-spec-role="${spec.role}" value="${esc(spec.id)}"${picked.has(spec.id) ? " checked" : ""}> ${esc(specLabel(spec, catalog))}</label>`
        )
        .join("");
      return `<div class="mw-spec-class"><b>${esc(L(ko, en))}</b><div class="mw-checks">${boxes}</div></div>`;
    }).join("");
    return `<div class="mw-spec-board"><div class="mw-checks mw-role-all">${masters}</div><div class="mw-spec-grid">${groups}</div></div>`;
  }

  function checkedValues(form, name) {
    return [...form.querySelectorAll(`input[name=${name}]:checked`)].map((el) => el.value);
  }

  function boardHref(id, view) {
    const kind = (view && view.kind) || currentKind || "regular";
    const mode = (view && view.mode) || "list";
    const postId = view && view.postId;
    if (id === "info" || id === "free") {
      if (mode === "write") return "/plaza/" + id + "/write";
      if (mode === "read" && postId) return "/plaza/" + id + "/" + encodeURIComponent(postId);
      return "/plaza/" + id;
    }
    const base = "/plaza/jobs/" + id + "/" + kind;
    if (mode === "write") {
      const as = (view && view.writeAs) || writeAsFor(id);
      return base + (as === "pool" ? "/write-pool" : "/write-raid");
    }
    if (mode === "read" && postId) return base + "/" + encodeURIComponent(postId);
    return base;
  }

  function writeAsFor(id, as) {
    if (as === "pool" || as === "raid") return as;
    return id === "recruit" ? "pool" : "raid";
  }

  function boardTabs() {
    return "";
  }

  function hourField(name, value, placeholder) {
    const shown = value === 0 || value ? String(value) : "";
    return `<input type="number" ${name} min="0" max="24" step="1" inputmode="numeric" placeholder="${esc(placeholder)}" value="${esc(shown)}">`;
  }

  function filterBar(id) {
    const q = queryOf(id, currentKind);
    const picked = new Set(q.days || []);
    const days = DAYS.map(
      ([value, ko, en]) =>
        `<label><input type="checkbox" data-filter-day value="${value}"${picked.has(value) ? " checked" : ""}> ${esc(L(ko, en))}</label>`
    ).join("");
    const specHint = id === "seek" ? L("찾는 전문화", "Specs to find") : L("할 수 있는 전문화", "Specs I can play");
    return `<div class="mw-filter">
      <div class="mw-filter-days"><span>${esc(L("요일", "Days"))}</span><div class="mw-checks">${days}</div></div>
      <div class="mw-filter-time">
        <span>${esc(L("시간", "Time"))}</span>
        ${hourField('data-filter="from"', q.from, L("부터", "From"))}
        <span class="mw-tilde">~</span>
        ${hourField('data-filter="to"', q.to, L("까지", "To"))}
      </div>
      <div class="mw-filter-specs">
        <span>${esc(specHint)}</span>
        ${specChecks(q.specs, true)}
      </div>
    </div>`;
  }

  function scrollShell(id, body) {
    const jobs = id === "recruit" || id === "seek";
    const backHref = jobs ? "/plaza/jobs/" + id : "/plaza";
    const kindLabel = currentKind === "pickup" ? L("막공", "Pickup") : currentKind === "regular" ? L("정공", "Scheduled") : "";
    return `<div class="mw-scroll">
      <div class="mw-rod" aria-hidden="true"></div>
      <div class="mw-scroll-h">
        <i class="mw-seal" aria-hidden="true"></i>
        <div>
          <div class="mw-scroll-kicker">${esc(kindLabel || L("게시판", "Board"))}</div>
          <h2>${esc(pageTitle({ board: id, kind: currentKind }))}</h2>
          <div class="sub">${esc(spotBlurb(id))}</div>
        </div>
        <span class="mw-scroll-acts">
          ${mailButtonHtml()}
          <a class="mw-btn" href="${esc(backHref)}" data-close>${esc(jobs ? L("뒤로", "Back") : L("광장으로", "Plaza"))}</a>
        </span>
      </div>
      ${body}
      <div class="mw-rod mw-rod-end" aria-hidden="true"></div>
    </div>`;
  }

  function writeLabel(as) {
    if (as === "pool") return L("인재풀에 등록", "Join the pool");
    return L("우리 공격대 올리기", "Post our raid");
  }

  function commentList(post) {
    const items = post.comments || [];
    const rows = items.length
      ? items
          .map((c) => {
            const mine = c.author === state.me.name && state.me.name;
            return `<li>
              <div class="mw-comment-h"><b>${esc(c.author || "")}</b><span>${esc(boardStamp(c.createdAt))}</span></div>
              <p>${esc(fieldText(c, "body"))}</p>
              ${mine ? `<button type="button" class="mw-btn tiny" data-cdel="${esc(c.id)}" data-post="${esc(post.id)}">${esc(L("지우기", "Delete"))}</button>` : ""}
            </li>`;
          })
          .join("")
      : `<li class="mw-empty">${esc(L("아직 댓글이 없습니다.", "No comments yet."))}</li>`;
    return `<section class="mw-comments">
      <h4>${esc(L("댓글 " + items.length, items.length + " comments"))}</h4>
      <ul>${rows}</ul>
      ${
        authUser()
          ? `<form class="mw-comment-form" data-kind="comment" data-post="${esc(post.id)}">
        <textarea name="body" maxlength="200" rows="3" placeholder="${esc(L("댓글을 적습니다.", "Write a comment."))}"></textarea>
        <button type="submit" class="mw-btn gold">${esc(L("댓글 등록", "Comment"))}</button>
      </form>`
          : `<p class="sub">${esc(L("댓글은 로그인 후 남길 수 있습니다.", "Log in to comment."))}</p>`
      }
    </section>`;
  }

  function voteBar(post) {
    const name = voterName();
    const upOn = (post.up || []).includes(name) ? " is-on" : "";
    const downOn = (post.down || []).includes(name) ? " is-on" : "";
    return `<div class="mw-vote">
      <button type="button" class="mw-btn up${upOn}" data-vote="up" data-id="${esc(post.id)}">${esc(L("추천", "Up"))} ${(post.up || []).length}</button>
      <button type="button" class="mw-btn down${downOn}" data-vote="down" data-id="${esc(post.id)}">${esc(L("비추천", "Down"))} ${(post.down || []).length}</button>
    </div>`;
  }

  function renderRead(post) {
    const mine = isLead(post);
    const facts = [scheduleText(post), specSummary(post)].filter(Boolean);
    const wcl = post.character ? wclCharUrl(post.character) : "";
    const charLine = post.character
      ? `<div class="mw-char-meta">
          <b>${esc(post.character.name)}</b>
          <span>${esc(post.character.realm || "")} · ${esc(post.character.className || "")} · ${post.character.level || ""}</span>
          ${wcl ? `<a class="mw-wcl" href="${esc(wcl)}" target="_blank" rel="noopener" data-external>WCL</a>` : ""}
        </div>`
      : "";
    return `<article class="mw-letter">
      <h3>${esc(fieldText(post, "title"))}</h3>
      <div class="mw-letter-meta">
        <b>${esc(post.author || "")}</b>
        <span>${esc(boardStamp(post.createdAt))}</span>
        <span>${esc(L("조회 " + (post.views || 0), (post.views || 0) + " views"))}</span>
        ${facts.map((f) => `<span>${esc(f)}</span>`).join("")}
      </div>
      ${charLine}
      ${voteBar(post)}
      <p>${esc(fieldText(post, "body"))}</p>
      ${post.board === "recruit" ? renderApplyBox(post, mine) : ""}
      <div class="mw-compose-row">
        <a class="mw-btn" href="${esc(boardHref(currentBoard, { mode: "list" }))}" data-list>${esc(L("목록", "List"))}</a>
        ${mine ? `<button type="button" class="mw-btn tiny" data-del="${esc(post.id)}">${esc(L("지우기", "Delete"))}</button>` : "<span></span>"}
      </div>
      ${commentList(post)}
    </article>`;
  }

  function renderApplyBox(post, lead) {
    if (lead) return renderLeadApps(post);
    const user = authUser();
    const mine = user ? (post.apps || []).filter((a) => a.userId === user.id) : [];
    const done = mine.length
      ? `<p class="mw-apply-ok">${esc(
          L(
            "공대장 우편함으로 보냈습니다.",
            "Sent to the raid lead mailbox."
          )
        )}</p>`
      : "";
    if (!user) {
      return `<section class="mw-apply">
      <h4>${esc(L("신청", "Apply"))}</h4>
      <p class="sub">${esc(L("로그인을 하면 이 공대에 신청할 수 있습니다.", "Log in to apply to this raid."))}</p>
    </section>`;
    }
    return `<section class="mw-apply">
      <h4>${esc(L("신청", "Apply"))}</h4>
      <p class="sub">${esc(L("신청 내용은 공대장만 봅니다. 부캐로 신청하면 본캐를 참고용으로 올려 둘 수 있습니다.", "Only the raid lead sees this. If you apply on an alt, you can attach your main for reference."))}</p>
      ${done}
      ${done ? `<button type="button" class="mw-btn" data-mail-open>${esc(L("우편함 열기", "Open mailbox"))}</button>` : ""}
      <button type="button" class="mw-btn gold" data-apply-open="${esc(post.id)}">${esc(
        mine.length ? L("다시 신청하기", "Apply again") : L("신청하기", "Apply")
      )}</button>
      <div class="mw-char-box hidden" data-chars data-chars-mode="apply" data-apply-post="${esc(post.id)}" hidden></div>
    </section>`;
  }

  function appCharLine(ch, label) {
    if (!ch || !ch.name) return "";
    const wcl = wclCharUrl(ch);
    const color = classColorOf(ch.className);
    return `<div class="mw-app-char" style="--class:${color}">
      ${label ? `<em>${esc(label)}</em>` : ""}
      <b>${esc(ch.name)}</b>
      <span>${esc(ch.realm || "")} · <i class="mw-class">${esc(ch.className || "")}</i>${ch.level ? " · " + ch.level : ""}</span>
      ${wcl ? `<a class="mw-wcl-tiny" href="${esc(wcl)}" target="_blank" rel="noopener" data-external>WCL</a>` : ""}
    </div>`;
  }

  function applyCharsOf(app) {
    if (app && Array.isArray(app.characters) && app.characters.length) return app.characters.filter((ch) => ch && ch.name);
    return app && app.character && app.character.name ? [app.character] : [];
  }

  function renderLeadApps(post) {
    const apps = post.apps || [];
    const rows = apps.length
      ? apps
          .map((app) => {
            const chars = applyCharsOf(app);
            return `<li class="mw-app">
              <div class="mw-apply-label">${esc(L("신청 캐릭", "Apply as"))}</div>
              ${chars.map((ch) => appCharLine(ch, "")).join("")}
              ${appCharLine(app.main, L("본캐", "Main"))}
              ${app.body ? `<p>${esc(app.body)}</p>` : ""}
              <span class="mw-app-who">${esc(app.author || "")} · ${esc(boardStamp(app.createdAt))}</span>
            </li>`;
          })
          .join("")
      : `<li class="mw-empty">${esc(L("아직 신청이 없습니다.", "No applications yet."))}</li>`;
    return `<section class="mw-apply is-lead">
      <h4>${esc(L("신청자 · 공대장만 보임", "Applicants · lead only"))}</h4>
      <p class="sub">${esc(L("같은 내용이 우편함에도 도착합니다.", "The same applications also land in your mailbox."))}</p>
      <ul class="mw-apps">${rows}</ul>
    </section>`;
  }

  function renderWrite(id) {
    const party = id === "recruit" || id === "seek";
    const as = party ? writeAsFor(id, currentWriteAs) : "";
    const pool = as === "pool";
    const hours = party
      ? `<div class="mw-field">${esc(L("시간", "Time"))}
          <div class="mw-time-pair">
            ${hourField('name="hourFrom"', "", L("부터", "From"))}
            <span class="mw-tilde">~</span>
            ${hourField('name="hourTo"', "", L("까지", "To"))}
          </div>
        </div>
        <div class="mw-field">${esc(L("공대 유형", "Raid type"))}
          <div class="mw-checks">
            <label><input type="radio" name="raidKind" value="regular"${currentKind !== "pickup" ? " checked" : ""}> ${esc(L("정공", "Scheduled"))}</label>
            <label><input type="radio" name="raidKind" value="pickup"${currentKind === "pickup" ? " checked" : ""}> ${esc(L("막공", "Pickup"))}</label>
          </div>
        </div>`
      : "";
    const specs = party
      ? `<div class="mw-field">${esc(pool ? L("내 전문화", "My specs") : L("구하는 전문화", "Specs needed"))}${specChecks([], false)}</div>`
      : "";
    const days = party
      ? `<div class="mw-field">${esc(L("요일", "Days"))}${dayChecks()}</div>`
      : "";
    return `<form class="mw-compose" novalidate>
      <input type="hidden" name="writeAs" value="${esc(as)}">
      <div class="mw-compose-row">
        <strong>${esc(party ? writeLabel(as) : L("글쓰기", "Write"))}</strong>
        <a class="mw-btn" href="${esc(boardHref(id, { mode: "list" }))}" data-list>${esc(L("목록", "List"))}</a>
      </div>
      ${pool ? `<div class="mw-char-box" data-chars data-chars-mode="pool"></div>` : ""}
      <input type="hidden" name="character" value="">
      <input name="title" maxlength="40" placeholder="${esc(pool ? L("한 줄 소개", "One-line intro") : L("공대 제목", "Raid title"))}">
      ${days}
      ${hours}
      ${specs}
      <textarea name="body" maxlength="500" rows="6" placeholder="${esc(pool ? L("가능한 시간과 역할을 적습니다.", "Write your hours and roles.") : L("공대 소개와 구하는 자리를 적습니다.", "Describe the raid and the spots you need."))}"></textarea>
      <div class="mw-compose-row">
        <span class="mw-err"></span>
        <button type="submit" class="mw-btn gold">${esc(L("등록", "Post"))}</button>
      </div>
    </form>`;
  }

  function renderList(id, posts) {
    const party = id === "recruit" || id === "seek";
    const shown = posts.filter(matchesQuery);
    let head = "";
    let rows = "";
    if (id === "recruit") {
      head = `<div class="mw-inven-row is-head">
        <span class="c-title">${esc(L("제목", "Title"))}</span>
        <span class="c-when">${esc(L("일정", "When"))}</span>
        <span class="c-role">${esc(L("전문화", "Spec"))}</span>
        <span class="c-who">${esc(L("글쓴이", "Author"))}</span>
        <span class="c-score">${esc(L("추천", "Score"))}</span>
      </div>`;
      rows = shown
        .map(
          (p) => `<a class="mw-inven-row" href="${esc(boardHref(id, { mode: "read", postId: p.id }))}" data-open="${esc(p.id)}">
            <span class="c-title">${esc(fieldText(p, "title"))}</span>
            <span class="c-when">${esc(scheduleText(p))}</span>
            <span class="c-role">${esc(specSummary(p))}</span>
            <span class="c-who">${esc(p.author || "")}</span>
            <span class="c-score">${scoreOf(p)}</span>
          </a>`
        )
        .join("");
    } else if (id === "seek") {
      head = `<div class="mw-inven-row is-head">
        <span class="c-title">${esc(L("소개", "Intro"))}</span>
        <span class="c-when">${esc(L("가능 시간", "Free"))}</span>
        <span class="c-job">${esc(L("전문화", "Spec"))}</span>
        <span class="c-who">${esc(L("글쓴이", "Author"))}</span>
        <span class="c-score">${esc(L("추천", "Score"))}</span>
      </div>`;
      rows = shown
        .map(
          (p) => `<a class="mw-inven-row" href="${esc(boardHref(id, { mode: "read", postId: p.id }))}" data-open="${esc(p.id)}">
            <span class="c-title">${esc(fieldText(p, "title"))}${
              p.character && wclCharUrl(p.character)
                ? ` <span class="mw-wcl-inline" data-wcl="${esc(wclCharUrl(p.character))}">WCL</span>`
                : ""
            }</span>
            <span class="c-when">${esc(scheduleText(p))}</span>
            <span class="c-job">${esc(specSummary(p) || (p.character && p.character.className) || "")}</span>
            <span class="c-who">${esc((p.character && p.character.name) || p.author || "")}</span>
            <span class="c-score">${scoreOf(p)}</span>
          </a>`
        )
        .join("");
    } else {
      head = `<div class="mw-inven-row is-head">
        <span class="c-num">${esc(L("번호", "No"))}</span>
        <span class="c-title">${esc(L("제목", "Title"))}</span>
        <span class="c-who">${esc(L("글쓴이", "Author"))}</span>
        <span class="c-date">${esc(L("날짜", "Date"))}</span>
        <span class="c-hit">${esc(L("조회", "Views"))}</span>
        <span class="c-score">${esc(L("추천", "Score"))}</span>
      </div>`;
      rows = shown
        .map(
          (p, i) => `<a class="mw-inven-row" href="${esc(boardHref(id, { mode: "read", postId: p.id }))}" data-open="${esc(p.id)}">
            <span class="c-num">${shown.length - i}</span>
            <span class="c-title">${esc(fieldText(p, "title"))}</span>
            <span class="c-who">${esc(p.author || "")}</span>
            <span class="c-date">${esc(boardDay(p.createdAt))}</span>
            <span class="c-hit">${p.views || 0}</span>
            <span class="c-score">${scoreOf(p)}</span>
          </a>`
        )
        .join("");
    }
    const empty = shown.length
      ? ""
      : `<p class="mw-empty">${esc(
          posts.length
            ? L("조건에 맞는 글이 없습니다.", "Nothing matches that filter.")
            : L("아직 글이 없습니다. 첫 글을 남겨 보세요.", "No posts yet. Write the first one.")
        )}</p>`;
    const kind = id === "recruit" ? "is-recruit" : id === "seek" ? "is-seek" : "is-plain";
    const primary = writeAsFor(id);
    const secondary = primary === "raid" ? "pool" : "raid";
    return `${party ? filterBar(id) : ""}
      <div class="mw-inven-bar">
        <span>${esc(L("총 " + shown.length + "건", shown.length + " posts"))}</span>
        <span class="mw-write-duo">
          ${
            authUser()
              ? `${
                  party
                    ? `<a class="mw-btn" href="${esc(boardHref(id, { mode: "write", writeAs: secondary }))}" data-write data-write-as="${secondary}">${esc(writeLabel(secondary))}</a>`
                    : ""
                }
          <a class="mw-btn gold" href="${esc(boardHref(id, { mode: "write", writeAs: party ? primary : "" }))}" data-write data-write-as="${esc(party ? primary : "")}">${esc(party ? writeLabel(primary) : L("글쓰기", "Write"))}</a>`
              : `<span class="sub">${esc(L("글쓰기는 로그인 후 가능합니다.", "Log in to post."))}</span>`
          }
        </span>
      </div>
      <div class="mw-inven ${kind}">${head}${rows}${empty}</div>`;
  }

  function renderBoardPage(id, silent, view) {
    currentBoard = id;
    currentKind = (view && view.kind) || currentKind || ((id === "recruit" || id === "seek") ? "regular" : "");
    currentWriteAs = writeAsFor(id, view && view.writeAs);
    currentMode = (view && view.mode) || "list";
    currentPostId = (view && view.postId) || "";
    uiOpen = true;
    if (salon) salon.hidden = true;
    setShellMode("board");
    const mode = currentMode;
    const posts = state.posts.filter((p) => {
      if (p.board !== id) return false;
      if (id !== "recruit" && id !== "seek") return true;
      return (p.raidKind || "regular") === (currentKind || "regular");
    });
    let body = "";

    if (mode === "read") {
      const post = posts.find((p) => p.id === view.postId) || state.posts.find((p) => p.id === view.postId);
      if (!post) {
        renderBoardPage(id, true, { mode: "list", kind: currentKind });
        return;
      }
      body = renderRead(post);
    } else if (mode === "write") {
      if (!authUser()) {
        promptLogin();
        body = renderList(id, posts);
      } else {
        body = renderWrite(id);
      }
    } else {
      body = renderList(id, posts);
    }

    room.hidden = false;
    room.innerHTML = scrollShell(id, body);
    bindPlazaLinks(room);
    fillCharPicker(room);
    if (!silent) {
      const label = pageTitle({ board: id, kind: currentKind });
      pushLog("", L(label + "에 들어왔습니다.", "Entered " + label + "."), "sys");
    }
  }

  function openBoard(id, silent, view) {
    const next = {
      view: "plaza",
      board: id,
      kind: (view && view.kind) || currentKind || ((id === "recruit" || id === "seek") ? "regular" : ""),
      mode: (view && view.mode) || "list",
      writeAs: (view && view.writeAs) || "",
      postId: (view && view.postId) || "",
    };
    if (window.RaidRouter) {
      RaidRouter.go(next, { replace: !!silent });
      return;
    }
    renderBoardPage(id, silent, next);
  }

  function formError(form, text) {
    const err = form.querySelector(".mw-err");
    if (err) err.textContent = text;
  }

  function submitPost(form) {
    const pickedEarly = decodeChar(form.character && form.character.value);
    const title = (form.title.value.trim() || (pickedEarly && pickedEarly.name) || "").slice(0, 40);
    const body = form.body.value.trim().slice(0, 500);
    const party = currentBoard === "recruit" || currentBoard === "seek";
    const writeAs = party ? writeAsFor(currentBoard, (form.writeAs && form.writeAs.value) || currentWriteAs) : "";
    const targetBoard = writeAs === "pool" ? "seek" : writeAs === "raid" ? "recruit" : currentBoard;
    if (!title || (!party && !body)) {
      formError(form, L("제목과 내용을 적어 주세요.", "Write a title and a message."));
      return;
    }
    const picked = decodeChar(form.character && form.character.value);
    const user = authUser();
    const post = normalizePost({
      id: Math.random().toString(36).slice(2, 10),
      board: targetBoard,
      raidKind: party && form.raidKind && form.raidKind.value === "pickup" ? "pickup" : currentKind || "regular",
      title,
      body,
      author: voterName(),
      authorId: user ? user.id : "",
      character: picked,
      look: lookOf(state.me),
      createdAt: Date.now(),
    });
    if (party) {
      post.days = checkedValues(form, "day").filter((id) => DAYS.some((d) => d[0] === id));
      if (!post.days.length) {
        formError(form, L("요일을 하나 이상 골라 주세요.", "Pick at least one day."));
        return;
      }
    }
    if (party) {
      const from = parseHour(form.hourFrom.value);
      const to = parseHour(form.hourTo.value);
      if (from == null || to == null || to < from) {
        formError(form, L("시간을 0~24 사이로 입력해 주세요. 예: 14~18", "Enter hours from 0 to 24, like 14~18."));
        return;
      }
      post.hourFrom = from;
      post.hourTo = to;
      const known = new Set(specList().map((spec) => spec.id));
      post.specs = checkedValues(form, "spec").filter((id) => known.has(id));
      if (!post.specs.length) {
        formError(form, L("전문화를 하나 이상 골라 주세요.", "Pick at least one spec."));
        return;
      }
      const roles = new Set(post.specs.map((id) => specList().find((spec) => spec.id === id).role));
      post.role = roles.size === 1 ? [...roles][0] : "";
    }
    state.posts.unshift(post);
    persist();
    openBoard(targetBoard, true, { mode: "list", kind: post.raidKind || currentKind });
  }

  function defaultPartyHours(form) {
    const days = form ? checkedValues(form, "day") : [];
    const from = form ? parseHour(form.hourFrom && form.hourFrom.value) : null;
    const to = form ? parseHour(form.hourTo && form.hourTo.value) : null;
    return {
      days: days.length ? days : DAYS.map((d) => d[0]),
      hourFrom: from == null ? 20 : from,
      hourTo: to == null ? 24 : to,
    };
  }

  function quickPoolFromChar(ch) {
    if (!ch || !ch.name) return;
    const user = authUser();
    if (!user) {
      promptLogin();
      return;
    }
    upsertPoolFromChar(ch);
    openBoard("seek", true, { mode: "list", kind: currentKind || "regular" });
  }

  function applyToRaid(postId, chars, main, body) {
    const list = (Array.isArray(chars) ? chars : [chars]).filter((ch) => ch && ch.name);
    if (!list.length) return;
    const user = authUser();
    if (!user) {
      promptLogin();
      return;
    }
    const post = state.posts.find((p) => p.id === postId);
    if (!post || post.board !== "recruit") return;
    const mainChar = main && main.name && !list.some((ch) => ch.id === main.id) ? main : null;
    const app = {
      id: Math.random().toString(36).slice(2, 10),
      userId: user.id,
      author: voterName(),
      charId: list[0].id,
      character: list[0],
      characters: list,
      main: mainChar,
      body: String(body || "").trim().slice(0, 500),
      createdAt: Date.now(),
    };
    post.apps = Array.isArray(post.apps) ? post.apps : [];
    post.apps = post.apps.filter((a) => a.userId !== user.id);
    post.apps.push(app);
    state.mail = Array.isArray(state.mail) ? state.mail : [];
    state.mail.unshift({
      id: app.id,
      type: "apply",
      toId: post.authorId || "",
      toName: post.author || "",
      fromId: user.id,
      fromName: voterName(),
      postId: post.id,
      postTitle: fieldText(post, "title"),
      raidKind: post.raidKind || "regular",
      characters: list,
      main: mainChar,
      body: app.body,
      createdAt: app.createdAt,
      read: false,
    });
    persist();
    refreshMailBadge();
    openBoard("recruit", true, { mode: "read", postId, kind: post.raidKind || currentKind });
  }

  function submitApply(form) {
    const applyChars = decodeChars(form.applyChars && form.applyChars.value);
    const mainChar = decodeChar(form.mainChar && form.mainChar.value);
    const body = (form.body && form.body.value ? form.body.value : "").trim().slice(0, 500);
    if (!applyChars.length) {
      formError(form, L("신청할 캐릭터를 하나 이상 고르세요.", "Pick at least one character to apply with."));
      return;
    }
    applyToRaid(form.dataset.post, applyChars, mainChar, body);
  }

  function markApplyPicks(form) {
    if (!form) return;
    const applyList = decodeChars(form.applyChars && form.applyChars.value);
    const applyIds = new Set(applyList.map((ch) => String(ch.id)));
    const main = decodeChar(form.mainChar && form.mainChar.value);
    form.querySelectorAll(".mw-char-card").forEach((card) => {
      const ch = decodeChar(card.dataset.char);
      const id = ch && ch.id != null ? String(ch.id) : "";
      card.classList.toggle("is-apply", applyIds.has(id));
      card.classList.toggle("is-main", !!(main && String(main.id) === id));
    });
    const applyHint = form.querySelector("[data-apply-picked]");
    const mainHint = form.querySelector("[data-main-picked]");
    if (applyHint) {
      applyHint.textContent = applyList.length
        ? L("신청: ", "Apply: ") + applyList.map((ch) => ch.name).join(" · ")
        : L("신청 캐릭을 눌러 넣거나 빼세요.", "Tap a character to add or remove it.");
    }
    if (mainHint) mainHint.textContent = main && main.name ? L("본캐: ", "Main: ") + main.name : L("본캐 없음", "No main attached");
    const clear = form.querySelector("[data-clear-main]");
    if (clear) clear.hidden = !(main && main.name);
  }

  function toggleApplyChar(form, payload) {
    if (!form || !form.applyChars) return;
    const ch = decodeChar(payload);
    if (!ch || !ch.name) return;
    const list = decodeChars(form.applyChars.value);
    const idx = list.findIndex((item) => String(item.id) === String(ch.id));
    if (idx >= 0) list.splice(idx, 1);
    else list.push(ch);
    form.applyChars.value = encodeChars(list);
    markApplyPicks(form);
  }

  function toggleMainChar(form, payload) {
    if (!form || !form.mainChar) return;
    const ch = decodeChar(payload);
    const cur = decodeChar(form.mainChar.value);
    form.mainChar.value = ch && cur && String(cur.id) === String(ch.id) ? "" : encodeChar(ch);
    markApplyPicks(form);
  }

  function upsertPoolFromChar(ch) {
    const user = authUser();
    if (!user || !ch || !ch.name) return;
    const hours = defaultPartyHours(room && room.querySelector("form.mw-compose"));
    const specs = specsForWowClass(ch.className).map((s) => s.id);
    const existing = state.posts.find((p) => p.board === "seek" && p.authorId === user.id && p.character && p.character.id === ch.id);
    const post = normalizePost({
      id: existing ? existing.id : Math.random().toString(36).slice(2, 10),
      board: "seek",
      raidKind: currentKind || "regular",
      title: ch.name + " · " + (ch.className || ""),
      body: L("본캐로 소개되어 인재풀에 올랐습니다.", "Listed in the pool as a main."),
      author: voterName(),
      authorId: user.id,
      character: ch,
      days: hours.days,
      hourFrom: hours.hourFrom,
      hourTo: hours.hourTo,
      specs,
      look: lookOf(state.me),
      createdAt: existing ? existing.createdAt : Date.now(),
    });
    if (existing) Object.assign(existing, post);
    else state.posts.unshift(post);
    persist();
  }

  function promptLogin() {
    if (window.RaidAuth && RaidAuth.loginHref()) {
      location.href = RaidAuth.loginHref();
      return;
    }
    if (window.RaidAuth && RaidAuth.canPreview()) {
      RaidAuth.previewLogin();
      return;
    }
    if (room) {
      const box = room.querySelector("[data-chars]");
      if (box) box.insertAdjacentHTML("afterbegin", `<p class="mw-err">${esc(L("Battle.net 로그인이 필요합니다.", "Battle.net login required."))}</p>`);
    }
  }

  function unreadMailCount() {
    return myInbox().filter((m) => !m.read).length;
  }

  function mailButtonHtml() {
    const n = unreadMailCount();
    return `<button type="button" class="mw-btn" data-mail-open>${esc(L("우편함", "Mail"))}${
      n ? `<i class="mw-mail-badge">${n}</i>` : ""
    }</button>`;
  }

  function refreshMailBadge() {
    document.querySelectorAll("[data-mail-open]").forEach((btn) => {
      const n = unreadMailCount();
      btn.innerHTML = `${esc(L("우편함", "Mail"))}${n ? `<i class="mw-mail-badge">${n}</i>` : ""}`;
    });
  }

  function isMailToMe(m) {
    const user = authUser();
    if (user && m.toId && m.toId === user.id) return true;
    const name = voterName();
    return !!(m.toName && (m.toName === name || m.toName === state.me.name));
  }

  function isMailFromMe(m) {
    const user = authUser();
    if (user && m.fromId && m.fromId === user.id) return true;
    const name = voterName();
    return !!(m.fromName && (m.fromName === name || m.fromName === state.me.name));
  }

  function myInbox() {
    return (state.mail || []).filter(isMailToMe);
  }

  function mySent() {
    return (state.mail || []).filter(isMailFromMe);
  }

  function renderMailList(items, emptyText) {
    if (!items.length) return `<li class="mw-empty">${esc(emptyText)}</li>`;
    return items
      .map((m) => {
        const chars = applyCharsOf(m);
        return `<li class="mw-mail-item${m.read ? "" : " is-new"}" data-mail-id="${esc(m.id)}">
          <div class="mw-mail-h">
            <b>${esc(m.postTitle || L("공대 신청", "Raid apply"))}</b>
            <span>${esc(boardStamp(m.createdAt))}</span>
          </div>
          <span class="mw-app-who">${esc(L("보낸이 ", "From ") + (m.fromName || "") + " → " + (m.toName || L("공대장", "Lead")))}</span>
          ${chars.map((ch) => appCharLine(ch, "")).join("")}
          ${appCharLine(m.main, L("본캐", "Main"))}
          ${m.body ? `<p>${esc(m.body)}</p>` : ""}
        </li>`;
      })
      .join("");
  }

  function openMailbox(tab) {
    if (!mailEl) return;
    if (!authUser()) {
      promptLogin();
      return;
    }
    const view = tab === "sent" ? "sent" : "inbox";
    const inbox = myInbox();
    const sent = mySent();
    if (view === "inbox") {
      inbox.forEach((m) => {
        m.read = true;
      });
      persist();
    }
    uiOpen = true;
    mailEl.hidden = false;
    mailEl.innerHTML = `<div class="mw-card mw-mail-card">
      <div class="mw-card-h">
        <div>
          <h2>${esc(L("우편함", "Mailbox"))}</h2>
          <div class="sub">${esc(L("공대 신청은 여기로 옵니다. 공대장만 받은 신청을 봅니다.", "Raid applications arrive here. Only the lead sees incoming mail."))}</div>
        </div>
        <button type="button" class="mw-btn" data-mail-close>${esc(L("닫기", "Close"))}</button>
      </div>
      <div class="mw-mail-tabs">
        <button type="button" class="mw-btn${view === "inbox" ? " gold" : ""}" data-mail-tab="inbox">${esc(L("받은 신청", "Inbox"))} ${inbox.length}</button>
        <button type="button" class="mw-btn${view === "sent" ? " gold" : ""}" data-mail-tab="sent">${esc(L("보낸 신청", "Sent"))} ${sent.length}</button>
      </div>
      <ul class="mw-apps">${
        view === "inbox"
          ? renderMailList(inbox, L("받은 신청이 없습니다.", "No applications yet."))
          : renderMailList(sent, L("보낸 신청이 없습니다.", "You have not sent an application."))
      }</ul>
    </div>`;
    refreshMailBadge();
  }

  function closeMailbox() {
    if (!mailEl) return;
    mailEl.hidden = true;
    mailEl.innerHTML = "";
    if (!currentBoard && (!salon || salon.hidden)) uiOpen = false;
  }

  function charCard(ch, mode) {
    const wcl = wclCharUrl(ch);
    const payload = encodeChar(ch);
    const color = classColorOf(ch.className);
    const acts =
      mode === "apply"
        ? `<button type="button" class="mw-btn gold" data-pick-apply="${payload}">${esc(L("넣기/빼기", "Add/Remove"))}</button>
           <button type="button" class="mw-btn" data-pick-main="${payload}">${esc(L("본캐로 올리기", "Set as main"))}</button>`
        : `<button type="button" class="mw-btn gold" data-pool-char="${payload}">${esc(L("이 캐릭으로 올리기", "List this character"))}</button>`;
    return `<article class="mw-char-card" style="--class:${color}"${mode === "apply" ? ` data-char="${payload}" data-pick-apply="${payload}"` : ` data-pool-char="${payload}"`}>
      <div class="mw-char-main">
        <b>${esc(ch.name)}</b>
        <span>${esc(ch.realm || "")} · ${esc(ch.level || "")} · <i class="mw-class">${esc(ch.className || "")}</i></span>
        <div class="mw-char-acts">${acts}</div>
      </div>
      ${wcl ? `<a class="mw-wcl-tiny" href="${esc(wcl)}" target="_blank" rel="noopener" data-external>WCL</a>` : ""}
    </article>`;
  }

  function openApplyPicker(postId) {
    const box = room && room.querySelector("[data-chars]");
    if (!box) return;
    if (postId) box.dataset.applyPost = postId;
    box.hidden = false;
    box.classList.remove("hidden");
    const start = room.querySelector("[data-apply-open]");
    if (start) start.hidden = true;
    fillCharPicker(room);
  }

  async function fillCharPicker(root) {
    const slot = root && root.querySelector("[data-chars]");
    if (!slot || slot.hidden || slot.classList.contains("hidden")) return;
    const mode = slot.dataset.charsMode || "pool";
    const postId = slot.dataset.applyPost || "";
    const user = authUser();
    if (!user) {
      const href = window.RaidAuth && RaidAuth.loginHref();
      slot.innerHTML = `<p class="mw-empty">${esc(L("만렙 캐릭을 불러오려면 Battle.net에 로그인하세요.", "Log in with Battle.net to load your max-level characters."))}</p>
        ${href ? `<a class="mw-btn gold" href="${esc(href)}">${esc(L("Battle.net 로그인", "Battle.net login"))}</a>` : `<button type="button" class="mw-btn gold" data-preview-login>${esc(L("로그인하고 캐릭 불러오기", "Log in and load characters"))}</button>`}`;
      const preview = slot.querySelector("[data-preview-login]");
      if (preview) preview.onclick = () => promptLogin();
      return;
    }
    slot.innerHTML = `<p class="mw-empty">${esc(L("만렙 캐릭터를 불러오는 중...", "Loading max-level characters..."))}</p>`;
    const chars = window.RaidAuth && RaidAuth.characters ? await RaidAuth.characters() : [];
    if (!slot.isConnected) return;
    if (!chars.length) {
      slot.innerHTML = `<p class="mw-empty">${esc(L("만렙 캐릭터가 없거나 다시 로그인해야 합니다.", "No max-level characters, or you need to log in again."))}</p>`;
      return;
    }
    const cards = chars.map((ch) => charCard(ch, mode)).join("");
    if (mode === "apply") {
      slot.innerHTML = `<form class="mw-apply-form" data-kind="apply" data-post="${esc(postId)}" novalidate>
        <div class="mw-apply-label">${esc(L("신청 캐릭터", "Apply as"))}</div>
        <p class="sub">${esc(L("여러 캐릭을 눌러 넣거나 뺄 수 있습니다.", "Tap characters to add or remove them."))}</p>
        <p class="mw-apply-picked" data-apply-picked>${esc(L("신청 캐릭을 눌러 넣거나 빼세요.", "Tap a character to add or remove it."))}</p>
        <div class="mw-apply-label">${esc(L("본캐 (선택)", "Main (optional)"))}</div>
        <p class="sub">${esc(L("부캐로 신청할 때 공대장이 참고할 본캐입니다. 고르지 않아도 됩니다.", "If you apply on an alt, attach your main for the raid lead. Optional."))}</p>
        <p class="mw-apply-picked" data-main-picked>${esc(L("본캐 없음", "No main attached"))}</p>
        <input type="hidden" name="applyChars" value="">
        <input type="hidden" name="mainChar" value="">
        <div class="mw-char-grid">${cards}</div>
        <button type="button" class="mw-btn tiny" data-clear-main hidden>${esc(L("본캐 선택 해제", "Clear main"))}</button>
        <textarea name="body" maxlength="500" rows="5" placeholder="${esc(L("각오, 가능한 시간, 하고 싶은 말을 적습니다.", "Write a note for the raid lead."))}"></textarea>
        <div class="mw-compose-row">
          <span class="mw-err"></span>
          <button type="submit" class="mw-btn gold">${esc(L("신청 보내기", "Send application"))}</button>
        </div>
      </form>`;
      markApplyPicks(slot.querySelector("form"));
      return;
    }
    slot.innerHTML = `<div class="mw-char-grid">${cards}</div>`;
  }

  function submitComment(form) {
    const post = state.posts.find((p) => p.id === form.dataset.post);
    const body = form.body.value.trim().slice(0, 200);
    if (!post || !body) return;
    post.comments = post.comments || [];
    post.comments.push({
      id: Math.random().toString(36).slice(2, 10),
      author: voterName(),
      body,
      createdAt: Date.now(),
    });
    persist();
    openBoard(currentBoard, true, { mode: "read", postId: post.id });
  }

  function deleteComment(postId, commentId) {
    if (!/^[\w-]+$/.test(commentId)) return;
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return;
    post.comments = (post.comments || []).filter((c) => !(c.id === commentId && c.author === state.me.name));
    persist();
    openBoard(currentBoard, true, { mode: "read", postId });
  }

  function castVote(postId, dir) {
    const post = state.posts.find((p) => p.id === postId);
    if (!post || (dir !== "up" && dir !== "down")) return;
    const name = voterName();
    const hadUp = (post.up || []).includes(name);
    const hadDown = (post.down || []).includes(name);
    post.up = (post.up || []).filter((n) => n !== name);
    post.down = (post.down || []).filter((n) => n !== name);
    if (dir === "up" && !hadUp) post.up.push(name);
    if (dir === "down" && !hadDown) post.down.push(name);
    persist();
  }

  function deletePost(id) {
    if (!/^[\w-]+$/.test(id)) return;
    state.posts = state.posts.filter((p) => !(p.id === id && p.author === state.me.name));
    persist();
    if (currentBoard) openBoard(currentBoard, true);
  }

  function borrowedNames() {
    return new Set(["", "여행자", "Traveler", ...PRESETS.flatMap((p) => [p.nameKo, p.nameEn])]);
  }

  function readLook() {
    const hair = HAIR.includes(salon.querySelector("[name=hair]").value)
      ? salon.querySelector("[name=hair]").value
      : "long";
    const hat = HAT.includes(salon.querySelector("[name=hat]").value)
      ? salon.querySelector("[name=hat]").value
      : "none";
    const race = RACE.includes(salon.querySelector("[name=race]").value)
      ? salon.querySelector("[name=race]").value
      : "orc";
    const cloth = hex(salon.querySelector("[name=cloth]").value, "#8d3030");
    let name = salon.querySelector("[name=name]").value.trim().slice(0, 12);
    if (!name) name = L("여행자", "Traveler");
    return {
      name,
      race,
      hair,
      hat,
      hairColor: hex(salon.querySelector("[name=hairColor]").value, "#241c14"),
      skin: hex(salon.querySelector("[name=skin]").value, "#5c8a38"),
      cloth,
      cloth2: shade(cloth, -42),
      eye: hex(salon.querySelector("[name=eye]").value, "#e0b03a"),
    };
  }

  function refreshPreview() {
    const slot = salon && salon.querySelector("[data-preview]");
    if (!slot || !salon.querySelector("[name=name]")) return;
    const look = readLook();
    slot.innerHTML = chibi(look);
    const nameEl = salon.querySelector("[data-preview-name]");
    if (nameEl) nameEl.textContent = look.name;
  }

  function applyPreset(id) {
    const p = presetById(id);
    const set = (name, value) => {
      const el = salon.querySelector(`[name=${name}]`);
      if (el) el.value = value;
    };
    set("race", p.id);
    set("hair", p.hair);
    set("hat", p.hat);
    set("hairColor", p.hairColor);
    set("skin", p.skin);
    set("cloth", p.cloth);
    set("eye", p.eye);
    const nameEl = salon.querySelector("[name=name]");
    if (nameEl && borrowedNames().has(nameEl.value.trim())) {
      nameEl.value = L(p.nameKo, p.nameEn);
    }
    refreshPreview();
  }

  function confirmLook() {
    const look = readLook();
    state.me = look;
    state.entered = true;
    salonRequired = false;
    persist();
    me.ch = state.me;
    paint(me);
    renderChip();
    if (!currentBoard) uiOpen = false;
    salon.hidden = true;
    welcome();
  }

  function openSalon(required) {
    salonRequired = !!required;
    uiOpen = true;
    if (!currentBoard && room) room.hidden = true;
    const meLook = lookOf(state.me);
    const presets = PRESETS.map(
      (p) => `<button type="button" class="mw-preset" data-preset="${p.id}">
        <span class="mw-preview-slot">${chibi(p)}</span>
        <b>${esc(L(p.nameKo, p.nameEn))}</b>
        <small>${esc(L(p.jobKo, p.jobEn))}</small>
      </button>`
    ).join("");
    salon.hidden = false;
    salon.innerHTML = `<form class="mw-card mw-salon-card" role="dialog" aria-modal="true">
      <div class="mw-card-h">
        <div>
          <h2>${esc(L("종족", "Race"))}</h2>
          <div class="sub">${esc(L("광장에 설 종족을 고르고, 머리와 방어구 색을 맞춥니다.", "Pick the race you stand in the plaza as, then tune hair and armor."))}</div>
        </div>
        ${required ? "" : `<button type="button" class="mw-btn" data-close>${esc(L("닫기", "Close"))}</button>`}
      </div>
      <div class="mw-presets">${presets}</div>
      <div class="mw-salon-grid">
        <div class="mw-hero">
          <div class="mw-hero-preview" data-preview></div>
          <b data-preview-name></b>
        </div>
        <div class="mw-fields">
          <label>${esc(L("종족", "Race"))}
            <select name="race">
              ${PRESETS.map((p) => `<option value="${p.id}"${meLook.race === p.id ? " selected" : ""}>${esc(L(p.nameKo, p.nameEn))}</option>`).join("")}
            </select>
          </label>
          <label>${esc(L("광장 이름", "Plaza name"))}
            <input name="name" maxlength="12" autocomplete="off" value="${esc(state.me.name || "")}" placeholder="${esc(L("여행자", "Traveler"))}">
          </label>
          <label>${esc(L("머리", "Hair"))}
            <select name="hair">
              <option value="long"${meLook.hair === "long" ? " selected" : ""}>${esc(L("긴 머리", "Long"))}</option>
              <option value="bob"${meLook.hair === "bob" ? " selected" : ""}>${esc(L("단발", "Bob"))}</option>
              <option value="spiky"${meLook.hair === "spiky" ? " selected" : ""}>${esc(L("뾰족", "Spiky"))}</option>
              <option value="twin"${meLook.hair === "twin" ? " selected" : ""}>${esc(L("트윈테일", "Twintails"))}</option>
            </select>
          </label>
          <label>${esc(L("모자", "Hat"))}
            <select name="hat">
              <option value="none"${meLook.hat === "none" ? " selected" : ""}>${esc(L("없음", "None"))}</option>
              <option value="cap"${meLook.hat === "cap" ? " selected" : ""}>${esc(L("모자", "Cap"))}</option>
              <option value="hood"${meLook.hat === "hood" ? " selected" : ""}>${esc(L("후드", "Hood"))}</option>
            </select>
          </label>
          <label>${esc(L("머리 색", "Hair color"))}<input type="color" name="hairColor" value="${meLook.hairColor}"></label>
          <label>${esc(L("피부", "Skin"))}<input type="color" name="skin" value="${meLook.skin}"></label>
          <label>${esc(L("옷", "Outfit"))}<input type="color" name="cloth" value="${meLook.cloth}"></label>
          <label>${esc(L("눈", "Eyes"))}<input type="color" name="eye" value="${meLook.eye}"></label>
        </div>
      </div>
      <div class="mw-compose-row">
        <span class="sub">${esc(L("고른 모습은 이 브라우저에 저장됩니다.", "Your look is saved in this browser."))}</span>
        <button type="submit" class="mw-btn gold">${esc(L("이 모습으로 나가기", "Enter with this look"))}</button>
      </div>
    </form>`;
    refreshPreview();
  }

  function syncNpcNames() {
    for (const n of npcs) {
      n.ch.name = L(n.nameKo, n.nameEn);
      const tag = n.el.querySelector(".mw-nametag");
      if (tag) tag.textContent = n.ch.name;
    }
  }

  function relabelStatic() {
    if (!shell) return;
    const kicker = shell.querySelector('[data-mw="kicker"]');
    if (kicker) kicker.textContent = L("오그리마", "Orgrimmar");
    const title = shell.querySelector('[data-mw="title"]');
    if (title) title.textContent = L("커뮤니티", "Community");
    const lead = shell.querySelector('[data-mw="lead"]');
    if (lead) {
      lead.textContent = L(
        "사람들이 모여 이야기하는 광장입니다. 원하는 게시판 간판으로 걸어가 들어갑니다.",
        "One plaza where people gather and talk. Walk to the board you want."
      );
    }
    const help = shell.querySelector('[data-mw="help"]');
    if (help) {
      help.textContent = L(
        "← → 이동  ·  Shift 달리기  ·  Space 점프  ·  간판 앞에서 E 또는 클릭  ·  아래 칸에서 대화",
        "← → move  ·  Shift run  ·  Space jump  ·  E or click a sign  ·  chat below"
      );
    }
    const salonBtn = shell.querySelector('[data-mw="salon"]');
    if (salonBtn) salonBtn.textContent = L("종족", "Race");
    const chat = shell.querySelector("#mwChatInput");
    if (chat) chat.placeholder = L("광장에 말하기", "Say something");
    const send = shell.querySelector('[data-mw="send"]');
    if (send) send.textContent = L("전송", "Send");
    const jump = shell.querySelector('[data-mw="jump"]');
    if (jump) jump.textContent = L("점프", "Jump");
    const act = shell.querySelector('[data-mw="act"]');
    if (act) act.textContent = L("입장", "Enter");
    for (const s of SPOTS) {
      const sign = shell.querySelector(`[data-spot="${s.id}"] .mw-sign`);
      if (sign) sign.textContent = spotName(s.id);
    }
    promptId = "";
    syncNpcNames();
    renderChip();
    refreshMailBadge();
  }

  function layoutPlaza() {
    if (!stage || !world) return;
    worldW = Math.max(720, stage.clientWidth || 900);
    world.style.width = worldW + "px";
    back.style.width = worldW + "px";
    for (const s of SPOTS) {
      s.x = s.t * worldW;
      const el = world.querySelector(`[data-spot="${s.id}"]`);
      if (el) el.style.left = `${s.x}px`;
    }
    world.querySelectorAll("[data-t]").forEach((el) => {
      el.style.left = `${Number(el.dataset.t) * worldW}px`;
    });
    for (const n of npcs) {
      const span = n.max - n.min;
      const ratio = span > 0 ? (n.x - n.min) / span : 0.5;
      n.min = n.tMin * worldW;
      n.max = n.tMax * worldW;
      n.x = n.ready ? n.min + Math.max(0, Math.min(1, ratio)) * (n.max - n.min) : n.t * worldW;
      n.ready = true;
      place(n);
    }
    if (me) {
      if (!me.ready) {
        me.x = 0.28 * worldW;
        me.ready = true;
      } else {
        me.x = Math.max(48, Math.min(worldW - 48, me.x));
      }
      place(me);
    }
  }

  function nearestSpot() {
    let best = null;
    let bestD = RANGE;
    for (const s of SPOTS) {
      const d = Math.abs(me.x - s.x);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  function step(dt) {
    const chatFocus = typing();
    if (!uiOpen && !chatFocus) {
      let dir = 0;
      if (keys.has("arrowleft") || keys.has("a")) dir -= 1;
      if (keys.has("arrowright") || keys.has("d")) dir += 1;
      if (dir !== 0) moveTarget = null;
      if (dir === 0 && moveTarget != null) {
        const dx = moveTarget - me.x;
        if (Math.abs(dx) < 8) moveTarget = null;
        else dir = Math.sign(dx);
      }
      const speed = keys.has("shift") ? RUN_SPEED : GROUND_SPEED;
      me.vx = dir * speed;
      if (dir) me.face = dir;
      if (jumpEdge && me.onGround) {
        me.vy = JUMP_V;
        me.onGround = false;
      }
    } else {
      me.vx = 0;
    }
    jumpEdge = false;

    me.vy -= GRAV * dt;
    me.x += me.vx * dt;
    me.y += me.vy * dt;
    if (me.y <= 0) {
      me.y = 0;
      me.vy = 0;
      me.onGround = true;
    } else {
      me.onGround = false;
    }
    me.x = Math.max(48, Math.min(worldW - 48, me.x));
    if (me.bubbleUntil && performance.now() > me.bubbleUntil) {
      me.bubbleUntil = 0;
      setBubble(me, "");
    }

    for (const n of npcs) {
      n.x += n.dir * n.speed * dt;
      if (n.x < n.min || n.x > n.max) {
        n.dir *= -1;
        n.x = Math.max(n.min, Math.min(n.max, n.x));
      }
      n.vx = n.dir * n.speed;
      n.face = n.dir;
      n.onGround = true;
      n.phase += dt;
      const showing = n.phase % 9 < 3.4;
      if (showing) {
        const idx = Math.floor(n.phase / 9) % n.lines.length;
        if (n.shown !== idx) {
          n.shown = idx;
          const line = n.lines[idx];
          setBubble(n, L(line[0], line[1]));
        }
      } else if (n.bubble) {
        n.shown = -1;
        setBubble(n, "");
      }
      place(n);
    }

    place(me);

    const view = stage.clientWidth || 800;
    const max = Math.max(0, worldW - view);
    cam = Math.min(max, Math.max(0, me.x - view * 0.38));
    world.style.transform = `translate3d(${-cam}px,0,0)`;
    back.style.transform = `translate3d(${-cam * 0.45}px,0,0)`;

    const spot = uiOpen ? null : nearestSpot();
    shell.querySelectorAll(".mw-prop").forEach((el) => {
      el.classList.toggle("near", !!(spot && el.dataset.spot === spot.id));
    });
    updatePrompt(spot);

    if (!uiOpen && pending && me.onGround && Math.abs(me.x - pending.x) < RANGE) {
      const spotToOpen = pending;
      pending = null;
      moveTarget = null;
      openSpot(spotToOpen);
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.034, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    raf = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    const id = e.key === " " ? " " : e.key.toLowerCase();
    if (id === "escape") {
      if (typing()) document.activeElement.blur();
      if (!salonRequired) closeOverlays();
      e.preventDefault();
      return;
    }
    if (!running) return;
    const move =
      id === "arrowleft" ||
      id === "arrowright" ||
      id === "arrowup" ||
      id === " " ||
      id === "a" ||
      id === "d" ||
      id === "w";
    if (typing()) return;
    if (move || id === "e") e.preventDefault();
    if (uiOpen || e.repeat) return;
    keys.add(id);
    if (id === " " || id === "w" || id === "arrowup") jumpEdge = true;
    if (id === "e") tryInteract();
  }

  function onKeyUp(e) {
    const id = e.key === " " ? " " : e.key.toLowerCase();
    keys.delete(id);
  }

  function onStagePointer(e) {
    if (!running || uiOpen) return;
    if (e.target.closest(".mw-pad, .mw-prompt, button, a, input, textarea")) return;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left + cam;
    const spotEl = e.target.closest("[data-spot]");
    if (spotEl) {
      const spot = SPOTS.find((s) => s.id === spotEl.dataset.spot);
      if (!spot) return;
      if (Math.abs(me.x - spot.x) < RANGE) openSpot(spot);
      else {
        moveTarget = spot.x;
        pending = spot;
      }
      return;
    }
    moveTarget = Math.max(48, Math.min(worldW - 48, x));
    pending = null;
  }

  function bindPad(pad) {
    pad.querySelectorAll("[data-k]").forEach((btn) => {
      const k = btn.dataset.k;
      const release = () => {
        if (k === "jump") keys.delete(" ");
        else if (k !== "act") keys.delete(k);
      };
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (k === "act") {
          tryInteract();
          return;
        }
        if (k === "jump") {
          jumpEdge = true;
          keys.add(" ");
        } else keys.add(k);
        btn.setPointerCapture?.(e.pointerId);
      });
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("lostpointercapture", release);
    });
  }

  function build(host) {
    state = loadState();
    host.innerHTML = `<div class="mw-shell is-hub">
      <div class="mw-hub" id="mwHub" hidden></div>
      <div class="mw-topbar">
        <div class="mw-top-copy">
          <div class="mw-kicker" data-mw="kicker">오그리마</div>
          <strong data-mw="title"></strong>
          <span data-mw="lead"></span>
        </div>
        <button type="button" class="mw-me" id="mwMeChip"></button>
        ${mailButtonHtml()}
        <button type="button" class="mw-btn gold" data-mw="salon"></button>
      </div>
      <div class="mw-stage" id="mwStage">
        <div class="mw-sky"></div>
        <div class="mw-sun"></div>
        <div class="mw-back" id="mwBack">
          <div class="mw-hills"></div>
          <i class="mw-cloud c1"></i><i class="mw-cloud c2"></i><i class="mw-cloud c3"></i><i class="mw-cloud c4"></i>
        </div>
        <div class="mw-world" id="mwWorld">
          <div class="mw-ground"></div>
          ${buildProps()}
          <div class="mw-actors" id="mwActors"></div>
        </div>
        <button type="button" class="mw-prompt" id="mwPrompt" hidden></button>
        <div class="mw-pad">
          <button type="button" data-k="arrowleft" aria-label="left">◀</button>
          <button type="button" data-k="arrowright" aria-label="right">▶</button>
          <button type="button" data-k="jump" data-mw="jump"></button>
          <button type="button" data-k="act" data-mw="act"></button>
        </div>
      </div>
      <div class="mw-dock">
        <div class="mw-log" id="mwLog" aria-live="polite"></div>
        <form class="mw-chat" id="mwChat">
          <input id="mwChatInput" maxlength="80" autocomplete="off">
          <button type="submit" class="mw-btn gold" data-mw="send"></button>
        </form>
        <p class="mw-help" data-mw="help"></p>
      </div>
      <div class="mw-overlay" id="mwRoom" hidden></div>
      <div class="mw-overlay" id="mwSalon" hidden></div>
      <div class="mw-overlay" id="mwAuthGate" hidden></div>
      <div class="mw-overlay" id="mwMail" hidden></div>
    </div>`;

    shell = host.querySelector(".mw-shell");
    stage = host.querySelector("#mwStage");
    world = host.querySelector("#mwWorld");
    back = host.querySelector("#mwBack");
    actorsLayer = host.querySelector("#mwActors");
    promptEl = host.querySelector("#mwPrompt");
    logEl = host.querySelector("#mwLog");
    chipEl = host.querySelector("#mwMeChip");
    room = host.querySelector("#mwRoom");
    salon = host.querySelector("#mwSalon");
    gateEl = host.querySelector("#mwAuthGate");
    mailEl = host.querySelector("#mwMail");
    hub = host.querySelector("#mwHub");

    const npcDefs = [
      {
        nameKo: "루가",
        nameEn: "Ruga",
        preset: "orc",
        tMin: 0.2,
        tMax: 0.27,
        t: 0.23,
        speed: 28,
        lines: [
          ["공격대 찾기에 자리 있어", "There's a spot on Find a Raid"],
          ["여기서 좀 있다 갈게", "I'll hang around a bit"],
        ],
      },
      {
        nameKo: "진타",
        nameEn: "Jinta",
        preset: "troll",
        tMin: 0.31,
        tMax: 0.38,
        t: 0.34,
        speed: 24,
        lines: [
          ["정보판에 일정 올라왔어", "The schedule is on the info board"],
          ["광장에 사람 많네", "The plaza is busy"],
        ],
      },
      {
        nameKo: "카루",
        nameEn: "Karu",
        preset: "tauren",
        tMin: 0.42,
        tMax: 0.49,
        t: 0.45,
        speed: 22,
        lines: [
          ["자유판에 글 남길게", "I'll leave something on the free board"],
          ["화로 옆이 제일 시끄러워", "It's loudest by the fire"],
        ],
      },
    ];

    me = createActor(state.me, 0, "is-me");
    npcs = npcDefs.map((d) => {
      const preset = presetById(d.preset);
      const actor = createActor({ ...lookOf(preset), name: L(d.nameKo, d.nameEn) }, 0, "is-npc");
      actor.nameKo = d.nameKo;
      actor.nameEn = d.nameEn;
      actor.t = d.t;
      actor.tMin = d.tMin;
      actor.tMax = d.tMax;
      actor.min = 0;
      actor.max = 0;
      actor.speed = d.speed;
      actor.dir = 1;
      actor.lines = d.lines;
      actor.phase = Math.random() * 9;
      actor.shown = -1;
      return actor;
    });
    layoutPlaza();
    if (window.ResizeObserver) new ResizeObserver(() => layoutPlaza()).observe(stage);

    chipEl.addEventListener("click", () => openSalon(false));
    host.querySelector('[data-mw="salon"]').addEventListener("click", () => openSalon(false));
    promptEl.addEventListener("click", (e) => {
      e.stopPropagation();
      tryInteract();
    });
    stage.addEventListener("pointerdown", onStagePointer);
    bindPad(host.querySelector(".mw-pad"));

    if (gateEl) {
      gateEl.addEventListener("click", (e) => {
        if (e.target.closest("[data-plaza-login]")) {
          promptLogin();
          return;
        }
        if (e.target.closest("[data-plaza-lurk]")) enterAsLurk();
      });
    }
    host.addEventListener("click", (e) => {
      if (e.target.closest("[data-mail-open]")) {
        e.preventDefault();
        openMailbox();
        return;
      }
      const mailTab = e.target.closest("[data-mail-tab]");
      if (mailTab) {
        openMailbox(mailTab.dataset.mailTab);
        return;
      }
      if (e.target.closest("[data-mail-close]") || e.target === mailEl) closeMailbox();
    });
    host.querySelector("#mwChat").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!authUser()) {
        showLoginGate();
        return;
      }
      const input = host.querySelector("#mwChatInput");
      const text = input.value.trim().slice(0, 80);
      if (!text || !state.me.name) {
        if (!state.me.name) openSalon(true);
        return;
      }
      input.value = "";
      setBubble(me, text);
      me.bubbleUntil = performance.now() + 4600;
      pushLog(state.me.name, text, "", state.me.hairColor);
    });

    room.addEventListener("click", (e) => {
      const wclHit = e.target.closest("[data-wcl]");
      if (wclHit && wclHit.dataset.wcl) {
        e.preventDefault();
        e.stopPropagation();
        window.open(wclHit.dataset.wcl, "_blank", "noopener");
        return;
      }
      const link = e.target.closest("a[href]");
      if (link && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return;
      if (link && (link.target === "_blank" || link.dataset.external != null)) return;
      if (link) e.preventDefault();
      const poolBtn = e.target.closest("[data-pool-char]");
      if (poolBtn) {
        quickPoolFromChar(decodeChar(poolBtn.dataset.poolChar));
        return;
      }
      const applyOpen = e.target.closest("[data-apply-open]");
      if (applyOpen) {
        openApplyPicker(applyOpen.dataset.applyOpen);
        return;
      }
      const pickMain = e.target.closest("[data-pick-main]");
      if (pickMain) {
        toggleMainChar(pickMain.closest("form"), pickMain.dataset.pickMain);
        return;
      }
      const pickApply = e.target.closest("[data-pick-apply]");
      if (pickApply) {
        toggleApplyChar(pickApply.closest("form"), pickApply.dataset.pickApply);
        return;
      }
      const clearMain = e.target.closest("[data-clear-main]");
      if (clearMain) {
        const form = clearMain.closest("form");
        if (form && form.mainChar) form.mainChar.value = "";
        markApplyPicks(form);
        return;
      }
      const cdel = e.target.closest("[data-cdel]");
      if (cdel) {
        deleteComment(cdel.dataset.post, cdel.dataset.cdel);
        return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        deletePost(del.dataset.del);
        return;
      }
      const voteBtn = e.target.closest("[data-vote]");
      if (voteBtn && currentBoard) {
        castVote(voteBtn.dataset.id, voteBtn.dataset.vote);
        openBoard(currentBoard, true, { mode: "read", postId: voteBtn.dataset.id });
        return;
      }
      const open = e.target.closest("[data-open]");
      if (open && currentBoard) {
        const post = state.posts.find((p) => p.id === open.dataset.open);
        if (post) {
          post.views = (post.views || 0) + 1;
          persist();
        }
        openBoard(currentBoard, false, { mode: "read", postId: open.dataset.open });
        return;
      }
      const writeBtn = e.target.closest("[data-write]");
      if (writeBtn && currentBoard) {
        if (!authUser()) {
          promptLogin();
          return;
        }
        openBoard(currentBoard, false, { mode: "write", writeAs: writeBtn.dataset.writeAs || writeAsFor(currentBoard) });
        return;
      }
      if (e.target.closest("[data-list]") && currentBoard) {
        openBoard(currentBoard, false, { mode: "list" });
        return;
      }
      if (e.target.closest("[data-close]")) goPlazaBack();
    });
    room.addEventListener("change", (e) => {
      const master = e.target.closest("[data-role-all]");
      if (master) {
        const root = master.closest(".mw-spec-board");
        if (root) {
          root.querySelectorAll(`[data-spec-role="${master.dataset.roleAll}"]`).forEach((box) => {
            box.checked = master.checked;
          });
        }
      }
      const q = queryOf(currentBoard, currentKind);
      if (!q || !e.target.closest(".mw-filter")) return;
      const dayBox = e.target.closest("[data-filter-day]");
      if (dayBox) {
        const id = dayBox.value;
        q.days = Array.isArray(q.days) ? q.days : [];
        q.days = dayBox.checked ? [...new Set([...q.days, id])] : q.days.filter((d) => d !== id);
        openBoard(currentBoard, true, { mode: "list" });
        return;
      }
      const board = e.target.closest(".mw-spec-board");
      if (master || e.target.closest("[data-filter-spec]")) {
        const scroller = e.target.closest(".mw-filter-specs");
        const top = scroller ? scroller.scrollTop : 0;
        q.specs = board ? [...board.querySelectorAll("[data-filter-spec]:checked")].map((box) => box.value) : [];
        openBoard(currentBoard, true, { mode: "list" });
        const next = room.querySelector(".mw-filter-specs");
        if (next) next.scrollTop = top;
        return;
      }
      const field = e.target.closest("[data-filter]");
      if (!field) return;
      if (field.dataset.filter === "from" || field.dataset.filter === "to") {
        const hour = parseHour(field.value);
        if (String(field.value).trim() && hour == null) return;
        q[field.dataset.filter] = hour == null ? "" : hour;
      }
      openBoard(currentBoard, true, { mode: "list" });
    });
    room.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.dataset.kind === "comment") submitComment(e.target);
      else if (e.target.dataset.kind === "apply") submitApply(e.target);
      else submitPost(e.target);
    });
    document.addEventListener("raid:auth", () => {
      refreshMailBadge();
      const host = document.getElementById("communityView");
      const onPlaza = host && !host.classList.contains("hidden");
      if (authUser() && gateEl && !gateEl.hidden) {
        hideLoginGate();
        openRoute(lastPlazaRoute);
        return;
      }
      if (onPlaza && !authUser() && needsPlazaGate()) {
        showLoginGate();
        return;
      }
      if (!room || room.hidden || !currentBoard) return;
      renderBoardPage(currentBoard, true, {
        mode: currentMode || "list",
        kind: currentKind,
        writeAs: currentWriteAs,
        postId: currentPostId,
      });
    });
    salon.addEventListener("click", (e) => {
      const presetBtn = e.target.closest("[data-preset]");
      if (presetBtn) {
        applyPreset(presetBtn.dataset.preset);
        return;
      }
      if (e.target.closest("[data-close]") || e.target === salon) closeOverlays();
    });
    salon.addEventListener("input", refreshPreview);
    salon.addEventListener("change", (e) => {
      if (e.target && e.target.name === "race") applyPreset(e.target.value);
      else refreshPreview();
    });
    salon.addEventListener("submit", (e) => {
      e.preventDefault();
      confirmLook();
    });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => keys.clear());

    relabelStatic();
    renderChip();
    built = true;
  }

  function mount(getLang) {
    if (typeof getLang === "function") langFn = getLang;
    const host = document.getElementById("communityView");
    if (!host) return;
    if (!built) build(host);
    else relabelStatic();
  }

  function pause() {
    running = false;
    keys.clear();
    jumpEdge = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function relabel() {
    relabelStatic();
  }

  global.CommunityPlaza = { mount, pause, relabel, openRoute, pageTitle, boardTitle };
})(window);
