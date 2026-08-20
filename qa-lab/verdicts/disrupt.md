# 의심 재검증 — 방해·상호작용 계열 (2026-08-20)

대상: `disrupt-a` 의심 1, `disrupt-b` 의심 1·2·3, `cross` 의심 1·2·3.
소스는 `8db6c10`(QA 89건 수정) 이후 상태에서 다시 확인했다. **읽기 전용** — `packages/` 는 건드리지 않았다.
재현 스크립트는 전부 `qa-lab/verify-disrupt/` 에 있다.

**결론: 확정 4 / 기각 2 / 밸런스 판단 요청 1**

| # | 건 | 판정 |
|---:|---|---|
| 1 | `seat_swap` × `discard_lock` — 자리 바꿈이 봉인을 증발시킨다 | 🟠 **확정** |
| 2 | `push_riichi` 낙인 표시가 정산·드래프트 내내 남는다 | 🟡 **확정** |
| 3a | 사전 지급이 **중복**을 뚫는다 | ✅ **기각** (`reservedAugmentIds` 로 닫혔다) |
| 3b | 사전 지급이 **상호 배제(conflicts)** 를 뚫는다 | 🟠 **확정** |
| 4 | 함구령·박무의 "6순"이 후로가 끼면 7~8바퀴 | ✅ **기각** (실측 6.02바퀴) |
| 5 | 드래프트 좌석 칸 여유 13장 — 조금만 줄면 중복 방지가 꺼진다 | 🟡 **확정** (결함: 조용한 폴백) |
| 6 | 반장전의 58%가 서입까지 간다 | ✅ **기각** (하네스 탓 — 실봇 1.7%, 실제 리플레이 0%) |
| 7 | 동풍전 `eastFourth` 드래프트는 마지막 1국짜리 | ⚖ **결함 아님 · 밸런스 판단 요청** |

---

## 확정 1. 🟠 `seat_swap`(·`full_hand_swap`) × `discard_lock` — 손을 통째로 맞바꾸면 봉인이 **아무에게도** 안 걸린다

