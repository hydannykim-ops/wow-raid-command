# 보스 타임라인 · 페이즈 기본값 업데이트

신화/영웅 **스킬 타임라인**과 **페이즈 전환 기본값**은 시즌이 바뀌거나 Viserio 템플릿이 갱신돼도 이 파이프라인만 쓴다.

Warcraft Logs 적 시전만으로 카탈로그를 채우지 않는다. 그렇게 하면 Viserio에 있는 스킬이 빠지고, 짧은 킬 시계가 그대로 들어가며, 영웅은 신화 스펠 ID에 없는 시전을 버린다.

| 무엇을 | 소스 | 결과 파일 |
|--------|------|-----------|
| 스킬 시각·아이콘·유형 | Viserio 공식 보스 타임라인 (`bossTimeline`) | `tmp-viserio/<id>.json` 또는 `tmp-viserio-heroic/<id>.json` → `js/planner-catalog.js` |
| 한국어 스킬 이름 | Wowhead ko 툴팁 | `scripts/spell-names-ko.json` |
| 페이즈 전환 기본값 | Viserio 시계에 WCL `phaseTransitions` 오프셋을 투표 | `scripts/phase-starts.json` / `phase-starts-heroic.json` |
| 플래너가 읽는 값 | import 스크립트 | `js/planner-catalog.js` (`BOSSES[].events` 신화, `BOSSES[].heroic` 영웅) |

플래너는 난이도에 따라 `catalogBoss()` → `bossForDifficulty()` 를 본다. 영웅(WCL difficulty 4)이면 `raw.heroic.phases` / `events` 가 기본값이다. `rawBoss()` 의 신화 값을 페이즈 바에 쓰면 안 된다.

## 난이도별 공식 노트

Viserio 라이브러리 공개 템플릿. 페이지의 **Boss timeline** 이 곧 카탈로그 소스다. 같은 보스의 아무 공개 노트라도 난이도가 맞으면 타임라인은 동일하다. 공식 템플릿을 우선한다.

