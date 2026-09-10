# 처음 온 사람이 지나는 길 (튜토리얼 · 게스트 체험 · 랜딩 · 규칙 도움말) — onboard

## 요약

**돌린 판**: 튜토리얼 방 대본 완주 40판(`tutorialRun.ts`) + 대본 이탈 프로브 40판
(`tutorialAbort.ts`) + 홀드 경합 계측 9판/23 홀드 구간(`holdRace.ts`, 지연 0ms·60ms)
+ 2국 배패 확인 1판(`afterQuit.ts`) + 쿠이카에 봉인 재현 1판(`kuikaeSeal.ts`).
브라우저 자동화는 쓰지 않았다(지시대로).

**커버리지**: 튜토리얼 대본 전 강의 정독 + 실제 방 완주 통계, `tutorialHold` 경합,
게스트 체험(`guestPlay`·`guestResume`·`GuestOutro`), 랜딩, 규칙·도움말 4탭
(기본·역 목록·용어·증강), 이번 라운드 신규 규칙 2건(쿠이카에 금지 · 유국만관 본장).

**확정 4건 · 의심 5건.**

| # | 심각도 | 한 줄 |
|---|---|---|
| 확정 1 | 🟠 | 쿠이카에 금지가 화면에서 «봉인»으로 둔갑 — 「누군가 내 패 2장을 봉인했습니다」 거짓 배너 |
| 확정 2 | 🟠 | `tutorialHold`가 봇의 이번 한 순을 못 막는다 — 기준선 문서의 그 플레이크, 원인·수정안 확정 |
| 확정 3 | 🟠 | 도움말 «판은 언제 끝나는가»가 거짓 — 서든데스(서입·남입)도 토비도 없다고 말한다 |
| 확정 4 | 🟡 | 「그만 보기」가 남기는 판은 대국이 아니다 — 매 국 똑같은 배패, 안내 없음 |

**1차 시도의 «확정 2»(도움말에 쿠이카에가 없다)는 그 사이 고쳐졌다 — 취소한다.**

**덜 본 범위**: 튜토리얼 강의의 **화면 좌표 판정**(`placeBubble`·`rectOf`·딤 링) —
DOM이 필요해 브라우저 없이는 못 잰다. 도움말 «증강이란» 탭의 개별 증강 문안(다른 담당자
영역과 겹친다). 의심 3(도중유국)의 사유 좁히기.

- 코드 정독: `packages/client/src/tutorial.ts`(전체 1057줄), `packages/client/src/glossary.ts`,
  `App.tsx`의 규칙·도움말(`HELP_BASICS`·`HELP_YAKU`·`helpAugmentSections`·`HelpScreen`)·랜딩·게스트 경로,
  `packages/server/src/RoomManager.ts`의 `TUTORIAL_*`·`guestPlay`·`guestResume`,
  `packages/server/src/BotAgent.ts`의 `waitWhileHeld`·`feedKinds`,
  `packages/core/src/mahjong/flow/helpers.ts`의 `kuikaeForbiddenIds`·`lockedDiscardIds`,
  `packages/core/src/information/PlayerView.ts`의 `sealedTileIds`.
- 대조: `standardYakuList`(45종) ↔ 도움말 «역 목록» 전수 대조 (`yakuCheck.ts`).

---

## 확정 1. 🟠 쿠이카에 금지가 화면에서 «봉인»으로 둔갑한다 — 「누군가 내 패 2장을 봉인했습니다」 거짓 배너

- 위치:
  - `packages/core/src/information/PlayerView.ts:881` — `sealedTileIds = [...lockedDiscardIds(...)]`
  - `packages/core/src/mahjong/flow/helpers.ts:425-427` — `lockedDiscardIds`가 쿠이카에 금지패를 **봉인 집합에 합친다**
  - `packages/client/src/App.tsx:290` — `SEAL_HINT = "🔒 봉인된 패 — 이번 국 동안 버릴 수 없습니다"`
  - `packages/client/src/App.tsx:5266-5282` — `sealedNow > shown.sealed` → 배너 «봉 인 / 누군가 내 패 N장을 봉인했습니다»
