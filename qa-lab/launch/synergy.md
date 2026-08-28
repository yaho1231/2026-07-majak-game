# synergy — 4개+ 동시 보유 / 적대적 조합 / 배수 폭주 (2026-08-28)

담당: synergy. `docs/40_AUGMENT_SYNERGY_QA_2026-08-23.md`(2~3종 조합 "의미" 검증, 7축)를
전제로, 그 라운드가 다루지 않은 **① 4~5종 동시 보유 시 순서 의존 ② 적대적 조합
③ 배수·뱅크 발행 스택 폭주**를 본다. 재현 스크립트는 `qa-lab/launch/synergy/`.

## 방법

먼저 코드(`settleStages.ts`)를 읽고 "정산 순서는 무엇이 정해야 하는가"를 적은 뒤,
`qa-lab/harness.ts`(runMatch)로 같은 시드·같은 증강 조합을 순서만 바꿔 실제 반장전을
완주시켜 결과를 대조했다. 워크트리 workspace 링크 확인 완료
(`node_modules/@majak/core` → 워크트리 `packages/core` 실경로).

---

### [P2] 확정 — preset 배열 순서(내 증강 획득 순서)가 **다른 좌석의 드래프트 결과**까지 바꾼다

- 위치: `packages/core/src/match/HanchanController.ts:1145` (`installPreset` — `Object.entries(preset)`
  순서대로 `draftPick`을 제출한 뒤 `installAugment`) · `qa-lab/launch/synergy/order_independence.ts`
- 증상: p0에게 같은 5종 증강(`spy, jackpot, big_hand, aotenjou_ceiling, counter`)을
  **순서만 바꿔** 지급했다. p1~p3는 프리셋이 비어 있어 순수 무작위 드래프트다. p0의
  보유 순서만 바꿨는데(정산 로직·드래프트 대상 아닌 p1~p3의 증강 구성까지) 결과가 달라졌다.
- 재현/근거: `tsx qa-lab/launch/synergy/order_independence.ts` — 5시드(1,2,3,42,777) 중
  **2건**(seed 1, seed 3)이 최종 점수가 달랐다.
  ```
  seed=1 scoresA={"p0":23500,"p1":22500,"p2":30500,"p3":23500}
  seed=1 scoresB={"p0":26800,"p1":19500,"p2":28200,"p3":25500}
  seed=3 scoresA={"p0":24000,"p1":28000,"p2":24000,"p3":24000}
  seed=3 scoresB={"p0":25000,"p1":25000,"p2":25000,"p3":25000}
  ```
  seed=1의 `actionsTaken` 상세(`order_independence_detail.ts`)를 보면 p1~p3가 **완전히 다른
  증강을 뽑았다** — A에는 `honor_recall, declare_fog, ankan×1, red_touch` 등이 있고 B에는
  `parasite_attach, danger_sense_use, rank_gate_mark, bluff_pon` 등 A에 아예 없던 액션이 나온다.
  두 실행 모두 p0의 최종 보유 증강 집합(5종)과 그 정산 결과 자체는 `settlePriority`
  (=`stage + seat + idFraction(augmentId)`, 획득 순서 무관)를 코드로 확인했으므로 정산
  단계 자체가 순서에 의존하는 것은 아니다 — 달라진 것은 **p0와 무관한 좌석들이 드래프트
  단계에서 뽑는 증강 그 자체**다.
- 판정: **확정**(증상은 실행으로 재현) / 근본 원인은 **의심** — `installPreset`이 p0의
  `draftPick`을 좌석별 for문 안에서 **id 배열 순서대로** 순차 제출하는데, 이 제출이 같은
  매치의 공유 PRNG 스트림(또는 드래프트 풀 상태)의 소비 시점에 영향을 줘서, 이후 실제
  드래프트 스테이지에서 p1~p3가 뽑는 결과가 밀린 것으로 보인다. 정확한 소비 지점(어느
  `Prng.int`/`Prng.next` 호출이 갈리는지)까지는 이번 조사에서 추적하지 못했다.
