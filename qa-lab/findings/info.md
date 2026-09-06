# 정보 누설 — "패킷을 뜯어보는 사람"

좌석별 `PlayerView`를 전부 가로채, **"내가 알아서는 안 되는 것이 뷰에 들어 있는가"** 만 봤다.
화면(App.tsx)은 보지 않았다 — 서버가 각 좌석에 실제로 보낸 뷰가 판정 기준이다.

## 요약

- **돌린 판**: 반장전·동풍전 합계 **약 70 매치 / 550국 이상**, 좌석별 뷰 브로드캐스트 **20만 회 이상**을 전수 검사.
  - 광역 무작위(정보 증강 강제 배치 + 나머지 랜덤): 24매치 204국 × 2회전
  - 표적 조합(가려진 도라 × 왕패 열람 / 투시 × 은닉계 / 같은 증강 4좌석 / 동풍전): run2
  - 최소 재현 전용: repro_a, repro_triple, repro_triple_fs
- **커버리지**: 담당 9종(ura_peek · peek_riichi_waits · xray_hand · rinshan_preview · foresight ·
  dora_conceal · tenpai_scan · danger_sense · triple_peek) 전부 발동 경로를 밟았고,
  그 밖의 정보성 증강(bottom_deal · dead_wall_master · cliff_bloom · brief_fog · hidden_river ·
  future_sight · hand_swap3 · pond_snatch · stealth_riichi …)도 드래프트로 섞여 함께 검사됐다.
- **확정 1건 · 의심 1건.** 순수한 "비밀이 새는" 누설은 **한 건도 재현되지 않았다** (아래 §정상 확인).

도구: `qa-lab/info/spy.ts` — `harness.ts`의 `PersonaAgent`를 **상속**해 `sendView`/`decide`를 가로채는
`SpyAgent`. 좌석마다 매 뷰에서 12종의 불변식을 돌린다(손패·패산·왕패 가시성, tiles 맵 고아,
보유자 전용 채널 수신자, 국 경계 잔류, 프롬프트 후보에 실린 tileId, 도라 은닉, 뒷도라 조기 노출 …).

---

## 확정 1. 🟡 triple_peek — 패산을 건드리는 다른 증강이 끼면 "다음 쯔모 세 장"이 **틀린 채로 계속 떠 있다**

- **위치**: `packages/content/src/augments/triple_peek.ts:225-227` (resync 훅이 `TILE_DRAWN`·`TILE_DISCARDED`·`CALL_MADE` 셋만 본다)
  × `packages/content/src/augments/future_sight.ts:271-294` (커스텀 이벤트로 패산 3장을 손에 넣고 2장을 패산 밑으로 — 위 세 이벤트를 **하나도 발행하지 않는다**)
- **기대**: detail이 단언한다 — *"한 번 켜면 그 국이 끝날 때까지 계속 보이고, 누군가 퐁·치·깡을 해 쯔모 차례가 밀려도 **지금 기준으로 다시 계산**되어 어긋나지 않는다"*.
  description도 *"후로로 차례가 밀려도 그때그때 다시 계산돼 **항상 맞는다**"*.
- **실제**: 미래를 보는 자(future_sight)의 교환이 패산 앞 3장을 통째로 소비하는데 resync가 걸리지 않아,
  `view:{holder}:triple_peek` 채널이 **이미 사라진 패**를 "다음 쯔모"로 계속 표시한다. 그 상태로 다음 쯔모가 오면 표시와 실제가 다르다.
  같은 증강의 알고리즘(`peekMyDrawKinds`)을 그 자리에서 다시 계산해 비교하면 값이 갈린다.
- **재현**: `~/majak/node_modules/.bin/tsx qa-lab/info/repro_triple_fs.ts 1 1`
  (noDraft, `p0: ["triple_peek","future_sight"]`, `p1~p3: ["triple_peek"]`, 전원 masher)

  ```
  seed=1 rounds=8 [["TRIPLE_PEEK_WRONG",38],["TRIPLE_PEEK_STALE",88]]
     STALE per viewer: [["p0",22],["p1",20],["p2",23],["p3",23]]
     STALE p0@1-1-0 channel shows [wind4,man3,pin2] but recomputing now gives [wind3,sou3,sou4] phase=turn.act turn=1 wallLeft=68
     WRONG p0@1-1-0 predicted [wind4,man3,pin2] but drew dragon3 (tile 132) rinshan=false ... nowChannel=["wind4","man3","pin2"]
  ```

  **한 사람의 미래를 보는 자가 네 좌석의 예고를 전부 망가뜨린다** — 패산이 3장(4의 배수가 아니다) 밀리면
  좌석별 배정이 통째로 어긋나는데, 어느 좌석에도 resync 이벤트가 가지 않는다.

  **대조군(중요)**: 같은 하네스·같은 검사기로 `triple_peek`만 4좌석에 주고 드래프트를 끄면
  (`NODRAFT=1 tsx qa-lab/info/repro_triple.ts 1 3` → 25국 / **0건**,
  `… 1 6` → 49국 / **0건**) 하나도 나오지 않는다 — 증강 자체의 재계산 로직은 정확하다.
  울기·깡·차례 밀림 전부 정상 통과했다. 어긋나는 것은 **패산을 직접 옮기는 다른 증강이 낀 순간뿐**이다.

  (검사기가 처음 잡아낸 "예고 불일치" 다수는 **오탐**이었다 — 울어서 가져온 패와 영상패를 쯔모로 센 탓.
  두 경우를 제외하고, `직전 뷰에서 패산에 있던 패`만 비교하도록 좁힌 뒤에도 남은 것이 위 건이다.)
