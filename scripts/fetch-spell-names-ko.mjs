/**
 * 스킬 ID → 공식 한국어 이름 (Wowhead ko 툴팁) 캐시 생성 + 공대원 쿨기 nameKo 갱신
 * 보스 스킬은 import-viserio-timelines.mjs 가 이 캐시를 사용
 *   node scripts/fetch-spell-names-ko.mjs [--refresh]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dumpDirs = [path.join(root, "tmp-viserio"), path.join(root, "tmp-viserio-heroic")];
const catalogPath = path.join(root, "js", "planner-catalog.js");
const cachePath = path.join(__dirname, "spell-names-ko.json");
const refresh = process.argv.includes("--refresh");

const cache = !refresh && fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};

const ids = new Set();
let src = fs.readFileSync(catalogPath, "utf8");
for (const m of src.matchAll(/spellId: (\d+)/g)) ids.add(Number(m[1]));
for (const dumpDir of dumpDirs) {
  if (!fs.existsSync(dumpDir)) continue;
  for (const f of fs.readdirSync(dumpDir).filter((x) => x.endsWith(".json"))) {
    const dump = JSON.parse(fs.readFileSync(path.join(dumpDir, f), "utf8").replace(/^\uFEFF/, ""));
    for (const e of dump.events || []) if (e.spellId) ids.add(Number(e.spellId));
  }
}

// dataEnv: 1 live, 2 ptr, 3 beta
async function fetchKo(id) {
  for (const env of [1, 2, 3]) {
    try {
      const r = await fetch(`https://nether.wowhead.com/tooltip/spell/${id}?locale=1&dataEnv=${env}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.name && !/^Spell #?\d+$/i.test(j.name)) return j.name;
    } catch {}
  }
  return null;
}

const todo = [...ids].filter((id) => !cache[id]);
let i = 0;
async function worker() {
  while (i < todo.length) {
    const id = todo[i++];
    const name = await fetchKo(id);
    if (name) cache[id] = name;
    else console.warn(`! no ko name: ${id}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const sorted = Object.fromEntries(Object.entries(cache).sort((a, b) => Number(a[0]) - Number(b[0])));
fs.writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n", "utf8");

// 공대원 쿨기 (BOSSES 블록 앞) nameKo 갱신
const bossStart = src.indexOf("  const BOSSES = [");
let head = src.slice(0, bossStart);
let changed = 0;
head = head.replace(/(spellId: (\d+),\s*\n\s*name: "[^"]*",\s*\n\s*nameKo: ")([^"]*)(")/g, (all, pre, id, ko, post) => {
  const next = cache[id];
  if (!next || next === ko) return all;
  console.log(`  ${id}: ${ko} → ${next}`);
  changed += 1;
  return pre + next.replace(/"/g, '\\"') + post;
});
src = head + src.slice(bossStart);
fs.writeFileSync(catalogPath, src, "utf8");

console.log(`ids=${ids.size} cached=${Object.keys(sorted).length} fetched=${todo.length} spellNameKo changed=${changed}`);
