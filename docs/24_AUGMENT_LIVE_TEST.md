# 증강 감사 — 전수 104종 (2026-08-02)

- 방법: 관리자 계정(`isAdmin`)으로 `증강 테스트` 샌드박스(`sandboxGrant`/`sandboxHands`, `RoomManager.ts`)에
  실제로 접속해 동작을 확인하고(환경: 워크트리 전용 임시 서버, PORT=3911·DB_PATH=/tmp/majak-augtest,
  운영 서버와 무관), 이와 병행해 104개 증강 파일 전체를 8개 병렬 서브에이전트로 나눠 JSDoc 설명·
  `AugmentDef.description`·실제 훅 구현·기존 테스트 커버리지를 대조하는 정적 감사를 수행했다.
  정적 감사에서 나온 의심 항목 중 사용자에게 직접 보이는 것(증강 설명 문구)은 샌드박스에서 실측
  스크린샷으로 재확인했다. 나머지 의심 항목은 서버 로직(검증 함수·리듀서)을 직접 읽어 재현 경로를
  코드로 추적했다 — 실제 게임 진행 중 우연히 마주치기 어려운 조합(더블론, 특정 증강 동시 보유 등)이라
  현 상태를 "코드 추적으로 확인, 라이브 재현은 미실시"로 명시한다.
- 이미 docs/21·22에 기록되어 **수정 완료**로 확인된 항목은 이 문서에 다시 적지 않는다. docs/21·22에
  `⬜`/`미검증`으로 남아 있던 항목 중 이번 조사로 **여전히 미수정임을 코드로 재확인**한 것은 "기존
  미해결 재확인"으로 표시해 남긴다(신규 발견 아님, 중복 조치 불필요, 참고용).
- 전체 104종 중 **신규로 발견된 버그는 4건**(seat_swap, spy, reload, three_dragons_will 설명 문구),
  **기존에 미해결로 남아있던 게 재확인된 것은 5건**(open_kokushi, broken_border, discard_lock×hand_swap3,
  stealth_riichi, red_five_touch), 나머지 95종은 설명·구현·테스트가 일치해 문제를 찾지 못했다.

## 신규 발견 버그

### 1. 🔴 seat_swap(자리 바꿈) — 리치 중인 상대와도 손패를 통째로 맞바꿀 수 있어 리치=텐파이 불변식이 깨짐

- **위치**: `packages/content/src/augments/seat_swap.ts` `validate`(34-95행), 리듀서(118-182행)
- **문제**: 발동 조건은 "발동자가 이 국에서 아직 버리지 않았을 때"만 검사한다. **대상(target)이 이미
  리치를 선언했는지는 전혀 검사하지 않는다.** 리듀서는 두 좌석의 손패·후로를 물리적으로 통째로
  교환하지만 `round.byPlayer[id].riichi`(리치 여부·공탁·일발) 필드는 그대로 원래 좌석에 남는다.
- **재현**: p1이 리치 선언(텐파이 손 고정, 공탁 1000점 지불) → seat_swap 보유자 p0가 자신의 첫 순(아직
  버림 없음)에 p1을 대상으로 지정해 즉시 발동 → p1은 여전히 `riichi != null`(쯔모기리 강제 상태)이지만
  실제 손패는 p0의 원래 손으로 교체되어, 리치 선언 당시의 텐파이 대기와 완전히 무관해진다. 화료 판정이
  리치 선언 시점의 손과 어긋나고, p0는 p1이 걸어둔 리치 상태 없이 p1의(리치 손이었던) 패를 그대로
  가져가 정합이 깨진다.
- **테스트 갭**: `schemers.test.ts`, `buff_52_cdf.test.ts`, `true_dragon.test.ts` 어디에도 대상이 리치
  중인 케이스가 없다.
- **제안**: `validate`에 대상 리치 여부 가드 추가 검토(수정 안 함, 조사만).

### 2. 🔴 spy(스파이) — 더블론 시 `.find()`가 첫 일치자에게서만 훔친다

- **위치**: `packages/content/src/augments/spy.ts:137-142` (`settleInterceptor` Transfer 단계)
- **문제**: `(p.winInfos ?? []).find(...)`로 지정 패 종류 일치 승자를 **첫 번째 1명**만 찾아 그 이득만
  가로챈다. 더블 론이 허용된 룰에서 두 명 이상이 동시에 스파이가 지정한 패 종류로 화료하면, 배열
  순서상 뒤에 있는 승자의 이득은 원래 승자에게 그대로 남는다(스파이는 못 가져감).
  설계 의도("상대가 그 종류로 화료하면 그 화료 점수가 전부 나에게 온다")와 부분적으로 어긋난다.