- 기대: 쿠이카에는 **표준 룰**이고 «방금 운 그 한 순」만 막는다. 남이 건 증강이 아니고 국 내내도 아니다.
  `helpers.ts:425` 주석도 "쿠이카에는 봉인과 근거가 다르지만(증강이 아니라 **표준 룰**)"이라고 스스로 적어 두었다.
- 실제: 같은 집합에 합쳐지는 바람에 클라이언트는 둘을 구분할 방법이 **없다**. 치·펑 직후 그 패에
  🔒 배지가 붙고, 눌러 보면 「봉인된 패 — 이번 국 동안 버릴 수 없습니다」(둘 다 거짓),
  거기에 화면 배너로 「누군가 내 패 2장을 봉인했습니다」가 흔들리며 뜬다 —
  **아무도 아무것도 안 했고 자기가 방금 친 것이다.** 증강이 하나도 없는 판에서도 뜬다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/onboard/kuikaeSeal.ts`
  ```
  증강 보유: p0:0 p1:0 p2:0 p3:0
  치 직후 잠긴 손패: [ 'man3', 'man6' ]
  PlayerView.sealedTileIds: [ 'man3', 'man6' ]
  → 클라이언트: 🔒 배지 + SEAL_HINT «봉인된 패 — 이번 국 동안 버릴 수 없습니다»
  → 클라이언트: 배너 «누군가 내 패 2 장을 봉인했습니다»  (sealedNow 0 → 2)
  ```
  (45m으로 3m을 치한 직후. 현물 3m + 스지 6m 두 장이 잠긴다 — 쿠이카에 금지가 맞다.
   틀린 것은 **그것을 봉인이라고 부르는 화면**이다.)
- **2026-08-22 재확인 — 여전히 재현된다.** 그리고 그 사이 도움말이 «다음 순부터는 평범하게
  버릴 수 있습니다»라고 새로 적혔으므로, 이제 화면의 두 문장이 서로를 부정한다:
  도움말 «그 순에만» ↔ 패 배지 «이번 국 동안». 도움말이 「버릴 수 없는 패에는 자물쇠가
  걸립니다」라고 자물쇠까지 가리키고 있어서 사람이 반드시 그 배지를 눌러 보게 된다.
- 영향: 처음 온 사람이 처음 울어 본 그 순간에 «누군가 내 패를 봉인했습니다» 라는
  **일어나지 않은 방해 연출**을 본다. 이 게임의 증강 시스템을 배우는 자리에서 증강에 대한
  오해를 심는다. 규칙을 아는 사람에게도 «이번 국 동안»이 거짓이라 다음 순에 그 패를
  버릴 수 있다는 사실을 숨긴다.
- 제안 수정: `PlayerView`에 `sealedTileIds`와 별개로 `kuikaeTileIds`(또는 `lockedReason`)를
  싣고, 클라이언트가 배지 문구를 갈라 쓴다(«🔒 쿠이카에 — 방금 운 몸통과 같은 패는
  이번 순에 버릴 수 없습니다»). 배너(`App.tsx:5271`)는 **봉인 쪽만** 세도록 집합을 뺀다.

## ~~확정 2~~ → **이미 고쳐졌다 (2026-08-22 재확인)**

1차 시도 때 「도움말 어디에도 쿠이카에가 없다」로 적었으나, 그 사이 다른 담당자가 넣었다.
`App.tsx`의 `HELP_BASICS` «울기 — 치 · 퐁 · 깡» 절 셋째 문단이 정확히 설명하고 있고
(`grep -n "쿠이카에" packages/client/src/App.tsx` → 8955행 1건),
**구현과도 정확히 맞는다** — 예문 「4만5만으로 3만을 치했다면 손에 있는 3만도, 반대쪽
6만도 그 순에는」이 `kuikaeForbiddenIds`(현물 + 슌쯔 반대쪽 바깥 한 장, `chi`/`pon`만,
깡 제외, `turn.act` + `lastDrawnTile===null && lastDiscard===null` = 그 한 순)와 일치한다.
**이 항목은 취소한다.** 다만 용어 설명집(`glossary.ts`)에는 아직 «쿠이카에» 항목이 없어
도움말 본문의 그 낱말에 밑줄이 안 붙는다 — 아래 «의심 1»로 내린다.

---

## 확정 2. 🟠 `tutorialHold`는 봇의 **이번 한 순을 못 막는다** — 코치가 말하는 동안 판이 한 칸씩 새 나간다 (알려진 플레이크의 원인)

- 위치:
  - `packages/server/src/BotAgent.ts:439-457` — `decide()`
  - `packages/server/src/BotAgent.ts:346-351` — `waitWhileHeld()`
  - `packages/server/src/RoomManager.ts:2032-2038` — `case "tutorialHold"`
  - `packages/client/src/App.tsx:5697-5717` — `cbCoachHold`
  - 증상 기록: `docs/23_TEST_BASELINE.md` — `Tutorial.test.ts > 대본대로 두면 …` 가
    단독 실행에서도 master 1/8 · 작업 브랜치 1/5로 진다("고치려면 hold가 닿았음을 확인한 뒤
    진행하게 만들어야 한다(별도 작업)").

- 기대: `TUTORIAL_HOLD_NOTE`가 약속하는 것 — "클라이언트가 말풍선을 띄우는 동안
  `tutorialHold`를 보내고, 그 사이 봇은 결정을 **내지 않고 들고 있는다**".

- 실제 (원인, 코드 한 줄로 짚는다):

  ```ts
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const chosen = this.decideSafely(prompt);
    await this.waitWhileHeld();          // ← 홀드 검사는 여기 한 번뿐이다
    if (this.thinkMs > 0 && ...) {
      await this.think(ms);              // ← 1000ms 를 잔다 (BOT_THINK_MS, 배포 기본값)
    }
    return chosen;                       // ← 자는 사이에 켜진 홀드는 **아무 힘이 없다**
  }
  ```

  홀드 신호가 서버에 닿을 수 있는 유일한 창은 «서버가 새 view 를 내보낸 순간 ~ 봇의
  `decide()`가 첫 줄을 실행하는 순간» 사이 **몇 밀리초**다. 그런데 클라이언트는 그
  view 를 받아서 **렌더하고 강의를 고른 뒤에야** 홀드를 보낸다(`cbCoachHold`는
  강의가 바뀔 때만 부른다). 즉 홀드는 구조적으로 **항상 늦게** 도착하고, 늦게
  도착한 홀드는 이미 `waitWhileHeld`를 통과해 잠들어 있는 봇을 붙들지 못한다.
  봇은 1초 뒤 깨어나 **말풍선이 떠 있는 한가운데서 한 장을 버린다**.

  드래프트 경로(`BotAgent.ts:775`)와 국 사이 붙들기(`holdBetweenRounds`)도 같은 신호를
  읽으므로 같은 창을 가진다.

- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/onboard/holdRace.ts 5 60`
  (사람이 한 수 둔 뒤 60ms — RTT+렌더 흉내 — 만에 `hold:true`를 보내고 3초를 읽는 척한다.
   그 3초 동안 봇이 버리면 샌 것이다.)
  ```
  === 5판 · 지연 60ms ===
  홀드 구간 14개 중 샌 구간 7개 (봇 버림 7장)
    run#0 turn#0: 홀드 중 봇 버림 1장
    run#0 turn#1: 홀드 중 봇 버림 1장
    ...
  ```
  **지연 0ms(= 도달 불가능한 이상적 클라이언트)로 낮춰도 그대로 샌다** —
  `tsx qa-lab/round2/onboard/holdRace.ts 4 0` → `홀드 구간 9개 중 샌 구간 5개`.
  네트워크 지연 문제가 아니라 **검사 지점의 순서** 문제라는 증거다.

  샌 구간마다 정확히 **1장**이다 — "봇의 한 순"이 그대로 새는 모양이고,
  기준선 문서가 적어 둔 증상(리치 전에 봇이 오름패를 흘려 그냥 화료)과 같은 사건이다.