| 보스 id | 신화 | 영웅 |
|---------|------|------|
| nekzali | [official-nekzali-the-soulcoiler-mythic](https://wowutils.com/viserio-cooldowns/library/official-nekzali-the-soulcoiler-mythic) | [official-nekzali-the-soulcoiler-heroic](https://wowutils.com/viserio-cooldowns/library/official-nekzali-the-soulcoiler-heroic) |
| entombed-sentinels | [official-entombed-sentinels-mythic](https://wowutils.com/viserio-cooldowns/library/official-entombed-sentinels-mythic) | [official-entombed-sentinels-heroic](https://wowutils.com/viserio-cooldowns/library/official-entombed-sentinels-heroic) |
| lost-explorers | [official-the-lost-explorers-mythic](https://wowutils.com/viserio-cooldowns/library/official-the-lost-explorers-mythic) | [official-the-lost-explorers-heroic](https://wowutils.com/viserio-cooldowns/library/official-the-lost-explorers-heroic) |
| vashnik | [official-vashnik-the-malignant-mythic](https://wowutils.com/viserio-cooldowns/library/official-vashnik-the-malignant-mythic) | [official-vashnik-the-malignant-heroic](https://wowutils.com/viserio-cooldowns/library/official-vashnik-the-malignant-heroic) |
| sszorak | [official-sszorak-mythic](https://wowutils.com/viserio-cooldowns/library/official-sszorak-mythic) | [official-sszorak-heroic](https://wowutils.com/viserio-cooldowns/library/official-sszorak-heroic) |
| twin-fangs | [official-the-twin-fangs-mythic](https://wowutils.com/viserio-cooldowns/library/official-the-twin-fangs-mythic) | [official-the-twin-fangs-heroic](https://wowutils.com/viserio-cooldowns/library/official-the-twin-fangs-heroic) |
| coiled-altar | [official-the-coiled-altar-mythic](https://wowutils.com/viserio-cooldowns/library/official-the-coiled-altar-mythic) | [official-the-coiled-altar-heroic](https://wowutils.com/viserio-cooldowns/library/official-the-coiled-altar-heroic) |
| ulatek | [official-ulatek-mythic](https://wowutils.com/viserio-cooldowns/library/official-ulatek-mythic) | [official-ulatek-heroic](https://wowutils.com/viserio-cooldowns/library/official-ulatek-heroic) |

WCL encounter id 는 난이도가 같아도 동일하다. 난이도만 4(영웅) / 5(신화) 로 나눈다.

## 시즌/핫픽 후 갱신 순서

신화와 영웅을 둘 다 손볼 때:

1. Viserio 덤프 (아래 1절) — 신화 8넴 `tmp-viserio/`, 영웅 8넴 `tmp-viserio-heroic/`
2. `node scripts/fetch-spell-names-ko.mjs` — 새 spellId 가 있으면
3. `node scripts/derive-phase-starts.mjs` 그다음 `--heroic` — WCL 투표
4. `node scripts/import-viserio-timelines.mjs` 그다음 `--heroic` — 카탈로그 반영
5. 플래너에서 신화/영웅 토글해 스킬 수·페이즈 바가 난이도별로 다른지 확인

한 난이도만 바뀌면 해당 덤프 폴더 + 해당 `--heroic` 플래그만 쓰면 된다. 신화 import 는 기존 `heroic:` 블록을 유지하고, 영웅 import 는 신화 `events`/`phases` 를 건드리지 않는다.

## 1. Viserio 덤프

RSC/Next 페이지만으로는 `bossTimeline` 이 없다. **공식 라이브러리 노트**를 연 뒤 React props 에서 꺼낸다.

1. 위 표의 노트를 연다. 타임라인 UI가 그려질 때까지 기다린다 (바시니크는 로딩이 길다).
2. DevTools 콘솔에 `scripts/dump-viserio-timeline.browser.js` 전체를 붙여 넣는다.
3. `Boss timeline heading not found` / `bossTimeline props not found` 이면 페이지가 아직 하이드레이션되지 않은 것이다. 새로고침 후 타임라인이 보인 다음 다시 실행한다.
4. 콘솔이 준 JSON을 저장한다.
   - 신화 → `tmp-viserio/<id>.json`
   - 영웅 → `tmp-viserio-heroic/<id>.json`
5. 파일의 `boss` 필드를 카탈로그 id 로 바꾼다 (`nekzali` 등). 스니펫 기본값은 URL path 다.

덤프 형태:

```json
{
  "boss": "nekzali",
  "fightEnd": 496.53,
  "timelineEnd": 570,
  "majorSpellIds": [1288772],
  "events": [{ "time": 3, "spellId": 1288772, "spellName": "Soulcoil Rite", "spellIcon": "/viserio-cooldowns/...", "types": ["Raid AOE"] }]
}
```

- `timelineEnd` → 카탈로그 `duration`
- `types` 에 `Raid AOE` 또는 `Raid Damage` → 그리드 주요 스킬 (`majorSpellIds`, `major: true`). 네크잘리 Corpse Blight `1307939` 는 제외.
- `Phase Change` / `Intermission` → 이벤트 type `phase`. 페이즈 **기본 시각**은 이 태그가 아니라 3절 투표 결과다. 투표 파일이 비어 있으면 import 가 Phase Change 시각으로 폴백한다.

## 2. 한국어 스킬 이름

```
node scripts/fetch-spell-names-ko.mjs
```

카탈로그 + `tmp-viserio` + `tmp-viserio-heroic` 의 spellId 를 Wowhead ko 툴팁으로 조회해 `scripts/spell-names-ko.json` 에 넣는다. import 가 `nameKo` 에 이 캐시를 쓴다.

## 3. 페이즈 전환 기본값 (Viserio 시계 ↔ WCL)

Viserio 이벤트 시각은 그대로 둔다. WCL 킬의 `phaseTransitions` 이후 “보스 시전 첫 오프셋”을 모아, `Viserio 시각 − 오프셋` 으로 투표한다. 가장 많이 겹치는 시각이 그 전환의 기준값이다.

같은 루프가 템플릿에 여러 번 있으면 뒷사이클이 1~2점 더 나올 수 있다. 고른 시각이 그 전환의 WCL 중앙값 × 2.3 보다 크면, 점수가 비슷한 **이른 사이클**로 당긴다. (Viserio 시계는 WCL 킬보다 길 수 있어서, 단순히 WCL 초를 그대로 쓰지 않는다.)

```
node scripts/derive-phase-starts.mjs           # 신화 → scripts/phase-starts.json
node scripts/derive-phase-starts.mjs --heroic  # 영웅 → scripts/phase-starts-heroic.json
```

`.dev.vars` 의 `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET` 필요. 신화 difficulty 5, 영웅 4. 스피드 랭킹 상위 킬을 샘플로 쓴다.

로그에 `samples` (WCL 전환) 와 `candidates` 가 같이 찍힌다. 타이머 넴(봉인된 파수꾼)은 영웅/신화 시각이 비슷해도 정상이다. 페이즈가 없는 넴은 `phases: []`.

## 4. 카탈로그에 넣기

```
node scripts/import-viserio-timelines.mjs           # 신화 events/phases. 기존 heroic 블록은 유지
node scripts/import-viserio-timelines.mjs --heroic  # boss.heroic 만 갱신
```

반드시 derive 를 먼저 돌린 뒤 import 한다. 순서가 바뀌면 페이즈가 Viserio Phase Change 폴백으로 들어간다. import 가 끝나면 카탈로그 문법을 검사하므로, `},,,,` 처럼 콤마가 쌓이면 스크립트가 실패한다.

## 쓰지 말 것

`scripts/fetch-heroic-timelines.mjs` 는 WCL 적 Casts 만 긁고, 신화 `spellId` 에 없는 시전은 버린다. 영웅 전용 스킬이 빠지고 킬 길이가 짧다. 이후 영웅 갱신은 Viserio 덤프 + `derive --heroic` + `import --heroic` 만 쓴다.