- **영향도**: 더블 론 + 두 명 이상 동일 지정 패 화료라는 드문 조합에서만 발생. 경미.

### 3. 🔴 reload(재장전) — boolean `:used:` 플래그를 쓰는 증강(red_five_touch)은 복구 후보로 안 뜬다

- **위치**: `packages/content/src/augments/reload.ts:36-48`(`spentKeyOf`), `packages/content/src/util.ts:160-163`(`counterOf`)
- **문제**: `counterOf`는 값이 `number`가 아니면 무조건 0을 반환한다. `red_five_touch`는 사용 플래그를
  `augmentDataSet(usedKey, true)`로 **boolean**으로 저장한다(`red_five_touch.ts:138`). 키 이름 패턴
  자체(`red_five_touch:used:{holder}`)는 reload가 찾는 형식과 일치하지만 값이 boolean이라 `counterOf`가
  항상 0으로 읽어 "아직 안 썼다"로 오판, `reloadable()` 후보 목록에서 아예 빠진다.
  reload.ts 상단 주석은 "예전엔 alchemist·hand_swap3·pond_snatch·honor_return 네 개가 사각지대였다"며
  그 넷만 고쳤다고 명시하는데, red_five_touch처럼 `:used:` 키에 boolean을 쓰는 케이스는 그 목록에
  없어 여전히 사각지대로 남아 있다.
- **재현**: p0가 `["reload", "red_five_touch"]` 보유 → `red_touch`로 랭크 지정해 사용(`red_five_touch:used:p0=true`)
  → `reload_use` 옵션 조회 시 `red_five_touch`가 목록에 없음. `augmentId: "red_five_touch"`로 직접
  제출해도 `validate`가 "that augment has no spent use to restore"로 거부.
- **테스트 갭**: `reload.test.ts`는 숫자 `:uses:` 패턴(`call_seal`)만 커버, boolean `:used:` 패턴은
  테스트 없음.

### 4. 🔴 three_dragons_will(삼원의 의지) — 설명 문구가 사용 횟수 제한을 숨긴다 (샌드박스에서 실측 확인)

- **위치**: `packages/content/src/augments/three_dragons_will.ts:44-47`(실제 사용 횟수 캡: 동풍전 1회·
  반장전 2회, `matchUses`)와 `:156-159`(description/detail은 `"(상시)"`로만 표기)
- **문제**: 같은 파일군의 다른 액티브 증강(`tenpai_scan`, `tile_split`, `triple_peek`, `xray_hand`)은
  description에 사용 횟수 제한을 명시하는데, `three_dragons_will`만 진짜 무제한인 `void_kan`과 동일하게
  `"(상시)"`만 붙어 있다. 아래 스크린샷대로 사용자에게는 "조건만 맞으면 몇 번이든" 발동 가능한 것처럼
  보이지만, 실제로는 반장전 기준 2회 소진 후에는 조건이 갖춰져도 발동 옵션 자체가 나타나지 않는다.
- **실측**: 샌드박스에서 "삼원" 검색 → 카드에 "(상시)"만 표시되고 횟수 제한 문구 없음을 확인.
- **테스트 갭**: `three_dragons_will.test.ts`는 1회 발동 시 카운터 값만 확인, 2회 소진 후 옵션이
  사라지는지/설명과의 정합성은 검증하지 않는다.

## 기존 미해결 이슈 재확인 (신규 아님, 참고용)

이번 정적 감사로 아래 항목들이 docs/21·22에 기록된 그대로 **아직 코드에 반영되지 않았음**을
재확인했다. 새로 발견한 버그가 아니므로 중복 조치는 하지 않지만, 다음 버그 스프린트 우선순위
판단을 위해 상태만 남긴다.

