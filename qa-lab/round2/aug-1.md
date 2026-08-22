# 증강 1군 (alchemist … dora_conceal) — aug-1

## 요약

- **커버리지: 담당 30종 전부 소스 완독.** 여기에 정산 리그(결정적 단위 검증) 4종,
  PlayerView 검증 1종, 엔진 액션 시나리오 1종을 새로 작성했고, 플레이 하네스는
  1차 시도분(240게임×5 샤드 = 1,200게임) + 이번 라운드분(**360게임** — 30종 × 12판,
  solo/dual(같은 증강 2좌석)/pair 세 형태, 페르소나 4종 순환)을 돌렸다.
  이번 360게임은 **crash 0 · effectErrors 0 · violations 0**
  (로그: `qa-lab/round2/aug-1/logs/r2-s{0,1,2}.log`).
  즉 이번 라운드의 확정 6건은 전부 **플레이 스위프가 못 잡는 종류**다 — 총합은 보존되고
  예외도 안 나며, 어긋나는 것은 「카드가 약속한 것 ↔ 코드가 하는 것」뿐이다.
- **확정 6건 · 의심 12건 · 기각/중복 6건.**
  확정은 🔴 1 (`blind_ron` 이중 적용 — 방총이 이득이 된다) ·
  🟠 3 (`counter`×`last_stand` 무료 반격, `danger_sense` 오탐, `cliff_bloom` 상시 왕패 열람) ·
  🟡 2 (`blame_shift` 끝수 방향, `dead_wall_master` 이름표 거짓).
- **덜 본 범위**: 클라이언트 렌더( `App.tsx` )는 코드 대조만 했고 실제 화면으로는 확인하지
  못했다 — 의심 6·7(연출·컷인 중복 제거)이 여기에 걸린다. 봇 정책(`bot: plan(...)`)의
  의사결정 품질도 이번 범위 밖이다.

담당 30종: alchemist all_or_nothing always_tenpai ankan_dora aotenjou_ceiling async_chiitoi
avenger big_hand blame_shift blind_ron blood_contract bluff_pretense bottom_deal bottom_yaku
brief_fog broken_border broken_wall call_seal cliff_bloom conjure_draw cornucopia counter
danger_sense dead_wall_master devils_advance die_hard disarm discard_lock dora_afterimage dora_conceal

---

## 확정 1. 🔴 눈먼 총알(blind_ron)을 **두 좌석이 동시에 들면 재배선이 두 번 걸려, 쏜 사람이 방총으로 돈을 번다**

- 위치: `packages/content/src/augments/blind_ron.ts` — `settleInterceptor(ctx, SETTLE_STAGE.Redistribute, ...)`
  안의 `deltas[shooter] = (deltas[shooter] ?? 0) + owed;` / `deltas[victim] = (deltas[victim] ?? 0) - owed;`
- 기대: 카드 — "이 국의 모든 론이 **네 명 중 무작위 한 명**에게 청구된다".
  주석도 "지불자만 재배선, **총액 불변**"이라고 명시한다. 즉 한 발의 총알이 **한 사람**에게
  박히고, 쏜 사람은 그 손 지불분에서 **면제될 뿐**(0) 이지 **버는 일은 없어야** 한다.
