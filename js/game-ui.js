/**
 * WoW Raid Commander — Game UI (incremental DOM patches)
 * Avoids full innerHTML rebuilds that break scroll / clicks / selects.
 */
(function (global) {
  "use strict";

  let engine = null;
  let langRef = () => "ko";
  let bound = false;
  let showTransfer = false;
  let showFailModal = false;
  let failModalShownForTry = -1;
  let screen = "recruit";
  let shellBuilt = false;
  let lastScreen = null;
  let patchQueued = false;
  let lastPatchAt = 0;
  let inspectId = null;
  let scoutId = null;
  let markerTool = null;
  let appRoleFilters = new Set(["Tank", "Heal", "Melee", "Ranged"]);
  const APP_FILTER_ROLES = ["Tank", "Heal", "Melee", "Ranged"];
  const fxDeathUntil = Object.create(null);
  const fxRezUntil = Object.create(null);
  const fxBurstUntil = Object.create(null);
  const FX = () => global.RaidGameFX;

  const E = () => engine;
  const C = () => RaidGameEngine.CONST;
  const math = () => RaidGameEngine.math;

  function t(ko, en) {
    return langRef() === "ko" ? ko : en;
  }
  function specialtyLabel(s) {
    return langRef() === "ko" ? C().SPECIALTY_KO[s] || s : s;
  }
  function healerLabel(s) {
    return langRef() === "ko" ? C().HEALER_TYPE_KO[s] || s : s;
  }
  function roleLabel(r) {
    if (langRef() !== "ko") return r;
    return { Tank: "탱커", Melee: "근딜", Ranged: "원딜", Heal: "힐" }[r] || r;
  }
  function fmtNum(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + t("억", "e8");
    if (n >= 1e4) return (n / 1e4).toFixed(1) + t("만", "e4");
    return Math.round(n).toLocaleString();
  }
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function interacting() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = a.tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return true;
    if (a.isContentEditable) return true;
    if (showFailModal) return true;
    return false;
  }

  function mount(getLang) {
    langRef = getLang || (() => "ko");
    if (!bound) {
      bound = true;
      bindRoot();
    }
    if (!engine) resetGame();
    else {
      ensureShell(true);
      patch(true);
    }
  }

  function resetGame() {
    if (engine) engine.stop();
    showTransfer = false;
    showFailModal = false;
    failModalShownForTry = -1;
    screen = "recruit";
    lastScreen = null;
    shellBuilt = false;
    inspectId = null;
    scoutId = null;
    appRoleFilters = new Set(APP_FILTER_ROLES);
    for (const k of Object.keys(fxDeathUntil)) delete fxDeathUntil[k];
    for (const k of Object.keys(fxRezUntil)) delete fxRezUntil[k];
    for (const k of Object.keys(fxBurstUntil)) delete fxBurstUntil[k];
    engine = new RaidGameEngine({
      specs: window.RAID_DATA.raid.specs,
      playerReputation: window.RAID_GAME_BALANCE?.recruit?.playerRepDefault ?? 86,
      onUpdate: () => {
        if (document.getElementById("gameView")?.classList.contains("hidden")) return;
        maybeFailModal();
        schedulePatch();
      },
      onCombatEvent: (ev) => {
        const fx = FX();
        if (!fx) return;
        if (ev.type === "death" && ev.memberId) {
          fxDeathUntil[ev.memberId] = performance.now() + 700;
        }
        if (ev.type === "rez" && ev.memberId) {
          fxRezUntil[ev.memberId] = performance.now() + 700;
        }
        if (ev.type === "burst" && ev.memberId) {
          fxBurstUntil[ev.memberId] = performance.now() + 520;
        }
        fx.handleCombatEvent(ev);
      },
    });
    engine.start();
    engine.pause();
    ensureShell(true);
    patch(true);
  }

  function schedulePatch() {
    if (interacting()) return;
    const now = performance.now();
    if (now - lastPatchAt >= 200) {
      patch(false);
      return;
    }
    if (patchQueued) return;
    patchQueued = true;
    setTimeout(() => {
      patchQueued = false;
      if (!interacting()) patch(false);
    }, Math.max(40, 200 - (now - lastPatchAt)));
  }

  function maybeFailModal() {
    const p = E()?.player;
    if (!p) return;
    if (p.state === "fighting") {
      if (showFailModal) {
        showFailModal = false;
        const m = $("#gFailModal");
        if (m) m.hidden = true;
      }
      return;
    }
    if (
      (p.state === "dead" || p.state === "victory") &&
      p.combat?.finished &&
      !showTransfer &&
      failModalShownForTry !== p.tries
    ) {
      failModalShownForTry = p.tries;
      showFailModal = true;
      screen = "try";
      patch(true);
    }
  }

  function bindRoot() {
    const root = document.getElementById("gameView");
    if (!root) return;
    root.addEventListener("click", (e) => {
      if (e.target.id === "gScoutModal") {
        scoutId = null;
        patch(true);
        return;
      }
      const filt = e.target.closest("[data-g-filter]");
      if (filt) {
        e.preventDefault();
        const role = filt.dataset.gFilter;
        if (role === "All") {
          appRoleFilters = new Set(APP_FILTER_ROLES);
        } else if (APP_FILTER_ROLES.includes(role)) {
          if (appRoleFilters.has(role)) appRoleFilters.delete(role);
          else appRoleFilters.add(role);
        }
        patch(true);
        return;
      }
      const btn = e.target.closest("[data-g-act]");
      if (!btn || btn.disabled) return;
      e.preventDefault();
      handleAction(btn.dataset.gAct, btn.dataset.id);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && scoutId) {
        scoutId = null;
        patch(true);
      }
    });
    root.addEventListener("dragstart", (e) => {
      const slot = e.target.closest("[data-drag-id]");
      if (!slot) return;
      e.dataTransfer.setData("text/plain", JSON.stringify({
        id: slot.dataset.dragId,
        from: slot.dataset.dragFrom,
      }));
      e.dataTransfer.effectAllowed = "move";
      slot.classList.add("dragging");
    });
    root.addEventListener("dragend", (e) => {
      e.target.closest("[data-drag-id]")?.classList.remove("dragging");
      root.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    });
    root.addEventListener("dragover", (e) => {
      const zone = e.target.closest("[data-drop]");
      const slot = e.target.closest("[data-drag-id]");
      if (!zone && !slot) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      root.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      (slot || zone)?.classList.add("drag-over");
    });
    root.addEventListener("dragleave", (e) => {
      const el = e.target.closest(".drag-over");
      if (el && !el.contains(e.relatedTarget)) el.classList.remove("drag-over");
    });
    root.addEventListener("drop", (e) => {
      const eng = E();
      if (!eng) return;
      let payload;
      try {
        payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
      } catch {
        return;
      }
      if (!payload.id) return;
      e.preventDefault();
      root.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));

      const onto = e.target.closest("[data-drag-id]");
      const zone = e.target.closest("[data-drop]");
      if (onto && onto.dataset.dragId !== payload.id) {
        eng.relocate(payload.id, onto.dataset.dragFrom, onto.dataset.dragId);
      } else if (zone) {
        eng.relocate(payload.id, zone.dataset.drop);
      } else return;
      patch(true);
    });
    root.addEventListener("change", (e) => {
      const el = e.target;
      if (el.id === "gCombatSpeed") {
        E().combatSpeed = +el.value;
        return;
      }
      if (el.id === "gBattleRezMode") {
        E().setBattleRezMode(el.value);
        return;
      }
    });
  }

  function handleAction(act, id) {
    const eng = E();
    if (!eng) return;
    switch (act) {
      case "accept":
        eng.accept(id);
        break;
      case "reject":
        eng.reject(id);
        break;
      case "start-sim":
        FX()?.unlock();
        eng.resume();
        break;
      case "pause-sim":
        eng.pause();
        break;
      case "mute":
        FX()?.toggleMute();
        break;
      case "screen-recruit":
        screen = "recruit";
        break;
      case "screen-try":
        screen = "try";
        break;
      case "start-try":
        FX()?.unlock();
        if (eng.startPlayerTry()) {
          screen = "try";
          showFailModal = false;
          const rb = $("#gResultBody");
          if (rb) rb.dataset.key = "";
        }
        break;
      case "retry":
        FX()?.unlock();
        showFailModal = false;
        {
          const rb = $("#gResultBody");
          if (rb) rb.dataset.key = "";
        }
        if (eng.retryPlayer()) screen = "try";
        break;
      case "transfer":
        showFailModal = false;
        showTransfer = true;
        screen = "recruit";
        break;
      case "close-transfer":
        showTransfer = false;
        break;
      case "release":
        eng.release(id);
        break;
      case "boss":
        eng.setBoss(+id);
        break;
      case "reset":
        resetGame();
        return;
      case "dev-fill": {
        const r = eng.fillDevTestRaid();
        if (r?.ok) screen = "recruit";
        break;
      }
      case "dismiss-fail":
        showFailModal = false;
        break;
      case "brez":
        eng.battleRez(id);
        break;
      case "inspect":
        inspectId = id;
        break;
      case "close-inspect":
        inspectId = null;
        break;
      case "scout":
        scoutId = scoutId === id ? null : id;
        break;
      case "close-scout":
        scoutId = null;
        break;
      case "marker-tool":
        markerTool = markerTool === id ? null : id;
        break;
      case "marker-clear":
        markerTool = null;
        eng.clearMarkers();
        break;
      case "formation-reset":
        eng.resetFormation();
        break;
    }
    syncMarkerTools();
    patch(true);
  }

  function syncMarkerTools() {
    const eng = E();
    const mk = eng?.getMarkers?.() || {};
    const crossN = mk.cross?.length || 0;
    const crossMax = window.RaidGameEngine?.arena?.MAX_CROSS ?? 6;
    document.querySelectorAll("#gMarkerTools [data-g-act='marker-tool']").forEach((btn) => {
      const kind = btn.dataset.id;
      btn.classList.toggle("active", markerTool === kind);
      btn.classList.toggle("placed", kind === "cross" ? crossN > 0 : !!mk[kind]);
      const cnt = btn.querySelector(".mk-count");
      if (cnt) cnt.textContent = kind === "cross" && crossN ? ` ${crossN}/${crossMax}` : "";
    });
    const clr = document.querySelector("#gMarkerTools [data-g-act='marker-clear']");
    if (clr) clr.disabled = !mk.square && !crossN;
    const fr = document.querySelector("#gMarkerTools [data-g-act='formation-reset']");
    if (fr) {
      fr.disabled = eng?.player?.state === "fighting" || !Object.keys(eng?.getFormation?.() || {}).length;
    }
    const hint = $("#gMarkerHint");
    if (hint) {
      hint.textContent =
        markerTool === "cross"
          ? t(
              `클릭할 때마다 X 징표 추가 (최대 ${crossMax}개) · 장판은 가장 가까운 X로 · 버튼 다시 누르면 종료`,
              `Each click adds an X (max ${crossMax}) · drops go to the nearest X · press again to stop`
            )
          : markerTool
            ? t("전장을 클릭해 징표를 놓으세요 (버튼 다시 누르면 취소)", "Click the arena to place (press again to cancel)")
            : eng?.player?.state === "fighting"
              ? t("징표 드래그로 이동 · 우클릭으로 삭제 · 전투 중에도 바로 반영", "Drag to move · right-click to delete · applies mid-fight")
              : t("트라이 전: 공대원·징표를 드래그해 자리를 정하세요 · 징표 우클릭 = 삭제", "Before the try: drag members and markers · right-click marker to delete");
      hint.title = hint.textContent;
    }
  }

  function ensureShell(force) {
    const root = document.getElementById("gameView");
    if (!root) return;
    if (shellBuilt && !force && root.querySelector(".g-shell")) return;

    root.innerHTML = `
      <div class="g-shell wcl">
        <div class="g-toolbar">
          <div>
            <h2 class="g-title">${t("구인 Game · Race", "Recruiting Game · Race")}</h2>
            <div class="sub" id="gClockLine"></div>
          </div>
          <div class="g-toolbar-acts">
            <button class="primary" data-g-act="start-sim" id="gBtnStart">${t("시작", "Start")}</button>
            <button class="ghost" data-g-act="pause-sim" id="gBtnPause">${t("일시정지", "Pause")}</button>
            <label class="g-speed">${t("배속", "Speed")}
              <select id="gCombatSpeed">
                ${(window.RAID_GAME_BALANCE?.sim?.speedOptions || [1, 2, 4, 8])
                  .map((v) => `<option value="${v}">${v}x</option>`)
                  .join("")}
              </select>
            </label>
            <button class="ghost" data-g-act="reset">${t("새 시즌", "New season")}</button>
            <button class="ghost g-mute-btn" data-g-act="mute" id="gMuteBtn" title="SFX">${t("소리", "SFX")}</button>
            <button class="ghost g-dev-btn" data-g-act="dev-fill" title="Perf/Heal 70 · Prof 10 · full synergies">${t(
              "TEST 공대",
              "TEST roster"
            )}</button>
          </div>
        </div>

        <div class="g-screen-tabs">
          <button class="g-screen-tab" data-g-act="screen-recruit" id="gTabRecruit">${t("구인창", "Recruiting")}</button>
          <button class="g-screen-tab" data-g-act="screen-try" id="gTabTry">${t("트라이창", "Try / Combat")}</button>
        </div>

        <div class="g-bossbar" id="gBossBar"></div>
        <div class="g-boss-meta" id="gBossMeta"></div>
        <div id="gScreenBody"></div>
      </div>
      <div class="g-modal-bg" id="gFailModal" hidden>
        <div class="g-modal g-result-modal">
          <h2 id="gResultTitle">${t("트라이 결과", "Try result")}</h2>
          <p class="sub" id="gFailText"></p>
          <div id="gResultBody" class="g-result-body"></div>
          <div class="actions">
            <button class="primary" data-g-act="retry">${t("즉시 재도전", "Retry now")}</button>
            <button class="ghost" data-g-act="transfer">${t("공대원 교체", "Transfer")}</button>
            <button class="ghost" data-g-act="dismiss-fail">${t("닫기", "Close")}</button>
          </div>
        </div>
      </div>
      <div class="g-modal-bg" id="gTransferModal" hidden>
        <div class="g-modal wide">
          <h2>${t("이적 시장", "Transfer market")}</h2>
          <div class="g-transfer-list" id="gTransferList"></div>
          <div class="actions"><button class="ghost" data-g-act="close-transfer">${t("닫기", "Close")}</button></div>
        </div>
      </div>
      <div class="g-modal-bg" id="gScoutModal" hidden>
        <div class="g-modal g-scout-modal">
          <div id="gScoutHead"></div>
          <div id="gScoutBody" class="g-scout-body"></div>
          <div class="actions"><button class="ghost" data-g-act="close-scout">${t("닫기", "Close")}</button></div>
        </div>
      </div>
    `;
    shellBuilt = true;
    lastScreen = null;
  }

  function buildRecruitBody() {
    return `
      <div class="layout g-helper-layout">
        <section class="panel g-col apps-col">
          <h2>${t("실시간 지원", "Live applicants")}</h2>
          <div class="sub">${t(
            "전문화 신청 대신 지원이 실시간으로 들어옵니다 · 30초 만료",
            "Live applications instead of picking specs · 30s expire"
          )}</div>
          <div class="g-apps-toolbar">
            <div class="g-rep">${t("명성", "Rep")} <b id="gRep">—</b></div>
            <div class="role-filter" id="gAppFilters"></div>
          </div>
          <div class="g-apps spec-list" id="gApps"></div>
        </section>

        <section class="panel g-col roster-col">
          <div class="raid-head">
            <div>
              <h2 id="gRosterTitle">${t("내 공대", "Your raid")}</h2>
              <div class="sub" id="gRosterSub"></div>
            </div>
            <button class="primary" data-g-act="start-try" id="gStartTry">${t("트라이 출발", "Start try")}</button>
          </div>
          <div class="meter"><i id="gRosterMeter"></i></div>
          <div id="gHeadcount" class="headcount"></div>
          <label class="g-brez-set">${t("전투부활", "Battle rez")}
            <select id="gBattleRezMode">
              <option value="manual">${t("수동 (클릭 부활)", "Manual click")}</option>
              <option value="auto_any">${t("자동 · 사망자 순", "Auto any")}</option>
              <option value="auto_tank_heal">${t("자동 · 탱/힐만", "Auto tank/heal only")}</option>
            </select>
          </label>
          <div class="columns" id="gRosterColumns"></div>
          <div class="g-bench-wrap">
            <div class="g-bench-head">
              <h3>${t("후보 선수", "Bench")}</h3>
              <span class="sub" id="gBenchSub">0/4</span>
            </div>
            <div class="sub g-bench-hint">${t(
              "드래그로 선발 ↔ 후보 이동 · 겹치면 교체",
              "Drag between raid ↔ bench · drop on player to swap"
            )}</div>
            <div class="g-bench" id="gBench" data-drop="bench"></div>
          </div>
          <div class="status-box" id="gStatusBox"></div>
          <div class="counts" id="gCounts"></div>
        </section>

        <section class="panel g-col syn-col" id="gSynPanel">
          <h2>${t("시너지", "Synergies")}</h2>
          <div class="sub">${t(
            "미활성 시너지가 위에 표시됩니다 · 전투 DPS/받피에만 적용",
            "Missing synergies first · applies to combat DPS / DT only"
          )}</div>
          <div id="gSynSummary" class="g-syn-summary"></div>
          <div id="gSynCompleteBanner" class="syn-complete-banner hidden"></div>
          <div id="gSynergies" class="g-synergies"></div>
          <div class="tip">${t(
            "클래스 버프는 전 전문화가 제공합니다. AI 공대 현황은 염탐 창에서 확인합니다.",
            "Class buffs from any spec. AI raids move to a scout window later."
          )}</div>
        </section>
      </div>
      <section class="panel g-wcl-board compact">
        <div class="g-wcl-head">
          <div>
            <div class="g-wcl-kicker">Warcraft Logs · Progress</div>
            <h2 id="gWclTitle"></h2>
          </div>
        </div>
        <div id="gWclTable"></div>
      </section>
    `;
  }

  function buildTryBody() {
    return `
      <div class="g-try-layout">
        <section class="panel g-try-main">
          <div class="g-combat-head">
            <div class="g-try-boss-head">
              <div id="gTryBossPortrait"></div>
              <div>
                <div class="g-wcl-kicker" id="gTryKicker"></div>
                <h2 id="gTryBoss"></h2>
              </div>
            </div>
            <div class="g-try-acts">
              <span class="g-timer" id="gEnrage"></span>
              <span class="g-brez-left" id="gBrezLeft"></span>
              <button class="primary" data-g-act="start-try" id="gStartTry2">${t("트라이 출발", "Start try")}</button>
            </div>
          </div>
          <div class="g-boss-progress themed" id="gBossProgress">
            <div class="g-boss-progress-top">
              <b>${t("보스 HP", "Boss HP")}</b>
              <span id="gBossHpText">—</span>
            </div>
            <div class="g-hp tall wcl-bar"><i id="gBossHpBar"></i></div>
            <div class="g-combat-meta" id="gCombatMeta"></div>
            <div class="g-tank-wipe" id="gTankWipe" hidden></div>
          </div>
          <div class="g-arena-row">
            <div class="g-arena-frames">
              <div class="g-raid-frames compact" id="gRaidFrames"></div>
            </div>
            <div class="g-arena-stage">
              <div class="g-marker-tools" id="gMarkerTools">
                <button type="button" class="g-mk-btn mk-square" data-g-act="marker-tool" data-id="square" title="${t("같이 맞는 바닥은 여기 모여서 맞습니다", "Soak floors are taken here")}">
                  <i></i>${t("네모 징표 · 같이 맞기", "Square · soak")}
                </button>
                <button type="button" class="g-mk-btn mk-cross" data-g-act="marker-tool" data-id="cross" title="${t("여러 개 배치 가능 · 장판 남기는 바닥은 대상자에게 가장 가까운 X로 가져가 깝니다 (이미 장판이 있으면 그 바깥 가장 가까운 곳)", "Place several · drop floors go to the nearest X (or the nearest free spot)")}">
                  <i></i>${t("X 징표 · 장판 버리기", "Cross · drop pools")}<span class="mk-count"></span>
                </button>
                <button type="button" class="g-mk-btn mk-clear" data-g-act="marker-clear">${t("징표 지우기", "Clear")}</button>
                <button type="button" class="g-mk-btn mk-reset" data-g-act="formation-reset" title="${t("드래그로 옮긴 자리를 기본 배치로 되돌립니다", "Restore the default formation")}">${t("배치 초기화", "Reset formation")}</button>
                <span class="g-mk-hint" id="gMarkerHint"></span>
              </div>
              <div class="g-arena-wrap"><canvas id="gArenaCanvas"></canvas></div>
              <div class="g-arena-legend">
                <span><i class="lg-zone"></i>${t("예고 장판 — 터질 때 안에 있으면 2배 피격", "Telegraph — 2× damage if inside on detonation")}</span>
                <span><i class="lg-shared"></i>${t("같이 맞는 바닥 — 인원 모자라면 나눠 맞는 피해↑", "Soak — fewer soakers, more damage each")}</span>
                <span><i class="lg-drop"></i>${t("장판 남기는 바닥 → 초록 웅덩이", "Drop — leaves a green pool")}</span>
                <span><i class="lg-tank"></i>${t("메인탱", "Main tank")}</span>
                <span><b>?</b> ${t("멍때림·엉뚱한 방향", "Blunder")}</span>
                <span><i class="lg-melee"></i>${t("근접 사거리 — 근딜·탱은 이 안에서만 딜", "Melee range — melee/tanks deal damage only inside")}</span>
                <span>${t("토큰 클릭: 스펙 보기 · 드래그: 트라이 전 자리 지정 · 수동 모드에선 해골 클릭 = 전투부활", "Click: inspect · drag before try: set position · manual mode: click skull to brez")}</span>
              </div>
            </div>
            <div class="g-arena-meters">
              <div class="g-meter-col">
                <h3>DPS <span class="meter-hint">${t("(초당 · 누적)", "(rate · total)")}</span></h3>
                <div id="gDpsMeter"></div>
              </div>
              <div class="g-meter-col">
                <h3>HPS <span class="meter-hint">${t("(실힐 · OH)", "(eff · OH)")}</span></h3>
                <div id="gHpsMeter"></div>
              </div>
            </div>
          </div>
          <div class="g-inspect" id="gInspect" hidden></div>
          <div class="g-arena-bottom">
            <div>
              <div class="g-wcl-kicker">Combat Log</div>
              <div class="g-log" id="gLog"></div>
            </div>
            <div class="g-try-side">
              <div class="g-race-head">
                <div>
                  <div class="g-wcl-kicker">Race Monitor</div>
                  <h3>${t("공대 진행도", "Raid progress")}</h3>
                </div>
                <label class="g-brez-set">${t("전투부활", "Battle rez")}
                  <select id="gBattleRezMode">
                    <option value="manual">${t("수동", "Manual")}</option>
                    <option value="auto_any">${t("자동 · 아무나", "Auto any")}</option>
                    <option value="auto_tank_heal">${t("자동 · 탱/힐만", "Auto tank/heal only")}</option>
                  </select>
                </label>
              </div>
              <div id="gWclTableSide"></div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function attachArena() {
    const cv = $("#gArenaCanvas");
    if (!cv || !window.RaidGameArena) return;
    window.RaidGameArena.attach(cv, {
      getEngine: E,
      lang: () => langRef(),
      getTool: () => markerTool,
      onMoveHome: (id, x, y) => {
        E()?.setHome(id, x, y);
        syncMarkerTools();
      },
      onPlace: (kind, x, y, index) => {
        const eng = E();
        if (!eng) return;
        eng.setMarker(kind, x, y, index);
        const max = window.RaidGameEngine?.arena?.MAX_CROSS ?? 6;
        const keep = index == null && kind === "cross" && (eng.getMarkers().cross?.length || 0) < max;
        if (index == null && !keep) markerTool = null;
        syncMarkerTools();
      },
      onRemoveMarker: (kind, index) => {
        E()?.removeMarker(kind, index);
        syncMarkerTools();
      },
      onPick: (id, dead) => {
        const p = E()?.player;
        const brez = dead && p?.state === "fighting" && p.battleRezMode === "manual" && (p.combat?.battleRezLeft || 0) > 0;
        handleAction(brez ? "brez" : "inspect", id);
      },
    });
  }

  function patch(force) {
    const root = document.getElementById("gameView");
    if (!root || !engine) return;
    if (!force && interacting()) return;
    lastPatchAt = performance.now();
    ensureShell(false);

    const eng = engine;
    const p = eng.player;
    const boss = eng.boss;
    const paused = eng.paused || !eng.startedOnce;
    const counts = { Tank: 0, Melee: 0, Ranged: 0, Heal: 0 };
    p.members.forEach((m) => counts[m.role]++);
    const dpsN = counts.Melee + counts.Ranged;
    const healMin = C().HEAL_MIN ?? 4;
    const healMax = C().HEAL_MAX ?? 5;
    const full =
      counts.Tank >= 2 &&
      counts.Heal >= healMin &&
      counts.Heal <= healMax &&
      p.members.length >= 20;

    // Toolbar (never rebuild select)
    const clock = $("#gClockLine");
    if (clock) {
      clock.innerHTML = `${t("인재풀", "Pool")} ${C().POOL_SIZE ?? 1000} · AI ${C().AI_COUNT ?? 10} · ${t("시계", "Clock")} ${math().formatTime(eng.clock)}${
        paused ? ` · <span class="g-paused-tag">${t("일시정지", "Paused")}</span>` : ""
      }`;
    }
    const btnStart = $("#gBtnStart");
    const btnPause = $("#gBtnPause");
    if (btnStart) btnStart.disabled = !paused;
    if (btnPause) btnPause.disabled = !!paused;
    const speed = $("#gCombatSpeed");
    if (speed && document.activeElement !== speed) speed.value = String(eng.combatSpeed);
    const muteBtn = $("#gMuteBtn");
    if (muteBtn) {
      const muted = !!FX()?.isMuted?.();
      muteBtn.classList.toggle("on", muted);
      muteBtn.textContent = muted ? t("음소거", "Muted") : t("소리", "SFX");
    }

    $("#gTabRecruit")?.classList.toggle("on", screen === "recruit");
    $("#gTabTry")?.classList.toggle("on", screen === "try");

    // Boss chips + stats
    const bossBar = $("#gBossBar");
    const fx = FX();
    if (bossBar && (!bossBar.children.length || force)) {
      bossBar.innerHTML = eng.bosses
        .map((b, i) => {
          const hp = math().getBossHp(b);
          const en = math().getBossEnrage(b);
          const port = fx?.bossPortraitHtml?.(b, "sm") || "";
          return `<button class="chip ${eng.bossIndex === i ? "on" : ""}" data-g-act="boss" data-id="${i}">${port}<span class="g-boss-chip-text">${
            langRef() === "ko" ? b.nameKo : b.name
          }<span class="g-boss-chip-sub">${fmtNum(hp)} · ${math().formatTime(en)}</span></span></button>`;
        })
        .join("");
    } else if (bossBar) {
      [...bossBar.children].forEach((ch, i) => ch.classList.toggle("on", eng.bossIndex === i));
    }
    fx?.applyBossTheme?.(boss);
    patchBossMeta(boss);

    // Screen body swap only when screen changes
    const body = $("#gScreenBody");
    if (body && lastScreen !== screen) {
      const appsScroll = $("#gApps")?.scrollTop || 0;
      body.innerHTML = screen === "recruit" ? buildRecruitBody() : buildTryBody();
      lastScreen = screen;
      if (screen === "recruit") {
        const apps = $("#gApps");
        if (apps) apps.scrollTop = appsScroll;
      }
      syncBrezSelects(p.battleRezMode);
    }

    if (screen === "recruit") patchRecruit(eng, p, boss, counts, dpsN, full);
    else patchTry(eng, p, boss, full);

    // Modals
    const fail = $("#gFailModal");
    if (fail) {
      fail.hidden = !showFailModal;
      if (showFailModal) patchResultModal(p, boss);
    }
    const tr = $("#gTransferModal");
    if (tr) {
      tr.hidden = !showTransfer;
      if (showTransfer) patchTransfer(p, boss);
    }
    const sc = $("#gScoutModal");
    if (sc) {
      sc.hidden = !scoutId;
      if (scoutId) patchScout(eng);
    }
  }

  function syncBrezSelects(mode) {
    document.querySelectorAll("#gBattleRezMode").forEach((sel) => {
      if (document.activeElement !== sel) sel.value = mode || "auto_tank_heal";
    });
  }

  function skillTypeLabel(skill) {
    const def = window.RAID_GAME_BALANCE?.arena?.skillDefaults?.[skill.type] || {};
    const sp = { ...def, ...skill };
    const kind = math().skillKind(skill);
    const shape = sp.shape || (kind === "tankBuster" ? "buster" : kind === "random" ? "circle" : "raid");
    const fatal = sp.fatal ? t("·즉사", "·fatal") : "";
    if (shape === "buster") return t("탱버스터·교대", "buster·swap");
    if (shape === "raid") return t("전체 피해", "raid dmg");
    if (sp.mode === "shared") return t(`같이 맞기 ${sp.soakers ?? 5}인 · □`, `soak ${sp.soakers ?? 5} · □`);
    if (sp.mode === "drop") return t(`장판 남김${(sp.count ?? 1) > 1 ? "×" + sp.count : ""} · ✕`, `drop pool${(sp.count ?? 1) > 1 ? "×" + sp.count : ""} · ✕`);
    if (shape === "circle" && sp.at === "target") return t(`발밑 장판×${sp.count ?? 3}`, `puddle×${sp.count ?? 3}`) + fatal;
    if (shape === "circle") return t("보스 주변 폭발", "boss nova") + fatal;
    if (shape === "cone") return t("부채꼴", "frontal") + fatal;
    if (shape === "line") return t("직선", "beam") + fatal;
    return t("광역", "AoE");
  }

  const BURST_ICON_CDN = "https://wow.zamimg.com/images/wow/icons/large/";

  function burstIconInfo(m) {
    const map = window.RAID_GAME_BALANCE?.cooldown?.burstIcons || {};
    const hit = map[`${m.class}|${m.spec}`] || map._default || {
      icon: "ability_warrior_innerrage",
      nameKo: "쿨기",
      name: "Burst",
    };
    return {
      icon: hit.icon,
      label: langRef() === "ko" ? hit.nameKo || hit.name : hit.name || hit.nameKo,
      url: `${BURST_ICON_CDN}${hit.icon}.jpg`,
    };
  }

  function resultPersonLabel(row) {
    const spec = langRef() === "ko" ? row.specKo || row.spec : row.spec;
    return `${row.name} · ${spec}`;
  }

  function resultRankRows(list, maxBar, opts = {}) {
    if (!list?.length) return `<div class="empty">—</div>`;
    const top = Math.max(1, maxBar || list[0]?.total || 1);
    return list
      .map((row) => {
        const pct = Math.max(2, ((row.total || 0) / top) * 100);
        const rate =
          opts.withRate && row.rate != null ? `<span class="g-res-rate">${fmtNum(row.rate)}/s</span>` : "";
        const oh =
          opts.withOh && row.overheal != null
            ? `<span class="g-res-oh">OH ${fmtNum(row.overheal)}</span>`
            : "";
        const portions =
          opts.withPortions && row.portions != null
            ? `<span class="g-res-rate">${row.portions.toFixed(2)}${t("인분", "x")}</span>`
            : "";
        const tankHeal =
          opts.withTankHeal && row.tankHeal != null
            ? `<span class="g-res-tankheal">${t("탱힐", "Tank heal")} ${fmtNum(row.tankHeal)}</span>`
            : "";
        return `<div class="g-res-row" style="--class:${row.color || "#8ec5ff"}">
          <span class="g-res-rank">${row.rank}</span>
          <span class="g-res-name">${resultPersonLabel(row)}</span>
          <div class="g-res-bar"><i style="width:${pct}%"></i></div>
          <span class="g-res-total">${fmtNum(row.total || 0)}</span>
          ${portions}${rate}${oh}${tankHeal}
        </div>`;
      })
      .join("");
  }

  function deathReasonLabel(reason) {
    switch (reason) {
      case "fatal":
        return t("생존·숙련 부족으로 인한 즉사", "Fatal from low survival/proficiency");
      case "hit":
        return t("힐업 부족으로 말라죽음", "Died from insufficient healing");
      case "double":
        return t("2배 피격으로 사망", "Died from double hit");
      case "zone":
        return t("장판을 못 피해서 사망", "Died standing in a zone");
      case "pool":
        return t("남은 웅덩이를 밟아서 사망", "Died standing in a pool");
      case "soak":
        return t("같이 맞기 인원 부족으로 사망", "Died to an under-soaked hit");
      default:
        return t("사망", "Death");
    }
  }

  function patchResultModal(p, boss) {
    const fail = $("#gFailModal");
    if (fail && !fail.querySelector("#gResultBody")) {
      const modal = fail.querySelector(".g-modal");
      if (modal) {
        modal.classList.add("g-result-modal");
        const h2 = modal.querySelector("h2");
        if (h2 && !h2.id) h2.id = "gResultTitle";
        const subEl = modal.querySelector("#gFailText");
        if (subEl && !modal.querySelector("#gResultBody")) {
          subEl.insertAdjacentHTML("afterend", `<div id="gResultBody" class="g-result-body"></div>`);
        }
      }
    }
    const title = $("#gResultTitle");
    const sub = $("#gFailText");
    const body = $("#gResultBody");
    if (!body) return;
    const c = p.combat;
    const summary = c?.summary || c?.result?.summary;
    const ok = !!(c?.result?.ok || p.state === "victory");
    const bossName = langRef() === "ko" ? boss?.nameKo || boss?.name : boss?.name;
    const timeStr = math().formatTime(summary?.t ?? c?.t ?? 0);
    const hpLeft = summary?.hpPct ?? (c ? (c.bossHp / c.bossMaxHp) * 100 : 0);
    const renderKey = `${p.tries}|${ok ? "k" : "w"}|${langRef()}|${summary?.t ?? "?"}|${(summary?.firstDeaths || []).length}|${(summary?.rezList || []).length}`;
    if (body.dataset.key === renderKey) return;
    body.dataset.key = renderKey;

    if (title) title.textContent = ok ? t("처치 성공", "KILL") : t("트라이 실패", "WIPE");
    if (sub) {
      sub.textContent = ok
        ? `${bossName} · ${timeStr} · ${t("트라이", "Try")} #${p.tries}`
        : `${bossName} · ${t("보스 HP", "Boss HP")} ${hpLeft.toFixed(1)}% · ${timeStr} · #${p.tries}`;
    }

    if (!summary) {
      body.innerHTML = `<div class="empty">${t("결과 데이터 없음", "No result data")}</div>`;
      return;
    }

    const cause = summary.wipeCause;
    const mvp = summary.mvp;
    const headline = ok
      ? mvp
        ? `<div class="g-res-mvp" style="--class:${mvp.color || "#f2b84b"}">
            <div class="g-res-mvp-tag">MVP</div>
            <div class="g-res-mvp-name">${resultPersonLabel(mvp)}</div>
            <div class="g-res-mvp-sub">${t(
              `${(mvp.portions ?? 0).toFixed(2)}인분 · 피할 수 있는 피해 ${fmtNum(mvp.avoidableTaken || 0)}`,
              `${(mvp.portions ?? 0).toFixed(2)} share · avoidable damage ${fmtNum(mvp.avoidableTaken || 0)}`
            )}</div>
          </div>`
        : ""
      : cause
        ? `<div class="g-res-cause">
            <span>${t("전멸 원인", "Wipe cause")}</span>
            <b>${langRef() === "ko" ? cause.ko : cause.en}</b>
          </div>`
        : "";

    const deaths = summary.firstDeaths || [];
    const rez = summary.rezList || [];
    const deathBlock = `<div class="g-res-side">
      <h4>${t("첫 사망", "First deaths")}</h4>
      ${
        deaths.length
          ? deaths
              .map(
                (d, i) =>
                  `<div class="g-res-chip" style="--class:${d.color || "#ff6b72"}"><b>${i + 1}</b> <span class="g-res-chip-main">${resultPersonLabel(d)}<small>${deathReasonLabel(d.reason)}</small></span> <em>${math().formatTime(d.t || 0)}</em></div>`
              )
              .join("")
          : `<div class="empty">${t("사망 없음", "No deaths")}</div>`
      }
    </div>`;
    const rezBlock = `<div class="g-res-side">
      <h4>${t("전투부활", "Battle rez")}</h4>
      ${
        rez.length
          ? rez
              .map(
                (r) =>
                  `<div class="g-res-chip rez" style="--class:${r.color || "#42d392"}">${resultPersonLabel(r)} <em>${math().formatTime(r.t || 0)}</em></div>`
              )
              .join("")
          : `<div class="empty">${t("부활 없음", "No battle rez")}</div>`
      }
    </div>`;

    const maxD = Math.max(1, ...(summary.dpsRank || []).map((r) => r.total || 0));
    const maxH = Math.max(1, ...(summary.hpsRank || []).map((r) => r.total || 0));
    const maxT = Math.max(1, ...(summary.dtRank || []).map((r) => r.total || 0));

    body.innerHTML = `
      ${headline}
      <div class="g-res-meta-grid">${deathBlock}${rezBlock}</div>
      <div class="g-res-ranks">
        <div class="g-res-col scroll">
          <h4>${t("피해량", "Damage")}</h4>
          <div class="g-res-list">${resultRankRows(summary.dpsRank, maxD, { withRate: true, withPortions: true })}</div>
        </div>
        <div class="g-res-col">
          <h4>${t("치유량 1–7", "Healing 1–7")}</h4>
          <div class="g-res-list">${resultRankRows(summary.hpsRank, maxH, { withRate: true, withOh: true, withPortions: true, withTankHeal: true })}</div>
        </div>
        <div class="g-res-col scroll">
          <h4>${t("피할 수 있는 피해", "Avoidable damage")}</h4>
          <div class="g-res-list">${resultRankRows(summary.dtRank, maxT)}</div>
        </div>
      </div>
    `;
  }

  function targetTypeLabel(tt) {
    const ko = C().TARGET_TYPE_KO?.[tt];
    return langRef() === "ko" ? ko || tt : tt;
  }

  function patchBossMeta(boss) {
    const box = $("#gBossMeta");
    if (!box || !boss) return;
    const key = `${boss.id}|${langRef()}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const hp = math().getBossHp(boss);
    const en = math().getBossEnrage(boss);
    const phases = (boss.phases || [])
      .map((p) => {
        const skills = math().getPhaseSkills(p);
        const bits = skills.map((s) => skillTypeLabel(s)).join(" · ");
        return `P${p.phase} ${bits}`;
      })
      .join("  |  ");
    box.innerHTML = `<div><b>${langRef() === "ko" ? boss.nameKo : boss.name}</b> · ${t("타입", "Type")} ${targetTypeLabel(
      boss.targetType
    )} · ${t("체력", "HP")} ${fmtNum(hp)} · ${t("광폭화", "Enrage")} ${math().formatTime(en)}</div>
      <div class="g-boss-skills">${phases}</div>
      <div class="g-boss-bonus">${t(
        "보스 타입과 특성이 맞는 딜러는 더 강해집니다",
        "Dealers whose specialty matches the boss type hit harder"
      )}</div>`;
  }

  function patchRecruit(eng, p, boss, counts, dpsN, full) {
    const rep = $("#gRep");
    if (rep) rep.textContent = String(Math.round(p.reputation));
    const title = $("#gRosterTitle");
    if (title) title.textContent = t("내 공대", "Your raid");
    const sub = $("#gRosterSub");
    const benchN = (p.bench || []).length;
    if (sub)
      sub.textContent = `${t("드래그로 후보 교체", "Drag to swap bench")} · ${t("선발", "Active")} ${p.members.length}/20 · ${t("후보", "Bench")} ${benchN}/4`;
    const meter = $("#gRosterMeter");
    if (meter) meter.style.width = `${(p.members.length / 20) * 100}%`;
    const st = $("#gStartTry");
    if (st) st.disabled = !(full && p.state !== "fighting");
    syncBrezSelects(p.battleRezMode);

    patchAppFilters();
    patchApps(p, boss, eng.clock);
    patchRosterColumns(p, counts, dpsN);
    patchBench(p);
    patchRecruitStatus(p, counts, dpsN, full);
    patchGameSynergies(p);
    const wclTitle = $("#gWclTitle");
    if (wclTitle)
      wclTitle.textContent = `${langRef() === "ko" ? boss.nameKo : boss.name} · ${t("진행도 순위", "Progress")}`;
    patchWcl($("#gWclTable"), eng);
  }

  function appFiltersAllOn() {
    return APP_FILTER_ROLES.every((r) => appRoleFilters.has(r));
  }

  function appFilterKey() {
    return APP_FILTER_ROLES.filter((r) => appRoleFilters.has(r)).join(",") || "none";
  }

  function patchAppFilters() {
    const box = $("#gAppFilters");
    if (!box) return;
    const allOn = appFiltersAllOn();
    if (box.dataset.built !== `roles|${langRef()}`) {
      box.dataset.built = `roles|${langRef()}`;
      box.innerHTML = [
        `<button type="button" class="chip" data-g-filter="All">${t("전체", "All")}</button>`,
        ...APP_FILTER_ROLES.map(
          (r) => `<button type="button" class="chip" data-g-filter="${r}">${roleLabel(r)}</button>`
        ),
      ].join("");
    }
    box.querySelectorAll("[data-g-filter]").forEach((btn) => {
      const role = btn.dataset.gFilter;
      btn.classList.toggle("on", role === "All" ? allOn : appRoleFilters.has(role));
    });
  }

  function patchApps(p, boss, clock) {
    const box = $("#gApps");
    if (!box) return;
    const scroll = box.scrollTop;
    const filtered = p.applicants.filter((c) => appRoleFilters.has(c.role));
    const ids = `${appFilterKey()}|${filtered.map((c) => c.id).join(",")}`;
    if (box.dataset.ids !== ids) {
      box.dataset.ids = ids;
      if (!filtered.length) {
        box.innerHTML = `<div class="empty">${
          p.applicants.length
            ? t("이 역할 지원자가 없습니다", "No applicants in this role")
            : t("대기 중… 시작 후 지원자가 도착합니다", "Waiting… press Start")
        }</div>`;
      } else {
        box.innerHTML = filtered.map((c) => applicantHtml(c, boss, clock)).join("");
      }
      box.scrollTop = scroll;
    } else {
      filtered.forEach((c) => {
        const card = box.querySelector(`[data-app="${c.id}"]`);
        if (!card) return;
        const left = Math.max(0, C().APPLY_EXPIRE_SEC - (clock - (c.appliedAt ?? clock)));
        const ex = card.querySelector(".g-expire");
        if (ex) {
          ex.textContent = `${left}s`;
          ex.classList.toggle("urgent", left <= 8);
        }
      });
    }
  }

  function cooldownLabel(cdSec) {
    if (cdSec === 90) return t("1.5분 쿨", "1.5m CD");
    if (cdSec === 120) return t("2분 쿨", "2m CD");
    return "";
  }

  function applicantHtml(c, boss, clock) {
    const M = math().getProficiency(c, boss.id, 1);
    const left = Math.max(0, C().APPLY_EXPIRE_SEC - (clock - (c.appliedAt ?? clock)));
    const scoreLabel = c.role === "Heal" ? t("힐", "Heal") : t("딜", "Perf");
    const cdBit = cooldownLabel(c.cdSec);
    const typeLabel =
      c.role === "Heal"
        ? healerLabel(c.healerType)
        : [c.specialty ? specialtyLabel(c.specialty) : "", cdBit].filter(Boolean).join(" · ") || "—";
    const school = c.damageSchool || math().getDamageSchool?.(c);
    const schoolTag =
      school === "AD"
        ? `<span class="g-school ad">AD</span>`
        : school === "AP"
          ? `<span class="g-school ap">AP</span>`
          : `<span class="g-school heal">${t("힐", "Heal")}</span>`;
    const className = langRef() === "ko" ? c.classKo : c.class;
    const specName = langRef() === "ko" ? c.specKo : c.spec;
    return `<div class="spec g-app-row" data-app="${c.id}" style="--class:${c.color}">
      <div class="spec-main">
        <div class="spec-title">${c.name} ${schoolTag}</div>
        <div class="spec-en">${className} · ${specName} · ${typeLabel}</div>
        <div class="g-app-stats">
          <span>${scoreLabel} <b>${c.performanceScore}</b></span>
          <span>${t("생존", "Surv")} <b>${c.survivalScore}</b></span>
          <span>${t("숙련", "Prof")} <b>${M.toFixed(0)}</b></span>
          <span class="g-expire ${left <= 8 ? "urgent" : ""}">${left}s</span>
        </div>
      </div>
      <span class="role ${c.role}">${roleLabel(c.role)}</span>
      <div class="g-app-acts">
        <button type="button" class="primary" data-g-act="accept" data-id="${c.id}">${t("수락", "Accept")}</button>
        <button type="button" class="ghost" data-g-act="reject" data-id="${c.id}">${t("거절", "Reject")}</button>
      </div>
    </div>`;
  }

  function memberSlotHtml(m, from) {
    const school = m.damageSchool || math().getDamageSchool?.(m);
    const schoolTag = school === "AD" ? "AD" : school === "AP" ? "AP" : t("힐", "Heal");
    const tip =
      m.role === "Heal"
        ? healerLabel(m.healerType)
        : [m.specialty ? specialtyLabel(m.specialty) : "", cooldownLabel(m.cdSec)].filter(Boolean).join(" · ") ||
          schoolTag;
    return `<div class="slot" draggable="true" data-drag-id="${m.id}" data-drag-from="${from}" style="--class:${m.color}" title="${t(
      "드래그해서 이동",
      "Drag to move"
    )}">
      <b>${m.name}</b>
      <span>${langRef() === "ko" ? m.specKo : m.spec} · ${tip}</span>
    </div>`;
  }

  function patchRosterColumns(p, counts, dpsN) {
    const box = $("#gRosterColumns");
    const hc = $("#gHeadcount");
    const countsBox = $("#gCounts");
    if (!box) return;
    const roles = ["Tank", "Melee", "Ranged", "Heal"];
    const healMin = C().HEAL_MIN ?? 4;
    const healMax = C().HEAL_MAX ?? 5;
    const ids = `m:${p.members.map((m) => m.id).join(",")}|${langRef()}`;
    if (box.dataset.ids !== ids) {
      box.dataset.ids = ids;
      box.innerHTML = roles
        .map((r) => {
          const list = p.members.filter((m) => m.role === r);
          const cap =
            r === "Tank"
              ? `/2`
              : r === "Heal"
                ? `/${healMin}~${healMax}`
                : "";
          const slots = list.length
            ? list.map((m) => memberSlotHtml(m, "members")).join("")
            : `<div class="empty">${t("아직 없음", "Empty")}</div>`;
          return `<div class="role-column" data-drop="members"><div class="role-title"><span>${roleLabel(
            r
          )}</span><span>${list.length}${cap}</span></div>${slots}</div>`;
        })
        .join("");
    }

    if (hc) {
      hc.innerHTML = `<div class="headcount-main">${t("선발", "Active")} <em>${p.members.length}</em> / 20</div>
        <div class="headcount-roles">${roleLabel("Tank")} ${counts.Tank}/2 · ${roleLabel(
        "Heal"
      )} ${counts.Heal}/${healMin}~${healMax} · DPS ${dpsN}</div>`;
    }
    if (countsBox) {
      countsBox.innerHTML = roles
        .map((r) => {
          const n = counts[r] || 0;
          return `<div class="count"><b>${n}</b><span>${roleLabel(r)}</span></div>`;
        })
        .join("");
    }
  }

  function patchBench(p) {
    const box = $("#gBench");
    const sub = $("#gBenchSub");
    if (!box) return;
    const bench = p.bench || [];
    const max = C().BENCH_MAX ?? 4;
    if (sub) sub.textContent = `${bench.length}/${max}`;
    const ids = `b:${bench.map((m) => m.id).join(",")}|${langRef()}`;
    if (box.dataset.ids === ids) return;
    box.dataset.ids = ids;
    box.innerHTML = bench.length
      ? bench.map((m) => memberSlotHtml(m, "bench")).join("")
      : `<div class="empty">${t("후보 없음 · 여기로 드래그", "Empty · drop here")}</div>`;
  }

  function patchRecruitStatus(p, counts, dpsN, full) {
    const box = $("#gStatusBox");
    if (!box) return;
    const buffs = math().computeGameBuffs(p.members || []);
    const list = window.RAID_GAME_BALANCE?.gameSynergies || [];
    const missing = list.filter((s) => !buffs.covered[s.id]).length;
    const healMin = C().HEAL_MIN ?? 4;
    const healMax = C().HEAL_MAX ?? 5;
    const leftTank = Math.max(0, 2 - counts.Tank);
    const leftHeal = Math.max(0, healMin - counts.Heal);
    const leftSlots = Math.max(0, 20 - p.members.length);
    const lines = [];
    lines.push(
      `<div class="status-line info">${t(
        `선발 남은 자리 ${leftSlots} · 탱 부족 ${leftTank} · 힐 최소 부족 ${leftHeal} · 힐 ${counts.Heal}/${healMin}~${healMax}`,
        `Active slots left ${leftSlots} · tank short ${leftTank} · heal min short ${leftHeal} · heal ${counts.Heal}/${healMin}~${healMax}`
      )}</div>`
    );
    if (full) {
      lines.push(
        `<div class="status-line ok">${t(
          counts.Heal >= 5
            ? "5힐 구성 · 트라이 출발 가능"
            : "정원 충족 · 트라이 출발 가능",
          counts.Heal >= 5 ? "5-heal setup · Ready to pull" : "Roster full · Ready to pull"
        )}</div>`
      );
    } else {
      lines.push(
        `<div class="status-line bad">${t(
          "선발 미달 · 지원 수락 또는 후보에서 드래그",
          "Active underfilled · Accept or drag from bench"
        )}</div>`
      );
    }
    if ((p.bench || []).length) {
      lines.push(
        `<div class="status-line info">${t(
          `후보 ${(p.bench || []).length}명 대기 중 (전투 미참여)`,
          `${(p.bench || []).length} on bench (not in combat)`
        )}</div>`
      );
    }
    if (missing === 0) {
      lines.push(
        `<div class="status-line ok">${t("시너지 전부 활성", "All synergies covered")}</div>`
      );
    } else {
      lines.push(
        `<div class="status-line bad">${t(
          `시너지 ${missing}개 미활성 · DPS/받피 손해`,
          `${missing} synergies missing · DPS/DT penalty`
        )}</div>`
      );
    }
    if (p.state === "victory") {
      lines.push(
        `<div class="status-line ok">${t(
          "보스 처치 완료 · 다시 트라이 가능",
          "Boss defeated · Can pull again"
        )}</div>`
      );
    }
    box.innerHTML = lines.join("");
  }

  function patchGameSynergies(p) {
    const box = $("#gSynergies");
    const summary = $("#gSynSummary");
    const banner = $("#gSynCompleteBanner");
    if (!box) return;
    const buffs = math().computeGameBuffs(p.members || []);
    const list = window.RAID_GAME_BALANCE?.gameSynergies || [];
    const activeN = list.filter((s) => buffs.covered[s.id]).length;
    const key = `${p.members.map((m) => m.id).join(",")}|${langRef()}`;
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      const ordered = [...list].sort(
        (a, b) => Number(!!buffs.covered[a.id]) - Number(!!buffs.covered[b.id]) || a.name.localeCompare(b.name)
      );
      box.innerHTML = ordered
        .map((syn) => {
          const on = !!buffs.covered[syn.id];
          const effect = langRef() === "ko" ? syn.effectKo : syn.effect;
          const name = langRef() === "ko" ? syn.nameKo : syn.name;
          const nameAlt = langRef() === "ko" ? syn.name : syn.nameKo;
          const prov = langRef() === "ko" ? syn.providerKo : (syn.providers || []).join(", ");
          return `<div class="synergy ${on ? "covered" : "inactive"}" style="--class:${syn.color || "#69b0ff"}">
            <div class="syn-head">
              <div class="syn-title-wrap">
                <div class="syn-name">${name}</div>
                <div class="syn-en">${nameAlt}</div>
              </div>
              <span class="syn-badge">${on ? t("활성", "ACTIVE") : t("미활성", "OFF")}</span>
            </div>
            <div class="syn-effect">${effect}</div>
            <div class="providers need">
              <span class="provider ${on ? "" : "need"}" style="--class:${syn.color || "#69b0ff"}">${prov}</span>
            </div>
          </div>`;
        })
        .join("");
    }
    if (summary) {
      summary.innerHTML = `<span>${t("활성", "Active")} <b>${activeN}/${list.length}</b></span>`;
    }
    if (banner) {
      const done = list.length > 0 && activeN === list.length;
      banner.classList.toggle("hidden", !done);
      if (done) banner.textContent = t("시너지 전부 활성 · 전투 배율 최대", "All synergies on · max combat buffs");
    }
  }

  function patchAi(eng) {
    void eng;
  }

  function stateLabel(s) {
    return (
      {
        recruiting: t("구인중", "Recruiting"),
        ready: t("준비", "Ready"),
        fighting: t("전투", "Fighting"),
        dead: t("전멸", "Wiped"),
        victory: t("처치", "Killed"),
      }[s] || s
    );
  }

  function personaInfo(id) {
    const p = id ? window.RAID_GAME_BALANCE?.recruit?.aiPersonas?.[id] : null;
    if (!p) return null;
    return {
      label: langRef() === "ko" ? p.nameKo || p.name : p.name || p.nameKo,
      desc: langRef() === "ko" ? p.descKo || p.desc || "" : p.desc || p.descKo || "",
    };
  }

  function raidDisplayName(r) {
    return langRef() === "ko" ? r.nameKo || r.name : r.name || r.nameKo;
  }

  function bestPctText(killed, tries, bestPct) {
    return killed ? "Kill" : tries > 0 ? `${bestPct.toFixed(1)}%` : "—";
  }

  // 행 노드를 공대별로 유지해야 갱신 중에도 클릭이 씹히지 않는다
  function patchWcl(box, eng) {
    if (!box) return;
    const rows = eng.standings();
    let table = box.querySelector(".wcl-table");
    if (!table || table.dataset.lang !== langRef()) {
      box.innerHTML = `<div class="wcl-table" data-lang="${langRef()}">
        <div class="wcl-row wcl-head-row">
          <span>#</span><span>${t("공대", "Raid")}</span><span>${t("진행도", "Progress")}</span><span>${t("풀", "Pulls")}</span><span>${t("베스트", "Best")}</span>
        </div>
      </div>`;
      table = box.querySelector(".wcl-table");
    }
    rows.forEach((s, i) => {
      let row = table.querySelector(`.wcl-row[data-raid="${s.id}"]`);
      if (!row) {
        row = document.createElement("div");
        row.className = "wcl-row";
        row.dataset.raid = s.id;
        row.dataset.gAct = "scout";
        row.dataset.id = s.id;
        row.innerHTML = `<span class="wcl-rank"></span>
          <span class="wcl-name"><span class="wcl-name-text"></span><small class="wcl-tag"></small></span>
          <span class="wcl-prog"><div class="wcl-prog-bar"><i></i></div><em></em></span>
          <span class="wcl-pulls"></span>
          <span class="wcl-best" title="${t("최저 보스 HP", "Lowest boss HP")}"></span>`;
      }
      const slot = table.children[i + 1] || null;
      if (slot !== row) table.insertBefore(row, slot);

      const killed = s.killOrder != null;
      const fighting = s.state === "fighting" && !killed;
      const progress = killed ? 100 : Math.max(0, 100 - (fighting ? s.hpPct : s.bestPct));
      const name = langRef() === "ko" ? s.name : s.nameEn || s.name;
      const persona = personaInfo(s.persona);
      const repBit = s.reputation != null ? `${t("명성", "Rep")} ${Math.round(s.reputation)}` : "";
      const tagText = s.isPlayer ? repBit : [persona?.label, repBit].filter(Boolean).join(" · ");

      row.classList.toggle("you", !!s.isPlayer);
      row.classList.toggle("killed", killed);
      row.classList.toggle("live", fighting);
      row.classList.toggle("scouted", scoutId === s.id);
      row.title = `${persona?.desc ? `${persona.desc} · ` : ""}${t("클릭해서 공대 살펴보기", "Click to scout this raid")}`;
      setText(row.querySelector(".wcl-rank"), String(killed ? s.killOrder : i + 1));
      setText(row.querySelector(".wcl-name-text"), `${name}${s.isPlayer ? t(" (나)", " (You)") : ""}`);
      const tag = row.querySelector(".wcl-tag");
      setText(tag, tagText);
      tag.hidden = !tagText;
      const bar = row.querySelector(".wcl-prog-bar i");
      const w = `${progress}%`;
      if (bar.style.width !== w) bar.style.width = w;
      setText(row.querySelector(".wcl-prog em"), killed ? "Kill" : `${progress.toFixed(1)}%`);
      setText(row.querySelector(".wcl-pulls"), String(s.tries));
      setText(row.querySelector(".wcl-best"), bestPctText(killed, s.tries, s.bestPct));
    });
  }

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function avgOf(list, fn) {
    if (!list.length) return 0;
    return list.reduce((s, x) => s + fn(x), 0) / list.length;
  }

  function avgBossProficiency(m, boss) {
    const phases = boss.phases || [];
    if (!phases.length) return 0;
    return avgOf(phases, (ph) => math().getProficiency(m, boss.id, ph.phase));
  }

  function patchScout(eng) {
    const modal = $("#gScoutModal");
    const head = $("#gScoutHead");
    const body = $("#gScoutBody");
    const r = eng.raids.find((x) => x.id === scoutId);
    if (!r || !head || !body) {
      scoutId = null;
      if (modal) modal.hidden = true;
      return;
    }
    const boss = eng.boss;
    const c = r.combat;
    const fighting = r.state === "fighting" && c && !c.finished;
    const persona = personaInfo(r.aiPersona);
    const killed = r.killOrder != null;
    const rank = eng.standings().findIndex((s) => s.id === r.id) + 1;

    const headHtml = `<div class="g-scout-title">
        <div>
          <div class="g-wcl-kicker">${t("공대 살펴보기", "Raid scout")}</div>
          <h2>${raidDisplayName(r)}${r.isPlayer ? t(" (나)", " (You)") : ""}</h2>
          <div class="sub">${
            persona ? `${persona.label} · ${persona.desc}` : r.isPlayer ? t("플레이어 공대", "Your raid") : ""
          }</div>
        </div>
        <span class="g-scout-state st-${r.state}">${stateLabel(r.state)}</span>
      </div>
      <div class="g-scout-stats">
        <div><span>${t("순위", "Rank")}</span><b>${
          killed ? t(`${r.killOrder}번째 처치`, `Kill #${r.killOrder}`) : `#${rank}`
        }</b></div>
        <div><span>${t("명성", "Reputation")}</span><b>${Math.round(r.reputation)}</b></div>
        <div><span>${t("풀 수", "Pulls")}</span><b>${r.tries}</b></div>
        <div><span>${t("베스트", "Best")}</span><b>${bestPctText(killed, r.tries, r.bestPct)}</b></div>
      </div>`;
    if (head.dataset.html !== headHtml) {
      head.dataset.html = headHtml;
      head.innerHTML = headHtml;
    }

    const skeletonKey = `${r.id}|${langRef()}`;
    if (body.dataset.key !== skeletonKey) {
      body.dataset.key = skeletonKey;
      body.scrollTop = 0;
      body.innerHTML = `<div class="g-scout-live" data-part="live"></div>
        <div class="g-scout-summary" data-part="summary"></div>
        <div class="g-scout-roster" data-part="roster"></div>
        <div class="g-scout-log-wrap">
          <h3>${t("최근 기록", "Recent log")}</h3>
          <div class="g-log g-scout-log" data-part="log"></div>
        </div>`;
    }

    patchScoutLive(body.querySelector('[data-part="live"]'), r, c, fighting);
    patchScoutSummary(body.querySelector('[data-part="summary"]'), r, boss);
    patchScoutRoster(body.querySelector('[data-part="roster"]'), r, c, fighting, boss);

    const logBox = body.querySelector('[data-part="log"]');
    const logs = (r.logs || []).slice(0, 10);
    const logKey = logs.map((l) => `${l.t}:${l.text}`).join("|");
    if (logBox && logBox.dataset.key !== logKey) {
      logBox.dataset.key = logKey;
      logBox.innerHTML =
        logs.map((l) => `<div class="g-log-line ${l.kind}">[${math().formatTime(l.t)}] ${l.text}</div>`).join("") ||
        `<div class="empty">${t("아직 기록 없음", "No log yet")}</div>`;
    }
  }

  function patchScoutLive(box, r, c, fighting) {
    if (!box) return;
    let html;
    if (fighting) {
      const hpPct = (c.bossHp / c.bossMaxHp) * 100;
      const alive = c.members.filter((m) => m.alive).length;
      const enrageText = c.enraged
        ? `<b class="bad">${t("광폭화 중", "ENRAGED")}</b>`
        : `${t("광폭화까지", "Enrage in")} ${math().formatTime(Math.max(0, c.enrage - c.t))}`;
      html = `<div class="g-scout-live-top">
          <b>${t(`트라이 #${r.tries} 진행 중`, `Try #${r.tries} in progress`)}</b>
          <span>${hpPct.toFixed(1)}%</span>
        </div>
        <div class="g-hp wcl-bar"><i style="width:${Math.max(0, Math.min(100, hpPct))}%"></i></div>
        <div class="g-scout-live-meta">
          <span>${math().formatTime(c.t)}</span>
          <span>P${c.phaseReached}</span>
          <span>${t("생존", "Alive")} ${alive}/${c.members.length}</span>
          <span>${t("전투부활", "BRez")} ${c.battleRezLeft}/${C().BATTLE_REZ_PER_TRY}</span>
          <span>${enrageText}</span>
        </div>`;
    } else if (c?.finished && c.summary) {
      const s = c.summary;
      const ok = r.state === "victory" || !s.wipeCause;
      const hpPct = (c.bossHp / c.bossMaxHp) * 100;
      const cause = s.wipeCause ? (langRef() === "ko" ? s.wipeCause.ko : s.wipeCause.en) : "";
      const mvp = s.mvp ? `MVP ${s.mvp.name}` : "";
      html = `<div class="g-scout-last ${ok ? "ok" : "bad"}">
          <span>${t(`지난 트라이 #${r.tries}`, `Last try #${r.tries}`)} · ${math().formatTime(s.t || c.t)}</span>
          <b>${ok ? t("처치 성공", "Killed") : `${t("전멸", "Wipe")} ${hpPct.toFixed(1)}% · ${cause}`}</b>
          ${ok && mvp ? `<small>${mvp}</small>` : ""}
        </div>`;
    } else {
      html = `<div class="g-scout-last idle"><span>${t("아직 트라이 전", "No pulls yet")}</span><b>${
        stateLabel(r.state)
      } · ${r.members.length}/${C().RAID_SIZE}</b></div>`;
    }
    if (box.dataset.html !== html) {
      box.dataset.html = html;
      box.innerHTML = html;
    }
  }

  function patchScoutSummary(box, r, boss) {
    if (!box) return;
    const members = r.members || [];
    const counts = { Tank: 0, Heal: 0, Melee: 0, Ranged: 0 };
    members.forEach((m) => counts[m.role]++);
    const dealers = members.filter((m) => m.role !== "Heal");
    const healers = members.filter((m) => m.role === "Heal");
    const buffs = math().computeGameBuffs(members);
    const synList = window.RAID_GAME_BALANCE?.gameSynergies || [];
    const synOn = synList.filter((s) => buffs.covered[s.id]).length;
    const fmtAvg = (list, fn) => (list.length ? avgOf(list, fn).toFixed(0) : "—");
    const html = `<div class="g-scout-grid">
        <div><span>${t("인원", "Roster")}</span><b>${members.length}/${C().RAID_SIZE}</b>
          <small>${roleLabel("Tank")} ${counts.Tank} · ${roleLabel("Heal")} ${counts.Heal} · ${t("딜", "DPS")} ${
            counts.Melee + counts.Ranged
          }</small></div>
        <div><span>${t("평균 딜 점수", "Avg DPS score")}</span><b>${fmtAvg(dealers, (m) => m.performanceScore)}</b></div>
        <div><span>${t("평균 힐 점수", "Avg heal score")}</span><b>${fmtAvg(healers, (m) => m.performanceScore)}</b></div>
        <div><span>${t("평균 생존", "Avg survival")}</span><b>${fmtAvg(members, (m) => m.survivalScore)}</b></div>
        <div><span>${t("평균 숙련", "Avg proficiency")}</span><b>${
          members.length ? `${avgOf(members, (m) => avgBossProficiency(m, boss)).toFixed(0)}%` : "—"
        }</b></div>
        <div><span>${t("시너지", "Synergies")}</span><b>${synOn}/${synList.length}</b></div>
        <div><span>${t("대기 지원서", "Pending apps")}</span><b>${(r.applicants || []).length}</b></div>
      </div>`;
    if (box.dataset.html !== html) {
      box.dataset.html = html;
      box.innerHTML = html;
    }
  }

  function patchScoutRoster(box, r, c, fighting, boss) {
    if (!box) return;
    const source = fighting ? c.members : r.members || [];
    const key = `${fighting ? "c" : "r"}|${boss.id}|${source.map((m) => m.id).join(",")}`;
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      const groups = ["Tank", "Heal", "Melee", "Ranged"];
      box.innerHTML = source.length
        ? groups
            .map((role) => {
              const list = source
                .filter((m) => m.role === role)
                .sort((a, b) => b.performanceScore - a.performanceScore);
              return `<div class="g-scout-col">
              <div class="rf-group-title">${roleLabel(role)} ${list.length}</div>
              ${
                list
                  .map(
                    (m) => `<div class="g-scout-unit" data-mid="${m.id}" style="--class:${m.color || "#8ec5ff"}">
                  <div class="g-scout-unit-top"><b>${m.name}</b><span>${
                      langRef() === "ko" ? m.specKo || m.spec : m.spec
                    }</span></div>
                  <div class="g-scout-unit-stats">
                    <span>${m.role === "Heal" ? t("힐", "Heal") : t("딜", "DPS")} ${m.performanceScore}</span>
                    <span>${t("생존", "Surv")} ${m.survivalScore}</span>
                    <span>${t("숙련", "Prof")} ${avgBossProficiency(m, boss).toFixed(0)}%</span>
                  </div>
                  ${fighting ? `<div class="g-scout-unit-hp"><i></i></div>` : ""}
                </div>`
                  )
                  .join("") || `<div class="empty">—</div>`
              }
            </div>`;
            })
            .join("")
        : `<div class="empty">${t("아직 공대원이 없습니다", "No members yet")}</div>`;
    }
    if (!fighting) return;
    source.forEach((m) => {
      const el = box.querySelector(`.g-scout-unit[data-mid="${m.id}"]`);
      if (!el) return;
      const dead = m.alive === false;
      el.classList.toggle("dead", dead);
      const bar = el.querySelector(".g-scout-unit-hp i");
      if (bar) {
        const w = `${dead ? 0 : Math.max(0, (m.hp / m.maxHp) * 100)}%`;
        if (bar.style.width !== w) bar.style.width = w;
      }
    });
  }

  function patchTry(eng, p, boss, full) {
    const c = p.combat;
    const fighting = p.state === "fighting" && c && !c.finished;
    syncBrezSelects(p.battleRezMode);
    attachArena();
    syncMarkerTools();

    const kicker = $("#gTryKicker");
    if (kicker) kicker.textContent = `${t("트라이", "Try")} #${p.tries || 0}`;
    const tb = $("#gTryBoss");
    if (tb) tb.textContent = langRef() === "ko" ? boss.nameKo : boss.name;
    const portBox = $("#gTryBossPortrait");
    if (portBox) {
      const html = FX()?.bossPortraitHtml?.(boss, "lg") || "";
      if (portBox.dataset.boss !== (boss?.id || "")) {
        portBox.dataset.boss = boss?.id || "";
        portBox.innerHTML = html;
      }
    }
    FX()?.applyBossTheme?.(boss);

    const left = c ? Math.max(0, c.enrage - c.t) : math().getBossEnrage(boss);
    const en = $("#gEnrage");
    if (en) {
      if (c?.enraged) {
        en.textContent = t("광폭화 중", "ENRAGED");
        en.classList.add("urgent");
      } else {
        en.textContent = `${t("광폭화", "Enrage")} ${math().formatTime(left)}`;
        en.classList.toggle("urgent", fighting && left <= 30);
      }
    }
    const bl = $("#gBrezLeft");
    if (bl) bl.textContent = `${t("전투부활", "BRez")} ${c ? c.battleRezLeft : C().BATTLE_REZ_PER_TRY}/${C().BATTLE_REZ_PER_TRY}`;

    const st = $("#gStartTry2");
    if (st) {
      st.disabled = !(full && p.state !== "fighting");
      st.textContent = fighting ? t("전투 중", "In combat") : t("트라이 출발", "Start try");
    }

    const hpPct = c ? (c.bossHp / c.bossMaxHp) * 100 : 100;
    const hpText = $("#gBossHpText");
    if (hpText) hpText.textContent = c ? `${hpPct.toFixed(2)}% · ${fmtNum(c.bossHp)}` : "—";
    const hpBar = $("#gBossHpBar");
    if (hpBar) {
      hpBar.style.width = `${c ? Math.max(0, Math.min(100, hpPct)) : 100}%`;
      hpBar.classList.toggle("enraged-pulse", !!(c?.enraged && fighting));
    }

    const meta = $("#gCombatMeta");
    if (meta) {
      if (c) {
        const synList = window.RAID_GAME_BALANCE?.gameSynergies || [];
        const synOn = c.buffs ? synList.filter((s) => c.buffs.covered[s.id]).length : 0;
        const synBit = synList.length ? ` · ${t("시너지", "Synergies")} ${synOn}/${synList.length}` : "";
        meta.textContent = `${t("생존", "Alive")} ${c.members.filter((m) => m.alive).length}/20 · DPS ${fmtNum(c.meter.dps)}/s · HPS ${fmtNum(c.meter.hps)}/s · P${c.phaseReached}${synBit}`;
      } else {
        meta.textContent = t("트라이를 시작하면 레이드 프레임이 활성화됩니다", "Start a try to activate raid frames");
      }
    }

    const tw = $("#gTankWipe");
    if (tw) {
      if (c?.tankWipeAt != null && fighting) {
        tw.hidden = false;
        tw.textContent = `${t("탱커 전멸 카운트다운", "Tank wipe in")} ${Math.max(0, c.tankWipeAt - c.t)}s`;
      } else tw.hidden = true;
    }

    patchRaidFrames(p);
    patchInspect(p, boss);
    patchMeters(c);
    patchLog(p);
    patchWcl($("#gWclTableSide"), eng);
  }

  function patchRaidFrames(p) {
    const box = $("#gRaidFrames");
    if (!box) return;
    const source =
      p.combat?.members ||
      p.members.map((m) => ({
        ...m,
        alive: true,
        hp: 1,
        maxHp: 1,
        damageTaken: 0,
        lastDamage: 0,
        lastDamageAt: -99,
      }));
    const tNow = p.combat?.t ?? 0;
    const ids = source.map((m) => m.id).join("|");
    if (box.dataset.ids !== ids) {
      box.dataset.ids = ids;
      const groups = [
        { key: "Tank", label: roleLabel("Tank") },
        { key: "Heal", label: roleLabel("Heal") },
        { key: "Melee", label: roleLabel("Melee") },
        { key: "Ranged", label: roleLabel("Ranged") },
      ];
      box.innerHTML = groups
        .map((g) => {
          const list = source.filter((m) => m.role === g.key);
          if (!list.length) return "";
          return `<div class="rf-group" data-role="${g.key}">
            <div class="rf-group-title">${g.label}</div>
            <div class="rf-grid">${list
              .map(
                (m) => `<div class="rf-unit" data-g-act="inspect" data-id="${m.id}" style="--class:${m.color || "#8ec5ff"}" title="${m.name}">
              <div class="rf-bar"><i></i></div>
              <div class="rf-name">${m.name}</div>
              <div class="rf-sub">${langRef() === "ko" ? m.specKo || m.spec : m.spec}</div>
              <div class="rf-meta"><span class="rf-pct"></span><span class="rf-dt"></span></div>
              ${
                m.role === "Melee" || m.role === "Ranged"
                  ? `<div class="rf-cd" hidden><img alt="" decoding="async"><span class="rf-cd-tag"></span></div>`
                  : ""
              }
              <div class="rf-float" hidden></div>
            </div>`
              )
              .join("")}</div>
          </div>`;
        })
        .join("");
    }

    const manual = p.battleRezMode === "manual";
    const nowMs = performance.now();
    source.forEach((m) => {
      const el = box.querySelector(`.rf-unit[data-id="${m.id}"]`);
      if (!el) return;
      const pct = m.maxHp ? (m.hp / m.maxHp) * 100 : 100;
      const dead = m.alive === false;
      const recent = !dead && m.lastDamage > 0 && tNow - (m.lastDamageAt ?? -99) <= 2;
      const justDead = dead && (fxDeathUntil[m.id] || 0) > nowMs;
      const justRez = !dead && (fxRezUntil[m.id] || 0) > nowMs;
      const canBurst = m.role === "Melee" || m.role === "Ranged";
      const bursting = canBurst && !dead && !!m.bursting;
      const onCd = canBurst && !dead && !bursting && !!m.onCd;
      const justBurst = bursting && (fxBurstUntil[m.id] || 0) > nowMs;
      el.classList.toggle("dead", dead);
      el.classList.toggle("hit", recent);
      el.classList.toggle("just-dead", justDead);
      el.classList.toggle("just-rez", justRez);
      el.classList.toggle("bursting", bursting);
      el.classList.toggle("burst-pop", justBurst);
      el.classList.toggle("selected", inspectId === m.id);
      el.classList.toggle("brezable", manual && dead && (p.combat?.battleRezLeft || 0) > 0);
      const bar = el.querySelector(".rf-bar i");
      if (bar) bar.style.width = `${dead ? 0 : Math.max(0, pct)}%`;
      const pctEl = el.querySelector(".rf-pct");
      if (pctEl) {
        if (dead) {
          const why = deathReasonLabel(m.deathReason || m.lastDeathReason);
          pctEl.textContent = `${t("사망", "DEAD")}`;
          pctEl.title = why;
          let whyEl = el.querySelector(".rf-death-why");
          if (!whyEl) {
            whyEl = document.createElement("div");
            whyEl.className = "rf-death-why";
            el.querySelector(".rf-meta")?.appendChild(whyEl);
          }
          whyEl.textContent = why;
          whyEl.hidden = false;
        } else {
          pctEl.textContent = `${pct.toFixed(0)}%`;
          pctEl.removeAttribute("title");
          const whyEl = el.querySelector(".rf-death-why");
          if (whyEl) whyEl.hidden = true;
        }
      }
      const dt = el.querySelector(".rf-dt");
      if (dt) dt.textContent = m.damageTaken > 0 ? `${t("피격", "DT")} ${fmtNum(m.damageTaken)}` : "";
      let cdEl = el.querySelector(".rf-cd");
      if (!canBurst) {
        if (cdEl) cdEl.remove();
      } else {
        if (!cdEl) {
          cdEl = document.createElement("div");
          cdEl.className = "rf-cd";
          cdEl.hidden = true;
          cdEl.innerHTML = `<img alt="" decoding="async"><span class="rf-cd-tag"></span>`;
          el.appendChild(cdEl);
        }
        const tag = cdEl.querySelector(".rf-cd-tag");
        if (bursting || onCd) {
          const info = burstIconInfo(m);
          const img = cdEl.querySelector("img");
          if (img && img.dataset.icon !== info.icon) {
            img.dataset.icon = info.icon;
            img.onerror = () => {
              img.onerror = null;
              img.src = `${BURST_ICON_CDN}ability_warrior_innerrage.jpg`;
            };
            img.src = info.url;
            img.alt = info.label;
          }
          cdEl.classList.toggle("active", bursting);
          cdEl.classList.toggle("cooling", onCd);
          if (tag) {
            tag.textContent = bursting
              ? t("사용중", "ACTIVE")
              : `${Math.max(1, m.cdRemain || 0)}s`;
          }
          cdEl.title = bursting
            ? `${info.label} · ${t("쿨기 사용 중", "Bursting")}`
            : `${info.label} · ${t("쿨타임", "Cooldown")} ${Math.max(1, m.cdRemain || 0)}s`;
          cdEl.hidden = false;
        } else {
          cdEl.classList.remove("active", "cooling");
          cdEl.hidden = true;
        }
      }
      const fl = el.querySelector(".rf-float");
      if (fl) {
        if (recent) {
          fl.hidden = false;
          fl.textContent = `-${fmtNum(m.lastDamage)}`;
        } else fl.hidden = true;
      }
      el.setAttribute("data-g-act", "inspect");
      el.setAttribute("data-id", m.id);
      el.title = t("클릭해서 스펙 보기", "Click to inspect");
    });
  }

  function potentialLabel(v) {
    const n = Number(v) || 1;
    if (n >= 1.8) return t("천재형", "Prodigy");
    if (n >= 1.55) return t("높음", "High");
    if (n >= 1.3) return t("보통", "Average");
    return t("낮음", "Low");
  }

  function conditionLabel(v) {
    if (v == null) return "—";
    if (v >= 1.1) return t("최상", "Peak");
    if (v >= 1.02) return t("좋음", "Good");
    if (v >= 0.95) return t("보통", "Normal");
    return t("나쁨", "Poor");
  }

  function patchInspect(p, boss) {
    const box = $("#gInspect");
    if (!box) return;
    if (!inspectId) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const src = p.combat?.members || p.members;
    const m = src.find((x) => x.id === inspectId);
    if (!m) {
      inspectId = null;
      box.hidden = true;
      return;
    }

    const inCombat = !!(p.combat && !p.combat.finished);
    const tSec = Math.max(1, p.combat?.t || 1);
    const hpPct = m.maxHp ? ((m.hp ?? m.maxHp) / m.maxHp) * 100 : 100;
    const dead = m.alive === false;
    const scoreLabel = m.role === "Heal" ? t("힐 점수", "Heal score") : t("딜 점수", "Perf score");
    const typeLabel =
      m.role === "Heal"
        ? `${t("힐 타입", "Heal type")}: ${healerLabel(m.healerType)}`
        : [
            m.specialty ? `${t("특성", "Specialty")}: ${specialtyLabel(m.specialty)}` : "",
            m.cdSec ? `${t("쿨기", "Cooldown")}: ${cooldownLabel(m.cdSec)}` : "",
          ]
            .filter(Boolean)
            .join(" · ");

    const profPhases = (boss.phases || [])
      .map((ph) => {
        const v = math().getProficiency(m, boss.id, ph.phase);
        return `P${ph.phase} ${v.toFixed(0)}%`;
      })
      .join(" · ");

    const manual = p.battleRezMode === "manual";
    const canBrez = manual && dead && inCombat && (p.combat?.battleRezLeft || 0) > 0;

    box.hidden = false;
    box.innerHTML = `
      <div class="g-inspect-card" style="--class:${m.color}">
        <div class="g-inspect-top">
          <div>
            <div class="g-inspect-name">${m.name}</div>
            <div class="g-inspect-sub">${langRef() === "ko" ? m.classKo : m.class} · ${
              langRef() === "ko" ? m.specKo : m.spec
            } · ${roleLabel(m.role)}${dead ? ` · ${t("사망", "DEAD")}` : ""}</div>
          </div>
          <button type="button" class="ghost" data-g-act="close-inspect">${t("닫기", "Close")}</button>
        </div>
        <div class="g-inspect-grid">
          <div><span>${scoreLabel}</span><b>${m.performanceScore}</b></div>
          <div><span>${t("생존", "Survival")}</span><b>${m.survivalScore}</b></div>
          <div><span>${t("잠재력", "Potential")}</span><b>${potentialLabel(m.potential)}</b></div>
          <div><span>${t("숙련", "Proficiency")}</span><b>${profPhases || "—"}</b></div>
        </div>
        ${typeLabel ? `<div class="g-inspect-type">${typeLabel}</div>` : ""}
        ${
          inCombat
            ? `<div class="g-inspect-combat">
          <div><span>HP</span><b>${dead ? "0" : hpPct.toFixed(1)}% (${fmtNum(m.hp || 0)} / ${fmtNum(m.maxHp || 0)})</b></div>
          <div><span>${t("피격 합", "Damage taken")}</span><b>${fmtNum(m.damageTaken || 0)}</b></div>
          <div><span>${t("받은 힐", "Healing taken")}</span><b>${fmtNum(m.healingTaken || 0)}</b></div>
          <div><span>${m.role === "Heal" ? "HPS" : "DPS"}</span><b>${fmtNum(
            m.role === "Heal" ? (m.hpsDone || 0) / tSec : (m.dpsDone || 0) / tSec
          )}</b></div>
          ${
            m.role === "Heal"
              ? `<div><span>${t("실힐 합", "Eff. heal")}</span><b>${fmtNum(m.hpsDone || 0)}</b></div>
          <div><span>${t("오버힐", "Overheal")}</span><b>${fmtNum(
            Math.max(0, (m.healCapacityDone || 0) - (m.hpsDone || 0))
          )}</b></div>`
              : `<div><span>${t("누적 딜", "Damage")}</span><b>${fmtNum(m.dpsDone || 0)}</b></div>`
          }
          <div><span>${t("컨디션", "Condition")}</span><b>${conditionLabel(p.combat?.conditions?.[m.id])}</b></div>
        </div>`
            : ""
        }
        ${
          canBrez
            ? `<button type="button" class="primary" data-g-act="brez" data-id="${m.id}">${t(
                "전투부활",
                "Battle rez"
              )}</button>`
            : ""
        }
      </div>
    `;
  }

  function patchMeters(c) {
    const dpsBox = $("#gDpsMeter");
    const hpsBox = $("#gHpsMeter");
    if (!dpsBox || !hpsBox) return;
    if (!c) {
      dpsBox.innerHTML = `<div class="empty">—</div>`;
      hpsBox.innerHTML = `<div class="empty">—</div>`;
      dpsBox.dataset.ids = "";
      hpsBox.dataset.ids = "";
      return;
    }
    const tSec = Math.max(1, c.t);
    const dpsList = [...c.members]
      .filter((m) => m.role !== "Heal")
      .sort((a, b) => b.dpsDone - a.dpsDone);
    const hpsList = [...c.members]
      .filter((m) => m.role === "Heal")
      .sort((a, b) => (b.hpsDone || 0) - (a.hpsDone || 0));
    const maxD = Math.max(1, ...dpsList.map((m) => m.dpsDone));
    // 막대·순위 = 실힐만. 오버힐은 숫자 참고용
    const maxH = Math.max(1, ...hpsList.map((m) => m.hpsDone || 0));

    syncMeterList(dpsBox, dpsList, (m) => ({
      name: `${m.name}${m.alive ? "" : " ✝"}`,
      pct: (m.dpsDone / maxD) * 100,
      val: fmtNum(m.dpsDone / tSec),
      total: fmtNum(m.dpsDone),
    }));
    syncMeterList(
      hpsBox,
      hpsList,
      (m) => {
        const cap = m.healCapacityDone || 0;
        const eff = m.hpsDone || 0;
        const oh = Math.max(0, cap - eff);
        return {
          name: `${m.name}${m.alive ? "" : " ✝"}`,
          pct: (eff / maxH) * 100,
          val: fmtNum(eff / tSec),
          total: fmtNum(eff),
          overheal: fmtNum(oh),
        };
      },
      true
    );
  }

  function syncMeterList(box, list, mapRow, withOverheal) {
    const scroll = box.scrollTop;
    const idSet = `${withOverheal ? "v4eff" : "v2"}|${[...list]
      .map((m) => m.id)
      .sort()
      .join(",")}`;
    if (box.dataset.ids !== idSet) {
      box.dataset.ids = idSet;
      box.innerHTML = list
        .map(
          (m) => `<div class="meter-row ${withOverheal ? "with-oh" : ""}" data-mid="${m.id}" style="--class:${m.color}">
          <span class="meter-name"></span>
          <div class="meter-bar"><i></i></div>
          <span class="meter-val"></span>
          <span class="meter-total"></span>
          ${withOverheal ? `<span class="meter-oh"></span>` : ""}
        </div>`
        )
        .join("");
    }
    list.forEach((m) => {
      const row = box.querySelector(`[data-mid="${m.id}"]`);
      if (!row) return;
      box.appendChild(row);
      const info = mapRow(m);
      const name = row.querySelector(".meter-name");
      const bar = row.querySelector(".meter-bar i");
      const val = row.querySelector(".meter-val");
      const total = row.querySelector(".meter-total");
      const oh = row.querySelector(".meter-oh");
      if (name) name.textContent = info.name;
      if (bar) bar.style.width = `${info.pct}%`;
      if (val) val.textContent = info.val;
      if (total) total.textContent = info.total;
      if (oh) oh.textContent = info.overheal || "0";
      row.classList.toggle(
        "bursting",
        !!(m.alive !== false && m.bursting && (m.role === "Melee" || m.role === "Ranged"))
      );
    });
    box.scrollTop = scroll;
  }

  function patchLog(p) {
    const box = $("#gLog");
    if (!box) return;
    const key = (p.logs || []).slice(0, 14).map((l) => `${l.t}:${l.text}`).join("|");
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.innerHTML =
      (p.logs || [])
        .slice(0, 14)
        .map((l) => `<div class="g-log-line ${l.kind}">[${math().formatTime(l.t)}] ${l.text}</div>`)
        .join("") || `<div class="empty">${t("전투 로그 대기", "Combat log idle")}</div>`;
  }

  function patchTransfer(p, boss) {
    const box = $("#gTransferList");
    if (!box) return;
    const owned = [...(p.members || []), ...(p.bench || [])];
    box.innerHTML =
      owned
        .map((m) => {
          const M = math().getProficiency(m, boss.id, 1);
          const where = (p.bench || []).some((b) => b.id === m.id)
            ? t("후보", "Bench")
            : t("선발", "Active");
          return `<div class="g-transfer-row" style="--class:${m.color}">
          <div>
            <b>${m.name}</b>
            <div class="sub">${langRef() === "ko" ? m.classKo : m.class} · ${
              langRef() === "ko" ? m.specKo : m.spec
            } · ${where}</div>
            <div class="g-stats"><span>${m.performanceScore}/${m.survivalScore}</span><span>${M.toFixed(0)}%</span></div>
          </div>
          <button type="button" class="danger" data-g-act="release" data-id="${m.id}">${t("방출", "Release")}</button>
        </div>`;
        })
        .join("") || `<div class="empty">${t("방출할 인원 없음", "No members to release")}</div>`;
  }

  // Public render alias for app.js lang toggle
  function render() {
    lastScreen = null;
    shellBuilt = false;
    ensureShell(true);
    patch(true);
  }

  global.RaidGameUI = { mount, resetGame, render, getEngine: () => engine };
})(window);