| 항목 | 문서 근거 | 재확인 내용 |
|---|---|---|
| ~~`ankan_dora` × `aotenjou_ceiling` 조합 시 점수 지수 폭발~~ | docs/21 §H-1 | ✅ **해소됨 (2026-08-07 실측 확인).** `aotenjou_ceiling.ts:55-59` `aotenjouBase()`는 5판 이상에서 **선형**(`MANGAN_BASE + (effHan-5) * 1000`)이고 지수 분기는 5판 미만에만 남아 있다. 이 표가 지목한 `:29-31`은 현재 채점 코드조차 아니다. 890판 자기대국 실측: 뚫린 천장 단독 기여 **+15%**, 11종 스택에 얹어도 **+17%** — 지수가 아니다. ⚠ **단 증상은 남아 있고 원인이 다르다** — 측정된 최대 한 방 **126,000점**(seed 1401667179, 첫 국에 게임 종료)의 주 동력은 `jackpot` ×3의 **뱅크 발행 72,000**이고 천장 기여는 18,000이다. 밸런스 항목으로 재분류. |
| `open_kokushi` — `kokushi_pon` 후 일반 펑·치를 하면 그 국 화료·텐파이 영구 소프트락 | docs/22 (미검증) | `helpers.ts:187-192`의 `kokushiOnly` 게이트가 국 전체에 걸리는데 `open_kokushi.ts`는 일반 펑·치를 막지 않음 — 여전히 수정 안 됨. 전용 테스트 없음 |
| `broken_border` — 클라(App.tsx)가 서버에 없는 `opts.mixedTriplets`를 임의로 켜 대기 표시가 서버와 어긋남 | docs/22 §4 | `App.tsx:1113-1116`이 `mixedRuns`+`mixedTriplets` 둘 다 켜지만 서버(`broken_border.ts:42`)는 `mixedRuns`만 킴. 서버 자체는 `pair_fixes_60.test.ts`로 검증되어 정상이나 클라 전용 휴리스틱 미수정 |
| `discard_lock` × `hand_swap3` — `view:{holder}:revealTiles:{target}#round` 키 완전 동일 → 동시 보유 시 서로 덮어씀 | docs/22 §12-20 (미검증) | `discard_lock.ts:82-83`와 `hand_swap3.ts:80-82`의 키 생성 함수가 동일 문자열을 생성 — 여전히 충돌 |
| `stealth_riichi` — `riichi.hidden`이 보유자에 무조건 켜져 있어 표준 리치(공탁 1000점)로 선언해도 은닉됨 | docs/22 (미검증) | `stealth_riichi.ts:145`가 커스텀 액션 여부와 무관하게 무조건 켬 — 여전히 수정 안 됨. 실질 익스플로잇 이득은 낮음 |
| `red_five_touch` — 리치 중에도 발동 가능(손 동결 전제 위반) | docs/22 §D-2 | `red_five_touch.ts:105-123` `validate`에 리치 체크 없음 — 여전히 수정 안 됨. 전용 테스트 없음 |
| `honor_return` — 리치 가드 없음 | docs/21 §D-2 (⬜) | 재확인만, 상태 동일 |

## 전수 결과 (104종)

정적 감사(설명 vs 구현 vs 테스트 대조) 기준. 위 표에 있는 항목은 아래에서도 🔴로 표시하고 위 상세로 연결.

