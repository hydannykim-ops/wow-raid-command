const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const dataSrc = fs.readFileSync(path.join(root, "js", "data.js"), "utf8");
let appSrc = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const cut = appSrc.indexOf("function defaultSpecForClass");
if (cut < 0) throw new Error("could not isolate evaluateApplicant");
appSrc = appSrc.slice(0, cut);
appSrc += `
globalThis.__sim = {
  evaluate(spec) { return evaluateApplicant(spec); },
  resetRoster() { roster = []; instanceSeq = 0; applicants = []; },
  add(spec) { roster.push({ ...spec, instanceId: String(++instanceSeq) }); },
  getRoster() { return roster.slice(); },
  specs() { return S; },
  synergies() { return SY; },
  cores() { return CORE_CLASSES.slice(); },
  covered(syn) {
    const providers = syn.providers || [];
    return roster.some(
      (r) => (r.synergies || []).includes(syn.name) || providers.includes(r.class)
    );
  },
  classCount(c) { return classCountOf(c); },
};
`;

const raidSizeEl = { value: "20" };
function el() {
  return {
    value: "",
    innerHTML: "",
    textContent: "",
    style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    options: [],
    onclick: null,
    oninput: null,
    onchange: null,
    scrollIntoView() {},
  };
}

const sandbox = {
  console,
  window: {},
  document: {
    getElementById(id) {
      if (id === "raidSize") return raidSizeEl;
      return el();
    },
    querySelectorAll: () => [],
    querySelector: () => el(),
    dispatchEvent() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(dataSrc, sandbox);
vm.runInContext(appSrc, sandbox);
const sim = sandbox.__sim;
if (!sim) throw new Error("sim bootstrap failed");
process.stdout.write("부트스트랩 OK, 스펙 " + sim.specs().length + "개\n");

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRecommend(specs) {
  for (const s of shuffle(specs)) {
    if (sim.evaluate(s).verdict === "recommend") return s;
  }
  return null;
}

function runRaid(size) {
  raidSizeEl.value = String(size);
  sim.resetRoster();
  const specs = sim.specs();
  let stuck = false;
  while (sim.getRoster().length < size) {
    const pick = pickRecommend(specs);
    if (!pick) {
      stuck = true;
      break;
    }
    sim.add(pick);
  }
  const roster = sim.getRoster();
  const missing = sim
    .synergies()
    .filter((syn) => !sim.covered(syn))
    .map((syn) => syn.nameKo || syn.name);
  const missingCore = sim.cores().filter((c) => sim.classCount(c) === 0);
  const dk = sim.classCount("Death Knight");
  const wl = sim.classCount("Warlock");
  const byRole = { Tank: 0, Melee: 0, Ranged: 0, Heal: 0 };
  roster.forEach((r) => {
    byRole[r.role] = (byRole[r.role] || 0) + 1;
  });
  return {
    stuck,
    filled: roster.length,
    missing,
    missingCore,
    dk,
    wl,
    byRole,
    classes: roster.map((r) => `${r.classKo || r.class}/${r.specKo || r.spec}`),
  };
}

function summarize(size, trials) {
  const fails = [];
  let stuck = 0;
  let missingSyn = 0;
  let missingCore = 0;
  let badDk = 0;
  let badWl = 0;
  const missCount = {};
  process.stdout.write(`${size}인 시뮬 시작 (${trials}회)\n`);
  for (let i = 0; i < trials; i++) {
    if ((i + 1) % 20 === 0) process.stdout.write(`  ${i + 1}/${trials}\n`);
    const r = runRaid(size);
    const synFail = r.missing.length > 0;
    const coreFail = r.missingCore.length > 0;
    const dkFail = r.dk < 2;
    const wlFail = r.wl < 2;
    if (r.stuck) stuck++;
    if (synFail) {
      missingSyn++;
      r.missing.forEach((n) => {
        missCount[n] = (missCount[n] || 0) + 1;
      });
    }
    if (coreFail) missingCore++;
    if (dkFail) badDk++;
    if (wlFail) badWl++;
    if (r.stuck || synFail || coreFail || dkFail || wlFail) {
      if (fails.length < 8) fails.push(r);
    }
  }
  return { size, trials, stuck, missingSyn, missingCore, badDk, badWl, missCount, fails };
}

function printReport(s) {
  console.log(`\n=== ${s.size}인 × ${s.trials}회 (추천만 수락) ===`);
  console.log(`공대 미완성(추천 없음): ${s.stuck}`);
  console.log(`시너지 부족: ${s.missingSyn}`);
  console.log(`필수 직업 부족: ${s.missingCore}`);
  console.log(`죽기 2명 미만: ${s.badDk}`);
  console.log(`흑마 2명 미만: ${s.badWl}`);
  const keys = Object.keys(s.missCount);
  if (keys.length) {
    console.log("빠진 시너지:");
    keys
      .sort((a, b) => s.missCount[b] - s.missCount[a])
      .forEach((k) => console.log(`  - ${k}: ${s.missCount[k]}회`));
  }
  s.fails.forEach((f, i) => {
    console.log(
      `\n실패 예 ${i + 1}: filled=${f.filled}/${s.size} stuck=${f.stuck} T/M/R/H=${f.byRole.Tank}/${f.byRole.Melee}/${f.byRole.Ranged}/${f.byRole.Heal} DK=${f.dk} WL=${f.wl}`
    );
    if (f.missingCore.length) console.log(`  필수 빈 직업: ${f.missingCore.join(", ")}`);
    if (f.missing.length) console.log(`  빈 시너지: ${f.missing.join(", ")}`);
  });
}

const t20 = summarize(20, 100);
const t30 = summarize(30, 100);
printReport(t20);
printReport(t30);
const bad = t20.stuck + t20.missingSyn + t20.badDk + t20.badWl + t30.stuck + t30.missingSyn + t30.badDk + t30.badWl;
console.log(`\n합계 문제 횟수(중복 포함 합): ${bad}`);
