# B-1 단독 스위프 결과 (2026-09-16T02:01) — /Users/skul/majak/.claude/worktrees/mahjong-qa-plan-85aa99/qa-lab/round5/solo/out

- 파일 6개 · 줄 7020 (깨진 줄 0) · 고유 판 7020 · 실행 6960 · modes 불일치 skip 60
- 전체 작업(117×6×5×2 = 7020) 대비 누락 0
- **크래시 0 · 도구 fatal 0 · 훅 예외 판 0 · 소프트락 0 · 불변식 위반 판 0 · SCORE_DRIFT_UNEXPLAINED 판 0 · touched=0 판 1948**
- 판당 ms: 전체 n=6960 mean=514 p50=521 p90=874 p99=1274 max=2873 · 반장 p50=588 p90=1007 max=2646 (n=3480) · 동풍 p50=292 p90=513 max=2873 (n=3480)
- 합계 CPU 시간 59.7분 (샤드 수로 나누면 벽시계 근사)

## 위반 kind 별 건수 (SCORE_DRIFT_ATTRIBUTED 제외)

| kind | 건수 | 판 수 | 증강 수 | 예 |
|---|---:|---:|---:|---|
| (없음) | | | | |

## 크래시 (엔진 throw) — 0판

없음

## 도구 fatal (하네스 밖 예외) — 0판

없음

## 훅 예외 (onEffectError) — 0판

없음

## 소프트락 (타임아웃) — 0판

없음

## 불변식 위반 — 0판

없음

## SCORE_DRIFT_UNEXPLAINED — 0판

없음

## touched=0 (augmentData·이벤트·액션 어디에도 흔적 없음)

- **모든 판에서 흔적 없음 + 훅도 상태를 안 바꿈: 5종** — «발동 불가» 결함 후보 (액티브면 optionOffer=0, 리액션이면 reactEmit=0 인지 본다)
  - bottom_yaku: ruleSet=0 reactCall=0 reactEmit=0 interCall=0 interChange=0 optionOffer=0
  - dora_conceal: ruleSet=0 reactCall=0 reactEmit=0 interCall=0 interChange=0 optionOffer=0
  - mixed_nine_gates: ruleSet=0 reactCall=0 reactEmit=0 interCall=0 interChange=0 optionOffer=0
  - soul_hunt: ruleSet=0 reactCall=0 reactEmit=0 interCall=0 interChange=0 optionOffer=0
  - void_kan: ruleSet=0 reactCall=49 reactEmit=0 interCall=0 interChange=0 optionOffer=0
- 패시브(규칙 설정·인터셉터 호출만 있고 변경 없음): 20종 — aotenjou_ceiling(ruleSet=0,reactCall=0,reactEmit=0,interCall=369,interChange=0,optionOffer=0), blame_shift(ruleSet=0,reactCall=0,reactEmit=0,interCall=1092,interChange=0,optionOffer=0), broken_wall(ruleSet=120,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), counter(ruleSet=0,reactCall=27076,reactEmit=0,interCall=724,interChange=0,optionOffer=0), free_riichi_discard(ruleSet=0,reactCall=26713,reactEmit=0,interCall=0,interChange=0,optionOffer=0), iron_wall(ruleSet=60,reactCall=0,reactEmit=0,interCall=366,interChange=0,optionOffer=0), late_double(ruleSet=0,reactCall=0,reactEmit=0,interCall=26700,interChange=0,optionOffer=0), nagashi_yakuman(ruleSet=60,reactCall=0,reactEmit=0,interCall=364,interChange=0,optionOffer=0), off_by_one(ruleSet=0,reactCall=25178,reactEmit=0,interCall=0,interChange=0,optionOffer=0), omni_chi(ruleSet=60,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), open_riichi(ruleSet=60,reactCall=0,reactEmit=0,interCall=363,interChange=0,optionOffer=0), polar_ends(ruleSet=60,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), riichi_seal(ruleSet=0,reactCall=27397,reactEmit=0,interCall=0,interChange=0,optionOffer=0), riichi_upgrade(ruleSet=0,reactCall=79683,reactEmit=0,interCall=26748,interChange=0,optionOffer=0), royal_kokushi(ruleSet=60,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), siege_riichi(ruleSet=60,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), snake_kan(ruleSet=60,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), true_dragon(ruleSet=120,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), wind_lineage(ruleSet=60,reactCall=0,reactEmit=0,interCall=0,interChange=0,optionOffer=0), yakuman_shield(ruleSet=0,reactCall=365,reactEmit=0,interCall=365,interChange=0,optionOffer=0)
  (setHolderRule 만 쓰는 카드는 정상. interCall>0·interChange=0 은 «조건이 한 번도 안 맞음»이라 시드를 늘리거나 장면 테스트로 본다)
