# 방해(disrupt) 8종 — 괴롭히는 사람 (disrupt-a)

담당: `pseudo_dealer` · `scapegoat` · `hidden_river` · `discard_lock` ·
`seat_swap` · `parasite` · `time_stop` · `rank_gate`

## 요약

- 돌린 판: **약 490국**(반장전·동풍전 혼합, 게임 70여 판)
  - 통합 스윕 `run.ts` 147국+ (프리셋 10종 × 페르소나 3종: 전원 masher / 전원 stall+folder / 전원 caller)
  - 최초 스윕(중단, 로그 확인) 약 250국 (프리셋 12종 × 페르소나 5종)
  - 횟수 규약 감사 `probe_uses.ts` 36국 (8종 전부를 네 사람 모두에게 지급)
  - `time_stop` 전용 50국, `hidden_river` 뷰 검증 1게임(검사 5,648회), 결정론 재현 5건
- 증강 커버리지: **8/8 전부 실제 발동 확인** (probe_uses 집계로 발동 횟수까지 계측)
- 결과: **확정 2건 · 의심 1건**. 크래시 0, 훅 예외(`effectErrors`) 0, 소프트락 0,
  점수 총합 드리프트 0, 패 중복/유실 0, 자리 순열 깨짐 0.

페르소나는 지시대로 극단으로 굴렸다 — 전원 masher(증강 무조건 발동), 전원 stall+folder
(화료를 미루고 접기만), 전원 caller(울기·깡 중독). 소프트락을 노려 `discard_lock`을
네 사람 모두에게 주고 folder만 돌린 판도 포함했다.

---

## 확정 1. 🟠 discard_lock — 보유자가 "봉인된 실제 패"를 볼 수 없다 (채널 이름 변경으로 코어 경로가 끊김)

