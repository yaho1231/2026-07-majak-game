# 반장전 밸런스 QA — GROUP: call-defense

대상 14종 (call 7 / defense 7). 전 파일 정독 + `packages/content/src/util.ts`(`matchUses`/`scaledUses`), `HanchanController.hanchanConfigForMode` 확인.

| id | 이름 | 판정 | 심각도 | 근거(파일:줄) | 제안 |
|---|---|---|---|---|---|
| omni_chi | 사방치기 | OK | — | omni_chi.ts:21-23 (`setHolderRule` 상시, 국·매치 개념 없음) | 없음 |
| bluff_pretense | 허장성세 | 강화 | P2 | bluff_pretense.ts:51-52 `roundScopedKey(...,"used")`, 163, 202 | 없음(상시형 국당 1회의 구조적 배증) |
| cliff_bloom | 절벽 위에 피어난 꽃 | 강화 | P1 | cliff_bloom.ts:389 `tier:"prism"`, 393-396 "횟수 제한 없음", 109·112 국 스코프, 104 `BLOOM_RINSHAN_HAN=4`, 467-490 | 매치 단위 만개 상한(예: `scaledUses(state,1)` = 동풍 1·반장 2) 도입 검토 |
| meld_dissolve | 파혼 | 강화 | P2 | meld_dissolve.ts:74-75 국 스코프 `usedKey`, 134, 293-303 | 없음 |
| open_kokushi | 우는 국사무쌍 | 강화 | P2 | open_kokushi.ts:204-211 (상시·횟수 제한 없음), 6-7 | 없음(시행횟수형 역만 도박) |
| silent_pact | 묵계 | 강화 | P2 | silent_pact.ts:46-47 국 스코프, 103, 154-157 "(매 국 1회)" | 없음 |
| snake_kan | 장사진 | OK | — | snake_kan.ts:56-58 `setHolderRule("call.snakeKan")` 상시 | 없음 |
| void_kan | 성립하지 않는 깡 | OK | — | void_kan.ts:133-193 (상시 규칙 + KAN_DECLARED 리액션, 카운터 없음) | 없음 |
| die_hard | 죽기살기 | OK | — | die_hard.ts:48-51 `matchUses(state)`(동풍1·반장2), 46 `REVIVE_CAP=25_000` | 없음 — 그룹 유일의 **모드 스케일 정답 사례** |
| invincible | 천하무적 | 강화 | P1 | invincible.ts:33 `COOLDOWN_ROUNDS = 2`, 66-74, 134-140 | 쿨다운을 3국으로 올리거나(반장 한정) 매치 상한을 `scaledUses`로 병기 |
| last_stand | 승부수 | 강화 | P2 | last_stand.ts:49-50 국 스코프 `usedKey`, 104-107 "(매 국 1회)" | 없음 |
| yakuman_shield | 역만 방어술 | 강화 | P1 | yakuman_shield.ts:6-7·78-81 "횟수 제한 없음", 56-57 `usedKey`는 **카운터일 뿐 게이트가 아님** | 매치 방어 횟수 상한을 `scaledUses(state,2)`(동풍2·반장3)로 부여 |
| always_tenpai | 승승장구 | 강화 | P1 | always_tenpai.ts:39 `PER_NOTEN_BONUS = 2000`, 54, 58-85 (상시, 유국마다) | 반장전 보너스 하향(1,300~1,500) 또는 매치 누적 상한 |
| no_ron_pact | 불가침 조약 | 강화 | P2 | no_ron_pact.ts:50 `PACT_TURNS = 6`, 87-111 (매 국 재개) | 없음 |

## P1 항목

