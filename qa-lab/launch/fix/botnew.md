# botnew 보고 — hand_swap3·frame_up 봇 정책 신설 (2026-08-28)

FIXBRIEF 지시: `BOT_UNUSABLE_AUGMENTS`에 남은 마지막 둘(`hand_swap3`·`frame_up`)에 봇
정책을 만들어 목록에서 뺀다. 밸런스(효과·수치·조건)는 손대지 않았다.

## 바꾼 것

| 대상 | 이전 | 이후 | 근거 | 파일:줄 |
|---|---|---|---|---|
| `BOT_UNUSABLE_AUGMENTS` | `["hand_swap3", "frame_up"]` | `[]` | balance.md: hand_swap3 387회 제시·0회 선택(픽률 구조적 0) | `packages/content/src/augments/botHelpers.ts:42`(현재 목록 위치) |
| `hand_swap3` (`bot:` 필드) | 없음 | `plan({intent:"advance", fleeting: give/take 단계, pick: 3단계 분기})` 신설 | botPlan.ts 설계(정책은 프롬프트마다 다시 불린다), future_sight의 2단계 선례 | `packages/content/src/augments/hand_swap3.ts:507~575`(대략) |
| `frame_up` (`bot:` 필드) | 없음 | `plan({intent:"disrupt", pick: 고립패+리치 상대 우선})` 신설 | 발동 자체는 대기 추정을 쓰지 않는다(재확인) | `packages/content/src/augments/frame_up.ts` 말미 |
| `botHelpers.ts` | — | `worstHandTiles`·`shantenIfSwapped` 신설 | hand_swap3의 넘길/가져올 3장 판단에 필요한 공용 도구 | `packages/content/src/augments/botHelpers.ts` (isolatedIndex 뒤) |
| `bot_policy_unusable.test.ts` | 목록 `["frame_up","hand_swap3"]` 고정 | 목록 `[]` 고정 + 두 증강의 단계별 선택을 검증하는 describe 블록 3개(각 3~4 케이스) 추가 | FIXBRIEF: 목록에서 빼면 테스트도 함께 고침 | `packages/content/test/bot_policy_unusable.test.ts` |
| `docs/27_AUGMENT_BOT_PLAYBOOK.md` | — | §8 "botnew 절" 신설(다른 담당 `botfix`의 §7은 그대로 둠) | 문서 규칙 — 각자 자기 절만 | `docs/27_AUGMENT_BOT_PLAYBOOK.md` §8 |

## 정책 설계 — 무엇을 어떤 의도로

### hand_swap3(등가교환) — 3단계, 각각 다른 질문

`intent: "advance"`. 세 프롬프트(지정 `swap3` → 넘길 3장 `swap3_give` → 가져올 3장
`swap3_take`)는 매번 다시 호출되므로 "한 번의 choose로 조율 불가"는 착시였다(같은
결론이 2026-08-06에 세 증강, 미래를 보는 자에서 이미 한 번 났었다).

- **지정** — 상대 손이 아직 안 보인다. 정보가 없으므로 손익 판단을 미루고 첫 `swap3`
  후보를 고른다(손익은 다음 두 단계가 정한다).
- **넘길 3장** — `worstHandTiles(view, holder, 3)`(신설, botHelpers.ts) — 내 손에서
  `isolatedIndex`(분열·조커와 같은 규칙)로 가장 고립된 패를 하나씩 탐욕적으로 3장
  골라낸다. 받을 패를 몰라도 "빼도 손해가 가장 적은 3장"은 항상 옳다.
- **가져올 3장** — 지정 순간 상대 손이 `revealTiles:{target}` 채널로 **진짜 kind**로
  보유자에게 공개된다(코어 `PlayerView.ts`가 그 tileId들을 진짜 kind로 채운다). 즉 이
  단계는 정보 부족 문제가 아니다. `shantenIfSwapped(view, holder, gave, takeKinds)`(신설)
  로 "넘긴 3장을 빼고 후보 3장을 더하면 샹텐이 몇이 되는가"를 모든 후보(상대 손
  C(13,3)까지)에 대해 계산해 최소 샹텐을 고른다. 넘긴 3장은 `worstHandTiles`를 그
  자리에서 다시 계산해 얻는다(손패는 give 단계에서 실제로는 움직이지 않으므로 같은
  입력 → 같은 결과가 보장된다).

### frame_up(누명) — 대기 추정 없이도 "명백히 자해가 아닌" 선택은 가능

`intent: "disrupt"`. 재확인 결과 발동 로직 자체(`frame_discard` 액션)는 대기 추정을
전혀 참조하지 않는다.

- **어떤 패를 버릴까** — `pickIsolatedDiscard(view, holder, options, ACTION)`(기존
  헬퍼, 리치류 안전패 선택과 동일)로 **제시된 옵션 중에서** 가장 고립된 패를 고른다.
- **누구에게 심을까** — `view.round.byPlayer[p].riichiDeclared`로 **드러난 리치**가
  있는 상대를 우선한다(심긴 패가 그 사람 대기와 맞으면 후리텐으로 막고, 안 맞아도
  손해가 없다). 없으면 첫 후보.

