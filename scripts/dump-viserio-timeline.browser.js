/**
 * Viserio 공식 쿨기 노트(라이브러리) 페이지에서 bossTimeline 을 복사하는 콘솔 스니펫.
 * 1. https://wowutils.com/viserio-cooldowns/library/official-<boss>-heroic  (또는 mythic) 연다
 * 2. DevTools 콘솔에 이 파일 내용을 붙여 넣는다
 * 3. 클립보드 JSON 을 tmp-viserio/<id>.json 또는 tmp-viserio-heroic/<id>.json 으로 저장
 */
(() => {
  const h = [...document.querySelectorAll("h3")].find((x) => /Boss timeline/i.test(x.textContent || ""));
  if (!h) throw new Error("Boss timeline heading not found");
  const root = h.parentElement;
  const fk = Object.keys(root).find((k) => k.startsWith("__reactFiber"));
  let props = null;
  function walk(fiber, depth) {
    if (!fiber || depth > 30 || props) return;
    const p = fiber.memoizedProps || fiber.pendingProps;
    if (p && p.bossTimeline && p.fightEnd != null) {
      props = p;
      return;
    }
    walk(fiber.child, depth + 1);
    walk(fiber.sibling, depth + 1);
  }
  walk(root[fk], 0);
  if (!props) throw new Error("bossTimeline props not found");
  const tl = props.bossTimeline;
  const events = (Array.isArray(tl) ? tl : Object.values(tl))
    .map((e) => ({
      time: e.time,
      spellId: e.spellId,
      spellName: e.spellName,
      spellIcon: e.spellIcon,
      types: e.types,
    }))
    .sort((a, b) => a.time - b.time || a.spellId - b.spellId);
  const majors = [
    ...new Set(
      events
        .filter((e) => (e.types || []).some((t) => t === "Raid AOE" || t === "Raid Damage"))
        .map((e) => e.spellId)
    ),
  ];
  const dump = {
    boss: location.pathname,
    fightEnd: props.fightEnd,
    timelineEnd: props.timelineEnd,
    majorSpellIds: majors,
    events,
  };
  const json = JSON.stringify(dump, null, 2);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json);
  console.log(`events=${events.length} fightEnd=${dump.fightEnd} timelineEnd=${dump.timelineEnd}`);
  return dump;
})();
