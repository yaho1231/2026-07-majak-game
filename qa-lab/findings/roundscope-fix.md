# 국 경계 `augmentData` 키 누수 일괄 정리 (cross 확정 3 후속)

`findings/cross.md` 확정 3 — "국 번호를 **이름에 박은** `augmentData` 키를 아무도 지우지 않아
매치 내내 단조 증가한다" — 를 전수로 정리했다. 지난 세션이 만든 공용 헬퍼
`packages/content/src/augments/roundScope.ts`(`roundScopedKey`)를 **남은 전부**에 적용했다.

## 코어 규약 (먼저 확인한 것)

- `packages/core/src/engine/state/GameState.ts:218-238` — `ROUND_SCOPED_MARK = "#round"`,
  `isRoundScopedKey(key) = key.endsWith(MARK)`.
- 정리 지점 `:592-598` (`setupRound`) — 새 국 리듀서가 `augmentData`를 훑어 표식 붙은 키를
  통째로 버린다. 증강의 `ROUND_STARTED` 리액션은 이 리듀서 **뒤에** 도므로 새 국 값을
  다시 실을 수 있다.
- 따라서 표식은 **키 이름 맨 끝**에 와야 한다. `roundScopedKey`가 그 자리에 붙인다:
  `{id}:{name}:{장-국-본장}[:{seat}]#round`.

## 판단 기준

키 이름 안에 `roundKey(state)`가 들어 있으면 **그 값은 이미 국 스코프다** — 다음 국에는
키 이름 자체가 달라져 아무도 읽지 못한다. 즉 표식을 붙여 지우는 것은 **읽기 의미를 전혀
바꾸지 않고** 삭제만 얻는다. 그래서 "이름에 국 번호가 박힌 키"는 예외 없이 전환 대상으로 봤고,
매치 스코프여야 하는 값은 애초에 이름에 국 번호가 없어(`{id}:used:{seat}` 꼴) 손대지 않았다.

## 갈아 끼운 것 — 49개 파일 · 71개 키

`roundScopedKey(ID, "<name>", state, <seat>)` 형태로 일괄 전환.

| 파일 | 키 이름 |
|---|---|
| all_or_nothing | `uses` `active` |
| blood_contract | `yaku` |
| bluff_pretense | `used` |
| bottom_deal | `armed` |
| cliff_bloom | `kans` `bloomed` `pick` |
| conjure_draw | `pending` `used` |
| danger_sense | `used` |
| dead_wall_master | `swaps` |
| dora_afterimage | `recalled` (score-b 의심 2가 지목한 것) |
| foresight | `used` `turn` `ordered` `reveal` |
| free_riichi_discard | `snap` |
| future_sight | `stacks` `turns` `last` `armed` |
| genesis | `flipped` |
| giant_god | `tsumo` `used` |
| grave_rob | `robbed` |
| haitei_lord | `fired` |
| hand_swap3 | `target` `left` `give` `done` |
| hidden_blade | `declared` |
| hidden_river | `fog` |
| invincible | `active` |
| jackpot | `mult` |
| joker | `on` |
| meld_dissolve | `used` `nagashiBroken` |
| no_ron_pact | `declared` |
| open_riichi_reveal | `declared` |
| parasite | `target:{holder}` (아래 주 참고) |
| peek_riichi_waits | `used` `forged` |
| picky_eater | `done` `mine` |
| pond_snatch | `taken` |
| rank_gate | `mark` |
| riichi_seal | `sealed` |
| riichi_upgrade | `seal` |
| rinshan_preview | `used` |
| scapegoat | `target` |
| seat_swap | `round` |
| silent_pact | `used` |
| silent_swap | `used` `taken` |
| soul_strike | `active` `left` `declared` |
| spy | `marked` |
| stealth_riichi | `active` |
| suit_unify | `unified` |
| table_flip | `used` |
| take_back | `last` |
| tenpai_scan | `uses` |
| tile_split | `used` |
| time_stop | `armed` `used` |
| triple_peek | `on` |
| ura_peek | `used` `swapped` |
| xray_hand | `active` |

(앞 세션에서 이미 전환된 `call_seal` `brief_fog` `hourglass` `push_riichi` `frame_up` 5종은 그대로.)

**parasite 주** — 원래 모양이 `parasite:target:{holder}:{roundKey}`로 좌석이 앞에 있다.
`roundScopedKey("parasite", \`target:${holder}\`, state)`로 불러 **키 모양을 그대로 두고 표식만**
얹었다. 순서를 바꾸면 이 키를 `^parasite:target:(p\d):` 정규식으로 파싱하는 기존 qa-lab 프로브
(`qa-lab/disrupt-a/{run,inv,probe_uses}.ts`)가 **조용히 아무것도 못 찾게** 되기 때문이다.

## 그대로 둔 것 — 사유

### (1) 매치 스코프 값 (이름에 국 번호가 없다 → 애초에 누수가 아니다)
- 게임당 사용 횟수: `{id}:used:{seat}` / `matchUses`·`counterOf` 계열 (`util.ts`의 규약 주석이
  *"usesKey에는 roundKey를 섞지 않는다 — 게임(매치) 전체에 걸쳐 누적된다"*고 못 박아 둠).