- 영향: 코치가 "이것을 누르세요"라고 가리키는 동안 판이 한 칸 움직인다 — 가리키던
  것이 사라지고(2026-08-18 사용자 보고의 바로 그 증상), 최악의 경우 **리치를 걸기 전에
  봇이 오름패를 흘려** 대본의 결승선(리치 → 론)이 통째로 사라진다. 배포 위험도는
  «처음 온 사람이 튜토리얼에서 겪는 확률적 이탈»이다.

- 제안 수정 (설계 수준 — 셋 다 같은 방향: **홀드가 닿았음을 확인한 뒤 진행한다**):

  1. **최소 수정 (즉효, 프로토콜 무변경)** — `decide()`에서 생각 시간 **뒤에도** 한 번 더
     묻는다.
     ```ts
     const chosen = this.decideSafely(prompt);
     await this.waitWhileHeld();
     if (this.thinkMs > 0 && chosen.type !== "pass") await this.think(ms);
     await this.waitWhileHeld();   // ← 자는 사이에 켜진 홀드를 여기서 받는다
     return chosen;
     ```
     `think()`는 `cancelDecision()`으로 깨울 수 있으므로 리액션 경합의 죽은 시간은
     그대로 없다. 창이 «몇 ms» → «thinkMs(1000ms)»로 넓어져 실제 RTT+렌더를 덮는다.
     다만 **보장은 아니다**(느린 기기·긴 렌더에서는 여전히 샌다).

  2. **권장 — 튜토리얼 방은 «답 없는 화면»이 있으면 봇을 세운다 (서버 한쪽만 고침).**
     view 를 튜토리얼 좌석에 내보낼 때마다 서버가 스스로
     `room.tutorialHoldUntil = max(현재값, now + TUTORIAL_HOLD_GRACE_MS)` (예: 700ms)를
     건다. 클라이언트의 `hold:true`는 종전대로 3분 시한으로 **연장**하고,
     `hold:false`는 0으로 지우는 대신 **유예 끝까지로 깎는다**
     (`room.tutorialHoldUntil = min(room.tutorialHoldUntil, graceEnd)`).
     그러면 «새 화면이 나간 직후 유예 안»은 봇이 구조적으로 못 움직이고, 그 유예가
     곧 클라이언트가 답할 시간이 된다. 프로토콜·클라이언트 무변경, 손대는 곳은
     view 송신 지점 한 곳과 `case "tutorialHold"` 한 줄이다.

  3. **완전판 (닿았음을 확인한다)** — view 에 단조 증가 `seq`를 붙이고,
     튜토리얼 클라이언트가 `tutorialHold { hold, forSeq }`로 답한다. 방은
     `holdAckedSeq`를 들고, 봇은 `holdAckedSeq >= 마지막으로 내보낸 seq` 가 될 때까지
     (그리고 그 답이 `hold:true`면 계속) 기다린다. 답이 영영 안 오면 기존
     `TUTORIAL_HOLD_TTL_MS`/`HOLD_MAX_MS`가 그대로 그물이다. 이것이 기준선 문서가
     말한 "hold가 **닿았음을 확인한 뒤** 진행"의 문자 그대로의 구현이고,
     `Tutorial.test.ts`의 플레이크도 이 방식에서만 0이 된다.

  어느 쪽을 택하든 **1번은 함께 넣는 것이 맞다** — 생각 시간 뒤 재검사가 없으면
  2·3번의 유예/ack 가 늦게 도착했을 때 다시 같은 구멍이 열린다.

