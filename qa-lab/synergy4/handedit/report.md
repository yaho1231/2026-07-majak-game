# 손패 조작 · 쯔모 · 템포 축 (hand_edit / draw / tempo) — synergy4

축 27종 / 전수 소크 351짝 × 시드2 = 702판 + 표적 재현 ~350조합. **확정 4 · 의심 3.**
축 목록: `take_back, omni_chi, tile_dyeing, suit_unify, hand_swap3, full_hand_swap, future_sight,
bottom_deal, nagashi_yakuman, alchemist, time_stop, haitei_lord, dead_wall_master, genesis,
table_flip, always_tenpai, even_world, giant_god, conjure_draw, regret, tile_split,
three_dragons_will, hourglass, time_pressure, soul_strike, picky_eater, joker`
— 축 안에 `conflicts`로 잠긴 짝은 없다(351짝 전부 동시 보유 가능).

> 이 파일은 담당 에이전트의 보고를 메인 세션이 옮겨 적은 것이다(에이전트 쪽 파일 쓰기가 막혔다).
> 스크립트와 로그는 전부 이 디렉터리에 있다. `packages/` 는 손대지 않았다.

## 확정 결함

### 확정 1 🔴 `giant_god` × `conjure_draw` — 설치(드래프트 픽) 순서가 역만을 정한다
- 위치: `giant_god.ts:317-330` × `conjure_draw.ts:149-158` — 둘 다 `TILE_DRAWN` 리액션에서 **같은 tileId**에
  `tileKindChanged`. 소환은 `haiteiLordWaits`(`conjure_draw.ts:140-148`)만 보고 물러난다.
  **거신병은 그 술어에 없다.**
- 기대: 지배자×소환처럼 공통 술어로 한쪽이 스스로 물러나고 자원을 태우지 않는다.
- 실측(같은 장면, 설치 순서만 교체):

| 설치 순서 | 다음 쯔모 | 거신병 «반드시 화료» | 소진 |
|---|---|---|---|
| `giant_god`→`conjure_draw` | man2 (소환 승) | **false** ❌ 국사무쌍 소멸 | 둘 다 used=true |
| `conjure_draw`→`giant_god` | man1 (거신병 승) | true | 둘 다 used=true, 소환은 부른 패 못 받음 ❌ |

  두 경우 모두 예약이 null로 비워지고 `used`는 둘 다 true.
- 재현: `repro_drawmutators.ts` (§1; §2는 이미 고쳐진 지배자×소환 대조군)
- 영향: 손해가 국사무쌍 역만 32,000/48,000. 둘 다 prism, conflicts 없음.
- 제안: `giantGodTsumoPending()` 같은 순수 술어를 export 하고 소환이 `haiteiLordWaits` 옆에서 함께 읽어
  물러난다(예약은 남긴다).

### 확정 2 🟠 `tile_dyeing` × `alchemist` — 리치 중 «버릴 패»를 고른다
- 위치: `tile_dyeing.ts:161-163`(리치 검사 삭제) · `alchemist.ts`(리치 검사 없음).
  대조로 `tile_split:109`·`even_world:139`·`genesis:177`·`suit_unify:120`·`joker:116`·`picky_eater:176`·
  `hand_swap3:226`·`full_hand_swap:186`·`future_sight:148`·`three_dragons_will:154`·`giant_god:209`는
  전부 리치 동결 가드가 있다 — 이 축에서 리치 중 손을 고칠 수 있는 건 이 둘뿐.
- 기대: 손 안의 다른 패로 대기를 옮기는 것까지. 강에 나가는 것은 뽑은 그 패.
- 실측: 리치 중 `discard` 후보는 끝까지 **1개(tileId 68)**뿐인데 그 **종류**가 갈린다. 쯔모패 `pin9` 기준 —

| 조합 | 강에 낼 수 있는 종류 |
|---|---|
| 없음 | pin9 (1) |
| 염색만 | man9·sou9 (2) |
| 연금술만 | pin8 (1) |
| **염색+연금술(같은 순)** | **man9·man8·sou9·sou8 (4)** |

  턴 가드 키가 달라 같은 순에 둘 다 발동하고, 연금술이 이미 물든 패에 다시 걸려 **합이 아니라 곱**이 된다.
  횟수는 각각 동풍 5·반장 8회.