- 위치
  - 봉인 판정: [`discard_lock.ts:249-262`](../../packages/content/src/augments/discard_lock.ts#L249)
    — `discard.blockedTileIds` 모디파이어가 `sealTilesKey(holder, rctx.playerId)` 를 읽는다.
  - 키: [`discard_lock.ts:92-94`](../../packages/content/src/augments/discard_lock.ts#L92)
    — 봉인 목록은 **대상 playerId 기준**으로 저장된다(값은 tileId 목록).
  - 손 교환: [`seat_swap.ts:191-213`](../../packages/content/src/augments/seat_swap.ts#L191),
    같은 모양으로 [`full_hand_swap.ts`](../../packages/content/src/augments/full_hand_swap.ts) 도 해당.
  - 걸러 내는 곳: [`helpers.ts:353-359`](../../packages/core/src/mahjong/flow/helpers.ts#L353) — `hand.includes(id)`.

- **발동 창이 지금도 겹치는가 — 겹친다.** 지시대로 먼저 확인했다.
  `seat_swap` 에 들어간 가드는 ① 보유자 자신의 리치(`seat_swap.ts:104`), ② 후로 직후
  (`lastDrawnTile === null`, `:110`), ③ 대상의 리치(`:130`), ④ 내 `discardCount > 0`(`:140`) 넷이다.
  `discard_lock` 의 창은 "내 턴·`turn.act`·`discardCount === 0`·쿨다운 종료"
  ([`discard_lock.ts:113-119`](../../packages/content/src/augments/discard_lock.ts#L113)).
  **국 첫 바퀴에는 넷 다 서지 않는다** — 오야가 1순에 봉인하고, 그 다음 사람이 자기 첫 순에
  자리를 바꾸면 끝이다. 재현에서 봉인 step 2 → 교환 step 3 으로 **바로 다음 결정**에 붙었다.

- 기대: description — "발동 시점 손패의 **그 패들**을 이번 국 동안 버릴 수 없게 잠근다".
  손이 남에게 넘어갔다고 봉인이 통째로 사라진다는 말은 어디에도 없다.
- 실제: `p1` 이 `p2` 와 손을 맞바꾸는 순간 **양쪽 봉인이 동시에 0장**이 된다.
  봉인 원장부(`view:p0:discardLockReveal:*#round`)는 그대로 남아 있는데, 그 tileId 들이
  각자 상대 손으로 건너가 `hand.includes(id)` 를 통과하지 못한다. 넘겨받은 쪽에도 안 걸린다
  (키가 **사람 기준**이므로).

- 재현: `tsx qa-lab/verify-disrupt/r1_seatswap_discardlock.ts swap 3 [seat_swap|full_hand_swap]`
  (동풍전 seed=3, `preset={p0:["discard_lock"], p1:["seat_swap"]}`,
   `lockedDiscardIds` = 엔진의 **최종** 버림 금지 판정을 매 결정마다 찍는다)
  ```
    [1] p0 locks={"p0":[],"p1":[],"p2":[],"p3":[]}
  >>> p0 seal_hands
    [2] p0 locks={"p0":[],"p1":[11,90],"p2":[25,2],"p3":[15,13,91]}
    [3] p1 locks={"p0":[],"p1":[11,90],"p2":[25,2],"p3":[15,13,91]}
  >>> p1 seat_swap → p2
    [4] p1 locks={"p0":[],"p1":[],"p2":[],"p3":[15,13,91]}      ← p1·p2 봉인 동시 증발
          원장부=[["view:p0:discardLockReveal:p1#round",[11,90]],
                  ["view:p0:discardLockReveal:p2#round",[25,2]], …]   ← 값은 그대로 남아 있다
  ```
  대조군 `noswap` 은 국이 끝날 때까지 `p1:[11,90] p2:[25,2] p3:[15,13,91]` 을 유지한다.
  `full_hand_swap`(통째로 바꾸기)으로 바꿔 돌려도 **출력이 같다** — `seat_swap` 고유 문제가 아니라
  "손을 통째로 옮기는 증강 전부"에 걸린 공통 구멍이다(`hand_swap3` 는 3장만 옮기므로 부분 증발).

- 영향: 크래시·소프트락·점수 오류는 없다. 깨지는 것은 **prism 티어 방해 증강의 효과 자체**다 —
  2국에 1회짜리 봉인이, 상대의 1회짜리 액티브 한 번에 **3좌석 중 2좌석분이 통째로** 지워진다.
  화면에는 자물쇠가 사라질 뿐 아무 설명도 없다(보유자 뷰의 원장부는 계속 tileId를 표시하므로
  **보유자는 아직 잠겨 있다고 믿는다** — 정보까지 어긋난다).

- 최소 수정 위치 제안 (고치지 않았다)
  - (A) 가장 작게: `discard_lock.ts:249-262` 의 모디파이어가 `sealTilesKey(holder, rctx.playerId)`
    한 칸만 읽는 것을 **보유자의 세 대상 키 전부의 합집합**으로 바꾼다. 봉인이 tileId 기준이므로
    "그 패를 지금 손에 든 사람"에게 자연히 따라붙어, 어떤 교환 증강이 끼어도 새지 않는다.
    (보유자 자신 제외 규칙은 그대로 두면 된다.)
  - (B) 대안: `seat_swap.ts` 의 `SEATS_SWAPPED` 리듀서(`:191`)에서 두 사람의
    `sealedKey`/`sealTilesKey` 값을 함께 뒤집는다. 이건 `full_hand_swap`·`hand_swap3` 에도
    똑같이 넣어야 해서 (A) 보다 손이 많이 간다.

---

## 확정 2. 🟡 `push_riichi` — 낙인 표시가 정산 화면과 증강 드래프트 내내 서 있다

- 위치: 표시 채널 [`push_riichi.ts:65`](../../packages/content/src/augments/push_riichi.ts#L65)
  `roundViewKey("*", "push_riichi:{holder}")` — 국 스코프라 **다음 국 `setupRound`** 에서 지워진다.
  같은 모양의 `blind_ron` 은 2026-08-12에 [`blind_ron.ts:82-86`](../../packages/content/src/augments/blind_ron.ts#L82)
  에 `ROUND_SETTLED` 리액션을 넣어 **정산 시점에** 내리도록 고쳤고, `rank_gate` 도
  [`rank_gate.ts:133`](../../packages/content/src/augments/rank_gate.ts#L133) 에서 같은 처리를 한다.
  `push_riichi` 에는 `ROUND_SETTLED` 리액션이 **없다**(`roundScopedKey` 는 데이터 키에만 적용됐다).
- 기대: 낙인은 "찍은 그 국 동안만" 산다(파일 머리말 `:8`). 국이 끝나면 관계선도 함께 내려가야 한다.
- 실제: 국이 끝난 뒤에도 채널 값이 살아 있고, **플레이어에게 실제로 전송되는 뷰에도 실린다.**
- 재현: `tsx qa-lab/verify-disrupt/r2_push_brand_persist.ts 5` (동풍전, `preset={p0:["push_riichi"]}`,
  낙인 대상 p1은 리치를 걸지 않아 낙인이 국 끝까지 산다)
  ```
  >>> p0 push_brand → p1
    [국 종료 직후] augmentData 낙인 키=[…,["view:*:push_riichi:p0#round","p1"]]
    [국 종료 직후] p1 뷰 낙인 채널=[["push_riichi:p0","p1"]]
    [드래프트 eastThird] augmentData 낙인 키=[…,["view:*:push_riichi:p0#round","p1"]]
    [드래프트 eastThird] p1이 마지막으로 받은 뷰의 낙인 채널=[["push_riichi:p0","p1"]]
    [다음 국 배패 후] augmentData 낙인 키=[]                       ← 여기서야 지워진다
  ```
  4국 전부 같은 모양(정산·드래프트 구간 내내 값이 산다).
- 클라이언트가 그 값을 실제로 그리는가: 두 곳에서 그린다.
  ① 이름표 관계 표식 — `push_riichi` 가 `RELATION_META`/`RELATION_HEADS` 에 있고
     ([`App.tsx:12321`](../../packages/client/src/App.tsx#L12321), `:12395-12408`),
     값이 `""` 가 아니면 관계선이 선다.
  ② 낙인 당사자에게 뜨는 텍스트 뱃지 "🤚 등 떠밀기 / 멘젠 텐파이로 버리면 자동 리치"
     ([`App.tsx:17462-17474`](../../packages/client/src/App.tsx#L17462)).
  정산 결과창·`DraftOverlay`([`App.tsx:5748`](../../packages/client/src/App.tsx#L5748))는 탁자 위에
  덧씌우는 오버레이라 그 아래 이름표가 계속 살아 있다. 완전히 같은 구조의 `blind_ron` 은
  실제로 사용자 신고("해당 국이 지났는데도 표시가 남아 있음")로 고쳐진 건이다.
- 영향: 점수·판정은 무관. **정보가 틀린다** — 이미 죽은 낙인을 보고 다음 국 드래프트를 고르게 된다.
- 최소 수정 위치: `push_riichi.ts` `install()` 안에 `blind_ron.ts:82-86` 과 같은
  `ctx.reaction(ROUND_SETTLED, …)` 를 넣어 `brandViewKey(holder)` 를 `""` 로 비운다(4줄).

---

## 기각 3a. ✅ 사전 지급의 **중복**은 닫혔다

`HanchanController.installPreset`([`:976-991`](../../packages/core/src/match/HanchanController.ts#L976))이
남은 preset 전부를 `reservedAugmentIds` 로 넘기고, `Augment.ts:555,562` 에서 후보를 걸러 낸다.

- 재현: `tsx qa-lab/verify-disrupt/r3_preset_grant.ts 120` — (A)조: `p0:["cornucopia"]`,
  뒷자리 `p2:["regret","spy"] p3:["discard_lock","parasite"]`
  ```
  시드 120개
  (A) 중복(AUG_DUP): 0건
  ```
  (원 보고의 `seed=143 regret 중복` 형태가 재현되지 않는다.)

## 확정 3b. 🟠 사전 지급이 **같은 좌석의 상호 배제(conflicts)** 는 그대로 뚫는다

- 위치: [`HanchanController.installPreset:983-990`](../../packages/core/src/match/HanchanController.ts#L983)
  — 좌석·id 를 하나씩 `applyAugment`(=`draftPick` 제출 → 즉시 `installAugment`) 한다.
  후보 필터의 `mine` 은 [`Augment.ts:531`](../../packages/core/src/augment/Augment.ts#L531)
  에서 **그 시점에 이미 설치된 것**만 본다.
- 기대: `Augment.ts:521-527` 주석 — *"드래프트에서 못 만나게 막아 둔 조합이 지급으로 뚫리면
  손패 장수·화료형이 어긋나 그 국이 통째로 벽돌이 된다."*
- 실제: 같은 좌석의 preset 이 `[cornucopia, X]` 순이면, cornucopia 가 설치되는 시점에 X 가
  아직 `player.augments` 에 없어 **X 와 상호 배제인 증강이 그대로 지급된다.**
  `reservedAugmentIds` 는 X 자신만 막을 뿐 X 의 상대편을 막지 못한다.
- 재현: `tsx qa-lab/verify-disrupt/r3_preset_grant.ts 120 stealth_riichi`
  (B조: `p3:["cornucopia","stealth_riichi"]`. 스텔스 리치는 상호 배제 8종으로 카탈로그 최다)
  ```
  (B) 같은 좌석 상호배제 위반: 17건 / 120  (14.2%)
     seed=12 p3=[cornucopia,off_by_one,last_stand,stealth_riichi] → off_by_one × stealth_riichi
     seed=14 p3=[cornucopia,all_or_nothing,spy,stealth_riichi]    → all_or_nothing × stealth_riichi
     seed=21 p3=[cornucopia,full_hand_swap,riichi_upgrade,stealth_riichi]
     seed=22 p3=[cornucopia,three_dragons_will,open_riichi_reveal,stealth_riichi]
     seed=30 p3=[cornucopia,riichi_seal,invincible,stealth_riichi]
  ```
  **순서 의존이 원인이라는 증거**: 같은 시드·같은 카드로 순서만 뒤집으면(`… stealth_riichi rev`,
  즉 `p3:["stealth_riichi","cornucopia"]`) **0/120** 이다.
- 실제 경로: 서버 샌드박스(증강 테스트 방)가 이 경로를 쓴다 —
  [`RoomManager.ts:4922`](../../packages/server/src/RoomManager.ts#L4922) `presetAugments: room.sandboxAugments`,
  정제기 [`:4281-4298`](../../packages/server/src/RoomManager.ts#L4281) 는 좌석·카탈로그·중복·상한만 보고
  **conflicts 는 검사하지 않는다**. 사람이 좌석에 `수상한 주사위 + 스텔스 리치`를 골라 두면 그 방에서
  일어난다.
- 영향: 그 자체로는 크래시가 아니지만, conflicts 가 존재하는 이유가 "그 조합은 국을 벽돌로 만든다"
  이므로 결과는 그 국의 손이 통째로 죽는 것이다. 정식 드래프트에서 막아 둔 상태가 샌드박스에서 성립한다.
- 최소 수정 위치: `installPreset`(`HanchanController.ts:983-990`)에서 **두 패스로 나눈다** —
  ① 전 좌석·전 id 의 `draftPick` 을 먼저 제출해 `player.augments` 를 완성하고,
  ② 그 뒤에 `installAugment` 를 순서대로 돌린다. 그러면 `mine`·`heldByAnyone` 이 완전해져
  `reservedAugmentIds` 없이도 중복·상호 배제가 함께 닫힌다(`applyAugment` 를 submit/install 로 쪼개면 된다).

---

## 기각 4. ✅ 함구령·박무의 "6순" — 후로가 끼어도 실측 6.02바퀴다

기전은 실재한다: `turnCount` 는 **오야가 뽑을 때만** +1 하고
([`flowEvents.ts:402`](../../packages/core/src/mahjong/flow/flowEvents.ts#L402)),
`sealActive`/`fogActive` 는 `turnCount − 선언순 < 6` 으로 판정한다
([`call_seal.ts:50-54`](../../packages/content/src/augments/call_seal.ts#L50),
[`brief_fog.ts:91-96`](../../packages/content/src/augments/brief_fog.ts#L91)).
**그러나 효과 크기가 없다.**

- 재현: `tsx qa-lab/verify-disrupt/r4_six_turns.ts <매치수> [call|nocall] [brief_fog|call_seal]`
  — 선언 시점과 창이 닫히는 시점의 **테이블 총 버림 장수**를 재고 4로 나눈다(=바퀴).
  ```
  증강=brief_fog 모드=울지 않음  창 표본 15개
    창 동안 지나간 버림: 평균 24.0장 = 6.00바퀴 (이상 6.00)   후로 0.00회
  증강=brief_fog 모드=울보 3인  창 표본 60개
    창 동안 지나간 버림: 평균 24.1장 = 6.02바퀴 (이상 6.00)   후로 3.30회
    바퀴 분포: 최소 5.25 / 중앙 6.00 / 최대 7.75
    7바퀴 이상 간 창: 1/60
  ```
  창 하나에 후로가 **평균 3.3회** 일어나도 평균은 6.02, 중앙값은 정확히 6.00이다.
  이유: 후로는 오야의 쯔모를 건너뛰어 `turnCount` 를 덜 올리는 동시에 **사이 사람들의 버림도
  건너뛴다** — 두 방향이 상쇄된다. "7~8바퀴"는 관측되지 않았다(60창 중 7바퀴 이상 1건, 최대 7.75).
- `call_seal` 쪽은 애초에 성립하지 않는다 — 함구령은 **그 창 동안 상대의 치·펑·대명깡을 막으므로**,
  울보 3인 프리셋으로도 창 안의 후로가 0회였다(정확히 6.00바퀴).
- 남는 사실 하나(결함 아님): 창 길이가 고정 6바퀴가 아니라 5.25~7.75로 흔들린다. 설계상
  `turnCount` = 순 규약을 쓰는 다른 증강들과 같은 성질이고, 사용자가 원하면
  `no_ron_pact` 가 쓰는 "**내 버림 횟수**" 규약([`no_ron_pact.ts:75-80`](../../packages/content/src/augments/no_ron_pact.ts#L75))으로
  통일할 수 있다.

---

## 확정 5. 🟡 드래프트 좌석 칸 — 여유 12~13장이고, 넘어가는 순간 **경고 없이** 중복 방지가 꺼진다

이건 밸런스가 아니라 **결함**이다. 깨지는 것이 값이 아니라 **불변식**이고, 깨질 때 아무 신호가 없다.

- 위치: [`DraftController.cellFor:257-278`](../../packages/core/src/augment/DraftController.ts#L257)
  — `pool.length < seats*cellSize + draw` 이면 조용히 `null`.
  [`:337`](../../packages/core/src/augment/DraftController.ts#L337) — `null` 이면
  `rollUniform(prng, total, exclude, bias)`, 그 `exclude`([`excludeFor:174-203`](../../packages/core/src/augment/DraftController.ts#L174))에는
  **`heldByOthers` 가 없다**. (칸이 *말라붙는* 경로는 [`:346-357`](../../packages/core/src/augment/DraftController.ts#L346)
  에서 같은 `banned` 를 다시 걸어 이미 닫혀 있다 — 남은 구멍은 **칸을 아예 안 쓰는** 이 경로뿐이다.)
- 실측: `tsx qa-lab/verify-disrupt/r5_pool_cliff.ts 120`
  ```
  좌석 칸 요구치 need=102 (좌석 4 × 칸 24 + 보충 6)
    hanchan  gameStart   pool=115 여유=13
    hanchan  eastThird   pool=114 여유=12      ← 실효 여유는 12다(늦은 스테이지가 먼저 마른다)
    hanchan  southThird  pool=114 여유=12

  K종 제거 → 드래프트 시뮬 120게임 (전 스테이지)
    - 0종  pool=115  칸 사용   오퍼 겹침   0/120  게임 내 중복보유   0/120
    -12종  pool=103  칸 사용   오퍼 겹침   0/120  게임 내 중복보유   0/120
    -13종  pool=102  칸 사용*  오퍼 겹침  97/120  게임 내 중복보유  63/120
    -14종  pool=101  칸 미사용 오퍼 겹침 107/120  게임 내 중복보유  61/120
    -20종  pool= 96  칸 미사용 오퍼 겹침 109/120  게임 내 중복보유  65/120
  ```
  \* -13종은 `gameStart`(115→102)만 아슬아슬하게 통과하고 **늦은 스테이지(114→101)가 먼저** 폴백한다.
  즉 **13종만 빼면** 게임의 절반(63/120 = 52.5%)에서 `DraftController` 머리말이 못 박은 불변식
  *"한 게임에 같은 증강을 둘이 갖는 일이 없다"* 가 깨진다. 절벽이지 완만한 저하가 아니다.
- 영향(지금): **없다.** 오늘 카탈로그로는 위반 0건이다. 위험은 미래형이다 —
  증강 13종을 정리하거나, `modes`/`draftStages` 제한을 몇 개 더 걸거나(현재 제한은 4종뿐:
  `late_bloomer` `late_bloomer_east` `devils_advance` `reload`), 3인 마작·좌석 수 변경 같은 것이
  전부 이 문턱을 건드린다. 그리고 그때 **테스트도 로그도 아무 말을 하지 않는다.**
- 최소 수정 위치 제안 (둘 중 하나로 충분)
  - (A) `DraftController.draw:337` — 칸이 없을 때도 금지 목록을 유지한다:
    `rollUniform(prng, total, new Set([...exclude, ...this.heldByOthers(stage, player)]), bias)`.
    한 줄로 "게임 내 중복 금지"가 폴백 경로에서도 살아남는다(좌석 간 오퍼 겹침만 포기).
  - (B) `cellFor` 가 `null` 을 돌릴 때 한 번 경고를 남긴다(또는 그 상태를 잡는 테스트를 둔다).
    조용한 강등이 이 건의 본질이다.

---

## 기각 6. ✅ 반장전 서입 58% — 하네스(페르소나 봇) 탓이다

- 실제 **서버 리플레이** 263판(`/Users/skul/majak/replays/*.jsonl`):
  `tsx qa-lab/verify-disrupt/r6_real_replays.ts`
  ```
  리플레이 263판 (mode 표기: hanchan 32 / tonpuu 189 / 미표기 42)
  반장전 전체:        32판  동에서 끝 10 · 남까지 22 · 서입 0 (0.0%)  평균 8.3국
  반장전 · 사람이 낀 판: 32판                       서입 0 (0.0%)
  동풍전 전체(=남입):  189판  동에서 끝 185 · 남까지 4 (2.1%)        평균 4.4국
  ```
  ⚠ `RoundSettled` 의 `prevalentWind`/`roundNumber` 는 **다음 국의 값**이다
  ([`standardActions.ts:1108-1126`](../../packages/core/src/mahjong/flow/standardActions.ts#L1108)) —
  그대로 최대값을 취하면 남4국에서 끝난 판이 전부 "서입"으로 잡힌다(그렇게 세면 서입 27판/10.3%).
  스크립트는 **끝에서 두 번째** settle 의 값을 "실제로 친 마지막 국의 장풍"으로 쓴다.
- 실제 **BotAgent**(페르소나 하네스가 아니라 제품 봇) 완주:
  `tsx qa-lab/verify-disrupt/r67_endreason.ts 60 hanchan aug|noaug`
  ```
  모드=hanchan 증강=있음 판수=60
    dobi                   26  43.3%
    normal                 23  38.3%
    agariYame               9  15.0%
    westEntryDecided        1   1.7%      ← 58% 가 아니다
    instantWin              1   1.7%
    평균 국 수 9.83  (최소 3 / 최대 18)

  모드=hanchan 증강=없음 판수=60
    normal                 39  65.0%
    dobi                   15  25.0%
    agariYame               6  10.0%
    westEntryDecided        0   0.0%
    평균 국 수 10.65 (최소 2 / 최대 18)
  ```
  증강을 켜도 서입은 **1/60(1.7%)** 이다. 오히려 증강판에서 늘어난 것은 **도비**다
  (25.0% → 43.3%) — 뱅크 발행·큰 이동이 있는 증강판은 남4국 전에 누군가 마이너스로
  떨어져 **끝나 버려서** 서입 판정까지 가지 않는다. 하네스의 58%와 정반대 방향이다.
- 판정: `cross` 의심 2의 58%는 **하네스의 페르소나(특히 `folder`)가 화료를 거의 못 하는** 데서 온
  값이다. 제품 봇과 실제 대국 모두에서 재현되지 않는다. 밸런스 결론을 그 숫자 위에 세우면 안 된다.

---

## 7. ⚖ 동풍전 `eastFourth` 드래프트 — **결함 아님**, 다만 비대칭은 사실이다 (판단 요청)

- 사실 관계: [`hanchanConfigForMode`](../../packages/core/src/match/HanchanController.ts#L196) 가
  동풍전에 `[gameStart, eastThird, eastFourth]` 를 준다. `eastFourth` 트리거는
  [`MID_DRAFT_TRIGGER`](../../packages/core/src/match/HanchanController.ts#L304)
  `prevalentWind === 1 && roundNumber === 4` — **동4국에 진입할 때** 열린다.
  반장전의 마지막 스테이지 `southThird` 는 남3국 진입이라 남3·남4 두 국이 남는다.
- **0국은 구조적으로 불가능하다.** 드래프트는 그 국의 `sys.startRound` **전에** 열리므로
  ([`HanchanController.ts:918-931`](../../packages/core/src/match/HanchanController.ts#L918)),
  집은 증강은 최소한 그 국 하나를 온전히 탄다. 아가리야메·도비는 **그 국을 친 뒤** 판정이므로
  "한 순도 못 쓰고 끝난다"는 성립하지 않는다.
- **실측(제품 봇 완주)**: `tsx qa-lab/verify-disrupt/r67_endreason.ts <판수> <모드> aug`
  — "마지막 드래프트가 끝난 뒤 **실제로 더 친 국 수**"
  ```
  동풍전(eastFourth)  30판: 평균 1.52국   0국 0판 · 1국뿐인 판 17/27 (63%)
  반장전(southThird)  60판: 평균 2.81국   0국 0판 · 1국뿐인 판  6/42 (14%)
  ```
  (동풍전은 남입(`westEntry: true`, [`:200`](../../packages/core/src/match/HanchanController.ts#L200))이
  있어 1.52국까지 늘어난다 — 그게 없으면 사실상 1국 고정이다.)
  즉 비대칭은 실측으로도 **1.52국 대 2.81국, 약 1.8배**다.
- 판정: 결함이 아니다(잃어버리는 국이 없다). 남는 것은 **밸런스 비대칭** — 동풍전 3번째 카드의
  기대 사용 국 수가 반장전 마지막 카드보다 짧다. 고칠지 말지는 사용자의 설계 판단이다.
  고친다면 손대는 곳은 `hanchanConfigForMode`(동풍전 스케줄을 `eastFourth` 대신 더 이른 국으로)
  또는 `MID_DRAFT_TRIGGER`(트리거 국 변경) 한 곳이다.

---

## 만든 것

| 파일 | 하는 일 |
|---|---|
| `qa-lab/verify-disrupt/r1_seatswap_discardlock.ts` | 확정 1 — `lockedDiscardIds` 타임라인 (`swap|noswap` × `seat_swap|full_hand_swap`) |
| `qa-lab/verify-disrupt/r2_push_brand_persist.ts` | 확정 2 — 정산·드래프트 구간의 낙인 채널·뷰 |
| `qa-lab/verify-disrupt/r3_preset_grant.ts` | 3a/3b — 사전 지급의 중복·상호배제 (`<시드수> [증강] [rev]`) |
| `qa-lab/verify-disrupt/conflict_degree.ts` | 상호 배제 관계 차수 표 (프로브 대상 고르기용) |
| `qa-lab/verify-disrupt/r4_six_turns.ts` | 기각 4 — 6순 창의 실제 바퀴 수 |
| `qa-lab/verify-disrupt/r5_pool_cliff.ts` | 확정 5 — 카탈로그 K종 제거 시 중복 방지 절벽 |
| `qa-lab/verify-disrupt/r6_real_replays.ts` | 기각 6 — 실제 서버 리플레이 종국 분포 |
| `qa-lab/verify-disrupt/r67_endreason.ts` | 기각 6 · 7 — 실제 BotAgent 완주 종국 분포 + 마지막 드래프트 이후 국 수 |
| `qa-lab/verify-disrupt/dbg.ts` | (작업용) 뷰 채널 탐침 |