- 실제: 이 증강의 효과는 홀더 자신이 아니라 **테이블의 모든 론**에 걸린다. 그런데
  인터셉터는 `ctx.instanceId` 단위로 등록되고(`settleInterceptor` → `settlePriority(stage, seat, augId)`
  는 좌석마다 다른 우선순위를 준다), **홀더별로 하나씩** 돈다. 게다가
  ① 대상 추첨 PRNG 시드가 `seed ^ hash("blind_ron:<roundKey>:<shooter>")` 로 **홀더를 포함하지 않아**
  두 인스턴스가 **같은 피해자**를 고르고,
  ② 이동량 `owed`를 `deltas`가 아니라 **`winInfos`(불변)** 에서 다시 재므로 두 번째 인스턴스가
  "이미 옮겨졌다"는 사실을 볼 수 없다.
  결과적으로 같은 이동이 **정확히 두 번** 적용된다 — 쏜 사람은 `+owed` 만큼 **이득**을 보고,
  엉뚱하게 맞은 사람이 `2 × owed` 를 문다. (세 좌석이 들면 3배가 된다.)
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/aug-1/t1_blindron_double.ts`
  ```
  === 1인 보유 ===
  holders=["p0"]
    before={"p0":0,"p1":8000,"p2":-8000,"p3":0}
    after ={"p0":0,"p1":8000,"p2":0,"p3":-8000}  sum=0     ← 정상 (p2 면제, p3가 대신 문다)
  === 2인 보유 (p0, p3) ===
  holders=["p0","p3"]
    before={"p0":0,"p1":8000,"p2":-8000,"p3":0}
    after ={"p0":0,"p1":8000,"p2":8000,"p3":-16000}  sum=0
    쏜 사람 p2 = +8000   ← 방총하고 8000점을 **벌었다**
  === 3인 보유 (p0, p2, p3) ===
    after ={"p0":0,"p1":8000,"p2":16000,"p3":-24000}  sum=0
    쏜 사람 p2 = +16000  ← 보유자 수에 정비례해 배가 된다
  ```
  본장(=roundKey)만 바꿔 가며 훑은 것: `tsx qa-lab/round2/aug-1/p1_blind_ron_dual.ts`
  (총알이 쏜 사람 자신을 맞힌 국은 애초에 이동이 없어 무해하다 — 그 외 전부에서 배가된다)
  ```
  honba=1 rk=1-1-1
    [p0]          {"p0":-8000,"p1":0,"p2":0,"p3":8000}
    [p0,p2]       {"p0":-16000,"p1":8000,...}  ❌쏜사람 +8000  ❌한명이 -16000
    [p0,p1,p2]    {"p0":-24000,"p1":16000,...} ❌쏜사람 +16000 ❌한명이 -24000
  honba=3 rk=1-1-3
    [p0,p2]       {"p1":8000,"p2":-16000,...}  ❌쏜사람 +8000  ❌한명이 -16000
  ```
- 영향: 총합은 0으로 보존되므로 "합=0" 류의 불변식 검사에는 걸리지 않는다. 그런데도
  **방총이 이득이 되는** 국이 만들어진다 — 8,000점 론 하나로 두 좌석 사이에 16,000점이
  오간다(동풍전 순위가 한 국에 뒤집히는 규모).
- 도달 경로(실재함): 정식 드래프트는 2026-08-20 수정 #94·#97로 "한 게임에 같은 증강을 둘이
  갖지 않는다"를 지키게 됐지만, **증강 테스트 방(샌드박스)은 그 불변식 밖에 있다** —
  `packages/server/src/RoomManager.ts` 의 `sanitizeSandboxAugments()` 는 `picked.includes(id)`
  로 **한 좌석 목록 안의 중복만** 거른다. 좌석별 목록은 서로 대조하지 않으므로 p0·p2에 같은
  `blind_ron`을 얹는 것이 UI에서 그대로 통과하고, `HanchanController.installPreset()` 도
  좌석 간 중복을 막지 않는다. 즉 **플레이어가 지금 바로 재현할 수 있는 상태**다.
- 제안 수정: 이 증강의 효과는 홀더가 아니라 **판 전체**에 걸리므로 인스턴스가 몇 개든
  **국당 한 번만** 적용돼야 한다. 예: 인터셉터 첫머리에 payload 표식
  (`blindRonApplied?: true` — `die_hard`의 `ReviveMark`·`devils_advance`의 `BurstMark`와 같은 패턴)
  을 두고, 이미 서 있으면 그대로 `return event`. 겸사겸사 PRNG 시드에 홀더를 넣지 않는 것이
  맞다(누가 들었든 같은 국의 총알은 같은 곳으로 날아가야 하므로) — 표식 하나면 충분하다.

---

## 확정 2. 🟡 책임전가(blame_shift)의 끝수 처리가 반대로 — **쏜 사람이 애먼 두 사람보다 적게 낸다**

- 위치: `packages/content/src/augments/blame_shift.ts` — `function splitEvenly` 의
  `const per = Math.round(total / n / 100) * 100;` 와 `out.push(total - assigned); // 마지막이 끝수 흡수`
- 기대: 파일 주석이 명시적으로 약속한다 — "100점 단위를 유지하되 합은 정확히 보존한다
  (나머지는 원래 쏜 사람이 흡수 — **「시작한 사람」이 끝수까지 진다**)". 카드 detail도
  "100점 단위로 떨어지지 않는 끝수는 원래 쏜 사람이 흡수한다". 증강 이름이 '책임전가'이고
  쏜 사람을 배열 마지막에 두는 코드까지 있으니, 의도는 **쏜 사람이 남는 끝수를 더 문다**는 것이다.