| 증강 | 상태 |
|---|---|
| alchemist | ✅ |
| all_or_nothing | ✅ |
| always_tenpai | ✅ |
| ankan_dora | ✅ (지수 폭발 해소 — 위 표 참조) |
| aotenjou_ceiling | ✅ (지수 폭발 해소 — 위 표 참조. 한 방 상한은 밸런스 항목으로 별도) |
| async_chiitoi | ✅ |
| avenger | ✅ |
| big_hand | ✅ |
| blame_shift | ✅ |
| blood_contract | ✅ |
| bluff_pretense | ✅ |
| bottom_deal | ✅ |
| bottom_yaku | ✅ |
| brief_fog | ✅ |
| broken_border | 🔴 (기존 미해결, 클라 desync) |
| broken_wall | ✅ |
| call_seal | ✅ |
| cliff_bloom | ✅ |
| conjure_draw | ✅ |
| counter | ✅ |
| danger_sense | ✅ |
| dead_wall_master | ✅ |
| devils_advance | ✅ |
| die_hard | ✅ |
| disarm | ✅ |
| discard_lock | 🔴 (기존 미해결, hand_swap3 키 충돌) |
| dora_conceal | ✅ |
| eternal_dealer | ✅ |
| even_world | ✅ |
| foresight | ✅ |
| frame_up | ✅ |
| free_riichi_discard | ✅ |
| full_hand_swap | ✅ |
| future_sight | ✅ |
| genesis | ✅ |
| giant_god | ✅ |
| grave_rob | ✅ |
| haitei_lord | ✅ |
| hand_swap3 | 🔴 (기존 미해결, discard_lock 키 충돌) |
| hidden_blade | ✅ |
| hidden_river | ✅ |
| honba_hunter | ✅ |
| honor_return | 🔴 (기존 미해결, 리치 가드 없음) |
| hourglass | ✅ |
| invincible | ✅ |
| jackpot | ✅ |
| karma | ✅ |
| last_stand | ✅ |
| late_bloomer | ✅ |
| late_bloomer_east | ✅ |
| late_double | ✅ |
| let_it_ride | ✅ |
| meld_dissolve | ✅ |
| mixed_nine_gates | ✅ |
| mixed_triplet | ✅ |
| nagashi_yakuman | ✅ |
| no_retreat | ✅ |
| no_ron_pact | ✅ |
| north_trader | ✅ |
| off_by_one | ✅ |
| omni_chi | ✅ |
| open_kokushi | 🔴 (기존 미해결, 소프트락) |
| open_riichi_reveal | ✅ |
| palm_flip | ✅ |
| parasite | ✅ |
| peek_riichi_waits | ✅ |
| polar_ends | ✅ |
| pond_snatch | ✅ |
| pseudo_dealer | ✅ |
| push_riichi | ✅ |
| rank_gate | ✅ |
| red_five_touch | 🔴 (기존 미해결, 리치 가드 없음) |
| regret | ✅ |
| reload | 🔴 (신규, boolean :used: 사각지대) |
| riichi_seal | ✅ |
| riichi_upgrade | ✅ |
| rinshan_preview | ✅ |
| royal_kokushi | ✅ |
| scapegoat | ✅ |
| seat_swap | 🔴 (신규, 리치 대상 가드 없음) |
| siege_riichi | ✅ |
| silent_pact | ✅ |
| silent_swap | ✅ |
| snake_kan | ✅ |
| soul_hunt | ✅ |
| spy | 🔴 (신규, 더블론 .find() 편향) |
| stealth_riichi | 🔴 (기존 미해결, riichi.hidden 무조건 켜짐) |
| suit_unify | ✅ |
| table_flip | ✅ |
| take_back | ✅ |
| tanyao_break | ✅ |
| tenpai_scan | ✅ |
| three_dragons_will | 🔴 (신규, 설명 문구 오도) |
| tile_dyeing | ✅ |
| tile_split | ✅ |
| time_stop | ✅ |
| triple_peek | ✅ |
| true_dragon | ✅ |
| unification | ✅ |
| ura_peek | ✅ |
| void_kan | ✅ |
| wind_lineage | ✅ |
| xray_hand | ✅ |
| yakuman_shield | ✅ |

## 테스트 커버리지 공백 (버그는 아니지만 참고)

전용 회귀 테스트 파일이 없는 증강들 (스윕 테스트에서도 이름으로 다뤄지지 않음):
`dora_conceal`, `eternal_dealer`, `foresight`, `free_riichi_discard`, `full_hand_swap`, `future_sight`,
`genesis`, `haitei_lord`, `hand_swap3`, `hidden_river`, `honba_hunter`, `jackpot`, `karma`, `last_stand`,
`late_bloomer_east`, `late_double`, `let_it_ride`, `meld_dissolve`(주 로직은 커버, 엣지 일부만),
`mixed_nine_gates`, `mixed_triplet`, `nagashi_yakuman`, `no_retreat`, `no_ron_pact`, `north_trader`,
`off_by_one`, `omni_chi`, `open_kokushi`, `open_riichi_reveal`, `red_five_touch`, `tile_dyeing`,
`time_stop`, `unification`, `ura_peek`, `void_kan`, `xray_hand`, `yakuman_shield`.

특히 `open_kokushi`(소프트락 버그 발견 지점), `red_five_touch`(리치 가드 부재 지점), `discard_lock`
(키 충돌 지점)은 실제 버그가 있는 곳인데도 테스트가 전혀 없어 회귀 방지가 되지 않는다 — 향후 수정 시
반드시 회귀 테스트를 함께 추가해야 한다.
