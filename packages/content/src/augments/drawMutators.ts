/**
 * **쯔모 변형 카드의 공용 술어** — "이 한 장의 종류를 누가 가져가는가".
 *
 * 해저의 지배자(`haitei_lord`) · 마작의 거신병(`giant_god`) · 절벽 위에 피어난 꽃의 만개
 * (`cliff_bloom`) · 한 끗 차이(`off_by_one`) · 소환(`conjure_draw`)은 전부 `TILE_DRAWN`
 * 리액션에서 **같은 tileId**에 `tileKindChanged`를 쏜다. 둘 이상이 같은 한 장을 노리면
 * 나중에 설치된 쪽, 즉 **드래프트 픽 순서**가 이기고 진 쪽은 조용히 죽는다 — 국당 1회를
 * 태운 채 아무 일도 못 한다.
 *
 * - 2026-08-23 (QA synergy3 kandora 확정 2): 소환 × 지배자를 `haiteiLordWaits`라는
 *   공통 술어로 고쳤다.
 * - 2026-08-31 (QA synergy4 handedit 확정 1): **거신병이 그 술어에 없었다.** 거신병 ×
 *   소환은 설치 순서가 국사무쌍 성립을 정했고(순서를 바꾸면 «다음 순에 반드시 화료»가
 *   false), 어느 쪽이든 두 카드의 «국당 1회»가 함께 탔다. 그래서 술어를 이 파일로
 *   일반화해 **세 카드가 전부 같은 것을 읽는다**.
 * - 2026-09-16 (docs/55 §2-2 C-1): **한 끗 차이와 만개가 여전히 밖에 있었다.** 둘 다 같은
 *   `TILE_DRAWN`에서 kind를 바꾸는데 여기 가입돼 있지 않아, 소환과 같은 쯔모에서 만나면
 *   다시 픽 순서가 최종 kind를 정했다 — 만개 뒤에 소환이 그 한 장을 덮어쓰면 만개한 손이
 *   화료형이 아니게 되어 매치 예산(동풍전 1회)이 헛되이 타고, 반대 순서면 소환의 «국당
 *   1회»가 이미 덮인 패에 소비됐다. 두 카드를 가입시켜 **다섯 카드가 전부 같은 것을 읽는다.**
 *
 * ## 우선순위 — 해저의 지배자 > 거신병 > 만개 > 한 끗 차이 > 소환
 *
 * 원칙은 하나다: **양보했을 때 잃는 것이 큰 쪽이 이긴다.** 카드에 적힌 확정 문장이 거짓이
 * 되거나 더 비싼 자원이 헛되이 타는 쪽이 앞이고, 양보해도 예약이 남아 다음 쯔모에 그대로
 * 오는 쪽이 뒤다. 조건이 좁을수록(그 한 장이 아니면 안 될수록) 앞이다.
 *
 * 1. **해저의 지배자**: "패산 마지막 패는 지배자의 것"이 카드의 설계 문장이고, 그 한 장은
 *    오름패가 되면 그 자리에서 해저로월 화료 + 3판이다. 보유자에게 언제나 낫다.
 * 2. **거신병**: 각성의 약속은 조건 없는 «다음 순에 반드시 화료한다»(국사무쌍 역만)이다.
 *    카드에 적힌 확정 문장이라 다른 카드의 사정으로 깨지면 그건 거짓말이 된다.
 * 3. **만개**(`cliff_bloom`): 영상패 쯔모에서만 일어난다 — 위 둘은 영상패를 보지 않으므로
 *    실제로 만나는 상대는 한 끗 차이·소환뿐이다. 조건(한 국에 깡 두 번)이 가장 좁고
 *    자원(매치당 만개 1회·반장전 2회)이 가장 비싸며, 약속은 «그 자리에서 화료»다.
 *    손패 전부를 화료형으로 다시 짜므로 그 위에 다른 카드가 한 장이라도 덮어쓰면 화료형이
 *    깨진다 — 만개가 이겨야 만개의 문장이 지켜진다.
 * 4. **한 끗 차이**(`off_by_one`): 상시·무자원이지만 이기면 **그 자리에서 쯔모 화료**다.
 *    양보하면 그 쯔모의 기회는 영영 사라진다(예약이 없다). 소환은 양보해도 예약이 남으니,
 *    «빗나간 패가 오름패가 된다»(확정 화료)가 «부른 패가 온다»(대개 화료가 아니다)보다
 *    앞이다. 위 셋에는 진다 — 셋 다 어차피 화료(또는 그 이상)를 주고, 그쪽이 더 좁은
 *    조건·더 비싼 자원이다.
 * 5. **소환**: 약속은 «다음 내 쯔모»다. 위에 양보해도 **예약이 남으므로** 그다음 쯔모에
 *    그대로 온다 — 잃는 것은 한 순뿐이고, 국당 1회는 타지 않는다.
 *
 * 진 쪽은 **아무것도 emit하지 않고 예약도 비우지 않는다**(순수한 양보). 예약은 전부 국
 * 스코프라 국이 끝나면 저절로 만료된다.
 *
 * 6. **욕심**(`greed`, 2026-09-24): 약속은 소환과 같다 — «다음 내 쯔모가 방금 쯔모한 패와 같은
 *    종류로 온다». 양보해도 예약이 남으므로 소환 바로 뒤다. 한 사람이 둘을 함께 걸면 소환이
 *    먼저 오고 욕심은 그다음 쯔모에 온다.
 *
 * 7. **위그드라실**(2026-09-24): 켜진 국의 자패 쯔모를 발로 바꾼다. 상시 효과라 양보해도
 *    자원이 타지 않고, 양보한 그 한 장만 자패로 남는다 — 가장 뒤다.
 *
 * ## 가입 대상이 아닌 것 (2026-09-16 확인 — `TILE_DRAWN`·`tileKindChanged(` 문자열을 둘 다
 * 가진 파일이지만 이 조정과 무관하다. `draw_mutators_0916.test.ts`의 정적 스캔이 이 표를 고정한다)
 * - `red_five_touch` — 각인은 attrs(red/redFor)만 바꾸고 **kind는 불변**이다. 게다가 특정
 *   이벤트가 아니라 `"*"`에 걸려 손패를 다시 훑는다.
 * - `alchemist` · `tile_dyeing` — kind를 바꾸긴 하지만 **액티브 액션**(자기 순의 조작)에서
 *   바꾼다. `TILE_DRAWN`은 주석에만 등장한다(예전 잔량 동기화 자리 이야기).
 *
 * ## 왜 «누가 이미 바꿨나»로는 못 고치는가
 * 그게 바로 순서 의존이다. 리액션들은 같은 이벤트에 대해 **같은 pre-state**를 보므로
 * (`EventProcessor`는 리액션이 낸 이벤트를 큐 뒤에 붙인다), 모두가 같은 술어를 읽고 진
 * 쪽이 스스로 물러나야 순서와 무관해진다.
 */

