# 봇 사용성 감사 — 증강 113종 시뮬레이션(10,050판) 해석용

조사일: 2026-08-31. 대상 워크트리: `packages/{core,content,server}`. 정적 코드 조사만 수행(테스트·시뮬레이션 실행 없음).

## 0. 핵심 결론 요약

- **`BOT_UNUSABLE_AUGMENTS`는 현재 빈 배열이다** (`packages/content/src/augments/botHelpers.ts:58`). 예전에는 "봇이 판단 불가"로 분류된 액티브 증강들이 있었지만, 2026-07-29 · 2026-08-06 · 2026-08-28 세 차례에 걸쳐 전부 정책을 갖게 되어 목록에서 빠졌다. 즉 **"봇이 구조적으로 못 쓰는 액티브 증강"은 지금 하나도 없다** — 목록 자체가 증거다.
- `bot_policy_coverage.test.ts`(`packages/content/test/bot_policy_coverage.test.ts`)가 "옵션을 내는 액티브 증강은 전부 bot 정책이 있거나 BOT_SKIP(=BOT_UNUSABLE_AUGMENTS)에 있어야 한다"를 정적 스캔으로 강제한다. 이 리포트의 재현 스캔(아래 1절 방법론)에서도 **미배선(active-unwired) 0건**으로 일치했다.
- `AUGMENT_POWER_TIERS`(`packages/core/src/augment/powerTier.ts:1294`, 실제 원본은 `AUGMENT_POWER_SPECS`, 1304줄 파일의 275번째 줄부터)와 `AUGMENT_SYNERGY`(`packages/core/src/augment/synergy.ts:180`)는 **둘 다 카탈로그 117종(콘텐츠 113 + 코어 표준 4) 전원을 커버**한다. 빠진 id 없음.

**결론:** 이번 10,050판 시뮬레이션 결과에서 관측되는 봇 픽 편향·약세 증강은 "봇이 못 쓰는 액티브라서" 또는 "티어/시너지 표 누락 때문"으로 설명되지 않는다. 실측 편차가 있다면 정책의 **질**(활성화 조건이 지나치게 보수적인가, 정책이 있어도 실전에서 잘 안 켜지는가) 쪽을 봐야 한다 — 이 리포트의 범위 밖이다.

---

## 1. 방법론 (재현 가능)

전체 증강 카탈로그 = `packages/content/src/augments/*.ts` 중 `defineAugment(` 문자열을 포함하는 파일 113개(공용 배선 모듈 12개는 제외 — `bot_policy_coverage.test.ts`의 `augmentFiles()`와 동일 기준, `packages/content/test/bot_policy_coverage.test.ts:70-75`) + 코어 표준 증강 4개(`packages/core/src/augment/standardAugments.ts`: `discard_recall`, `iron_wall`, `open_riichi`, `yakuless_win`) = **117종**.

분류 기준(`bot_policy_coverage.test.ts`와 동일한 정적 스캔 규칙을 손으로 재현):
- **액티브**: 파일(+ `from "./X.js"`로 import하는 같은 폴더의 공용 모듈 한 겹)에 `holderTurnOptions` 또는 `registerReactionOptions` 문자열이 있으면 액티브.
- **패시브**: 위 두 훅이 전혀 없으면 패시브.
- **정책 있음(active-wired)**: 액티브인 것 중, 같은 소스 범위에 정규식 `\n\s*bot:\s*(\{|\w+\()` 매치(손수 쓴 `bot: { choose }`, 의도 선언 `bot: plan(...)`, 공용 배선 `bot: makePolicy(...)` 전부 포함)가 있으면 정책 있음.
- **미배선(active-unwired)**: 액티브인데 정책도 없고 `BOT_UNUSABLE_AUGMENTS`에도 없는 것.

이 스캔은 `packages/content/test/bot_policy_coverage.test.ts` 자체가 CI 게이트로 상시 강제하는 불변식이므로, 저장소가 그 테스트를 통과하는 상태라면(=CLAUDE.md 게이트를 지킨 커밋) 이 리포트의 "미배선 0건" 결론은 코드베이스가 스스로 보장하는 사실이다. 아래 표는 그 스캔을 손으로 재현한 원본 데이터다.

