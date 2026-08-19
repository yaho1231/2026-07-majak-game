# defense 6 + call 8 — 「절대 안 쏘는 수비수」 · 「울보」

담당: `yakuman_shield` `last_stand` `die_hard` `invincible` `no_ron_pact` `always_tenpai`
/ `omni_chi` `open_kokushi` `cliff_bloom` `void_kan` `bluff_pretense` `meld_dissolve`
`silent_pact` `snake_kan`

## 요약

- 돌린 판 수: **930국 이상**(전판 시뮬레이션). 내역 —
  혼합 스윕 61국, 단일 격리 264국(always_tenpai 108 / yakuman_shield 66 / last_stand 66 /
  die_hard 66 / invincible 66), 강제 배패 시나리오 8종 307국(bloom 22 · snake 32 ·
  void 43 · dissolve 42 · kokushi 32 · bluffsilent 43 · omni 51 · mix 42),
  리치·방어 시나리오 137국(laststand 32 · defense 72 · dissolve 33), 역만 강제 시나리오 14국,
  조약 길이 측정 39국, 마무리 스윕(진행 중).
  여기에 `craft` 기반 정밀 프로브 3벌(총 60여 개 단정)을 얹었다.
- 증강 커버리지: 14종 전부 **실제로 발동**을 관측했다 —
  `bloom`(만개 12·영상패 선택 22) · `snake_kan` 안깡 58 · `kokushi_pon` 40 ·
  `silent_pon` 30 · `meld_dissolve` 81+79 · `bluff_pon` · `omni_chi` 치 386 ·
  `void_kan` 안깡 71건 노출 · 역만 8건(방어막) · die_hard 부활 다수 ·
  always_tenpai 유국 정산 144건. (`last_stand`의 `cancel_riichi`만 전판에서 봇이
  누르지 않아 프로브로만 확인했다.)
- **확정 4건 · 의심 3건.**

크래시·엔진 예외(`effectErrors`)·타일 중복/유실·손패 장수 이상·왕패×깡 불일치
(`deadWall === 14 − kanCount`)·`meldCount ≠ melds.length`·공탁 음수·점수 NaN/소수는
**한 건도 나오지 않았다.** 유국 정산 합은 항상 0이었고, 총합 드리프트는 전부
`die_hard`/`yakuman_shield`/`nagashi_yakuman`의 **설계된 뱅크 발행**으로 금액까지 대조됐다
(`SCORE_DRIFT_ATTRIBUTED`).

---

## 확정 1. 🟠 meld_dissolve — 파혼이 **남의 유국만관(·유국역만)을 되살린다**

- 위치: [`packages/content/src/augments/meld_dissolve.ts:192-194`](../../packages/content/src/augments/meld_dissolve.ts)
  (`moveTiles(zones, meldsZone(holder), discardsZone(calledFrom), [calledTileId])`)
  ↔ 판정 쪽 [`packages/core/src/mahjong/flow/standardActions.ts:1161`](../../packages/core/src/mahjong/flow/standardActions.ts)
  (`nagashiManganSeats`: `강 장수 !== 버림 이력 길이` 이면 불성립)
- 기대: 파혼의 설명은 "내가 냈던 2장만 손으로 돌아오고 남에게서 가져왔던 1장은 그
  사람의 버림패로 되돌아간다"까지다. **남의 역·정산 자격을 바꾼다는 말은 없다.**
  표준 룰과 엔진 판정 모두 "자기 버림패가 한 번이라도 울려 나가면 유국만관 불성립"이다.
- 실제: 퐁으로 강에서 빠졌던 1장이 강으로 돌아가면 `강 장수 === 버림 이력 길이`가
  **다시 성립**해, 이미 울려 나갔던 사람이 유국만관 판정을 통과한다.
  파혼을 쓴 본인이 가장 크게 손해 본다(−3000 → −7000).
