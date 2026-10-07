/**
 * WoW Raid Commander — Try-screen FX (Web Audio + CSS helpers)
 * No asset files. Throttled for high combatSpeed.
 */
(function (global) {
  "use strict";

  const MUTE_KEY = "raidGameFxMute";
  const THROTTLE_MS = 120;

  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (_) {
    /* ignore */
  }

  const lastPlay = Object.create(null);
  let flashEl = null;
  let shakeRoot = null;
  let resultEl = null;
  let shakeTimer = null;
  let resultTimer = null;

  function ensureAudio() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function beep(opts) {
    if (muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = opts.type || "square";
    o.frequency.setValueAtTime(opts.freq || 440, now);
    if (opts.freqEnd != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), now + (opts.dur || 0.12));
    }
    const vol = opts.vol ?? 0.08;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (opts.dur || 0.12));
    o.connect(g);
    g.connect(ac.destination);
    o.start(now);
    o.stop(now + (opts.dur || 0.12) + 0.02);
  }

  function noiseBurst(opts) {
    if (muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    const dur = opts.dur || 0.08;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = opts.filter || "lowpass";
    filter.frequency.value = opts.freq || 800;
    g.gain.value = opts.vol ?? 0.06;
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start();
  }

  const SFX = {
    pull() {
      beep({ type: "sawtooth", freq: 180, freqEnd: 90, dur: 0.22, vol: 0.07 });
      setTimeout(() => beep({ type: "triangle", freq: 320, dur: 0.1, vol: 0.05 }), 40);
    },
    tankBuster() {
      noiseBurst({ dur: 0.12, freq: 220, vol: 0.09, filter: "lowpass" });
      beep({ type: "square", freq: 90, freqEnd: 45, dur: 0.18, vol: 0.1 });
    },
    aoe() {
      noiseBurst({ dur: 0.1, freq: 1200, vol: 0.05, filter: "bandpass" });
      beep({ type: "triangle", freq: 420, freqEnd: 200, dur: 0.12, vol: 0.05 });
    },
    random() {
      beep({ type: "sine", freq: 660, freqEnd: 220, dur: 0.1, vol: 0.06 });
      noiseBurst({ dur: 0.06, freq: 900, vol: 0.04, filter: "highpass" });
    },
    death() {
      beep({ type: "sawtooth", freq: 220, freqEnd: 55, dur: 0.16, vol: 0.05 });
    },
    rez() {
      beep({ type: "sine", freq: 440, freqEnd: 880, dur: 0.14, vol: 0.05 });
    },
    enrage() {
      beep({ type: "square", freq: 180, dur: 0.08, vol: 0.08 });
      setTimeout(() => beep({ type: "square", freq: 140, dur: 0.1, vol: 0.08 }), 90);
      setTimeout(() => beep({ type: "square", freq: 100, dur: 0.14, vol: 0.09 }), 180);
    },
    kill() {
      beep({ type: "triangle", freq: 523, dur: 0.1, vol: 0.07 });
      setTimeout(() => beep({ type: "triangle", freq: 659, dur: 0.1, vol: 0.07 }), 80);
      setTimeout(() => beep({ type: "triangle", freq: 784, dur: 0.18, vol: 0.08 }), 160);
    },
    wipe() {
      beep({ type: "sawtooth", freq: 160, freqEnd: 40, dur: 0.35, vol: 0.08 });
    },
  };

  function throttled(key, fn) {
    const now = performance.now();
    if (lastPlay[key] != null && now - lastPlay[key] < THROTTLE_MS) return false;
    lastPlay[key] = now;
    fn();
    return true;
  }

  function ensureDom() {
    if (!flashEl) {
      flashEl = document.createElement("div");
      flashEl.className = "g-fx-flash";
      flashEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(flashEl);
    }
    if (!resultEl) {
      resultEl = document.createElement("div");
      resultEl.className = "g-fx-result hidden";
      resultEl.setAttribute("aria-hidden", "true");
      resultEl.innerHTML = `<div class="g-fx-result-card"><div class="g-fx-result-icon"></div><div class="g-fx-result-title"></div></div>`;
      document.body.appendChild(resultEl);
    }
    shakeRoot = document.querySelector("#gameView .g-try-main") || document.getElementById("gameView");
  }

  function flash(kind) {
    ensureDom();
    flashEl.className = `g-fx-flash show ${kind || "aoe"}`;
    void flashEl.offsetWidth;
    requestAnimationFrame(() => {
      flashEl.classList.add("fade");
      setTimeout(() => {
        flashEl.className = "g-fx-flash";
      }, 280);
    });
  }

  function shake(strength) {
    ensureDom();
    if (!shakeRoot) return;
    shakeRoot.classList.remove("g-fx-shake", "g-fx-shake-hard");
    void shakeRoot.offsetWidth;
    shakeRoot.classList.add(strength === "hard" ? "g-fx-shake-hard" : "g-fx-shake");
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => {
      shakeRoot.classList.remove("g-fx-shake", "g-fx-shake-hard");
    }, 420);
  }

  function showResult(kind, title) {
    ensureDom();
    const icon = resultEl.querySelector(".g-fx-result-icon");
    const titleEl = resultEl.querySelector(".g-fx-result-title");
    resultEl.className = `g-fx-result show ${kind}`;
    resultEl.setAttribute("aria-hidden", "false");
    if (icon) icon.textContent = kind === "kill" ? "⚔" : "☠";
    if (titleEl) titleEl.textContent = title || (kind === "kill" ? "KILL" : "WIPE");
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      resultEl.classList.add("hidden");
      resultEl.classList.remove("show");
      resultEl.setAttribute("aria-hidden", "true");
    }, 1600);
  }

  function applyBossTheme(boss, root) {
    const el = root || document.getElementById("gameView");
    if (!el || !boss) return;
    const theme = boss.theme || {};
    el.style.setProperty("--boss-accent", theme.accent || "#f2b84b");
    el.style.setProperty("--boss-glow", theme.glow || "#f2b84b55");
    el.style.setProperty("--boss-bg1", theme.bg1 || "#1b2c45");
    el.style.setProperty("--boss-bg2", theme.bg2 || "#0b1017");
    el.dataset.bossId = boss.id || "";
  }

  function bossPortraitHtml(boss, size) {
    if (!boss) return "";
    const theme = boss.theme || {};
    const icon = boss.icon || "⚔";
    const img = boss.image;
    const cls = `g-boss-portrait ${size || "md"} theme-${boss.id || "default"}`;
    if (img) {
      return `<div class="${cls}" style="--boss-accent:${theme.accent || "#f2b84b"}"><img src="${img}" alt=""></div>`;
    }
    return `<div class="${cls}" style="--boss-accent:${theme.accent || "#f2b84b"};--boss-bg1:${theme.bg1 || "#1b2c45"};--boss-bg2:${theme.bg2 || "#0b1017"}" data-boss="${boss.id || ""}"><span class="g-boss-glyph">${icon}</span><i class="g-boss-ring"></i></div>`;
  }

  function play(id) {
    const fn = SFX[id];
    if (!fn) return;
    throttled(`sfx:${id}`, fn);
  }

  function handleCombatEvent(ev) {
    if (!ev || !ev.type) return;
    ensureDom();
    switch (ev.type) {
      case "pull":
        throttled("pull", () => {
          SFX.pull();
          flash("pull");
        });
        break;
      case "skill": {
        const kind = ev.skillKind || "aoe";
        if (kind === "tankBuster") {
          throttled("skill:tb", () => {
            SFX.tankBuster();
            flash("buster");
            shake("hard");
          });
        } else if (kind === "random") {
          throttled("skill:rand", () => {
            SFX.random();
            if (ev.doubles === 0) return;
            flash("random");
            shake("soft");
          });
        } else {
          throttled("skill:aoe", () => {
            SFX.aoe();
            if (ev.skillType === "aoe2" && ev.doubles === 0) return;
            flash(ev.skillType === "aoe2" ? "aoe2" : "aoe");
            shake("soft");
          });
        }
        break;
      }
      case "death":
        throttled("death", () => {
          SFX.death();
        });
        break;
      case "rez":
        throttled("rez", () => SFX.rez());
        break;
      case "enrage":
        throttled("enrage", () => {
          SFX.enrage();
          flash("enrage");
          const bar = document.getElementById("gBossHpBar");
          if (bar) {
            bar.classList.add("enraged-pulse");
          }
        });
        break;
      case "kill":
        throttled("kill", () => {
          SFX.kill();
          showResult("kill", ev.title || "KILL");
        });
        break;
      case "wipe":
        throttled("wipe", () => {
          SFX.wipe();
          showResult("wipe", ev.title || "WIPE");
        });
        break;
      default:
        break;
    }
  }

  function setMuted(v) {
    muted = !!v;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
    if (!muted) ensureAudio();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function isMuted() {
    return muted;
  }

  function unlock() {
    ensureAudio();
  }

  global.RaidGameFX = {
    play,
    handleCombatEvent,
    setMuted,
    toggleMute,
    isMuted,
    unlock,
    applyBossTheme,
    bossPortraitHtml,
    flash,
    shake,
    showResult,
  };
})(window);