- 영향: 실전에서는 이 경로(프리셋 강제 지급)가 없으므로 QA 하네스 특유의 인공물일 수
  있다. 하지만 진짜 게임에서도 "같은 증강을 다른 순서로 드래프트한 p0"가 존재하면
  (예: 1국에 A→B로 픽 vs B→A로 픽), 그 뒤 p0의 드래프트 확률(docs/26의 시너지 편향)이
  최신성 가중치로 순서에 반응하도록 **의도적으로 설계**돼 있다 — 그런데 이번에 관측된
  것은 p0 자신이 아니라 **아무 관련 없는 다른 좌석**의 결과가 흔들린 것이라 의도된
  설계로 설명되지 않는다.
- 제안: `installPreset`(HanchanController.ts:1145)과 실제 드래프트 스테이지가 같은
  `Prng` 인스턴스를 얼마나 공유하는지, `AugmentRegistry.rollFrom`/`pickWeighted`가
  이미 설치된 증강 수·소비된 rng 호출 횟수에 의존하는 지점이 있는지 확인 필요. QA
  하네스만의 문제로 판명되면(실제 서버 플로우엔 이런 프리셋 주입 경로가 없다) 문서에만
  남기고 넘어가도 된다 — 그 확인이 다음 라운드 숙제다.

---

### [P2] 확정 — 동시에 뜨는 여러 증강 액션의 화면상 순서는 여전히 "설치 순서" 그대로다 (정렬 없음)

- 위치: `packages/core/src/mahjong/flow/FlowController.ts:425-431`(턴 옵션), `:554-560`(반응 옵션):
  ```ts
  for (const provider of this.engine.turnOptionProviders) {
    for (const cand of provider(state, player)) {
      if (this.validateOk(player, cand.type, cand.payload)) {
        options.push({ type: cand.type, payload: cand.payload });
      }
    }
  }
  ```
  `packages/core/src/engine/GameEngine.ts:154-156`(`registerTurnOptions`/`registerReactionOptions`,
  단순 `push()` — 정렬 없음). 등록 순서는 `installAugment` 호출 순서 = 드래프트 픽 순서
  (`DraftController.ts:591, 680`)를 그대로 따른다.
- 증상: 여러 증강이 같은 순간에 각자의 액티브 버튼을 제시하면(예: 스텔스 리치·오픈
  리치·모 아니면 도처럼 리치 선언 버튼이 겹치는 부류), 그 옵션 배열의 순서가 **획득
  순서**로 고정된다. 사람 플레이어는 버튼을 보고 고르므로 상관없지만, **인덱스 기반
  동점 처리를 쓰는 로직**(예: `BotAgent`의 동점 타이브레이커, 또는 QA 하네스
  `PersonaAgent`의 `augs[this.rng.int(augs.length)]`)은 순서가 바뀌면 다른 선택을 한다.
- 근거: 위 코드 인용 + `settleStages.ts:13`의 주석이 같은 패턴을 다른 자리(정산 인터셉터)
  에서 이미 지적한다 — "같은 tier끼리는 `installAugment` 호출 순서 = 드래프트 픽 순서로
  갈렸다." 정산 쪽은 `settlePriority`로 근본 수정됐지만(§전제), **옵션 프로바이더 쪽은
  그 수정이 미치지 않았다.**
- 판정: **확정**(코드 인용) — docs/40 §3이 찾은 `no_retreat × stealth_riichi`
  (보유 순서로 한쪽이 영구히 안 눌리는 문제, 158,100 vs 224,500)는 이 구조의 **한 사례**였고
  수정은 `BotAgent`의 가중치 동점 타이브레이커만 셔플로 고쳤다(문서 §3). **원인인 "옵션
  배열이 설치 순서"라는 사실 자체는 남아 있다** — 그래서 앞으로 추가되는 새 동시-액티브
  증강 쌍마다, 인덱스/순서에 의존하는 어떤 정책(봇이든 QA 하네스든)이든 같은 유형의
  버그가 재발할 수 있는 구조적 위험이 여전하다.
- 제안: `FlowController`가 옵션을 모을 때 `augmentId` 기준으로 정렬해 두면(정산 쪽
  `settlePriority`가 쓰는 `idFraction`과 같은 발상), 최소한 "순서가 프로바이더 등록
  순서에 우연히 끌려간다"는 전제 자체를 없앨 수 있다.