- 실제: `per`를 `Math.round`로 구하므로 **올림이 나오는 금액에서는 앞의 두 사람이 더 내고
  쏜 사람이 덜 낸다.** 8,000점 론이 대표적이다 — 8000/3 = 2666.7 → per = 2,700 →
  애먼 둘이 2,700씩, **쏜 사람은 2,600**. 방총한 사람이 테이블에서 가장 적게 내는 그림이다.
  (5,200점처럼 내림이 나오는 금액에서는 반대로 쏜 사람이 더 낸다 — 금액에 따라 갈린다.)
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/aug-1/t2_dual_settle.ts`
  ```
  ### blame_shift 2인(p0 화료, p3도 보유)
    before={"p0":8000,"p1":-8000,"p2":0,"p3":0}
    after ={"p0":8000,"p1":-2600,"p2":-2700,"p3":-2700}  sum=0
                    ↑ p1이 쏜 사람인데 가장 적게 낸다
  ```
- 영향: 금액은 100점이라 순위를 뒤집지는 않는다. 다만 결과 화면의 증감표에 "쏜 사람 −2,600 /
  안 쏜 사람 −2,700"이 나란히 서서 **읽는 사람이 계산이 틀렸다고 느낀다**. 카드 문구와도
  반대다.
- 제안 수정: `Math.round` → `Math.floor` (`const per = Math.floor(total / n / 100) * 100;`).
  그러면 남는 끝수는 항상 마지막(=쏜 사람)에게 몰려 주석·카드 문구와 일치한다.

---

## 확정 3. 🟠 절벽 위의 꽃(cliff_bloom)이 **깡을 한 번도 치지 않아도 배패 순간부터 영상패 4장을 계속 본다**

- 위치: `packages/content/src/augments/cliff_bloom.ts` —
  `ctx.engine.rules.addModifier<VisibilityRule>("visibility.deadWall", { ... apply: (cur, rctx) => { if (rctx.playerId !== holder) return cur; ... return widenPeek(cur, { mode: "peek", count: ... rinshanRemaining(state) }); } })`
- 기대: 카드가 열람 시점을 **깡 그 자체**로 못 박는다 — description "(상시) **깡을 할 때마다**
  영상패를 남아 있는 영상패 전부 중에서 직접 고른다", detail "**깡할 때마다** 남아 있는 영상패를
  모두 보고 그중에서 직접 고른다". 코드 바로 위 주석도 "무엇을 **고를지** 보고 정한다"라고
  용도를 열람이 아니라 **선택 보조**로 적고 있다.
- 실제: 이 Modifier에는 턴·페이즈·깡 여부 게이트가 **하나도 없다.** 보유자는 배패 직후부터
  유국까지, 깡을 한 번도 치지 않아도 영상패(=지금 남아 있는 링샨패 전부)를 **실제 tileId로**
  본다. 마작에서 왕패는 "절대 나오지 않는 패"라, 이 4장을 아는 것은
  **남은 산에 그 4종이 몇 장 남았는지를 정확히 아는 것**과 같다 — 수비(현물 계산)와
  대기 선택에 그대로 쓰이는, 카드가 제시하지 않은 상시 정보 우위다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/aug-1/t3_cliffbloom_peek.ts`
  ```
  증강 없음 / 뷰어=p0: 왕패 0칸 중 실제 id로 보이는 것 0개 []
  p0 = cliff_bloom / 뷰어=p0: 왕패 4칸 중 실제 id로 보이는 것 4개 [52,53,54,55]
  p0 = cliff_bloom / 뷰어=p1: 왕패 0칸 중 실제 id로 보이는 것 0개 []
    (실제 왕패 앞 4장 = [52,53,54,55], 깡 0회 · 순 0)
  ```
  (배패 직후·턴수 0·깡 0회 상태의 PlayerView다.)
- 영향: 상대는 이 사람이 왕패 4장을 알고 있다는 사실을 알 수 없다. 카드만 읽고 "깡을 안 쳤으니
  아직 아무것도 못 본다"고 판단하는 것이 정상인데 실제로는 국 내내 보고 있다.
  `dead_wall_master`·`rinshan_preview` 같은 **정보형 증강의 값어치를 통째로 무상 제공**하는
  셈이라 밸런스에도 걸린다.
- 제안 수정: 열람을 깡 문맥으로 좁힌다 — `pickKey`(고를 차례가 열려 있는 상태)나
  `canPick(state)`가 참일 때만 `widenPeek`을 반환한다. 그러면 "고를 때 보고 고른다"는
  주석의 원래 의도와 카드 문구가 일치한다.

---

## 확정 4. 🟠 카운터(counter) — **반격만 챙기고 리치는 무른다**: 배수의 진과 함께 들면 리치를 걸지 않고 1,000점을 벌고 상대 일발을 지운다