### cliff_bloom (절벽 위에 피어난 꽃)
"횟수 제한 없음 · 조건 없음"(:393). 만개는 **국 스코프**(`bloomedKey` :112)라 국마다 다시 열리고, 트리거는 "그 국에 깡 2회"뿐이다 — 텐파이 여부조차 보지 않고 손패를 완성형으로 덮어쓴 뒤(:475-480) 영상개화를 4판으로 친다(:104). 반장전은 국 수가 약 2배라 **만개 기대 횟수도 그대로 2배**다. 게다가 매 깡마다 영상패를 고르는 상시 편의(:495-500)도 국 수에 정비례한다. 그룹 내 유일하게 «국마다 리셋되는 확정 화료»라 배증 효과가 가장 크다.

### invincible (천하무적)
쿨다운이 **국 단위 상수 2**(:33, ROUND_SETTLED마다 −1 :134-140)라 발동 총량이 국 수에 정비례한다. 동풍전 4국 = 최대 2회, 반장전 8국 = 최대 4회. 같은 defense 카테고리의 die_hard가 `matchUses`(1→2, 즉 1.5배 규약이 아니라 명시 스케일)를 쓰는 것과 대비된다 — 프로젝트가 정한 «반장전은 1.5배» 기준(util.ts:120-135)에서 홀로 2배로 벗어난다.

### yakuman_shield (역만 방어술)
설계상 무제한이 의도(:6-8)이고 `usedKey`(:57)는 게이트가 아니라 공개 카운터일 뿐이다. 반장전에서는 역만 시행 자체가 2배 나오므로 «역만 완전 면역»의 실효 가치가 그대로 2배가 된다. 문제는 이것이 **국사무쌍/스안커를 노리는 상대 증강(open_kokushi 포함)의 카운터**로도 동시에 작동한다는 점 — 반장전 역만 빌드의 기대값을 한 장이 통째로 지운다. 또한 die_hard와의 `conflicts`(die_hard.ts:86)로 픽 배제는 돼 있으나, 그 배제는 «자신이 둘 다 드는 것»만 막는다.

### always_tenpai (승승장구)
완전 패시브 + 유국마다 최대 +6,000(:39, :80-81). 반장전은 유국 발생 기회가 2배라 **매치 누적 기대이득이 정확히 2배**로 늘고, 여기에는 어떤 상한도 없다. 25,000 시작·30,000 반환점 기준으로 유국 3~4회면 반환점 하나를 유국만으로 넘긴다. 반장전 후반(남장) 순위 고정 압력이 특히 크다.

## 총평
- 이 그룹에서 **모드 길이를 인지하는 코드는 die_hard 하나뿐**이다(`matchUses`). 나머지 13종은 `roundScopedKey`(국 리셋) 또는 완전 상시라, 사용자 주장대로 "동풍전 기준 밸런싱 → 반장전에서 2배"가 그대로 성립한다.
- 다만 대부분(bluff_pretense·meld_dissolve·silent_pact·last_stand·no_ron_pact)은 **국당 1회형 전술 카드**라 배증이 곧 파탄은 아니다 — 국이 늘면 남들의 기회도 함께 늘기 때문에 상대적 우위는 완만하다. P2로 둔 이유다.
- 진짜 문제는 **국마다 리셋되는데 효과가 국을 초월하는 것들**이다: cliff_bloom(확정 역만급 화료), always_tenpai(무조건 순이득), yakuman_shield(무제한 면역), invincible(국 단위 쿨다운). 이 넷만 반장전에서 티어가 한 단계 올라간다.
- 시점 하드코딩(오라스·서입·동4국)은 **이 그룹 14종 어디에도 없다** — 깨짐(P0)은 0건. 점수 임계값 고정도 die_hard의 `REVIVE_CAP=25_000` 하나뿐이며, 이는 국 수가 아니라 시작 점수에 묶여 있어 모드 무관하게 옳다.
- 권고 우선순위: ① invincible 쿨다운 3국(또는 `scaledUses` 상한), ② yakuman_shield 매치 상한 도입, ③ always_tenpai 반장전 보너스 하향, ④ cliff_bloom 만개 매치 상한. `modes` 잠금이나 모드별 변형 분리(late_bloomer 방식)까지 갈 필요는 없고, 전부 `scaledUses` 규약으로 흡수 가능하다.