---

## 확정 3. 🟠 규칙 도움말 «판은 언제 끝나는가»가 **거짓이다** — 서든데스(서입·남입)도 토비도 없다고 말한다

- 위치: `packages/client/src/App.tsx:8986-8991` (`HELP_BASICS` «판은 언제 끝나는가»)
  ```
  "동1국부터 시작합니다. 반장전은 남4국까지, 동풍전은 동4국까지 갑니다. …"
  "마지막 국이 끝나면 점수 순으로 1~4위가 정해집니다."
  ```
- 기대: 이 화면은 «리치마작 기본»이고, "판이 언제 끝나는가"만 따로 절을 받고 있다.
  적힌 두 문장이 판의 종료 조건 전부여야 한다.
- 실제: 구현은 **둘 다 아니다**.
  - `HanchanController.ts:196-208 hanchanConfigForMode` — `westEntry: true`가 **두 모드 모두** 켜져 있다.
    `shouldEnd`(1785-1819)가 정규 구간(반장=남장, 동풍=동장)이 끝난 뒤 1위가
    `returnScore`(30000) 미만이면 **장을 하나 더 붙인다** — 반장전은 서장, 동풍전은 남장.
    즉 "남4국까지"·"동4국까지"는 1위가 30000에 못 미치는 흔한 판에서 그대로 깨진다.
  - `HanchanController.ts:171 dobi: true` / `1158-1161` — 누군가 0점 아래로 떨어지면
    **그 자리에서 끝난다**(토비). 도움말에는 한 글자도 없다.