- 위치: `packages/content/src/augments/counter.ts` — `ctx.reaction(TILE_DISCARDED, ...)` 안의
  `rc.emit(augmentDataSet(struckKey(holder), true));` 와, 정산 인터셉터
  `settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, ...)` 의 `if (!flagOf(ic.state, struckKey(holder))) return event;`
  (보유자가 **아직 리치 중인지**는 어디에서도 다시 보지 않는다)
- 기대: 카드는 반격의 대가로 **내가 리치에 몸을 실을 것**을 요구한다 — description
  "나보다 먼저 리치를 건 상대에게 **추격 리치로** 반격한다 — **내 공탁 1,000점**을 그 상대가
  **대납**하고…". 실제로 같은 계열의 자유 선언(`free_riichi_discard`)은 바로 이 이유로
  `conflicts: ["last_stand", …]`("cancel_riichi로 리치 해제")를 걸어 배수의 진을 배제해 뒀다.
- 실제: 반격은 `TILE_DISCARDED(riichi:true)` 한 번으로 **종결**된다 — 그 자리에서 1,000점이
  옮겨지고, 상대 일발이 영구 소멸하고, `counter:struck` 플래그가 선다. 그 뒤에 배수의 진
  (`last_stand`)으로 리치를 취소하면 `riichiPot`에서 1,000점을 **되돌려 받는다**.
  결과적으로 **리치를 걸지 않은 채** 순 +1,000점을 벌고, 상대의 일발을 지웠으며,
  「손 가치 강탈 + 직격 +4판」의 전제인 `struck` 플래그까지 그대로 남는다.
  `counter`에는 `conflicts`가 하나도 없어 드래프트가 이 조합을 막지 않는다.
- 재현: `/Users/skul/majak/node_modules/.bin/tsx qa-lab/round2/aug-1/t4_counter_lastsand.ts`
  ```
  ① 시작            점수={"p0":25000,"p1":25000,...}  공탁=1000  p1.riichi.ippatsu=true
  ② 추격 리치        점수={"p0":25000,"p1":24000,...}  공탁=2000
                     p1.riichi.ippatsu=false   counter:struck:p0=true
  ③ 자기 순에 cancel_riichi  ok=true
                     점수={"p0":26000,"p1":24000,...}  공탁=1000
                     p0.riichi=null            counter:struck:p0=true
                     → p0 순증감 +1000 / p1 순증감 -1000
  ```
- 영향: 「추격 리치로 몸을 싣는다」는 카드의 유일한 대가가 사라진다. 상대에게는
  일발이 지워지고 1,000점을 뜯긴 뒤, 정작 압박해 온다던 리치는 없다 —
  그러고도 그 국에 내가 먼저 화료하면 손 가치 강탈과 직격 +4판이 그대로 붙는다.
  선리치를 건 사람 입장에서 **대응할 수 있는 정보가 하나도 없는** 손해다.
- 제안 수정: 둘 중 하나.
  ① `counter`에 `conflicts: ["last_stand"]`를 추가한다(자유 선언이 이미 쓴 방식).
  ② 또는 `RiichiCanceled` 리액션에서 `struckKey`를 내리고 대납 1,000점을 되돌린다 —
     카드가 약속한 것은 "추격 리치"이지 "추격 리치 흉내"가 아니다.

---

## 확정 5. 🟠 위험 감지(danger_sense)가 **절대 쏘일 수 없는 패까지 위험하다고 칠한다** — 표준 론 검증 두 관문이 빠졌다

- 위치: `packages/content/src/augments/danger_sense.ts` — `function canRonWith(...)`,
  마지막 줄 `return !needsYaku(state, rules, pid) || ev.ok;`
- 기대: 파일 헤더가 못 박는다 — "기준은 **실제로 쏘이는가**다 … **판정 순서는 표준 론 검증과
  같다.**" 카드 detail도 "**실제로 쏘이는 패만 센다** — 후리텐이라 론이 막힌 상대와 역이 없어
  론이 안 되는 대기는 빠지고…".
- 실제: `canRonWith`는 후리텐 · `evaluateWin` · `needsYaku` **셋만** 본다. 표준 론
  (`standardActions.ts` 의 win 액션)은 그 뒤에 두 관문을 더 통과해야 한다:
  ① `rules.resolve<boolean>("win.ronImmune", { playerId: source, state })` — 여기서 `source`는
     **버리는 사람 = 위험 감지 보유자 자신**이다. 보유자가 천하무적(`invincible`)이나
     불가침 조약(`no_ron_pact`)으로 론 면역인 국에서는 **무엇을 버려도 쏘이지 않는데**,
     위험 감지는 여전히 빨갛게 칠한다.
  ② `belowMinHan(ev, state, rules, req.player)` — 격(`win.minHan`, `rank_gate`)에 걸려
     론할 수 없는 상대의 싼 대기도 위험으로 센다.
  두 경우 모두 **오탐**이고, 파일 자신이 "오탐은 곧 능력값의 손실이다"라고 적어 둔 방향이다.