---

## 2. BOT_UNUSABLE_AUGMENTS 전체 목록과 근거

**목록: 빈 배열 `[]`.** (`packages/content/src/augments/botHelpers.ts:58` — `export const BOT_UNUSABLE_AUGMENTS: readonly string[] = [];`)

파일 머리말 주석(`botHelpers.ts:20-53`)이 남긴 변경 이력(전부 "왜 빠졌는지"에 대한 설명이며, **현재는 전원 정책이 있어 목록에 없음**):

- **2026-07-29**: "봇이 위험(리치·안전패)과 샹텐을 읽게 되면서 폴드 계열 4종(자유 선언·승부수·손바닥 뒤집기·장사진)이 판단 가능해져 목록에서 빠졌다."
- **2026-08-06**: 3종 추가로 제외.
  - **분열** — "손패 가치 추정 필요"라고 봤지만, 이 발동엔 무작위가 없고 재료로 사라질 패까지 규칙이 정하므로 쪼갠 뒤의 손을 그대로 만들어 샹텐을 세면 된다는 것이 밝혀짐.
  - **파혼** — "템포 손해 판단 불가"라고 봤지만, 유일한 후로일 때만 멘젠이 돌아오는 조건 하나만 보면 된다는 것이 밝혀짐.
  - **미래를 보는 자** — "2단계라 조율 불가"라고 봤지만, 1단계(샹텐 문제)와 2단계(안전패 문제)는 서로 다른 질문이라 각각 봇이 이미 답할 수 있는 문제였음.
- **2026-08-28**: 2종 추가 제외 (`botnew`, `qa-lab/launch/fix/FIXBRIEF.md` 웨이브 기준, 실측 `qa-lab/launch/balance.md`에서 **hand_swap3가 387회 제시·0회 선택**으로 완전히 죽어있던 것이 계기).
  - **hand_swap3(등가교환)** — "한 번의 choose로 조율 불가"로 봤으나, 지정(swap3)→넘길 3장(swap3_give)→가져올 3장(swap3_take)이 매 프롬프트 서로 다른 질문이라는 것이 밝혀짐. 넘길 3장은 `worstHandTiles`(가장 고립된 3장), 가져올 3장은 상대 손이 `revealTiles`로 공개돼 있으므로 `shantenIfSwapped`로 계산.
  - **frame_up(누명)** — "상대 대기 추정 필요"로 봤으나 발동에 대기 추정이 안 쓰이며, 버릴 패는 `isolatedIndex`(가장 고립된 패), 지목 대상은 위협 없는 상대(비리치·낮은 텐파이 기색)로 정하면 "명백히 자해가 아닌" 선택이 충분히 가능하다는 것이 밝혀짐.

설계 원칙(같은 파일 8-9줄): "발동은 **명백히 유리하고 자해 위험이 낮을 때만**. 판단할 수 없는 증강(폴드·무르기류)은 정책을 두지 않는다." — 이 원칙에 따라 앞으로도 판단 불가능한 신규 액티브가 추가되면 이 목록에 다시 항목이 생길 수 있다.

`bot_policy_coverage.test.ts:107-116`(`"BOT_SKIP 예외는 실제 파일이고 사유 주석을 단다"`)이 목록이 비어 있는 한 공집합에 대해 항상 통과하므로, 목록이 비어 있다는 사실 자체는 이 테스트로 직접 검증되지 않는다 — `botHelpers.ts:58`의 소스가 유일한 근거다.

---

## 3. 액티브 / 패시브 / 미배선 분류표

**액티브 65종 — 전부 정책 있음(active-wired), 미배선 0건.** 표의 `옵션훅 줄`은 `holderTurnOptions`/`registerReactionOptions` 첫 출현 줄(파일 자체), `정책 줄`은 `bot:` 정책 선언 첫 출현 줄(파일 자체 — 공용 모듈에 위임한 경우도 이 리포트는 자기 파일 우선으로 표시했으며, 자기 파일에 없고 공용 모듈에만 있는 경우는 "공유모듈" 표기, 아래 참고).