- 쿨다운 기준점 (`cooldownReady`), 누적 게이지(`let_it_ride:streak`), 드래프트 장부
  (`draft:done:*`, `augment:stage:*`), `sign_flip:armedRound`, `spy:mark:{seat}` 같은
  "이 게임에서 한 번 지정" 값.
- 키 개수가 좌석 수 × 증강 수로 **묶여 있어** 국이 늘어도 증가하지 않는다.

### (2) `roundKey`를 **값**으로 쓰는 곳 (키가 아니다 → 전환 불가·불필요)
- `big_hand`/`no_retreat`의 `declaredKey` — 고정 키(`{id}:round:{seat}`)에 "선언한 국"을
  문자열로 담고 현재 국과 **비교**한다(`util.ts`의 `armedRoundKey` 규약과 같은 꼴).
  키가 좌석당 1개로 고정이라 쌓이지 않는다.
- `alchemist`/`tile_dyeing`의 `currentTurnSig` — `{roundKey}:{discardCount}` 를 **턴 서명 값**으로
  고정 키에 담는다. 역시 좌석당 1개.
- `ankan_dora:105`, `rank_gate:81`, `foresight:192` — 이벤트 payload의 `round:` 필드.
- `palm_flip:167` — `roundViewKey` 채널(뷰 채널은 이미 표식이 붙는다)의 값.
- `blind_ron:139` — 해시 입력 문자열.

### (3) 마지막 국에 남는 표식 키
매치가 끝난 뒤 `#round` 키가 몇 개 남는데, 마지막 국 다음에는 `setupRound`가 돌지 않기
때문이다. cross 확정 3이 이미 *"결함이 아니다"* 라고 적어 둔 것과 같다.

## 전후 수치 (`tsx qa-lab/cross/keygrowth.ts <seed> <mode>`)

| 시드·모드 | 최종 키 (전 → 후) | 국번호 박힌 키 (전 → 후) | 국 경계 잔류(지난 국 키) |
|---|---|---|---|
| 7 hanchan | 93 → **54** | 44 → **5** | 매 국 0 |
| 11 hanchan | 87 → **67** | 23 → **3** | 매 국 0 |
| 23 hanchan | 112 → **67** | 53 → **8** | 매 국 0 |
| 7 tonpuu | — | — → 6 | 매 국 0 |
| 23 tonpuu | — | — → 5 | 매 국 0 |

**남은 "국번호 박힌 키"는 전부 마지막 국 것이고 전부 `#round` 표식이 붙어 있다** —
즉 국이 하나 더 있었으면 지워졌을 것들이다. 위 (3)에 해당한다. 실제 잔류 목록(seed 7):

```
dead_wall_master:swaps:3-4-11:p0#round
future_sight:{turns,armed,last,stacks}:3-4-11:p0#round
```

keygrowth의 국별 리포트에서 `국번호박힌_지난키`(현재 국이 아닌 국 번호가 박힌 키)는
**모든 국에서 0**이 됐다. 전에는 마지막 국 기준 seed 7에서 17개가 쌓여 있었다.
키 증가도 멈췄다 — seed 7은 R8(2-4-7) 이후 R12까지 `+0/-0`으로 평평하다.

## 검증

- `npm test` — **276 파일 3,136 테스트 전부 통과** (498s).
- `npm run typecheck` + `:content` + `:server` + `:client` — 전부 에러 0.
  (워크트리 `node_modules/@majak` 심링크를 먼저 걸고 돌렸다.)
- 키 이름을 문자열로 단정하던 테스트 47개 파일을 함께 갱신했다(끝에 `#round` 추가).
  깨져서 손으로 고친 3건:
  - `hand_manip.test.ts` — *"이전 국 키는 남아 있어도"* 를 단정하던 줄. 이제 지워지는 것이
    **의도**이므로 `toBeUndefined()`로 바꾸고 사유를 주석에 남겼다.
  - `danger_sense.test.ts` / `tenpai_scan.test.ts` — `endsWith(":p0")` 단정을 `":p0#round"`로.
- 뷰 채널 오탐 2건은 되돌렸다: `packages/client/src/App.tsx`의 `bottom_deal:armed:{me}`는
  **augmentView 채널 키**라 데이터 키와 무관하고, `core/test/GameState.test.ts`는 이미
  `ROUND_SCOPED_MARK`를 붙여 쓰고 있었다(이중 표식이 될 뻔했다).

## 남은 것 / 후속 후보

- `docs/16_AUGMENT_REDESIGN.md:1086`이 아직 `push_riichi:brand:{roundKey}:{holder}`로 적혀 있다
  (앞 세션 전환분). 표식 표기가 빠져 있으나 문서라 이번 변경에 포함하지 않았다.
- `qa-lab/`은 읽기만 했다(다른 에이전트 작업 중). `qa-lab/cross/aug-keys.json`의 키 카탈로그와
  `qa-lab/text/*`·`qa-lab/hand-a/*` 프로브에 옛 키 문자열이 남아 있다 — 다시 돌릴 때
  `#round` 를 붙여야 한다. parasite만은 위 주석대로 모양을 보존해 두었다.
- 커밋하지 않았다.