- 재현: `repro_riichi_edit.ts`
- 영향: 리치의 유일한 대가(위험패 강제 타패)가 사라진다.
- ⚠ 설계 판단 필요: 「리치 중 사용 가능」은 무페널티 원칙에 따른 의도된 완화지만, 여기까지 간다는 말은
  어느 카드에도 없다. 최소 수정 = 리치 중일 때만 두 카드의 대상에서 **쯔모패를 제외**.

### 확정 3 🟠 `time_stop` × `soul_strike` / `hourglass` — 매 국 1회 충전이 효과 0으로 소모
- 위치: `time_stop.ts` 인터셉터/리액션 쌍. 리액션이 «되돌림이 적용됐나»를 `round.turnSeat === seat`로
  판정하는데, `soul_strike`·`hourglass`의 `TURN_PASSED` 인터셉터가 이미 nextSeat을 보유자로 고정해
  그 판정이 저절로 참이 된다. `used`는 선언 시점에 이미 선다.
- 기대: 폭주 6쯔모 → 7순, 연장 4순 → 5순. detail은 «소멸하지는 않는다»를 명시.
- 실측(버림 순서열 글자 비교):

| 조건 | 최장 p0 연속 | 순서열 |
|---|---|---|
| 시간 정지 단독 (안 누름→누름) | **1 → 2** ✅ | `0123…` → `00123…` |
| soul_strike 만 / +폭주 중 time_stop | 7 → **7** ❌ | `0000000123…` **완전히 동일** |
| hourglass 만 / +연장 중 time_stop | 4 → **4** ❌ | `010000` **완전히 동일** |

  둘 다 `time_stop:used=true`, `armed=false`. 버튼은 정상 제시되고 봇 정책은 «텐파이면 누른다»라
  폭주 중 항상 태운다.
- 재현: `repro_extraturn.ts`
- 제안: «적용됐다» 판정을 상태가 아니라 자기 인터셉터가 실제로 값을 바꿨는지로 바꾼다(국 스코프 키).

### 확정 4 🟠 «만든 패»가 공용 패산으로 되돌아간다 — 가공 7종 × 반납 4종 (22/28)
- 위치: 가공 = `tile_dyeing`·`alchemist`·`tile_split`·`even_world`·`suit_unify`(suitUnifyCore)·`joker`·
  `three_dragons_will` (`conjured:true`) × 반납 = `genesis.ts:211-216`·`table_flip.ts:135`·
  `full_hand_swap.ts:283`·`future_sight.ts:329` (`moveTiles(hand → WALL)`).
  반납 시 생성 표식을 벗기는 코드가 없다.
- 실물 수지(136·중복0)는 전 조합에서 유지 — 깨지는 것은 **종류별 4장 한도**.

| 가공 → 반납 | 패산 속 생성패 | 게임 내 총 장수 |
|---|---|---|
| `three_dragons_will` → 셋 | 3장(中) | **中 7장** |
| `even_world` → 셋 | 5장 | 4만5·2통6·8삭6 |
| `suit_unify` → 셋 | 4장 | 1만6·9만6 |
| `tile_split` → 셋 | 2장 | 1만6 |
| `tile_dyeing`/`alchemist`/`joker` → 셋 | 1장 | 5 |

- **남이 실제로 뽑는다**: 3dw→table_flip 장면을 유국까지 몰면 패산에 들어간 tileId 4·8·12를
  **p1·p2·p3이 한 장씩** 뽑았다. 실게임(반장전·봇4인·시드3)에서도 재현 —
  `even_world+table_flip` 한 국에 **패산 속 생성패 9장**, `tile_split+table_flip` 7장, `3dw+table_flip` 6장.
- 재현: `repro_conjured_wall.ts`(강제 28칸 + 남이 뽑기), `repro_wall_leak_live.ts`(실게임)
- 영향: 상대의 «넉 장 다 보였으니 안전» 판단이 전부 거짓이 되고, 원인이 화면 어디에도 없다.
  synergy3 handedit 의심 2가 소환×무르기 **한 장**으로 지적하고 "단색·밥상·통째로에도 있다"고 적은 채
  확인하지 않은 나머지다 — 규모가 최대 9장.