| id | 옵션훅 줄 | 정책 줄 | 분류 | 근거 |
|---|---|---|---|---|
| alchemist | `augments/alchemist.ts:6` | `augments/alchemist.ts:187` | active-wired | 파일 내 직접 확인 |
| all_or_nothing | `augments/all_or_nothing.ts:247` | `augments/all_or_nothing.ts:263` | active-wired | 파일 내 직접 확인 |
| big_hand | `augments/big_hand.ts:174` | `augments/big_hand.ts:180` | active-wired | 파일 내 직접 확인 |
| blood_contract | `augments/blood_contract.ts:165` | `augments/blood_contract.ts:173` | active-wired | 파일 내 직접 확인 |
| bottom_deal | `augments/bottom_deal.ts:339` | `augments/bottom_deal.ts:195` | active-wired | 파일 내 직접 확인(정책 정의가 옵션 등록보다 앞줄에 위치) |
| brief_fog | `augments/brief_fog.ts:292` | `augments/brief_fog.ts:167` | active-wired | 파일 내 직접 확인 |
| call_seal | `augments/call_seal.ts:143` | `augments/call_seal.ts:109` | active-wired | 파일 내 직접 확인 |
| cliff_bloom | `augments/cliff_bloom.ts:530` | `augments/cliff_bloom.ts:541` | active-wired | 파일 내 직접 확인 |
| conjure_draw | `augments/conjure_draw.ts:188` | `augments/conjure_draw.ts:206` | active-wired | 파일 내 직접 확인 |
| danger_sense | `augments/danger_sense.ts:268` | `augments/danger_sense.ts:246` | active-wired | 파일 내 직접 확인 |
| dead_wall_master | `augments/dead_wall_master.ts:369` | `augments/dead_wall_master.ts:222` | active-wired | 파일 내 직접 확인 |
| disarm | `augments/disarm.ts:16` | `augments/disarm.ts:215` | active-wired | 파일 내 직접 확인 |
| discard_lock | `augments/discard_lock.ts:272` | `augments/discard_lock.ts:322` | active-wired | 파일 내 직접 확인 |
| dora_afterimage | `augments/dora_afterimage.ts:162` | `augments/dora_afterimage.ts:166` | active-wired | 파일 내 직접 확인 |
| even_world | `augments/even_world.ts:157` | `augments/even_world.ts:168` | active-wired | 파일 내 직접 확인 |
| foresight | `augments/foresight.ts:381` | `augments/foresight.ts:480` | active-wired | 파일 내 직접 확인 |
| frame_up | `augments/frame_up.ts:211` | `augments/frame_up.ts:238` | active-wired | 파일 내 직접 확인(§2의 2026-08-06 케이스) |
| free_riichi_discard | `augments/free_riichi_discard.ts:232` | `augments/free_riichi_discard.ts:249` | active-wired | 파일 내 직접 확인 |
| full_hand_swap | `augments/full_hand_swap.ts:324` | `augments/full_hand_swap.ts:339` | active-wired | 파일 내 직접 확인 |
| future_sight | `augments/future_sight.ts:17` | `augments/future_sight.ts:436` | active-wired | 파일 내 직접 확인("미래를 보는 자", §2의 2026-08-06 케이스) |
| genesis | `augments/genesis.ts:255` | `augments/genesis.ts:264` | active-wired | 파일 내 직접 확인 |
| giant_god | `augments/giant_god.ts:372` | `augments/giant_god.ts:384` | active-wired | 파일 내 직접 확인 |
| grave_rob | `augments/grave_rob.ts:386` | `augments/grave_rob.ts:418` | active-wired | 파일 내 직접 확인 |
| hand_swap3 | `augments/hand_swap3.ts:20` | `augments/hand_swap3.ts:523` | active-wired | 파일 내 직접 확인(§2의 2026-08-28 케이스, "등가교환") |
| hidden_river | `augments/hidden_river.ts:171` | `augments/hidden_river.ts:107` | active-wired | 파일 내 직접 확인 |
| honor_return | `augments/honor_return.ts:195` | `augments/honor_return.ts:203` | active-wired | 파일 내 직접 확인 |
| invincible | `augments/invincible.ts:161` | `augments/invincible.ts:107` | active-wired | 파일 내 직접 확인 |
| jackpot | `augments/jackpot.ts:363` | `augments/jackpot.ts:213` | active-wired | 파일 내 직접 확인 |
| joker | `augments/joker.ts:249` | `augments/joker.ts:269` | active-wired | 파일 내 직접 확인 |
| karma | `augments/karma.ts:209` | `augments/karma.ts:155` | active-wired | 파일 내 직접 확인 |
| last_stand | `augments/last_stand.ts:14` | `augments/last_stand.ts:196` | active-wired | 파일 내 직접 확인("장사진"류, §2의 2026-07-29 케이스로 추정 — 정확한 한국어 이름은 미확인·**추정**) |
| meld_dissolve | `augments/meld_dissolve.ts:293` | `augments/meld_dissolve.ts:324` | active-wired | 파일 내 직접 확인 |
| no_retreat | `augments/no_retreat.ts:257` | `augments/no_retreat.ts:274` | active-wired | 파일 내 직접 확인 |
| north_trader | `augments/north_trader.ts:278` | `augments/north_trader.ts:290` | active-wired | 파일 내 직접 확인 |
| open_kokushi | `augments/open_kokushi.ts:16` | `augments/open_kokushi.ts:218` | active-wired | 파일 내 직접 확인 |
| open_riichi_reveal | `augments/open_riichi_reveal.ts:318` | `augments/open_riichi_reveal.ts:337` | active-wired | 파일 내 직접 확인 |
| palm_flip | `augments/palm_flip.ts:221` | `augments/palm_flip.ts:237` | active-wired | 파일 내 직접 확인("손바닥 뒤집기"로 **추정**, §2의 2026-07-29 케이스) |
| parasite | `augments/parasite.ts:134` | `augments/parasite.ts:153` | active-wired | 파일 내 직접 확인 |
| peek_riichi_waits | `augments/peek_riichi_waits.ts:17` | `augments/peek_riichi_waits.ts:227` | active-wired | 파일 내 직접 확인 |
| picky_eater | `augments/picky_eater.ts:267` | `augments/picky_eater.ts:275` | active-wired | 파일 내 직접 확인 |
| pond_snatch | `augments/pond_snatch.ts:226` | `augments/pond_snatch.ts:238` | active-wired | 파일 내 직접 확인 |
| pseudo_dealer | `augments/pseudo_dealer.ts:156` | `augments/pseudo_dealer.ts:115` | active-wired | 파일 내 직접 확인 |
| push_riichi | `augments/push_riichi.ts:285` | `augments/push_riichi.ts:295` | active-wired | 파일 내 직접 확인("승부수"로 **추정**, §2의 2026-07-29 케이스) |
| rank_gate | `augments/rank_gate.ts:129` | `augments/rank_gate.ts:162` | active-wired | 파일 내 직접 확인 |
| red_five_touch | `augments/red_five_touch.ts:12` | `augments/red_five_touch.ts:185` | active-wired | 파일 내 직접 확인 |
| reload | `augments/reload.ts:248` | `augments/reload.ts:257` | active-wired | 파일 내 직접 확인 |
| rinshan_preview | `augments/rinshan_preview.ts:311` | `augments/rinshan_preview.ts:336` | active-wired | 파일 내 직접 확인 |
| scapegoat | `augments/scapegoat.ts:179` | `augments/scapegoat.ts:188` | active-wired | 파일 내 직접 확인("분열"로 **추정**, §2의 2026-08-06 케이스) |
| seat_swap | `augments/seat_swap.ts:327` | `augments/seat_swap.ts:343` | active-wired | 파일 내 직접 확인 |
| silent_pact | `augments/silent_pact.ts:10` | `augments/silent_pact.ts:162` | active-wired | 파일 내 직접 확인 |
| silent_swap | `augments/silent_swap.ts:251` | `augments/silent_swap.ts:288` | active-wired | 파일 내 직접 확인 |
| soul_strike | `augments/soul_strike.ts:240` | `augments/soul_strike.ts:345` | active-wired | 파일 내 직접 확인 |
| spy | `augments/spy.ts:116` | `augments/spy.ts:202` | active-wired | 파일 내 직접 확인 |
| stealth_riichi | `augments/stealth_riichi.ts:267` | `augments/stealth_riichi.ts:238` | active-wired | 파일 내 직접 확인 |
| suit_unify | `augments/suit_unify.ts:157` | `augments/suit_unify.ts:166` | active-wired | 파일 내 직접 확인 |
| table_flip | `augments/table_flip.ts:167` | `augments/table_flip.ts:176` | active-wired | 파일 내 직접 확인 |
| take_back | `augments/take_back.ts:194` | `augments/take_back.ts:204` | active-wired | 파일 내 직접 확인("무르기"류로 **추정**, §2의 2026-07-29 케이스) |
| tenpai_scan | `augments/tenpai_scan.ts:179` | `augments/tenpai_scan.ts:189` | active-wired | 파일 내 직접 확인 |
| three_dragons_will | `augments/three_dragons_will.ts:205` | `augments/three_dragons_will.ts:215` | active-wired | 파일 내 직접 확인 |
| tile_dyeing | `augments/tile_dyeing.ts:7` | `augments/tile_dyeing.ts:269` | active-wired | 파일 내 직접 확인 |
| tile_split | `augments/tile_split.ts:185` | `augments/tile_split.ts:211` | active-wired | 파일 내 직접 확인("파혼"으로 **추정**, §2의 2026-08-06 케이스) |
| time_stop | `augments/time_stop.ts:140` | `augments/time_stop.ts:118` | active-wired | 파일 내 직접 확인 |
| triple_peek | `augments/triple_peek.ts:265` | `augments/triple_peek.ts:213` | active-wired | 파일 내 직접 확인 |
| ura_peek | `augments/ura_peek.ts:291` | `augments/ura_peek.ts:173` | active-wired | 파일 내 직접 확인 |
| xray_hand | `augments/xray_hand.ts:121` | `augments/xray_hand.ts:82` | active-wired | 파일 내 직접 확인 |