## 실전 검증 — 실제로 봇이 쓰는가

`qa-lab/harness.ts`는 사람 페르소나(`PersonaAgent`) 전용이라 봇 정책(`AugmentDef.bot`)
검증에는 맞지 않아서, `packages/server/src/bot/arena.ts`가 쓰는 것과 같은 `BotAgent` +
`HanchanController` 조합으로 별도 스크립트를 짰다: `qa-lab/launch/fix/botnew/verify.ts`.
네 자리 전부 `BotAgent`, p0에 `hand_swap3`, p1에 `frame_up`을 프리셋으로 강제하고
반장전을 여러 판 돌려 `HandSwap3Swapped`·`creditTo`가 실린 `TileDiscarded` 이벤트를
집계했다.

**1차 실행 — 버그 발견.** frame_up은 곧바로 발동했지만 hand_swap3는 8국을 돌아도
**단 한 번도 지정(`swap3`)이 발동하지 않았다.** `DEBUG_SWAP3=1`로 매 프롬프트의
`ctx.options`를 찍어 보니 원인이 나왔다 — 지정 단계 pick의 마지막 줄이
`return options[0] ?? null`이었는데, `ctx.options`는 **그 증강 하나의 후보가 아니라
그 순의 전체 후보**(버림·후로·리치가 섞인 배열)였다. `swap3`가 옵션에 있어도 배열
앞쪽은 거의 항상 `discard`라서, 정책이 매번 "그냥 버림"을 골라 지정이 영원히 안
열렸다. 단위 테스트(`bot_policy_unusable.test.ts`)는 옵션 목록을 처음부터 그 증강
타입만으로 좁혀 만들었기 때문에 이 버그를 못 잡았다 — 실전 검증이 필요했던 이유가
정확히 이것이다. `options.find((o) => o.type === AIM_ACTION)`로 고쳤다
(`packages/content/src/augments/hand_swap3.ts`).

**2차 실행 — 확인.**
```
[hand_swap3] 교환 성사: {"holder":"p0","target":"p1","gives":[1,109,121],"takes":[11,15,34]}
[hand_swap3] 교환 성사: {"holder":"p0","target":"p1","gives":[0,68,111],"takes":[8,81,96]}
[hand_swap3] 교환 성사: {"holder":"p0","target":"p1","gives":[110,124,135],"takes":[14,31,49]}
[frame_up] 지목 버림: {"player":"p1","tileId":118,"riichi":false,"riichiCost":0,"creditTo":"p0"}
[frame_up] 지목 버림: {"player":"p1","tileId":115,"riichi":false,"riichiCost":0,"creditTo":"p0"}
[frame_up] 지목 버림: {"player":"p1","tileId":34,"riichi":false,"riichiCost":0,"creditTo":"p3"}
rounds=7
crashed=no
```
두 증강 모두 여러 국에서 실제로 발동했고, `[BotAgent] 증강 ... 정책이 제시되지 않은
옵션을 돌려줬다` 경고나 크래시 없이 대국이 끝까지 진행됐다. 스크립트는
`qa-lab/launch/fix/botnew/verify.ts`에 남겨 뒀다(`DEBUG_SWAP3=1 npx tsx
qa-lab/launch/fix/botnew/verify.ts`로 재현 가능).

## 게이트

```
npx vitest run packages/content/test/bot_policy_unusable.test.ts packages/content/test/bot_policy_coverage.test.ts
# → 2 files passed, 22 tests passed

npx vitest run packages/content
# → 전체 통과 (exit 0)

npm run typecheck:content
# → 통과, 에러 0
```

## 바꾸지 않기로 한 것

- **효과·수치·조건은 전혀 건드리지 않았다** — `hand_swap3.ts`·`frame_up.ts`의 액션
  정의(`aimAction`/`giveAction`/`takeAction`/`frameAction`)와 쿨다운·횟수·검증 로직은
  주석 한 줄도 안 바꿨다. 바뀐 것은 파일 하단의 `bot:` 필드(신설)와 import뿐이다.
- **`docs/27` §7(botfix 담당 절)은 읽기만 하고 편집하지 않았다.** §7.1이 "hand_swap3
  정책이 코드에 없다"고 적어 둔 것은 이 작업 이전 시점의 정확한 관찰이었고, 지금은
  §8에서 "다시 붙였다"고만 이어서 적었다 — §7의 문장을 지우거나 고치지 않았다.
- **`isolatedIndex`를 hand_swap3의 취할 3장 판단에는 쓰지 않았다** — 상대 손이 이미
  `revealTiles`로 진짜 kind가 보이므로 고립도 어림이 아니라 `shantenIfSwapped`로 실제
  샹텐을 직접 세는 쪽이 더 정확하고, 기존에 없던 새 계산이 필요해 `botHelpers.ts`에
  두 헬퍼(`worstHandTiles`·`shantenIfSwapped`)를 신설했다(둘 다 이미 있는
  `isolatedIndex`·`shantenIfChanged`를 감싼 것뿐, 새 판정 규칙은 아니다).