import {
  handIdsOf,
  isHonor,
  isNumberSuit,
  kindOf,
  meldCountOf,
  sameKind,
  scoringOptionsOf,
  winHandIdsOf,
  winningKinds,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";
import { copiesLeftUndrawn, counterOf, flagOf, scaledUses } from "../util.js";
import { haiteiLordWaits } from "./haitei_lord.js";
import { roundScopedKey } from "./roundScope.js";
import { rankAdjacent, wrapRanksOn } from "./wrapRanks.js";

/** 이 파일이 조정하는 다섯 카드 (우선순위 높은 순) */
export type DrawMutator =
  | "haitei_lord"
  | "giant_god"
  | "cliff_bloom"
  | "off_by_one"
  | "conjure_draw"
  | "greed"
  | "yggdrasil";

/** 우선순위 — 앞에 있을수록 세다 (근거는 머리말) */
export const DRAW_MUTATOR_PRIORITY: readonly DrawMutator[] = [
  "haitei_lord",
  "giant_god",
  "cliff_bloom",
  "off_by_one",
  "conjure_draw",
  "greed",
  "yggdrasil",
];

/**
 * `TILE_DRAWN`과 `tileKindChanged(`를 둘 다 가졌지만 이 조정에 **가입하지 않는** 카드
 * (이유는 머리말 «가입 대상이 아닌 것»). 정적 스캔 테스트가 «가입 ∪ 예외 == 스캔 결과»를
 * 고정하므로, 새 카드가 쯔모에서 kind를 바꾸기 시작하면 여기든 PRIORITY든 한쪽에 넣어야 한다.
 */
export const DRAW_MUTATOR_EXEMPT: readonly string[] = [
  "red_five_touch",
  "alchemist",
  "tile_dyeing",
];

/** 보유자가 그 카드를 들고 있는가 (상태 키가 없는 상시 카드의 «설치됨» 판정) */
function holds(state: GameState, holder: PlayerId, id: string): boolean {
  return state.players.find((p) => p.id === holder)?.augments.includes(id) === true;
}

// ── 예약 키 (각 카드의 구현이 이 파일의 것을 그대로 쓴다 — 키가 한 곳에만 있게) ──

/** 소환: 다음 쯔모로 부를 목표 kind (소비하면 비운다) */
export const conjurePendingKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("conjure_draw", "pending", state, h);
/** 거신병: 각성 다음 정상 쯔모를 오름패로 만드는 예약 */
export const giantGodTsumoKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("giant_god", "tsumo", state, h);

/** 욕심: 다음 쯔모로 바꿀 kind (소비하면 비운다) */
export const greedPendingKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("greed", "pending", state, h);

/** 위그드라실: 이번 국에 켰는가 (켜진 국의 자패 쯔모가 발이 된다) */
export const yggdrasilOnKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("yggdrasil", "on", state, h);

/** 만개까지 필요한 깡 횟수 */
export const CLIFF_BLOOM_KANS_TO_BLOOM = 2;
/** 만개: 이번 국에 보유자가 선언한 깡 수 */
export const cliffBloomKansKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("cliff_bloom", "kans", state, h);
/** 만개: 이번 국에 이미 만개했는가 */
export const cliffBloomBloomedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("cliff_bloom", "bloomed", state, h);
/** 만개: 이 게임에 이미 만개한 횟수 (매치 스코프 — 국이 바뀌어도 남는다) */
export const cliffBloomBloomsUsedKey = (h: PlayerId): string => `cliff_bloom:blooms:${h}`;
/** 만개: 게임당 만개 횟수 (동풍전 1 · 반장전 2 — 왜 매치 예산인지는 cliff_bloom.ts) */
export const cliffBloomBudget = (state: GameState): number => scaledUses(state, 1);

/** 국사무쌍 13종 — 거신병이 부를 수 있는 오름패의 후보 집합 (`giant_god`도 이것을 쓴다) */
export const KOKUSHI_KINDS: readonly TileKind[] = [
  { suit: "man", rank: 1 },
  { suit: "man", rank: 9 },
  { suit: "pin", rank: 1 },
  { suit: "pin", rank: 9 },
  { suit: "sou", rank: 1 },
  { suit: "sou", rank: 9 },
  { suit: "wind", rank: 1 },
  { suit: "wind", rank: 2 },
  { suit: "wind", rank: 3 },
  { suit: "wind", rank: 4 },
  { suit: "dragon", rank: 1 },
  { suit: "dragon", rank: 2 },
  { suit: "dragon", rank: 3 },
];

/** 소환의 대기 목표 kind를 읽는다 (없거나 비었으면 null) */
export function conjurePendingKind(
  state: GameState,
  holder: PlayerId,
): TileKind | null {
  const v = state.augmentData[conjurePendingKey(state, holder)];
  if (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { suit?: unknown }).suit === "string" &&
    typeof (v as { rank?: unknown }).rank === "number"
  ) {
    const k = v as TileKind;
    return { suit: k.suit, rank: k.rank };
  }
  return null;
}