- **같은 저장소가 이미 이 문장을 거짓이라고 적어 두었다.** `App.tsx:294-296`
  (`maxWindOf` 주석) — "로비가 «남4국까지»라고 단언했던 근거가 여기서 깨진다",
  `App.tsx:11441-11444` — "서든데스를 적어 둔다 — westEntry가 두 모드 모두 켜져 있어
  «남4국까지»는 거짓이었다. 오라스라 믿고 짠 순위 계산이 통째로 틀어진다."
  **로비 모드 설명은 고쳤는데 규칙 도움말은 그대로 남았다.**
- 재현: `grep -n "동1국부터 시작합니다" packages/client/src/App.tsx` (→ 8989) ↔
  `grep -n "westEntry: true" packages/core/src/match/HanchanController.ts` (→ 173·201·208),
  `grep -n "dobi: true" …` (→ 171).
- 영향: 규칙을 배우러 온 사람이 «오라스»를 잘못 잡는다. 로비 툴팁이 스스로 적어 둔
  대로 "오라스라 믿고 짠 순위 계산이 통째로 틀어진다" — 마지막 국이라 믿고 지른
  수가 마지막 국이 아니었거나, 반대로 토비로 갑자기 끝난다. 화면 안에서 로비
  («동4국 뒤 1위가 30000 미만이면 남장»)와 도움말(«동4국까지»)이 **서로 다른 말**을 한다.
- 제안 수정: 문단 하나를 로비 툴팁과 같은 사실로 맞춘다 — 「정규 구간이 끝나도 1위가
  30000점에 못 미치면 장이 하나 더 붙습니다(서든데스 — 반장전은 서장, 동풍전은 남장.
  그 장에는 증강 획득이 없습니다). 누군가 0점 아래로 떨어지면 그 자리에서 끝납니다(토비).」

---

## 확정 4. 🟡 「그만 보기」가 남기는 판은 **대국이 아니다** — 매 국 똑같은 배패, 화료도 리치도 않는 봇 셋, 그리고 아무 안내도 없다

- 위치:
  - `packages/client/src/App.tsx:6159-6172` — `onFinish`
    ```
    if (completed) returnHome();   // 끝까지 본 사람만 내보낸다
    ```
    바로 위 주석: "튜토리얼 판은 배우려고 고정해 둔 판이라(늘 같은 배패, 화료도 안 하는 봇)
    **그대로 두면 다음 국부터는 배울 것도 없는 이상한 대국이 이어진다.**
    반대로 «그만 보기»는 «안내만 그만»이라는 뜻이므로 판은 그대로 둔다."
  - `packages/server/src/RoomManager.ts:858-870` — `TUTORIAL_HAND` · `TUTORIAL_BOT_RULES`
  - `packages/core/src/match/HanchanController.ts:1013-1029` + `packages/core/src/mahjong/flow/flowEvents.ts:356-361`
    — `deal.presetHand`는 **게임 단위 규칙 모디파이어**라 `ROUND_STARTED`마다 다시 먹는다.
- 기대: 주석이 스스로 "배울 것도 없는 이상한 대국"이라고 규정한 상태를, «그만 보기»를
  누른 사람에게는 **말없이** 남겨 두지 않는다. 최소한 그 판이 연습판이라는 사실은 알려야 한다.