---

### [P3] 확정(코드 추적) — `spy × parasite` 좌석 순서 의존을 수치로 정량화 (docs/40 §4 기존 항목의 후속 확인, 신규 아님)

- 위치: `packages/content/src/augments/spy.ts:150-176`, `packages/content/src/augments/parasite.ts:104-120`
- docs/40 §4는 이 조합을 "같은 `Transfer` 단계 안의 좌석 순서로 갈린다 / 어느 쪽이
  옳은지 설계 답이 없다"로만 남기고 크기를 재지 않았다. 코드를 직접 추적하면:
  - spy(`spy.ts:166`): `gain = min(deltas[winner](현재값), worth(고정값))` → 훔친 만큼
    `deltas[winner]`를 **즉시 차감**한다.
  - parasite(`parasite.ts:112-118`): `d = deltas[host](현재값)`, `share = round(d/200)*100`,
    호스트에게서 `share`만큼 **즉시 차감**해 자신에게 더한다.
  - 두 증강 다 `SETTLE_STAGE.Transfer`이므로 `settlePriority`는 **보유자의 좌석 번호**로
    갈린다(seat이 작은 쪽이 먼저). 손으로 계산하면:
    - **스파이가 먼저 돌면**: `deltas[winner]`가 거의 0으로 깎인 뒤 기생충이 읽는 `d`도
      거의 0 → **기생충 몫이 0에 수렴**한다(카드가 약속한 "숙주가 얻는 점수의 절반"이
      통째로 사라진다).
    - **기생충이 먼저 돌면**: 정확히 절반을 가져간 뒤, 스파이는 `min(남은 절반, worth)` =
      **남은 절반만** 가져간다 — 즉 스파이·기생충이 정확히 50/50으로 나뉜다.
  - 즉 좌석 배치 하나로 "한쪽이 완전히 0을 받는다" ↔ "정확히 반반"이라는, **작은 오차가
    아니라 전부-대-반반의 큰 차이**가 결정된다.
- 판정: 확정(코드 인용 + 수식 추적). 실게임 재현(완전한 매치 실행)은 시간 관계상
  못했다 — spy·parasite 둘 다 같은 화료를 동시에 지정/기생시키는 상황을 자연스러운
  플레이로 강제하기 어려워 유닛 수준 추적에 그쳤다. 그래서 "확정"은 코드 로직에 대한
  것이고, 실전 발생 빈도는 별도다.
- 제안: docs/40 §4가 이미 "설계 답이 필요하다"고 적어 둔 대로이지만, 이번 수치로
  **"어느 쪽이 이겨도 카드 설명과 다른 결과가 나온다"**(스파이가 이기면 기생충의
  "절반"이 거짓, 기생충이 이기면 스파이의 "화료 값 전부"가 거짓)는 것이 분명해졌다.
  단순히 seat 순서에 맡기지 말고, 둘 다 걸리면 **"먼저 지분을 나누고 남은 것을
  경쟁"** 하는 별도 규칙(예: 스파이·기생충이 겹치면 각각 절반씩 자기 몫의 절반만 —
  즉 원래 값의 1/4씩?)을 명시하거나, 최소한 "충돌 시 동시 발동을 막는다"는
  `conflicts` 처리를 검토해야 한다.

---

## 배수·뱅크 발행 스택 폭주 — 실측, 문제 없음 확인

- 스택: `aotenjou_ceiling`(상한 해제) + `jackpot`(0.5~3배) + `big_hand`(만관 하한) +
  `counter`(직격 +4판) + `devils_advance`(만관 이상마다 9,000 추가 징수) 5종을 p0에게
  전부 지급, masher 페르소나 4인, tonpuu 6시드 + hanchan 17시드(총 23판) 완주.
- 재현: `tsx qa-lab/launch/synergy/multiplicative_blowup_small.ts` (tonpuu 6시드),
  `tsx qa-lab/launch/synergy/multiplicative_blowup.ts` (hanchan seed 1~17, seed 16·17에서
  중단 — 아래 참고)
