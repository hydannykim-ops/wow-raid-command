/**
 * 구인 Game 전장 렌더러 — 오더 그림판과 같은 1024×576 좌표.
 * 엔진 상태(raid.combat)를 읽기만 하고, 자체 rAF 루프로 그린다.
 */
(function (global) {
  "use strict";

  const BW = 1024;
  const BH = 576;
  const TOKEN_R = 12;
  const ROLE_COLOR = { Tank: "#4f86c6", Heal: "#5ecf7a", Melee: "#e0674a", Ranged: "#d4a017" };

  let canvas = null;
  let ctx = null;
  let opts = null;
  let raf = 0;
  let scale = 1;
  let lastNow = 0;
  let hoverId = null;
  let hoverMarker = null;
  let cursorPt = null;
  let dragKind = null;
  let dragMember = null;
  let downPt = null;
  let suppressClick = false;
  let combatRef = null;
  const disp = new Map();
  const iconCache = new Map();

  const Arena = () => global.RaidGameEngine?.arena;
  const Assets = () => global.BoardAssets;

  function attach(cv, o) {
    opts = o;
    if (canvas === cv) return;
    detach();
    canvas = cv;
    ctx = cv.getContext("2d");
    cv.addEventListener("click", onClick);
    cv.addEventListener("mousedown", onDown);
    cv.addEventListener("contextmenu", onContext);
    cv.addEventListener("mousemove", onMove);
    cv.addEventListener("mouseleave", onLeave);
    global.addEventListener("mouseup", onUp);
    lastNow = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function detach() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (canvas) {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    }
    global.removeEventListener("mouseup", onUp);
    dragKind = null;
    dragMember = null;
    canvas = null;
    ctx = null;
    combatRef = null;
    disp.clear();
  }

  function loop(now) {
    if (!canvas || !canvas.isConnected) {
      detach();
      return;
    }
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    try {
      render(dt);
    } catch (err) {
      console.error("[arena]", err);
    }
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    const wrap = canvas.parentElement;
    const cssW = Math.max(320, wrap?.clientWidth || BW);
    const cssH = Math.round((cssW * BH) / BW);
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.height = `${cssH}px`;
    }
    scale = cssW / BW;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }

  function loadIcon(m) {
    const A = Assets();
    if (!A) return null;
    const key = `${m.class}|${m.spec}`;
    let entry = iconCache.get(key);
    if (!entry) {
      const url = A.specIconUrl(m.class, m.spec);
      const name = A.SPEC_ICONS?.[key] || A.CLASS_ICONS?.[m.class];
      const cdn = name ? A.iconCdnUrl(name) : null;
      const img = new Image();
      img.decoding = "async";
      entry = { img, ok: false };
      img.onload = () => (entry.ok = true);
      img.onerror = () => {
        if (cdn && img.src.indexOf(cdn) < 0) img.src = cdn;
      };
      if (url) img.src = url;
      iconCache.set(key, entry);
    }
    return entry.ok ? entry.img : null;
  }

  function state() {
    const eng = opts?.getEngine?.();
    if (!eng) return null;
    const raid = eng.player;
    const boss = eng.boss;
    const AR = Arena();
    const cbt = raid?.state === "fighting" && raid.combat && raid.combat.bossId === boss.id ? raid.combat : null;
    const markers = eng.getMarkers?.() || {};
    if (cbt) {
      const now = AR.combatNow(cbt) + (cbt.finished ? 0 : Math.min(AR.TICK, eng._combatAcc || 0));
      return { eng, raid, boss, cbt, cfg: cbt.arena, members: cbt.members, now, bossPos: cbt.bossPos, markers };
    }
    const layout = AR.layout(raid.members, boss.id, eng.getFormation?.());
    const members = raid.members.map((m) => ({
      ...m,
      ...layout.homes[m.id],
      alive: true,
      hp: 1,
      maxHp: 1,
    }));
    return {
      eng,
      raid,
      boss,
      cbt: null,
      cfg: layout.cfg,
      members,
      now: 0,
      bossPos: { x: layout.cfg.boss.x, y: layout.cfg.boss.y },
      activeTankId: members.find((m) => m.role === "Tank")?.id,
      markers,
    };
  }

  function render(dt) {
    resize();
    const s = state();
    ctx.clearRect(0, 0, BW, BH);
    if (!s) return;
    if (s.cbt !== combatRef) {
      combatRef = s.cbt;
      disp.clear();
    }
    drawMap(s);
    if (s.cbt) drawPools(s);
    drawMarkers(s);
    drawMeleeRange(s);
    if (s.cbt) drawHazards(s);
    drawBoss(s);
    drawFxUnder(s);
    drawMembers(s, dt);
    drawFxOver(s);
    drawPlacing(s);
    drawHover(s);
    drawOverlay(s);
  }

  function meleeReach() {
    const AR = Arena();
    return AR.BOSS_RADIUS + AR.MELEE_RANGE;
  }

  function isMeleeRole(m) {
    return m.role === "Melee" || m.role === "Tank";
  }

  function outOfReach(s, m, p) {
    return isMeleeRole(m) && Math.hypot(p.x - s.bossPos.x, p.y - s.bossPos.y) > meleeReach();
  }

  /** 근딜·탱이 보스를 때릴 수 있는 범위 (보스 중심 기준) */
  function drawMeleeRange(s) {
    const { x, y } = s.bossPos;
    const R = meleeReach();
    const dragged = dragMember && s.members.find((m) => m.id === dragMember);
    const focus = !s.cbt && (!dragged || isMeleeRole(dragged));
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    if (!s.cbt) {
      ctx.fillStyle = `rgba(224,103,74,${focus && dragged ? 0.16 : 0.09})`;
      ctx.fill();
    }
    ctx.setLineDash(s.cbt ? [3, 6] : [6, 5]);
    ctx.lineWidth = s.cbt ? 1 : focus && dragged ? 2.5 : 1.8;
    ctx.strokeStyle = s.cbt ? "rgba(255,150,120,0.22)" : `rgba(255,140,100,${focus ? 0.85 : 0.45})`;
    ctx.stroke();
    ctx.setLineDash([]);
    if (!s.cbt) {
      const label = opts?.lang?.() === "en" ? "Melee range" : "근접 사거리";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.fillStyle = "#ffb08c";
      ctx.strokeText(label, x, y + R + 4);
      ctx.fillText(label, x, y + R + 4);
    }
    ctx.restore();
  }

  const MARKER_R = 15;
  const MARKER_RING = { square: "91,157,255", cross: "255,91,91" };

  /** [{kind, index, x, y}] — square 1개 + cross 여러 개 */
  function markerList(mk) {
    const out = [];
    if (mk?.square) out.push({ kind: "square", index: 0, x: mk.square.x, y: mk.square.y });
    (mk?.cross || []).forEach((p, i) => out.push({ kind: "cross", index: i, x: p.x, y: p.y }));
    return out;
  }

  function sameMarker(a, b) {
    return !!a && !!b && a.kind === b.kind && a.index === b.index;
  }

  function drawMarkers(s) {
    const A = Assets();
    const list = markerList(s.markers);
    const crossN = list.filter((m) => m.kind === "cross").length;
    list.forEach((mk) => {
      const dragging = sameMarker(dragKind, mk);
      const p = dragging && cursorPt ? cursorPt : mk;
      const hot = sameMarker(hoverMarker, mk) || dragging;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, MARKER_R + 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${MARKER_RING[mk.kind]},${hot ? 0.28 : 0.16})`;
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = hot ? 2 : 1.5;
      ctx.strokeStyle = `rgba(${MARKER_RING[mk.kind]},0.75)`;
      ctx.stroke();
      ctx.setLineDash([]);
      if (A) A.drawRaidMarker(ctx, `marker-${mk.kind}`, p.x, p.y, MARKER_R);
      if (mk.kind === "cross" && crossN > 1) {
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.fillStyle = "#ffd0d0";
        ctx.strokeText(String(mk.index + 1), p.x + MARKER_R + 4, p.y - MARKER_R + 2);
        ctx.fillText(String(mk.index + 1), p.x + MARKER_R + 4, p.y - MARKER_R + 2);
      }
      ctx.restore();
    });
  }

  function drawPlacing(s) {
    const tool = opts?.getTool?.();
    if (!tool || !cursorPt || dragKind || hoverMarker) return;
    const A = Assets();
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(cursorPt.x, cursorPt.y, MARKER_R + 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${MARKER_RING[tool]},0.9)`;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (A) A.drawRaidMarker(ctx, `marker-${tool}`, cursorPt.x, cursorPt.y, MARKER_R);
    ctx.restore();
  }

  function drawPools(s) {
    (s.cbt.pools || []).forEach((p) => {
      const left = p.until - s.now;
      const fade = Math.max(0, Math.min(1, left / 4));
      const grow = Math.max(0.2, Math.min(1, (s.now - p.castAt) / 0.4));
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * grow, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(p.x, p.y, p.radius * 0.2, p.x, p.y, p.radius);
      g.addColorStop(0, `rgba(120,230,90,${0.42 * fade})`);
      g.addColorStop(1, `rgba(60,170,60,${0.22 * fade})`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(140,255,110,${(0.55 + 0.15 * Math.sin(s.now * 4)) * fade})`;
      ctx.stroke();
      if (left < 60) {
        ctx.font = "bold 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(220,255,210,${0.85 * fade})`;
        ctx.fillText(`${Math.ceil(Math.max(0, left))}s`, p.x, p.y);
      }
      ctx.restore();
    });
  }

  function drawMap(s) {
    const A = Assets();
    const img = s.cfg.mapBossId && A ? A.loadBossMap(s.cfg.mapBossId) : null;
    if (img) {
      ctx.drawImage(img, 0, 0, BW, BH);
    } else {
      const g = ctx.createRadialGradient(BW / 2, BH / 2, 40, BW / 2, BH / 2, 560);
      g.addColorStop(0, "#1b2433");
      g.addColorStop(1, "#06090e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BW, BH);
    }
    ctx.fillStyle = "rgba(4,7,12,0.32)";
    ctx.fillRect(0, 0, BW, BH);
    const b = s.cfg.bounds;
    ctx.save();
    ctx.strokeStyle = img ? "rgba(255,255,255,0.08)" : "rgba(140,170,210,0.25)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (b.type === "rect") ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    else ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function hazardPath(h, scaleK = 1) {
    ctx.beginPath();
    if (h.shape === "circle") {
      ctx.arc(h.x, h.y, Math.max(0.1, h.radius * scaleK), 0, Math.PI * 2);
    } else if (h.shape === "cone") {
      const half = ((h.spread || 60) * Math.PI) / 360;
      ctx.moveTo(h.x, h.y);
      ctx.arc(h.x, h.y, Math.max(0.1, h.len * scaleK), h.rot - half, h.rot + half);
      ctx.closePath();
    } else if (h.shape === "line") {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      ctx.rect(0, -h.width / 2, h.len * scaleK, h.width);
      ctx.restore();
    }
  }

  function hazardColor(h) {
    if (h.mode === "shared") return "255,196,60";
    if (h.mode === "drop") return "110,220,80";
    return h.fatal ? "170,60,255" : "255,70,50";
  }

  function drawHazards(s) {
    const AR = Arena();
    const ko = opts?.lang?.() !== "en";
    s.cbt.hazards.forEach((h) => {
      const p = Math.max(0, Math.min(1, (s.now - h.castAt) / Math.max(0.1, h.at - h.castAt)));
      const base = hazardColor(h);
      const carried = h.mode === "shared" || h.mode === "drop";
      const fh = carried && h.followId && disp.get(h.followId) ? { ...h, ...disp.get(h.followId) } : h;
      ctx.save();
      hazardPath(fh);
      ctx.fillStyle = `rgba(${base},${0.16 + 0.08 * Math.sin(s.now * 12)})`;
      ctx.fill();
      ctx.lineWidth = carried ? 2.5 : 2;
      if (h.mode === "shared") ctx.setLineDash([7, 5]);
      ctx.strokeStyle = `rgba(${base},0.95)`;
      ctx.stroke();
      ctx.setLineDash([]);
      hazardPath(fh, p);
      ctx.fillStyle = `rgba(${base},0.32)`;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      if (h.mode === "shared") {
        const need = Math.max(1, h.skill?.soakers ?? 5);
        const inside = s.members.filter((m) => m.alive !== false && AR.pointInHazard(h, m.x, m.y, 0)).length;
        const label = `${inside}/${need}`;
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.fillStyle = inside >= need ? "#9dff8a" : "#ffd84d";
        ctx.strokeText(label, fh.x, fh.y - fh.radius - 6);
        ctx.fillText(label, fh.x, fh.y - fh.radius - 6);
      } else if (h.mode === "drop") {
        const label = ko ? "장판 남김" : "Drop";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = "#d6ffc8";
        ctx.strokeText(label, fh.x, fh.y - fh.radius - 5);
        ctx.fillText(label, fh.x, fh.y - fh.radius - 5);
        if (h.dropSpot) {
          ctx.setLineDash([3, 5]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(140,255,110,0.55)";
          ctx.beginPath();
          ctx.moveTo(fh.x, fh.y);
          ctx.lineTo(h.dropSpot.x, h.dropSpot.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (h.shape === "circle" && h.radius >= 40) {
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,230,220,0.9)";
        ctx.fillText(h.name || "", h.x, h.y - h.radius - 5);
      }
      ctx.restore();
    });
  }

  function drawBoss(s) {
    const { boss, bossPos, cbt } = s;
    const AR = Arena();
    const R = AR.BOSS_RADIUS;
    const units = s.cfg.boss.units || 1;
    const accent = boss.theme?.accent || "#ff6b72";
    const offsets = units === 2 ? [-R * 0.8, R * 0.8] : [0];
    const hpPct = cbt ? cbt.bossHp / cbt.bossMaxHp : 1;
    ctx.save();
    offsets.forEach((ox) => {
      const x = bossPos.x + ox;
      const y = bossPos.y;
      const r = units === 2 ? R * 0.72 : R;
      ctx.shadowColor = accent;
      ctx.shadowBlur = cbt?.enraged ? 26 : 14;
      const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, boss.theme?.bg1 || "#3a2812");
      g.addColorStop(1, boss.theme?.bg2 || "#140e08");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = cbt?.enraged ? "#ff3b3b" : accent;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hpPct > 0.35 ? "#e5484d" : "#ff8a3b";
      ctx.beginPath();
      ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpPct);
      ctx.stroke();
      ctx.font = `${Math.round(r * 1.05)}px "Segoe UI Emoji", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(boss.icon || "☠", x, y + 1);
    });
    ctx.restore();
  }

  function memberPos(s, m, dt) {
    if (dragMember === m.id && cursorPt && !s.cbt) {
      const p = { x: cursorPt.x, y: cursorPt.y };
      disp.set(m.id, p);
      return p;
    }
    let p = disp.get(m.id);
    if (!p) {
      p = { x: m.x, y: m.y };
      disp.set(m.id, p);
      return p;
    }
    const k = dt == null ? 0 : 1 - Math.exp(-dt * 14);
    p.x += (m.x - p.x) * k;
    p.y += (m.y - p.y) * k;
    return p;
  }

  function drawMembers(s, dt) {
    const activeId = s.cbt ? s.cbt.activeTankId : s.activeTankId;
    const rank = (m) => (m.id === dragMember ? 2 : m.alive === false ? 0 : 1);
    const order = [...s.members].sort((a, b) => rank(a) - rank(b));
    order.forEach((m) => {
      const p = memberPos(s, m, dt);
      const dead = m.alive === false;
      const color = m.color || ROLE_COLOR[m.role] || "#8ec5ff";
      ctx.save();
      if (dead) {
        ctx.globalAlpha = 0.85;
        const A = Assets();
        if (A) A.drawRaidMarker(ctx, "marker-skull", p.x, p.y, TOKEN_R * 0.95);
        ctx.restore();
        return;
      }
      if (m.id === activeId) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, TOKEN_R + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#f2c94c";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, TOKEN_R, 0, Math.PI * 2);
      ctx.fillStyle = "#0b1017";
      ctx.fill();
      ctx.shadowBlur = 0;
      const img = loadIcon(m);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, TOKEN_R - 1.5, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, p.x - TOKEN_R, p.y - TOKEN_R, TOKEN_R * 2, TOKEN_R * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, TOKEN_R - 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, TOKEN_R, 0, Math.PI * 2);
      const hot = m.id === hoverId || m.id === dragMember;
      ctx.lineWidth = hot ? 3 : 2;
      ctx.strokeStyle = hot ? "#ffffff" : color;
      ctx.stroke();

      if (!s.cbt && outOfReach(s, m, p)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, TOKEN_R + 3, 0, Math.PI * 2);
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ff4d4d";
        ctx.stroke();
        ctx.setLineDash([]);
        const warn = opts?.lang?.() === "en" ? "Out of range" : "사거리 밖";
        ctx.font = "bold 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.fillStyle = "#ff8080";
        ctx.strokeText(warn, p.x, p.y + TOKEN_R + 13);
        ctx.fillText(warn, p.x, p.y + TOKEN_R + 13);
      }

      if (s.cbt) {
        const pct = Math.max(0, Math.min(1, m.hp / m.maxHp));
        const w = 24;
        const y = p.y + TOKEN_R + 3;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 5);
        ctx.fillStyle = pct > 0.5 ? "#3ecf6e" : pct > 0.25 ? "#f2c94c" : "#ff4d4d";
        ctx.fillRect(p.x - w / 2, y, w * pct, 3);
        if (m.dodgeBlunder) {
          ctx.font = "bold 12px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffd84d";
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 3;
          ctx.strokeText("?", p.x + TOKEN_R, p.y - TOKEN_R);
          ctx.fillText("?", p.x + TOKEN_R, p.y - TOKEN_R);
        }
      }
      ctx.restore();
    });
  }

  function fxProgress(s, f) {
    return Math.max(0, Math.min(1, (s.now - f.t0) / Math.max(0.05, f.dur)));
  }

  function drawFxUnder(s) {
    if (!s.cbt?.fx) return;
    s.cbt.fx.forEach((f) => {
      const p = fxProgress(s, f);
      if (f.kind === "pulse") {
        ctx.save();
        ctx.beginPath();
        ctx.arc(f.x, f.y, 30 + p * 320, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(190,120,255,${0.8 * (1 - p)})`;
        ctx.lineWidth = 10 * (1 - p) + 2;
        ctx.stroke();
        ctx.restore();
      } else if (f.kind === "boom" && f.hazard) {
        ctx.save();
        hazardPath(f.hazard);
        const c = f.hazard.mode === "drop" ? "140,255,100" : f.hazard.fatal ? "200,90,255" : "255,170,60";
        ctx.fillStyle = `rgba(${c},${0.65 * (1 - p)})`;
        ctx.fill();
        ctx.restore();
      } else if (f.kind === "soak") {
        ctx.save();
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * (1 + p * 0.5), 0, Math.PI * 2);
        const c = f.ok ? "255,215,90" : "255,60,60";
        ctx.fillStyle = `rgba(${c},${0.45 * (1 - p)})`;
        ctx.fill();
        ctx.lineWidth = 5 * (1 - p) + 1;
        ctx.strokeStyle = `rgba(${c},${0.95 * (1 - p)})`;
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function drawFxOver(s) {
    if (!s.cbt?.fx) return;
    s.cbt.fx.forEach((f) => {
      const p = fxProgress(s, f);
      const mp = f.memberId ? disp.get(f.memberId) : null;
      const x = mp ? mp.x : f.x;
      const y = mp ? mp.y : f.y;
      if (x == null) return;
      ctx.save();
      if (f.kind === "slam") {
        ctx.beginPath();
        ctx.arc(x, y, TOKEN_R + 4 + p * 18, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,60,60,${1 - p})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (f.kind === "taunt") {
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.fillStyle = `rgba(242,201,76,${1 - p * 0.6})`;
        const ty = y - TOKEN_R - 8 - p * 14;
        const label = opts?.lang?.() === "en" ? "Taunt!" : "도발!";
        ctx.strokeText(label, x, ty);
        ctx.fillText(label, x, ty);
      } else if (f.kind === "death") {
        ctx.beginPath();
        ctx.arc(x, y, TOKEN_R + p * 22, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,40,40,${0.9 * (1 - p)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (f.kind === "rez") {
        const g = ctx.createLinearGradient(x, y - 70, x, y);
        g.addColorStop(0, "rgba(255,230,140,0)");
        g.addColorStop(1, `rgba(255,230,140,${0.75 * (1 - p)})`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 9, y - 70, 18, 70);
        ctx.beginPath();
        ctx.arc(x, y, TOKEN_R + 3 + p * 16, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,120,${1 - p})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawHover(s) {
    if (!hoverId) return;
    const m = s.members.find((x) => x.id === hoverId);
    const p = m && disp.get(m.id);
    if (!m || !p) return;
    const ko = opts?.lang?.() !== "en";
    const spec = ko ? m.specKo || m.spec : m.spec;
    const hp = s.cbt ? (m.alive === false ? (ko ? "사망" : "Dead") : `${Math.round((m.hp / m.maxHp) * 100)}%`) : "";
    const line1 = m.name;
    const line2 = [spec, hp].filter(Boolean).join(" · ");
    ctx.save();
    ctx.font = "bold 12px system-ui, sans-serif";
    const w = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 16;
    let bx = p.x + 16;
    let by = p.y - 40;
    if (bx + w > BW - 4) bx = p.x - 16 - w;
    if (by < 4) by = p.y + 16;
    ctx.fillStyle = "rgba(10,14,20,0.92)";
    ctx.strokeStyle = m.color || "#8ec5ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, w, 36, 6) : ctx.rect(bx, by, w, 36);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = m.color || "#fff";
    ctx.fillText(line1, bx + 8, by + 15);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#c9d4e2";
    ctx.fillText(line2, bx + 8, by + 29);
    ctx.restore();
  }

  function drawOverlay(s) {
    const ko = opts?.lang?.() !== "en";
    if (!s.cbt) {
      ctx.save();
      ctx.fillStyle = "rgba(4,7,12,0.45)";
      ctx.fillRect(0, BH - 34, BW, 34);
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#d9e3ef";
      ctx.fillText(
        ko
          ? "배치 미리보기 — 공대원을 드래그해 기본 자리를 정하세요 · 근딜·탱은 주황 원 안에서만 보스를 때립니다"
          : "Formation — drag members to set positions · melee/tanks only hit inside the orange ring",
        BW / 2,
        BH - 12
      );
      ctx.restore();
      return;
    }
    if (s.cbt.enraged) {
      const g = ctx.createRadialGradient(BW / 2, BH / 2, 200, BW / 2, BH / 2, 620);
      g.addColorStop(0, "rgba(255,0,0,0)");
      g.addColorStop(1, `rgba(255,20,20,${0.22 + 0.08 * Math.sin(s.now * 6)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BW, BH);
    }
  }

  function boardPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  function hitMember(pt) {
    let best = null;
    let bestD = TOKEN_R + 5;
    disp.forEach((p, id) => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  function hitMarker(pt) {
    const mk = opts?.getEngine?.()?.getMarkers?.() || {};
    let best = null;
    let bestD = MARKER_R + 6;
    markerList(mk).forEach((m) => {
      const d = Math.hypot(m.x - pt.x, m.y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: m.kind, index: m.index };
      }
    });
    return best;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const pt = boardPoint(e);
    const hit = hitMarker(pt);
    if (hit) {
      dragKind = hit;
      cursorPt = pt;
      suppressClick = true;
      e.preventDefault();
      return;
    }
    const tool = opts?.getTool?.();
    if (tool) {
      opts?.onPlace?.(tool, pt.x, pt.y);
      suppressClick = true;
      return;
    }
    const id = canArrange() ? hitMember(pt) : null;
    if (id) {
      dragMember = id;
      downPt = pt;
      e.preventDefault();
    }
  }

  function canArrange() {
    const s = state();
    return !!s && !s.cbt && typeof opts?.onMoveHome === "function";
  }

  function dragMoved() {
    return downPt && cursorPt && Math.hypot(cursorPt.x - downPt.x, cursorPt.y - downPt.y) > 4;
  }

  function onUp() {
    if (dragMember) {
      const id = dragMember;
      const moved = dragMoved();
      const pt = cursorPt;
      dragMember = null;
      downPt = null;
      if (moved && pt) {
        suppressClick = true;
        opts.onMoveHome(id, pt.x, pt.y);
      }
      return;
    }
    if (!dragKind) return;
    const { kind, index } = dragKind;
    const pt = cursorPt;
    dragKind = null;
    if (pt) opts?.onPlace?.(kind, pt.x, pt.y, index);
  }

  function onContext(e) {
    const hit = hitMarker(boardPoint(e));
    if (!hit) return;
    e.preventDefault();
    hoverMarker = null;
    opts?.onRemoveMarker?.(hit.kind, hit.index);
  }

  function onMove(e) {
    cursorPt = boardPoint(e);
    if (dragKind || (dragMember && dragMoved())) {
      canvas.style.cursor = "grabbing";
      return;
    }
    hoverMarker = hitMarker(cursorPt);
    if (opts?.getTool?.()) {
      hoverId = null;
      canvas.style.cursor = hoverMarker ? "grab" : "crosshair";
      return;
    }
    hoverId = hoverMarker ? null : hitMember(cursorPt);
    canvas.style.cursor = hoverMarker || (hoverId && canArrange()) ? "grab" : hoverId ? "pointer" : "default";
  }

  function onLeave() {
    hoverId = null;
    hoverMarker = null;
    if (!dragKind && !dragMember) cursorPt = null;
  }

  function onClick(e) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const id = hitMember(boardPoint(e));
    if (!id) return;
    const s = state();
    const m = s?.members.find((x) => x.id === id);
    opts?.onPick?.(id, m?.alive === false);
  }

  global.RaidGameArena = { attach, detach };
})(window);