- 재현: `tsx qa-lab/defcall/repro_dissolve_nagashi.ts`

  ```
  파혼=안함  p1 강=10장 / 버림이력=11개  → 유국만관=false  deltas={"p0":-3000,"p1":1000,"p2":1000,"p3":1000}
  파혼=함    p1 강=11장 / 버림이력=11개  → 유국만관=true   deltas={"p0":-7000,"p1":9000,"p2":-1000,"p3":-1000}
  ```

  (실제 `pon` 액션으로 강에서 패를 빼고 → `dissolve_meld` → 패산을 비워 `sys.settleDraw`.)
- 영향: **점수가 8000점 틀린다.** 합계는 보존되므로 하네스의 총합 검사에 안 걸린다.
  `nagashi_yakuman`(유국역만, 32000×3)도 같은 `nagashiValid` 판정을 쓰므로 같은 경로로
  되살아난다 — 그쪽은 한 번에 수만 점이 움직인다.

## 확정 2. 🟡 yakuman_shield — 역만 **쯔모**에서는 본장 부담까지 환급된다

- 위치: [`packages/content/src/augments/yakuman_shield.ts:100-101`](../../packages/content/src/augments/yakuman_shield.ts)
  `const cap = bigWins.reduce((s, w) => s + w.points, 0); const refund = Math.min(-loss, cap);`
- 기대(detail 그대로): "돌려받는 상한이 역만 화료 점수라, **본장(1본당 300)과 공탁 부담은
  환급 대상이 아니다** — 2본장 역만 직격이면 손실이 0이 아니라 600 남는다."
- 실제: 상한 `cap`이 **화료 전액**인데 쯔모에서는 보유자 몫이 그 1/3~1/2뿐이라 상한이
  한 번도 물리지 않는다 → `refund = -loss` → 보유자 손실이 **정확히 0**. 본장 몫은
  사라지지 않고 **화료자의 수령에서 깎인다**.
- 재현: `tsx qa-lab/defcall/repro_shield_honba.ts`

  ```
  seed=2 winType=tsumo yakuman=3 points=96000
     deltas={"p0":0,"p1":72200,"p2":-48100,"p3":-24100} augPoints=[{"player":"p0","augId":"yakuman_shield","points":24100}]
     ← p0(방어막)는 24000+본장100 = 24100 전액 환급, p1(화료자)은 96300 대신 72200
  seed=3 winType=ron  yakuman=2 points=64000
     deltas={"p0":-600,"p1":600,...}   ← 직격(론)일 때만 detail대로 본장 600이 남는다
  ```
- 영향: 설명과 다르다. 그리고 **화료자가 받을 본장이 사라진다**(제로섬은 유지).
  docs/25 국면 #4(더블론에서 역만 아닌 화료까지 막던 문제)의 수정이 `cap`을 도입하면서
  남긴 구멍으로, 그 항목과는 다른 경우다.

## 확정 3. 🟡 yakuman_shield — **유국역만을 막아도 "막아낸 횟수"가 오르지 않고 아무것도 안 보인다**

- 위치: [`yakuman_shield.ts:132-139`](../../packages/content/src/augments/yakuman_shield.ts)
  (사용 횟수·공개 뷰는 `ROUND_SETTLED` 리액션이 `shieldedBy` 표식을 보고 갱신한다)
  ↔ [`nagashi_yakuman.ts:120-134`](../../packages/content/src/augments/nagashi_yakuman.ts)
  (유국역만 쪽은 보유자를 **지불 목록에서 건너뛰기만** 하고 `shieldedBy`를 남기지 않는다)
- 기대: description "막아낸 횟수는 전원에게 보인다" + detail "유국역만도 막되".
- 실제: 지불 면제는 정상 작동하지만(아래 실측 `p0=0`), `yakuman_shield:used:p0` 와
  `view:*:yakuman_shield:p0` 가 **둘 다 미설정**으로 남는다. 테이블에는 "저 사람한테
  역만이 안 통한다"가 뜨지 않고, 누적 카운터도 오르지 않는다.
- 재현: `tsx qa-lab/defcall/probe3.ts` (두 번째 블록)

  ```
  deltas={"p0":0,"p1":32000,"p2":-8000,"p3":-8000} special={"augId":"nagashi_yakuman",...}
  ✗ 막아낸 횟수가 공개된다   used=undefined view=undefined
  ```