- 제안: 손패를 WALL로 반납하는 네 리듀서를 공통 헬퍼로 모아 `conjured`를 벗기고 원래 kind로 복원.

## 의심
1. 🟡 **리치 중 대기를 옮겨도 `riichiFuriten`이 남는다** — `core/.../helpers.ts:658`은 손패를 안 보고
   즉시 후리텐. 염색·연금술로 대기를 통째로 옮겨도 영구 차단. `giant_god.ts:321-322`가
   «대기가 갈렸다»로 furiten을 내리는 선례가 이미 있다. **끝까지 몰아 본 재현을 못 만들어** 확정 못 함.
2. 🟡 **`regret` 주입 배패 13장이 전부 생성패** → 확정 4의 최악 경로(13장 한꺼번에 패산 유입).
   봇 반장전 9판×3시드에서 `table_flip`/`full_hand_swap`/`genesis`와 **동시 발동이 한 번도 안 나와** 관측 실패.
   기전은 확정 4와 동일.
3. ⚪ (테스트 위생) `qa-lab/synergy3/handedit/repro_hourglass_regret.ts`의 장면은 p0 버림이 `1z`뿐이라
   `hourglass.ts`의 `nagashiStanding` 가드(2026-08-23 추가)에 걸려 **연장이 한 번도 발동하지 않는다**
   — 그 스크립트를 근거로 삼으면 안 된다. 이번엔 버림을 `5m5p`로 바꿔 새로 세웠다.

## 음성 확인
- **전수 소크 351짝 × 시드2 = 702판**: 크래시 0 · 훅 예외 0 · 불변식 위반 0. 점수 드리프트 10건은 전부
  `ATTRIBUTED`(haitei_lord +6000/+6800, future_sight +5400, open_riichi +700/+900, sign_flip +2000).
  로그 `out/soak.[0-7].log`.
- **쯔모 조작 겹침 4건 ✅** (`repro_draworder.ts`): 소환+밑장빼기는 **둘 다 산다**(실물=맨 밑, 종류=소환 목표);
  밑장×해저(패산 1·2장) 이중발동·유실 없음; 소환×해저는 양 설치 순서 모두 2026-08-23 수정이 살아 있음;
  무르기×밑장빼기는 맨 밑 복원.
- **같은 순 2장 손패 조작 182 순서쌍 ✅** (`repro_pairs.ts`): 손14/상대13/왕패14/총136/중복0 전부 유지.
  «두 번째가 안 열림» 4건(→`three_dragons_will`)은 앞 카드가 삼원패를 치운 정상 안티시너지.
- **교체 후 텐파이 갱신 121칸 전부 ✅** (`repro_tenpai_refresh.ts`): 코어 텐파이 진실값과 제시되는 `riichi`
  후보가 한 건도 어긋나지 않음. **텐파이 갱신 누락 없음.**
- **산 소모·왕패 경계 ✅** (`repro_wallbound.ts`): 연장 중 future_sight/take_back/bottom_deal/
  dead_wall_master를 계속 눌러도 왕패 ≤14, 영상 잔량 ≥0, 도라 표시패 불변.
- 기타: time_stop 단독 정상, soul_strike 단독 연속 7순, hourglass 단독 정확히 4순,
  always_tenpai×hourglass/regret은 소스·카드 문구 모두에 경계가 명시(2026-08-23 결론 유지),
  bottom_deal×haitei_lord는 규칙대로의 안티시너지.

## 스크립트
`lib.ts` · `soak.ts`(샤딩: `tsx soak.ts <shard> <count>`) · `repro_drawmutators.ts`(확정1) ·
`repro_riichi_edit.ts`(확정2) · `repro_extraturn.ts`(확정3) ·
`repro_conjured_wall.ts`+`repro_wall_leak_live.ts`(확정4) · `repro_draworder.ts` · `repro_pairs.ts` ·
`repro_tenpai_refresh.ts` · `repro_wallbound.ts` · `out/`(로그)