주: "정책 줄"이 "옵션훅 줄"보다 앞선 경우들(예: bottom_deal, brief_fog, call_seal 등)은 파일 안에서 정책 정의 코드가 옵션 등록 함수보다 먼저 선언돼 있을 뿐이며, 정책 자체는 존재를 확인했다(정규식 `\n\s*bot:\s*(\{|\w+\()` 매치).

`hand_swap3`, `frame_up`은 §2에서 인용한 봇 정책 이력의 실명 대상이라 근거가 확실하다. `last_stand`/`palm_flip`/`push_riichi`/`scapegoat`/`take_back`/`tile_split`을 §2의 "장사진·손바닥 뒤집기·승부수·자유 선언·무르기·파혼"에 각각 대응시킨 것은 **파일명 기반 추정**이며(파일 내부의 한국어 표시 이름을 직접 대조하지 않았다), 코드 동작 자체(옵션훅+정책 존재)는 추정이 아니라 직접 확인이다.

**패시브 48종** — `holderTurnOptions`/`registerReactionOptions`가 파일(및 같은 폴더 공용 모듈 1겹)에 없어 봇에게 능동 선택지를 내지 않는 것으로 판정. 자동 발동형이므로 봇 채택 여부는 "정책 배선"이 아니라 드래프트 픽 로직(파워 티어·시너지 스코어링) 문제다.