- 결과: **SCORE_ABSURD(|점수|>1,000,000)·SCORE_NAN 신호 0건.** 관측된 최종 점수 범위는
  대부분 24,000~41,800이고, 예외적으로 hanchan seed=16이 12국 연장(정상 8국보다 김) 끝에
  `p1(스택 미보유 좌석) 105,000 / p0 14,000 / p2,p3 각 -3,000`를 찍었다.
- 판정: 스택 5종 자체의 **지수적 폭주는 재현되지 않는다** — `docs/26_AUGMENT_SYNERGY.md`
  §5.3의 2026-08-07 정정(아오텐죠를 선형화한 뒤 "3,145만 점"이 더 이상 재현되지 않는다는
  기록)과 일치한다. **확정**.
- seed=16의 105,000점(p1, 스택과 무관한 좌석)은 **의심**으로 남긴다 — 12국 연장전에서
  오야가 여러 번 반복되며 쌓인 정상적인 본장 누적 + 큰 손 하나가 겹쳤을 가능성이 높지만,
  시간 관계상 그 국의 정산 로그를 따로 뜯어보지 못했다. 다음 라운드가 이어서 볼 만하다
  (재현: `multiplicative_blowup.ts` seed 16, hanchan).

---

## 확인 완료 — 문제 없음 (다음 라운드가 다시 파지 않아도 됨)

- **정산 인터셉터 우선순위(`settlePriority`) 자체는 획득/드래프트 순서와 무관하다.**
  `settleStages.ts`의 `settlePriority(stage, seat, augmentId) = stage + seat + idFraction(augmentId)`를
  코드로 확인 — `idFraction`은 augmentId 문자열의 FNV-1a 해시일 뿐 설치 순서를 참조하지
  않는다. 즉 **같은 좌석이 같은 단계(stage)의 증강 여러 개를 들고 있어도, 그 안에서의
  실행 순서는 드래프트로 어떤 순서에 집었는지와 무관하게 항상 같다.** (다만 §P2-A가
  보여주듯 "정산 순서"가 아니라 "그 전 단계인 드래프트 결과 자체"가 흔들리는 별개
  경로는 남아 있다.)
- **배수(`Multiply`)·뱅크 발행(`BankTopUp`/`BankFloor`)·정액 이전(`Transfer`)·방어(`Shield`)의
  단계 순서**(`SETTLE_STAGE`)는 문서화된 대로이고, 5종 스택을 실제로 돌려도 그 순서를
  깨는 신호(SCORE_DRIFT_UNEXPLAINED)가 나오지 않았다.
- **아오텐죠(뚫린 천장) 지수 폭발**은 이미 고쳐진 대로 선형이며(§위), 23판 실측에서
  재발하지 않았다.

## 요약 표

| 심각도 | 제목 | 판정 |
|---|---|---|
| P2 | preset 순서가 무관한 좌석의 드래프트 결과까지 바꾼다 | 확정(증상) / 원인 의심 |
| P2 | 동시 액티브 옵션 배열이 설치 순서에 묶여 정렬되지 않는다 | 확정 |
| P3 | spy×parasite 좌석 순서 의존 — 전부 대 반반의 큰 차이로 정량화 | 확정(코드 추적, 기존 항목 재확인) |
| — | 배수·뱅크 5종 스택 폭주 재현 안 됨 | 확정(문제 없음) |
| 의심 | hanchan seed=16 12국 연장에서 스택 미보유 좌석이 105,000점 | 의심, 미해결 |

## 재현 스크립트

- `qa-lab/launch/synergy/order_independence.ts` — 5증강 preset 순서 역전, 5시드 비교
- `qa-lab/launch/synergy/order_independence_detail.ts` — seed=1의 actionsTaken 상세 diff
- `qa-lab/launch/synergy/multiplicative_blowup_small.ts` — 배수 5종 스택, tonpuu 6시드
- `qa-lab/launch/synergy/multiplicative_blowup.ts` — 배수 5종 스택, hanchan 17시드
- `qa-lab/launch/synergy/checkconf.ts` — 조사에 쓴 증강들의 conflicts/modes 확인용
