# 10_AUGMENT_SYSTEM
Version : 1.0
Status : Active
Last Updated : 2026-07-15

이 프로젝트의 주인공. 증강(Augment)의 정의·드래프트·설치.
구현: `packages/core/src/augment/`

**설계 리트머스**: 새 증강을 추가하는 데 엔진(engine/·mahjong/) 코드를 한 줄도
고치지 않아야 한다. 증강은 오직 등록 API만 쓴다.

---

# 1. 증강 하나의 해부도

증강은 **데이터 + install 함수**다. install은 획득 시 각 Registry에 자기 능력을 등록한다.

```ts
defineAugment({
  id: "cheap_riichi",
  tier: "silver",
  name: "가벼운 선언",
  description: "리치 비용이 500점이 된다.",
  install(ctx) {
    ctx.setHolderRule("riichi.cost", 500);   // 이 증강 보유자에게만
  },
});
```

`install(ctx)`가 받는 것:

| 도구 | 하는 일 | 뒤에서 |
|------|---------|--------|
| `ctx.setHolderRule(rule, value)` | 보유자에게만 규칙 값 고정 | RuleRegistry.addModifier (player-scoped) |
| `ctx.reaction(on, react)` | 이벤트 후 새 이벤트 방출 | EffectRegistry.register |
| `ctx.interceptor(on, fn)` | 이벤트를 수정·취소·대체 | EffectRegistry.register |
| `ctx.engine` | 그 외 모든 것 (새 Action·Zone·역…) | 직접 접근 |

- 모든 등록의 `source`는 인스턴스 id(`aug:<player>:<augmentId>`)다.
  증강 파괴가 필요해지면 `removeBySource`로 규칙·훅이 한 번에 사라진다.
- **install은 순수하지 않다** (Registry를 바꾼다). 그래서 GameState가 아니라
  DraftController가 픽 직후에 호출한다 (§4).

---

# 2. 등급과 레이어

증강 등급은 그대로 RuleRegistry의 Layer가 된다. 높은 등급이 최종 발언권을 가진다.

| 등급 | Layer | 성격 |
|------|-------|------|
| Silver | 100 | 규칙을 크게 훼손하지 않음 |
| Gold | 200 | 플레이에 큰 영향 |
| Prism | 300 | 규칙 자체를 뒤집음 |

같은 규칙을 여러 증강이 건드리면 (Layer, 획득 순서)로 결정적으로 합성된다 (04·05와 동일).

---

# 3. 드래프트 (2026-07-15 확정)

- 스케줄: **게임 시작 시 1회 + 남장 진입 시 1회 = 게임 전체 총 2개.**
- 각 플레이어에게 **개인별 랜덤 3개 제시 → 1개 선택**. 선택 결과는 **전원 공개**.
- 3개 뽑기: 등급 **고정 가중치**(기본 Silver 60 / Gold 30 / Prism 10)로 등급을 고르고
  등급 내 균등, 비복원 추출. 이미 보유한 증강은 제외.

## 드래프트의 결정성

- 3개 선택지는 **`(게임 시드, 스테이지, 플레이어)`에서 파생된 별도 PRNG**로 뽑는다.
  게임 진행용 PRNG(배패)를 소비하지 않는다 — 선택지는 UI일 뿐, **상태를 바꾸는 것은
  오직 "무엇을 골랐는가"(픽)**이기 때문이다.
- 그래서 리플레이는 픽(AugmentDrafted 이벤트)만 있으면 재현된다. 선택지는 언제든 재계산 가능.

## 규칙 키

```
augment.draft.weight.silver = 60
augment.draft.weight.gold   = 30
augment.draft.weight.prism  = 10
augment.draft.choices       = 3
```

가중치가 Rule이므로, "Prism 확률을 높이는" 메타 증강도 나중에 가능하다.

---

# 4. 상태·이벤트·설치의 관계