- 반장전에서만 흔적 없음: haitei_lord, hidden_blade, tanyao_break, yakuless_win
- 동풍전에서만 흔적 없음: avenger
- 특정 페르소나에서만 흔적 없음 (30셀): ankan_dora×folder, ankan_dora×stall, avenger×masher, avenger×riichiRusher, avenger×caller, avenger×chaos, avenger×stall, haitei_lord×masher, haitei_lord×riichiRusher, haitei_lord×folder, haitei_lord×chaos, haitei_lord×stall, hidden_blade×masher, hidden_blade×folder, hidden_blade×caller, hidden_blade×chaos, hidden_blade×stall, open_riichi_reveal×riichiRusher, open_riichi_reveal×folder, stealth_riichi×folder, tanyao_break×masher, tanyao_break×riichiRusher, tanyao_break×folder, tanyao_break×chaos, tanyao_break×stall, yakuless_win×masher, yakuless_win×riichiRusher, yakuless_win×folder, yakuless_win×chaos, yakuless_win×stall

## 판당 ms

| 구간 | n | mean | p50 | p90 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| 전체 | 6960 | 514 | 521 | 874 | 1274 | 2873 |
| 반장전 | 3480 | 686 | 588 | 1007 | 1455 | 2646 |
| 동풍전 | 3480 | 343 | 292 | 513 | 928 | 2873 |

- 증강별 평균 ms 상위 10: broken_border(1093/max 2873), alchemist(924/max 2126), always_tenpai(924/max 1283), polar_ends(863/max 1645), big_hand(845/max 1632), tile_split(840/max 2646), bluff_pretense(822/max 1344), cornucopia(782/max 2525), bottom_deal(781/max 1436), joker(774/max 1432)
- 가장 느린 판 5: broken_border riichiRusher tonpuu seed=1166867535 2873ms rounds=5 · tile_split folder hanchan seed=321227267 2646ms rounds=8 · broken_border stall hanchan seed=208331050 2547ms rounds=8 · cornucopia folder hanchan seed=1859691902 2525ms rounds=8 · tile_split folder hanchan seed=388337743 2299ms rounds=8

## 증강 × 페르소나 표

셀 = 그 (증강, 페르소나)의 시드×모드 판들 요약. `·` 깨끗+흔적 있음 · `C`n 크래시 · `F`n fatal · `E`n 훅 예외 · `L`n 소프트락 · `V`n 불변식 위반 · `D`n 드리프트 미설명 · `t`k/n 흔적 있는 판 수(전부면 생략) · `T0` 흔적 0(훅도 무변경) · `P` 패시브(훅 호출만) · `S` 전부 skip