| id | 근거 |
|---|---|
| always_tenpai | `augments/always_tenpai.ts`에 `holderTurnOptions`/`registerReactionOptions` 없음(정적 스캔) |
| ankan_dora | 동일 |
| aotenjou_ceiling | 동일 |
| async_chiitoi | 동일 |
| avenger | 동일 |
| blame_shift | 동일 |
| blind_ron | 동일 |
| bluff_pretense | 동일 |
| bottom_yaku | 동일 |
| broken_border | 동일 |
| broken_wall | 동일 |
| cornucopia | 동일 |
| counter | 동일 |
| devils_advance | 동일 |
| die_hard | 동일 |
| dora_conceal | 동일 |
| eternal_dealer | 동일 |
| haitei_lord | 동일 |
| hidden_blade | 동일 |
| honba_hunter | 동일 |
| hourglass | 동일 |
| late_bloomer | 동일 |
| late_bloomer_east | 동일 |
| late_double | 동일 |
| let_it_ride | 동일 |
| mirror_dora | 동일 |
| mixed_nine_gates | 동일 |
| mixed_triplet | 동일 |
| nagashi_yakuman | 동일 |
| no_ron_pact | 동일 |
| off_by_one | 동일 |
| omni_chi | 동일 |
| polar_ends | 동일 |
| regret | 동일 |
| riichi_seal | 동일 |
| riichi_upgrade | 동일 |
| royal_kokushi | 동일 |
| siege_riichi | 동일 |
| sign_flip | 동일 |
| snake_kan | 동일 |
| soul_hunt | 동일 |
| tanyao_break | 동일 |
| time_pressure | 동일 |
| true_dragon | 동일 |
| unification | 동일 |
| void_kan | 동일 |
| wind_lineage | 동일 |
| yakuman_shield | 동일 |