**GameState가 진실이다.** `PlayerState.augments`(증강 id 목록)가 SSOT.

```
draftPick (Action)
   ↓ toEvents
AugmentDrafted (Event) ──Reducer──▶ state.players[p].augments += id   (순수)
   ↓ (DraftController가 픽 직후)
installAugment(engine, def, holder)  ──▶ Registry에 능력 등록          (부수효과)
```

- 이벤트 로그를 재생할 때도 AugmentDrafted 시점에 install을 호출해야 뒤 이벤트가
  증강 효과를 본다. `rebuildAugments(game, catalog)`가 state.augments 전체를 재설치한다
  (게임 재구성·리플레이용).
- Registry는 GameState.augments에서 **파생**된다 — 이 규율이 리플레이 안정성을 준다.

---

# 5. 첫 증강 7종 (등록 API 실증)

각각 **서로 다른 등록 지점**을 써서 "엔진 수정 없이"를 증명한다.

| id | 등급 | 효과 | 등록 지점 |
|----|------|------|-----------|
| cheap_riichi (가벼운 선언) | Silver | 리치 비용 500 | Rule Modifier |
| tsumo_bonus (쯔모의 기쁨) | Silver | 쯔모 화료 시 +1000점 | Effect Reaction → ScoreChanged |
| iron_wall (철벽) | Gold | 후리텐 무시하고 론 가능 | Rule Modifier (win.furiten.enabled) |
| vengeance (설욕) | Gold | 방총 실점 절반 (그만큼 화료자 이득 감소) | Effect Interceptor (RoundSettled 수정) |
| open_riichi (개문선언) | Prism | 부로한 손으로도 리치 가능 | Rule Modifier (riichi.requiresClosed) |
| yakuless_win (무형화료) | Prism | 역 없이도 화료 가능 | Rule Modifier (win.requiresYaku) |
| discard_recall (회수) | Prism | 쯔모패를 버리고 자기 버림패 하나 회수 (게임당 1회) | **새 프롬프트 액션** + augmentData |

- 위 6종을 위해 엔진에 새로 판 것은 **규칙 3개**(`win.requiresYaku`,
  `win.furiten.enabled`, `riichi.requiresClosed`)를 표준 규칙에 정의하고,
  표준 액션의 검증이 이 규칙을 **읽도록** 한 것뿐이다. 이제 이 규칙들을 건드리는
  수백 개 증강이 추가 코드 없이 가능하다.
- `vengeance`는 점수 보존을 지킨다(화료자 이득도 같은 만큼 감소). Rule #4의 대응:
  전원 공개이므로 상대는 보유자에게 과감히 쏘는 대신 자멸을 유도할 수 있다.
- `discard_recall`은 **차터의 대표 예시("버림패 회수")** 로, 새 플레이어 액션을
  엔진 수정 없이 프롬프트에 노출하는 §6의 확장 지점을 실증한다. 새 이벤트
  `RecallPerformed`와 그 Reducer, 새 액션 `recall`을 install에서 등록하고
  (여러 보유자가 있어도 `has()` 가드로 한 번만), 보유자 턴에 자기 버림패마다
  후보를 제시한다. 손패 수는 보존된다.

---

# 6. 확장 지점 (✅ 구현됨) 과 남은 과제

## ✅ 새 프롬프트 액션 (2026-07-15 해소)

증강이 새 플레이어 액션을 턴 프롬프트에 노출할 수 있다.

- `ctx.holderTurnOptions(build)` — 보유자 턴에 후보 ActionOption 목록을 제공한다.
  FlowController가 각 후보를 **validate로 다시 걸러** 합법인 것만 제시한다
  (프롬프트의 진실은 언제나 validate — Server Authority).