- 재현(코드 대조 + 시나리오): p0에게 `danger_sense` + `invincible`을 주고 `invincible_guard`를
  선언한 뒤 `danger_sense_use` → `augmentData["view:p0:danger_sense#round"].kinds` 가 빈 배열이
  아니라 손패 대부분을 위험으로 표시한다. (표준 론 경로는 같은 상태에서 `WIN_BLOCKED_RON_IMMUNE`
  으로 전부 거부한다 — 두 판정이 갈린다는 것이 곧 재현이다.)
- 영향: "매 국 1회"짜리 정보 능력의 결과가 **거짓**이다. 사용자는 안전한 패를 안고 순을
  낭비하거나, 위험 감지를 믿을 수 없다고 판단하고 카드를 죽인다. 특히 자기 자신이 론
  면역인 국에서 "전부 위험"이 뜨는 그림은 즉시 버그로 읽힌다.
- 제안 수정: `canRonWith`에 두 줄을 더한다 —
  `if (rules.resolve<boolean>("win.ronImmune", { playerId: holder, state })) return false;`
  와 `win.minHan` 게이트(표준의 `belowMinHan`과 같은 계산).

---

## 확정 6. 🟡 왕패의 주인(dead_wall_master) — 교환 기회가 끝난 뒤에도 이름표가 "이번 국 왕패 교환 2회 남음"이라고 말한다

- 위치: `packages/content/src/augments/dead_wall_master.ts` —
  `function remainingSwaps(state, h) { return Math.max(0, SWAPS_PER_ROUND - counterOf(state, swapsKey(state, h))); }`
  와, 이 값을 국 시작에 한 번만 발행하는 `ctx.reaction(ROUND_STARTED, ... augmentDataSet(viewRemainingKey(holder), remainingSwaps(rc.state, holder)))`
- 기대: detail — "**첫 순을 넘기면 그 국의 교환 기회는 사라지고** 다음 국에 다시 2장이 채워진다."
- 실제: `remainingSwaps`는 **쓴 횟수만** 센다. 같은 파일의 `canSwap`은 그 위에
  `phase === "turn.act"` · 내 차례 · `discardCount === 0` · 리치 아님을 더 얹는데,
  이름표 채널은 `canSwap`을 **보지 않는다**. 그래서 한 장도 교환하지 않고 첫 타패를
  넘긴 홀더는 그 국이 끝날 때까지 "🀫 2회 / 이번 국 왕패 교환 2회 남음"을 달고 다닌다 —
  실제 액티브 버튼은 이미 사라진 뒤다. (게다가 2회를 다 쓰면 `left <= 0`이라 pill이
  통째로 사라져서, "다 썼다"와 "창이 닫혔다"와 "표시가 없다"가 구분되지 않는다.)
- 재현: `dead_wall_master` 보유자로 국을 시작해 교환하지 않고 바로 버린 뒤
  `augmentData["view:p0:dead_wall_master:remaining:p0#round"]` 를 읽으면 여전히 `2`,
  같은 시점 `holderTurnOptions`는 `[]`.
- 영향: 다른 좌석도 이 pill을 읽으므로(=상대는 "저 사람 아직 왕패를 두 번 바꿀 수 있다"고
  경계한다) 정보가 **틀린 채로 공유된다**. 횟수형 증강의 공용 규약(`cooldownUse`가
  사용 즉시 표시를 함께 갱신하는 이유)과도 어긋난다.
- 제안 수정: `viewRemainingKey`를 `canSwap(state, holder) ? remainingSwaps(...) : 0` 으로 계산하고,
  첫 타패(TILE_DISCARDED) 시점에 한 번 더 발행한다.

---

# 의심 (코드 근거는 있으나 판을 돌려 확정하지 못한 것)