**액티브 미배선(active-unwired): 0건.** 65개 액티브 전원이 정책을 보유. `BOT_UNUSABLE_AUGMENTS`도 빈 배열이므로 "정책도 없고 목록에도 없는" 항목은 존재하지 않는다.

코어 표준 증강 4종(`discard_recall`, `iron_wall`, `open_riichi`, `yakuless_win`)은 `bot_policy_coverage.test.ts`의 두 번째 테스트("코어 표준 증강도 액티브면 정책을 갖는다", `bot_policy_coverage.test.ts:90-95`)가 별도로 검증하며, 그 코멘트에 따르면 "표준 증강 중 액티브는 discard_recall 하나뿐"이라고 명시돼 있다(파일 단위 검사, id별 세부 확인은 하지 않음 — **추정 아님, 테스트 코드 주석 인용**).

---

## 4. AUGMENT_POWER_TIERS 누락 id

**없음.** `AUGMENT_POWER_SPECS`(`packages/core/src/augment/powerTier.ts:275`, `AUGMENT_POWER_TIERS`는 1294줄에서 이를 `Object.fromEntries`로 감싼 파생값)에서 최상위 키를 정적으로 추출한 결과 117개였고, 전체 카탈로그 117종(콘텐츠 113 + 코어 표준 4)과 정확히 일치했다. `comm -23`(카탈로그 - 파워티어)과 `comm -13`(파워티어 - 카탈로그) 모두 빈 결과.

---

## 5. AUGMENT_SYNERGY 누락 id

**없음.** `AUGMENT_SYNERGY`(`packages/core/src/augment/synergy.ts:180`)의 헤더 주석(177줄)이 "카탈로그 전체를 덮는다(표준 증강 4종 포함)"이라고 명시하며, 정적 추출로도 117개 키 전원이 확인됐다 — 카탈로그 117종과 정확히 일치(누락 0, 초과 0).

---

## 6. 요약 수치

| 구분 | 개수 |
|---|---|
| 전체 카탈로그(콘텐츠 113 + 코어 표준 4) | 117 |
| 패시브 | 48 |
| 액티브 | 65 |
| 액티브 중 정책 있음(active-wired) | 65 |
| 액티브 중 미배선(active-unwired) | 0 |
| BOT_UNUSABLE_AUGMENTS | 0 (빈 배열) |
| AUGMENT_POWER_TIERS 누락 id | 0 |
| AUGMENT_SYNERGY 누락 id | 0 |

## 7. 해석 시 주의

- 이 리포트는 "봇이 액티브 증강을 고를 수단(정책)이 있는가"만 검증했다. 정책이 **존재**한다고 해서 실전에서 자주 발동 조건을 만족하거나 드래프트에서 자주 뽑힌다는 뜻은 아니다(§2에 인용된 `hand_swap3`의 "387회 제시·0회 선택" 사례가 그 증거 — 정책이 생긴 지금은 개선됐는지 별도로 실측해야 한다).
- 파워 티어·시너지 표에 "누락"은 없지만, **오분류**(예: §2에서 인용된 `genesis`의 2026-08-28 SS+→하향 재산정 사례)는 이 리포트의 범위 밖이다 — 티어 값 자체의 타당성은 별도 검증이 필요하다.
- last_stand/palm_flip/push_riichi/scapegoat/take_back/tile_split의 한국어 원명 대응은 파일명 기반 **추정**이므로, 결과 해석에서 특정 이름으로 인용할 때는 재확인을 권장한다.
