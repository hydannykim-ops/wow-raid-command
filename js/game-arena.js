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
    cv.addEventListener("mousemove", onMove);
    cv.addEventListener("mouseleave", onLeave);
    lastNow = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function detach() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (canvas) {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    }
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
    const cbt = raid?.combat && raid.combat.bossId === boss.id ? raid.combat : null;
    if (cbt) {
      const now = AR.combatNow(cbt) + (cbt.finished ? 0 : Math.min(AR.TICK, eng._combatAcc || 0));
      return { eng, raid, boss, cbt, cfg: cbt.arena, members: cbt.members, now, bossPos: cbt.bossPos };
    }
    const layout = AR.layout(raid.members, boss.id);
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
    if (s.cbt) drawHazards(s);
    drawBoss(s);
    drawFxUnder(s);
    drawMembers(s, dt);
    drawFxOver(s);
    drawHover(s);
    drawOverlay(s);
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

  function drawHazards(s) {
    s.cbt.hazards.forEach((h) => {
      const p = Math.max(0, Math.min(1, (s.now - h.castAt) / Math.max(0.1, h.at - h.castAt)));
      const fatal = !!h.fatal;
      const base = fatal ? "170,60,255" : "255,70,50";
      ctx.save();
      hazardPath(h);
      ctx.fillStyle = `rgba(${base},${0.16 + 0.08 * Math.sin(s.now * 12)})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${base},0.9)`;
      ctx.stroke();
      hazardPath(h, p);
      ctx.fillStyle = `rgba(${base},0.32)`;
      ctx.fill();
      if (h.shape === "circle" && h.radius >= 40) {
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
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
    ctx.beginPath();
    ctx.arc(bossPos.x, bossPos.y, R + AR.MELEE_RANGE, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();
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
    const order = [...s.members].sort((a, b) => (a.alive === b.alive ? 0 : a.alive ? 1 : -1));
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
      ctx.lineWidth = m.id === hoverId ? 3 : 2;
      ctx.strokeStyle = m.id === hoverId ? "#ffffff" : color;
      ctx.stroke();

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
        ctx.fillStyle = f.hazard.fatal ? `rgba(200,90,255,${0.65 * (1 - p)})` : `rgba(255,170,60,${0.65 * (1 - p)})`;
        ctx.fill();
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
        ko ? "배치 미리보기 — 트라이를 시작하면 공대원이 움직이며 싸웁니다" : "Formation preview — start a try to watch the fight",
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

  function onMove(e) {
    hoverId = hitMember(boardPoint(e));
    canvas.style.cursor = hoverId ? "pointer" : "default";
  }

  function onLeave() {
    hoverId = null;
  }

  function onClick(e) {
    const id = hitMember(boardPoint(e));
    if (!id) return;
    const s = state();
    const m = s?.members.find((x) => x.id === id);
    opts?.onPick?.(id, m?.alive === false);
  }

  global.RaidGameArena = { attach, detach };
})(window);