- **영향**: 정보가 **틀린다**. 이 증강은 "무엇이 올지 안다"가 전부이므로, 틀린 예고는 능력값의 손실이 아니라
  **거짓 정보**다(docs/30 P0 계열: "화면이 사실과 다르게 말한다"). 그 세 장을 믿고 손을 짜면 그대로 손해다.
  누설은 아니다 — 남에게 새지는 않는다.
- **범위 주의**: 확정한 조합은 `future_sight`뿐이다. 같은 구조(코어 이벤트를 안 거치고 `WALL`을 직접 옮기는
  커스텀 리듀서)를 쓰는 증강이면 같은 증상이 날 것으로 보이지만, 이 QA에서 재현으로 확정한 것은 이 한 쌍이다.

---

## 의심 1. 🟡 pond_snatch — 주워 간 패가 `round.lastDiscard`에 그대로 남는다 (담당 밖·표시 어긋남)

- **위치**: `packages/content/src/augments/pond_snatch.ts:156-160` — `discardsZone(fromPlayer)`에서 손패로 옮기지만 `round.lastDiscard`는 손대지 않는다.
- **관측**: 방금 버려진 패를 날치기로 주워 가면, 그 tileId가 **아직 바닥에 있는 마지막 버림패**로 전 좌석 뷰에 남는다.
  `buildPlayerView`의 `collectVisibleTileIds`가 `lastDiscard`를 공개 대상으로 잡으므로 그 패의 정체가 `tiles` 맵에도 실린다 —
  실물은 이미 날치기한 사람의 **손패 안**이다.
- **재현**: `tsx qa-lab/info/run1.ts 1 2` (seed=2, `p3:["dora_conceal","pond_snatch"]`)
  `p1@1-1-0 :: tile 60 (pin7) truly in p3's hand exposed in p1's tiles; viewZones=[] lastDiscard=yes(p2) phase=turn.act`
- **왜 의심인가**: 그 패의 **종류는 이미 공개 정보**다(공개적으로 버려졌다). 새는 비밀이 없으므로 정보 누설로 확정하지 않았다.
  다만 클라이언트가 `lastDiscard`로 그리는 표식(방금 버린 패 하이라이트)은 없는 패를 가리키게 되고, `round.lastDiscard`를
  "지금 바닥에 있는 패"로 읽는 코드가 있다면 어긋난다. 손패 계열 담당이 볼 사안이라 여기서는 관측만 남긴다.

---

## 정상 확인 (누설 없음 — 550국 / 20만 뷰에서 **0건**)

불변식마다 좌석 4개 × 매 브로드캐스트로 돌렸고 전부 0건이다. 재현 스크립트가 그대로 회귀 테스트가 된다.