/** 욕심의 대기 kind를 읽는다 (없거나 비었으면 null) */
export function greedPendingKind(state: GameState, holder: PlayerId): TileKind | null {
  const v = state.augmentData[greedPendingKey(state, holder)];
  if (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { suit?: unknown }).suit === "string" &&
    typeof (v as { rank?: unknown }).rank === "number"
  ) {
    const k = v as TileKind;
    return { suit: k.suit, rank: k.rank };
  }
  return null;
}

/** 거신병의 «다음 정상 쯔모를 오름패로» 예약이 서 있는가 */
export function giantGodTsumoPending(state: GameState, holder: PlayerId): boolean {
  return flagOf(state, giantGodTsumoKey(state, holder));
}

/**
 * 거신병이 **이 한 장**을 실제로 가져가는가.
 *
 * 예약이 있어도 ①영상패이거나 ②스스로 요구패를 버려 부를 오름패가 없으면 아무 일도
 * 하지 않는다 — 그 경우 소환은 물러날 이유가 없다. 쯔모패를 뺀 13장으로 계산하므로
 * **뽑은 한 장이 그 사이 무엇으로 바뀌었든 결과가 같다** = 순서 무관.
 */
export function giantGodClaims(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  drawnTileId: TileId,
  rinshan: boolean,
): boolean {
  if (rinshan) return false;
  if (!giantGodTsumoPending(state, holder)) return false;
  return giantGodWinTargets(state, rules, holder, drawnTileId).length > 0;
}

