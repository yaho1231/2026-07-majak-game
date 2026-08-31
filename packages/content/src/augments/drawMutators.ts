/**
 * **쯔모 변형 카드의 공용 술어** — "이 한 장의 종류를 누가 가져가는가".
 *
 * 해저의 지배자(`haitei_lord`) · 마작의 거신병(`giant_god`) · 소환(`conjure_draw`)은
 * 셋 다 `TILE_DRAWN` 리액션에서 **같은 tileId**에 `tileKindChanged`를 쏜다. 둘 이상이
 * 같은 한 장을 노리면 나중에 설치된 쪽, 즉 **드래프트 픽 순서**가 이기고 진 쪽은 조용히
 * 죽는다 — 국당 1회를 태운 채 아무 일도 못 한다.
 *
 * - 2026-08-23 (QA synergy3 kandora 확정 2): 소환 × 지배자를 `haiteiLordWaits`라는
 *   공통 술어로 고쳤다.
 * - 2026-08-31 (QA synergy4 handedit 확정 1): **거신병이 그 술어에 없었다.** 거신병 ×
 *   소환은 설치 순서가 국사무쌍 성립을 정했고(순서를 바꾸면 «다음 순에 반드시 화료»가
 *   false), 어느 쪽이든 두 카드의 «국당 1회»가 함께 탔다. 그래서 술어를 이 파일로
 *   일반화해 **세 카드가 전부 같은 것을 읽는다**.
 *
 * ## 우선순위 — 해저의 지배자 > 거신병 > 소환
 *
 * 1. **해저의 지배자**: "패산 마지막 패는 지배자의 것"이 카드의 설계 문장이고, 그 한 장은
 *    오름패가 되면 그 자리에서 해저로월 화료 + 3판이다. 보유자에게 언제나 낫다.
 * 2. **거신병**: 각성의 약속은 조건 없는 «다음 순에 반드시 화료한다»(국사무쌍 역만)이다.
 *    카드에 적힌 확정 문장이라 다른 카드의 사정으로 깨지면 그건 거짓말이 된다.
 * 3. **소환**: 약속은 «다음 내 쯔모»다. 위 둘에 양보해도 **예약이 남으므로** 그다음 쯔모에
 *    그대로 온다 — 잃는 것은 한 순뿐이고, 국당 1회는 타지 않는다.
 *
 * 진 쪽은 **아무것도 emit하지 않고 예약도 비우지 않는다**(순수한 양보). 예약은 전부 국
 * 스코프라 국이 끝나면 저절로 만료된다.
 *
 * ## 왜 «누가 이미 바꿨나»로는 못 고치는가
 * 그게 바로 순서 의존이다. 세 리액션은 같은 이벤트에 대해 **같은 pre-state**를 보므로,
 * 양쪽이 같은 술어를 읽고 진 쪽이 스스로 물러나야 순서와 무관해진다.
 */

import {
  handIdsOf,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";
import { flagOf } from "../util.js";
import { haiteiLordWaits } from "./haitei_lord.js";
import { roundScopedKey } from "./roundScope.js";

/** 이 파일이 조정하는 세 카드 (우선순위 높은 순) */
export type DrawMutator = "haitei_lord" | "giant_god" | "conjure_draw";

/** 우선순위 — 앞에 있을수록 세다 */
const PRIORITY: readonly DrawMutator[] = ["haitei_lord", "giant_god", "conjure_draw"];

// ── 예약 키 (각 카드의 구현이 이 파일의 것을 그대로 쓴다 — 키가 한 곳에만 있게) ──

/** 소환: 다음 쯔모로 부를 목표 kind (소비하면 비운다) */
export const conjurePendingKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("conjure_draw", "pending", state, h);
/** 거신병: 각성 다음 정상 쯔모를 오름패로 만드는 예약 */
export const giantGodTsumoKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey("giant_god", "tsumo", state, h);

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
 * **이 한 장의 종류를 누가 가져가는가** — 세 카드가 전부 이것을 읽는다.
 *
 * `self`보다 우선순위가 높은 카드가 이 한 장을 가져가면 그 id를 돌려준다(= `self`는
 * 물러난다). 아무도 없으면 null.
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
  if (conjurePendingKind(state, holder) !== null) return "conjure_draw";
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
  return PRIORITY.indexOf(winner) < PRIORITY.indexOf(self);
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
 */
export function reservedNextDrawKind(
  state: GameState,
  holder: PlayerId,
): { kind: TileKind } | "unknown" | null {
  if (giantGodTsumoPending(state, holder)) return "unknown";
  const conjured = conjurePendingKind(state, holder);
  return conjured === null ? null : { kind: conjured };
}