- 실제: 남는 것은 (1) **매 국 똑같은 14장**, (2) `noWin`·`noRiichi` 봇 셋(게임 단위 제약이라
  국이 바뀌어도 그대로), (3) 리치를 걸면 대기패를 쏴 주는 배급(`TUTORIAL_FEED_NOTE`).
  즉 그 사람은 «이제 진짜 판을 두는 중»이라고 믿으면서 **혼자만 이기는 인형극**을 계속한다.
  화면 어디에도 그 사실이 없다. 게다가 `onFinish`가 `TUTORIAL_KEY="1"`을 저장하므로
  "튜토리얼은 이미 봤다"로 기록까지 된다.
- 재현: `~/majak/node_modules/.bin/tsx qa-lab/round2/onboard/afterQuit.ts`
  ```
  1국 배패: man2 man3 man4 man5 man6 man7 pin4 pin5 pin6 pin7 sou1 sou2 sou2 sou9
  1국: 1장 1국 0본장
  1국 결과: draw
  2국: 1장 2국 1본장
  2국 배패: man2 man3 man4 man5 man6 man7 pin4 pin5 pin6 pin7 sou1 sou2 sou2 sou9
  ```
  (2국이 1국과 **한 장도 다르지 않다**.)
- 영향: 처음 온 사람이 "설명은 됐고 그냥 둬 볼게"를 누른 순간부터 가짜 판이다. 배패가
  같다는 것을 눈치채면 게임이 고장 났다고 읽고, 눈치 못 채면 이 게임의 난이도를
  통째로 잘못 배운다. 어느 쪽이든 첫인상이 상한다.
- 제안 수정: 셋 중 하나.
  (a) «그만 보기»도 판을 접고 홈으로 보낸다(문구를 «안내를 끄고 판도 접기»로 정직하게).
  (b) 판은 두되 화면 어딘가에 상시 «연습 판 — 손패가 고정돼 있고 봇은 화료하지 않습니다»
      배지를 세운다(대기실 모드 칩 옆이 자연스럽다).
  (c) «그만 보기» 자리에 두 갈래를 준다: «안내만 끄기» / «판도 접고 나가기».

---

# 의심 (재현은 됐으나 «버그»로 못 박기 전에 판단이 필요한 것)

## 의심 1. 🟡 용어 설명집에 «쿠이카에»가 없다 — 도움말 본문의 그 낱말만 밑줄이 안 붙는다
- 위치: `packages/client/src/glossary.ts` `GLOSSARY`의 call 계열
  (멘젠·후로·치·퐁·깡·안깡·가깡·대명깡·창깡·영상개화 — 쿠이카에만 없다)
- 도움말 «울기» 절은 `TermText`(App.tsx:8038)로 그려지므로 사전에 있는 낱말은 자동으로
  밑줄+툴팁이 붙는다. 「쿠이카에 금지」는 사전에 없어 **그 문단에서만 링크가 끊긴다**.
  게임 중에 자물쇠를 마주친 사람은 도움말을 열기 전에는 그 말을 만날 수 없다.
- 재현: `grep -n "쿠이카에" packages/client/src/glossary.ts` → 0건.
- 제안: `glossary.ts` call 계열에 `key: "kuikae"` 한 항목(+ `match: ["쿠이카에", "먹고 바꾸기"]`).
  확정 1의 배지 문구를 이 용어로 바꾸면 화면에서 눌러 풀이까지 이어진다.

## 의심 2. 🟡 도움말 «완성형은 언제나 같습니다 … 어떤 화료형이든 결국 이 모양입니다»는 거짓이다
- 위치: `packages/client/src/App.tsx:8880-8896` (`HELP_BASICS` «무엇을 하는 게임인가»)
- 같은 도움말의 «역 목록» 탭이 **치또이쯔**(같은 패 2장 × 7)와 **국사무쌍**을 싣고 있고
  둘 다 구현돼 있다(`standardYakuList`). "묶음 4개 + 머리 1개"가 아닌 화료형이 둘 있다.
- 초보용 단순화로 볼 여지가 있어 의심으로 둔다. 다만 «언제나»·«어떤 화료형이든»은
  단정문이고, 치또이로 화료한 사람이 이 문장을 다시 읽으면 규칙 설명을 못 믿게 된다.
- 제안: 「예외는 둘뿐입니다 — 치또이쯔(같은 패 2장 × 7)와 국사무쌍. 역 목록에 있습니다.」 한 줄.