- 영향: 정보가 안 보인다(Rule #2 위반) + 설명과 다르다. 재장전 계열이 이 카운터를
  읽는다는 점(docs/28)까지 고려하면 카운터 누락은 표시만의 문제가 아니다.

## 확정 4. 🟡 invincible — **창깡(챤깡)까지 막는다.** detail은 "내 버림패로 론"만 막는다고 적혀 있다

- 위치: [`invincible.ts:103-115`](../../packages/content/src/augments/invincible.ts) (`win.ronImmune`)
  ↔ [`standardActions.ts:343-349`](../../packages/core/src/mahjong/flow/standardActions.ts)
  `const source = last?.player ?? chankan?.player;` — 론 면역 판정이 **버림패뿐 아니라
  창깡 대상까지** 같은 규칙으로 본다.
- 기대: detail "자기 순에 선언하면 그 국이 끝날 때까지 **타가가 내 버림패로 론할 수
  없다**. … 다만 상대의 쯔모 화료나 유국 노텐 벌점은 막지 못한다." — 깡을 창깡당하는
  것은 여기 없다.
- 실제: 무적을 켠 국에는 **가깡·안깡을 아무리 쳐도 창깡당하지 않는다.**
- 재현: `tsx qa-lab/defcall/probe3.ts` (세 번째 블록)

  ```
  guard=false chankan={"player":"p0",...} ronImmune=false win.ok=true
  guard=true  chankan={"player":"p0",...} ronImmune=true  win.ok=false  discarder is immune to ron
  ```
- 영향: 설명에 없는 추가 능력(무적 + 안전한 깡). 특히 담당 증강 `void_kan`
  (성립하지 않는 깡)의 존재 이유를 무적 하나가 통째로 무력화한다 — 상대가 무적을 켠
  국에는 그쪽 깡을 절대 창깡할 수 없다. `no_ron_pact`는 멘쯔가 생기는 순간 조약이
  파기되므로 이 문제가 없다(프로브로 확인).

---

## 의심 1. bluff_pretense — 같은 종류의 **5번째 장**이 생긴다 (설명에 언급 없음)

- 위치: [`bluff_pretense.ts:138-140`](../../packages/content/src/augments/bluff_pretense.ts)
  (`tileKindChanged`로 잡패를 목표패로 변환)
- 실측: `tsx qa-lab/defcall/probe.ts` — 손에 白 1장뿐인 상태에서 `bluff_pon` →
  게임 전체 `dragon3` 장수가 **5장**이 된다.
- 왜 의심으로 두는가: `cliff_bloom`은 같은 메커니즘의 4장 초과를 소스 주석에서
  **사용자 확정으로 유지**한다고 명시했다(docs/25 P8 종결). `bluff_pretense`의
  description/detail에는 그 말이 없어서 "설명 누락"인지 "허용된 설계"인지 이 자리에서
  가릴 수 없다. 정합 자체는 깨지지 않는다(타일 총량·손패 산술 정상).

## 의심 2. meld_dissolve — 되돌린 패 때문에 `discardCount`와 강 장수가 어긋난다

- 실측(위 확정 1의 재현): 파혼 뒤 `p1 강=11장 / discardCount=10`(이력 11).
  `GameState.ts:109`가 "턴 세기에는 `discardCount`를 쓴다"고 못박아 둔 값이라, 강 길이를
  세는 다른 판정이 있으면 같이 어긋난다. 지금 확인된 실피해는 확정 1(유국만관)뿐이라
  나머지는 의심으로 남긴다. (되돌린 패가 강 **맨 끝**에 붙는 순서 왜곡은 docs/25 #19에
  이미 기록돼 있어 제외했다.)

## 의심 3. always_tenpai × `draw.notenExempt`

- [`always_tenpai.ts:50-78`](../../packages/content/src/augments/always_tenpai.ts)는
  `tenpaiPlayers`에 없는 상대를 전부 "노텐"으로 보고 2000씩 뜯는다. 표준 정산은
  `draw.notenExempt`(노텐 벌점 면제) 보유자를 지불에서 빼는데, 승승장구는 그 규칙을
  보지 않는다 → **벌점 면제 증강을 든 상대도 2000을 낸다.**
- 재현 실패 사유: `draw.notenExempt`를 켜는 증강이 내 담당 밖이라 전판 시뮬레이션에서
  같은 자리에 붙는 조합을 만들지 못했다. 소스 독해 단계에서 멈춘다.

---

## 확인해 본 뒤 **정상**이었던 것 (재보고 방지용)

| 항목 | 결과 |
| --- | --- |
| `invincible` 국 스코프 만료 · 쿨다운 2국 · 같은 국 재선언 차단 | 정상 (probe) |
| `no_ron_pact` 6순 경계(6=면역, 7=해제) · 안깡으로 파기 | 정상 (probe) |
| `no_ron_pact`의 "6순"이 실제로 몇 장인가 | 중앙값 **29 버림** = 1인당 7수 남짓. `turnCount`가 오야 쯔모에만 오르는 설계대로다 (`measure_pact.ts`) |
| `die_hard` 부호 반전 · 매치 횟수(반장 2/동풍 1) · 도비보다 먼저 반영 | 정상. 발행분은 `augPoints`에 실려 화면과 일치 |
| `always_tenpai` 유국 텐파이 집계 · 합=0 · 정수 델타 · 오야 연장 | 정상 (144회 유국 관측 + probe) |
| `last_stand` 리치 취소 — 점수 +1000 / 공탁 −1000 / 리치·리치후리텐 해제 / 국당 1회 | 정상 (probe) |
| `silent_pact` — 멜드 `silent` 표식 · 퐁 뒤 리치 가능 · **멘젠쯔모 성립**(대조군은 불성립) | 정상 (probe2) |
| `meld_dissolve` — 타일 총량·손패 +3(2복귀+1보충)·멘젠 복구·패산 −1·`lastDrawRinshan` 해제·국당 1회 | 정상 (probe, 160회 발동) |
| `bluff_pretense` — 손패 −2·커쯔 3장 동일 종류·총량 보존 | 정상 |
| `snake_kan` — 4연속 안깡 성립·`kanCount`·왕패 보존·**리치 중 차단**·채점 통과 | 정상 |
| `void_kan` — 안깡에서 손패 정확히 1장 변경 / **대명깡에는 미발동** / **리치 중 잠금** | 정상 (probe2) |
| `open_kokushi` — `kokushi_pon` 뒤 표준 퐁·치·깡이 전부 잠긴다(외길 강제) | 정상 |
| `cliff_bloom` — 만개 12회 전부 그 국에 화료 성공 / `bloom_pick`이 왕패 장수·도라 표시패 tileId를 보존 | 정상 |
| `omni_chi` — 원격 치 386회, 소프트락·순서 붕괴 없음 | 정상 |
| 왕패 × 깡 정합 (`deadWall === 14 − kanCount`), 사깡산료 중단 6회 | 정상 |

> `RIICHI_YAKU_MISSING`(리치 화료인데 역 목록에 리치가 없다)이 국사 화료 4건에서
> 떴는데, 역만이 서면 일반역이 목록에서 빠지는 **표준 동작**이라 오탐이다.

## 파일

```
qa-lab/defcall/
  run.ts                     하네스 확장 (이벤트 로그 + 드래프트 OFF + config 덮어쓰기)
  checks.ts                  도메인 불변식 (조약/무적 론 차단, die_hard 부활, always_tenpai,
                             왕패×깡, meldCount, 타일 총량, 리치 역, 만개 화료 …)
  batch.ts / iso.ts / sweep.ts / callscenes.ts / scenario.ts   대량 스윕
  probe.ts / probe2.ts / probe3.ts                             craft 기반 정밀 단정
  repro_dissolve_nagashi.ts  ← 확정 1
  repro_shield_honba.ts      ← 확정 2
  measure_pact.ts            조약 보호 길이 측정
  trace_drift.ts             점수 총합 드리프트 이벤트 추적
```