/** 거신병이 부를 수 있는 오름패 목록 (쯔모패를 뺀 손패 기준) */
export function giantGodWinTargets(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  drawnTileId: TileId,
): readonly TileKind[] {
  const hand13 = handIdsOf(state, holder)
    .filter((id) => id !== drawnTileId)
    .map((id) => kindOf(state, id));
  return winningKinds(
    hand13,
    meldCountOf(state, holder),
    KOKUSHI_KINDS,
    scoringOptionsOf(state, rules, holder),
  );
}

/**
 * 만개가 이번 영상 쯔모에서 다시 짤 **멘쯔 수** — 손 크기가 화료형(머리 2 + 멘쯔 3씩)에
 * 맞지 않으면 null (그때 만개는 손대지 않는다).
 *
 * ⚠ 멘쯔 수를 4로 하드코딩하면 안 된다 — 진짜 용(scoring.totalSets=5, 손패 16/17장)
 * 보유자는 `sets*3+2`가 영원히 안 맞아 만개가 **한 번도 일어나지 않았다**(60차 수정).
 * 화료형의 단일 진실은 scoringOptionsOf다. `cliff_bloom.ts`의 `bloomChanges`가 같은
 * 값을 쓴다 — 여기 두는 이유는 아래 `cliffBloomClaims`가 카드 파일을 import하지 않고도
 * 같은 판정을 읽어야 해서다(카드 파일은 이 파일을 import하므로 역방향이면 순환).
 */
export function cliffBloomSetsToBuild(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): number | null {
  const opts = scoringOptionsOf(state, rules, holder);
  const totalSets = opts.totalSets ?? 4;
  const sets = totalSets - meldCountOf(state, holder);
  if (sets < 0) return null;
  if (handIdsOf(state, holder).length !== sets * 3 + 2) return null;
  return sets;
}

/**
 * 만개가 **이 한 장(영상패)**을 가져가는가 — «이번 영상 쯔모에서 만개가 일어난다».
 *
 * 조건은 `cliff_bloom.ts` 리액션의 것과 같다: 영상패 · 이번 국 깡 2회 이상 · 매치 예산
 * 남음 · 이번 국 아직 만개 안 함 · 손 크기가 화료형에 맞음. 전부 이번 이벤트의 pre-state
 * 만 읽으므로 **누가 먼저 뛰든 같은 답**이다.
 *
 * 남는 틈: 카드 쪽 `bloomChanges`는 위 조건이 다 맞아도 «표준형도 채움 배치도 화료형이
 * 아닌» 이색 채점 옵션(우는 국사무쌍류)에서 null을 돌려 만개를 건너뛴다. 그 판정은
 * 손 재구성 전체를 돌려야 알 수 있어 여기 옮기지 않았다(순환 import 회피). 그 corner에서
 * 소환·한 끗 차이는 헛되이 한 번 물러나지만 — 소환은 예약이 남고(순수 양보), 한 끗 차이는
 * 상시라 자원이 타지 않으며 — **순서 의존은 아니다**(양쪽 다 같은 답을 읽는다).
 */