- 위치:
  - 발행: [packages/content/src/augments/discard_lock.ts:90](../../packages/content/src/augments/discard_lock.ts#L90)
    — `roundViewKey(holder, "discardLockReveal:{target}")`
  - 소비(끊긴 곳): [packages/core/src/information/PlayerView.ts:625](../../packages/core/src/information/PlayerView.ts#L625)
    — `if (!key.startsWith("revealTiles:") ...) continue;`
  - 화면: [packages/client/src/App.tsx:13771](../../packages/client/src/App.tsx#L13771)
    — `view.augmentView["discardLockReveal:{pid}"]`의 tileId를 `view.tiles[id]`로 옮긴다
- 기대: description/detail — **"나는 각 상대의 봉인된 실제 패를 그대로 확인한다"**,
  헤더 주석 — "`discardLockReveal:*` 채널로 특정 tile id만 노출". 클라 주석도
  "실제 패, **적도라까지 그대로**"라고 적혀 있다.
- 실제: 코어 `buildPlayerView`의 '실제 패 공개' 루프는 채널 이름이 `revealTiles:`로
  **시작할 때만** 그 tileId의 메타데이터를 `tiles`에 얹는다. 2026-08 감사에서
  `hand_swap3`와의 키 충돌을 피하려고 봉인술사 채널을 `revealTiles:{target}` →
  `discardLockReveal:{target}`으로 바꿨는데(docs/22 §12-20), **코어의 이 판정은 같이
  바뀌지 않았다.** 그래서 채널에 실린 tileId가 `view.tiles`에 하나도 없고, 클라이언트의
  `sealedPeekOf`는 tiles가 비어 폴백(`sealed:{pid}` = kindKey 2개)으로 떨어진다.
  보유자는 **"어떤 2종류가 잠겼는지"만** 보고, 몇 장인지도 적도라인지도 못 본다.
- 재현: `tsx qa-lab/disrupt-a/repro_discard_lock_reveal.ts` (seed=3, 동풍전,
  `preset={p0:["discard_lock"]}`)
  ```
  보유자 뷰의 봉인 채널:
    discardLockReveal:p1: tileId 2장 → view.tiles에 실린 것 0장
    discardLockReveal:p2: tileId 2장 → view.tiles에 실린 것 0장
    discardLockReveal:p3: tileId 3장 → view.tiles에 실린 것 0장
    폴백 채널(종류만): [["sealed:p1",["sou5","man3"]],["sealed:p2",["man1","man7"]],["sealed:p3",["sou5","man4"]]]
    revealTiles 채널: []
  ```
  (비교군: `revealTiles:` 규약을 그대로 쓰는 `hand_swap3`·`future_sight`·`brief_fog`는
  같은 루프를 타고 정상 노출된다 — 규약 자체는 살아 있고 봉인술사만 빠졌다.)
- 영향: 게임은 죽지 않고 봉인 **판정**도 정상이다(`discard.blockedTileIds`는
  augmentData를 직접 읽으므로 뷰와 무관). 깨진 것은 **설명이 약속한 보유자 전용 정보**다 —
  prism 티어 증강의 정보 이득 절반이 조용히 사라졌고, 화면에는 아무 오류도 안 뜬다.

## 확정 2. 🟡 parasite — 내가 숙주에게 쏜 방총의 절반이 그대로 돌아온다 (설명에 없는 방어 효과)

- 위치: [packages/content/src/augments/parasite.ts:94-113](../../packages/content/src/augments/parasite.ts#L94)
  (`SETTLE_STAGE.Transfer` 인터셉터), 설명 [:79-82](../../packages/content/src/augments/parasite.ts#L79)
- 기대: description — "그 국 정산에서 **숙주가 얻는 점수의 절반**을 대신 가져온다",
  detail — "숙주가 **잃는** 국에는 아무 영향이 없고 테이블 총점도 변하지 않는다".
  읽는 사람은 "남이 벌면 빨아먹는 순수 공격형"으로 읽는다.
- 실제: 인터셉터는 숙주의 delta가 양수이기만 하면 절반을 가져오는데, **그 양수가
  보유자 자신이 쏜 론 점수일 때도 똑같이 작동한다.** 즉 기생 대상에게 방총하면
  지불액이 그 자리에서 반으로 줄어든다. 봇 정책이 "리치를 걸었거나 위협적인 상대"를
  숙주로 고르므로([parasite.ts:139-158](../../packages/content/src/augments/parasite.ts#L139)),
  **가장 방총하기 쉬운 상대에게 자동으로 50% 방총 보험이 걸린다.**
- 재현: `tsx qa-lab/disrupt-a/repro_parasite_math.ts` — seed=11, 동풍전,
  `preset={p0:["parasite"]}`, `presetHands={p1: 탕야오·삼색 텐파이 14장}`.
  p1이 p0의 버림을 론(8000):
  ```
  대조군   deltas={"p0":-8000,"p1":8000,"p2":0,"p3":0} 합=0
  기생 →p1 deltas={"p0":-4000,"p1":4000,"p2":0,"p3":0} 합=0  augPoints=[{player:"p0",augId:"parasite",points:4000}]
  기생 →p2 deltas={"p0":-8000,"p1":8000,"p2":0,"p3":0} 합=0   (숙주가 안 벌면 무효 — 정상)
  ```
- 영향: 점수 총합은 보존되고 크래시도 없다(**설명과 다르다**가 전부다). 다만 체감은
  크다 — 만관 방총이 반값이 되는 상시 방어 효과가 "국마다 1회 지목"만으로 붙는데,
  설명 어디에도 그런 말이 없다. 밸런싱(파워 티어) 산정에도 안 들어가 있을 것이다.

---

## 의심 1. seat_swap × discard_lock — 자리 바꿈이 봉인을 통째로 증발시킨다 (재현은 됐으나 영향 판정 보류)

- 위치: [discard_lock.ts:246-257](../../packages/content/src/augments/discard_lock.ts#L246)
  (봉인은 **tileId 고정**) × [seat_swap.ts:191-201](../../packages/content/src/augments/seat_swap.ts#L191)
  (손패를 **통째로** 교환)
- 논리: 봉인 목록은 `sealTilesKey(holder, target)`에 **대상 playerId 기준**으로 저장되고,
  `discard.blockedTileIds` 모디파이어는 `hand.includes(id)`로 걸러진다
  ([helpers.ts:353-359](../../packages/core/src/mahjong/flow/helpers.ts#L353)).
  자리 바꿈으로 대상의 손패가 통째로 다른 사람에게 넘어가면 그 tileId들이 대상 손에서
  사라져 **봉인이 아무에게도 걸리지 않는다**(넘겨받은 쪽에도 안 걸린다 — 키가 사람 기준이므로).
- 재현 실패 사유: 논리적으로는 확실하지만, `seat_swap`은 "내가 아직 한 장도 버리지
  않은 내 순"에만 열리고 `discard_lock`도 "국 첫 행동"에만 열려 **두 창이 거의 겹치지
  않는다**. 490국 스윕에서 봉인이 걸린 상대를 그 국에 자리 바꿈으로 지목한 표본이
  잡히지 않았다(전용 강제 시나리오를 짜지 못해 확정으로 올리지 않는다).
- 참고: 실제로 관측된 것은 이쪽이 아니라 **봉인이 손패 전체를 덮는 경우**였다
  (`SEAL_ALL_HAND: p3 hand=4 allSealed by p1`, 후로 3개로 손이 4장까지 줄어든 자리).
  이건 `lockedDiscardIds`의 "전부 잠겼으면 전부 허용" 예외가 잡아 주므로 소프트락이
  아니다 — 대신 그 순간 **봉인이 통째로 무효가 된다**(설계된 동작, 코드 주석에 명시).

---

## 정상 확인 (같은 것을 다시 파지 않도록 남긴다)

브리핑이 지목한 노림수 전부를 검사했고, 아래는 **깨지지 않았다**.

| 노린 것 | 결과 |
|---|---|
| 자기 자신 지목 | 4종(`scapegoat`·`parasite`·`rank_gate`·`seat_swap`) 전부 `validate`에서 차단, `holderTurnOptions`도 자기 자신을 후보에서 뺀다. 490국 0건 |
| 이미 나간 사람 지목 | 토비는 **그 자리에서 종국**이라(HanchanController) 판에 남은 탈락자 자체가 없다. 마이너스 대상 지목은 docs/25 방해 #20으로 기보고 |
| 지목이 국/장을 넘어 남는가 | 4종 전부 `roundKey(장-국-본장)` 스코프. 국번은 장 안에서 단조증가하고 본장은 비연장 화료에만 0으로 돌아가므로 **roundKey 충돌 없음**. 뷰 채널도 `roundViewKey`(엔진이 국 경계에서 제거) 또는 `ROUND_STARTED` 리액션으로 내려간다. `rank_gate`의 공개 채널만 고정 키인데, 값 안에 `round`가 들어 있고 클라가 `mark.round !== roundKeyStr`로 거른다([App.tsx:17135](../../packages/client/src/App.tsx#L17135)) — 새지 않는다 |
| 대상이 오야가 바뀌어도 유지되는가 | 지목 키는 전부 playerId 기준이라 `pseudo_dealer`·`seat_swap`으로 자리·오야가 바뀌어도 그대로 따라간다 (의도) |
| pseudo_dealer가 rotationSeat·연장·오라스를 깨는가 | **안 깨진다.** `advanceRound`가 `rotationSeat` 기준으로 돌고(standardActions.ts:830), 연장은 `dealerSeat` 기준으로 판정되며, 아가리야메는 **정산 후** `dealerSeat`의 점수를 본다(HanchanController.ts:286). 490국에서 `PSEUDO_ROTATION_BROKEN`·`PSEUDO_DEALER_ROT_MISMATCH` 0건. (`turnCount` 경계가 밀리는 건은 docs/25 국면 #17로 기보고) |
| discard_lock 소프트락 | **구조적으로 불가능.** 봉인은 최대 2종 × 4장 = 8장인데 손패는 최소 4장(후로 3개)이라 전부 잠길 수는 있지만, `lockedDiscardIds`가 "전부 잠겼으면 전부 허용"으로 잡는다. 리치 중에도 예외로 빠진다. 전원 folder·전원 discard_lock 판 포함 490국에서 `EMPTY_OPTIONS`·타임아웃·`Turn player has no legal actions` **0건** |
| time_stop이 턴 순서를 깨는가 | 50국 200선언 계측: 추가 턴 172회, **선언보다 많은 추가 턴 0건**, 한 국에 2회 선언 0건. 못 받은 28건은 전부 "국이 먼저 끝났거나 버림이 울렸다" — detail이 말한 미룸 동작대로다. (사풍연타 판정 건은 docs/25 방해 #9로 기보고) |
| time_stop × 리치 일발 | 추가 턴의 두 번째 버림이 `TILE_DISCARDED`의 `else if` 가지를 타 일발이 정상 소멸한다(flowEvents.ts:494-499). 보유자가 일발을 두 번 갖는 경로 없음 |
| rank_gate의 잠금(locked)이 규칙과 일치하는가 | **일치한다.** `repro_rank_gate_gate.ts`: 4판 손을 든 지목 대상에게 `win`이 옵션에서 빠지고 `locked=[{type:"win",reason:"minHan",minHan:5}]`가 정확히 뜬다. 같은 사람이 지화(역만)로는 그대로 화료 — detail의 "역만은 면제" 그대로 |
| 두 방해가 같은 대상에 겹칠 때 | `mark` 프리셋(네 사람이 scapegoat/parasite/rank_gate/discard_lock을 둘씩, 같은 대상에 겹치도록) 및 `all4`(한 사람이 8종 전부) 프리셋에서 크래시·총합 드리프트·불변식 위반 0건. 정산 단계는 Redistribute(100) → Transfer(400)로 갈려 있어 덤터기·기생이 겹쳐도 총합이 보존된다 |
| scapegoat 수치 | `repro_scapegoat_math.ts`: 대조군 `{p0:+48000, 나머지 각 −16000}` → 지목군 `{p0:+48000, 지목 −48000, 나머지 0}`. **보유자 수령액 불변·총합 불변** 그대로 |
| 횟수 규약 | 36국 전수 계측 0건 위반 — `time_stop`/`scapegoat`/`parasite`/`rank_gate` 국당 1회, `discard_lock`·`pseudo_dealer` 2국당 1회, `hidden_river` 동풍 1·반장 2회, `seat_swap` 동풍 2·반장 3회 + 국당 1회 |
| hidden_river 가시성 | `probe_fog.ts` 뷰 5,648회 검사 0건 위반 — 선언 전 전원 전체 공개 / 선언 후 비보유자는 각 바닥 뒤 6장만(`shown+hidden === 실제`) / 보유자와 바닥 주인은 전부 열람 / 국이 끝나면 걷힘 |

## 파일

```
qa-lab/disrupt-a/
  h.ts                            공용 하네스 사본(다른 QA가 원본을 고치는 중이라 고정본)
  inv.ts                          도메인 불변식 (자리 순열·지목 정합·봉인·armed 누수)
  run.ts                          통합 스윕 (상태 + 이벤트/정산 불변식)  tsx run.ts 1 3
  evrun.ts                        이벤트 로그 러너
  probe_uses.ts                   횟수 규약 전수 감사
  probe_fog.ts                    hidden_river 뷰 수준 검증
  probe_timestop.ts / _timestop2  time_stop 추가 턴 계측
  repro_discard_lock_reveal.ts    ← 확정 1
  repro_parasite_math.ts          ← 확정 2
  repro_scapegoat_math.ts         정상 확인
  repro_rank_gate_gate.ts         정상 확인
  repro_rank_gate_badge.ts        정상 확인(국 시작마다 뱃지 null)
  repro_pseudo_dealer_turncount.ts  기보고 건(docs/25 #17) 재확인용
```