- 새 액션·이벤트·Reducer는 `ctx.engine`으로 직접 등록한다.
- `discard_recall`이 이 경로를 실증한다.
- **액티브 증강 UI**: 클라이언트는 `AUGMENT_ACTION_TYPES`에 속한 프롬프트 옵션을
  전용 "✦ 액티브 증강" 버튼으로 모은다. 여러 액티브 증강을 동시에 보유해
  후보가 2개 이상이면, 버튼을 누르면 **증강 이름이 붙은 선택 메뉴**가 열려
  원하는 증강의 액티브를 골라 발동한다 (`ACTION_AUGMENT`가 액션→증강 매핑).
  예: `cliff_bloom`(bloom_kan — 영상개화 확정 안깡), `no_retreat`(declare_no_retreat — 리치 전념 선언).

## ✅ 증강 전용 데이터 (2026-07-15 해소)

- GameState에 `augmentData: Record<string, unknown>` (게임 단위, 국이 바뀌어도 유지).
- `AugmentDataSet` 이벤트 + 범용 Reducer로만 변경한다 (SSOT). "1회 한정" 능력이
  `augmentData["recall_used:p0"]` 처럼 상태를 남긴다.
- **리플레이 주의**: 증강이 등록하는 새 이벤트 타입의 Reducer는 순수 재적용 시에도
  필요하므로, ReplayReader는 `AugmentDrafted`를 만나면 그 증강을 `installAugment`한다
  (드래프트 순서상 새 이벤트보다 먼저 등록됨). 재구성 검증 완료.

## ✅ 콘텐츠 팩 대량 확장 (2026-07-16 해소)

`@majak/content` 패키지(30종)가 아래 확장 지점들로 구현되었다. 코어에 추가된 것은
**범용 규칙·이벤트뿐**이며, 증강별 하드코딩은 없다.

- **역 레지스트리 접근**: `ctx.yaku?: YakuRegistry` — 커스텀 역 등록/교체
  (`installAugment(engine, def, holder, { yaku })`; DraftController·ReplayReader가 전달).
  보유자 판별은 `WinContext.winnerId` + content의 `yakuHolders(yaku, id)` 패턴.
- **채점 변형 규칙**: `scoring.wrapRuns`(순환 순자) / `scoring.totalSets`(5멘쯔) /
  `scoring.kokushiMeldAssist`(펑 국사) / `win.blockedYaku`(역 봉인) —
  `scoringOptionsOf`가 DecomposeOptions로 묶어 모든 판정 지점에 적용.
- **점수 훅**: `score.extraHan`(동적 추가 판) / `RoundSettledPayload.winInfos`
  (화료 상세 — Interceptor로 역만 무효화·본장 보너스 등) / `win.treatAsDealer`.
- **패 변형 이벤트**: `TileKindChanged` — kind·attrs 변경 (수패 통일, 아카도라 부여).
  난수를 소비하면 payload.prngState로 PRNG 상태를 되돌려 놓는다 (Issue 002의 실전 활용).
- **정보 채널**: `view:{pid}:{key}` / `view:*:{key}` augmentData 규약 → PlayerView.augmentView (09 §7.5).
- **기타 규칙**: `deal.handSize` / `turn.direction` / `discard.blockedKinds` /
  `call.chi.fromAnyone` / `draw.notenExempt`.

## 남은 과제

- **커스텀 Zone·새 페이즈 증강**: 원시 기능(Zone·phase 데이터화)은 이미 있으나,
  가시성(09)·프롬프트와의 결합 실증이 남았다.
- **reaction 페이즈 프롬프트 확장**: 현재 훅은 턴 프롬프트 전용. 부로 반응 단계에
  새 선택지를 넣는 증강은 유사한 reactionOptions 훅이 필요하다.
- **다중 선택 페이로드 UI**: "내 패 3장을 직접 고르는" 류의 액션은 프롬프트가
  후보 열거 방식이라 조합 폭발이 난다. 현재는 무작위 선정으로 대체 —
  클라이언트 다중 선택 → 서버 검증 경로가 생기면 확장.