| 검사 | 내용 | 결과 |
|---|---|---|
| `HAND_LEAK` | `xray_hand` 미보유자의 뷰에 남의 손패 tileId·kind가 실리는가 | 0 |
| `HAND_LEAK_INACTIVE` | `xray_hand` 보유자가 **발동 전/다음 국에** 남의 손패를 보는가 (`view:*:xray_hand:{h}` 공개 마커와 대조) | 0 |
| `HAND_TILE_LEAK` | Zone을 우회한 채널로 남의 손패 실물이 `tiles` 맵에 실리는가 | 0 (위 pond_snatch·future_sight 공개분 제외) |
| `WALL_LEAK` / `DEADWALL_LEAK` | `bottom_deal` / 왕패 열람 4종 미보유자에게 패산·왕패가 열리는가 | 0 |
| `DEADWALL_COUNT` | `rinshan_preview` 단독 보유자가 왕패를 1장 넘게 보는가 (widenPeek 규약) | 0 |
| `DEADWALL_URA_EARLY` | `ura_peek` 보유자가 **확인 전에** 왕패가 열리는가 | 0 |
| `DORA_CONCEAL_LEAK` / `_TILE_LEAK` | 상대가 `dora_conceal`을 들었을 때 도라 표시패가 `round.doraIndicators`·`tiles`로 새는가 (왕패 열람 증강 동시 보유 포함 — docs/25 정보 #3의 회귀) | 0 |
| `URA_EARLY` / `URA_TILE_LEAK` | 정산 전에 뒷도라 표시패가 뷰에 실리는가 | 0 |
| `ORPHAN_TILE` | 어느 가시 Zone에도 없는 패의 정체가 `tiles`에 실리는가 | 0 |
| `PRIVATE_CHANNEL_LEAK` | 보유자 전용 채널(`ura`, `waits:*`, `foresight_peek`, `tenpai_scan`, `danger_sense`, `triple_peek`)이 **비보유자** 뷰에 실리는가 | 0 |
| `PROMPT_TILE_LEAK` | 액션 후보(`DecisionPrompt.options`)의 payload에 그 좌석이 볼 수 없는 tileId가 실리는가 | 0 |
| `RESIDUE` / `RESIDUE_ANY` | 국이 바뀐 **배패 완료 시점**에 지난 국의 표시 채널이 값 그대로 남는가 (전 증강) | 실질 0 |

`RESIDUE_ANY`가 잡아낸 채널은 전부 **설계상 게임 스코프**였다 —
`red_five_touch:{p}`("게임이 끝날 때까지"), `let_it_ride:{p}`(연승 배수), `cornucopia:{p}`(지급 기록),
`unification:{p}`(상시 패시브), `honor_return:{p}`(소진 후 `[]`).
담당 9종의 표시 채널은 **국 경계에서 전부 사라졌다** — `roundViewKey` 표식을 `setupRound`가 지우고,
`peek_riichi_waits`는 고정 키를 `PEEK_WAITS_CLEARED`로 직접 지운다(확인).

### 소스 대조 (`PlayerView.ts` 가시성 규약 × 각 증강의 widenPeek)

- `visibility.hand` 모디파이어는 `xray_hand` 하나뿐 — 보유자 시점·타인 Zone·그 국 활성 플래그 3중 게이트. ✅
- `visibility.wall`은 `bottom_deal`(`widenPeek`, `pick:"back"`) 하나뿐. ✅
- `visibility.deadWall` 4종 전부 `widenPeek` 경유 — `ura_peek`(전체) · `dead_wall_master`(`deadWallSize`) ·
  `cliff_bloom`(`rinshanRemaining`) · `rinshan_preview`(1). 앞에서 세는 peek이고 표시패 블록은 뒤 10장이라,
  좁게 여는 셋은 표시패에 닿지 않는다. docs/25 벽패 #2(rinshan_preview의 규약 위반)는 **고쳐져 있다**. ✅
- 가려진 도라는 왕패 Zone에서 `concealedTileIdAt(i)` 자리표로 치환되어 정체가 전선에 실리지 않으면서
  **자리 번호가 보존**된다(docs/28 §2-9의 deadIndex 어긋남 회귀 없음). ✅
- `buildRoundView`의 타인 분기에 `ippatsu`·`furiten`·`noYaku(Waits)`·`riichiBlocked`·`sealedTileIds`가 실리지 않는 것을
  코드와 뷰 양쪽에서 확인. 스텔스 리치의 `riichiDeclared`/`doubleRiichi`/`riichiTileIndex` 3종 마스킹도 정상. ✅
- `augmentView` 채널 census(전 증강): 비보유자에게 흘러간 채널은 전부 `view:*:` 공개 채널이었고,
  값에 비밀(패 종류·tileId)이 실린 경우는 없었다. `future_sight`의 `revealTiles:future`는
  detail이 *"가져온 3장은 상대에게도 그대로 공개된다"*고 명시한 의도된 공개다. ✅

### 이번 조사에서 **제외**한 것 (이미 문서화됨)

`tenpai_scan_use` actionFx 전원 방송(docs/25 정보 #1, `FX_PRIVATE_ACTION_TYPES`에 등재 완료) ·
스텔스 리치 후보 필터 누설(docs/25 P3, `hand_swap3`·`full_hand_swap`·`seat_swap`) ·
가려진 도라 × 왕패 열람(정보 #3) · 이면투시 전반(정보 #7·#8, "의도된 설계로 확정") ·
`brief_fog`·`foresight` 표시 잔류(P4) · 리플레이 JSONL의 개인 채널 평문.

`danger_sense`·`ura_peek`·`peek_riichi_waits`의 발동이 `actionFx`로 전원에게 방송되는 것은
`HanchanController.ts:428-441`이 세운 기준("**detail이 발동 사실의 비밀을 약속하는가**")에 따르면
의도된 동작이다(셋 다 결과만 비공개라고 적혀 있다) — 그래서 보고하지 않는다.

---

## 재현·검사 도구

| 파일 | 용도 |
|---|---|
| `qa-lab/info/spy.ts` | `PersonaAgent` 상속 `SpyAgent` + 좌석별 뷰 불변식 12종 + `runSpyMatch`(드래프트 on/off) |
| `qa-lab/info/run1.ts` | 광역 무작위 스윕 + `augmentView` 채널 census + 잔류 집계 |
| `qa-lab/info/run2.ts` | 표적 조합(가려진 도라 × 왕패 열람, 투시 × 은닉계, 같은 증강 4좌석, 동풍전) |
| `qa-lab/info/repro_a.ts` | 정보 증강 8종 동시 배치 최악 조합 |
| `qa-lab/info/repro_triple.ts` | 삼세 예지 대조군 (`NODRAFT=1`이면 순수 조건) |
| `qa-lab/info/repro_triple_fs.ts` | **확정 1의 최소 재현** — 삼세 예지 × 미래를 보는 자 |
