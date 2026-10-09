/**
 * Raid Planner — 공대 쿨기 짜기 + 오더 그림판
 */
(function (global) {
  "use strict";

  const STORE_KEY = "wow-raid-planner-v1";
  const DEMO_SPECS = [
    ["Death Knight", "Blood"],
    ["Demon Hunter", "Vengeance"],
    ["Druid", "Restoration"],
    ["Paladin", "Holy"],
    ["Monk", "Mistweaver"],
    ["Shaman", "Restoration"],
    ["Evoker", "Preservation"],
    ["Priest", "Holy"],
    ["Priest", "Discipline"],
    ["Demon Hunter", "Havoc"],
    ["Death Knight", "Unholy"],
    ["Warrior", "Fury"],
    ["Monk", "Windwalker"],
    ["Paladin", "Retribution"],
    ["Rogue", "Subtlety"],
    ["Druid", "Balance"],
    ["Mage", "Fire"],
    ["Warlock", "Affliction"],
    ["Hunter", "Beast Mastery"],
    ["Evoker", "Augmentation"],
  ];
  const BOARD_COLORS = ["#f2b84b", "#ff6b72", "#69b0ff", "#42d392", "#ffffff", "#ff7c0a", "#a330c9", "#c69b6d"];
  /** 한국 서버 · 대략 인구 많은 순 (아즈샤라 1위) */
  const KR_REALMS = [
    { id: "Azshara", ko: "아즈샤라", en: "Azshara" },
    { id: "Hyjal", ko: "하이잘", en: "Hyjal" },
    { id: "Hellscream", ko: "헬스크림", en: "Hellscream" },
    { id: "Zuljin", ko: "줄진", en: "Zul'jin" },
    { id: "Cenarius", ko: "세나리우스", en: "Cenarius" },
    { id: "Deathwing", ko: "데스윙", en: "Deathwing" },
    { id: "Windrunner", ko: "윈드러너", en: "Windrunner" },
    { id: "Garona", ko: "가로나", en: "Garona" },
    { id: "Guldan", ko: "굴단", en: "Gul'dan" },
    { id: "Malfurion", ko: "말퓨리온", en: "Malfurion" },
    { id: "Dalaran", ko: "달라란", en: "Dalaran" },
    { id: "Norgannon", ko: "노르간논", en: "Norgannon" },
    { id: "Alexstrasza", ko: "알렉스트라자", en: "Alexstrasza" },
    { id: "Wildhammer", ko: "와일드해머", en: "Wildhammer" },
    { id: "Rexxar", ko: "렉사르", en: "Rexxar" },
    { id: "Durotan", ko: "듀로탄", en: "Durotan" },
    { id: "BurningLegion", ko: "불타는 군단", en: "Burning Legion" },
    { id: "Stormrage", ko: "스톰레이지", en: "Stormrage" },
  ];
  const DEFAULT_REALM = "Azshara";

  let langRef = () => "ko";
  let helperRosterRef = () => [];
  let bound = false;
  let shellBuilt = false;
  let persistTimer = null;
  let seq = 1;

  const FINE_WINDOW = 10;
  const FINE_SLOTS = 20;

  let tool = "cd";
  let selectedSpellId = null;
  let selectedPlayerId = null;
  let selectedAssignId = null;
  let rosterMode = "empty";
  const TEMP_RAID_ID = "temp-helper";
  let localRoster = [];
  let localBench = [];
  let editRoster = [];
  let editBench = [];
  const ROSTER_CAP_MIN = 10;
  const ROSTER_CAP_MAX = 30;
  let rosterCap = 20;
  let editRosterCap = 20;
  let rosterDirty = false;
  let rosterClosePrompt = false;
  let bossId = "nekzali";
  /** WCL 난이도: 4 영웅, 5 신화 */
  let wclDifficulty = 5;
  let duration = 360;
  let zoom = 3;
  let collapsedCats = {};
  let rosterOpen = false;
  let rosterEditId = null;
  let rosterDrag = null;
  let fineDrag = null;
  let laneHoverKey = "";
  let cdScrollKey = "";
  const BOSS_ROWS_MODE_KEY = "rp-boss-rows-mode";
  /** "all" | "major" | "custom" */
  let bossRowsMode = (() => {
    try {
      const v = localStorage.getItem(BOSS_ROWS_MODE_KEY);
      return v === "major" || v === "custom" ? v : "all";
    } catch (_) {
      return "all";
    }
  })();
  const SKILL_FILTER_KEY = "rp-skill-filters";
  /** scope("boss:<id>", 추후 "player:..." 등) → 체크된 줄 key 목록 */
  let skillFilters = null;
  let skillFilterOpen = null;
  let timelineVisibleBossKeys = null;
  const BOSS_PANE_KEY = "rp-boss-pane-h";
  let bossPaneH = null;
  let splitDrag = null;
  let suppressAssignClickUntil = 0;
  let assignments = [];
  /** 보스별 배치. 현재 보스 배치는 assignments 에 있고, 나머지 보스는 여기 보관 */
  let assignmentsByBoss = {};
  let assignmentsBossId = bossId;
  let activeRaidId = null;
  /** 지금 워크스페이스를 연 계정 id. 비로그인이면 "". 다른 사람 공대가 브라우저에 남는 걸 막는다. */
  let workspaceOwnerId = null;
  let authWorkspaceQueue = Promise.resolve();
  let savedRaids = [];
  let raidBusy = false;
  let raidSaveTimer = null;
  const PLAN_PAGE_COUNT = 5;
  let planPage = 0;
  let planPages = Array.from({ length: PLAN_PAGE_COUNT }, () => ({ assignmentsByBoss: {}, boardsByBoss: {} }));
  let fitAfterRender = false;
  let shareReadonly = false;
  let activeShareId = null;
  let shareInfo = null;
  let shareModal = null;
  let shareBusy = false;

  function syncBossAssignments() {
    syncBossBoard();
    const slot = planSlotId();
    if (assignmentsBossId === slot) return;
    assignmentsByBoss[assignmentsBossId] = assignments;
    const legacy = wclDifficulty === 5 ? assignmentsByBoss[bossId] : null;
    assignments = assignmentsByBoss[slot] || legacy || [];
    delete assignmentsByBoss[slot];
    assignmentsBossId = slot;
    selectedAssignId = null;
  }

  function dropPlayerAssignments(playerId) {
    const keep = (a) => a.playerId !== playerId;
    assignments = assignments.filter(keep);
    Object.keys(assignmentsByBoss).forEach((k) => {
      assignmentsByBoss[k] = assignmentsByBoss[k].filter(keep);
    });
    planPages.forEach((p) => {
      if (!p?.assignmentsByBoss) return;
      Object.keys(p.assignmentsByBoss).forEach((k) => {
        p.assignmentsByBoss[k] = (p.assignmentsByBoss[k] || []).filter(keep);
      });
    });
  }

  function pruneAssignmentsToRoster() {
    const ids = new Set([...localRoster, ...localBench].map((m) => m.playerId));
    const keep = (a) => ids.has(a.playerId);
    assignments = assignments.filter(keep);
    Object.keys(assignmentsByBoss).forEach((k) => {
      assignmentsByBoss[k] = (assignmentsByBoss[k] || []).filter(keep);
    });
    planPages.forEach((p) => {
      if (!p?.assignmentsByBoss) return;
      Object.keys(p.assignmentsByBoss).forEach((k) => {
        p.assignmentsByBoss[k] = (p.assignmentsByBoss[k] || []).filter(keep);
      });
    });
  }

  function clampPlanPage(n) {
    const i = Number(n);
    return Number.isInteger(i) && i >= 0 && i < PLAN_PAGE_COUNT ? i : 0;
  }

  function blankPlanPage() {
    return { assignmentsByBoss: {}, boardsByBoss: {} };
  }

  function cleanAssigns(list) {
    return Array.isArray(list)
      ? list.filter((a) => a.spellId && a.spellId !== "bloodlust" && a.eventId !== "pull" && spellById(a.spellId))
      : [];
  }

  function normalizePages(raw) {
    const pages = Array.from({ length: PLAN_PAGE_COUNT }, () => blankPlanPage());
    if (!Array.isArray(raw)) return pages;
    raw.slice(0, PLAN_PAGE_COUNT).forEach((p, i) => {
      if (!p || typeof p !== "object") return;
      const nextAssigns = {};
      if (p.assignmentsByBoss && typeof p.assignmentsByBoss === "object") {
        Object.entries(p.assignmentsByBoss).forEach(([k, list]) => {
          nextAssigns[k] = cleanAssigns(list);
        });
      }
      pages[i] = {
        assignmentsByBoss: nextAssigns,
        boardsByBoss: p.boardsByBoss && typeof p.boardsByBoss === "object" ? { ...p.boardsByBoss } : {},
      };
    });
    return pages;
  }

  function snapshotCurrentPage() {
    syncBossAssignments();
    syncBossBoard();
    planPages = normalizePages(planPages);
    planPage = clampPlanPage(planPage);
    const assigns = { ...assignmentsByBoss, [assignmentsBossId]: assignments };
    const copied = {};
    Object.entries(assigns).forEach(([k, list]) => {
      copied[k] = Array.isArray(list) ? [...list] : [];
    });
    planPages[planPage] = {
      assignmentsByBoss: copied,
      boardsByBoss: { ...boardsByBoss, [boardBossId || planSlotId()]: { steps, stepId, mapId: boardMapId } },
    };
  }

  function hydratePage(page) {
    const data = page && typeof page === "object" ? page : blankPlanPage();
    assignmentsByBoss = {};
    if (data.assignmentsByBoss && typeof data.assignmentsByBoss === "object") {
      Object.entries(data.assignmentsByBoss).forEach(([k, list]) => {
        assignmentsByBoss[k] = cleanAssigns(list);
      });
    }
    const slot = planSlotId();
    const legacy = wclDifficulty === 5 ? assignmentsByBoss[bossId] : null;
    assignments = assignmentsByBoss[slot] || legacy || [];
    delete assignmentsByBoss[slot];
    assignmentsBossId = slot;
    boardsByBoss = data.boardsByBoss && typeof data.boardsByBoss === "object" ? { ...data.boardsByBoss } : {};
    boardBossId = null;
    selectedAssignId = null;
    pruneAssignmentsToRoster();
    syncBossBoard();
  }

  function applyPagesFromPlan(data) {
    if (Array.isArray(data?.pages) && data.pages.length) {
      planPages = normalizePages(data.pages);
      planPage = clampPlanPage(data.pageIndex);
      hydratePage(planPages[planPage]);
      return;
    }
    planPages = normalizePages(null);
    planPage = 0;
    const nextAssigns = {};
    if (data?.assignmentsByBoss && typeof data.assignmentsByBoss === "object") {
      Object.entries(data.assignmentsByBoss).forEach(([k, list]) => {
        nextAssigns[k] = cleanAssigns(list);
      });
    } else if (Array.isArray(data?.assignments)) {
      nextAssigns[data.bossId || bossId] = cleanAssigns(data.assignments);
    }
    planPages[0] = {
      assignmentsByBoss: nextAssigns,
      boardsByBoss:
        data?.boardsByBoss && typeof data.boardsByBoss === "object"
          ? { ...data.boardsByBoss }
          : data?.board && Array.isArray(data.board.steps)
            ? { [data.bossId || bossId]: { steps: data.board.steps, stepId: data.board.stepId, mapId: data.board.mapId || null } }
            : {},
    };
    hydratePage(planPages[0]);
  }

  function setPlanPage(idx) {
    const next = clampPlanPage(idx);
    if (next === planPage) return;
    snapshotCurrentPage();
    planPage = next;
    hydratePage(planPages[planPage]);
    requestFitZoom();
    render(true);
    saveState();
  }

  function renderPlanPages() {
    const btns = Array.from({ length: PLAN_PAGE_COUNT }, (_, i) => {
      const on = i === planPage;
      return `<button type="button" class="ghost${on ? " on" : ""}" data-rp="plan-page" data-id="${i}" role="tab" aria-selected="${on ? "true" : "false"}"${on ? ` aria-current="page"` : ""}>${i + 1}</button>`;
    }).join("");
    return `<div class="rp-plan-pages" role="tablist" aria-label="${t("쿨기 페이지", "CD page")}">
      <span>${t("페이지", "Page")} <b>${planPage + 1}</b></span>
      ${btns}
    </div>`;
  }

  /** WCL HPS 상위 로그 패널 */
  let wclOpen = false;
  let wclLoading = false;
  let wclError = null;
  /** 전체 자동 반영 진행 상황 { done, total, current[], results[] } */
  let wclBulk = null;
  let wclStatus = "";
  /** bossId → { phases, sampleCount, topCount, bottomCount } */
  let wclPhaseByBoss = {};
  /** 캐릭터 옆 WCL 버튼 팝오버 { playerId, bossId, key, x, y, loading, phasesLoading, error, status, applying } */
  let wclPick = null;
  /** `${bossId}|${encId}|${class}|${spec}` → 상위 10 (transitions 포함) */
  const wclPickCache = {};
  /** NSRT 내보내기 창 { copied: true|false|null } */
  let nsrtModal = null;

  /** 페이즈 전환 시각 조정: bossId → { starts: [sec…], source: "wcl"|"manual", info } */
  const PHASE_KEY = "rp-phase-overrides";
  let phaseOverrides = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(PHASE_KEY) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch (_) {
      return {};
    }
  })();
  let phaseSyncing = false;
  let phaseSyncError = "";
  const adjustedBossCache = new Map();

  let boardTool = "select";
  let boardColor = BOARD_COLORS[0];
  let steps = [];
  let stepId = null;
  // 보드 좌표계는 맵 이미지 비율(16:9)에 고정, 캔버스 크기에 맞춰 scale만 계산
  const BOARD_W = 1024;
  const BOARD_H = 576;
  let scale = 1;
  let selectedObjIds = new Set();
  let clipboardObjs = [];
  let pasteCount = 0;
  let undoStack = [];
  let redoStack = [];
  let drawing = null;
  let drawingPen = null; // { id, type:"pen", points, color, width }
  let dragging = null;
  let marquee = null; // { x1, y1, x2, y2, additive }
  let erasing = null;
  let boardReady = false;
  let paletteTab = "elements"; // roster | elements | boss
  let stamp = null; // { kind: "player"|"element"|"boss", id }
  let handlePreviewId = null; // 방금 깐 토큰: 선택 없이 조절 핸들만 표시
  let textEditor = null; // { id, fresh, original, undoPushed, closing }
  let boardPainting = false;
  let textEditorRepaint = false;
  let boardMapId = null; // 다중 맵(울라텍 페이즈 등) 선택 id
  /** 보스별 오더 그림판. 현재 보스 보드는 steps/stepId/boardMapId 에 있고, 나머지 보스는 여기 보관 */
  let boardsByBoss = {};
  let boardBossId = null;

  function syncBossBoard() {
    const slot = planSlotId();
    if (boardBossId === slot) return;
    if (boardBossId) boardsByBoss[boardBossId] = { steps, stepId, mapId: boardMapId };
    const saved = boardsByBoss[slot] || (wclDifficulty === 5 ? boardsByBoss[bossId] : null);
    delete boardsByBoss[slot];
    steps = Array.isArray(saved?.steps) && saved.steps.length ? saved.steps : defaultSteps();
    stepId = saved?.stepId && steps.some((s) => s.id === saved.stepId) ? saved.stepId : steps[0].id;
    boardMapId = saved?.mapId || null;
    boardBossId = slot;
    selectedObjIds.clear();
    handlePreviewId = null;
    undoStack = [];
    redoStack = [];
    drawing = null;
    drawingPen = null;
    dragging = null;
    marquee = null;
    erasing = null;
  }
  const iconCache = new Map();

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const t = (ko, en) => (langRef() === "ko" ? ko : en);
  const uid = (p) => `${p}-${Date.now().toString(36)}-${seq++}`;
  const catalog = () => global.RaidPlannerAPI?.getCatalog?.() || global.RAID_PLANNER_CATALOG;
  const specs = () => global.RAID_DATA?.raid?.specs || [];

  function fmtTime(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  function rawBoss(id) {
    const list = catalog().bosses || [];
    return list.find((b) => b.id === id) || list[0];
  }

  /** 현재 난이도(영웅/신화) 카탈로그. 페이즈·스킬은 반드시 이쪽을 쓴다. */
  function catalogBoss(id = bossId) {
    return bossForDifficulty(rawBoss(id));
  }

  function planSlotId(id = bossId, d = wclDifficulty) {
    return `${id}:${d}`;
  }

  function phaseKey(id = bossId) {
    return `${id}:${wclDifficulty}`;
  }

  function bossForDifficulty(raw, d = wclDifficulty) {
    if (!raw) return raw;
    const pack = d === 4 ? raw.heroic : null;
    if (d === 4 && pack) {
      return {
        ...raw,
        wclDifficulty: 4,
        duration: pack.duration || raw.duration,
        phases: Array.isArray(pack.phases) ? pack.phases : raw.phases,
        events: pack.events || raw.events,
        majorSpellIds: pack.majorSpellIds || raw.majorSpellIds,
      };
    }
    return { ...raw, wclDifficulty: d === 4 ? 4 : 5 };
  }

  function currentBoss() {
    return adjustBoss(bossForDifficulty(rawBoss(bossId)));
  }

  function bossById(id) {
    return adjustBoss(bossForDifficulty(rawBoss(id)));
  }

  function setDifficulty(d) {
    const next = Number(d) === 4 ? 4 : 5;
    if (next === wclDifficulty) return;
    wclDifficulty = next;
    syncBossAssignments();
    const boss = currentBoss();
    if (boss) duration = boss.duration;
    requestFitZoom();
    render(true);
    saveState();
  }

  /** 카탈로그(Viserio 타임라인) 기준 페이즈 전환 */
  function basePhases(boss) {
    return Array.isArray(boss?.phases) ? boss.phases : [];
  }

  /** 적용 중인 전환 시각 (조정값 → 없으면 기준값), 항상 증가하도록 보정 */
  function phaseStartsFor(boss) {
    const base = basePhases(boss);
    const ov = phaseOverrides[phaseKey(boss?.id)]?.starts || (wclDifficulty === 5 ? phaseOverrides[boss?.id]?.starts : null);
    let prev = 0;
    return base.map((p, i) => {
      const v = Number(ov?.[i]);
      const sec = Math.max(prev + 1, Math.round(Number.isFinite(v) && v > 0 ? v : p.t));
      prev = sec;
      return sec;
    });
  }

  /** 구간(전환 k) 기준 시각 이동. from/to 는 같은 길이의 전환 시각 배열 */
  function shiftBySegments(sec, from, to, tol = 0) {
    let k = -1;
    for (let i = 0; i < from.length; i++) if (sec >= from[i] - tol) k = i;
    if (k < 0) return { t: sec, k };
    return { t: to[k] + (sec - from[k]), k };
  }

  /** 시각이 속한 페이즈 구간 (-1 = 첫 페이즈, k = 전환 k 이후) */
  function segmentOf(sec, starts) {
    let k = -1;
    (starts || []).forEach((s, i) => {
      if (sec >= s) k = i;
    });
    return k;
  }

  function phaseSegmentFor(id, sec) {
    const boss = catalogBoss(id);
    return basePhases(boss).length ? segmentOf(sec, phaseStartsFor(boss)) : -1;
  }

  function eventSpellKey(ev) {
    return Number(ev.spellId) > 0 ? Number(ev.spellId) : String(ev.name || ev.id);
  }

  /**
   * 스킬이 나온 카탈로그 구간. 바로 앞 구간에도 있으면(전환 직후 루프가 이어지면)
   * 그 구간은 홈이 아님. 한 구간 비고 다시 나오면 재개(홈).
   */
  function spellHomeSegments(boss, base) {
    const present = new Map();
    (boss.events || []).forEach((ev) => {
      if (ev.id === "fight-end" || ev.type === "phase") return;
      const key = eventSpellKey(ev);
      const k = segmentOf(Number(ev.t) || 0, base);
      if (!present.has(key)) present.set(key, new Set());
      present.get(key).add(k);
    });
    const homes = new Map();
    present.forEach((segs, key) => {
      const home = new Set();
      [...segs]
        .sort((a, b) => a - b)
        .forEach((k) => {
          if (!home.has(k - 1)) home.add(k);
        });
      homes.set(key, home);
    });
    return homes;
  }

  function eventHomeK(ev, base, homes) {
    const catalogK = segmentOf(Number(ev.t) || 0, base);
    if (!ev || ev.id === "fight-end" || ev.type === "phase") return catalogK;
    const home = homes.get(eventSpellKey(ev));
    if (!home || home.has(catalogK)) return catalogK;
    let best = null;
    home.forEach((h) => {
      if (h < catalogK && (best == null || h > best)) best = h;
    });
    return best == null ? catalogK : best;
  }

  /**
   * 소속 페이즈가 우리 타임라인에서 이미 끝난 뒤(다음 페이즈 시작 이후)이거나 전투 종료 뒤인 배치 판정.
   * 삭제하지 않고 숨겨 두었다가 페이즈가 길어지면 다시 보이게 함
   */
  function hiddenAssignTest(id = bossId) {
    const boss = catalogBoss(id);
    if (!boss) return () => false;
    const starts = basePhases(boss).length ? phaseStartsFor(boss) : [];
    const adjusted = adjustBoss(boss);
    const end = adjusted.duration;
    const staleIds = new Set(adjusted.staleIds || []);
    return (a) => {
      const sec = Number(a.t) || 0;
      if (sec > end) return true;
      if (a.eventId && staleIds.has(a.eventId)) return true;
      const k = Number.isInteger(a.ph) && a.ph < starts.length ? a.ph : segmentOf(sec, starts);
      const next = starts[k + 1];
      return next != null && sec >= next;
    };
  }

  /** 숨겨진 배치 설명: 소속 페이즈가 우리 타임라인에서 언제 끝나는지 */
  function hiddenReason(a, id = bossId) {
    const boss = catalogBoss(id);
    const starts = boss && basePhases(boss).length ? phaseStartsFor(boss) : [];
    const sec = Number(a.t) || 0;
    const k = Number.isInteger(a.ph) && a.ph < starts.length ? a.ph : segmentOf(sec, starts);
    const next = starts[k + 1];
    if (next != null && sec >= next) {
      const cur = k < 0 ? t("1페이즈", "P1") : langRef() === "ko" ? phaseLabel(boss, k).ko : phaseLabel(boss, k).en;
      return t(
        `우리 타임라인에선 ${cur}가 ${fmtTime(next)}에 끝나서 쓸 수 없는 타이밍 (페이즈 시간차 ${fmtTime(sec - next)}). 그 페이즈를 늘리면 다시 사용 가능`,
        `${cur} ends at ${fmtTime(next)} on this timeline, so this cast can't happen (${fmtTime(sec - next)} past). Lengthen the phase to use it`
      );
    }
    return t("우리 전투시간 이후라 쓸 수 없는 타이밍", "After the fight ends on this timeline");
  }

  function visibleAssignments(list = assignments, id = bossId) {
    const hidden = hiddenAssignTest(id);
    return list.filter((a) => !hidden(a));
  }

  function adjustBoss(boss) {
    const base = basePhases(boss).map((p) => Number(p.t) || 0);
    if (!boss || !base.length) return boss;
    const starts = phaseStartsFor(boss);
    const key = `${boss.id}|${boss.wclDifficulty || wclDifficulty}|${starts.join(",")}`;
    const cacheId = `${boss.id}:${boss.wclDifficulty || wclDifficulty}`;
    const hit = adjustedBossCache.get(cacheId);
    if (hit?.key === key && hit.src === boss) return hit.boss;
    const homes = spellHomeSegments(boss, base);
    let end = Number(boss.duration) || 0;
    const events = [];
    const staleIds = [];
    (boss.events || []).forEach((ev) => {
      const t0 = Number(ev.t) || 0;
      const catalogK = segmentOf(t0, base);
      const homeK = eventHomeK(ev, base, homes);
      const leaked = homeK < catalogK;
      const isTransitionSkill = ev.type === "phase" && !isPullEvent(ev);
      let t1;
      let k;
      if (leaked) {
        // 이전 페이즈 루프는 다음 페이즈 선에 묶지 않고 원래 시계에 둔다
        t1 = t0;
        k = homeK;
      } else {
        const shifted = shiftBySegments(t0, base, starts, isTransitionSkill ? 3 : 0);
        t1 = shifted.t;
        k = shifted.k;
      }
      const boundary = leaked ? starts[catalogK] : starts[k + 1];
      const stale = ev.id !== "fight-end" && boundary != null && t1 >= boundary;
      if (stale) {
        if (ev.id) staleIds.push(ev.id);
        return;
      }
      const out = {
        ...ev,
        t: Math.max(0, Math.round(t1)),
        t0,
        homeK,
      };
      if (out.type === "phase" && !isPullEvent(out)) out.type = "transition";
      if (ev.id === "fight-end") end = out.t;
      events.push(out);
    });
    const adjusted = { ...boss, events, duration: Math.max(end, (starts[starts.length - 1] || 0) + 30), staleIds };
    adjustedBossCache.set(cacheId, { key, src: boss, boss: adjusted });
    return adjusted;
  }

  function savePhaseOverrides() {
    try {
      localStorage.setItem(PHASE_KEY, JSON.stringify(phaseOverrides));
    } catch (_) {
      /* quota */
    }
  }

  /** 전환 시각 변경 + 그 보스의 공대원 배치도 같은 구간 기준으로 이동 */
  function setPhaseStarts(id, starts, source, info) {
    const boss = catalogBoss(id);
    if (!boss || !basePhases(boss).length) return;
    const before = phaseStartsFor(boss);
    if (starts) phaseOverrides[phaseKey(id)] = { starts: starts.map((s) => Math.round(Number(s) || 0)), source, info: info || null };
    else delete phaseOverrides[phaseKey(id)];
    const after = phaseStartsFor(boss);
    savePhaseOverrides();
    const nextDuration = adjustBoss(boss).duration;
    // 배치마다 저장된 소속 페이즈(ph) 기준으로 "페이즈 시작 + 오프셋" 유지. 없으면 현재 시각으로 판단
    const move = (list) =>
      list.map((a) => {
        const sec = Number(a.t) || 0;
        const k = Number.isInteger(a.ph) && a.ph < before.length ? a.ph : segmentOf(sec, before);
        const next = k < 0 ? sec : after[k] + (sec - before[k]);
        return { ...a, ph: k, t: Math.max(0, Math.round(next)) };
      });
    const slot = planSlotId(id);
    if (slot === assignmentsBossId) assignments = move(assignments);
    else if (assignmentsByBoss[slot]) assignmentsByBoss[slot] = move(assignmentsByBoss[slot]);
    if (id === bossId) duration = nextDuration;
  }

  function currentSpell() {
    return (catalog().spells || []).find((s) => s.id === selectedSpellId) || null;
  }

  function spellById(id) {
    return (catalog().spells || []).find((s) => s.id === id) || null;
  }

  function categoryName(id) {
    const c = (catalog().categories || []).find((x) => x.id === id);
    if (!c) return id;
    return langRef() === "ko" ? c.nameKo : c.name;
  }

  function spellName(sp) {
    return langRef() === "ko" ? sp.nameKo : sp.name;
  }

  function classColor(className) {
    return global.RAID_DATA?.classes?.[className]?.[1] || "#8ec5ff";
  }

  function classShort(className) {
    const ko = {
      "Death Knight": "죽기",
      "Demon Hunter": "악사",
      "Druid": "드루",
      "Evoker": "기원",
      "Hunter": "냥꾼",
      "Mage": "법사",
      "Monk": "수도",
      "Paladin": "기사",
      "Priest": "사제",
      "Rogue": "도적",
      "Shaman": "술사",
      "Warlock": "흑마",
      "Warrior": "전사",
    };
    const en = {
      "Death Knight": "DK",
      "Demon Hunter": "DH",
      "Druid": "Dru",
      "Evoker": "Evo",
      "Hunter": "Hunt",
      "Mage": "Mage",
      "Monk": "Monk",
      "Paladin": "Pal",
      "Priest": "Pri",
      "Rogue": "Rog",
      "Shaman": "Sha",
      "Warlock": "Lock",
      "Warrior": "War",
    };
    return (langRef() === "ko" ? ko : en)[className] || className.slice(0, 3);
  }

  function realmLabel(id) {
    const r = KR_REALMS.find((x) => x.id === id) || KR_REALMS[0];
    return langRef() === "ko" ? r.ko : r.en;
  }

  function normalizeRealm(id) {
    if (KR_REALMS.some((r) => r.id === id)) return id;
    const byKo = KR_REALMS.find((r) => r.ko === id || r.en === id);
    return byKo?.id || DEFAULT_REALM;
  }

  function memberRealm(m) {
    return normalizeRealm(m?.server || DEFAULT_REALM);
  }

  function realmOptionsHtml(selected) {
    const cur = normalizeRealm(selected);
    return KR_REALMS.map(
      (r) =>
        `<option value="${r.id}" ${r.id === cur ? "selected" : ""}>${langRef() === "ko" ? r.ko : r.en}</option>`
    ).join("");
  }

  function memberLabel(m) {
    return langRef() === "ko" ? `${m.classKo} · ${m.specKo}` : `${m.spec} ${m.class}`;
  }

  function memberShort(m) {
    return langRef() === "ko" ? m.specKo : m.spec.slice(0, 3);
  }

  function memberNick(m) {
    return String(m?.nick || "").trim();
  }

  function playerCallsign(player) {
    if (!player) return "";
    const nick = memberNick(player);
    if (nick) return nick;
    const pool = rosterOpen ? [...editRoster, ...editBench] : [...localRoster, ...localBench];
    const same = pool.filter((m) => m.class === player.class);
    const idx = same.findIndex((m) => m.playerId === player.playerId);
    return `${classShort(player.class)}${Math.max(1, idx + 1)}`;
  }

  function assignLabel(a) {
    const sp = spellById(a.spellId);
    if (!sp) return "";
    const player = activeRoster().find((m) => m.playerId === a.playerId);
    const who = playerCallsign(player);
    const name = spellName(sp);
    return who ? `${who} ${name}` : name;
  }

  function activeRoster() {
    return localRoster;
  }

  function cloneMembers(list) {
    return (list || []).map((m) => ({ ...m }));
  }

  function clampRosterCap(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return 20;
    return Math.min(ROSTER_CAP_MAX, Math.max(ROSTER_CAP_MIN, v));
  }

  function activeCap() {
    return rosterOpen ? editRosterCap : rosterCap;
  }

  function trimRosterToCap(roster, bench, cap) {
    if (!roster || roster.length <= cap) return;
    bench.unshift(...roster.splice(cap));
  }

  function setRosterCap(n) {
    const next = clampRosterCap(n);
    if (rosterOpen) {
      const before = editRoster.length;
      trimRosterToCap(editRoster, editBench, next);
      if (next !== editRosterCap || editRoster.length !== before) rosterDirty = true;
      editRosterCap = next;
      return;
    }
    trimRosterToCap(localRoster, localBench, next);
    rosterCap = next;
    editRosterCap = next;
  }

  function placeRoster(next) {
    const cap = clampRosterCap(Math.max(activeCap(), Math.min(next.length, ROSTER_CAP_MAX)));
    const active = next.slice(0, cap);
    const bench = next.slice(cap);
    if (rosterOpen) {
      editRosterCap = cap;
      editRoster = active;
      editBench = bench;
      rosterDirty = true;
      return;
    }
    rosterCap = cap;
    editRosterCap = cap;
    localRoster = active;
    localBench = bench;
  }

  function beginRosterEdit() {
    editRoster = cloneMembers(localRoster);
    editBench = cloneMembers(localBench);
    editRosterCap = rosterCap;
    rosterDirty = false;
    rosterClosePrompt = false;
  }

  function discardRosterEdit() {
    editRoster = cloneMembers(localRoster);
    editBench = cloneMembers(localBench);
    editRosterCap = rosterCap;
    rosterDirty = false;
    rosterEditId = null;
  }

  function commitRosterEdit() {
    localRoster = cloneMembers(editRoster);
    localBench = cloneMembers(editBench);
    rosterCap = editRosterCap;
    pruneAssignmentsToRoster();
    dropUnusableAssignments();
    rosterDirty = false;
  }

  function confirmDiscardRosterDraft() {
    if (!rosterDirty) return true;
    return window.confirm(
      t("저장하지 않은 공대 구성이 있습니다. 버릴까요?", "Discard unsaved roster changes?")
    );
  }

  function openRosterModal() {
    beginRosterEdit();
    rosterOpen = true;
  }

  function finishCloseRosterModal() {
    rosterOpen = false;
    rosterEditId = null;
    rosterDirty = false;
    rosterClosePrompt = false;
  }

  function requestCloseRoster() {
    if (!rosterOpen) return;
    if (!rosterDirty) {
      discardRosterEdit();
      finishCloseRosterModal();
      renderCd();
      saveState();
      return;
    }
    rosterClosePrompt = true;
    renderCd();
  }

  function demoMembers() {
    return DEMO_SPECS.map(([cls, spec], i) => {
      const found = specs().find((s) => s.class === cls && s.spec === spec);
      if (!found) return null;
      return { ...found, playerId: `demo-${i}`, nick: "", server: DEFAULT_REALM };
    }).filter(Boolean);
  }

  function buildDemoRoster() {
    const next = demoMembers();
    rosterMode = "demo";
    placeRoster(next);
    if (!rosterOpen) pruneAssignmentsToRoster();
  }

  function membersFromHelper() {
    const fromHelper = helperRosterRef() || [];
    if (!fromHelper.length) return null;
    const prevSrc = [...localRoster, ...localBench, ...editRoster, ...editBench];
    const prev = new Map(prevSrc.map((m) => [m.playerId, { nick: m.nick || "", server: memberRealm(m) }]));
    return fromHelper.map((s, i) => {
      const playerId = s.instanceId || `h-${i}`;
      const keep = prev.get(playerId) || {};
      return {
        ...s,
        playerId,
        nick: keep.nick || s.nick || "",
        server: keep.server || normalizeRealm(s.server) || DEFAULT_REALM,
      };
    });
  }

  function importHelperRoster() {
    const next = membersFromHelper();
    if (!next) return false;
    rosterMode = "helper";
    placeRoster(next);
    if (rosterOpen) return true;
    pruneAssignmentsToRoster();
    dropUnusableAssignments();
    return true;
  }

  function isSavedRaidId(id) {
    return Boolean(id) && id !== TEMP_RAID_ID;
  }

  function isTempRaid() {
    return !shareReadonly && activeRaidId === TEMP_RAID_ID;
  }

  function tempRaidLabel() {
    return t("임시 공대", "Temporary raid");
  }

  function tempStorageKey() {
    return `${STORE_KEY}:${currentAuthId() || "anon"}:temp`;
  }

  function readTempWorkspace() {
    try {
      const data = JSON.parse(localStorage.getItem(tempStorageKey()) || "null");
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  function writeTempWorkspace() {
    if (shareReadonly) return;
    try {
      snapshotCurrentPage();
      localStorage.setItem(tempStorageKey(), JSON.stringify({ version: 1, plan: currentPlanSnapshot() }));
    } catch (_) {
      /* quota */
    }
  }

  function applyTempWorkspace(plan, membersFallback) {
    applyPlanSnapshot(plan || blankRaidPlan(), membersFallback || []);
    rosterMode = "helper";
    activeRaidId = TEMP_RAID_ID;
    if (rosterOpen) beginRosterEdit();
  }

  async function persistCurrentIfSaved() {
    if (shareReadonly) return;
    if (isSavedRaidId(activeRaidId) && global.RaidStore?.isLoggedIn()) {
      await persistActiveRaid({ quiet: true, id: activeRaidId });
      return;
    }
    if (isTempRaid()) writeTempWorkspace();
  }

  async function enterTempFromHelper() {
    const next = membersFromHelper();
    if (!next) return false;
    await persistCurrentIfSaved();
    const plan = blankRaidPlan();
    plan.localRoster = next.map(slimMember);
    plan.localBench = [];
    plan.rosterCap = clampRosterCap(Math.max(rosterCap, Math.min(next.length, ROSTER_CAP_MAX)));
    applyTempWorkspace(plan, next);
    writeTempWorkspace();
    writePlannerPrefs();
    return true;
  }

  async function switchToTempRaid() {
    if (activeRaidId === TEMP_RAID_ID) return;
    if (!confirmDiscardRosterDraft()) {
      renderCd();
      return;
    }
    await persistCurrentIfSaved();
    const stored = readTempWorkspace()?.plan;
    applyTempWorkspace(stored, stored?.localRoster || []);
    render(true);
    saveState();
  }

  function dropUnusableAssignments() {
    const keep = (a) => {
      const member = findRosterMember(a.playerId);
      const spell = spellById(a.spellId);
      return Boolean(member && spell && memberProvides(member, spell));
    };
    assignments = assignments.filter(keep);
    Object.keys(assignmentsByBoss).forEach((k) => {
      assignmentsByBoss[k] = (assignmentsByBoss[k] || []).filter(keep);
    });
    planPages.forEach((p) => {
      if (!p?.assignmentsByBoss) return;
      Object.keys(p.assignmentsByBoss).forEach((k) => {
        p.assignmentsByBoss[k] = (p.assignmentsByBoss[k] || []).filter(keep);
      });
    });
  }

  function findRosterMember(playerId) {
    const lists = rosterOpen ? [editRoster, editBench] : [localRoster, localBench];
    for (const list of lists) {
      const hit = list.find((m) => m.playerId === playerId);
      if (hit) return hit;
    }
    return null;
  }

  function memberIconHtml(m) {
    const url = global.BoardAssets?.playerIconUrl?.(m) || global.BoardAssets?.specIconUrl?.(m.class, m.spec);
    const fallback = escapeAttr((langRef() === "ko" ? m.specKo || m.spec : m.spec || "?").slice(0, 1));
    return `<span class="rp-spec-ico-wrap">
      ${url ? `<img class="rp-spec-ico" src="${escapeAttr(url)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <i class="rp-spec-ico fallback">${fallback}</i>
    </span>`;
  }

  function removeMember(playerId) {
    if (!playerId) return;
    if (rosterOpen) {
      editRoster = editRoster.filter((m) => m.playerId !== playerId);
      editBench = editBench.filter((m) => m.playerId !== playerId);
      rosterDirty = true;
      if (selectedPlayerId === playerId) selectedPlayerId = null;
      if (rosterEditId === playerId) rosterEditId = null;
      return;
    }
    localRoster = localRoster.filter((m) => m.playerId !== playerId);
    localBench = localBench.filter((m) => m.playerId !== playerId);
    dropPlayerAssignments(playerId);
    if (selectedPlayerId === playerId) selectedPlayerId = null;
  }

  function moveMemberToBench(playerId) {
    const roster = rosterOpen ? editRoster : localRoster;
    const bench = rosterOpen ? editBench : localBench;
    const idx = roster.findIndex((m) => m.playerId === playerId);
    if (idx < 0) return;
    const [m] = roster.splice(idx, 1);
    bench.push(m);
    if (rosterOpen) {
      rosterDirty = true;
      return;
    }
    dropPlayerAssignments(playerId);
  }

  function moveMemberToActive(playerId) {
    const roster = rosterOpen ? editRoster : localRoster;
    const bench = rosterOpen ? editBench : localBench;
    const idx = bench.findIndex((m) => m.playerId === playerId);
    if (idx < 0) return;
    const cap = activeCap();
    if (roster.length >= cap) {
      window.alert(t(`선발은 최대 ${cap}명입니다.`, `Active roster is capped at ${cap}.`));
      return;
    }
    const [m] = bench.splice(idx, 1);
    roster.push(m);
    if (rosterOpen) rosterDirty = true;
  }

  function addSpecToRoster(className, specName) {
    const found = specs().find((s) => s.class === className && s.spec === specName);
    if (!found) return;
    const member = {
      ...found,
      playerId: uid("m"),
      nick: "",
      server: DEFAULT_REALM,
      color: found.color || classColor(found.class),
    };
    const roster = rosterOpen ? editRoster : localRoster;
    const bench = rosterOpen ? editBench : localBench;
    if (roster.length < activeCap()) roster.push(member);
    else bench.push(member);
    selectedPlayerId = member.playerId;
    if (rosterOpen) rosterDirty = true;
  }

  function memberProvides(member, spell) {
    if (!member || !spell) return false;
    return (spell.providers || []).some((p) => {
      if (typeof p === "string") return member.class === p;
      if (!p || typeof p !== "object") return false;
      if (member.class !== p.class) return false;
      return !p.spec || member.spec === p.spec;
    });
  }

  function providerClassName(spell) {
    const p = (spell?.providers || [])[0];
    if (!p) return null;
    return typeof p === "string" ? p : p.class;
  }

  function providersFor(spell) {
    return activeRoster().filter((m) => memberProvides(m, spell));
  }

  function providerDisplayName(player) {
    return playerCallsign(player) || t("미지정", "Open");
  }

  function timelinePad() {
    return 12;
  }

  function timelineWidth() {
    return Math.max(420, Math.round(duration * zoom) + timelinePad() * 2);
  }

  function timeX(sec) {
    return timelinePad() + Number(sec || 0) * zoom;
  }

  function isPullEvent(ev) {
    if (!ev) return true;
    if (ev.id === "pull") return true;
    const tSec = Number(ev.t);
    if (tSec !== 0) return false;
    const name = String(ev.name || "");
    const nameKo = String(ev.nameKo || "");
    return /^pull$/i.test(name) || nameKo === "풀" || /^풀\s*·/.test(nameKo);
  }

  function isPhaseEvent(ev) {
    if (!ev || isPullEvent(ev)) return false;
    if (ev.kind === "phase" || ev._phase) return true;
    return ev.type === "phase";
  }

  function planEvents(events) {
    return (events || []).filter((ev) => !isPullEvent(ev));
  }

  function planSkillEvents(events) {
    return planEvents(events).filter((ev) => !isPhaseEvent(ev));
  }

  /** 그리드용: 네임드별 majorSpellIds / major 플래그만 (없으면 전체) */
  function planGridSkillEvents(boss) {
    const skills = planSkillEvents(boss?.events || []).filter((ev) => !ev.stale);
    const ids = Array.isArray(boss?.majorSpellIds) ? boss.majorSpellIds.map(Number) : [];
    if (ids.length) {
      const set = new Set(ids);
      return skills.filter((ev) => ev.major === true || set.has(Number(ev.spellId)));
    }
    if (skills.some((ev) => ev.major === true)) {
      return skills.filter((ev) => ev.major === true);
    }
    return skills;
  }

  function eventIconUrl(ev) {
    return global.RaidPlannerAPI?.getEventIcon?.(ev) || ev?.iconUrl || null;
  }

  function bossPortraitUrl(boss) {
    return global.RaidPlannerAPI?.getBossIcon?.(boss) || boss?.iconUrl || null;
  }

  function catalogPhaseMarkers(boss) {
    return planEvents(boss?.events || [])
      .filter((ev) => isPhaseEvent(ev))
      .map((ev) => ({
        kind: "phase",
        id: ev.id,
        t: Number(ev.t) || 0,
        name: ev.name,
        nameKo: ev.nameKo,
        type: "phase",
        iconUrl: eventIconUrl(ev),
        spellId: ev.spellId || null,
        varied: false,
        minSec: Number(ev.t) || 0,
        maxSec: Number(ev.t) || 0,
        source: "catalog",
      }));
  }

  function wclPhaseMarkers(boss) {
    const stats = wclPhaseByBoss[boss?.id];
    if (!stats?.phases?.length) return null;
    const catalog = catalogPhaseMarkers(boss);
    return stats.phases.map((p, i) => {
      const hit = catalog[i] || catalog.find((c) => c.id === p.id) || null;
      return {
        kind: "phase",
        id: p.id || hit?.id || `wcl-p-${i}`,
        t: Number(p.t) || 0,
        name: hit?.name || p.label || `Phase ${i + 2}`,
        nameKo: hit?.nameKo || p.label || `페이즈 ${i + 2}`,
        type: "phase",
        iconUrl: hit?.iconUrl || null,
        spellId: hit?.spellId || null,
        varied: Boolean(p.varied),
        minSec: Number(p.minSec) || Number(p.t) || 0,
        maxSec: Number(p.maxSec) || Number(p.t) || 0,
        topAvg: p.topAvg,
        bottomAvg: p.bottomAvg,
        source: "wcl",
        samples: p.samples,
      };
    });
  }

  function phaseLabel(boss, i) {
    const p = basePhases(boss)[i];
    const id = Number(p?.id) || i + 2;
    return { ko: `${id}페이즈`, en: `Phase ${id}` };
  }

  function transitionPhaseMarkers(boss) {
    const base = basePhases(boss);
    if (!base.length) return null;
    const starts = phaseStartsFor(boss);
    const per = phaseOverrides[phaseKey(boss.id)]?.info?.per || (wclDifficulty === 5 ? phaseOverrides[boss.id]?.info?.per : null) || [];
    return starts.map((t, i) => {
      const lbl = phaseLabel(boss, i);
      const st = per[i];
      const varied = Boolean(st && st.max - st.min >= 15);
      return {
        kind: "phase",
        id: `phase-${i}`,
        t,
        name: lbl.en,
        nameKo: lbl.ko,
        type: "phase",
        iconUrl: null,
        spellId: null,
        varied,
        minSec: varied ? st.min : t,
        maxSec: varied ? st.max : t,
        source: "transition",
      };
    });
  }

  /** 전환 마커면 전환 순번, 아니면 null */
  function phaseIdxOf(ev) {
    if (ev?.source !== "transition") return null;
    const n = Number(String(ev.id || "").replace("phase-", ""));
    return Number.isInteger(n) ? n : null;
  }

  function phaseMarkersForBoss(boss) {
    return transitionPhaseMarkers(boss) || wclPhaseMarkers(boss) || catalogPhaseMarkers(boss);
  }

  /** 스킬 이벤트 + 페이즈 세로열을 시간순으로 합친 컬럼 */
  function buildTimelineColumns(boss) {
    const skills = planGridSkillEvents(boss).map((ev) => ({
      ...ev,
      kind: "skill",
      t: Number(ev.t) || 0,
    }));
    const phases = phaseMarkersForBoss(boss);
    return [...skills, ...phases].sort((a, b) => a.t - b.t || (a.kind === "phase" ? 1 : -1));
  }

  function phaseRangeLabel(col) {
    if (!col || !col.varied) return "";
    return `${fmtTime(col.minSec)}~${fmtTime(col.maxSec)}`;
  }

  function clampZoom(v) {
    return Math.max(0.5, Math.min(12, Math.round(v * 10) / 10));
  }

  function requestFitZoom() {
    fitAfterRender = true;
  }

  function applyFitZoomAfterLayout() {
    if (!fitAfterRender) return;
    fitAfterRender = false;
    requestAnimationFrame(() => {
      const prev = zoom;
      fitZoom();
      if (Math.abs(zoom - prev) > 0.04) {
        renderCd();
        saveState();
      }
    });
  }

  /** 가로 스크롤이 안 생기는 최대 배율 (.rp-time min-width = label + w + 48) */
  function fitZoom() {
    const scroller = document.querySelector("#rpCd .rp-time-bottom") || document.querySelector("#rpCd .rp-board-wrap");
    const time = scroller?.querySelector(".rp-time");
    const avail = scroller?.clientWidth || 0;
    if (!avail) {
      zoom = clampZoom(900 / Math.max(1, duration));
      return;
    }
    const label = time ? parseFloat(getComputedStyle(time).getPropertyValue("--label")) || 168 : 168;
    const lane = avail - label - 48 - timelinePad() * 2 - 2;
    const fit = Math.floor((lane / Math.max(1, duration)) * 10) / 10;
    zoom = Math.max(0.5, Math.min(12, fit));
  }

  /**
   * 실제 쿨타임: 카탈로그 기본값, 단 WCL 로그에서 더 짧은 간격으로 쓴 기록(cdObs)이 있으면 그 값
   * (특성으로 쿨이 줄어든 경우: 영혼 소집 2분→1분, 천상의 찬가 3분→2분 등)
   */
  function effectiveCooldown(spell, playerId) {
    const base = Number(spell?.cooldown) || 0;
    if (!base) return 0;
    let cd = base;
    assignments.forEach((a) => {
      if (a.spellId === spell.id && a.playerId === playerId && Number(a.cdObs) > 0) cd = Math.min(cd, Number(a.cdObs));
    });
    return cd;
  }

  function cooldownConflict(spell, playerId, time, ignoreAssignId) {
    if (!spell || !playerId) return null;
    const cd = effectiveCooldown(spell, playerId);
    if (!cd) return null;
    const hit = visibleAssignments().find(
      (a) =>
        a.id !== ignoreAssignId &&
        a.spellId === spell.id &&
        a.playerId === playerId &&
        Math.abs((a.t || 0) - time) < cd
    );
    if (!hit) return null;
    if (hit.t === time) return { type: "used", assign: hit };
    return { type: "cd", assign: hit, readyAt: hit.t + cd };
  }

  /** ±10초 창 안에서 가장 빨리 배치 가능한 시각. 없으면 null */
  function earliestReadyInWindow(spell, playerId, anchor, ignoreAssignId) {
    const { lo, hi } = fineRange(anchor);
    for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) {
      if (!cooldownConflict(spell, playerId, t, ignoreAssignId)) return t;
    }
    return null;
  }

  /** 원하는 시각이 쿨에 걸리면 창 안 가장 가까운 허용 시각으로 스냅 */
  function clampFineTimeToAllowed(spell, playerId, anchor, desiredT, ignoreAssignId) {
    const { lo, hi } = fineRange(anchor);
    const t0 = Math.round(Math.max(lo, Math.min(hi, desiredT)));
    if (!cooldownConflict(spell, playerId, t0, ignoreAssignId)) return t0;
    let best = null;
    let bestDist = Infinity;
    for (let s = Math.ceil(lo); s <= Math.floor(hi); s++) {
      if (cooldownConflict(spell, playerId, s, ignoreAssignId)) continue;
      const d = Math.abs(s - t0);
      if (d < bestDist || (d === bestDist && best != null && Math.abs(s - desiredT) < Math.abs(best - desiredT))) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  /** ±10초 창에서 좌/우로 막힌 비율 (드래그·배치 불가 구간) */
  function fineWindowLockPcts(spell, playerId, anchor, ignoreAssignId) {
    const { lo, hi, span } = fineRange(anchor);
    const ignoreSet = new Set(
      Array.isArray(ignoreAssignId) ? ignoreAssignId : ignoreAssignId ? [ignoreAssignId] : []
    );
    const shown = visibleAssignments();
    const blockedAt = (t) =>
      shown.some((a) => {
        if (ignoreSet.has(a.id)) return false;
        if (a.spellId !== spell?.id || a.playerId !== playerId) return false;
        const cd = Number(spell.cooldown) || 0;
        if (!cd) return false;
        return Math.abs((a.t || 0) - t) < cd;
      });

    let firstOk = null;
    for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) {
      if (!blockedAt(t)) {
        firstOk = t;
        break;
      }
    }
    if (firstOk == null) {
      return { leftPct: 100, rightPct: 0, full: true, firstOk: null, lastOk: null, lo, hi, span };
    }
    let lastOk = null;
    for (let t = Math.floor(hi); t >= Math.ceil(lo); t--) {
      if (!blockedAt(t)) {
        lastOk = t;
        break;
      }
    }
    const leftPct = Math.max(0, Math.min(100, ((firstOk - lo) / span) * 100));
    const rightPct = Math.max(0, Math.min(100, ((hi - lastOk) / span) * 100));
    return { leftPct, rightPct, full: false, firstOk, lastOk, lo, hi, span };
  }

  function fineLockHtml(locks) {
    if (!locks || locks.full) return "";
    const left =
      locks.leftPct > 0.4
        ? `<div class="rp-fine-lock left" style="width:${locks.leftPct}%" aria-hidden="true"></div>`
        : "";
    const right =
      locks.rightPct > 0.4
        ? `<div class="rp-fine-lock right" style="width:${locks.rightPct}%" aria-hidden="true"></div>`
        : "";
    return left + right;
  }

  function fineLockStyleAttrs(locks) {
    if (!locks || locks.full) return "";
    const l = Math.max(0, Number(locks.leftPct) || 0);
    const r = Math.max(0, Number(locks.rightPct) || 0);
    if (l < 0.4 && r < 0.4) return "";
    return `style="--lock-l:${l.toFixed(2)}%;--lock-r:${r.toFixed(2)}%"`;
  }

  /**
   * 이벤트 칸 가용성.
   * - free: 창 전체 배치 가능
   * - partial: 창 일부만 가능
   * - blocked: 창 전체 불가
   */
  function cellCdAvailability(spell, playerId, anchor, ignoreAssignId) {
    const locks = fineWindowLockPcts(spell, playerId, anchor, ignoreAssignId);
    const { lo, hi, span } = locks;
    if (locks.full) {
      const conflict =
        cooldownConflict(spell, playerId, anchor, ignoreAssignId) ||
        cooldownConflict(spell, playerId, lo, ignoreAssignId) ||
        cooldownConflict(spell, playerId, hi, ignoreAssignId);
      return { kind: "blocked", conflict, lo, hi, span };
    }
    if (locks.leftPct < 0.4 && locks.rightPct < 0.4) {
      return { kind: "free", lo, hi, span, placeAt: anchor };
    }
    const placeAt = locks.firstOk;
    return {
      kind: "partial",
      conflict: cooldownConflict(spell, playerId, lo, ignoreAssignId),
      readyAt: locks.firstOk,
      placeAt,
      freeFromPct: locks.leftPct,
      freeToPct: 100 - locks.rightPct,
      leftPct: locks.leftPct,
      rightPct: locks.rightPct,
      lo,
      hi,
      span,
    };
  }

  function playerSpellGroups(spells) {
    const list = spells || [];
    return sortedRoster(activeRoster())
      .map((player) => ({
        player,
        spells: list.filter((sp) => memberProvides(player, sp)),
      }))
      .filter((g) => g.spells.length);
  }

  function personBundleMeta(player) {
    const who = providerDisplayName(player);
    const accent = player?.color || classColor(player?.class);
    const spec = langRef() === "ko" ? player?.specKo || player?.spec : player?.spec;
    return { who, accent, spec: spec || "" };
  }

  /** 같은 사람·같은 스킬 배치 중 쿨타임 안에 다시 쓴 것 (페이즈를 당기면 생길 수 있음) */
  function cooldownOverlaps(list, cd) {
    const ids = new Set();
    const bands = [];
    if (!cd || (list || []).length < 2) return { ids, bands };
    const sorted = [...list].sort((a, b) => a.t - b.t);
    for (let i = 1; i < sorted.length; i++) {
      const earlier = sorted[i - 1];
      const later = sorted[i];
      const readyAt = earlier.t + cd;
      if (later.t >= readyAt) continue;
      ids.add(earlier.id);
      ids.add(later.id);
      bands.push({ earlier, later, readyAt });
    }
    return { ids, bands };
  }

  /** 초 → "2페이즈 +0:20" */
  function phaseRelLabel(sec, ph) {
    const boss = catalogBoss(bossId);
    const starts = basePhases(boss).length ? phaseStartsFor(boss) : [];
    const k = Number.isInteger(ph) && ph < starts.length ? ph : segmentOf(sec, starts);
    if (k < 0) return starts.length ? t(`1페이즈 +${fmtTime(sec)}`, `P1 +${fmtTime(sec)}`) : fmtTime(sec);
    const lbl = phaseLabel(boss, k);
    return t(`${lbl.ko} +${fmtTime(sec - starts[k])}`, `${lbl.en} +${fmtTime(sec - starts[k])}`);
  }

  function countCooldownOverlaps() {
    const groups = new Map();
    visibleAssignments().forEach((a) => {
      const k = `${a.playerId}|${a.spellId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    });
    let n = 0;
    groups.forEach((list) => {
      const sp = spellById(list[0].spellId);
      n += cooldownOverlaps(list, effectiveCooldown(sp, list[0].playerId)).bands.length;
    });
    return n;
  }

  function cellBlockedTitle(conflict) {
    if (!conflict) return "";
    if (conflict.type === "used") return t("이미 배치됨", "Already placed");
    return t(
      `쿨타임 · ${fmtTime(conflict.assign.t)} 사용 · ${fmtTime(conflict.readyAt)} 이후 가능`,
      `On cooldown · used ${fmtTime(conflict.assign.t)} · ready ${fmtTime(conflict.readyAt)}`
    );
  }

  function eventAnchor(ev) {
    return Number(ev?.t) || 0;
  }

  function fineRange(anchor) {
    const lo = Math.max(0, anchor - FINE_WINDOW);
    const hi = Math.min(duration, anchor + FINE_WINDOW);
    return { lo, hi, span: Math.max(1, hi - lo) };
  }

  function fineOffsetPct(assign, anchor) {
    const { lo, span } = fineRange(anchor);
    const t = Math.max(lo, Math.min(lo + span, Number(assign.t) || anchor));
    return ((t - lo) / span) * 100;
  }

  /** 아이콘 왼쪽 끝이 칸 경계에 닿을 때 = 최좌/최우. --fine-t 0~1 */
  function fineChipTimeRatio(assign, anchor) {
    return fineOffsetPct(assign, anchor) / 100;
  }

  function fineChipStyle(assign, anchor) {
    const t = fineChipTimeRatio(assign, anchor);
    return `--fine-t:${t};left:calc(var(--fine-t) * (100% - var(--fine-chip)))`;
  }

  function fineAnchorPct(anchor) {
    const { lo, span } = fineRange(anchor);
    return ((anchor - lo) / span) * 100;
  }

  function assignmentsForCell(sp, player, ev) {
    return visibleAssignments().filter((a) => {
      if (a.spellId !== sp.id || a.playerId !== player.playerId) return false;
      if (a.eventId) return a.eventId === ev.id;
      return Math.abs((a.t || 0) - ev.t) <= FINE_WINDOW;
    });
  }

  function renderCdBandCell(conflict, colspan, fromEv, toEv, sp, player) {
    const title = escapeAttr(
      t("클릭하면 배치됩니다. 쿨이 겹치면 타임라인에 표시됩니다.", "Click to place. Overlaps show on the timeline.") +
        (fromEv && toEv && fromEv.id !== toEv.id ? ` · ${fmtTime(fromEv.t)}–${fmtTime(toEv.t)}` : "")
    );
    const ready = conflict?.readyAt != null ? fmtTime(conflict.readyAt) : "";
    const tSec = fromEv?.t ?? 0;
    const evId = fromEv?.id || "";
    return `<td colspan="${colspan}" class="rp-cd-span">
      <div class="rp-cell blocked band" role="button" tabindex="0" data-rp="assign-cell" data-t="${tSec}" data-event="${evId}" data-spell="${sp.id}" data-player="${player.playerId}" title="${title}">
        <span class="rp-cd-band-label">${ready ? t(`${ready}부터 · 겹쳐 넣기`, `from ${ready} · place anyway`) : t("겹쳐 넣기", "Place anyway")}</span>
      </div>
    </td>`;
  }

  function renderPartialCell(ev, sp, player, avail) {
    const anchor = eventAnchor(ev);
    const leftPct = avail.leftPct ?? avail.freeFromPct ?? 0;
    const rightPct = avail.rightPct ?? 0;
    const title = escapeAttr(
      t(
        `쿨 제한 · ${fmtTime(avail.readyAt ?? avail.placeAt)} 이후 배치`,
        `CD limit · place after ${fmtTime(avail.readyAt ?? avail.placeAt)}`
      )
    );
    const freeLeft = leftPct;
    const freeRight = 100 - rightPct;
    return `<div class="rp-cell partial" role="button" tabindex="0" data-rp="assign-cell" data-partial="1" data-anchor="${anchor}" data-t="${ev.t}" data-place-t="${avail.placeAt}" data-event="${ev.id}" data-spell="${sp.id}" data-player="${player.playerId}" title="${title}">
      ${fineLockHtml({ leftPct, rightPct, full: false })}
      <div class="rp-partial-free" style="left:${freeLeft}%;width:${Math.max(0, freeRight - freeLeft)}%">
        <span class="rp-plus">+</span>
        <em>${fmtTime(avail.placeAt)}</em>
      </div>
    </div>`;
  }

  function renderBlockedCell(conflict) {
    const title = escapeAttr(cellBlockedTitle(conflict));
    return `<div class="rp-cell blocked band" title="${title}">
      <span class="rp-cd-band-label">CD</span>
    </div>`;
  }

  function renderFilledCell(here, ev, sp, player) {
    const anchor = eventAnchor(ev);
    const primary = here[0];
    const ignoreIds = here.map((a) => a.id);
    const locks = fineWindowLockPcts(sp, player.playerId, anchor, ignoreIds);
    const hasLock = !locks.full && ((locks.leftPct || 0) > 0.4 || (locks.rightPct || 0) > 0.4);
    const ticks = Array.from({ length: FINE_SLOTS + 1 }, (_, i) => {
      const strong = i === 0 || i === FINE_SLOTS / 2 || i === FINE_SLOTS ? " strong" : "";
      return `<i class="${strong.trim()}" style="left:${(i / FINE_SLOTS) * 100}%"></i>`;
    }).join("");
    const chips = here
      .map((a) => {
        const on = selectedAssignId === a.id;
        const nick = memberNick(player);
        const mark = nick ? nick.slice(0, 1) : playerCallsign(player).slice(0, 1);
        const accent = player?.color || classColor(player.class);
        const label = assignLabel(a);
        return `<div class="rp-assign icon-only fine ${on ? "on" : ""}" role="button" tabindex="0" data-rp="assign" data-fine="1" data-id="${a.id}" style="--class:${accent};${fineChipStyle(a, anchor)}" title="${escapeAttr(label + " · " + fmtTime(a.t))}">
          ${spellThumb(sp, mark)}
        </div>`;
      })
      .join("");
    const lockTip =
      hasLock && locks.firstOk != null
        ? ` title="${escapeAttr(
            t(
              `쿨 제한 구간 · ${fmtTime(locks.firstOk)}~${fmtTime(locks.lastOk)} 배치 가능`,
              `CD lock · place ${fmtTime(locks.firstOk)}–${fmtTime(locks.lastOk)}`
            )
          )}"`
        : "";
    return `<div class="rp-cell filled ${hasLock ? "has-lock" : ""}" data-rp="assign-cell" data-anchor="${anchor}" data-t="${ev.t}" data-event="${ev.id}" data-spell="${sp.id}" data-player="${player.playerId}" ${fineLockStyleAttrs(locks)}${lockTip}>
      ${fineLockHtml(locks)}
      <div class="rp-fine-track" aria-hidden="true">${ticks}</div>
      <div class="rp-fine-mid" style="left:${fineAnchorPct(anchor)}%" aria-hidden="true"></div>
      ${chips}
      <span class="rp-fine-time">${fmtTime(primary?.t ?? anchor)}</span>
    </div>`;
  }

  function bossSkillRows(events) {
    const map = new Map();
    (events || []).forEach((ev) => {
      if (isPhaseEvent(ev)) return;
      const key = `${ev.name || ""}|${ev.nameKo || ""}|${ev.type || ""}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: ev.name,
          nameKo: ev.nameKo,
          type: ev.type || "",
          iconUrl: eventIconUrl(ev),
          spellId: ev.spellId || null,
          marks: [],
        });
      }
      const row = map.get(key);
      if (!row.iconUrl) row.iconUrl = eventIconUrl(ev);
      row.marks.push(ev);
    });
    return [...map.values()];
  }

  function bossRowKey(ev) {
    return ev.name ? `n${ev.name}` : `s${ev.spellId || ""}`;
  }

  function loadSkillFilters() {
    if (skillFilters) return skillFilters;
    try {
      const raw = JSON.parse(localStorage.getItem(SKILL_FILTER_KEY) || "{}");
      skillFilters = raw && typeof raw === "object" ? raw : {};
    } catch (_) {
      skillFilters = {};
    }
    return skillFilters;
  }

  /** 커스텀 체크 목록. 저장된 게 없으면 fallbackKeys 로 시작 */
  function skillFilterGet(scope, fallbackKeys) {
    const saved = loadSkillFilters()[scope];
    return new Set(Array.isArray(saved) ? saved : fallbackKeys || []);
  }

  function skillFilterSet(scope, keys) {
    loadSkillFilters()[scope] = [...keys];
    try {
      localStorage.setItem(SKILL_FILTER_KEY, JSON.stringify(skillFilters));
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * 범용 스킬 체크 팝업
   * items: { key, name, iconUrl, spellId, major, count }
   */
  function renderSkillFilterPop(scope, title, items, selected, footerHtml) {
    const all = items.length;
    const on = items.filter((it) => selected.has(it.key)).length;
    return `<div class="rp-skill-filter" data-scope="${escapeAttr(scope)}">
      <div class="rp-skill-filter-h">
        <b>${escapeAttr(title)}</b><em>${on}/${all}</em>
        <button type="button" class="rp-skill-filter-x" data-rp="skill-filter-close" title="${t("닫기", "Close")}">×</button>
      </div>
      <div class="rp-skill-filter-acts">
        <button type="button" data-rp="skill-filter-bulk" data-scope="${escapeAttr(scope)}" data-mode="all">${t("전체 선택", "All")}</button>
        <button type="button" data-rp="skill-filter-bulk" data-scope="${escapeAttr(scope)}" data-mode="major">${t("주요만 선택", "Majors")}</button>
        <button type="button" data-rp="skill-filter-bulk" data-scope="${escapeAttr(scope)}" data-mode="none">${t("모두 해제", "None")}</button>
      </div>
      <div class="rp-skill-filter-list">
        ${items
          .map(
            (it) => `<label class="${it.major ? "major" : ""}">
              <input type="checkbox" data-rp="skill-filter-item" data-scope="${escapeAttr(scope)}" data-key="${escapeAttr(
                it.key
              )}" ${selected.has(it.key) ? "checked" : ""}>
              ${it.iconUrl ? `<img src="${escapeAttr(it.iconUrl)}" alt="">` : "<i></i>"}
              <span>${escapeAttr(it.name)}</span>
              ${it.count != null ? `<em>${it.count}</em>` : ""}
            </label>`
          )
          .join("")}
      </div>
      ${footerHtml ? `<div class="rp-skill-filter-foot">${footerHtml}</div>` : ""}
    </div>`;
  }

  /** scope 별 팝업 항목 (지금은 보스만, 추후 플레이어 scope 추가) */
  function skillFilterItems(scope) {
    if (scope.startsWith("boss:")) {
      return timelineBossRows(currentBoss()).map((row) => ({
        key: row.key,
        name: langRef() === "ko" ? row.nameKo || row.name : row.name,
        iconUrl: row.iconUrl,
        spellId: row.spellId,
        major: row.major,
        count: row.marks.length,
      }));
    }
    return [];
  }

  function closeSkillFilter(e) {
    if (!skillFilterOpen || !e.target.isConnected) return;
    if (e.target.closest?.(".rp-skill-filter, [data-rp='boss-rows-custom']")) return;
    skillFilterOpen = null;
    renderCd();
  }

  function setBossRowsMode(mode) {
    bossRowsMode = mode;
    try {
      localStorage.setItem(BOSS_ROWS_MODE_KEY, mode);
    } catch (_) {
      /* ignore */
    }
  }

  /** 타임라인용: 모든 보스 스킬을 스킬 이름별 한 줄로(같은 이름·다른 spellId 합침), 첫 시전 순 */
  function timelineBossRows(boss) {
    const majorIds = new Set((boss?.majorSpellIds || []).map(Number));
    const map = new Map();
    planSkillEvents(boss?.events || [])
      .filter((ev) => ev.id !== "fight-end")
      .forEach((ev) => {
        const key = bossRowKey(ev);
        if (!map.has(key)) {
          map.set(key, {
            key,
            name: ev.name,
            nameKo: ev.nameKo,
            type: ev.type || "",
            iconUrl: eventIconUrl(ev),
            spellId: ev.spellId || null,
            major: false,
            first: Number(ev.t) || 0,
            marks: [],
          });
        }
        const row = map.get(key);
        if (!row.iconUrl) row.iconUrl = eventIconUrl(ev);
        if (ev.major === true || majorIds.has(Number(ev.spellId))) row.major = true;
        row.first = Math.min(row.first, Number(ev.t) || 0);
        row.marks.push(ev);
      });
    return [...map.values()].sort((a, b) => a.first - b.first);
  }

  function currentStep() {
    return steps.find((s) => s.id === stepId) || steps[0];
  }

  function defaultSteps() {
    return [
      { id: uid("step"), name: t("1페이즈", "Phase 1"), notes: "", objects: [] },
      { id: uid("step"), name: t("2페이즈", "Phase 2"), notes: "", objects: [] },
    ];
  }

  function currentAuthId() {
    return global.RaidAuth?.user?.()?.id || "";
  }

  function wipeLegacyPlannerCache() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function readPlannerPrefs(uid) {
    if (!uid) return null;
    try {
      const data = JSON.parse(localStorage.getItem(`${STORE_KEY}:${uid}`) || "null");
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  function writePlannerPrefs() {
    const uid = currentAuthId();
    if (!uid || shareReadonly) return;
    try {
      localStorage.setItem(
        `${STORE_KEY}:${uid}`,
        JSON.stringify({
          version: 3,
          tool,
          bossId,
          wclDifficulty,
          duration,
          zoom,
          collapsedCats,
          rosterCap,
          activeRaidId,
          planPage,
        })
      );
    } catch (_) {
      /* quota */
    }
  }

  function applyPlannerPrefs(data) {
    if (!data || typeof data !== "object") return;
    if (data.tool === "board" || data.tool === "cd") tool = data.tool;
    if (data.bossId) bossId = data.bossId;
    if (data.wclDifficulty === 4 || data.wclDifficulty === 5) wclDifficulty = data.wclDifficulty;
    const knownBosses = catalog()?.bosses || [];
    if (knownBosses.length && !knownBosses.some((b) => b.id === bossId)) {
      bossId = knownBosses[0].id;
    }
    if (data.duration) duration = data.duration;
    if (data.zoom) {
      zoom = clampZoom(Number(data.zoom) > 5 ? 900 / Math.max(1, data.duration || duration) : data.zoom);
    }
    if (data.collapsedCats && typeof data.collapsedCats === "object") collapsedCats = data.collapsedCats;
    if (data.rosterCap) {
      rosterCap = clampRosterCap(data.rosterCap);
      editRosterCap = rosterCap;
    }
  }

  function resetPlannerWorkspace() {
    rosterMode = "empty";
    localRoster = [];
    localBench = [];
    editRoster = [];
    editBench = [];
    rosterDirty = false;
    rosterClosePrompt = false;
    rosterOpen = false;
    rosterEditId = null;
    activeRaidId = null;
    savedRaids = [];
    rosterCap = 20;
    editRosterCap = 20;
    planPages = normalizePages(null);
    planPage = 0;
    wclDifficulty = 5;
    hydratePage(blankPlanPage());
    wclPick = null;
    wclOpen = false;
    wclBulk = null;
    nsrtModal = null;
    shareModal = null;
  }

  function applyAuthWorkspace() {
    const run = authWorkspaceQueue.then(syncAuthWorkspace, syncAuthWorkspace);
    authWorkspaceQueue = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  async function syncAuthWorkspace() {
    if (shareReadonly) {
      await refreshSavedRaids();
      return;
    }
    const uid = currentAuthId();
    const logged = Boolean(global.RaidStore?.isLoggedIn());
    const owner = logged ? uid : "";
    if (workspaceOwnerId === owner) {
      await refreshSavedRaids();
      return;
    }
    workspaceOwnerId = owner;
    wipeLegacyPlannerCache();
    resetPlannerWorkspace();
    if (!logged) {
      await refreshSavedRaids();
      const stored = readTempWorkspace()?.plan;
      if (stored) applyTempWorkspace(stored);
      return;
    }
    const prefs = readPlannerPrefs(uid);
    applyPlannerPrefs(prefs);
    await refreshSavedRaids();
    const remembered = prefs?.activeRaidId;
    if (remembered === TEMP_RAID_ID) {
      applyTempWorkspace(readTempWorkspace()?.plan);
      writePlannerPrefs();
      tool = "cd";
      return;
    }
    const listed =
      (remembered && savedRaids.find((r) => r.id === remembered)) || savedRaids[0] || null;
    if (!listed) {
      tool = "cd";
      return;
    }
    try {
      const raid = (await global.RaidStore.get(listed.id)) || listed;
      if (workspaceOwnerId !== owner) return;
      if (raid) {
        applySavedRaid(raid);
        writePlannerPrefs();
      }
    } catch (_) {
      if (listed.plan || listed.members?.length) {
        applySavedRaid(listed);
        writePlannerPrefs();
      } else tool = "cd";
    }
  }

  function saveState() {
    if (shareReadonly) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      snapshotCurrentPage();
      writePlannerPrefs();
      if (isTempRaid()) writeTempWorkspace();
      else scheduleRaidPersist();
    }, 120);
  }

  function slimMember(m) {
    return {
      playerId: m.playerId,
      class: m.class,
      spec: m.spec,
      role: m.role,
      nick: m.nick || "",
      server: memberRealm(m),
    };
  }

  function hydrateMember(raw, i, prefix) {
    if (!raw) return null;
    const found = specs().find((s) => s.class === raw.class && s.spec === raw.spec);
    if (!found) return null;
    return {
      ...found,
      playerId: raw.playerId || `${prefix}-${i}`,
      nick: raw.nick || "",
      server: normalizeRealm(raw.server),
    };
  }

  function hydrateMembers(list, prefix) {
    return (list || []).map((m, i) => hydrateMember(m, i, prefix)).filter(Boolean);
  }

  function currentPlanSnapshot(lists) {
    snapshotCurrentPage();
    const roster = lists?.active || localRoster;
    const bench = lists?.bench || localBench;
    return {
      version: 2,
      bossId,
      wclDifficulty,
      zoom,
      collapsedCats,
      tool,
      rosterCap,
      pageIndex: planPage,
      pages: planPages,
      localRoster: roster.map(slimMember),
      localBench: bench.map(slimMember),
      assignmentsByBoss: { ...assignmentsByBoss, [assignmentsBossId]: assignments },
      boardsByBoss: { ...boardsByBoss, [boardBossId || planSlotId()]: { steps, stepId, mapId: boardMapId } },
    };
  }

  function applyPlanSnapshot(plan, membersFallback) {
    const data = plan && typeof plan === "object" ? plan : {};
    const rosterSrc = Array.isArray(data.localRoster) && data.localRoster.length ? data.localRoster : membersFallback;
    localRoster = hydrateMembers(rosterSrc, "raid");
    localBench = hydrateMembers(data.localBench, "bench");
    if (data.rosterCap) {
      rosterCap = clampRosterCap(data.rosterCap);
      editRosterCap = rosterCap;
    }
    rosterMode = "saved";
    if (data.bossId) bossId = data.bossId;
    const knownBosses = catalog()?.bosses || [];
    if (knownBosses.length && !knownBosses.some((b) => b.id === bossId)) bossId = knownBosses[0].id;
    if (data.wclDifficulty === 4 || data.wclDifficulty === 5) wclDifficulty = data.wclDifficulty;
    else wclDifficulty = 5;
    if (data.collapsedCats && typeof data.collapsedCats === "object") collapsedCats = data.collapsedCats;
    if (data.tool === "board" || data.tool === "cd") tool = data.tool;
    applyPagesFromPlan(data);
    const boss = currentBoss();
    if (boss) duration = boss.duration;
    requestFitZoom();
  }

  function applySavedRaid(raid) {
    if (!raid) return false;
    applyPlanSnapshot(raid.plan, raid.members);
    if (!(raid.plan && raid.plan.rosterCap) && raid.size) {
      rosterCap = clampRosterCap(raid.size);
      editRosterCap = rosterCap;
    }
    activeRaidId = raid.id;
    if (rosterOpen) beginRosterEdit();
    return true;
  }

  function blankRaidPlan() {
    return {
      version: 2,
      bossId,
      zoom,
      collapsedCats,
      tool: "cd",
      pageIndex: 0,
      pages: normalizePages(null),
      localRoster: [],
      localBench: [],
      assignmentsByBoss: {},
      boardsByBoss: {},
    };
  }

  function boardShareSnapshot() {
    syncBossBoard();
    return {
      version: 1,
      bossId,
      boardsByBoss: { ...boardsByBoss, [boardBossId || planSlotId()]: { steps, stepId, mapId: boardMapId } },
      roster: localRoster.map(slimMember),
      bench: localBench.map(slimMember),
    };
  }

  function applySharePayload(payload) {
    const data = payload && typeof payload === "object" ? payload : {};
    shareReadonly = true;
    tool = "board";
    rosterOpen = false;
    rosterEditId = null;
    rosterMode = "saved";
    if (data.bossId) bossId = data.bossId;
    const knownBosses = catalog()?.bosses || [];
    if (knownBosses.length && !knownBosses.some((b) => b.id === bossId)) bossId = knownBosses[0].id;
    localRoster = hydrateMembers(data.roster, "share");
    localBench = hydrateMembers(data.bench, "share-bench");
    boardsByBoss = data.boardsByBoss && typeof data.boardsByBoss === "object" ? { ...data.boardsByBoss } : {};
    boardBossId = null;
    assignments = [];
    assignmentsByBoss = {};
    assignmentsBossId = bossId;
    selectedAssignId = null;
    selectedObjIds.clear();
    stamp = null;
    boardTool = "select";
    syncBossBoard();
    const boss = currentBoss();
    if (boss) duration = boss.duration;
  }

  async function loadBoardShare(id) {
    shareReadonly = true;
    shareModal = null;
    shareInfo = { id, title: "", author: "", loading: true, error: null };
    tool = "board";
    render(true);
    try {
      const res = await fetch(`/api/board-shares/${encodeURIComponent(id)}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.share?.payload) {
        shareInfo = {
          id,
          title: "",
          author: "",
          loading: false,
          error: t("공유 링크를 찾지 못했습니다.", "This share link was not found."),
        };
        render(true);
        return;
      }
      applySharePayload(data.share.payload);
      shareInfo = {
        id: data.share.id || id,
        title: data.share.title || t("오더 그림판", "Order Board"),
        author: data.share.author || "",
        loading: false,
        error: null,
      };
    } catch (_) {
      shareInfo = {
        id,
        title: "",
        author: "",
        loading: false,
        error: t("공유 보드를 불러오지 못했습니다.", "Could not load the shared board."),
      };
    }
    render(true);
  }

  async function createBoardShare() {
    if (shareReadonly || shareBusy) return;
    if (!global.RaidStore?.isLoggedIn()) {
      window.alert(t("로그인하면 열람 링크를 만들 수 있습니다.", "Log in to create a view-only link."));
      return;
    }
    shareBusy = true;
    renderBoardChrome();
    try {
      const res = await fetch("/api/board-shares", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title: activeRaidName() || t("오더 그림판", "Order Board"),
          payload: boardShareSnapshot(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.alert(t("로그인하면 열람 링크를 만들 수 있습니다.", "Log in to create a view-only link."));
        return;
      }
      if (res.status === 413) {
        window.alert(t("그림판 내용이 너무 커서 공유할 수 없습니다.", "The board is too large to share."));
        return;
      }
      if (!res.ok || !data.share?.id) {
        window.alert(t("링크를 만들지 못했습니다.", "Could not create the link."));
        return;
      }
      const url = `${location.origin}/planner/share/${encodeURIComponent(data.share.id)}`;
      shareModal = { url, copied: null };
      copyText(url).then((ok) => {
        if (!shareModal) return;
        shareModal.copied = ok;
        renderBoardChrome();
      });
    } catch (_) {
      window.alert(t("링크를 만들지 못했습니다.", "Could not create the link."));
    } finally {
      shareBusy = false;
      renderBoardChrome();
    }
  }

  function renderShareModal() {
    if (!shareModal) return "";
    const copiedNote =
      shareModal.copied === true
        ? `<div class="rp-wcl-ok">${t("클립보드에 복사했습니다", "Copied to clipboard")}</div>`
        : shareModal.copied === false
          ? `<div class="rp-wcl-err">${t("자동 복사 실패 · 아래 주소를 직접 복사하세요", "Auto copy failed · copy the address below")}</div>`
          : "";
    return `<div class="rp-modal-back" data-rp="share-close"></div>
    <div class="rp-nsrt-modal" role="dialog" aria-label="${t("열람 링크", "View link")}">
      <div class="rp-wcl-pop-h">
        <div class="rp-wcl-pop-title"><b>${t("열람용 링크", "View-only link")}</b><span>${t(
          "받은 사람은 그림판만 볼 수 있고 수정할 수 없습니다",
          "Recipients can view the board but cannot edit it"
        )}</span></div>
        <button type="button" class="ghost rp-wcl-pop-x" data-rp="share-close" title="${t("닫기", "Close")}">✕</button>
      </div>
      ${copiedNote}
      <input class="rp-share-url" readonly value="${escapeAttr(shareModal.url)}">
      <div class="rp-nsrt-acts">
        <button type="button" class="primary" data-rp="share-copy">${t("다시 복사", "Copy again")}</button>
      </div>
    </div>`;
  }

  async function refreshSavedRaids() {
    if (!global.RaidStore?.isLoggedIn()) {
      savedRaids = [];
      return;
    }
    try {
      savedRaids = await global.RaidStore.list();
      if (activeRaidId && !savedRaids.some((r) => r.id === activeRaidId)) {
        /* keep id until user picks another; list may still be catching up */
      }
    } catch {
      savedRaids = [];
    }
  }

  function scheduleRaidPersist() {
    if (shareReadonly) return;
    if (rosterOpen && rosterDirty) return;
    if (!isSavedRaidId(activeRaidId) || !global.RaidStore?.isLoggedIn() || raidBusy) return;
    clearTimeout(raidSaveTimer);
    raidSaveTimer = setTimeout(() => {
      if (raidBusy) return;
      persistActiveRaid({ quiet: true });
    }, 700);
  }

  async function persistActiveRaid(opts) {
    const quiet = opts?.quiet;
    const empty = Boolean(opts?.empty);
    clearTimeout(raidSaveTimer);
    if (!global.RaidStore?.isLoggedIn()) {
      if (!quiet) window.alert(t("로그인하면 내 공대를 저장할 수 있습니다.", "Log in to save your raids."));
      return null;
    }
    const name =
      opts?.name ||
      savedRaids.find((r) => r.id === (opts?.id || activeRaidId))?.name ||
      t("내 공대", "My raid");
    const rawId = opts?.asNew ? undefined : opts?.id || activeRaidId || undefined;
    const id = isSavedRaidId(rawId) ? rawId : undefined;
    if (!id && !opts?.asNew && !empty) {
      if (isTempRaid()) writeTempWorkspace();
      return isTempRaid() ? { id: TEMP_RAID_ID, name: tempRaidLabel() } : null;
    }
    raidBusy = true;
    try {
      const membersSrc = empty ? [] : Array.isArray(opts?.members) ? opts.members : localRoster;
      const plan = empty ? blankRaidPlan() : opts?.plan || currentPlanSnapshot();
      const saved = await global.RaidStore.save({
        id,
        name,
        size: rosterCap,
        members: membersSrc.map(slimMember),
        plan,
      });
      activeRaidId = saved.id;
      if (empty) {
        applyPlanSnapshot(plan, []);
        beginRosterEdit();
      } else if (opts?.switchTo) {
        applyPlanSnapshot(plan, membersSrc);
        beginRosterEdit();
      }
      await refreshSavedRaids();
      if (!quiet) {
        window.alert(
          empty
            ? t("새 공대를 만들었습니다. 구성원을 넣고 저장하세요.", "Created a new raid. Add members, then save.")
            : opts?.cloned
              ? t("지금 구성원으로 새 공대를 만들었습니다.", "Created a new raid with the current roster.")
              : opts?.renamed
                ? t("공대 이름을 바꿨습니다.", "Raid name updated.")
                : t("이 공대의 구성·쿨기·오더를 저장했습니다.", "Saved roster, cooldowns, and order board.")
        );
      }
      return saved;
    } catch (err) {
      if (err.status === 404 && id && !opts?.asNew) activeRaidId = null;
      if (!quiet) {
        window.alert(
          err.status === 409
            ? t("내 공대는 최대 10개입니다. 하나를 지운 뒤 저장하세요.", "You can keep up to 10 raids. Delete one first.")
            : t("저장에 실패했습니다.", "Save failed.")
        );
      }
      return null;
    } finally {
      raidBusy = false;
    }
  }

  async function saveActiveRoster() {
    if (rosterOpen) commitRosterEdit();
    if (isTempRaid()) {
      writeTempWorkspace();
      writePlannerPrefs();
      if (rosterOpen) beginRosterEdit();
      return true;
    }
    if (!global.RaidStore?.isLoggedIn()) return true;
    if (!isSavedRaidId(activeRaidId)) {
      const fallback = t(`내 공대 ${savedRaids.length + 1}`, `Raid ${savedRaids.length + 1}`);
      const name = window.prompt(t("공대 이름", "Raid name"), fallback);
      if (!name) {
        if (rosterOpen) beginRosterEdit();
        return true;
      }
      await persistActiveRaid({ asNew: true, name: name.trim().slice(0, 80) });
      if (rosterOpen) beginRosterEdit();
      return true;
    }
    await persistActiveRaid();
    if (rosterOpen) beginRosterEdit();
    return true;
  }

  async function createBlankRaid() {
    if (!global.RaidStore?.isLoggedIn()) {
      window.alert(t("로그인하면 새 공대를 만들 수 있습니다.", "Log in to create a new raid."));
      return;
    }
    const max = global.RaidStore?.MAX || 10;
    if (savedRaids.length >= max) {
      window.alert(t("내 공대는 최대 10개입니다. 하나를 지운 뒤 만드세요.", "You can keep up to 10 raids. Delete one first."));
      return;
    }
    const fallback = t(`내 공대 ${savedRaids.length + 1}`, `Raid ${savedRaids.length + 1}`);
    const name = window.prompt(t("새 공대 이름", "New raid name"), fallback);
    if (!name) return;
    if (!confirmDiscardRosterDraft()) return;
    await persistCurrentIfSaved();
    const saved = await persistActiveRaid({ asNew: true, name: name.trim().slice(0, 80), empty: true });
    if (!saved) return;
    rosterOpen = true;
    renderCd();
    saveState();
  }

  async function duplicateRaid() {
    if (!global.RaidStore?.isLoggedIn()) {
      window.alert(t("로그인하면 공대를 복제할 수 있습니다.", "Log in to duplicate a raid."));
      return;
    }
    const max = global.RaidStore?.MAX || 10;
    if (savedRaids.length >= max) {
      window.alert(t("내 공대는 최대 10개입니다. 하나를 지운 뒤 복제하세요.", "You can keep up to 10 raids. Delete one first."));
      return;
    }
    const members = cloneMembers(rosterOpen ? editRoster : localRoster);
    const bench = cloneMembers(rosterOpen ? editBench : localBench);
    if (!members.length && !bench.length) {
      window.alert(t("복제할 구성원이 없습니다.", "There is no roster to duplicate."));
      return;
    }
    const srcName = activeRaidName() || t("내 공대", "My raid");
    const fallback = t(`${srcName} 복사`, `Copy of ${srcName}`);
    const name = window.prompt(t("복제된 공대 이름", "Duplicated raid name"), fallback);
    if (!name) return;
    await persistCurrentIfSaved();
    const plan = currentPlanSnapshot({ active: members, bench });
    const saved = await persistActiveRaid({
      asNew: true,
      name: name.trim().slice(0, 80),
      members,
      plan,
      switchTo: true,
      cloned: true,
    });
    if (!saved) return;
    rosterOpen = true;
    renderCd();
    saveState();
  }

  async function renameActiveRaid() {
    if (!global.RaidStore?.isLoggedIn()) {
      window.alert(t("로그인하면 공대 이름을 바꿀 수 있습니다.", "Log in to rename a raid."));
      return;
    }
    if (!isSavedRaidId(activeRaidId)) {
      window.alert(t("임시 공대는 이름을 바꿀 수 없습니다. 복제해서 새 공대로 만드세요.", "The temporary raid cannot be renamed. Duplicate it to save a named raid."));
      return;
    }
    const current = activeRaidName() || t("내 공대", "My raid");
    const name = window.prompt(t("공대 이름", "Raid name"), current);
    if (!name) return;
    const next = name.trim().slice(0, 80);
    if (!next || next === current) return;
    const saved = await persistActiveRaid({ name: next, renamed: true });
    if (!saved) return;
    renderCd();
    saveState();
  }

  async function loadSavedRaid(id) {
    if (!id) return;
    if (id === TEMP_RAID_ID) {
      await switchToTempRaid();
      return;
    }
    if (!confirmDiscardRosterDraft()) {
      renderCd();
      return;
    }
    if (isTempRaid()) writeTempWorkspace();
    else if (isSavedRaidId(activeRaidId) && activeRaidId !== id && global.RaidStore?.isLoggedIn()) {
      await persistActiveRaid({ quiet: true, id: activeRaidId });
    }
    const raid = await global.RaidStore.get(id);
    if (!raid) {
      window.alert(t("공대를 불러오지 못했습니다.", "Could not load that raid."));
      return;
    }
    applySavedRaid(raid);
    render(true);
    saveState();
  }

  function raidMemberCount(r) {
    if (!r) return 0;
    if (Array.isArray(r.members) && r.members.length) return r.members.length;
    if (Array.isArray(r.plan?.localRoster) && r.plan.localRoster.length) return r.plan.localRoster.length;
    return Number(r.size) || 0;
  }

  function activeRaidName() {
    if (isTempRaid()) return tempRaidLabel();
    return savedRaids.find((r) => r.id === activeRaidId)?.name || "";
  }

  function tempMemberCount() {
    if (isTempRaid()) return localRoster.length;
    const plan = readTempWorkspace()?.plan;
    if (Array.isArray(plan?.localRoster) && plan.localRoster.length) return plan.localRoster.length;
    return 0;
  }

  function raidPickOptions() {
    const temp = `<option value="${TEMP_RAID_ID}" ${isTempRaid() ? "selected" : ""}>${escapeAttr(
      `${tempRaidLabel()} (${tempMemberCount()})`
    )}</option>`;
    const saved = savedRaids
      .map(
        (r) =>
          `<option value="${escapeAttr(r.id)}" ${r.id === activeRaidId ? "selected" : ""}>${escapeAttr(
            `${r.name} (${raidMemberCount(r)})`
          )}</option>`
      )
      .join("");
    return `<option value="">${t("공대 선택", "Choose a raid")}</option>${temp}${saved}`;
  }

  function renderRaidLibrary() {
    const logged = Boolean(global.RaidStore?.isLoggedIn());
    const n = savedRaids.length;
    const max = global.RaidStore?.MAX || 10;
    const loginHref = global.RaidAuth?.loginHref?.() || "";
    const canPreview = Boolean(global.RaidAuth?.canPreview?.());
    const options = raidPickOptions();
    const loginBit = logged
      ? `<span class="rp-raid-count">${n}/${max}</span>`
      : `<span class="rp-raid-login">${t("로그인하면 내 공대 저장 · 최대 10개", "Log in to save up to 10 raids")}${
          loginHref
            ? ` · <a href="${loginHref}">Battle.net</a>`
            : canPreview
              ? ` · <button type="button" class="ghost" data-rp="raid-login">${t("로그인", "Log in")}</button>`
              : ""
        }</span>`;
    return `<div class="rp-raid-lib">
      <div class="rp-raid-lib-row">
        <label>
          <span>${t("내 공대", "My raids")}</span>
          <select data-rp="raid-pick" ${logged ? "" : "disabled"}>${options}</select>
        </label>
        <button type="button" class="primary" data-rp="raid-save">${t("저장", "Save")}${rosterDirty ? " *" : ""}</button>
        <button type="button" class="ghost" data-rp="raid-save-new" ${logged ? "" : "disabled"}>${t("새로 만들기", "New raid")}</button>
        <button type="button" class="ghost" data-rp="raid-duplicate" ${logged ? "" : "disabled"}>${t("복제", "Duplicate")}</button>
        <button type="button" class="ghost" data-rp="raid-rename" ${logged && isSavedRaidId(activeRaidId) ? "" : "disabled"}>${t("이름 편집", "Rename")}</button>
        <button type="button" class="danger" data-rp="raid-delete" ${logged && isSavedRaidId(activeRaidId) ? "" : "disabled"}>${t("삭제", "Delete")}</button>
      </div>
      <div class="rp-raid-lib-note">${loginBit}${
        isTempRaid()
          ? ` · ${t("구인 도우미용 임시 칸입니다. 저장한 공대는 덮어쓰지 않습니다.", "Helper scratch slot. Saved raids are not overwritten.")}`
          : ""
      }</div>
    </div>`;
  }

  function renderPlanSlot() {
    const logged = Boolean(global.RaidStore?.isLoggedIn());
    const options = raidPickOptions();
    return `<div class="rp-plan-slot">
      <label>
        <span>${t("공대", "Raid")}</span>
        <select data-rp="raid-pick" ${logged ? "" : "disabled"}>${options}</select>
      </label>
      ${renderPlanPages()}
    </div>`;
  }

  function mount(getLang, getRoster, opts) {
    langRef = getLang || (() => "ko");
    helperRosterRef = getRoster || (() => []);
    const shareId = String(opts?.shareId || "").trim();
    if (!bound) {
      bound = true;
      wipeLegacyPlannerCache();
      if (!boardBossId) syncBossBoard();
      if (!shareId) requestFitZoom();
      bindRoot();
      if (!shareId) {
        applyAuthWorkspace().then(() => {
          if (shareReadonly) return;
          requestFitZoom();
          const view = document.getElementById("plannerView");
          if (view && !view.classList.contains("hidden")) render(true);
        });
      }
    }
    if (shareId) {
      if (activeShareId !== shareId) {
        activeShareId = shareId;
        ensureShell(true);
        loadBoardShare(shareId);
        return;
      }
    } else if (activeShareId) {
      activeShareId = null;
      shareReadonly = false;
      shareInfo = null;
      shareModal = null;
      workspaceOwnerId = null;
      applyAuthWorkspace().then(() => {
        if (!boardBossId) syncBossBoard();
        requestFitZoom();
        render(true);
      });
    }
    ensureShell(true);
    render(true);
  }

  function ensureShell(force) {
    const root = document.getElementById("plannerView");
    if (!root) return;
    const needsRebuild = !root.querySelector(".rp-header");
    if (shellBuilt && !force && !needsRebuild) return;
    root.innerHTML = `
      <div class="rp-shell">
        <header class="rp-header">
          <div class="rp-header-top">
            <div class="rp-header-title">
              <h2 id="rpTitle"></h2>
              <div class="sub" id="rpSub"></div>
            </div>
            <div class="g-screen-tabs rp-mode-tabs" role="tablist">
              <button type="button" class="g-screen-tab" data-rp="tool-cd" id="rpTabCd" role="tab"></button>
              <button type="button" class="g-screen-tab" data-rp="tool-board" id="rpTabBoard" role="tab"></button>
            </div>
          </div>
          <div class="rp-boss-bar">
            <div class="rp-boss-bar-label">
              <span id="rpBossLbl"></span>
              <strong id="rpBossName" class="rp-boss-name"></strong>
            </div>
            <div class="rp-diff-toggle" id="rpDiff" role="group"></div>
            <div class="rp-boss-rail" id="rpBossPicker" role="listbox" aria-label="Boss"></div>
            <select id="rpBoss" class="rp-boss-select-fallback" aria-hidden="true" tabindex="-1"></select>
          </div>
        </header>
        <div class="rp-banner" id="rpBanner"></div>
        <div id="rpCd" class="rp-tool"></div>
        <div id="rpBoard" class="rp-tool hidden"></div>
      </div>`;
    shellBuilt = true;
    boardReady = false;
  }

  function bindRoot() {
    const root = document.getElementById("plannerView");
    if (!root) return;
    root.addEventListener("click", onClick);
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("change", onChange);
    root.addEventListener("input", onInput);
    root.addEventListener("pointerdown", onFinePointerDown);
    root.addEventListener("pointermove", onLaneHover);
    root.addEventListener("pointerleave", hideLaneHover);
    root.addEventListener("pointerdown", onSplitDown);
    root.addEventListener("dblclick", onSplitReset);
    document.addEventListener("click", closeSkillFilter);
    document.addEventListener("pointermove", onSplitMove);
    document.addEventListener("pointerup", onSplitUp);
    document.addEventListener("pointercancel", onSplitUp);
    root.addEventListener("dragstart", onRosterDragStart);
    root.addEventListener("dragover", onRosterDragOver);
    root.addEventListener("dragleave", onRosterDragLeave);
    root.addEventListener("drop", onRosterDrop);
    root.addEventListener("dragend", onRosterDragEnd);
    document.addEventListener("pointermove", onFinePointerMove);
    document.addEventListener("pointerup", onFinePointerUp);
    document.addEventListener("pointercancel", onFinePointerUp);
    root.addEventListener("pointerdown", onPhaseDragDown);
    document.addEventListener("pointermove", onPhaseDragMove);
    document.addEventListener("pointerup", onPhaseDragUp);
    document.addEventListener("pointercancel", onPhaseDragUp);
    document.addEventListener("keydown", onKey);
    const onAuth = () => {
      applyAuthWorkspace().then(() => {
        const view = document.getElementById("plannerView");
        if (view && !view.classList.contains("hidden")) render(true);
      });
    };
    document.addEventListener("raid:auth", onAuth);
    if (global.RaidAuth?.onChange) global.RaidAuth.onChange(onAuth);
  }

  /** 페이즈 전환선 드래그. 놓을 때 한 번만 적용(보스 스킬·쿨기 이동), 드래그 중엔 선만 이동 */
  let phaseDrag = null;

  function onPhaseDragDown(e) {
    if (e.button !== 0) return;
    const handle = e.target.closest?.("[data-rp='phase-drag']");
    if (!handle) return;
    const idx = Number(handle.dataset.idx);
    const starts = phaseStartsFor(catalogBoss(bossId));
    if (!(idx >= 0 && idx < starts.length)) return;
    e.preventDefault();
    const from = starts[idx];
    phaseDrag = {
      idx,
      from,
      sec: from,
      lastX: e.clientX,
      acc: 0,
      lo: (starts[idx - 1] || 0) + 1,
      hi: starts[idx + 1] != null ? starts[idx + 1] - 1 : Math.max(from, duration - 1),
    };
    document.body.classList.add("rp-phase-dragging");
    paintPhaseDrag();
  }

  function onPhaseDragMove(e) {
    const d = phaseDrag;
    if (!d) return;
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    d.acc += dx * (e.shiftKey ? 0.25 : 1);
    d.acc = Math.max((d.lo - d.from) * zoom, Math.min((d.hi - d.from) * zoom, d.acc));
    const sec = Math.round(d.from + d.acc / zoom);
    if (sec !== d.sec) {
      d.sec = sec;
      paintPhaseDrag();
    }
  }

  function paintPhaseDrag() {
    const d = phaseDrag;
    if (!d) return;
    const diff = d.sec - d.from;
    const tip = `${fmtTime(d.sec)} (${diff >= 0 ? "+" : "−"}${fmtTime(Math.abs(diff))})`;
    document.querySelectorAll(`[data-phase-idx="${d.idx}"]`).forEach((el) => {
      el.style.left = `${timeX(d.sec)}px`;
      el.classList.add("dragging");
      const time = el.querySelector(".rp-phase-time");
      if (time) time.textContent = fmtTime(d.sec);
      const bubble = el.querySelector(".rp-phase-drag-tip");
      if (bubble) bubble.textContent = tip;
    });
    const inp = document.querySelector(`[data-rp='phase-input'][data-idx="${d.idx}"]`);
    if (inp) inp.value = fmtTime(d.sec);
  }

  function onPhaseDragUp() {
    const d = phaseDrag;
    if (!d) return;
    phaseDrag = null;
    document.body.classList.remove("rp-phase-dragging");
    if (d.sec !== d.from) setPhaseStartAt(d.idx, d.sec);
    else renderCd();
  }

  function applyAssignTime(assign, nextT) {
    const t = Math.round(Math.max(0, Math.min(duration, nextT)));
    assign.t = t;
    assign.ph = phaseSegmentFor(bossId, t);
    return t;
  }

  function onFinePointerDown(e) {
    if (e.button !== 0) return;
    const root = document.getElementById("plannerView");
    if (!root) return;
    const chip = e.target.closest("[data-rp='assign'][data-fine='1']");
    if (chip && root.contains(chip)) {
      const cell = chip.closest(".rp-cell.filled");
      if (!cell) return;
      e.preventDefault();
      e.stopPropagation();
      const assign = assignments.find((a) => a.id === chip.dataset.id);
      if (!assign) return;
      selectedAssignId = assign.id;
      fineDrag = {
        mode: "cell",
        id: assign.id,
        anchor: Number(cell.dataset.anchor) || 0,
        cell,
        chip,
        moved: false,
        startX: e.clientX,
      };
      chip.classList.add("dragging");
      chip.setPointerCapture?.(e.pointerId);
      return;
    }
    const mark = e.target.closest(".rp-tl-mark:not(.ghost)");
    if (!mark || !root.contains(mark)) return;
    const id = mark.querySelector("[data-rp='assign']")?.dataset.id;
    const assign = assignments.find((a) => a.id === id);
    const lane = mark.closest(".rp-track-lane");
    if (!assign || !lane) return;
    e.preventDefault();
    e.stopPropagation();
    selectedAssignId = assign.id;
    fineDrag = {
      mode: "timeline",
      id: assign.id,
      mark,
      lane,
      moved: false,
      startX: e.clientX,
    };
    mark.classList.add("dragging");
    document.body.classList.add("rp-tl-dragging");
    mark.setPointerCapture?.(e.pointerId);
  }

  function onFinePointerMove(e) {
    if (!fineDrag) return;
    if (Math.abs(e.clientX - fineDrag.startX) > 3) fineDrag.moved = true;
    const assign = assignments.find((a) => a.id === fineDrag.id);
    if (!assign) return;

    if (fineDrag.mode === "timeline") {
      const { lane, mark } = fineDrag;
      const rect = lane.getBoundingClientRect();
      if (rect.width <= 0) return;
      const nextT = applyAssignTime(
        assign,
        (e.clientX - rect.left - timelinePad()) / zoom
      );
      mark.style.left = `${timeX(nextT)}px`;
      const timeEl = mark.querySelector(".rp-tl-time");
      if (timeEl) timeEl.textContent = fmtTime(nextT);
      mark.title = `${phaseRelLabel(nextT, assign.ph)} (${fmtTime(nextT)})`;
      return;
    }

    const { cell, chip, anchor } = fineDrag;
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0) return;
    const chipW = chip.offsetWidth || 26;
    const usable = Math.max(1, rect.width - chipW);
    const leftPx = Math.max(0, Math.min(usable, e.clientX - rect.left - chipW / 2));
    const { lo, span } = fineRange(anchor);
    const nextT = applyAssignTime(assign, lo + (leftPx / usable) * span);
    const t = fineChipTimeRatio(assign, anchor);
    chip.style.setProperty("--fine-t", String(t));
    chip.style.left = `calc(var(--fine-t) * (100% - var(--fine-chip)))`;
    const timeEl = cell.querySelector(".rp-fine-time");
    if (timeEl) timeEl.textContent = fmtTime(nextT);
    chip.title = `${assignLabel(assign)} · ${fmtTime(nextT)}`;
  }

  function onFinePointerUp() {
    if (!fineDrag) return;
    const { chip, mark, id, moved, cell } = fineDrag;
    chip?.classList.remove("dragging");
    mark?.classList.remove("dragging");
    cell?.classList.remove("fine-bad");
    document.body.classList.remove("rp-tl-dragging");
    fineDrag = null;
    if (moved) suppressAssignClickUntil = Date.now() + 350;
    selectedAssignId = id;
    renderCd();
    saveState();
  }

  function laneHoverTip() {
    let tip = document.getElementById("rpLaneTip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "rpLaneTip";
      tip.className = "rp-lane-tip";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function hideLaneHover() {
    document.getElementById("rpLaneTip")?.classList.remove("on");
    document.querySelectorAll(".rp-lane-ghost").forEach((g) => g.remove());
    document.querySelectorAll(".rp-boss-mark.hit").forEach((m) => m.classList.remove("hit"));
    laneHoverKey = "";
  }

  const LANE_HOVER_WINDOW = 10;

  /** 타임라인 스킬 줄 위에 커서를 올리면: 커서 ±10초 안의 보스 스킬을 커서 위 작은 바로 */
  function onLaneHover(e) {
    if (fineDrag) return;
    if (e.target.closest?.(".rp-tl-mark, .rp-boss-mark, .rp-assign")) {
      hideLaneHover();
      return;
    }
    const lane = e.target.closest?.(".rp-track-lane[data-rp='lane']");
    if (!lane) {
      if (laneHoverKey) hideLaneHover();
      return;
    }
    const rect = lane.getBoundingClientRect();
    const sec = Math.round(Math.max(0, Math.min(duration, (e.clientX - rect.left - timelinePad()) / zoom)));
    const start = Math.max(0, sec - LANE_HOVER_WINDOW);
    const end = sec + LANE_HOVER_WINDOW;
    const tip = laneHoverTip();
    const key = `${lane.dataset.spell}|${lane.dataset.player}|${sec}`;
    if (key !== laneHoverKey || !lane.querySelector(".rp-lane-ghost")) {
      hideLaneHover();
      laneHoverKey = key;
      const boss = currentBoss();
      const majorIds = new Set((boss?.majorSpellIds || []).map(Number));
      const skills = planSkillEvents(boss?.events || []).filter(
        (ev) => ev.id !== "fight-end" && (!timelineVisibleBossKeys || timelineVisibleBossKeys.has(bossRowKey(ev)))
      );
      const hits = skills
        .filter((ev) => {
          const s = Number(ev.t) || 0;
          return s >= start && s <= end;
        })
        .sort((a, b) => a.t - b.t);
      const chip = (ev) => {
        const name = langRef() === "ko" ? ev.nameKo || ev.name : ev.name;
        const ico = eventIconUrl(ev);
        const major = ev.major === true || majorIds.has(Number(ev.spellId));
        const diff = Math.round(Number(ev.t) - sec);
        const rel = diff === 0 ? "±0" : diff > 0 ? `+${diff}` : `${diff}`;
        return `<span class="${major ? "major" : ""}">${ico ? `<img src="${escapeAttr(ico)}" alt="">` : ""}${escapeAttr(
          name
        )}<i>${fmtTime(ev.t)} (${rel}${t("초", "s")})</i></span>`;
      };
      const head = `<b>${fmtTime(sec)}</b><em>±${LANE_HOVER_WINDOW}${t("초", "s")}</em>`;
      const body = hits.length
        ? hits.map(chip).join("")
        : `<span class="none">${t("겹치는 스킬 없음", "No overlap")}</span>`;
      tip.innerHTML = `<div class="rp-lane-tip-head">${head}</div><div class="rp-lane-tip-list">${body}</div>`;
      tip.classList.add("on");
      const ghost = document.createElement("div");
      ghost.className = `rp-lane-ghost ${hits.length ? "hit" : ""}`;
      ghost.style.left = `${timeX(start)}px`;
      ghost.style.width = `${Math.max(2, (end - start) * zoom)}px`;
      ghost.style.setProperty("--cursor", `${(sec - start) * zoom}px`);
      lane.appendChild(ghost);
      document.querySelectorAll(".rp-boss-mark[data-t]").forEach((m) => {
        const mt = Number(m.dataset.t);
        if (mt >= start && mt <= end) m.classList.add("hit");
      });
    }
    const w = tip.offsetWidth || 0;
    const x = Math.max(w / 2 + 6, Math.min(window.innerWidth - w / 2 - 6, e.clientX));
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max((tip.offsetHeight || 0) + 6, rect.top - 6)}px`;
  }

  function removeAssignment(id) {
    if (!id) return;
    assignments = assignments.filter((a) => a.id !== id);
    if (selectedAssignId === id) selectedAssignId = null;
    renderCd();
    saveState();
  }

  function onContextMenu(e) {
    const btn = e.target.closest("[data-rp]");
    if (!btn) return;
    const act = btn.dataset.rp;
    const id = btn.dataset.id;
    if (act === "assign" || act === "ghost") {
      e.preventDefault();
      removeAssignment(id);
      return;
    }
    if (act === "assign-cell") {
      const cell = btn.classList.contains("rp-cell") ? btn : btn.closest(".rp-cell");
      if (!cell || cell.classList.contains("blocked")) return;
      const chip = e.target.closest("[data-rp='assign']");
      if (chip?.dataset.id) {
        e.preventDefault();
        removeAssignment(chip.dataset.id);
        return;
      }
      if (!cell.classList.contains("filled")) return;
      const sp = spellById(cell.dataset.spell);
      const player = activeRoster().find((m) => m.playerId === cell.dataset.player);
      const ev = planEvents(currentBoss()?.events || []).find((x) => x.id === cell.dataset.event) || {
        id: cell.dataset.event,
        t: Number(cell.dataset.t) || 0,
      };
      if (!sp || !player) return;
      const here = assignmentsForCell(sp, player, ev);
      if (!here.length) return;
      e.preventDefault();
      here.forEach((a) => {
        assignments = assignments.filter((x) => x.id !== a.id);
        if (selectedAssignId === a.id) selectedAssignId = null;
      });
      renderCd();
      saveState();
      return;
    }
    if (act === "lane" || act === "block") {
      const assign = e.target.closest("[data-rp='assign']");
      if (assign?.dataset.id) {
        e.preventDefault();
        removeAssignment(assign.dataset.id);
      }
    }
  }

  function onClick(e) {
    const btn = e.target.closest("[data-rp]");
    if (!btn) return;
    const act = btn.dataset.rp;
    const id = btn.dataset.id;
    if (act === "share-close") {
      shareModal = null;
      renderBoardChrome();
      return;
    }
    if (act === "share-copy") {
      if (!shareModal?.url) return;
      copyText(shareModal.url).then((ok) => {
        if (!shareModal) return;
        shareModal.copied = ok;
        renderBoardChrome();
      });
      return;
    }
    if (act === "board-share") {
      createBoardShare();
      return;
    }
    if (shareReadonly) {
      const allowed = new Set(["tool-board", "boss-pick", "step", "share-close", "share-copy"]);
      if (!allowed.has(act)) return;
    }
    if (act === "tool-cd") {
      tool = "cd";
      requestFitZoom();
      render(true);
      document.getElementById("plannerView")?.scrollIntoView({ block: "start" });
      return;
    }
    if (act === "tool-board") {
      tool = "board";
      render(true);
      document.getElementById("plannerView")?.scrollIntoView({ block: "start" });
      return;
    }
    if (act === "import-helper") {
      if (!rosterOpen) openRosterModal();
      enterTempFromHelper().then((ok) => {
        if (!ok) {
          window.alert(t("구인 도우미에 전문화가 없습니다. 먼저 공대를 짜거나 데모 로스터를 쓰세요.", "Helper roster is empty. Build one first, or use the demo roster."));
        }
        render(true);
        saveState();
      });
      return;
    }
    if (act === "demo-roster") {
      buildDemoRoster();
      render(true);
      saveState();
      return;
    }
    if (act === "roster-cap") {
      setRosterCap(activeCap() + (Number(btn.dataset.delta) || 0));
      render(true);
      return;
    }
    if (act === "raid-login") {
      global.RaidAuth?.previewLogin?.();
      return;
    }
    if (act === "raid-save") {
      saveActiveRoster().then(() => {
        renderCd();
        saveState();
      });
      return;
    }
    if (act === "raid-save-new") {
      createBlankRaid();
      return;
    }
    if (act === "raid-duplicate") {
      duplicateRaid();
      return;
    }
    if (act === "raid-rename") {
      renameActiveRaid();
      return;
    }
    if (act === "raid-delete") {
      if (!isSavedRaidId(activeRaidId)) return;
      const nm = activeRaidName() || t("이 공대", "this raid");
      if (!window.confirm(t(`"${nm}" 을(를) 삭제할까요? 쿨기·오더도 같이 지워집니다.`, `Delete "${nm}"? Cooldown plans and order boards will be removed.`))) return;
      const id = activeRaidId;
      global.RaidStore.remove(id).then(() => {
        if (activeRaidId === id) activeRaidId = null;
        refreshSavedRaids().then(() => {
          renderCd();
          saveState();
        });
      });
      return;
    }
    if (act === "zoom-in") {
      zoom = clampZoom(zoom + 0.5);
      renderCd();
      saveState();
      return;
    }
    if (act === "zoom-out") {
      zoom = clampZoom(zoom - 0.5);
      renderCd();
      saveState();
      return;
    }
    if (act === "boss-rows-toggle") {
      setBossRowsMode(bossRowsMode === "major" ? "all" : "major");
      skillFilterOpen = null;
      renderCd();
      return;
    }
    if (act === "boss-rows-custom") {
      const scope = `boss:${currentBoss()?.id || ""}`;
      if (bossRowsMode !== "custom") {
        setBossRowsMode("custom");
        skillFilterOpen = scope;
      } else {
        skillFilterOpen = skillFilterOpen ? null : scope;
      }
      renderCd();
      return;
    }
    if (act === "boss-rows-all") {
      setBossRowsMode("all");
      skillFilterOpen = null;
      renderCd();
      return;
    }
    if (act === "skill-filter-close") {
      skillFilterOpen = null;
      renderCd();
      return;
    }
    if (act === "skill-filter-bulk") {
      const scope = btn.dataset.scope;
      const items = skillFilterItems(scope);
      const mode = btn.dataset.mode;
      const keys = mode === "all" ? items.map((it) => it.key) : mode === "major" ? items.filter((it) => it.major).map((it) => it.key) : [];
      skillFilterSet(scope, keys);
      renderCd();
      return;
    }
    if (act === "zoom-fit") {
      fitZoom();
      renderCd();
      saveState();
      return;
    }
    if (act === "toggle-cat") {
      collapsedCats[id] = !collapsedCats[id];
      renderCd();
      saveState();
      return;
    }
    if (act === "roster-close-save") {
      rosterClosePrompt = false;
      saveActiveRoster().then(() => {
        finishCloseRosterModal();
        renderCd();
        saveState();
      });
      return;
    }
    if (act === "roster-close-discard") {
      rosterClosePrompt = false;
      discardRosterEdit();
      finishCloseRosterModal();
      renderCd();
      saveState();
      return;
    }
    if (act === "roster-close-cancel" || act === "roster-close-backdrop") {
      if (act === "roster-close-backdrop" && e.target.dataset.rp !== "roster-close-backdrop") return;
      rosterClosePrompt = false;
      renderCd();
      return;
    }
    if (act === "toggle-roster") {
      if (rosterOpen) {
        requestCloseRoster();
        return;
      }
      openRosterModal();
      renderCd();
      refreshSavedRaids().then(() => {
        renderCd();
        saveState();
      });
      return;
    }
    if (act === "add-spec") {
      addSpecToRoster(btn.dataset.class, btn.dataset.spec);
      renderCd();
      saveState();
      return;
    }
    if (act === "to-bench") {
      e.stopPropagation();
      moveMemberToBench(id);
      renderCd();
      saveState();
      return;
    }
    if (act === "to-active") {
      e.stopPropagation();
      moveMemberToActive(id);
      renderCd();
      saveState();
      return;
    }
    if (act === "remove-member") {
      e.stopPropagation();
      removeMember(id);
      renderCd();
      saveState();
      return;
    }
    if (act === "roster-backdrop") {
      if (e.target.dataset.rp === "roster-backdrop") requestCloseRoster();
      return;
    }
    if (act === "roster-trash") return;
    if (act === "nick") return;
    if (act === "spell") {
      selectedSpellId = selectedSpellId === id ? null : id;
      renderCd();
      return;
    }
    if (act === "plan-page") {
      setPlanPage(Number(btn.dataset.id));
      return;
    }
    if (act === "diff-pick") {
      setDifficulty(btn.dataset.d);
      return;
    }
    if (act === "boss-pick") {
      const next = btn.dataset.id;
      if (!next || next === bossId) return;
      bossId = next;
      syncBossAssignments();
      const boss = currentBoss();
      duration = boss?.duration || duration;
      requestFitZoom();
      render(true);
      return;
    }
    if (act === "board-map") {
      boardMapId = id || null;
      renderBoardChrome();
      drawBoard();
      saveState();
      return;
    }
    if (act === "player") {
      if (e.target.closest("input,textarea,select,button")) return;
      const inRosterPop = !!btn.closest(".rp-roster-modal");
      if (inRosterPop) {
        selectedPlayerId = id;
        rosterEditId = id;
        renderCd();
        saveState();
        return;
      }
      selectedPlayerId = selectedPlayerId === id ? null : id;
      if (tool === "cd") renderCd();
      else {
        stamp = selectedPlayerId ? { kind: "player", id: selectedPlayerId } : null;
        if (selectedPlayerId) setBoardTool("token");
        else renderBoardChrome();
      }
      return;
    }
    if (act === "member-edit-backdrop") {
      if (e.target.dataset.rp === "member-edit-backdrop") {
        rosterEditId = null;
        renderCd();
      }
      return;
    }
    if (act === "close-member-edit") {
      rosterEditId = null;
      renderCd();
      return;
    }
    if (act === "save-member-edit") {
      saveMemberEdit(id, btn.closest(".rp-member-edit"));
      return;
    }
    if (act === "edit-nick" || act === "edit-server") return;
    if (act === "palette-tab") {
      paletteTab = id;
      renderBoardChrome();
      return;
    }
    if (act === "stamp") {
      const kind = btn.dataset.kind;
      if (stamp?.kind === kind && stamp?.id === id) {
        stamp = null;
        if (kind === "player") selectedPlayerId = null;
        renderBoardChrome();
      } else {
        stamp = { kind, id };
        if (kind === "player") selectedPlayerId = id;
        setBoardTool("token");
      }
      return;
    }
    if (act === "assign-cell") {
      if (btn.classList.contains("filled")) return;
      let placeT = btn.dataset.placeT != null && btn.dataset.placeT !== "" ? +btn.dataset.placeT : +btn.dataset.t;
      if (btn.classList.contains("partial") && btn.dataset.anchor != null) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0) {
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const { lo, span } = fineRange(+btn.dataset.anchor);
          const clickT = Math.round(lo + ratio * span);
          placeT = Math.max(lo, Math.min(lo + span, clickT));
        }
      }
      placeAt(placeT, btn.dataset.event || null, btn.dataset.spell || null, btn.dataset.player || null);
      return;
    }
    if (act === "lane") {
      if (Date.now() < suppressAssignClickUntil) return;
      const rect = btn.getBoundingClientRect();
      const time = Math.max(0, Math.min(duration, (e.clientX - rect.left - timelinePad()) / zoom));
      placeAt(time, null, btn.dataset.spell || null, btn.dataset.player || null);
      return;
    }
    if (act === "assign") {
      if (Date.now() < suppressAssignClickUntil) return;
      selectedAssignId = id;
      renderCd();
      saveState();
      return;
    }
    if (act === "clear-assigns") {
      if (window.confirm(t("이 보스의 쿨기 배치를 모두 지울까요?", "Clear all cooldown assignments for this boss?"))) {
        assignments = [];
        selectedAssignId = null;
        renderCd();
        saveState();
      }
      return;
    }
    if (act === "wcl-player") {
      const player = activeRoster().find((m) => m.playerId === btn.dataset.player);
      if (player) openWclPick(player, btn.getBoundingClientRect());
      return;
    }
    if (act === "nsrt-export") {
      nsrtExport();
      return;
    }
    if (act === "nsrt-copy") {
      copyText(buildNsrtNote().text).then((ok) => {
        if (!nsrtModal) return;
        nsrtModal.copied = ok;
        renderCd();
      });
      return;
    }
    if (act === "nsrt-close") {
      nsrtModal = null;
      renderCd();
      return;
    }
    if (act === "wcl-pick-close") {
      wclPick = null;
      renderCd();
      return;
    }
    if (act === "wcl-pick-apply") {
      applyWclPick(Number(btn.dataset.rank) || 1);
      return;
    }
    if (act === "wcl-apply-all") {
      if (wclLoading) return;
      wclApplyAllTop();
      return;
    }
    if (act === "phase-sync") {
      phaseSync();
      return;
    }
    if (act === "phase-reset") {
      setPhaseStarts(bossId, null);
      render(true);
      return;
    }
    if (act === "board-tool") {
      setBoardTool(id);
      return;
    }
    if (act === "board-color") {
      boardColor = id;
      renderBoardChrome();
      saveState();
      return;
    }
    if (act === "step") {
      stepId = id;
      selectedObjIds.clear();
      renderBoardChrome();
      drawBoard();
      saveState();
      return;
    }
    if (act === "add-step") {
      const step = { id: uid("step"), name: t(`스텝 ${steps.length + 1}`, `Step ${steps.length + 1}`), notes: "", objects: [] };
      steps.push(step);
      stepId = step.id;
      renderBoardChrome();
      drawBoard();
      saveState();
      return;
    }
    if (act === "del-step") {
      if (steps.length <= 1) return;
      steps = steps.filter((s) => s.id !== id);
      if (stepId === id) stepId = steps[0].id;
      renderBoardChrome();
      drawBoard();
      saveState();
      return;
    }
    if (act === "undo") {
      undo();
      return;
    }
    if (act === "redo") {
      redo();
      return;
    }
    if (act === "clear-step") {
      pushUndo();
      currentStep().objects = [];
      selectedObjIds.clear();
      drawBoard();
      saveState();
      return;
    }
  }

  function onChange(e) {
    const filterItem = e.target.closest?.("[data-rp='skill-filter-item']");
    if (filterItem) {
      const scope = filterItem.dataset.scope;
      const items = skillFilterItems(scope);
      const set = skillFilterGet(scope, items.filter((it) => it.major).map((it) => it.key));
      if (filterItem.checked) set.add(filterItem.dataset.key);
      else set.delete(filterItem.dataset.key);
      skillFilterSet(scope, set);
      renderCd();
      return;
    }
    const phaseInp = e.target.closest?.("[data-rp='phase-input']");
    if (phaseInp) {
      const sec = parseTimeInput(phaseInp.value);
      if (sec == null) {
        render(true);
        return;
      }
      setPhaseStartAt(Number(phaseInp.dataset.idx), sec);
      return;
    }

    if (e.target.id === "rpBoss") {
      bossId = e.target.value;
      syncBossAssignments();
      const boss = currentBoss();
      duration = boss?.duration || duration;
      requestFitZoom();
      render(true);
      return;
    }
    if (e.target.dataset.rp === "raid-pick") {
      const id = e.target.value;
      if (!id) return;
      loadSavedRaid(id);
      return;
    }
    if (e.target.dataset.rp === "roster-cap-input") {
      setRosterCap(e.target.value);
      render(true);
      return;
    }
    if (e.target.dataset.rp === "server") {
      const member = findRosterMember(e.target.dataset.id);
      if (member) {
        member.server = normalizeRealm(e.target.value);
        if (rosterOpen) rosterDirty = true;
      }
      if (!rosterOpen) saveState();
    }
  }

  function onInput(e) {
    if (shareReadonly) return;
    if (e.target.id === "rpNotes") {
      const step = currentStep();
      if (step) step.notes = e.target.value;
      saveState();
      return;
    }
    if (e.target.dataset.rp === "step-name") {
      const step = steps.find((s) => s.id === e.target.dataset.id);
      if (step) step.name = e.target.value;
      saveState();
      return;
    }
    if (e.target.dataset.rp === "nick") {
      const member = findRosterMember(e.target.dataset.id);
      if (member) {
        member.nick = e.target.value;
        if (rosterOpen) rosterDirty = true;
      }
      const call = playerCallsign(member);
      e.target.title = call;
      if (!rosterOpen) {
        document.querySelectorAll(`tr[data-player="${e.target.dataset.id}"] .rp-who`).forEach((who) => {
          who.textContent = call;
        });
        document.querySelectorAll(`.rp-track-lane[data-player="${e.target.dataset.id}"]`).forEach((lane) => {
          const who = lane.closest(".rp-track")?.querySelector(".rp-who");
          if (who) who.textContent = call;
        });
        refreshAssignLabels();
        saveState();
      }
    }
  }

  function refreshAssignLabels() {
    document.querySelectorAll("[data-rp='assign']").forEach((el) => {
      const a = assignments.find((x) => x.id === el.dataset.id);
      if (!a) return;
      const label = assignLabel(a);
      const b = el.querySelector("b");
      if (b) b.textContent = label;
      el.title = label;
    });
  }

  function saveMemberEdit(playerId, box) {
    const root = box || document.querySelector(".rp-member-edit");
    const nickEl = root?.querySelector("[data-rp='edit-nick']");
    const serverEl = root?.querySelector("[data-rp='edit-server']");
    const member = findRosterMember(playerId || rosterEditId);
    if (member) {
      member.nick = nickEl ? nickEl.value : member.nick;
      member.server = normalizeRealm(serverEl?.value || member.server);
      if (rosterOpen) rosterDirty = true;
    }
    rosterEditId = null;
    renderCd();
    saveState();
  }

  function onKey(e) {
    const root = document.getElementById("plannerView");
    if (!root || root.classList.contains("hidden")) return;
    if (e.key === "Escape" && rosterEditId) {
      rosterEditId = null;
      renderCd();
      return;
    }
    if (e.key === "Enter" && rosterEditId) {
      const edit = e.target?.closest?.(".rp-member-edit");
      if (edit && (e.target.dataset?.rp === "edit-nick" || e.target.dataset?.rp === "edit-server")) {
        e.preventDefault();
        saveMemberEdit(e.target.dataset.id || rosterEditId, edit);
        return;
      }
    }
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;

    if (shareReadonly) {
      if (tool !== "board") return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const i = Math.max(0, steps.findIndex((s) => s.id === stepId));
        const next = steps[Math.min(steps.length - 1, i + 1)];
        if (next && next.id !== stepId) {
          stepId = next.id;
          renderBoardChrome();
          drawBoard();
        }
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const i = Math.max(0, steps.findIndex((s) => s.id === stepId));
        const prev = steps[Math.max(0, i - 1)];
        if (prev && prev.id !== stepId) {
          stepId = prev.id;
          renderBoardChrome();
          drawBoard();
        }
      }
      return;
    }

    if (tool === "cd") {
      if (e.key === "Escape") {
        if (rosterOpen) {
          e.preventDefault();
          if (rosterClosePrompt) {
            rosterClosePrompt = false;
            renderCd();
            return;
          }
          requestCloseRoster();
          return;
        }
        selectedSpellId = null;
        selectedPlayerId = null;
        selectedAssignId = null;
        renderCd();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAssignId) {
        assignments = assignments.filter((a) => a.id !== selectedAssignId);
        selectedAssignId = null;
        renderCd();
        saveState();
      }
      return;
    }

    if (e.key === "Enter") {
      const textObj = selectedSingleText();
      if (textObj) {
        e.preventDefault();
        beginTextEditor(textObj, { focus: true, selectAll: true });
        return;
      }
    }

    if (e.ctrlKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      redo();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "c") {
      e.preventDefault();
      copySelection();
      return;
    }
    if (mod && key === "x") {
      e.preventDefault();
      cutSelection();
      return;
    }
    if (mod && key === "v") {
      e.preventDefault();
      pasteClipboard();
      return;
    }
    // Z/X: 팔레트 다음/이전 스탬프 (Ctrl+Z 실행취소와 구분)
    if (!mod && !e.altKey && (key === "z" || key === "x")) {
      e.preventDefault();
      cyclePaletteStamp(key === "z" ? -1 : 1);
      return;
    }
    // 왼손 배치: V select, E eraser, B pen, A arrow, W line, R rect, D circle, C cone, F text
    const map = { v: "select", e: "eraser", b: "pen", a: "arrow", w: "line", r: "rect", d: "circle", c: "cone", f: "text" };
    if (map[key]) {
      setBoardTool(map[key]);
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedObjIds.size) {
      pushUndo();
      const step = currentStep();
      step.objects = step.objects.filter((o) => !selectedObjIds.has(o.id));
      if (handlePreviewId && selectedObjIds.has(handlePreviewId)) handlePreviewId = null;
      selectedObjIds.clear();
      drawBoard();
      saveState();
    }
  }

  function copySelection() {
    const objs = currentStep()?.objects || [];
    clipboardObjs = objs
      .filter((o) => selectedObjIds.has(o.id))
      .map((o) => JSON.parse(JSON.stringify(o)));
    pasteCount = 0;
  }

  function cutSelection() {
    if (!selectedObjIds.size) return;
    copySelection();
    pushUndo();
    const step = currentStep();
    step.objects = step.objects.filter((o) => !selectedObjIds.has(o.id));
    selectedObjIds.clear();
    drawBoard();
    saveState();
  }

  function pasteClipboard() {
    if (!clipboardObjs.length) return;
    pushUndo();
    pasteCount += 1;
    const offset = 16 * pasteCount;
    const created = clipboardObjs.map((src) => {
      const o = JSON.parse(JSON.stringify(src));
      o.id = uid("obj");
      if (o.type === "arrow" || o.type === "line") {
        o.x1 += offset;
        o.y1 += offset;
        o.x2 += offset;
        o.y2 += offset;
      } else if (o.type === "pen" && Array.isArray(o.points)) {
        o.points.forEach((pt) => {
          pt.x += offset;
          pt.y += offset;
        });
      } else {
        o.x = (o.x ?? 0) + offset;
        o.y = (o.y ?? 0) + offset;
      }
      return o;
    });
    currentStep().objects.push(...created);
    selectedObjIds = new Set(created.map((o) => o.id));
    boardTool = "select";
    renderBoardChrome();
    updateBoardCursor();
    drawBoard();
    saveState();
  }

  function setBoardTool(id) {
    boardTool = id;
    if (id !== "select" && selectedObjIds.size) {
      selectedObjIds.clear();
      drawBoard();
    }
    if (id !== "token") handlePreviewId = null;
    renderBoardChrome();
    updateBoardCursor();
  }

  function updateBoardCursor(overObj) {
    const canvas = document.getElementById("rpCanvas");
    if (!canvas) return;
    if (shareReadonly) {
      canvas.style.cursor = "default";
      return;
    }
    let cur = "crosshair";
    if (erasing || boardTool === "eraser") {
      cur = "cell";
    } else if (boardTool === "select") {
      if (dragging?.mode === "rotate") cur = "grab";
      else if (dragging?.mode === "resize") cur = "nwse-resize";
      else if (dragging) cur = "grabbing";
      else if (marquee) cur = "crosshair";
      else if (overObj === "rotate") cur = "grab";
      else if (overObj === "resize") cur = "nwse-resize";
      else if (overObj) cur = "move";
      else cur = "default";
    } else if (boardTool === "text") {
      cur = "text";
    } else if (boardTool === "token") {
      if (dragging?.mode === "rotate" || overObj === "rotate") cur = "grab";
      else if (dragging?.mode === "resize" || overObj === "resize") cur = "nwse-resize";
      else cur = "copy";
    } else if (boardTool === "pen") {
      cur = "crosshair";
    }
    canvas.style.cursor = cur;
  }

  function paletteStampList() {
    const assets = global.BoardAssets;
    if (paletteTab === "roster") {
      return sortedRoster(activeRoster()).map((m) => ({ kind: "player", id: m.playerId }));
    }
    if (paletteTab === "elements") {
      const els =
        assets?.generalElements?.() ||
        [
          { id: "mark-star" },
          { id: "mark-circle" },
          { id: "mark-diamond" },
          { id: "mark-triangle" },
          { id: "mark-moon" },
          { id: "mark-square" },
          { id: "mark-cross" },
          { id: "mark-skull" },
          { id: "role-tank" },
          { id: "role-heal" },
          { id: "role-melee" },
          { id: "role-ranged" },
        ];
      return els.map((el) => ({ kind: "element", id: el.id }));
    }
    return (assets?.bossUnits?.(bossId) || []).map((u) => ({ kind: "boss", id: u.id }));
  }

  function selectPaletteStamp(kind, id) {
    stamp = { kind, id };
    if (kind === "player") selectedPlayerId = id;
    setBoardTool("token");
    requestAnimationFrame(() => {
      const el = document.querySelector(`#rpPalette [data-rp="stamp"][data-kind="${kind}"][data-id="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function cyclePaletteStamp(dir) {
    const list = paletteStampList();
    if (!list.length) return;
    const idx = list.findIndex((s) => stamp && s.kind === stamp.kind && s.id === stamp.id);
    let next;
    if (idx < 0) {
      // 팔레트 미선택: Z → 마지막(이전), X → 첫 항목(다음)
      next = list[dir > 0 ? 0 : list.length - 1];
    } else {
      next = list[(idx + dir + list.length) % list.length];
    }
    selectPaletteStamp(next.kind, next.id);
  }

  function placeAt(time, eventId, spellId, playerId) {
    const spell = spellId ? spellById(spellId) : currentSpell();
    if (!spell) {
      window.alert(t("스킬 줄을 클릭하세요.", "Click a spell row."));
      return;
    }
    selectedSpellId = spell.id;
    const roster = activeRoster();
    let player = null;
    if (playerId) {
      player = roster.find((m) => m.playerId === playerId) || null;
      if (!player) return;
    } else {
      player = roster.find((m) => m.playerId === selectedPlayerId);
      if (player && !memberProvides(player, spell)) {
        window.alert(t("이 플레이어는 해당 스킬을 쓸 수 없습니다.", "That player cannot provide this spell."));
        return;
      }
      if (!player) player = providersFor(spell)[0] || null;
    }
    if (!player) {
      window.alert(t("이 스킬을 쓸 사람이 로스터에 없습니다.", "Nobody on the roster can provide this spell."));
      return;
    }
    const conflict = cooldownConflict(spell, player.playerId, time);
    if (conflict?.type === "used") return;
    assignments.push({
      id: uid("as"),
      spellId: spell.id,
      playerId: player.playerId,
      t: time,
      ph: phaseSegmentFor(bossId, time),
      eventId: eventId || null,
    });
    selectedAssignId = assignments[assignments.length - 1].id;
    renderCd();
    saveState();
  }

  function render(force) {
    const root = document.getElementById("plannerView");
    if (!root) return;
    ensureShell(false);
    $("#rpTitle", root).textContent = shareReadonly
      ? t("오더 그림판 · 열람", "Order Board · View")
      : t("레이드 플래너", "Raid Planner");
    $("#rpSub", root).textContent = shareReadonly
      ? shareInfo?.error
        ? shareInfo.error
        : shareInfo?.loading
          ? t("공유 보드를 불러오는 중…", "Loading shared board…")
          : [shareInfo?.title, shareInfo?.author ? t(`${shareInfo.author} 공유`, `Shared by ${shareInfo.author}`) : ""]
              .filter(Boolean)
              .join(" · ")
      : "";
    root.querySelector(".rp-shell")?.classList.toggle("rp-share-view", shareReadonly);
    if (shareReadonly) tool = "board";
    $("#rpBossLbl", root).textContent = t("보스", "Boss");
    const raid = catalog().raid;
    const raidLabel = raid
      ? langRef() === "ko"
        ? `${raid.nameKo} (${raid.patch})`
        : `${raid.name} (${raid.patch})`
      : catalog().source;
    $("#rpBanner", root).textContent = raidLabel || "";
    $("#rpTabCd", root).textContent = t("공대 쿨기 짜기", "Cooldown Plan");
    $("#rpTabBoard", root).textContent = t("오더 그림판", "Order Board");
    $("#rpTabCd", root).classList.toggle("on", tool === "cd");
    $("#rpTabBoard", root).classList.toggle("on", tool === "board");
    $("#rpTabCd", root).classList.toggle("hidden", shareReadonly);
    $("#rpTabCd", root).disabled = shareReadonly;

    const bossSel = $("#rpBoss", root);
    const prev = bossSel.value;
    const bosses = [...(catalog().bosses || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    bossSel.innerHTML = bosses
      .map((b) => {
        const label = langRef() === "ko" ? b.nameKo : b.name;
        const num = b.order ? `${b.order}. ` : "";
        return `<option value="${b.id}">${num}${label}</option>`;
      })
      .join("");
    if (!bosses.some((b) => b.id === bossId)) bossId = bosses[0]?.id || bossId;
    bossSel.value = bosses.some((b) => b.id === bossId) ? bossId : bosses[0]?.id;
    if (bossSel.value !== prev && prev) {
      /* keep */
    }
    bossId = bossSel.value;
    syncBossAssignments();
    const boss = currentBoss();
    if (boss) duration = boss.duration;

    const bossNameEl = $("#rpBossName", root);
    if (bossNameEl) {
      const n = boss ? (langRef() === "ko" ? boss.nameKo || boss.name : boss.name) : "";
      bossNameEl.textContent = boss?.order ? `${boss.order}. ${n}` : n;
    }

    const diffEl = $("#rpDiff", root);
    if (diffEl) {
      diffEl.hidden = shareReadonly;
      diffEl.innerHTML = `
        <button type="button" class="${wclDifficulty === 4 ? "on" : ""}" data-rp="diff-pick" data-d="4">${t("영웅", "Heroic")}</button>
        <button type="button" class="${wclDifficulty === 5 ? "on" : ""}" data-rp="diff-pick" data-d="5">${t("신화", "Mythic")}</button>`;
    }

    const picker = $("#rpBossPicker", root);
    if (picker) {
      picker.innerHTML = bosses
        .map((b) => {
          const label = langRef() === "ko" ? b.nameKo : b.name;
          const ico = bossPortraitUrl(b);
          const on = b.id === bossId ? "on" : "";
          return `<button type="button" class="rp-boss-tile ${on}" data-rp="boss-pick" data-id="${escapeAttr(b.id)}" title="${escapeAttr(
            `${b.order || ""}. ${label}`
          )}" aria-pressed="${on ? "true" : "false"}">
            <span class="rp-boss-tile-num">${b.order || "?"}</span>
            ${ico ? `<img src="${escapeAttr(ico)}" alt=""${b.iconUrl && b.iconUrl !== ico ? ` onerror="this.onerror=null;this.src='${escapeAttr(b.iconUrl)}'"` : ""}>` : `<span class="rp-boss-tile-fallback">${escapeAttr((label || "?").slice(0, 1))}</span>`}
          </button>`;
        })
        .join("");
    }

    if (shareReadonly) {
      $("#rpCd", root).classList.add("hidden");
      $("#rpBoard", root).classList.remove("hidden");
      document.querySelector(".app")?.classList.add("rp-fit-board");
      window.scrollTo(0, 0);
      renderBoard(force);
      return;
    }
    $("#rpCd", root).classList.toggle("hidden", tool !== "cd");
    $("#rpBoard", root).classList.toggle("hidden", tool !== "board");
    document.querySelector(".app")?.classList.toggle("rp-fit-board", tool === "board");
    if (tool === "board") window.scrollTo(0, 0);
    if (tool === "cd") renderCd();
    else renderBoard(force);
    saveState();
  }

  function rosterCounts(roster) {
    const counts = { Tank: 0, Melee: 0, Ranged: 0, Heal: 0 };
    (roster || []).forEach((m) => {
      if (counts[m.role] != null) counts[m.role] += 1;
    });
    return counts;
  }

  function onRosterDragStart(e) {
    const slot = e.target.closest(".rp-roster-slot[draggable='true']");
    if (!slot || !document.getElementById("plannerView")?.contains(slot)) return;
    if (e.target.closest("input,select,button,textarea")) {
      e.preventDefault();
      return;
    }
    rosterDrag = { id: slot.dataset.id, from: slot.dataset.from || "active" };
    slot.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", slot.dataset.id || "");
  }

  function onRosterDragOver(e) {
    if (!rosterDrag) return;
    const zone = e.target.closest("[data-drop]");
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    zone.classList.add("drag-over");
  }

  function onRosterDragLeave(e) {
    const zone = e.target.closest("[data-drop]");
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  }

  function onRosterDrop(e) {
    const zone = e.target.closest("[data-drop]");
    if (!zone || !rosterDrag) return;
    e.preventDefault();
    zone.classList.remove("drag-over");
    const { id, from } = rosterDrag;
    const drop = zone.dataset.drop;
    if (drop === "trash") removeMember(id);
    else if (drop === "bench" && from === "active") moveMemberToBench(id);
    else if (drop === "active" && from === "bench") moveMemberToActive(id);
    else if (drop === "active" && from === "active") {
      /* stay */
    } else if (drop === "bench" && from === "bench") {
      /* stay */
    }
    rosterDrag = null;
    renderCd();
    saveState();
  }

  function onRosterDragEnd(e) {
    e.target.closest?.(".rp-roster-slot")?.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    rosterDrag = null;
  }

  function memberHoverTitle(m) {
    if (!m) return "";
    const name = playerCallsign(m);
    const server = realmLabel(memberRealm(m));
    return `${name}-${server}`;
  }

  function renderMemberEditDialog() {
    if (!rosterEditId) return "";
    const m = findRosterMember(rosterEditId);
    if (!m) return "";
    const autoName = playerCallsign({ ...m, nick: "" });
    const accent = m.color || classColor(m.class);
    return `<div class="rp-member-edit-pop" data-rp="member-edit-backdrop">
      <div class="rp-member-edit panel" style="--class:${accent}" role="dialog" aria-modal="true">
        <div class="rp-member-edit-h">
          ${memberIconHtml(m)}
          <div>
            <b>${memberLabel(m)}</b>
          </div>
        </div>
        <label class="rp-member-edit-field">${t("닉네임", "Nickname")}
          <input class="rp-nick" data-rp="edit-nick" data-id="${m.playerId}" maxlength="16" placeholder="${escapeAttr(autoName)}" value="${escapeAttr(m.nick || "")}">
        </label>
        <label class="rp-member-edit-field">${t("서버", "Realm")}
          <select class="rp-server-edit" data-rp="edit-server" data-id="${m.playerId}">${realmOptionsHtml(memberRealm(m))}</select>
        </label>
        <div class="rp-member-edit-acts">
          <button type="button" class="ghost" data-rp="close-member-edit">${t("취소", "Cancel")}</button>
          <button type="button" class="primary" data-rp="save-member-edit" data-id="${m.playerId}">${t("저장", "Save")}</button>
        </div>
      </div>
    </div>`;
  }

  function renderRosterSlot(m, from) {
    const on = selectedPlayerId === m.playerId || rosterEditId === m.playerId;
    const call = playerCallsign(m);
    const tip = memberHoverTitle(m);
    return `<div class="rp-roster-slot ${on ? "on" : ""}" draggable="true" data-rp="player" data-id="${m.playerId}" data-from="${from}" style="--class:${m.color || classColor(m.class)}" title="${escapeAttr(tip)}">
      ${memberIconHtml(m)}
      <div class="rp-roster-slot-txt">
        <b class="rp-callsign">${escapeAttr(call)}</b>
        <em>${memberLabel(m)}</em>
      </div>
      <div class="rp-slot-acts">
        ${
          from === "active"
            ? `<button type="button" class="ghost" data-rp="to-bench" data-id="${m.playerId}" title="${t("미참", "Sit out")}">${t("미참", "Out")}</button>`
            : `<button type="button" class="ghost" data-rp="to-active" data-id="${m.playerId}" title="${t("선발", "Active")}">${t("선발", "In")}</button>`
        }
        <button type="button" class="danger" data-rp="remove-member" data-id="${m.playerId}" title="${t("삭제", "Remove")}">✕</button>
      </div>
    </div>`;
  }

  function renderSpecAddPanel() {
    const byClass = new Map();
    specs().forEach((sp) => {
      if (!byClass.has(sp.class)) byClass.set(sp.class, []);
      byClass.get(sp.class).push(sp);
    });
    const groups = [...byClass.entries()]
      .map(([cls, list]) => {
        const color = list[0]?.color || classColor(cls);
        const name = langRef() === "ko" ? list[0]?.classKo || cls : cls;
        const items = list
          .map((sp) => {
            const label = langRef() === "ko" ? sp.specKo : sp.spec;
            const url = global.BoardAssets?.specIconUrl?.(sp.class, sp.spec);
            const ico = url
              ? `<img src="${escapeAttr(url)}" alt="" loading="lazy">`
              : `<i>${escapeAttr(label.slice(0, 1))}</i>`;
            return `<button type="button" class="rp-add-spec" data-rp="add-spec" data-class="${escapeAttr(sp.class)}" data-spec="${escapeAttr(sp.spec)}" style="--class:${color}" title="${escapeAttr(name + " · " + label)}">
              <span class="rp-add-spec-ico">${ico}</span>
              <span>${label}</span>
            </button>`;
          })
          .join("");
        return `<div class="rp-add-class">
          <div class="rp-add-class-h" style="--class:${color}">${name}</div>
          <div class="rp-add-specs">${items}</div>
        </div>`;
      })
      .join("");
    return `<aside class="rp-roster-add">
      <div class="rp-roster-add-h">
        <h4>${t("전문화 추가", "Add spec")}</h4>
      </div>
      <div class="rp-roster-add-list">${groups}</div>
    </aside>`;
  }

  function renderRosterSide(roster) {
    const counts = rosterCounts(roster);
    const dpsN = counts.Melee + counts.Ranged;
    const roles = ["Tank", "Melee", "Ranged", "Heal"];

    if (!rosterOpen) return "";

    const columns = roles
      .map((r) => {
        const list = roster.filter((m) => m.role === r);
        const cap = r === "Tank" ? "/2" : r === "Heal" ? "/4~5" : "";
        const slots = list.length
          ? `<div class="rp-role-slots">${list.map((m) => renderRosterSlot(m, "active")).join("")}</div>`
          : `<div class="empty">${t("아직 없음", "Empty")}</div>`;
        return `<div class="rp-role-col" data-drop="active">
          <div class="rp-role-title"><span>${roleLabel(r)}</span><span>${list.length}${cap}</span></div>
          ${slots}
        </div>`;
      })
      .join("");

    const bench = rosterOpen ? editBench : localBench;
    const benchSlots = bench.length
      ? bench.map((m) => renderRosterSlot(m, "bench")).join("")
      : `<div class="empty">${t("미참 없음", "None")}</div>`;

    const pop = `<div class="rp-roster-pop" data-rp="roster-backdrop">
      <div class="rp-roster-modal panel with-add" role="dialog" aria-modal="true" aria-label="${t("공대 구성", "Raid roster")}">
        <div class="rp-roster-modal-main">
          <div class="rp-roster-side-h">
            <div>
              <h3>${t("공대 구성", "Raid roster")}</h3>
            </div>
            <div class="rp-roster-side-acts">
              <button type="button" class="primary rp-roster-collapse" data-rp="toggle-roster">${t("닫고 작업하기", "Close & work")}</button>
            </div>
          </div>
          ${renderRaidLibrary()}
          <p class="rp-roster-draft-note${rosterDirty ? " dirty" : ""}">${t(
            "구성원을 넣고 빼도 저장을 눌러야 타임라인에 반영됩니다.",
            "Add or remove members, then press Save to apply them to the timeline."
          )}${rosterDirty ? ` · ${t("저장되지 않음", "Unsaved")}` : ""}</p>
          <div class="headcount rp-roster-hc">
            <div class="headcount-main">${t("선발", "Active")} <em>${roster.length}</em> / <span class="rp-cap"><button type="button" class="ghost" data-rp="roster-cap" data-delta="-1" aria-label="${t("인원 줄이기", "Fewer players")}">−</button><input type="number" min="${ROSTER_CAP_MIN}" max="${ROSTER_CAP_MAX}" step="1" value="${activeCap()}" data-rp="roster-cap-input" aria-label="${t("선발 인원", "Roster size")}"><button type="button" class="ghost" data-rp="roster-cap" data-delta="1" aria-label="${t("인원 늘리기", "More players")}">+</button></span> · ${t("미참", "Sit-out")} <em>${bench.length}</em></div>
            <div class="headcount-roles">${roleLabel("Tank")} ${counts.Tank}/2 · ${roleLabel("Heal")} ${counts.Heal}/4~5 · DPS ${dpsN}</div>
          </div>
          <div class="rp-roster-acts">
            <button class="ghost" data-rp="import-helper">${t("구인 도우미에서", "From helper")}</button>
            <button class="ghost" data-rp="demo-roster">${t("데모 20인", "Demo 20")}</button>
          </div>
          <div class="rp-roster-columns">${columns}</div>
          <div class="rp-roster-bottom">
            <div class="rp-roster-bench" data-drop="bench">
              <div class="rp-roster-zone-h">${t("미참인원", "Sit-out")} <em>${bench.length}</em></div>
              <div class="rp-roster-bench-grid">${benchSlots}</div>
            </div>
            <div class="rp-roster-trash" data-drop="trash" data-rp="roster-trash">
              <strong>${t("나간 공대원 삭제", "Remove leavers")}</strong>
            </div>
          </div>
        </div>
        ${renderSpecAddPanel()}
        ${renderMemberEditDialog()}
      </div>
      ${
        rosterClosePrompt
          ? `<div class="rp-roster-close-pop" data-rp="roster-close-backdrop">
        <div class="rp-roster-close-ask" role="alertdialog" aria-modal="true" aria-label="${t("저장하지 않은 공대 구성", "Unsaved roster")}">
          <p>${t("저장하지 않은 공대 구성이 있습니다.", "This roster has unsaved changes.")}</p>
          <div class="rp-roster-close-acts">
            <button type="button" class="primary" data-rp="roster-close-save">${t("저장하고 닫기", "Save and close")}</button>
            <button type="button" class="danger" data-rp="roster-close-discard">${t("저장하지 않고 닫기", "Close without saving")}</button>
            <button type="button" class="ghost" data-rp="roster-close-cancel">${t("계속 편집", "Keep editing")}</button>
          </div>
        </div>
      </div>`
          : ""
      }
    </div>`;

    return pop;
  }


  function currentWclEncounterId() {
    return Number(currentBoss()?.wclEncounterId) || 0;
  }

  const WCL_CATEGORIES = new Set(["raidHeal", "raidDef", "external", "mobility"]);

  function abilityIdsForSpec(className, specName) {
    const fake = { class: className, spec: specName };
    return (catalog().spells || [])
      .filter((sp) => WCL_CATEGORIES.has(sp.category))
      .filter((sp) => memberProvides(fake, sp))
      .flatMap((sp) => [sp.spellId, ...(sp.altSpellIds || [])])
      .filter((id) => Number(id) > 0);
  }

  function spellByNumericId(n) {
    const id = Number(n);
    return (
      (catalog().spells || []).find(
        (s) => Number(s.spellId) === id || (s.altSpellIds || []).some((x) => Number(x) === id)
      ) || null
    );
  }

  function nearestEventForTime(tSec, events) {
    let best = null;
    let bestD = Infinity;
    (events || []).forEach((ev) => {
      const d = Math.abs((Number(ev.t) || 0) - tSec);
      if (d < bestD) {
        bestD = d;
        best = ev;
      }
    });
    if (!best || bestD > FINE_WINDOW) return null;
    return best;
  }

  function helpTip(ko, en) {
    const tip = t(ko, en);
    return `<span class="rp-help-q" tabindex="0" aria-label="${escapeAttr(tip)}"><span aria-hidden="true">?</span><span class="rp-help-tip" role="tooltip">${escapeAttr(tip)}</span></span>`;
  }

  function wclAutoAssignHelp() {
    return helpTip(
      "공대원들의 주요 쿨기를 WCL 1등 힐러들의 로그로 복제합니다",
      "Copies each member's major cooldowns from the #1 WCL healer logs"
    );
  }

  function wclAutoAssignLabel() {
    return t("생존기 자동배정", "Auto-assign CDs");
  }

  /** 보스 전환 열 이름. 반복되는 페이즈는 회차 표시 */
  function phaseColumns(rawB) {
    const base = basePhases(rawB);
    const seen = new Map();
    return base.map((_, i) => {
      const lbl = phaseLabel(rawB, i);
      const n = (seen.get(lbl.ko) || 0) + 1;
      seen.set(lbl.ko, n);
      const repeats = base.filter((_, j) => phaseLabel(rawB, j).ko === lbl.ko).length > 1;
      return repeats ? { ko: `${lbl.ko}(${n}회차)`, en: `${lbl.en} (#${n})` } : lbl;
    });
  }

  function renderWclPanel() {
    return `<div class="rp-wcl-bar">
      <div class="rp-wcl-assign-act">
        <button type="button" class="primary" data-rp="wcl-apply-all" ${wclLoading ? "disabled" : ""}>${
          wclBulk && wclLoading
            ? t(`가져오는 중… ${wclBulk.done}/${wclBulk.total}`, `Fetching… ${wclBulk.done}/${wclBulk.total}`)
            : wclAutoAssignLabel()
        }</button>
        ${wclAutoAssignHelp()}
      </div>
      ${wclError ? `<div class="rp-wcl-err">${escapeAttr(wclError)}</div>` : ""}
    </div>`;
  }

  const WCL_TOP_N = 10;

  /** 로그 시전 기록을 targets(같은 전문화 공대원들)에 배치. 기존 같은 스킬 배치는 교체 */
  function applyWclCasts(parsed, abilityIds, targets, forBossId = bossId) {
    const boss = bossById(forBossId);
    const events = planGridSkillEvents(boss);
    const spellIdsToClear = new Set(abilityIds.map((n) => spellByNumericId(n)?.id).filter(Boolean));
    const targetIds = new Set(targets.map((m) => m.playerId));
    const isCurrent = forBossId === assignmentsBossId;
    const list = (isCurrent ? assignments : assignmentsByBoss[forBossId] || []).filter(
      (a) => !(targetIds.has(a.playerId) && spellIdsToClear.has(a.spellId))
    );
    if (isCurrent) assignments = list;
    else assignmentsByBoss[forBossId] = list;
    let placed = 0;
    // 로그 전환 k 와 플래너 전환 k 를 맞춰 구간 상대 시각으로 이동. 전환 기록이 없으면 전투 시각 그대로
    const rawB = catalogBoss(forBossId);
    const planStarts = basePhases(rawB).length ? phaseStartsFor(rawB) : [];
    const logStarts = (parsed.phases || [])
      .map((p) => Number(p.startSec) || 0)
      .filter((s) => s > 0)
      .sort((a, b) => a - b);
    const n = Math.min(planStarts.length, logStarts.length);
    const from = logStarts.slice(0, n);
    const to = planStarts.slice(0, n);
    const lastBySpell = new Map();
    const casts = [...(parsed.casts || [])].sort((a, b) => a.tSec - b.tSec);
    // 로그에서 실제로 다시 쓴 가장 짧은 간격 → 특성으로 줄어든 쿨타임 (중복 시전 기록은 무시)
    const obsGap = new Map();
    const seenAt = new Map();
    casts.forEach((c) => {
      const sp = spellByNumericId(c.abilityId);
      if (!sp) return;
      const cd = Number(sp.cooldown) || 0;
      const prev = seenAt.get(sp.id);
      const gap = prev != null ? c.tSec - prev : null;
      if (gap != null && gap >= Math.max(10, cd * 0.3)) obsGap.set(sp.id, Math.min(obsGap.get(sp.id) ?? Infinity, gap));
      seenAt.set(sp.id, c.tSec);
    });
    casts.forEach((c) => {
      const sp = spellByNumericId(c.abilityId);
      if (!sp) return;
      const cdObs = obsGap.get(sp.id) < (Number(sp.cooldown) || 0) ? obsGap.get(sp.id) : null;
      const seg = n ? shiftBySegments(c.tSec, from, to) : null;
      let mapped = seg ? seg.t : c.tSec;
      // 구간이 짧아져 간격이 좁혀져도 로그에서 실제로 쓴 간격(또는 쿨타임)보다 가깝게는 두지 않음
      const prev = lastBySpell.get(sp.id);
      if (prev) {
        const minGap = Math.min(c.tSec - prev.raw, Number(sp.cooldown) || Infinity);
        mapped = Math.max(mapped, prev.mapped + minGap);
      }
      lastBySpell.set(sp.id, { raw: c.tSec, mapped });
      const tSec = Math.max(0, Math.round(mapped));
      const ph = seg ? seg.k : phaseSegmentFor(forBossId, tSec);
      const ev = nearestEventForTime(tSec, events);
      targets.forEach((player) => {
        list.push({
          id: uid("as"),
          spellId: sp.id,
          playerId: player.playerId,
          t: tSec,
          ph,
          eventId: ev?.id || null,
          ...(cdObs ? { cdObs } : {}),
        });
        placed += 1;
      });
    });
    return placed;
  }

  function logTransitionCount(parsed) {
    return (parsed?.phases || []).filter((p) => Number(p.startSec) > 0).length;
  }

  /**
   * 순위 순서대로 보면서 "페이즈 N 기준 +초" 로 옮길 수 있는 로그(전환 기록이 보스 전환 수만큼 있는 것)를 고름
   * 익명 로그는 플레이어를 특정할 수 없어 제외. 끝까지 없으면 전환이 가장 많은 로그 사용
   */
  async function pickPhasedLog(rankings, abilityIds, forBossId) {
    const need = basePhases(catalogBoss(forBossId)).length;
    const cands = (rankings || []).filter(
      (r) => r.reportCode && r.fightId != null && r.name && r.name !== "Anonymous"
    );
    if (!cands.length) throw new Error(t("랭킹 없음", "No rankings"));
    let best = null;
    let skipped = 0;
    for (const entry of cands.slice(0, need ? 6 : 1)) {
      const parsed = await global.WclClient.fetchParse({
        reportCode: entry.reportCode,
        fightId: entry.fightId,
        abilityIds,
        playerName: entry.name,
      });
      if (!parsed.ok) {
        skipped += 1;
        continue;
      }
      const n = logTransitionCount(parsed);
      if (!need || n >= need) return { entry, parsed, phased: Boolean(need), skipped };
      if (!best || n > best.n) best = { entry, parsed, n };
      skipped += 1;
    }
    if (!best) throw new Error(t("로그를 불러오지 못했습니다.", "Failed to load logs."));
    return { entry: best.entry, parsed: best.parsed, phased: best.n > 0, skipped };
  }

  /** 킬 로그 상위·하위 10 개의 전환 시각 평균으로 현재 보스 페이즈 맞추기 */
  async function phaseSync() {
    const boss = catalogBoss(bossId);
    const base = basePhases(boss);
    const encounterId = currentWclEncounterId();
    if (!base.length || !encounterId || phaseSyncing) return;
    const runBossId = bossId;
    phaseSyncing = true;
    phaseSyncError = "";
    renderCd();
    try {
      const data = await global.WclClient.fetchPhaseSync({
        encounterId,
        difficulty: boss?.wclDifficulty || 5,
        count: 10,
      });
      if (!data.ok) throw new Error(data.error || "phase sync failed");
      const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
      const pick = (samples, i) =>
        (samples || []).map((s) => Number(s.transitions?.[i]?.sec)).filter((n) => Number.isFinite(n) && n > 0);
      const current = phaseStartsFor(boss);
      const per = base.map((_, i) => {
        const top = pick(data.top, i);
        const bottom = pick(data.bottom, i);
        const all = [...top, ...bottom];
        const parts = [avg(top), avg(bottom)].filter((n) => n != null);
        return {
          t: parts.length ? Math.round(avg(parts)) : null,
          topAvg: top.length ? Math.round(avg(top)) : null,
          bottomAvg: bottom.length ? Math.round(avg(bottom)) : null,
          min: all.length ? Math.min(...all) : null,
          max: all.length ? Math.max(...all) : null,
          n: all.length,
        };
      });
      if (!per.some((p) => p.t != null)) throw new Error(t("전환 기록이 있는 로그가 없습니다.", "No logs with phase transitions."));
      const starts = per.map((p, i) => (p.t != null ? p.t : current[i]));
      setPhaseStarts(runBossId, starts, "wcl", {
        per,
        topN: (data.top || []).length,
        bottomN: (data.bottom || []).length,
        at: Date.now(),
      });
      saveState();
    } catch (err) {
      phaseSyncError = err?.data?.error || err.message || String(err);
    } finally {
      phaseSyncing = false;
      renderCd();
    }
  }

  function parseTimeInput(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    const m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  function setPhaseStartAt(idx, sec) {
    const boss = catalogBoss(bossId);
    const starts = phaseStartsFor(boss);
    if (!(idx >= 0 && idx < starts.length) || !Number.isFinite(sec)) return;
    const lo = (starts[idx - 1] || 0) + 1;
    const hi = starts[idx + 1] != null ? starts[idx + 1] - 1 : Math.max(sec, starts[idx]) + 600;
    starts[idx] = Math.max(lo, Math.min(hi, Math.round(sec)));
    const prevInfo = phaseOverrides[phaseKey(bossId)]?.info || (wclDifficulty === 5 ? phaseOverrides[bossId]?.info : null) || null;
    setPhaseStarts(bossId, starts, "manual", prevInfo);
    render(true);
  }

  function renderPhaseBar() {
    const boss = catalogBoss(bossId);
    const base = basePhases(boss);
    if (!base.length) {
      return `<div class="rp-phase-bar empty"><b>${t("페이즈", "Phases")}</b><span class="rp-phase-note">${t(
        "이 보스는 페이즈 전환이 없습니다.",
        "This boss has no phase transitions."
      )}</span></div>`;
    }
    const starts = phaseStartsFor(boss);
    const ov = phaseOverrides[phaseKey(boss.id)] || (wclDifficulty === 5 ? phaseOverrides[boss.id] : null);
    const encId = currentWclEncounterId();
    const inputs = starts
      .map((sec, i) => {
        const lbl = phaseLabel(boss, i);
        const changed = sec !== Number(base[i].t);
        return `<div class="rp-phase-item ${changed ? "changed" : ""}">
          <span class="rp-phase-name">${escapeAttr(t(lbl.ko, lbl.en))}</span>
          <input data-rp="phase-input" data-idx="${i}" value="${fmtTime(sec)}" inputmode="numeric" aria-label="${escapeAttr(
            t(`${lbl.ko} 시작 시각`, `${lbl.en} start`)
          )}">
        </div>`;
      })
      .join("");
    return `<div class="rp-phase-bar">
      <span class="rp-wcl-assign-act rp-phase-title">
        <b>${t("페이즈 전환", "Phase transitions")}</b>
        ${helpTip(
          "이 네임드는 딜에 따라서 페이즈 전환 시간이 달라지는 네임드 입니다. 본인 공대 시간에 맞게 설정 하신뒤 쿨기를 배정하시면 됩니다.",
          "This boss's phase times change with raid DPS. Set them to match your raid, then assign cooldowns."
        )}
      </span>
      <div class="rp-phase-items">${inputs}</div>
      <div class="rp-phase-acts">
        <span class="rp-wcl-assign-act">
          <button type="button" class="primary" data-rp="phase-sync" ${phaseSyncing || !encId ? "disabled" : ""}>${
            phaseSyncing ? t("동기화 중… (10~20초)", "Syncing… (10–20s)") : t("페이즈 동기화", "Sync phases")
          }</button>
          ${helpTip(
            "WCL 킬 로그 상위·하위 10개의 페이즈 전환 시각을 평균내 이 보스에 맞춥니다",
            "Averages phase times from the top and bottom 10 WCL kills and applies them to this boss"
          )}
        </span>
        <button type="button" class="ghost" data-rp="phase-reset" ${ov ? "" : "disabled"}>${t("기본값", "Reset")}</button>
      </div>
      ${phaseSyncError ? `<div class="rp-wcl-err">${escapeAttr(phaseSyncError)}</div>` : ""}
    </div>`;
  }

  /** WCL 은 "DeathKnight", "BeastMastery" 처럼 공백 없는 이름을 씀 */
  function wclName(s) {
    return String(s || "").replace(/[\s']/g, "");
  }

  /** 로스터의 전문화별(쿨기 매핑 있는 것만) 그룹 */
  function rosterSpecGroups() {
    const map = new Map();
    activeRoster().forEach((m) => {
      const key = `${m.class}|${m.spec}`;
      if (!map.has(key)) {
        const abilityIds = abilityIdsForSpec(m.class, m.spec);
        map.set(key, {
          key,
          className: m.class,
          specName: m.spec,
          role: m.role,
          label: langRef() === "ko" ? `${m.specKo || m.spec} ${m.classKo || m.class}` : `${m.spec} ${m.class}`,
          abilityIds,
          targets: [],
        });
      }
      map.get(key).targets.push(m);
    });
    return [...map.values()].filter((g) => g.abilityIds.length);
  }

  /** 로스터 모든 전문화 × 각 전문화 1등 로그 → 한 번에 반영 */
  async function wclApplyAllTop() {
    const encounterId = currentWclEncounterId();
    if (!encounterId) {
      wclError = t("WCL Encounter ID가 필요합니다.", "WCL Encounter ID required.");
      renderCd();
      return;
    }
    const groups = rosterSpecGroups();
    if (!groups.length) {
      wclError = t("로스터에 쿨기가 있는 공대원이 없습니다.", "No roster members with mapped cooldowns.");
      renderCd();
      return;
    }
    const difficulty = currentBoss()?.wclDifficulty || 5;
    const runBossId = bossId;
    wclLoading = true;
    wclError = null;
    wclBulk = { done: 0, total: groups.length, current: [], results: [] };
    wclStatus = "";
    renderCd();
    await global.WclClient.mapPool(groups, 3, async (g) => {
      wclBulk.current.push(g.label);
      renderCd();
      const result = { label: g.label, ok: false, name: "", placed: 0, error: "" };
      try {
        const data = await global.WclClient.fetchRankings({
          encounterId,
          className: wclName(g.className),
          specName: wclName(g.specName),
          metric: g.role === "Heal" ? "hps" : "dps",
          difficulty,
          pageSize: 10,
          page: 1,
        });
        if (!data.ok) throw new Error(data.error || "rankings failed");
        const picked = await pickPhasedLog(data.rankings || [], g.abilityIds, runBossId);
        result.placed = applyWclCasts(picked.parsed, g.abilityIds, g.targets, runBossId);
        result.name = picked.entry.name;
        result.rank = picked.entry.rank;
        result.phased = picked.phased;
        result.skipped = picked.skipped;
        result.ok = true;
      } catch (err) {
        result.error = err?.data?.error || err.message || String(err);
      }
      wclBulk.results.push(result);
      wclBulk.done += 1;
      wclBulk.current = wclBulk.current.filter((x) => x !== g.label);
      renderCd();
    });
    const okN = wclBulk.results.filter((r) => r.ok).length;
    wclLoading = false;
    wclOpen = false;
    wclBulk = null;
    wclStatus = "";
    if (!okN) {
      wclError = t("생존기 자동배정에 실패했습니다.", "Auto-assign failed.");
    } else {
      wclError = null;
    }
    saveState();
    renderCd();
  }

  function wclPickKey(player) {
    return `${bossId}|${wclDifficulty}|${currentWclEncounterId() || ""}|${player.class}|${player.spec}`;
  }

  function openWclPick(player, rect) {
    if (wclPick?.playerId === player.playerId) {
      wclPick = null;
      renderCd();
      return;
    }
    wclPick = {
      playerId: player.playerId,
      bossId,
      key: wclPickKey(player),
      x: rect.right + 8,
      y: rect.top,
      loading: false,
      phasesLoading: false,
      error: null,
      status: "",
      applying: null,
    };
    renderCd();
    if (!wclPickCache[wclPick.key]) loadWclPick(player);
  }

  async function loadWclPick(player) {
    const pick = wclPick;
    const key = pick.key;
    const encounterId = currentWclEncounterId();
    if (!encounterId) {
      pick.error = t("이 보스의 WCL Encounter ID가 없습니다.", "Missing WCL Encounter ID for this boss.");
      renderCd();
      return;
    }
    pick.loading = true;
    renderCd();
    try {
      const data = await global.WclClient.fetchRankings({
        encounterId,
        className: wclName(player.class),
        specName: wclName(player.spec),
        metric: player.role === "Heal" ? "hps" : "dps",
        difficulty: currentBoss()?.wclDifficulty || 5,
        pageSize: WCL_TOP_N,
        page: 1,
      });
      if (!data.ok) throw new Error(data.error || "rankings failed");
      const rows = (data.rankings || []).map((r) => ({ ...r }));
      wclPickCache[key] = rows;
      pick.loading = false;
      pick.phasesLoading = true;
      renderCd();
      await global.WclClient.mapPool(
        rows.filter((r) => r.reportCode && r.fightId != null),
        4,
        async (r) => {
          try {
            const parsed = await global.WclClient.fetchPhases({ reportCode: r.reportCode, fightId: r.fightId });
            r.transitions = parsed.ok
              ? (parsed.phases || [])
                  .map((p) => Number(p.startSec) || 0)
                  .filter((s) => s > 0)
                  .sort((a, b) => a - b)
              : [];
            if (parsed.ok && parsed.fight?.durationSec) r.durationSec = parsed.fight.durationSec;
          } catch (_) {
            r.transitions = [];
          }
        }
      );
      rows.forEach((r) => {
        if (!r.transitions) r.transitions = [];
      });
    } catch (err) {
      pick.error = err?.data?.error || err.message || String(err);
    } finally {
      pick.loading = false;
      pick.phasesLoading = false;
      renderCd();
    }
  }

  async function applyWclPick(rank) {
    const pick = wclPick;
    if (!pick || pick.applying) return;
    const player = activeRoster().find((m) => m.playerId === pick.playerId);
    const entry = (wclPickCache[pick.key] || []).find((r) => r.rank === rank);
    if (!player || !entry?.reportCode) return;
    const abilityIds = abilityIdsForSpec(player.class, player.spec);
    const runBossId = pick.bossId;
    pick.applying = rank;
    pick.error = null;
    renderCd();
    try {
      const parsed = await global.WclClient.fetchParse({
        reportCode: entry.reportCode,
        fightId: entry.fightId,
        abilityIds,
        playerName: entry.name,
      });
      if (!parsed.ok) throw new Error(parsed.error || "parse failed");
      const placed = applyWclCasts(parsed, abilityIds, [player], runBossId);
      const need = basePhases(catalogBoss(runBossId)).length;
      const have = logTransitionCount(parsed);
      const phaseNote =
        need && have < need ? t(` · ⚠ 전환 기록 ${have}/${need}개`, ` · ⚠ ${have}/${need} transitions`) : "";
      pick.status = t(
        `#${rank} ${entry.name} 로그 → ${memberNick(player) || playerCallsign(player)} 배치 ${placed}개${phaseNote}`,
        `#${rank} ${entry.name} → ${placed} placed${phaseNote}`
      );
      pick.appliedRank = rank;
      saveState();
    } catch (err) {
      pick.error = err?.data?.error || err.message || String(err);
    } finally {
      pick.applying = null;
      renderCd();
    }
  }

  function renderWclPick() {
    const pick = wclPick;
    if (!pick) return "";
    const player = activeRoster().find((m) => m.playerId === pick.playerId);
    if (!player) return "";
    const { who, accent, spec } = personBundleMeta(player);
    const rawB = catalogBoss(pick.bossId);
    const cols = phaseColumns(rawB);
    const planStarts = cols.length ? phaseStartsFor(rawB) : [];
    const rows = wclPickCache[pick.key] || [];
    const W = 520;
    const left = Math.max(8, Math.min(pick.x, window.innerWidth - W - 8));
    const top = Math.max(8, Math.min(pick.y, window.innerHeight - 460));
    const body = rows
      .map((r) => {
        const anon = !r.name || r.name === "Anonymous";
        const phases = cols
          .map((lbl, i) => {
            const sec = r.transitions?.[i];
            if (sec == null) return `<td class="rp-wcl-phase none">${r.transitions ? "–" : "…"}</td>`;
            const diff = sec - planStarts[i];
            const tip = t(
              `${lbl.ko} ${fmtTime(sec)} · 우리 ${fmtTime(planStarts[i])} 대비 ${diff >= 0 ? "+" : "−"}${fmtTime(Math.abs(diff))}`,
              `${lbl.en} ${fmtTime(sec)} · ${diff >= 0 ? "+" : "−"}${fmtTime(Math.abs(diff))} vs plan`
            );
            return `<td class="rp-wcl-phase ${diff < -2 ? "early" : diff > 2 ? "late" : ""}" title="${escapeAttr(tip)}">${fmtTime(sec)}</td>`;
          })
          .join("");
        const busy = pick.applying === r.rank;
        return `<tr class="${pick.appliedRank === r.rank ? "on" : ""}">
          <td class="rp-wcl-rank">#${r.rank}</td>
          <td class="rp-wcl-who"><b>${escapeAttr(r.name || "?")}</b>${
            r.logUrl ? `<a class="rp-wcl-link" href="${escapeAttr(r.logUrl)}" target="_blank" rel="noopener">log</a>` : ""
          }</td>
          <td class="rp-wcl-dur">${fmtTime(r.durationSec || 0)}</td>
          ${phases}
          <td><button type="button" class="primary rp-wcl-mini-apply" data-rp="wcl-pick-apply" data-rank="${r.rank}" ${
            anon || pick.applying ? "disabled" : ""
          } title="${escapeAttr(anon ? t("익명 로그는 플레이어를 찾을 수 없음", "Anonymous log") : "")}">${
            busy ? "…" : t("반영", "Apply")
          }</button></td>
        </tr>`;
      })
      .join("");
    const metric = player.role === "Heal" ? "HPS" : "DPS";
    return `<div class="rp-wcl-pop" style="left:${left}px;top:${top}px;width:${W}px;--class:${accent}">
      <div class="rp-wcl-pop-h">
        ${memberIconHtml(player)}
        <div class="rp-wcl-pop-title"><b>${who}</b><span>${escapeAttr(spec || "")} · ${metric} ${t("상위", "top")} ${WCL_TOP_N}</span></div>
        <button type="button" class="ghost rp-wcl-pop-x" data-rp="wcl-pick-close" title="${t("닫기", "Close")}">✕</button>
      </div>
      ${pick.error ? `<div class="rp-wcl-err">${escapeAttr(pick.error)}</div>` : ""}
      ${pick.status ? `<div class="rp-wcl-ok">${escapeAttr(pick.status)}</div>` : ""}
      ${
        pick.loading
          ? `<div class="rp-wcl-pop-empty">${t("상위 로그 불러오는 중…", "Loading top logs…")}</div>`
          : rows.length
            ? `<div class="rp-wcl-pop-scroll"><table class="rp-wcl-table compact">
                <thead><tr><th>#</th><th>${t("캐릭터", "Character")}</th><th>${t("킬", "Kill")}</th>${cols
                  .map((lbl) => `<th>${escapeAttr(langRef() === "ko" ? lbl.ko : lbl.en)}</th>`)
                  .join("")}<th></th></tr></thead>
                <tbody>${body}</tbody>
              </table></div>
              ${pick.phasesLoading ? `<div class="rp-wcl-pop-note">${t("페이즈 시각 불러오는 중…", "Loading phase times…")}</div>` : ""}`
            : pick.error
              ? ""
              : `<div class="rp-wcl-pop-empty">${t("랭킹 없음", "No rankings")}</div>`
      }
    </div>`;
  }

  const NSRT_DIFFICULTY = { 1: "LFR", 3: "Normal", 4: "Heroic", 5: "Mythic" };
  /** 게임 전문화 ID (ChrSpecialization). NSRT tag 에 숫자로 넣으면 그 전문화 전원에게 뜸 */
  const SPEC_IDS = {
    "Death Knight|Blood": 250, "Death Knight|Frost": 251, "Death Knight|Unholy": 252,
    "Demon Hunter|Havoc": 577, "Demon Hunter|Vengeance": 581, "Demon Hunter|Devourer": 1480,
    "Druid|Balance": 102, "Druid|Feral": 103, "Druid|Guardian": 104, "Druid|Restoration": 105,
    "Evoker|Devastation": 1467, "Evoker|Preservation": 1468, "Evoker|Augmentation": 1473,
    "Hunter|Beast Mastery": 253, "Hunter|Marksmanship": 254, "Hunter|Survival": 255,
    "Mage|Arcane": 62, "Mage|Fire": 63, "Mage|Frost": 64,
    "Monk|Brewmaster": 268, "Monk|Windwalker": 269, "Monk|Mistweaver": 270,
    "Paladin|Holy": 65, "Paladin|Protection": 66, "Paladin|Retribution": 70,
    "Priest|Discipline": 256, "Priest|Holy": 257, "Priest|Shadow": 258,
    "Rogue|Assassination": 259, "Rogue|Outlaw": 260, "Rogue|Subtlety": 261,
    "Shaman|Elemental": 262, "Shaman|Enhancement": 263, "Shaman|Restoration": 264,
    "Warlock|Affliction": 265, "Warlock|Demonology": 266, "Warlock|Destruction": 267,
    "Warrior|Arms": 71, "Warrior|Fury": 72, "Warrior|Protection": 73,
  };

  /**
   * Northern Sky Raid Tools 리마인더 노트
   *   EncounterID:3470;Difficulty:Mythic;Name:...;
   *   time:20;ph:2;tag:캐릭터;spellid:740;
   * ph 는 전환마다 1씩 늘어나는 순번(1→2→1 도 ph:1,2,3), time 은 그 페이즈 시작 기준 초.
   * 페이즈 시간차로 못 쓰는(회색) 배치는 제외
   */
  function buildNsrtNote() {
    const raw = catalogBoss(bossId);
    if (!raw) return { text: "", lines: 0, unnamed: [] };
    const starts = basePhases(raw).length ? phaseStartsFor(raw) : [];
    const hidden = hiddenAssignTest(bossId);
    const unnamed = new Map();
    const specCount = new Map();
    activeRoster().forEach((m) => {
      const k = `${m.class}|${m.spec}`;
      specCount.set(k, (specCount.get(k) || 0) + 1);
    });
    const tagFor = (player) => {
      const nick = memberNick(player).replace(/[;:\s]/g, "");
      if (nick) return nick;
      const specId = SPEC_IDS[`${player.class}|${player.spec}`];
      unnamed.set(player.playerId, {
        name: playerCallsign(player),
        specId,
        shared: (specCount.get(`${player.class}|${player.spec}`) || 0) > 1,
      });
      return specId ? String(specId) : playerCallsign(player);
    };
    const rows = assignments
      .filter((a) => !hidden(a))
      .map((a) => {
        const sp = spellById(a.spellId);
        const player = activeRoster().find((m) => m.playerId === a.playerId);
        if (!sp || !player || !(Number(sp.spellId) > 0)) return null;
        const sec = Number(a.t) || 0;
        const k = Number.isInteger(a.ph) && a.ph < starts.length ? a.ph : segmentOf(sec, starts);
        const rel = Math.max(0, Math.round(k < 0 ? sec : sec - starts[k]));
        return { ph: k + 2, rel, tag: tagFor(player), spellId: sp.spellId };
      })
      .filter(Boolean)
      .sort((x, y) => x.ph - y.ph || x.rel - y.rel || x.tag.localeCompare(y.tag));
    const header = `EncounterID:${raw.wclEncounterId || 0};Difficulty:${
      NSRT_DIFFICULTY[wclDifficulty] || "Mythic"
    };Name:${String(raw.name || raw.id).replace(/[;:]/g, "")};`;
    const body = rows.map((r) => `time:${r.rel};ph:${r.ph};tag:${r.tag};spellid:${r.spellId};`);
    return { text: [header, ...body].join("\n"), lines: body.length, unnamed: [...unnamed.values()] };
  }

  /** 클릭 이벤트 안에서 바로 호출해야 함 (execCommand 는 사용자 동작 직후에만 허용) */
  async function copyText(text) {
    const ta = document.querySelector(".rp-nsrt-text, .rp-share-url");
    if (ta) {
      ta.focus();
      ta.select();
      try {
        if (document.execCommand("copy")) return true;
      } catch (_) {
        /* 아래 Clipboard API 로 */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function nsrtExport() {
    nsrtModal = { copied: null };
    renderCd();
    const { text } = buildNsrtNote();
    nsrtModal.copied = await copyText(text);
    renderCd();
  }

  function renderNsrtModal() {
    if (!nsrtModal) return "";
    const { text, lines, unnamed } = buildNsrtNote();
    const boss = currentBoss();
    const bossName = langRef() === "ko" ? boss?.nameKo || boss?.name : boss?.name;
    const copiedNote =
      nsrtModal.copied === true
        ? `<div class="rp-wcl-ok">${t(`클립보드에 복사했습니다 · 리마인더 ${lines}줄`, `Copied to clipboard · ${lines} reminders`)}</div>`
        : nsrtModal.copied === false
          ? `<div class="rp-wcl-err">${t("자동 복사 실패 · 아래 내용을 직접 선택해 복사하세요", "Auto copy failed · select the text below and copy")}</div>`
          : "";
    return `<div class="rp-modal-back" data-rp="nsrt-close"></div>
    <div class="rp-nsrt-modal" role="dialog" aria-label="NSRT">
      <div class="rp-wcl-pop-h">
        <div class="rp-wcl-pop-title"><b>${t("NSRT 리마인더 내보내기", "Export NSRT reminders")}</b><span>${escapeAttr(
          bossName || ""
        )} · ${t("페이즈 기준 시각", "phase-relative time")}</span></div>
        <button type="button" class="ghost rp-wcl-pop-x" data-rp="nsrt-close" title="${t("닫기", "Close")}">✕</button>
      </div>
      ${copiedNote}
      ${(() => {
        if (!unnamed.length) return "";
        const shared = unnamed.filter((u) => u.shared);
        const list = unnamed.map((u) => `${u.name}${u.specId ? `→${u.specId}` : ""}`).join(", ");
        return `<div class="rp-wcl-note-box">${t(
          `캐릭터 이름이 없는 공대원 ${unnamed.length}명은 이름 대신 전문화 ID로 넣었습니다 (${list}). NSRT가 그 전문화인 사람에게 알림을 띄웁니다.`,
          `${unnamed.length} member(s) without a name are tagged by spec ID (${list}); NSRT shows them to anyone in that spec.`
        )}</div>${
          shared.length
            ? `<div class="rp-wcl-warn">${t(
                `같은 전문화가 여러 명이라 서로의 알림까지 함께 뜹니다: ${shared.map((u) => u.name).join(", ")}. 이 공대원들은 공대 구성에서 캐릭터 이름을 입력하세요.`,
                `Several members share a spec, so they'll see each other's reminders: ${shared.map((u) => u.name).join(", ")}. Enter their character names.`
              )}</div>`
            : ""
        }`;
      })()}
      <textarea class="rp-nsrt-text" readonly spellcheck="false">${escapeAttr(text)}</textarea>
      <div class="rp-nsrt-acts">
        <button type="button" class="primary" data-rp="nsrt-copy">${t("다시 복사", "Copy again")}</button>
      </div>
    </div>`;
  }

  function renderCd() {
    const box = document.getElementById("rpCd");
    if (!box) return;
    const roster = activeRoster();
    const boss = currentBoss();
    const events = buildTimelineColumns(boss);
    if (wclPick && (wclPick.bossId !== bossId || !roster.some((m) => m.playerId === wclPick.playerId))) wclPick = null;
    const focusNick = document.activeElement?.dataset?.rp === "edit-nick" ? document.activeElement.dataset.id : null;
    const focusVal = focusNick ? document.activeElement.value : null;
    const paneSel = [".rp-time-top", ".rp-time-bottom"];
    const scrollKey = `${boss?.id || ""}`;
    const keepScroll =
      cdScrollKey === scrollKey
        ? paneSel.map((sel) => {
            const el = box.querySelector(sel);
            return el ? { sel, top: el.scrollTop, left: el.scrollLeft } : null;
          })
        : [];
    cdScrollKey = scrollKey;

    box.innerHTML = `
      <div class="rp-cd roster-collapsed">
        ${renderRosterSide(rosterOpen ? editRoster : roster)}
        <section class="panel rp-main">
          <div class="rp-main-head">
            ${renderPlanSlot()}
            <div class="rp-main-acts">
              <button class="ghost" data-rp="toggle-roster">${t("공대 구성", "Roster")} (${roster.length}${
                activeRaidName() ? ` · ${escapeAttr(activeRaidName())}` : ""
              })</button>
              ${(() => {
                const n = countCooldownOverlaps();
                return n
                  ? `<span class="rp-clash-badge">⚠ ${t(`쿨 겹침 ${n}건`, `${n} CD overlap${n > 1 ? "s" : ""}`)}</span>`
                  : "";
              })()}
              ${(() => {
                const n = assignments.length - visibleAssignments().length;
                return n
                  ? `<span class="rp-hidden-badge">${t(`페이즈 시간차로 못 씀 ${n}`, `${n} unusable (phase gap)`)}</span>`
                  : "";
              })()}
              <button class="primary" data-rp="nsrt-export">${t("NSRT 내보내기", "Export NSRT")}</button>
              <button class="danger" data-rp="clear-assigns">${t("배치 초기화", "Clear plan")}</button>
            </div>
          </div>

          ${renderWclPanel()}
          ${renderPhaseBar()}
          <div class="rp-zoom-row">
            <div class="rp-zoom-acts">
              <button class="ghost" data-rp="zoom-out" title="${t("축소", "Zoom out")}">−</button>
              <span class="rp-zoom-label">${zoom}px/s</span>
              <button class="ghost" data-rp="zoom-in" title="${t("확대", "Zoom in")}">+</button>
              <button class="ghost" data-rp="zoom-fit">${t("맞춤", "Fit")}</button>
            </div>
          </div>
          <div class="rp-board-wrap">${renderTimeline(events)}</div>
        </section>
      </div>
      ${renderWclPick()}
      ${renderNsrtModal()}`;

    keepScroll.forEach((s) => {
      const el = s && box.querySelector(s.sel);
      if (!el) return;
      el.scrollTop = s.top;
      el.scrollLeft = s.left;
    });
    bindTimelinePanes(box);
    const filterPop = box.querySelector(".rp-skill-filter");
    const filterBtn = box.querySelector("[data-rp='boss-rows-custom']");
    const filterHost = filterPop?.offsetParent;
    if (filterPop && filterBtn && filterHost) {
      const hb = filterHost.getBoundingClientRect();
      const bb = filterBtn.getBoundingClientRect();
      filterPop.style.top = `${Math.round(bb.bottom - hb.top + 4)}px`;
      filterPop.style.left = `${Math.max(4, Math.round(bb.left - hb.left - 4))}px`;
    }
    if (rosterEditId) {
      const input = box.querySelector(`input[data-rp="edit-nick"][data-id="${rosterEditId}"]`);
      if (input) {
        input.focus();
        if (focusNick === rosterEditId && focusVal != null) input.value = focusVal;
        else input.select();
      }
    }
    refreshWowheadTips();
    applyFitZoomAfterLayout();
  }

  function roleLabel(r) {
    if (langRef() !== "ko") return r;
    return { Tank: "탱커", Melee: "근딜", Ranged: "원딜", Heal: "힐" }[r] || r;
  }

  const ROLE_ORDER = { Tank: 0, Heal: 1, Melee: 2, Ranged: 3 };

  function sortedRoster(list) {
    const loc = langRef() === "ko" ? "ko" : "en";
    return [...(list || [])].sort((a, b) => {
      const ra = ROLE_ORDER[a.role] ?? 99;
      const rb = ROLE_ORDER[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      const ca = String(a.class || "").localeCompare(String(b.class || ""), "en");
      if (ca) return ca;
      const sa = String(a.spec || "").localeCompare(String(b.spec || ""), "en");
      if (sa) return sa;
      return String(playerCallsign(a)).localeCompare(String(playerCallsign(b)), loc);
    });
  }

  function spellThumb(sp, letter, opts) {
    const icon = global.RaidPlannerAPI.getSpellIcon(sp);
    const ch = letter || spellName(sp).slice(0, 1);
    const img = icon ? `<img src="${icon}" alt="">` : `<i>${ch}</i>`;
    return wowheadWrap(sp?.spellId, img, opts);
  }

  function wowheadDomain() {
    return langRef() === "ko" ? "ko" : "www";
  }

  function wowheadWrap(spellId, innerHtml, opts) {
    const id = Number(spellId);
    if (!id) return innerHtml;
    if (opts && opts.tip === false) return `<span class="rp-wh">${innerHtml}</span>`;
    const domain = wowheadDomain();
    const href = `https://www.wowhead.com/${domain === "ko" ? "ko/" : ""}spell=${id}`;
    const tip = domain === "ko" ? `spell=${id}&domain=ko` : `spell=${id}`;
    return `<a class="rp-wh" href="${href}" data-wowhead="${tip}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${innerHtml}</a>`;
  }

  function iconWithTooltip(spellId, iconUrl, className, opts) {
    const cls = className ? ` class="${className}"` : "";
    const img = iconUrl
      ? `<img${cls} src="${escapeAttr(iconUrl)}" alt="" loading="lazy">`
      : `<i${cls}></i>`;
    return wowheadWrap(spellId, img, opts);
  }

  function refreshWowheadTips() {
    try {
      if (global.$WowheadPower?.refreshLinks) global.$WowheadPower.refreshLinks();
    } catch (_) {
      /* ignore */
    }
  }

  function renderPhaseColHead(col) {
    const name = langRef() === "ko" ? col.nameKo || col.name : col.name;
    const range = phaseRangeLabel(col);
    const tip = range
      ? `${name} · ${fmtTime(col.t)} · ${t("공대별", "Guilds")} ${range}`
      : `${name} · ${fmtTime(col.t)}`;
    return `<th class="rp-phase-col ${col.varied ? "varied" : ""}" title="${escapeAttr(tip)}">
      <div class="rp-phase-rail" aria-hidden="true">
        <i></i>
        ${range ? `<em class="rp-phase-range">${escapeAttr(range)}</em>` : `<b>${fmtTime(col.t)}</b>`}
      </div>
    </th>`;
  }

  function renderSkillColHead(col) {
    const name = langRef() === "ko" ? col.nameKo || col.name : col.name;
    const ico = eventIconUrl(col);
    const timeTip = `${name} · ${fmtTime(col.t)}`;
    return `<th class="rp-grid-ev ${col.type || ""}" title="${escapeAttr(timeTip)}">
      ${ico ? iconWithTooltip(col.spellId, ico, "rp-ev-ico") : ""}
      <b>${fmtTime(col.t)}</b>
    </th>`;
  }

  function renderColumnHead(col) {
    return isPhaseEvent(col) ? renderPhaseColHead(col) : renderSkillColHead(col);
  }

  function renderPhaseCell(col) {
    const name = langRef() === "ko" ? col.nameKo || col.name : col.name;
    const range = phaseRangeLabel(col);
    return `<td class="rp-phase-cell ${col.varied ? "varied" : ""}" title="${escapeAttr(
      range ? `${name} · ${range}` : `${name} · ${fmtTime(col.t)}`
    )}"><i></i></td>`;
  }

  function renderBossStrip(columns) {
    const boss = currentBoss();
    const skills = planGridSkillEvents(boss);
    const rows = bossSkillRows(skills);
    const portrait = bossPortraitUrl(boss);
    const bossName = langRef() === "ko" ? boss?.nameKo || boss?.name : boss?.name;
    const phaseNote = (wclPhaseByBoss[boss?.id] &&
      t(
        `WCL 상위 ${wclPhaseByBoss[boss.id].topCount} · 하위 ${wclPhaseByBoss[boss.id].bottomCount} 평균`,
        `WCL top ${wclPhaseByBoss[boss.id].topCount} · bottom ${wclPhaseByBoss[boss.id].bottomCount} avg`
      )) ||
      "";

    const head = (columns || []).map(renderColumnHead).join("");
    const body = rows
      .map((row) => {
        const name = langRef() === "ko" ? row.nameKo || row.name : row.name;
        const cells = (columns || [])
          .map((col) => {
            if (isPhaseEvent(col)) return renderPhaseCell(col);
            const hit = row.marks.find((m) => m.id === col.id || (m.name === col.name && m.t === col.t));
            if (!hit) return `<td class="rp-boss-empty"></td>`;
            const ico = eventIconUrl(hit) || row.iconUrl;
            const sid = hit.spellId || row.spellId;
            return `<td class="rp-boss-hit ${row.type || ""}" title="${escapeAttr(name + " · " + fmtTime(hit.t))}">
              ${ico ? iconWithTooltip(sid, ico) : wowheadWrap(sid, `<i></i>`)}
            </td>`;
          })
          .join("");
        return `<tr>
          <th class="rp-boss-skill" title="${escapeAttr(name)}">
            ${row.iconUrl ? iconWithTooltip(row.spellId, row.iconUrl) : ""}
            <span>${row.spellId ? wowheadWrap(row.spellId, escapeAttr(name)) : escapeAttr(name)}</span>
          </th>
          ${cells}
        </tr>`;
      })
      .join("");

    return `<section class="rp-boss-strip">
      <div class="rp-boss-strip-h">
        <div class="rp-boss-strip-title">
          ${portrait ? `<img class="rp-boss-portrait" src="${escapeAttr(portrait)}" alt="">` : ""}
          <div>
            <h3>${escapeAttr(bossName || t("네임드 스킬", "Boss abilities"))}</h3>
            ${phaseNote ? `<div class="sub">${phaseNote}</div>` : ""}
          </div>
        </div>
      </div>
      <div class="rp-grid-scroll rp-boss-grid-scroll">
        <table class="rp-grid compact rp-boss-grid">
          <thead><tr>
            <th class="rp-boss-skill-h">${t("스킬", "Skill")}</th>
            ${head}
          </tr></thead>
          <tbody>${
            body ||
            `<tr><td colspan="${(columns || []).length + 1}" class="empty">${t(
              "보스 스킬이 없습니다.",
              "No boss abilities."
            )}</td></tr>`
          }</tbody>
        </table>
      </div>
    </section>`;
  }

  function assignChip(a, compact, opts) {
    const sp = spellById(a.spellId);
    if (!sp) return "";
    const player = activeRoster().find((m) => m.playerId === a.playerId);
    const on = selectedAssignId === a.id;
    const label = assignLabel(a);
    const nick = memberNick(player);
    const mark = nick ? nick.slice(0, 1) : playerCallsign(player).slice(0, 1);
    const accent = player?.color || classColor(providerClassName(sp));
    if (compact) {
      return `<div class="rp-assign icon-only ${on ? "on" : ""}" role="button" tabindex="0" data-rp="assign" data-id="${a.id}" style="--class:${accent}" title="${label}">
        ${spellThumb(sp, mark, opts)}
      </div>`;
    }
    return `<div class="rp-assign ${on ? "on" : ""}" role="button" tabindex="0" data-rp="assign" data-id="${a.id}" style="--class:${accent}" title="${label}">
      <b>${label}</b>
    </div>`;
  }

  function renderGridEventCells(sp, player, events) {
    const out = [];
    let i = 0;
    while (i < events.length) {
      const ev = events[i];
      if (isPhaseEvent(ev)) {
        out.push(renderPhaseCell(ev));
        i += 1;
        continue;
      }
      const here = assignmentsForCell(sp, player, ev);
      if (here.length) {
        out.push(`<td>${renderFilledCell(here, ev, sp, player)}</td>`);
        i += 1;
        continue;
      }
      const avail = cellCdAvailability(sp, player.playerId, eventAnchor(ev));
      if (avail.kind === "free") {
        out.push(
          `<td><div class="rp-cell" data-rp="assign-cell" data-t="${ev.t}" data-event="${ev.id}" data-spell="${sp.id}" data-player="${player.playerId}"><span class="rp-plus">+</span></div></td>`
        );
        i += 1;
        continue;
      }
      if (avail.kind === "partial") {
        out.push(`<td>${renderPartialCell(ev, sp, player, avail)}</td>`);
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < events.length) {
        if (isPhaseEvent(events[j])) break;
        if (assignmentsForCell(sp, player, events[j]).length) break;
        const next = cellCdAvailability(sp, player.playerId, eventAnchor(events[j]));
        if (next.kind !== "blocked") break;
        j += 1;
      }
      out.push(renderCdBandCell(avail.conflict, j - i, events[i], events[j - 1], sp, player));
      i = j;
    }
    return out.join("");
  }

  function renderPersonGridRows(groups, events) {
    return groups
      .map(({ player, spells }) => {
        const { who, accent, spec } = personBundleMeta(player);
        const n = spells.length;
        return spells
          .map((sp, i) => {
            const edges = [];
            if (i === 0) edges.push("start");
            if (i === n - 1) edges.push("end");
            if (!edges.length) edges.push("mid");
            const whoCell =
              i === 0
                ? `<th class="rp-pgroup-who" rowspan="${n}" title="${escapeAttr(who + (spec ? " · " + spec : ""))}">
                    <div class="rp-pgroup-card">
                      ${memberIconHtml(player)}
                      <b>${who}</b>
                    </div>
                  </th>`
                : "";
            return `<tr class="rp-pgroup ${edges.join(" ")}" data-player="${player.playerId}" style="--class:${accent}">
              ${whoCell}
              <th class="rp-grid-spell" title="${escapeAttr(spellName(sp))}">
                <span class="rp-grid-spell-in" style="--class:${accent}">
                  ${spellThumb(sp)}
                  <span><b>${spellName(sp)}</b></span>
                </span>
              </th>
              ${renderGridEventCells(sp, player, events)}
            </tr>`;
          })
          .join("");
      })
      .join("");
  }

  function renderGrid(events, spells) {
    const cats = catalog().categories || [];
    return `<div class="rp-grid-stack">${cats
      .map((cat) => {
        const groups = playerSpellGroups(spells.filter((sp) => sp.category === cat.id));
        if (!groups.length) return "";
        const rowCount = groups.reduce((n, g) => n + g.spells.length, 0);
        return `<section class="rp-grid-block ${collapsedCats[cat.id] ? "collapsed" : ""}" data-cat="${cat.id}">
          <button type="button" class="rp-grid-block-h" data-rp="toggle-cat" data-id="${cat.id}">
            <span class="rp-cat-chevron" aria-hidden="true">${collapsedCats[cat.id] ? "▸" : "▾"}</span>
            <span class="rp-cat-title">${categoryName(cat.id)}</span>
            <em>${t(`${groups.length}명 · ${rowCount}`, `${groups.length} · ${rowCount}`)}</em>
            <span class="rp-cat-toggle-label">${collapsedCats[cat.id] ? t("펼치기", "Expand") : t("접기", "Collapse")}</span>
          </button>
          <div class="rp-grid-scroll">
            <table class="rp-grid compact person-grouped">
              <thead><tr>
                <th class="rp-grid-who">${t("담당", "Who")}</th>
                <th class="rp-grid-spell">${t("스킬", "Spell")}</th>
                ${events.map((ev) => renderColumnHead(ev)).join("")}
              </tr></thead>
              <tbody>${renderPersonGridRows(groups, events)}</tbody>
            </table>
          </div>
        </section>`;
      })
      .join("")}</div>`;
  }

  function renderTimeline(events) {
    const width = timelineWidth();
    const isHidden = hiddenAssignTest(bossId);
    const shownAssigns = assignments.filter((a) => !isHidden(a));
    const cats = catalog().categories || [];
    const spells = catalog().spells || [];
    const step = zoom >= 6 ? 15 : zoom >= 3 ? 30 : 60;
    const axisTicks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => {
      const sec = Math.min(duration, i * step);
      const edge = sec === 0 ? "start" : sec >= duration ? "end" : "";
      return `<span class="${edge}" style="left:${timeX(sec)}px">${fmtTime(sec)}</span>`;
    }).join("");
    const boss = currentBoss();
    const bossName = langRef() === "ko" ? boss?.nameKo || boss?.name : boss?.name;
    const portrait = bossPortraitUrl(boss);
    const bossPhaseLines = (events || [])
      .filter((ev) => isPhaseEvent(ev))
      .map((ev) => {
        const idx = phaseIdxOf(ev);
        return idx == null
          ? `<div class="rp-phase-vline lane ${ev.varied ? "varied" : ""}" style="left:${timeX(ev.t)}px"></div>`
          : `<div class="rp-phase-vline lane drag ${ev.varied ? "varied" : ""}" data-rp="phase-drag" data-idx="${idx}" data-phase-idx="${idx}" style="left:${timeX(
              ev.t
            )}px"></div>`;
      })
      .join("");
    const allBossRows = timelineBossRows(boss);
    const filterScope = `boss:${boss?.id || ""}`;
    const customSet = skillFilterGet(
      filterScope,
      allBossRows.filter((row) => row.major).map((row) => row.key)
    );
    const shownBossRows =
      bossRowsMode === "major"
        ? allBossRows.filter((row) => row.major)
        : bossRowsMode === "custom"
          ? allBossRows.filter((row) => customSet.has(row.key))
          : allBossRows;
    timelineVisibleBossKeys = bossRowsMode === "all" ? null : new Set(shownBossRows.map((row) => row.key));
    const bossRowsCompact = shownBossRows.length > 12;
    const customCount = allBossRows.filter((row) => customSet.has(row.key)).length;
    const bossRowsToggle = `<div class="rp-boss-rows-btns">
      ${
        allBossRows.some((row) => row.major)
          ? `<button class="rp-boss-rows-toggle ${bossRowsMode === "major" ? "on" : ""}" data-rp="boss-rows-toggle" title="${escapeAttr(
              bossRowsMode === "major" ? t("보스 스킬 전체 보기", "Show all boss abilities") : t("주요 스킬만 보기", "Show majors only")
            )}">${t("주요만", "Majors")}</button>`
          : ""
      }
      <button class="rp-boss-rows-toggle custom ${bossRowsMode === "custom" ? "on" : ""}" data-rp="boss-rows-custom" title="${escapeAttr(
        t("보여줄 보스 스킬 직접 체크", "Pick boss abilities to show")
      )}">${t("커스텀", "Custom")}${bossRowsMode === "custom" ? ` ${customCount}` : ""} ▾</button>
    </div>`;
    const filterPop =
      skillFilterOpen === filterScope
        ? renderSkillFilterPop(
            filterScope,
            t("표시할 보스 스킬", "Boss abilities to show"),
            skillFilterItems(filterScope),
            customSet,
            `<button type="button" data-rp="boss-rows-all">${t("커스텀 끄기 (전체 보기)", "Turn off (show all)")}</button>`
          )
        : "";
    const bossTracks = shownBossRows
      .map((row) => {
        const name = langRef() === "ko" ? row.nameKo || row.name : row.name;
        let lastLabelX = -Infinity;
        const marks = row.marks
          .filter((ev) => (Number(ev.t) || 0) <= duration)
          .map((ev) => {
            const ico = eventIconUrl(ev) || row.iconUrl;
            const sid = ev.spellId || row.spellId;
            const x = timeX(ev.t);
            const showTime = x - lastLabelX >= 30;
            if (showTime) lastLabelX = x;
            return `<div class="rp-boss-mark" data-t="${Number(ev.t) || 0}" style="left:${x}px" title="${escapeAttr(
              `${name} · ${fmtTime(ev.t)}`
            )}">${ico ? iconWithTooltip(sid, ico, "", { tip: false }) : wowheadWrap(sid, "<i></i>", { tip: false })}${
              showTime ? `<em>${fmtTime(ev.t)}</em>` : ""
            }</div>`;
          })
          .join("");
        return `<div class="rp-track rp-boss-track ${row.major ? "major" : ""} bt-${row.type || "other"}">
          <div class="rp-track-name" title="${escapeAttr(name)}${row.major ? ` · ${t("주요 스킬", "Major")}` : ""}">
            <span class="rp-track-spell-ico">${row.iconUrl ? iconWithTooltip(row.spellId, row.iconUrl) : ""}</span>
            <b>${escapeAttr(name)}</b>
            <em>${row.marks.length}</em>
          </div>
          <div class="rp-track-lane rp-boss-lane">${bossPhaseLines}${marks}</div>
        </div>`;
      })
      .join("");
    const phaseLines = (events || [])
      .filter((ev) => isPhaseEvent(ev))
      .map((ev) => {
        const name = langRef() === "ko" ? ev.nameKo || ev.name : ev.name;
        const range = phaseRangeLabel(ev);
        const left = timeX(ev.t);
        const band =
          ev.varied && ev.maxSec > ev.minSec
            ? `<div class="rp-phase-band" style="left:${timeX(ev.minSec)}px;width:${Math.max(
                4,
                (ev.maxSec - ev.minSec) * zoom
              )}px"></div>`
            : "";
        const idx = phaseIdxOf(ev);
        const dragAttrs =
          idx == null ? "" : `data-rp="phase-drag" data-idx="${idx}" data-phase-idx="${idx}"`;
        const tip = range ? `${name} · ${range}` : `${name} · ${fmtTime(ev.t)}`;
        return `${band}<div class="rp-phase-vline ${idx == null ? "" : "drag"} ${ev.varied ? "varied" : ""}" ${dragAttrs} style="left:${left}px" title="${escapeAttr(
          tip
        )}">
          <span>${escapeAttr(name)}</span>
          <b class="rp-phase-time">${fmtTime(ev.t)}</b>
          ${range ? `<em>${escapeAttr(range)}</em>` : ""}
          ${idx == null ? "" : `<i class="rp-phase-drag-tip"></i>`}
        </div>`;
      })
      .join("");

    const timeStyle = `--w:${width}px;--zoom:${zoom};--label:168px`;
    const paneH = bossPaneHeight();
    return `${filterPop}<div class="rp-time-split" ${paneH ? `style="--boss-h:${paneH}px"` : ""}>
      <div class="rp-time-scroll rp-time-top" data-pane="top">
      <div class="rp-time" style="${timeStyle}">
        <div class="rp-time-head">
          <div class="rp-time-corner">
            ${portrait ? `<img class="rp-time-boss-portrait" src="${escapeAttr(portrait)}" alt="">` : ""}
            <span>${escapeAttr(bossName || t("네임드", "Boss"))}</span>
            ${bossRowsToggle}
          </div>
          <div class="rp-time-plot">
            <div class="rp-time-axis">${axisTicks}</div>
            <div class="rp-phase-layer">${phaseLines}</div>
          </div>
        </div>
        <div class="rp-boss-tracks ${bossRowsCompact ? "compact" : ""}">${
          bossTracks || `<div class="empty">${t("보스 스킬이 없습니다.", "No boss abilities.")}</div>`
        }</div>
      </div>
      </div>
      <div class="rp-time-splitter" data-split="1" role="separator" aria-orientation="horizontal"><span></span></div>
      <div class="rp-time-scroll rp-time-bottom" data-pane="bottom">
      <div class="rp-time" style="${timeStyle}">
        ${cats
          .map((c) => {
            const groups = playerSpellGroups(spells.filter((sp) => sp.category === c.id));
            if (!groups.length) return "";
            const rowCount = groups.reduce((n, g) => n + g.spells.length, 0);
            return `<div class="rp-track-group ${collapsedCats[c.id] ? "collapsed" : ""}" data-cat="${c.id}">
              <button type="button" class="rp-track-group-h" data-rp="toggle-cat" data-id="${c.id}">
                <span class="rp-cat-chevron" aria-hidden="true">${collapsedCats[c.id] ? "▸" : "▾"}</span>
                <span class="rp-cat-title">${categoryName(c.id)}</span>
                <em>${t(`${groups.length}명 · ${rowCount}`, `${groups.length} · ${rowCount}`)}</em>
                <span class="rp-cat-toggle-label">${collapsedCats[c.id] ? t("펼치기", "Expand") : t("접기", "Collapse")}</span>
              </button>
              <div class="rp-track-group-body">
              ${groups
                .map(({ player, spells: personSpells }) => {
                  const { who, accent, spec } = personBundleMeta(player);
                  return `<div class="rp-person-bundle" data-player="${player.playerId}" style="--class:${accent}">
                    <div class="rp-person-bundle-h" title="${escapeAttr(who + (spec ? " · " + spec : ""))}">
                      ${memberIconHtml(player)}
                      <div class="rp-pgroup-text">
                        <b>${who}</b>
                        <span>${spec}</span>
                      </div>
                      <button type="button" class="rp-wcl-mini ${wclPick?.playerId === player.playerId ? "on" : ""}" data-rp="wcl-player" data-player="${
                        player.playerId
                      }" title="${escapeAttr(
                        t(`${spec || ""} WCL 상위 ${WCL_TOP_N} 로그 보기`, `${spec || ""} WCL top ${WCL_TOP_N} logs`)
                      )}">WCL</button>
                      <em>${personSpells.length}</em>
                    </div>
                    <div class="rp-person-bundle-body">
                    ${personSpells
                      .map((sp) => {
                        const list = shownAssigns.filter((a) => a.spellId === sp.id && a.playerId === player.playerId);
                        const cd = effectiveCooldown(sp, player.playerId);
                        const overlap = cooldownOverlaps(list, cd);
                        const overlapBands = overlap.bands
                          .map((b) => {
                            const tip = escapeAttr(
                              t(
                                `쿨 겹침 · ${fmtTime(b.earlier.t)} 사용 → ${fmtTime(b.readyAt)} 이후 가능인데 ${fmtTime(b.later.t)}에 배치됨`,
                                `Cooldown overlap · used ${fmtTime(b.earlier.t)} → ready ${fmtTime(b.readyAt)}, placed at ${fmtTime(b.later.t)}`
                              )
                            );
                            return `<div class="rp-cd-overlap" style="left:${timeX(b.later.t)}px;width:${Math.max(
                              3,
                              (b.readyAt - b.later.t) * zoom
                            )}px" title="${tip}"></div>`;
                          })
                          .join("");
                        const zones = list
                          .map((a) => {
                            if (!cd) return "";
                            const start = Math.max(0, a.t - cd);
                            const end = Math.min(duration, a.t + cd);
                            const leftW = Math.max(0, a.t - start) * zoom;
                            const rightW = Math.max(0, end - a.t) * zoom;
                            const tip = escapeAttr(cellBlockedTitle({ type: "cd", assign: a, readyAt: a.t + cd }));
                            return `${
                              leftW > 0
                                ? `<div class="rp-cd-zone left" style="left:${timeX(start)}px;width:${leftW}px" title="${tip}"></div>`
                                : ""
                            }${
                              rightW > 0
                                ? `<div class="rp-cd-zone right" style="left:${timeX(a.t)}px;width:${rightW}px" title="${tip}"></div>`
                                : ""
                            }`;
                          })
                          .join("");
                        const marks = list
                          .map((a) => {
                            const dur = Math.max(0, Number(sp.duration) || 0);
                            const markPlayer = activeRoster().find((m) => m.playerId === a.playerId);
                            const markAccent = markPlayer?.color || classColor(markPlayer?.class || providerClassName(sp));
                            const durBar =
                              dur > 0
                                ? `<div class="rp-tl-dur" style="width:${dur * zoom}px" aria-hidden="true"></div>`
                                : "";
                            const clash = overlap.ids.has(a.id);
                            return `<div class="rp-tl-mark ${selectedAssignId === a.id ? "on" : ""} ${clash ? "clash" : ""}" style="left:${timeX(
                              a.t
                            )}px;--class:${markAccent}" data-tl-drag="1" title="${escapeAttr(
                              `${phaseRelLabel(a.t, a.ph)} (${fmtTime(a.t)})${
                                clash ? ` · ${t("쿨이 겹쳐서 이 타이밍엔 쓸 수 없습니다", "On cooldown here — cannot be used")}` : ""
                              }`
                            )}">
                              ${durBar}
                              ${assignChip(a, true, { tip: false })}
                              <span class="rp-tl-time">${fmtTime(a.t)}</span>
                              ${clash ? `<span class="rp-tl-clash">${t("쿨 겹침", "CD")}</span>` : ""}
                            </div>`;
                          })
                          .join("");
                        const ghosts = assignments
                          .filter((a) => a.spellId === sp.id && a.playerId === player.playerId && isHidden(a))
                          .map((a) => {
                            const x = Math.min(Number(a.t) || 0, duration);
                            const tip = `${phaseRelLabel(a.t, a.ph)} · ${hiddenReason(a)}`;
                            return `<div class="rp-tl-mark ghost" data-rp="ghost" data-id="${a.id}" style="left:${timeX(x)}px" title="${escapeAttr(tip)}">
                              <div class="rp-assign icon-only">${spellThumb(sp, "", { tip: false })}</div>
                              <span class="rp-tl-time">${fmtTime(a.t)}</span>
                              <span class="rp-tl-ghost">${t("페이즈 시간차", "Phase gap")}</span>
                            </div>`;
                          })
                          .join("");
                        const lanePhases = (events || [])
                          .filter((ev) => isPhaseEvent(ev))
                          .map((ev) => {
                            const band =
                              ev.varied && ev.maxSec > ev.minSec
                                ? `<div class="rp-phase-band lane" style="left:${timeX(ev.minSec)}px;width:${Math.max(
                                    4,
                                    (ev.maxSec - ev.minSec) * zoom
                                  )}px"></div>`
                                : "";
                            const idx = phaseIdxOf(ev);
                            return `${band}<div class="rp-phase-vline lane ${ev.varied ? "varied" : ""}" ${
                              idx == null ? "" : `data-phase-idx="${idx}"`
                            } style="left:${timeX(ev.t)}px"></div>`;
                          })
                          .join("");
                        return `<div class="rp-track">
                          <div class="rp-track-name" title="${escapeAttr(spellName(sp))}">
                            <span class="rp-track-spell-ico">${spellThumb(sp)}</span>
                            <b>${spellName(sp)}</b>
                          </div>
                          <div class="rp-track-lane" data-rp="lane" data-spell="${sp.id}" data-player="${player.playerId}">
                            ${lanePhases}
                            ${zones}
                            ${overlapBands}
                            ${ghosts}
                            ${marks}
                          </div>
                        </div>`;
                      })
                      .join("")}
                    </div>
                  </div>`;
                })
                .join("")}
              </div>
            </div>`;
          })
          .join("")}
      </div>
      </div>
    </div>`;
  }

  function bossPaneHeight() {
    if (bossPaneH == null) {
      const saved = Number(localStorage.getItem(BOSS_PANE_KEY));
      bossPaneH = saved > 0 ? saved : 0;
    }
    return bossPaneH;
  }

  function onSplitDown(e) {
    if (e.button !== 0) return;
    const handle = e.target.closest?.("[data-split]");
    if (!handle) return;
    const wrap = handle.closest(".rp-time-split");
    const top = wrap?.querySelector(".rp-time-top");
    if (!wrap || !top) return;
    e.preventDefault();
    splitDrag = { wrap, top, startY: e.clientY, startH: top.getBoundingClientRect().height };
    wrap.classList.add("dragging");
    try {
      handle.setPointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  function onSplitMove(e) {
    if (!splitDrag) return;
    const { wrap, top, startY, startH } = splitDrag;
    const maxH = Math.max(80, wrap.getBoundingClientRect().height - 90);
    const h = Math.round(Math.max(60, Math.min(maxH, startH + e.clientY - startY)));
    bossPaneH = h;
    wrap.style.setProperty("--boss-h", `${h}px`);
  }

  function onSplitUp() {
    if (!splitDrag) return;
    splitDrag.wrap.classList.remove("dragging");
    splitDrag = null;
    try {
      localStorage.setItem(BOSS_PANE_KEY, String(bossPaneH || 0));
    } catch (_) {
      /* ignore */
    }
  }

  function onSplitReset(e) {
    const handle = e.target.closest?.("[data-split]");
    if (!handle) return;
    bossPaneH = 0;
    try {
      localStorage.removeItem(BOSS_PANE_KEY);
    } catch (_) {
      /* ignore */
    }
    handle.closest(".rp-time-split")?.style.removeProperty("--boss-h");
  }

  /** 아래(공대원) 가로 스크롤을 위(보스)에 그대로 따라가게 */
  function bindTimelinePanes(box) {
    const top = box.querySelector(".rp-time-top");
    const bottom = box.querySelector(".rp-time-bottom");
    if (!top || !bottom) return;
    bottom.addEventListener("scroll", () => {
      if (top.scrollLeft !== bottom.scrollLeft) top.scrollLeft = bottom.scrollLeft;
    });
    top.addEventListener(
      "wheel",
      (e) => {
        const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
        if (!dx) return;
        e.preventDefault();
        bottom.scrollLeft += dx;
      },
      { passive: false }
    );
    top.scrollLeft = bottom.scrollLeft;
  }

  function mapCreditHtml() {
    return t(
      `맵 그림은 <a href="https://raidplan.io" target="_blank" rel="noopener noreferrer">raidplan.io</a>에서 허가를 받아 사용했습니다.`,
      `Arena maps used with permission from <a href="https://raidplan.io" target="_blank" rel="noopener noreferrer">raidplan.io</a>.`
    );
  }

  function ensureMapCredit() {
    const panel = document.querySelector("#rpBoard .rp-canvas-panel");
    if (!panel) return;
    let el = panel.querySelector(".rp-map-credit");
    if (!el) {
      el = document.createElement("p");
      el.className = "rp-map-credit";
      panel.appendChild(el);
    }
    el.innerHTML = mapCreditHtml();
  }

  function renderBoard(force) {
    const box = document.getElementById("rpBoard");
    if (!box) return;
    // 예전 마크업/레이아웃이면 다시 빌드
    if (boardReady && (!document.getElementById("rpPalette") || !document.querySelector(".rp-board-meta"))) {
      boardReady = false;
    }
    if (!boardReady || force) {
      box.innerHTML = `
        <div class="rp-board">
          <aside class="panel rp-side rp-board-side">
            <div class="rp-board-tools">
              <h3>${t("도구", "Tools")}</h3>
              <div class="rp-tool-grid" id="rpToolGrid"></div>
              <div class="rp-colors" id="rpColors"></div>
            </div>
            <div class="rp-palette-bar">
              <div class="g-screen-tabs rp-palette-tabs" id="rpPaletteTabs"></div>
              <kbd class="rp-palette-keys">Z/X</kbd>
            </div>
            <div class="rp-palette" id="rpPalette"></div>
            <div class="rp-mini-acts">
              <button class="ghost" data-rp="undo">${t("실행 취소", "Undo")}</button>
              <button class="ghost" data-rp="redo">${t("다시 실행", "Redo")}</button>
              <button class="danger" data-rp="clear-step">${t("이 스텝 지우기", "Clear step")}</button>
            </div>
          </aside>
          <section class="panel rp-canvas-panel">
            <div class="rp-map-variants" id="rpMapVariants"></div>
            <div class="rp-canvas-wrap" id="rpCanvasWrap">
              <canvas id="rpCanvas"></canvas>
            </div>
            <p class="rp-map-credit">${mapCreditHtml()}</p>
          </section>
          <aside class="panel rp-side rp-board-meta">
            <div class="rp-side-head">
              <h3>${t("스텝", "Steps")}</h3>
              <button type="button" class="primary" data-rp="board-share">${t("열람 링크", "Share link")}</button>
              <button class="ghost" data-rp="add-step">+</button>
            </div>
            <div class="rp-steps-scroll" id="rpSteps"></div>
            <h3>${t("오더 메모", "Order notes")}</h3>
            <textarea id="rpNotes" class="rp-notes" rows="6"></textarea>
          </aside>
        </div>
        <div class="rp-share-host"></div>`;
      boardReady = true;
      bindCanvas();
      global.BoardAssets?.ensureMarkerSheet?.(() => {
        if (tool === "board") drawBoard();
      });
    }
    renderBoardChrome();
    requestAnimationFrame(() => {
      resizeCanvas();
      drawBoard();
    });
  }

  function renderBoardChrome() {
    ensureMapCredit();
    const grid = document.getElementById("rpToolGrid");
    if (!grid) return;
    const tools = [
      ["select", t("선택 (V)", "Select (V)")],
      ["eraser", t("지우개 (E)", "Eraser (E)")],
      ["pen", t("펜 (B)", "Pen (B)")],
      ["arrow", t("화살표 (A)", "Arrow (A)")],
      ["line", t("선 (W)", "Line (W)")],
      ["rect", t("네모 (R)", "Rect (R)")],
      ["circle", t("원 (D)", "Ellipse (D)")],
      ["cone", t("원뿔 (C)", "Cone (C)")],
      ["text", t("글자 (F)", "Text (F)")],
    ];
    grid.innerHTML = tools
      .map(
        ([id, label]) =>
          `<button class="rp-tool-btn ${boardTool === id ? "on" : ""}" data-rp="board-tool" data-id="${id}">${label}</button>`
      )
      .join("");
    document.getElementById("rpColors").innerHTML = BOARD_COLORS.map(
      (c) =>
        `<button class="rp-color ${boardColor === c ? "on" : ""}" data-rp="board-color" data-id="${c}" style="background:${c}"></button>`
    ).join("");

    const mapVariants = document.getElementById("rpMapVariants");
    if (mapVariants) {
      const entries = global.BoardAssets?.bossMapEntries?.(bossId) || [];
      if (entries.length > 1) {
        if (!entries.some((m) => m.id === boardMapId)) boardMapId = entries[0].id;
        mapVariants.classList.remove("hidden");
        mapVariants.innerHTML = entries
          .map(
            (m) =>
              `<button type="button" class="rp-map-btn ${boardMapId === m.id ? "on" : ""}" data-rp="board-map" data-id="${escapeAttr(m.id)}">${escapeAttr(
                langRef() === "ko" ? m.labelKo : m.labelEn
              )}</button>`
          )
          .join("");
      } else {
        boardMapId = entries[0]?.id || null;
        mapVariants.classList.add("hidden");
        mapVariants.innerHTML = "";
      }
    }

    const tabs = [
      ["roster", t("공대원", "Roster")],
      ["elements", t("일반", "Elements")],
      ["boss", t("보스", "Boss")],
    ];
    const tabBox = document.getElementById("rpPaletteTabs");
    if (tabBox) {
      tabBox.innerHTML = tabs
        .map(
          ([id, label]) =>
            `<button type="button" class="g-screen-tab ${paletteTab === id ? "on" : ""}" data-rp="palette-tab" data-id="${id}">${label}</button>`
        )
        .join("");
    }
    const palette = document.getElementById("rpPalette");
    if (palette) palette.innerHTML = renderPaletteBody();

    const sideHead = document.querySelector("#rpBoard .rp-side-head");
    if (sideHead) {
      sideHead.innerHTML = shareReadonly
        ? `<h3>${t("스텝", "Steps")}</h3>`
        : `<h3>${t("스텝", "Steps")}</h3>
           <button type="button" class="primary" data-rp="board-share" ${shareBusy ? "disabled" : ""}>${
             shareBusy ? t("만드는 중…", "Creating…") : t("열람 링크", "Share link")
           }</button>
           <button class="ghost" data-rp="add-step">+</button>`;
    }

    const stepsBox = document.getElementById("rpSteps");
    if (stepsBox) {
      stepsBox.innerHTML = steps
        .map((s) => {
          const on = s.id === stepId;
          if (shareReadonly) {
            return `<div class="rp-step ${on ? "on" : ""}">
              <button class="rp-step-pick" data-rp="step" data-id="${s.id}"></button>
              <span class="rp-step-name">${escapeAttr(s.name)}</span>
            </div>`;
          }
          return `<div class="rp-step ${on ? "on" : ""}">
            <button class="rp-step-pick" data-rp="step" data-id="${s.id}"></button>
            <input data-rp="step-name" data-id="${s.id}" value="${escapeAttr(s.name)}">
            <button class="ghost" data-rp="del-step" data-id="${s.id}">×</button>
          </div>`;
        })
        .join("");
    }
    const notes = document.getElementById("rpNotes");
    if (notes && document.activeElement !== notes) notes.value = currentStep()?.notes || "";
    if (notes) {
      notes.readOnly = shareReadonly;
      notes.placeholder = shareReadonly ? "" : t("이 스텝 오더를 적습니다", "Write the order for this step");
    }
    let shareHost = document.querySelector("#rpBoard .rp-share-host");
    if (!shareHost) {
      const box = document.getElementById("rpBoard");
      if (box) {
        shareHost = document.createElement("div");
        shareHost.className = "rp-share-host";
        box.appendChild(shareHost);
      }
    }
    if (shareHost) shareHost.innerHTML = renderShareModal();
    updateBoardCursor();
  }

  function renderPaletteBody() {
    const assets = global.BoardAssets;
    const markerUv = assets?.MARKER_SHEET_UV || {
      star: [0, 0],
      circle: [1, 0],
      diamond: [2, 0],
      triangle: [3, 0],
      moon: [0, 1],
      square: [1, 1],
      cross: [2, 1],
      skull: [3, 1],
    };
    if (paletteTab === "roster") {
      const roster = sortedRoster(activeRoster());
      if (!roster.length) {
        return `<div class="rp-palette-empty">${t("로스터가 비어 있습니다.", "Roster is empty.")}</div>`;
      }
      return `<div class="rp-stamp-grid roster">${roster
        .map((m) => {
          const on = stamp?.kind === "player" && stamp.id === m.playerId;
          const icon = assets?.playerIconUrl?.(m);
          const iconCdn = assets?.iconCdnUrl?.(assets?.SPEC_ICONS?.[`${m.class}|${m.spec}`] || assets?.CLASS_ICONS?.[m.class]);
          const accent = m.color || classColor(m.class);
          return `<button type="button" class="rp-stamp player ${on ? "on" : ""}" data-rp="stamp" data-kind="player" data-id="${m.playerId}" style="--class:${accent}" title="${escapeAttr(memberLabel(m))}">
            <span class="rp-stamp-icon">${icon ? `<img src="${escapeAttr(icon)}" alt="" loading="lazy"${iconCdn ? ` onerror="this.onerror=null;this.src='${escapeAttr(iconCdn)}'"` : ""}>` : `<b>${escapeAttr(playerCallsign(m).slice(0, 2))}</b>`}</span>
            <span class="rp-stamp-meta">
              <b class="rp-callsign">${escapeAttr(playerCallsign(m))}</b>
              <em>${escapeAttr(roleLabel(m.role))}</em>
            </span>
          </button>`;
        })
        .join("")}</div>`;
    }

    if (paletteTab === "elements") {
      const els =
        assets?.generalElements?.() ||
        [
          { id: "mark-star", name: "Star", nameKo: "별", group: "marker", drawStyle: "marker-star", color: "#f2d45c", sheetKey: "star" },
          { id: "mark-circle", name: "Circle", nameKo: "동그라미", group: "marker", drawStyle: "marker-circle", color: "#e8913a", sheetKey: "circle" },
          { id: "mark-diamond", name: "Diamond", nameKo: "다이아", group: "marker", drawStyle: "marker-diamond", color: "#c45de0", sheetKey: "diamond" },
          { id: "mark-triangle", name: "Triangle", nameKo: "세모", group: "marker", drawStyle: "marker-triangle", color: "#5ecf5a", sheetKey: "triangle" },
          { id: "mark-moon", name: "Moon", nameKo: "달", group: "marker", drawStyle: "marker-moon", color: "#cfd8e6", sheetKey: "moon" },
          { id: "mark-square", name: "Square", nameKo: "네모", group: "marker", drawStyle: "marker-square", color: "#5b9dff", sheetKey: "square" },
          { id: "mark-cross", name: "Cross", nameKo: "가위표", group: "marker", drawStyle: "marker-cross", color: "#ff5b5b", sheetKey: "cross" },
          { id: "mark-skull", name: "Skull", nameKo: "해골", group: "marker", drawStyle: "marker-skull", color: "#f5f5f5", sheetKey: "skull" },
          { id: "role-tank", name: "Tank", nameKo: "탱", group: "role", color: "#4f86c6", icon: "inv_shield_06", iconUrl: "https://wow.zamimg.com/images/wow/icons/large/inv_shield_06.jpg" },
          { id: "role-heal", name: "Healer", nameKo: "힐", group: "role", color: "#5ecf7a", icon: "spell_holy_flashheal", iconUrl: "https://wow.zamimg.com/images/wow/icons/large/spell_holy_flashheal.jpg" },
          { id: "role-melee", name: "Melee", nameKo: "근딜", group: "role", color: "#e0674a", icon: "ability_warrior_challange", iconUrl: "https://wow.zamimg.com/images/wow/icons/large/ability_warrior_challange.jpg" },
          { id: "role-ranged", name: "Ranged", nameKo: "원딜", group: "role", color: "#d4a017", icon: "ability_marksmanship", iconUrl: "https://wow.zamimg.com/images/wow/icons/large/ability_marksmanship.jpg" },
        ];
      const groups = [
        { id: "marker", ko: "징표", en: "Markers" },
        { id: "role", ko: "역할", en: "Roles" },
      ];
      return groups
        .map((g) => {
          const items = els.filter((e) => e.group === g.id);
          if (!items.length) return "";
          return `<div class="rp-stamp-group">
            <div class="rp-stamp-group-h">${t(g.ko, g.en)}</div>
            <div class="rp-stamp-grid elements">${items
              .map((el) => {
                const on = stamp?.kind === "element" && stamp.id === el.id;
                const uv = el.sheetKey ? markerUv[el.sheetKey] : null;
                const cdn = el.icon ? `https://wow.zamimg.com/images/wow/icons/large/${String(el.icon).replace(/\.jpg$/i, "")}.jpg` : "";
                const preview = el.iconUrl
                  ? `<img src="${escapeAttr(el.iconUrl)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${escapeAttr(cdn)}'">`
                  : uv
                    ? `<span class="rp-marker-sheet" style="--mx:${uv[0]};--my:${uv[1]}"></span>`
                    : `<span class="rp-marker-chip" data-style="${escapeAttr(el.drawStyle || "")}" style="--c:${el.color}"></span>`;
                return `<button type="button" class="rp-stamp element ${on ? "on" : ""}" data-rp="stamp" data-kind="element" data-id="${el.id}" title="${escapeAttr(langRef() === "ko" ? el.nameKo : el.name)}">
                  <span class="rp-stamp-icon">${preview}</span>
                  <span class="rp-stamp-meta"><b>${escapeAttr(langRef() === "ko" ? el.nameKo : el.name)}</b></span>
                </button>`;
              })
              .join("")}</div>
          </div>`;
        })
        .join("");
    }

    // boss
    const units = assets?.bossUnits?.(bossId) || [];
    if (!units.length) {
      return `<div class="rp-palette-empty">
        <p>${t("이 보스의 쫄·네임드 이미지가 아직 없습니다.", "No add/named images for this boss yet.")}</p>
      </div>`;
    }
    return `<div class="rp-stamp-grid boss">${units
      .map((u) => {
        const on = stamp?.kind === "boss" && stamp.id === u.id;
        const icon = u.iconUrl
          ? `<img src="${escapeAttr(u.iconUrl)}" alt="" loading="lazy">`
          : `<b>${escapeAttr((u.label || "?").slice(0, 2))}</b>`;
        return `<button type="button" class="rp-stamp boss ${on ? "on" : ""}" data-rp="stamp" data-kind="boss" data-id="${u.id}" style="--class:${u.color || "#ff6b72"}" title="${escapeAttr(langRef() === "ko" ? u.nameKo || u.name : u.name)}">
          <span class="rp-stamp-icon">${icon}</span>
          <span class="rp-stamp-meta"><b>${escapeAttr(langRef() === "ko" ? u.nameKo || u.name : u.name)}</b></span>
        </button>`;
      })
      .join("")}</div>`;
  }

  function escapeAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function bindCanvas() {
    const canvas = document.getElementById("rpCanvas");
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = "1";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("dblclick", onCanvasDblClick);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("contextmenu", onCanvasContextMenu);
    const wrap = document.getElementById("rpCanvasWrap");
    if (wrap && global.ResizeObserver) {
      new ResizeObserver(() => {
        if (tool !== "board") return;
        resizeCanvas();
        drawBoard();
      }).observe(wrap);
    }
    updateBoardCursor();
    if (!bindCanvas.resizeBound) {
      bindCanvas.resizeBound = true;
      window.addEventListener("resize", () => {
        if (tool === "board") {
          resizeCanvas();
          drawBoard();
        }
      });
    }
  }

  function canvasPoint(e) {
    const canvas = document.getElementById("rpCanvas");
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { x: sx / scale, y: sy / scale, sx, sy };
  }

  function createStampToken(x, y) {
    const assets = global.BoardAssets;
    const kind = stamp?.kind || "player";
    const id = stamp?.id;

    if (kind === "element") {
      const el =
        assets?.findElement?.(id) ||
        (assets?.generalElements?.() || []).find((e) => e.id === id) ||
        null;
      if (!el) return null;
      return {
        id: uid("obj"),
        type: "token",
        kind: "element",
        elementId: el.id,
        x,
        y,
        r: 14,
        rot: 0,
        color: el.color || boardColor,
        label: langRef() === "ko" ? el.nameKo : el.name,
        iconUrl: el.iconUrl || null,
        drawStyle: el.drawStyle || null,
      };
    }

    if (kind === "boss") {
      const unit = assets?.findBossUnit?.(bossId, id);
      if (!unit) return null;
      return {
        id: uid("obj"),
        type: "token",
        kind: "boss",
        elementId: unit.id,
        x,
        y,
        r: 17,
        rot: 0,
        color: unit.color || "#ff6b72",
        label: langRef() === "ko" ? unit.nameKo || unit.name : unit.name,
        iconUrl: unit.iconUrl || null,
        drawStyle: null,
      };
    }

    const player =
      activeRoster().find((m) => m.playerId === (id || selectedPlayerId)) || activeRoster()[0];
    if (!player) return null;
    return {
      id: uid("obj"),
      type: "token",
      kind: "player",
      x,
      y,
      r: 14,
      rot: 0,
      color: player.color || classColor(player.class) || boardColor,
      label: playerCallsign(player),
      playerId: player.playerId,
      iconUrl: assets?.playerIconUrl?.(player) || null,
      drawStyle: null,
    };
  }

  function loadIcon(url) {
    if (!url) return null;
    let entry = iconCache.get(url);
    if (entry?.img?.complete && entry.img.naturalWidth) return entry.img;
    if (entry?.failed) {
      const cdn = localIconToCdn(url);
      if (cdn && cdn !== url) return loadIcon(cdn);
      return null;
    }
    if (!entry) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        iconCache.set(url, { img, failed: false });
        if (tool === "board") drawBoard();
      };
      img.onerror = () => {
        iconCache.set(url, { img, failed: true });
        const cdn = localIconToCdn(url);
        if (cdn) loadIcon(cdn);
        else if (tool === "board") drawBoard();
      };
      img.src = url;
      iconCache.set(url, { img, failed: false });
      return null;
    }
    return null;
  }

  function localIconToCdn(url) {
    const m = String(url || "").match(/(?:^|\/)assets\/icons\/([^/]+)\.jpe?g$/i);
    if (!m) return null;
    return global.BoardAssets?.iconCdnUrl?.(m[1]) || null;
  }

  function eraseAt(x, y) {
    const hit = hitTest(x, y);
    if (!hit || !erasing) return false;
    const step = currentStep();
    step.objects = step.objects.filter((o) => o.id !== hit.id);
    selectedObjIds.delete(hit.id);
    if (handlePreviewId === hit.id) handlePreviewId = null;
    erasing.erased = true;
    drawBoard();
    return true;
  }

  function moveObjBy(obj, dx, dy) {
    if (!obj || (!dx && !dy)) return;
    if (obj.type === "arrow" || obj.type === "line") {
      obj.x1 += dx;
      obj.y1 += dy;
      obj.x2 += dx;
      obj.y2 += dy;
    } else if (obj.type === "pen" && Array.isArray(obj.points)) {
      obj.points.forEach((pt) => {
        pt.x += dx;
        pt.y += dy;
      });
    } else {
      obj.x = (obj.x ?? 0) + dx;
      obj.y = (obj.y ?? 0) + dy;
    }
  }

  function selectedSingleObj() {
    if (selectedObjIds.size !== 1) return null;
    const id = [...selectedObjIds][0];
    return (currentStep()?.objects || []).find((obj) => obj.id === id) || null;
  }

  function handleTargetObj() {
    const selected = selectedSingleObj();
    if (canTransform(selected)) return selected;
    if (!handlePreviewId) return null;
    const preview = (currentStep()?.objects || []).find((obj) => obj.id === handlePreviewId);
    return canTransform(preview) ? preview : null;
  }

  function beginHandleDrag(handle, p) {
    const obj = (currentStep()?.objects || []).find((o) => o.id === handle.id);
    if (!obj) return false;
    // 핸들을 잡는 순간에야 선택
    selectedObjIds = new Set([obj.id]);
    handlePreviewId = obj.id;
    pushUndo();
    const c = objCenter(obj);
    const size = Math.max(1, objSize(obj));
    const rot = objRot(obj);
    // 리사이즈 핸들 방향(중심→핸들). 반대쪽을 앵커로 고정한다.
    const axis = { x: Math.cos(rot), y: Math.sin(rot) };
    // 원뿔은 꼭짓점이 고정점. 그 외는 핸들 반대쪽 가장자리.
    const anchor =
      obj.type === "cone"
        ? { x: obj.x ?? 0, y: obj.y ?? 0 }
        : {
            x: (c?.x || 0) - axis.x * size,
            y: (c?.y || 0) - axis.y * size,
          };
    dragging = {
      mode: handle.mode,
      id: handle.id,
      startR: size,
      startRot: rot,
      startAng: Math.atan2(p.y - (c?.y || 0), p.x - (c?.x || 0)),
      axis,
      anchor,
      startCenter: c ? { x: c.x, y: c.y } : { x: 0, y: 0 },
      startW: obj.w || 0,
      startH: obj.h || 0,
      startX1: obj.x1,
      startY1: obj.y1,
      startX2: obj.x2,
      startY2: obj.y2,
      moved: false,
    };
    updateBoardCursor(handle.mode);
    drawBoard();
    return true;
  }

  function canTransform(o) {
    return !!o && ["token", "circle", "rect", "arrow", "line", "cone", "text"].includes(o.type);
  }

  function objCenter(o) {
    if (!o) return null;
    if (o.type === "arrow" || o.type === "line") {
      return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
    }
    if (o.type === "rect") {
      return { x: o.x + (o.w || 0) / 2, y: o.y + (o.h || 0) / 2 };
    }
    return { x: o.x ?? 0, y: o.y ?? 0 };
  }

  function objSize(o) {
    if (!o) return 16;
    if (o.type === "token" || o.type === "circle") return o.r || 16;
    if (o.type === "cone") return o.len || 40;
    if (o.type === "text") return o.scale || 16;
    if (o.type === "rect") return Math.max(8, Math.hypot(o.w || 0, o.h || 0) / 2);
    if (o.type === "arrow" || o.type === "line") {
      return Math.max(4, Math.hypot((o.x2 || 0) - (o.x1 || 0), (o.y2 || 0) - (o.y1 || 0)) / 2);
    }
    return 16;
  }

  function objRot(o) {
    if (!o) return 0;
    if (o.type === "arrow" || o.type === "line") {
      return Math.atan2((o.y2 || 0) - (o.y1 || 0), (o.x2 || 0) - (o.x1 || 0));
    }
    if (o.type === "cone") return o.rot || 0;
    return o.rot || 0;
  }

  function transformHandlePoints(o) {
    const c = objCenter(o);
    const size = objSize(o);
    const rot = objRot(o);
    const tip = {
      x: c.x + Math.cos(rot) * size,
      y: c.y + Math.sin(rot) * size,
    };
    const resize = { ...tip };
    // 원뿔: 끝(팁) 근처에서 회전 / 그 외: 중심 옆 짧은 암
    const arm = Math.min(22, 12 + Math.min(size, 60) * 0.1);
    let rotate;
    let pivot = c;
    if (o.type === "cone") {
      pivot = tip;
      rotate = {
        x: tip.x + Math.cos(rot - Math.PI / 2) * arm,
        y: tip.y + Math.sin(rot - Math.PI / 2) * arm,
      };
    } else {
      rotate = {
        x: c.x + Math.cos(rot - Math.PI / 2) * arm,
        y: c.y + Math.sin(rot - Math.PI / 2) * arm,
      };
    }
    return { c, size, rot, resize, rotate, arm, tip, pivot };
  }

  function hitTransformHandle(x, y) {
    const o = handleTargetObj();
    if (!canTransform(o)) return null;
    const hs = transformHandlePoints(o);
    const tol = 10;
    if (Math.hypot(x - hs.rotate.x, y - hs.rotate.y) <= tol) {
      return { mode: "rotate", id: o.id };
    }
    if (Math.hypot(x - hs.resize.x, y - hs.resize.y) <= tol) {
      return { mode: "resize", id: o.id };
    }
    return null;
  }

  function applyObjSize(o, size) {
    if (!o) return;
    if (o.type === "token" || o.type === "circle") {
      o.r = Math.min(480, Math.max(6, size));
      return;
    }
    if (o.type === "cone") {
      o.len = Math.min(2400, Math.max(36, size));
      return;
    }
    if (o.type === "text") {
      o.scale = Math.min(200, Math.max(12, size));
      return;
    }
    if (o.type === "rect") {
      const c = objCenter(o);
      const cur = Math.max(1, objSize(o));
      const s = Math.min(1200, Math.max(14, size)) / cur;
      o.w = (o.w || 0) * s;
      o.h = (o.h || 0) * s;
      if (Math.abs(o.w) < 14) o.w = o.w < 0 ? -14 : 14;
      if (Math.abs(o.h) < 14) o.h = o.h < 0 ? -14 : 14;
      o.x = c.x - o.w / 2;
      o.y = c.y - o.h / 2;
      return;
    }
    if (o.type === "arrow" || o.type === "line") {
      const c = objCenter(o);
      const rot = objRot(o);
      const half = Math.min(1200, Math.max(14, size));
      o.x1 = c.x - Math.cos(rot) * half;
      o.y1 = c.y - Math.sin(rot) * half;
      o.x2 = c.x + Math.cos(rot) * half;
      o.y2 = c.y + Math.sin(rot) * half;
    }
  }

  /** 핸들 쪽만 늘리고, 반대쪽(앵커)은 고정. 중심을 지나도 반대로 커지지 않음. */
  function applyDirectionalResize(obj, p, drag) {
    if (!obj || !drag?.axis || !drag?.anchor) {
      const c = objCenter(obj);
      if (c) applyObjSize(obj, Math.hypot(p.x - c.x, p.y - c.y));
      return;
    }
    const ax = drag.axis.x;
    const ay = drag.axis.y;
    const to = { x: p.x - drag.anchor.x, y: p.y - drag.anchor.y };
    // 핸들 축으로의 투영(직경). 음수면 앵커 너머 → 최소 크기로 클램프
    const projected = to.x * ax + to.y * ay;

    if (obj.type === "token" || obj.type === "circle") {
      const diameter = Math.min(960, Math.max(12, projected));
      const r = diameter / 2;
      obj.r = r;
      obj.x = drag.anchor.x + ax * r;
      obj.y = drag.anchor.y + ay * r;
      return;
    }

    if (obj.type === "cone") {
      // 꼭짓점(obj.x/y) 고정, 길이만 핸들 방향으로
      const len = Math.min(2400, Math.max(36, projected));
      obj.len = len;
      return;
    }

    if (obj.type === "text") {
      const size = Math.min(200, Math.max(12, projected));
      const half = size / 2;
      obj.scale = size;
      obj.x = drag.anchor.x + ax * half;
      obj.y = drag.anchor.y + ay * half;
      return;
    }

    if (obj.type === "rect") {
      const startHalf = Math.max(1, drag.startR || 1);
      const diameter = Math.min(2400, Math.max(28, projected));
      const s = diameter / (startHalf * 2);
      const w = (drag.startW || 0) * s;
      const h = (drag.startH || 0) * s;
      obj.w = Math.abs(w) < 14 ? (w < 0 ? -14 : 14) : w;
      obj.h = Math.abs(h) < 14 ? (h < 0 ? -14 : 14) : h;
      // 중심 = 앵커에서 핸들 방향으로 half
      const half = diameter / 2;
      const cx = drag.anchor.x + ax * half;
      const cy = drag.anchor.y + ay * half;
      obj.x = cx - obj.w / 2;
      obj.y = cy - obj.h / 2;
      return;
    }

    if (obj.type === "arrow" || obj.type === "line") {
      // 반대쪽 끝점 고정, 핸들 쪽 끝점만 이동
      const len = Math.min(2400, Math.max(28, projected));
      obj.x1 = drag.anchor.x;
      obj.y1 = drag.anchor.y;
      obj.x2 = drag.anchor.x + ax * len;
      obj.y2 = drag.anchor.y + ay * len;
    }
  }

  function applyObjRot(o, rot) {
    if (!o) return;
    if (o.type === "token" || o.type === "circle" || o.type === "text" || o.type === "rect") {
      o.rot = rot;
      return;
    }
    if (o.type === "cone") {
      o.rot = rot;
      return;
    }
    if (o.type === "arrow" || o.type === "line") {
      const c = objCenter(o);
      const half = objSize(o);
      o.x1 = c.x - Math.cos(rot) * half;
      o.y1 = c.y - Math.sin(rot) * half;
      o.x2 = c.x + Math.cos(rot) * half;
      o.y2 = c.y + Math.sin(rot) * half;
    }
  }

  function drawTransformHandles(ctx, o) {
    const hs = transformHandlePoints(o);
    const lw = 1.5 / Math.max(0.001, scale);
    ctx.save();
    ctx.strokeStyle = "#69b0ff";
    ctx.fillStyle = "#eff5fc";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(hs.pivot.x, hs.pivot.y);
    ctx.lineTo(hs.rotate.x, hs.rotate.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hs.rotate.x, hs.rotate.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hs.resize.x, hs.resize.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#f2b84b";
    ctx.fill();
    ctx.stroke();
    const b = objBounds(o);
    if (b) {
      ctx.strokeStyle = "rgba(105,176,255,0.85)";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function selectAfterCreate(obj) {
    if (!obj) return;
    selectedObjIds = new Set([obj.id]);
    setBoardTool("select");
  }

  function objBounds(o) {
    if (!o) return null;
    if (o.type === "pen" && o.points?.length) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      o.points.forEach((pt) => {
        x0 = Math.min(x0, pt.x);
        y0 = Math.min(y0, pt.y);
        x1 = Math.max(x1, pt.x);
        y1 = Math.max(y1, pt.y);
      });
      const pad = (o.width || 2.5) + 4;
      return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
    }
    if (o.type === "circle" || o.type === "token") {
      const r = (o.r || 16) + 2;
      return { x0: o.x - r, y0: o.y - r, x1: o.x + r, y1: o.y + r };
    }
    if (o.type === "rect") {
      const rot = o.rot || 0;
      if (!rot) {
        return {
          x0: Math.min(o.x, o.x + o.w),
          y0: Math.min(o.y, o.y + o.h),
          x1: Math.max(o.x, o.x + o.w),
          y1: Math.max(o.y, o.y + o.h),
        };
      }
      const c = objCenter(o);
      const hw = (o.w || 0) / 2;
      const hh = (o.h || 0) / 2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const corners = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].map(([lx, ly]) => ({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos }));
      return {
        x0: Math.min(...corners.map((p) => p.x)),
        y0: Math.min(...corners.map((p) => p.y)),
        x1: Math.max(...corners.map((p) => p.x)),
        y1: Math.max(...corners.map((p) => p.y)),
      };
    }
    if (o.type === "text") {
      const { w, h } = textMetrics(o);
      const rot = o.rot || 0;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const hw = w / 2 + 4;
      const hh = h / 2 + 4;
      const corners = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].map(([lx, ly]) => ({
        x: o.x + lx * cos - ly * sin,
        y: o.y + lx * sin + ly * cos,
      }));
      return {
        x0: Math.min(...corners.map((p) => p.x)),
        y0: Math.min(...corners.map((p) => p.y)),
        x1: Math.max(...corners.map((p) => p.x)),
        y1: Math.max(...corners.map((p) => p.y)),
      };
    }
    if (o.type === "arrow" || o.type === "line") {
      return {
        x0: Math.min(o.x1, o.x2) - 4,
        y0: Math.min(o.y1, o.y2) - 4,
        x1: Math.max(o.x1, o.x2) + 4,
        y1: Math.max(o.y1, o.y2) + 4,
      };
    }
    if (o.type === "cone") {
      const len = o.len || 0;
      return { x0: o.x - len, y0: o.y - len, x1: o.x + len, y1: o.y + len };
    }
    return null;
  }

  function rectsIntersect(a, b) {
    return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
  }

  function normalizeMarquee(m) {
    return {
      x0: Math.min(m.x1, m.x2),
      y0: Math.min(m.y1, m.y2),
      x1: Math.max(m.x1, m.x2),
      y1: Math.max(m.y1, m.y2),
    };
  }

  function onCanvasContextMenu(e) {
    e.preventDefault();
  }

  function onPointerDown(e) {
    if (shareReadonly) return;
    const canvas = document.getElementById("rpCanvas");
    canvas.setPointerCapture?.(e.pointerId);
    const p = canvasPoint(e);
    // 우클릭: 어떤 도구든 지우기 (드래그로 연속 삭제)
    if (e.button === 2) {
      e.preventDefault();
      pushUndo();
      erasing = { erased: false };
      updateBoardCursor();
      eraseAt(p.x, p.y);
      return;
    }
    if (e.button === 1) return;
    if (boardTool === "select") {
      const handle = hitTransformHandle(p.x, p.y);
      if (handle) {
        beginHandleDrag(handle, p);
        return;
      }
      const hit = hitTest(p.x, p.y);
      const additive = !!e.shiftKey;
      if (hit) {
        handlePreviewId = null;
        if (additive) {
          if (selectedObjIds.has(hit.id)) selectedObjIds.delete(hit.id);
          else selectedObjIds.add(hit.id);
        } else if (!selectedObjIds.has(hit.id)) {
          selectedObjIds = new Set([hit.id]);
        }
        if (selectedObjIds.has(hit.id)) {
          pushUndo();
          dragging = { mode: "move", lastX: p.x, lastY: p.y, ids: [...selectedObjIds], moved: false };
        }
      } else {
        if (!additive) selectedObjIds.clear();
        handlePreviewId = null;
        marquee = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, additive };
      }
      updateBoardCursor(!!hit);
      drawBoard();
      return;
    }
    // 토큰 미리보기 핸들 / 선택 핸들 우선 (도구 유지)
    {
      const handle = hitTransformHandle(p.x, p.y);
      if (handle) {
        beginHandleDrag(handle, p);
        return;
      }
    }
    if (boardTool === "eraser") {
      pushUndo();
      erasing = { erased: false };
      updateBoardCursor();
      eraseAt(p.x, p.y);
      return;
    }
    if (boardTool === "pen") {
      pushUndo();
      drawingPen = {
        id: uid("obj"),
        type: "pen",
        points: [{ x: p.x, y: p.y }],
        color: boardColor,
        width: 2.5,
      };
      updateBoardCursor();
      drawBoard();
      return;
    }
    if (boardTool === "token") {
      pushUndo();
      const obj = createStampToken(p.x, p.y);
      if (!obj) {
        undoStack.pop();
        return;
      }
      currentStep().objects.push(obj);
      handlePreviewId = null;
      selectAfterCreate(obj);
      drawBoard();
      saveState();
      return;
    }
    if (boardTool === "text") {
      const hit = hitTest(p.x, p.y);
      if (hit?.type === "text") {
        selectedObjIds = new Set([hit.id]);
        setBoardTool("select");
        beginTextEditor(hit, { focus: true, selectAll: true });
        drawBoard();
        return;
      }
      pushUndo();
      const obj = { id: uid("obj"), type: "text", x: p.x, y: p.y, color: boardColor, label: "", scale: 16, rot: 0 };
      currentStep().objects.push(obj);
      selectAfterCreate(obj);
      beginTextEditor(obj, { focus: true, fresh: true });
      drawBoard();
      return;
    }
    pushUndo();
    drawing = { tool: boardTool, x: p.x, y: p.y, x2: p.x, y2: p.y, color: boardColor };
  }

  function onPointerMove(e) {
    const p = canvasPoint(e);
    if (erasing) {
      eraseAt(p.x, p.y);
      return;
    }
    if (drawingPen) {
      const last = drawingPen.points[drawingPen.points.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.2) {
        drawingPen.points.push({ x: p.x, y: p.y });
        drawBoard();
      }
      return;
    }
    if (marquee) {
      marquee.x2 = p.x;
      marquee.y2 = p.y;
      drawBoard();
      return;
    }
    if (dragging?.mode === "move") {
      const dx = p.x - dragging.lastX;
      const dy = p.y - dragging.lastY;
      if (!dx && !dy) return;
      dragging.lastX = p.x;
      dragging.lastY = p.y;
      dragging.moved = true;
      const objs = currentStep().objects;
      dragging.ids.forEach((id) => {
        const obj = objs.find((o) => o.id === id);
        if (obj) moveObjBy(obj, dx, dy);
      });
      drawBoard();
      return;
    }
    if (dragging?.mode === "resize" || dragging?.mode === "rotate") {
      const obj = (currentStep()?.objects || []).find((o) => o.id === dragging.id);
      if (!obj || !canTransform(obj)) return;
      if (dragging.mode === "resize") {
        applyDirectionalResize(obj, p, dragging);
      } else if (obj.type === "cone") {
        // 원뿔: 끝(팁)을 잡고 시작점(꼭짓점) 기준으로 방향만 돌림
        applyObjRot(obj, Math.atan2(p.y - obj.y, p.x - obj.x));
      } else {
        const c = objCenter(obj);
        applyObjRot(obj, Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2);
      }
      dragging.moved = true;
      drawBoard();
      return;
    }
    if (dragging) {
      const obj = currentStep().objects.find((o) => o.id === dragging.id);
      if (!obj) return;
      if (obj.type === "arrow" || obj.type === "line") {
        const dx = p.x - dragging.dx - obj.x1;
        const dy = p.y - dragging.dy - obj.y1;
        obj.x1 += dx;
        obj.y1 += dy;
        obj.x2 += dx;
        obj.y2 += dy;
      } else {
        obj.x = p.x - dragging.dx;
        obj.y = p.y - dragging.dy;
      }
      drawBoard();
      return;
    }
    if (drawing) {
      drawing.x2 = p.x;
      drawing.y2 = p.y;
      drawBoard();
      return;
    }
    const handle = hitTransformHandle(p.x, p.y);
    if (handle) updateBoardCursor(handle.mode);
    else if (boardTool === "select") updateBoardCursor(!!hitTest(p.x, p.y));
  }

  function onPointerUp() {
    if (erasing) {
      if (!erasing.erased) undoStack.pop();
      else saveState();
      erasing = null;
      updateBoardCursor();
      return;
    }
    if (drawingPen) {
      const stroke = drawingPen;
      drawingPen = null;
      if (!stroke.points || stroke.points.length < 2) undoStack.pop();
      else currentStep().objects.push(stroke);
      drawBoard();
      updateBoardCursor();
      saveState();
      return;
    }
    if (marquee) {
      const box = normalizeMarquee(marquee);
      const bigEnough = Math.abs(marquee.x2 - marquee.x1) > 3 || Math.abs(marquee.y2 - marquee.y1) > 3;
      if (bigEnough) {
        const hits = (currentStep()?.objects || []).filter((o) => {
          const b = objBounds(o);
          return b && rectsIntersect(box, b);
        });
        if (marquee.additive) {
          hits.forEach((o) => selectedObjIds.add(o.id));
        } else {
          selectedObjIds = new Set(hits.map((o) => o.id));
        }
      }
      marquee = null;
      drawBoard();
      updateBoardCursor();
      return;
    }
    if (dragging) {
      if ((dragging.mode === "move" || dragging.mode === "resize" || dragging.mode === "rotate") && !dragging.moved) {
        undoStack.pop();
      }
      dragging = null;
      updateBoardCursor();
      saveState();
      return;
    }
    if (!drawing) {
      updateBoardCursor();
      return;
    }
    const d = drawing;
    drawing = null;
    const obj = shapeFromDraft(d);
    if (obj) {
      currentStep().objects.push(obj);
      selectAfterCreate(obj);
    } else undoStack.pop();
    drawBoard();
    updateBoardCursor();
    saveState();
  }

  function shapeFromDraft(d) {
    const dx = d.x2 - d.x;
    const dy = d.y2 - d.y;
    if (d.tool === "circle") {
      const r = Math.hypot(dx, dy);
      if (r < 12) return null;
      return { id: uid("obj"), type: "circle", x: d.x, y: d.y, r, rot: 0, color: d.color };
    }
    if (d.tool === "rect") {
      if (Math.abs(dx) < 14 || Math.abs(dy) < 14) return null;
      return { id: uid("obj"), type: "rect", x: d.x, y: d.y, w: dx, h: dy, rot: 0, color: d.color };
    }
    if (d.tool === "arrow" || d.tool === "line") {
      if (Math.hypot(dx, dy) < 28) return null;
      return { id: uid("obj"), type: d.tool, x1: d.x, y1: d.y, x2: d.x2, y2: d.y2, color: d.color };
    }
    if (d.tool === "cone") {
      const len = Math.hypot(dx, dy);
      if (len < 36) return null;
      return { id: uid("obj"), type: "cone", x: d.x, y: d.y, rot: Math.atan2(dy, dx), len, spread: 0.7, color: d.color };
    }
    return null;
  }

  function cloneStep() {
    return JSON.parse(JSON.stringify(currentStep().objects));
  }

  function pushUndo() {
    undoStack.push(cloneStep());
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    dropTextEditor();
    redoStack.push(cloneStep());
    currentStep().objects = undoStack.pop();
    drawBoard();
    saveState();
  }

  function redo() {
    if (!redoStack.length) return;
    dropTextEditor();
    undoStack.push(cloneStep());
    currentStep().objects = redoStack.pop();
    drawBoard();
    saveState();
  }

  function hitTest(x, y) {
    const objs = currentStep()?.objects || [];
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type === "circle" || o.type === "token") {
        if (Math.hypot(x - o.x, y - o.y) <= (o.r || 16) + 4) return o;
      } else if (o.type === "rect") {
        const rot = o.rot || 0;
        if (!rot) {
          const x0 = Math.min(o.x, o.x + o.w);
          const x1 = Math.max(o.x, o.x + o.w);
          const y0 = Math.min(o.y, o.y + o.h);
          const y1 = Math.max(o.y, o.y + o.h);
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return o;
        } else {
          const c = objCenter(o);
          const dx = x - c.x;
          const dy = y - c.y;
          const cos = Math.cos(-rot);
          const sin = Math.sin(-rot);
          const lx = dx * cos - dy * sin;
          const ly = dx * sin + dy * cos;
          const hw = Math.abs(o.w || 0) / 2;
          const hh = Math.abs(o.h || 0) / 2;
          if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return o;
        }
      } else if (o.type === "text") {
        if (hitText(o, x, y)) return o;
      } else if (o.type === "arrow" || o.type === "line") {
        if (distToSeg(x, y, o.x1, o.y1, o.x2, o.y2) < 8) return o;
      } else if (o.type === "pen" && o.points?.length) {
        const tol = (o.width || 2.5) + 6;
        for (let j = 1; j < o.points.length; j++) {
          const a = o.points[j - 1];
          const b = o.points[j];
          if (distToSeg(x, y, a.x, a.y, b.x, b.y) <= tol) return o;
        }
      } else if (o.type === "cone") {
        if (Math.hypot(x - o.x, y - o.y) < o.len) return o;
      }
    }
    return null;
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function resizeCanvas() {
    const canvas = document.getElementById("rpCanvas");
    const wrap = document.getElementById("rpCanvasWrap");
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const availW = wrap.clientWidth || 800;
    const availH = wrap.clientHeight || 450;
    scale = Math.min(availW / BOARD_W, availH / BOARD_H);
    const w = Math.floor(BOARD_W * scale);
    const h = Math.floor(BOARD_H * scale);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function textMetrics(o) {
    const sc = Math.max(12, Number(o?.scale) || 16);
    const label = String(o?.label || "");
    let width = Math.max(sc, label.length * sc * 0.6);
    const ctx = document.getElementById("rpCanvas")?.getContext("2d");
    if (ctx) {
      ctx.save();
      ctx.font = `700 ${sc}px sans-serif`;
      if (label) width = Math.max(sc, ctx.measureText(label).width);
      ctx.restore();
    }
    return { w: width, h: sc * 1.25 };
  }

  function hitText(o, x, y) {
    const { w, h } = textMetrics(o);
    const dx = x - o.x;
    const dy = y - o.y;
    const rot = -(o.rot || 0);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= w / 2 + 8 && Math.abs(ly) <= h / 2 + 8;
  }

  function selectedSingleText() {
    if (selectedObjIds.size !== 1) return null;
    const id = selectedObjIds.values().next().value;
    const o = (currentStep()?.objects || []).find((x) => x.id === id);
    return o?.type === "text" ? o : null;
  }

  function textEditorInput() {
    return document.querySelector("#rpCanvasWrap .rp-text-edit");
  }

  function placeTextEditor(o, input) {
    const canvas = document.getElementById("rpCanvas");
    const wrap = document.getElementById("rpCanvasWrap");
    if (!canvas || !wrap || !input || !o) return;
    const metrics = textMetrics(o);
    const canvasRect = canvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const cx = canvasRect.left - wrapRect.left + o.x * scale;
    const cy = canvasRect.top - wrapRect.top + o.y * scale;
    const half = (metrics.h * scale) / 2;
    const inputH = 32;
    let top = cy + half + 6;
    if (top + inputH > wrapRect.height - 4) top = Math.max(4, cy - half - inputH - 6);
    input.style.left = `${cx}px`;
    input.style.top = `${top}px`;
    input.style.width = `${Math.min(360, Math.max(140, metrics.w * scale + 28))}px`;
  }

  function dropTextEditor() {
    textEditor = null;
    textEditorInput()?.remove();
  }

  function finishTextEditor() {
    if (!textEditor || textEditor.closing) return;
    const ed = textEditor;
    ed.closing = true;
    textEditor = null;
    const input = textEditorInput();
    const label = String(input?.value || "").trim();
    input?.remove();
    const step = currentStep();
    const o = step?.objects?.find((x) => x.id === ed.id);
    let changed = false;
    if (o) {
      if (!label) {
        if (ed.fresh) {
          step.objects = step.objects.filter((x) => x.id !== ed.id);
          selectedObjIds.delete(ed.id);
          const now = JSON.stringify(step.objects);
          const top = undoStack[undoStack.length - 1];
          if (top && JSON.stringify(top) === now) undoStack.pop();
          changed = true;
        } else if ((o.label || "") !== ed.original) {
          o.label = ed.original;
          changed = true;
        }
      } else if (label !== ed.original) {
        o.label = label;
        changed = true;
      }
    }
    if (changed) {
      saveState();
      textEditorRepaint = true;
    }
    if (!boardPainting) drawBoard();
  }

  function onTextEditorInput(e) {
    if (!textEditor) return;
    const o = (currentStep()?.objects || []).find((x) => x.id === textEditor.id);
    if (!o) return;
    const next = e.target.value;
    if (!textEditor.fresh && !textEditor.undoPushed && next !== (o.label || "")) {
      pushUndo();
      textEditor.undoPushed = true;
    }
    o.label = next;
    saveState();
    drawBoard();
  }

  function onTextEditorKey(e) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
      return;
    }
    if (e.key !== "Escape" || !textEditor) return;
    e.preventDefault();
    const ed = textEditor;
    if (ed.undoPushed && undoStack.length) {
      undoStack.pop();
      ed.undoPushed = false;
    }
    const o = (currentStep()?.objects || []).find((x) => x.id === ed.id);
    if (o) o.label = ed.original;
    e.target.value = ed.fresh ? "" : ed.original;
    e.target.blur();
  }

  function beginTextEditor(o, opts = {}) {
    if (!o || o.type !== "text" || shareReadonly) return;
    const wrap = document.getElementById("rpCanvasWrap");
    if (!wrap) return;
    const focusEditor = () => {
      const input = textEditorInput();
      if (!input) return;
      placeTextEditor(o, input);
      if (!opts.focus) return;
      input.focus();
      if (opts.selectAll) input.select();
    };
    if (textEditor?.id === o.id && !textEditor.closing) {
      if (opts.fresh) textEditor.fresh = true;
      focusEditor();
      return;
    }
    if (textEditor) finishTextEditor();
    if (textEditor?.id === o.id && !textEditor.closing) {
      if (opts.fresh) textEditor.fresh = true;
      focusEditor();
      return;
    }
    if (textEditor) dropTextEditor();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rp-text-edit";
    input.value = o.label || "";
    input.placeholder = t("글 수정", "Edit text");
    input.setAttribute("aria-label", t("문구", "Text"));
    input.autocomplete = "off";
    input.spellcheck = false;
    textEditor = {
      id: o.id,
      fresh: !!opts.fresh,
      original: o.label || "",
      undoPushed: false,
      closing: false,
    };
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
    input.addEventListener("input", onTextEditorInput);
    input.addEventListener("keydown", onTextEditorKey);
    input.addEventListener("blur", () => finishTextEditor());
    wrap.appendChild(input);
    placeTextEditor(o, input);
    if (opts.focus) {
      input.focus();
      if (opts.selectAll) input.select();
    }
  }

  function syncTextEditor() {
    if (shareReadonly || tool !== "board") {
      finishTextEditor();
      return;
    }
    const o = selectedSingleText();
    if (!o) {
      finishTextEditor();
      return;
    }
    if (textEditor?.id === o.id && !textEditor.closing) {
      const input = textEditorInput();
      if (input) placeTextEditor(o, input);
      else beginTextEditor(o);
      return;
    }
    beginTextEditor(o);
  }

  function onCanvasDblClick(e) {
    if (shareReadonly || e.button !== 0) return;
    const p = canvasPoint(e);
    const hit = hitTest(p.x, p.y);
    if (!hit || hit.type !== "text") return;
    e.preventDefault();
    if (boardTool !== "select") setBoardTool("select");
    selectedObjIds = new Set([hit.id]);
    handlePreviewId = null;
    beginTextEditor(hit, { focus: true, selectAll: true });
    drawBoard();
  }

  function drawBoard() {
    if (!paintBoard()) return;
    if (boardPainting) return;
    boardPainting = true;
    try {
      syncTextEditor();
      if (textEditorRepaint) {
        textEditorRepaint = false;
        paintBoard();
      }
    } finally {
      boardPainting = false;
    }
  }

  function paintBoard() {
    const canvas = document.getElementById("rpCanvas");
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);
    drawArena(ctx);
    const objs = [...(currentStep()?.objects || [])];
    if (drawing) {
      const live = shapeFromDraft(drawing);
      if (live) objs.push(live);
    }
    if (drawingPen) objs.push(drawingPen);
    objs.forEach((o) => drawObj(ctx, o, selectedObjIds.has(o.id)));
    if (marquee) {
      const x = Math.min(marquee.x1, marquee.x2);
      const y = Math.min(marquee.y1, marquee.y2);
      const mw = Math.abs(marquee.x2 - marquee.x1);
      const mh = Math.abs(marquee.y2 - marquee.y1);
      ctx.save();
      ctx.fillStyle = "rgba(105,176,255,0.16)";
      ctx.strokeStyle = "#69b0ff";
      ctx.lineWidth = 1 / Math.max(0.001, scale);
      ctx.fillRect(x, y, mw, mh);
      ctx.strokeRect(x, y, mw, mh);
      ctx.restore();
    }
    ctx.restore();
    return true;
  }

  function drawArena(ctx) {
    ctx.fillStyle = "#0c121a";
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    const cx = BOARD_W / 2;
    const cy = BOARD_H / 2;
    const mapImg = global.BoardAssets?.loadBossMap?.(bossId, boardMapId, () => {
      if (tool === "board") drawBoard();
    });

    if (mapImg && mapImg.naturalWidth) {
      ctx.drawImage(mapImg, 0, 0, BOARD_W, BOARD_H);
      return;
    }

    // 맵 미로드·미등록 시 기본 원형 아레나
    ctx.strokeStyle = "#1d2a3a";
    ctx.lineWidth = 1;
    for (let x = 0; x <= BOARD_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_H);
      ctx.stroke();
    }
    for (let y = 0; y <= BOARD_H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_W, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 230, 0, Math.PI * 2);
    ctx.strokeStyle = "#3a5472";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#5b2a35";
    ctx.fill();
    ctx.strokeStyle = "#ff6b72";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffd0a8";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BOSS", cx, cy + 4);
  }

  function memberIconKey(m) {
    return global.BoardAssets?.playerIconUrl?.(m) || `${m?.class || ""}|${m?.spec || ""}`;
  }

  /** 선발 공대에 같은 아이콘(전문화)이 2명 이상일 때만 그림판 닉네임을 붙인다 */
  function memberIconIsShared(player) {
    if (!player || !localRoster.some((m) => m.playerId === player.playerId)) return false;
    const key = memberIconKey(player);
    let n = 0;
    for (const m of localRoster) {
      if (memberIconKey(m) !== key) continue;
      n += 1;
      if (n > 1) return true;
    }
    return false;
  }

  function tokenCaption(o) {
    if (!o || o.kind === "element") return "";
    if (o.kind === "player" || o.playerId) {
      const player = findRosterMember(o.playerId);
      if (!memberIconIsShared(player)) return "";
      return playerCallsign(player);
    }
    return o.label || "";
  }

  function drawObj(ctx, o, selected) {
    ctx.save();
    ctx.strokeStyle = o.color || "#f2b84b";
    ctx.fillStyle = o.color || "#f2b84b";
    ctx.lineWidth = selected ? 4 : 2;
    if (o.type === "circle") {
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else if (o.type === "rect") {
      const c = objCenter(o);
      const rot = o.rot || 0;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.16;
      ctx.fillRect(-(o.w || 0) / 2, -(o.h || 0) / 2, o.w || 0, o.h || 0);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-(o.w || 0) / 2, -(o.h || 0) / 2, o.w || 0, o.h || 0);
      ctx.restore();
    } else if (o.type === "line" || o.type === "arrow") {
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
      if (o.type === "arrow") {
        const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
        ctx.beginPath();
        ctx.moveTo(o.x2, o.y2);
        ctx.lineTo(o.x2 - 14 * Math.cos(ang - 0.4), o.y2 - 14 * Math.sin(ang - 0.4));
        ctx.lineTo(o.x2 - 14 * Math.cos(ang + 0.4), o.y2 - 14 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    } else if (o.type === "cone") {
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.arc(o.x, o.y, o.len, o.rot - o.spread / 2, o.rot + o.spread / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else if (o.type === "text") {
      const sc = o.scale || 16;
      const rot = o.rot || 0;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(rot);
      ctx.font = `700 ${sc}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.label || "", 0, 0);
      ctx.restore();
    } else if (o.type === "pen" && o.points?.length) {
      ctx.lineWidth = selected ? (o.width || 2.5) + 1.5 : o.width || 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      o.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      if (selected) {
        const b = objBounds(o);
        if (b) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
          ctx.setLineDash([]);
        }
      }
    } else if (o.type === "token") {
      const r = o.r || 16;
      const rot = o.rot || 0;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(rot);
      if (o.drawStyle && String(o.drawStyle).startsWith("marker-") && global.BoardAssets?.drawRaidMarker) {
        global.BoardAssets.drawRaidMarker(ctx, o.drawStyle, 0, 0, r, () => {
          if (tool === "board") drawBoard();
        });
      } else {
        const img = loadIcon(o.iconUrl);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        if (img) {
          ctx.save();
          ctx.fillStyle = "#0b1017";
          ctx.fill();
          ctx.clip();
          // 정사각형이 아닌 이미지(보스 초상화 등)는 비율 유지 후 잘라서 채운다
          const side = Math.min(img.naturalWidth, img.naturalHeight) || 1;
          const sx = (img.naturalWidth - side) * 0.4;
          const sy = (img.naturalHeight - side) * 0.3;
          ctx.drawImage(img, sx, sy, side, side, -r, -r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = o.color || "#f2b84b";
          ctx.fill();
          ctx.fillStyle = "#0b1017";
          ctx.font = "700 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((o.label || "P").slice(0, 3), 0, 0);
        }
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = selected ? "#fff" : o.color || "#0b1017";
        ctx.lineWidth = selected ? 3 : 2;
        ctx.stroke();
      }
      ctx.restore();
      const caption = tokenCaption(o);
      if (caption) {
        ctx.font = "700 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#0b1017";
        ctx.fillStyle = "#eff5fc";
        ctx.strokeText(caption, o.x, o.y + r + 3);
        ctx.fillText(caption, o.x, o.y + r + 3);
      }
    }
    if (selected && selectedObjIds.size === 1 && canTransform(o)) {
      drawTransformHandles(ctx, o);
    } else if (!selected && handlePreviewId === o.id && canTransform(o)) {
      drawTransformHandles(ctx, o);
    }
    ctx.restore();
  }

  function importFromHelper() {
    return applyAuthWorkspace()
      .then(() => enterTempFromHelper())
      .then((ok) => {
        if (!ok) {
          window.alert(
            t(
              "구인 도우미에 전문화가 없습니다. 먼저 공대를 짜거나 데모 로스터를 쓰세요.",
              "Helper roster is empty. Build one first, or use the demo roster."
            )
          );
          return false;
        }
        openRosterModal();
        render(true);
        saveState();
        return true;
      });
  }

  function handleBack() {
    if (shareReadonly) return false;
    if (tool !== "board") return false;
    tool = "cd";
    requestFitZoom();
    render(true);
    document.getElementById("plannerView")?.scrollIntoView({ block: "start" });
    return true;
  }

  global.RaidPlanner = {
    mount,
    render,
    importFromHelper,
    handleBack,
  };
})(window);