export function cliffBloomClaims(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  rinshan: boolean,
): boolean {
  if (!rinshan) return false;
  if (counterOf(state, cliffBloomKansKey(state, holder)) < CLIFF_BLOOM_KANS_TO_BLOOM) {
    return false;
  }
  if (cliffBloomBudget(state) - counterOf(state, cliffBloomBloomsUsedKey(holder)) <= 0) {
    return false;
  }
  if (flagOf(state, cliffBloomBloomedKey(state, holder))) return false;
  return cliffBloomSetsToBuild(state, rules, holder) !== null;
}

/**
 * 한 끗 차이가 **이 한 장**을 어느 kind로 미는가 (밀지 않으면 null).
 *
 * 리치 중 · 수패 · 쯔모패를 뺀 손이 텐파이 · 뽑은 패가 이미 오름패는 아님 · 같은 무늬로
 * 숫자 ±1(끝없는 윤회가 있으면 9↔1도)인 대기 중 **남은 장수가 0이 아닌** 것. 이 술어가
 * 여기 있는 이유는 거신병과 같다 — 카드 파일이 이 파일을 import하므로 역방향 import를
 * 피해 술어를 이쪽에 둔다. `off_by_one.ts`도 이것으로 밀 kind를 정한다(단일 진실).
 *
 * - 대기는 쯔모패를 뺀 13장으로 계산한다. 뽑은 한 장의 «지금 kind»는 읽지만, 모든
 *   리액션이 같은 pre-state를 보므로 순서와 무관하다.
 * - 죽은 대기(남은 장수 0)에는 밀지 않는다. 밀어서 만든 패는 그 종류를 한 장 늘리므로,
 *   4장이 전부 바닥·남의 손·후로로 나온 대기에 밀면 그 종류가 5장이 된다 — 남은 장수를
 *   세는 쪽(`botHelpers.waitTilesLeft` · 대기 잔량 UI)이 0이라 하는데 화료가 나는 상태다
 *   (2026-08-20 QA 리치 확정 3). 세는 자는 `../util.js`의 `copiesLeftUndrawn`.
 * - 보유 여부는 보지 않는다 — 그건 `drawMutatorWinner`가 본다(상시 카드라 상태 키가 없다).
 */
export function offByOneTarget(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  drawnTileId: TileId,
): TileKind | null {
  if (state.round.byPlayer[holder]?.riichi == null) return null; // 리치 필수
  const drawn = kindOf(state, drawnTileId);
  if (!isNumberSuit(drawn)) return null;
  const hand13 = winHandIdsOf(state, rules, holder)
    .filter((id) => id !== drawnTileId)
    .map((id) => kindOf(state, id));
  const waits = winningKinds(
    hand13,
    meldCountOf(state, holder),
    undefined,
    scoringOptionsOf(state, rules, holder),
  );
  if (waits.length === 0) return null;
  // 이미 진짜 오름패면 손대지 않는다
  if (waits.some((w) => sameKind(w, drawn))) return null;
  // 순환이 켜져 있으면 9-1도 "한 칸 옆"이다
  const wrap = wrapRanksOn(state, rules, holder);
  return (
    waits.find(
      (w) =>
        w.suit === drawn.suit &&
        rankAdjacent(w.rank, drawn.rank, wrap) &&
        copiesLeftUndrawn(state, w) > 0,
    ) ?? null
  );
}

/**
 * **이 한 장의 종류를 누가 가져가는가** — 다섯 카드가 전부 이것을 읽는다.
 *
 * `self`보다 우선순위가 높은 카드가 이 한 장을 가져가면 그 id를 돌려준다(= `self`는
 * 물러난다). 아무도 없으면 null. 정상 쯔모에서는 지배자·거신병·한 끗 차이·소환이,
 * 영상패에서는 만개·한 끗 차이·소환이 후보다(지배자·거신병은 영상패를 보지 않는다).
 */