## 의심 1. 🟠 카운터 — "그 상대의 손이 올랐을 때 받았을 점수"가 **오를 수 없는 손에도 값을 매긴다**
`counter.ts` `function bestWinValue(...)`. 가상 론을 `evaluateWin`으로만 평가하고 세 곳을
보정하지 않는다. ① **후리텐 미검사** — 후리텐은 액션 계층(`helpers.ts` `furitenAgainst`)에
있고 여기서 부르지 않는다. 영구 후리텐이라 론이 원천 봉쇄된 리치자도 만점으로 평가된다.
② **죽은 대기** — 대표 패를 `Object.keys(state.tiles)`에서 `!inHand`만으로 고르므로,
4장이 이미 다 나온 대기도 값이 매겨진다. ③ **문맥 오염** — `buildWinContext`에 `options.from`을
주지 않아 `state.round.lastDiscard?.player`(정산 시점엔 대개 **보유자 자신의 버림**)로 떨어지고,
`houtei`도 그 시점 패산 상태를 그대로 탄다. 이 셋은 전부 **강탈액을 부풀리는 방향**이다.
문구가 "받았을 점수"라는 가정법이라 ①②는 해석 여지가 있지만, ③은 명백한 계산 오염이다.

## 의심 2. 🟡 카운터 — 직격 +4판이 결과 화면에 **판이 아니라 점수 뭉치**로 찍힌다
`counter.ts` 의 `augPoints: withAugPoint(p, ctx, bonus)` — `withAugPoint`의 4번째 인자(han)를
주지 않는다. `util.ts` `addWinHanBonus`의 주석이 이 규약을 명시한다("결과 화면에도 **판으로**
적는다 — 2026-08-07 사용자 보고: '예지는 +2판인데 정산에 +6000점이 붙는다'"). 게다가 `bonus`는
「선리치자 손 가치 강탈」과 「직격 +4판」의 **합**이라 구조적으로 분리 표기가 불가능하다.
카드가 약속한 "+4판"이 화면 어디에도 판으로 나타나지 않는다.

## 의심 3. 🟡 카운터 — 공탁을 **내지 않은** 리치로 추격해도 상대가 1,000점을 "대납"한다
`counter.ts` 의 `const due = Math.max(p.riichiCost ?? 0, standardCost);`. 2026-08-20 문구 확정 6의
결과라 의도된 것이지만, 카드는 "**내 공탁 1,000점을** 그 상대가 **대납**하고"라고 적는다.
스텔스 리치·물러설 수 없는 선언으로 추격하면 낸 공탁이 0인데 상대가 1,000점을 문다 —
대납할 원금이 없는 대납이고, 그만큼이 새로 발행된다. `stealth_riichi`의 conflicts에 `counter`가 없다.

## 의심 4. 🟡 소환(conjure_draw) — 생성패가 **도라로 세어진다** (설계 문서와 반대)
`conjure_draw.ts` 의 `tileKindChanged([{ tileId: p.tileId, kind: target, attrs: { conjured: true } }])`.
`docs/16_AUGMENT_REDESIGN.md` §소환이 밸런스 레버로 못 박은 것 — "**생성패는 도라가 될 수 없어
(밸런스) 화력 상한이 있고**". 그런데 `attrs.conjured`를 채점에서 읽는 곳이 **하나도 없다**
(core/server 전수 grep: `Tile.ts` 필드 정의, `GameState.ts` 주석 둘, 봇의 `danger.ts`·`suji.ts` 뿐).
보유자는 도라 표시패를 보고 부르므로 사실상 확정 +1판(가리키는 패도 도라면 +2)이 붙는다.
카드 문구에는 도라 얘기가 없으므로 "문구 위반"은 아니고 **설계 문서 ↔ 코드**의 어긋남이다.

## 의심 5. 🟡 박무(brief_fog) — 국이 끝난 뒤에도 결과 화면에 "박무 · N순 남음" 배지가 서 있다
`brief_fog.ts` 의 `ctx.reaction(TILE_DISCARDED, (_event, rc) => { const notice = fogNotice(...) })`
가 배지를 내리는 **유일한** 지점이다. 효과 자체는 정산과 함께 정확히 걷힌다(`turnKey`가
`roundScopedKey`라 `ROUND_SETTLED` 리듀서가 다음 국 값을 쓰는 순간 만료된다) — 그런데 정산 뒤에는
버림이 없으므로 문자열 채널만 남는다. detail "6순이 다 가기 전에 국이 끝나면 함께 걷힌다"와
화면이 어긋난다. `blind_ron`이 같은 증상을 `ROUND_SETTLED` 리액션으로 고친 것과 같은 구조다.

## 의심 6. 🟡 밑장빼기(bottom_deal) — 같은 국의 **두 번째 이후 선언이 상대 화면에 안 뜬다**
`bottom_deal.ts` 는 매 순 다시 선언할 수 있고(`detail`) 선언 사실은 전원 공개라고 헤더가
"Rule #4(대응 가능)의 전제"라고까지 적는다. 그런데 클라이언트(`packages/client/src/App.tsx`)는
`bottom_deal`을 `AUG_EVENT_AUG_IDS`에 넣어 일반 `actionFx` 컷인을 막고, 대체 채널 컷인은
`augEventSig(key, raw, roundKey)` = `"bottom_deal:armed:p0=true@東-1-0"` 로 중복 제거한다.
같은 국의 2회차부터는 서명이 동일해 조용히 버려지고, 비보유자용 상시 배지는 없다.
(같은 결의 것: `alchemist`도 같은 국에 **똑같은 변환**(man3→man4)을 두 번 하면
`revealViewKey` 값이 같아 두 번째 컷인이 사라진다 — 카드는 "**매번** 전원에게 공개된다".)

## 의심 7. 🟡 절벽 위의 꽃 — 연출이 뒤집혀 있다
`bloom_pick`은 `FX_SILENT_ACTION_TYPES`·`FX_PRIVATE_ACTION_TYPES` 어디에도 없어서 **깡마다**
전원에게 "절벽 위에 피어난 꽃" 컷인이 뜬다(파일 자신은 이 고르기를 "상시 편의 기능"이라 부른다).
반대로 진짜 하이라이트인 **만개**는 `TILE_DRAWN` 리액션 안에서 일어나 `actionFx`가 전혀 없고,
`roundViewKey("*", ...)="만개"` 문자열 하나가 전부다. `free_discard`가 `FX_SILENT_ACTION_TYPES`에
들어간 이유("이건 발동이 아니라 버림이다")와 정확히 같은 문제다.

## 의심 8. 🟡 절벽 위의 꽃 — **리치 중에도 손패를 통째로 다시 쓴다** (문구에 한 글자도 없다)
`function bloomChanges(...)`와 `bloom_pick`의 `validate` 어디에도 `byPlayer[holder].riichi` 검사가
없다. 리치 중 안깡(대기 유지형)이 그 국의 두 번째 깡이면 멘젠 손패 전체가 다른 화료형으로
재작성되고, `bloom_pick`은 리치 중에도 영상패를 손으로 고르게 해 준다. 리치의 핵심 약속
("손은 잠긴다")을 깨는데 description·detail 어느 쪽도 이를 알리지 않는다. 프리즘의 의도일 수
있으나, 그렇다면 문구에 적혀야 한다.

## 의심 9. 🟡 봉인술사(discard_lock) — 발동 즉시 쿨다운 칩이 갱신되지 않는다
`cooldownViewKey("discard_lock", holder)` 를 쓰는 곳이 `ctx.reaction(ROUND_STARTED, ...)` **하나뿐**이다.
봉인한 순간 버튼은 사라지는데 칩은 다음 국이 시작될 때까지 "0국"으로 남는다. 공용 헬퍼
`util.ts` `cooldownUse`가 사용과 표시 갱신을 **함께** 내는 이유가 정확히 이것인데
(`"표시 갱신을 여기서 함께 내지 않으면 … 방금 쓴 증강이 아직 쓸 수 있어 보인다"`),
`discard_lock`은 쿨다운을 직접 짜면서 그 절반을 빠뜨렸다. 쿨다운 산술 자체는 정확하다(N국 사용 → N+2국 재개).
덧붙여 `seqKey = \`discard_lock:seq:${holder}\`` 가 util의 내부 `roundSeqKey("discard_lock", holder)`와
**바이트 단위로 같다** — 나중에 `trackRoundSeq`로 옮기면 seq가 이중 증가해 쿨다운이 절반이 된다.

## 의심 10. 🟡 해체반(disarm) — 정산 **도중에** 잠금을 스스로 푼다 (엔진이 이미 하는 일)
`disarm.ts` 의 `ctx.reaction(ROUND_SETTLED, ... rc.emit(augmentDataSet(DISARMED_SOURCES_KEY, list)))`.
`DISARMED_SOURCES_KEY`는 이미 `engine:disarmed#round`라 엔진의 국 스코프 청소가 담당하고,
`GameEngine.ts` 주석이 "정리를 엔진이 하면 게이트와 무관해진다"며 **의도적으로 옮겼다**고 적는다.
콘텐츠 쪽 리액션이 지워지지 않고 남아, 정산 캐스케이드 **안에서** 잠금을 먼저 푼다.
같은 `ROUND_SETTLED`의 형제 리액션들은 같은 state 스냅샷을 보므로 안전하지만, 그 뒤에 큐에 들어간
이벤트(다른 정산 리액션들이 emit한 `AugmentDataSet` 등, `publishUsesLeft`의 `reaction("*")` 포함)는
대상 증강을 **한 이벤트 이르게** 다시 활성으로 본다. 가장 안전한 수정은 이 리액션의 삭제다.

## 의심 11. 🟡 위험 감지 — 리치 중 강제 쯔모기리를 깨뜨린다
`danger_sense.ts` 의 `ctx.holderTurnOptions((state) => flagOf(state, usedKey(state, holder)) ? [] : [{ type: ACTION, payload: {} }])`.
`FlowController.turnPrompt`의 자동 넘김 조건은 `options.length === 1 && options[0].type === "discard"`인데,
위험 감지를 아직 안 쓴 리치 홀더는 매 순 선택지가 둘이라 자동 쯔모기리가 영영 걸리지 않는다.
카드는 리치에 대해 아무 말이 없고 validate도 리치를 보지 않는다(`alchemist`는 "리치 중에도 쓸 수
있다"를 명시하고, `bluff_pretense`는 아예 막는다 — 이 카드만 무언).

## 의심 12. 🟡 허장성세 — **공짜 퐁이 이미 되는데도** 국당 1회를 태운다
`bluff_pretense.ts` 의 `function matchingIds(state, holder, targetKey)` 는 `kindKey` 완전 일치로만
손패를 세는데, `FlowController.reactionPrompts`는 `sameCallKind(..., mixedTri, polar)`로 센다.
무너진 국경(혼색 커쯔)·양극이 켜져 있으면 표준 퐁이 이미 합법인 상황에서도 `bluff_pon`이 함께
제시되고, 그걸 고르면 국당 1회와 희생패 한 장을 **공짜로 되는 일**에 써 버린다.

---

# 기각 · 중복 (조사했으나 보고하지 않는 것)

- **`alchemist` · `bluff_pretense` 의 "5번째 장"** — 둘 다 `copiesLeftUndrawn` 검사가 없어 잔량 0인
  종류를 만들어 낼 수 있다. 다만 `docs/25_AUGMENT_QA_AUDIT_2026-08.md` **P8**이
  "conjured 패의 136장 위반 = 프리즘의 의도된 상식 파괴"로 **2026-08-04 사용자 확정 종결**이고,
  `docs/36 §96`이 `bluff_pretense`를 그 규약(보라 표식·봇 셈 제외)에 명시적으로 편입했다.
  `alchemist`도 같은 `attrs: { conjured: true }` 규약을 쓴다 → 기각.
  (다만 `off_by_one`만 검사를 갖고 있어 규칙이 반으로 갈려 있다는 점은 기록해 둔다.)
- **prior aug-1 스위프의 `DISARM_UNKNOWN` 대량 발생 = 하네스 버그였다.**
  `qa-lab/round2/aug-1/inv.ts` 의 `const [owner] = String(s).split(":");` 가 원인이다.
  코어의 인스턴스 id는 `augmentInstanceId` → `` `aug:${holder}:${augmentId}` `` 라 첫 세그먼트는
  언제나 리터럴 `"aug"` 다. 따라서 `st.players.find(p => p.id === "aug")` 는 항상 `undefined`이고
  **모든** 무장해제가 위반으로 찍혔다. 올바른 파싱은 `split(":")[1]`.
  `disarm` 자체의 대상 지정(자기 자신 금지·미보유 id 거부·국당 1회·매치 카운터·옵션 열거)은
  전수 대조 결과 카드 문구와 일치한다 → 제품 버그 아님.
- **`big_hand` 하한 12000 / `aotenjou_ceiling` 8판 +6000** — 1차 시도의 `p6_promises.ts`가 ❌로
  찍은 두 건은 **테스트 기대값이 틀린 것**이다. `rig.scene()`의 p0는 오야(dealerSeat=0)라
  큰손 하한이 12,000이고, 뚫린 천장도 오야 배율(5000×6=30000, 표준 24000, 차액 6000)이 맞다.
  30/2/2 = 표준 8판40부 = 16000, 자 기준 20000−16000=4000 도 재확인했다 → 코드 정상.
- **`always_tenpai` 도중유국** — `sysSettleAbort`는 `outcome: "abort"`라 `p.outcome !== "draw"`
  가드에 걸린다. 노텐 벌점 없는 국에서 +6000이 나오는 경로는 없다 → 정상.
- **`dora_afterimage` 의 무조건 `holderTurnOptions`** — 쿨다운·첫 국·이미 사용을 게이트하지 않지만,
  `FlowController.turnPrompt`가 모든 프로바이더 후보를 `validateOk`로 다시 거른다 → 화면에 안 뜬다. 정상.
- **`hourglass`가 `ROUND_SETTLED`를 다른 이벤트로 대체할 때 뒤 인터셉터가 깨지는가** —
  `EventProcessor.process`의 `if (result.type !== draft.type) { … break; }` 가 체인을 끊는다 → 정상.