## 의심 3. 🟡 튜토리얼 첫 국이 **도중유국**으로 끝나는 판이 있다 (40판 중 1) — 코치에 그 강의가 없다
- 관측: `tsx qa-lab/round2/onboard/tutorialRun.ts 40` → `1  프롬프트 끊김 @리치(가져온 패) … roundOver=abort`
  (run#19, 사람이 두 수째를 두던 자리에서 국이 통째로 접혔다).
  대본을 벗어나 두는 프로브(`tutorialAbort.ts 40`)에서는 40판 모두 화료로 끝나 재현이 안 됐다 —
  **빈도가 낮아 사유(구종구패/사풍연타 등)를 아직 못 좁혔다.** 그래서 의심이다.
- 튜토리얼 봇 제약은 `noWin`·`noRiichi` 뿐이라 **도중유국 선언은 막혀 있지 않다**
  (`RoomManager.ts:870 TUTORIAL_BOT_RULES`). 처음 온 사람 앞에서 판이 갑자기 접히는데
  `tutorial.ts`에는 유국·도중유국을 설명하는 강의가 하나도 없다(`allowedNow`는 정산 화면에서
  `outro` 말고 전부 막는다).
- 제안: 튜토리얼 방 봇 제약에 «도중유국 선언 금지»를 한 줄 더하거나(`SandboxBotRules`),
  최소한 정산 화면에서 «이번 국은 무효가 됐습니다 — 같은 손으로 다시 시작합니다» 강의를 하나 연다.

## 의심 4. 🟡 튜토리얼에서 **치·퐁을 하면 대본이 끝난다** — 그런데 잠그지도, 되돌리지도 않는다
- 위치: `packages/client/src/tutorial.ts:630-638` (`call` 강의 — `lock` 없음)
- 울면 멘젠이 깨져 **리치를 걸 수 없고**, 배급(`RoomManager.tutorialFeedKinds`)은
  `rs.riichi === null`이면 한 장도 쏘지 않는다. 즉 치 한 번으로 대본의 결승선
  (리치 → 론 → `outro`)이 그 국에서 사라진다. 코치는 그 사실을 말하지 않는다 —
  강의 본문은 "필요 없으면 패스를 누르세요"까지만 적혀 있다.
- 대본 강의 둘(`discard-script`·`aug-script`)에는 `lock`이 있는데 여기만 없다.
- 제안: 튜토리얼 방에서는 `call` 강의에 «지금은 패스» 잠금을 걸거나, 본문에
  «이번 판에서는 리치를 배울 거라 패스를 누르세요» 한 줄을 더한다.

## 의심 5. 🟡 서버가 안 붙었을 때 랜딩의 두 버튼은 **이유 없이** 비활성이다
- 위치: `packages/client/src/App.tsx:7256` `guestOk = serverInfo?.guestPlay !== false && connection === "connected"`,
  7407·7420 `disabled={!guestOk}`
- 두 버튼의 `title`은 연결 상태와 무관한 고정 문구다("화면 보는 법부터 …", "계정 없이 봇 3명과 한 판 —").
  단서는 상태 줄의 «연결 끊김» 칩 하나뿐이고, 그 칩은 화면 맨 위 오른쪽 구석에 있다.
  `serverInfo.guestPlay === false`(운영자가 체험을 껐다)일 때도 같은 화면이라 **두 사유가 구분되지 않는다.**
- 제안: `disabled`일 때 `title`을 사유로 갈아 끼우고(«서버에 연결 중입니다» / «지금은 체험을
  받지 않습니다»), `landing-key-note` 자리에 같은 문장을 한 줄 띄운다.

---

# 검증했으나 문제 없음 (음성 결과 — 다음 라운드가 다시 안 파도 되게 적어 둔다)

- **쿠이카에 금지 — 구현 ↔ 도움말이 정확히 맞는다.**
  `helpers.ts:458-507 kuikaeForbiddenIds` = 현물(치·퐁 모두) + 치로 만든 슌쯔의 **반대쪽
  바깥 한 장**(칸챤 치면 없음), 깡 제외, `turn.act` + `lastDrawnTile===null &&
  lastDiscard===null`(= 울고 아직 안 버린 그 한 순), 규칙 스위치 `call.kuikae`.
  도움말 «울기» 절의 예문(4만5만으로 3만 치 → 3만·6만, 다음 순부터 정상)과 한 치도 안 다르다.
  틀린 것은 그 잠금을 «봉인»이라 부르는 배지·배너뿐이다(확정 1).

- **유국만관에 본장이 붙지 않는다 — 구현이 맞다.**
  `standardActions.ts:1220-1243` — 노텐 벌점 정산 뒤 `calculateScore({han:5, fu:30, …})`
  쯔모 만관 지불만 얹고 `honba`를 어디에도 더하지 않는다. `docs/01_GAME_RULES.md:185-192`의
  단언과 일치. 다음 국으로 본장이 그대로 넘어가는 것도 그대로다.

- **도움말 «역 목록»은 구현 역 45종을 빠짐없이 싣는다.** `qa-lab/round2/onboard/yakuCheck.ts`로
  `standardYakuList` 45종을 `HELP_YAKU` 블록과 대조 — 문자열이 안 걸린 6종
  (`yakuhai_haku/hatsu/chun`·`yakuhai_seat/prevalent`·`kokushi_13`)은 도움말이
  «역패 — 백 · 발 · 중» / «역패 — 자풍 · 장풍» / «국사무쌍 13면 · 스안커 단기» 로 **묶어서**
  싣고 있는 것이고 누락이 아니다. 판수 표기(울면 몇 판 포함)도 `openHan`/`closedHan`과 전부 일치.

- **랜딩의 «증강 N종»은 서버가 준 값이다** — `App.tsx:7290 serverInfo.augmentKinds`
  ← `RoomManager.ts:1256 this.augmentCatalog.length`. 문장에 숫자를 박아 둔 자리는 없다.

- **도움말 «언제 몇 개»(증강 획득 시점)가 구현과 맞는다** — 「반장전 네 번(동1·동3·남1·남3),
  동풍전 세 번(동1·동3·동4)」 ↔ `hanchanConfigForMode`의 `draftSchedules`
  (`["gameStart","eastThird","southEntry","southThird"]` / `["gameStart","eastThird","eastFourth"]`).

- **`guestResume` 실패 경로가 깨끗하다** — 죽은 토큰이면 서버가 `GUEST_SESSION_GONE`을 주고
  (`RoomManager.ts:4691`) 클라이언트가 그 자리에서 `majak.guestToken`을 지우고 조용히
  첫 화면을 유지한다(`App.tsx:4101-4107`). 재연결마다 오류 토스트가 쌓이는 일은 없다.
  다른 체험 판을 붙들고 있던 연결도 먼저 접는다(유령 방 없음).

- **튜토리얼 대본은 대개 끝까지 간다** — `tutorialRun.ts 40` → `36 OK(ron) · 2 OK(tsumo)`,
  실패 2건(도중유국 1 · 유국 1). 대본 손패(`TUTORIAL_HAND`)의 계산도 맞다:
  9삭 버림 → 연금술 1삭→2삭 → 234m 567m 222s + 4567p = **4통·7통 대기**, 리치 가능.

- **도움말 본문의 `**굵게**`는 실제로 굵게 그려진다** — `TermText`(App.tsx:8038-8051)가
  `**…**`를 `<strong>`으로 가른다. (말풍선은 안 그런다 — `tutorial.ts`가 그 사실을 적어 두었다.)

# 이 라운드에 만든 스크립트

- `qa-lab/round2/onboard/kuikaeSeal.ts` — 확정 1 재현
- `qa-lab/round2/onboard/holdRace.ts` — 확정 2 계측 (`[판수] [지연ms]`)
- `qa-lab/round2/onboard/tutorialRun.ts` — 대본 완주 통계 (1차 시도에서 만든 것, 그대로 씀)
- `qa-lab/round2/onboard/tutorialAbort.ts` — 첫 국 종료 방식 분포
- `qa-lab/round2/onboard/afterQuit.ts` — 확정 4 재현 (2국 배패)
- `qa-lab/round2/onboard/yakuCheck.ts` — 역 목록 전수 대조