export function drawMutatorWinner(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  drawnTileId: TileId,
  rinshan: boolean,
): DrawMutator | null {
  if (!rinshan && haiteiLordWaits(state, rules, holder, drawnTileId).length > 0) {
    return "haitei_lord";
  }
  if (giantGodClaims(state, rules, holder, drawnTileId, rinshan)) return "giant_god";
  if (holds(state, holder, "cliff_bloom") && cliffBloomClaims(state, rules, holder, rinshan)) {
    return "cliff_bloom";
  }
  if (
    holds(state, holder, "off_by_one") &&
    offByOneTarget(state, rules, holder, drawnTileId) !== null
  ) {
    return "off_by_one";
  }
  if (conjurePendingKind(state, holder) !== null) return "conjure_draw";
  if (greedPendingKind(state, holder) !== null) return "greed";
  if (flagOf(state, yggdrasilOnKey(state, holder)) && isHonor(kindOf(state, drawnTileId))) {
    return "yggdrasil";
  }
  return null;
}

/** `self`가 이 한 장을 양보해야 하는가 (더 센 카드가 가져간다) */
export function yieldsDrawTo(
  self: DrawMutator,
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  drawnTileId: TileId,
  rinshan: boolean,
): boolean {
  const winner = drawMutatorWinner(state, rules, holder, drawnTileId, rinshan);
  if (winner === null || winner === self) return false;
  return DRAW_MUTATOR_PRIORITY.indexOf(winner) < DRAW_MUTATOR_PRIORITY.indexOf(self);
}

/**
 * **정보 증강용** — 보유자의 «다음 한 장»에 쯔모 변형이 예약돼 있는가.
 *
 * 삼세 예지(`triple_peek`)는 패산의 kind로 다음 세 쯔모를 예고하는데, 소환·거신병의
 * 변환은 **뽑힌 뒤에** 일어나므로 예약이 서 있으면 «오지 않을 패»를 확신 있게 예고했다
 * (2026-08-31 QA synergy4 info 확정 2 — 예고 pin9/sou1/sou2, 실제 man1).
 *
 * - `{ kind }` — 무엇이 올지 확정적으로 안다(소환의 목표). 그 kind로 갈아 끼운다.
 * - `"unknown"` — 바뀌긴 하는데 무엇이 될지는 그때의 손패가 정한다(거신병의 오름패).
 *   예고하지 않는다 — **틀린 정보를 확신 있게 주는 것이 정보 증강의 가장 나쁜 실패다.**
 * - `null` — 예약 없음. 패산 kind 그대로 예고한다.
 *
 * 해저의 지배자는 여기 없다: 발동 조건이 «그 쯔모 시점에 패산이 비어 있고 텐파이»라
 * 지금 상태로는 판정할 수 없고, 삼세 예지는 내 몫의 쯔모가 3장 남아야 켜지므로 겹치는
 * 구간이 거의 없다.
 *
 * 한 끗 차이·만개도 여기 없다(2026-09-16 가입 때 확인). 둘 다 **예약이 아니다** —
 * 한 끗 차이는 «뽑힌 패가 대기의 ±1인가»를 그 패의 kind로 판정하므로 «다음 한 장»에
 * 대해 미리 답할 수 없고(패산 kind가 대기의 이웃일 때만 그 대기로 바뀐다 — 보유자
 * 자신이 리치 대기를 알고 있어 새는 정보도 없다), 만개는 패산이 아니라 **영상패**에서만
 * 일어나 삼세 예지가 보는 «패산의 다음 세 장»과 만나지 않는다(깡을 하면 예고 자체가
 * 밀린다).
 */
export function reservedNextDrawKind(
  state: GameState,
  holder: PlayerId,
): { kind: TileKind } | "unknown" | null {
  if (giantGodTsumoPending(state, holder)) return "unknown";
  // 소환이 먼저 온다 — 둘 다 걸려 있으면 다음 한 장은 소환의 것이다(우선순위)
  const reserved = conjurePendingKind(state, holder) ?? greedPendingKind(state, holder);
  return reserved === null ? null : { kind: reserved };
}