| 증강 | tier | cat | masher | riichiRusher | folder | caller | chaos | stall |
|---|---|---|---|---|---|---|---|---|
| alchemist | prism | hand | · | · | · | · | · | · |
| all_or_nothing | prism | riichi | · | · | · | · | · | · |
| always_tenpai | prism | defense | · | · | · | · | · | · |
| ankan_dora | prism | scoring | t1/10 | t1/10 | T0 | t1/10 | t1/10 | T0 |
| aotenjou_ceiling | prism | scoring | P | P | P | P | P | P |
| async_chiitoi | prism | shape | · | · | · | · | · | · |
| avenger | silver | shape | P | P | t1/10 | P | P | P |
| big_hand | prism | scoring | · | · | · | · | · | · |
| blame_shift | prism | scoring | P | P | P | P | P | P |
| blind_ron | prism | disrupt | · | · | · | · | · | · |
| blood_contract | prism | scoring | · | · | · | · | · | · |
| bluff_pretense | prism | call | · | · | · | · | · | · |
| bottom_deal | prism | hand | · | · | · | · | · | · |
| bottom_yaku | prism | shape | T0 | T0 | T0 | T0 | T0 | T0 |
| brief_fog | prism | disrupt | · | · | · | · | · | · |
| broken_border | prism | shape | · | · | · | · | · | · |
| broken_wall | prism | shape | P | P | P | P | P | P |
| call_seal | prism | disrupt | · | · | · | · | · | · |
| cliff_bloom | prism | call | · | · | · | · | · | · |
| conjure_draw | prism | hand | · | · | · | · | · | · |
| cornucopia | prism | etc | · | · | · | · | · | · |
| counter | silver | scoring | P | P | P | P | P | P |
| danger_sense | prism | info | · | · | · | · | · | · |
| dead_wall_master | prism | hand | · | · | · | · | · | · |
| devils_advance | prism | scoring | · | · | · | · | · | · |
| die_hard | gold | defense | · | · | · | · | · | · |
| disarm | prism | disrupt | · | · | · | · | · | · |
| discard_lock | prism | disrupt | · | · | · | · | · | · |
| discard_recall | prism | hand | · | · | · | · | · | · |
| dora_afterimage | prism | scoring | · | · | · | · | · | · |
| dora_conceal | prism | info | T0 | T0 | T0 | T0 | T0 | T0 |
| eternal_dealer | prism | scoring | · | · | · | · | · | · |
| even_world | prism | hand | · | · | · | · | · | · |
| foresight | prism | info | · | · | · | · | · | · |
| frame_up | prism | disrupt | · | · | · | · | · | · |
| free_riichi_discard | gold | riichi | P | P | P | P | P | P |
| full_hand_swap | prism | hand | · | · | · | · | · | · |
| future_sight | prism | hand | · | · | · | · | · | · |
| genesis | prism | hand | · | · | · | · | · | · |
| giant_god | prism | hand | · | · | · | · | · | · |
| grave_rob | prism | hand | · | · | · | · | · | · |
| haitei_lord | prism | shape | P | P | P | t1/10 | P | P |
| hand_swap3 | prism | hand | · | · | · | · | · | · |
| hidden_blade | gold | scoring | P | t1/10 | P | P | P | P |
| hidden_river | prism | disrupt | · | · | · | · | · | · |
| honba_hunter | prism | scoring | · | · | · | · | · | · |
| honor_return | prism | hand | · | · | · | · | · | · |
| hourglass | prism | disrupt | · | · | · | · | · | · |
| invincible | gold | defense | · | · | · | · | · | · |
| iron_wall | gold | shape | P | P | P | P | P | P |
| jackpot | prism | scoring | · | · | · | · | · | · |
| joker | prism | shape | · | · | · | · | · | · |
| karma | prism | scoring | · | · | · | · | · | · |
| last_stand | gold | defense | · | · | · | · | · | · |
| late_bloomer | prism | shape | s5 | s5 | s5 | s5 | s5 | s5 |
| late_bloomer_east | prism | shape | s5 | s5 | s5 | s5 | s5 | s5 |
| late_double | prism | riichi | P | P | P | P | P | P |
| let_it_ride | gold | scoring | · | · | · | · | · | · |
| meld_dissolve | prism | call | · | · | · | · | · | · |
| mirror_dora | prism | scoring | · | · | · | · | · | · |
| mixed_nine_gates | prism | shape | T0 | T0 | T0 | T0 | T0 | T0 |
| mixed_triplet | prism | shape | · | · | · | · | · | · |
| nagashi_yakuman | prism | scoring | P | P | P | P | P | P |
| no_retreat | prism | riichi | · | · | · | · | · | · |
| no_ron_pact | prism | defense | · | · | · | · | · | · |
| north_trader | prism | scoring | t9/10 | · | · | · | · | · |
| off_by_one | prism | riichi | P | P | P | P | P | P |
| omni_chi | gold | call | P | P | P | P | P | P |
| open_kokushi | prism | call | · | · | · | · | · | · |
| open_riichi | prism | riichi | P | P | P | P | P | P |
| open_riichi_reveal | gold | riichi | t2/10 | P | P | t5/10 | t1/10 | t1/10 |
| palm_flip | prism | riichi | · | · | · | · | · | · |
| parasite | prism | scoring | · | · | · | · | · | · |
| peek_riichi_waits | gold | info | · | · | · | · | · | · |
| picky_eater | prism | hand | · | · | · | · | · | · |
| polar_ends | prism | shape | P | P | P | P | P | P |
| pond_snatch | prism | hand | · | · | · | · | · | · |
| pseudo_dealer | gold | disrupt | · | · | · | · | · | · |
| push_riichi | prism | disrupt | · | · | · | · | · | · |
| rank_gate | prism | disrupt | · | · | · | · | · | · |
| red_five_touch | silver | hand | · | · | · | · | · | · |
| regret | prism | hand | · | · | · | · | · | · |
| reload | prism | etc | · | · | · | · | · | · |
| riichi_seal | prism | riichi | P | P | P | P | P | P |
| riichi_upgrade | gold | riichi | P | P | P | P | P | P |
| rinshan_preview | gold | info | · | · | · | · | · | · |
| royal_kokushi | prism | shape | P | P | P | P | P | P |
| scapegoat | gold | scoring | · | · | · | · | · | · |
| seat_swap | prism | disrupt | · | · | · | · | · | · |
| siege_riichi | prism | riichi | P | P | P | P | P | P |
| sign_flip | prism | scoring | · | · | · | · | · | · |
| silent_pact | prism | call | · | · | · | · | · | · |
| silent_swap | prism | hand | · | · | · | · | · | · |
| snake_kan | prism | call | P | P | P | P | P | P |
| soul_hunt | prism | scoring | T0 | T0 | T0 | T0 | T0 | T0 |
| soul_strike | prism | riichi | · | · | · | · | · | · |
| spy | prism | scoring | · | · | · | · | · | · |
| stealth_riichi | prism | riichi | t4/10 | t1/10 | T0 | t7/10 | t2/10 | t1/10 |
| suit_unify | prism | hand | · | · | · | · | · | · |
| table_flip | prism | hand | · | · | · | · | · | · |
| take_back | silver | hand | · | · | · | · | · | · |
| tanyao_break | prism | shape | T0 | T0 | T0 | t1/10 | T0 | T0 |
| tenpai_scan | prism | info | · | · | · | · | · | · |
| three_dragons_will | prism | hand | · | · | · | · | · | · |
| tile_dyeing | gold | hand | · | · | · | · | · | · |
| tile_split | prism | hand | · | · | · | · | · | · |
| time_pressure | prism | disrupt | · | · | · | · | · | · |
| time_stop | prism | disrupt | · | · | · | · | · | · |
| triple_peek | prism | info | · | · | · | · | · | · |
| true_dragon | prism | shape | P | P | P | P | P | P |
| unification | prism | scoring | · | · | · | · | · | · |
| ura_peek | silver | info | · | · | · | · | · | · |
| void_kan | prism | call | T0 | T0 | T0 | T0 | T0 | T0 |
| wind_lineage | prism | shape | P | P | P | P | P | P |
| xray_hand | gold | info | · | · | · | · | · | · |
| yakuless_win | prism | shape | P | P | P | t1/10 | P | P |
| yakuman_shield | gold | defense | P | P | P | P | P | P |

## 누락 작업 — 0

