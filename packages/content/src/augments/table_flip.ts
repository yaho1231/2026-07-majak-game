/**
 * 밥상 뒤엎기 (table_flip, prism) — 매 국 배패 직후 1회, 손패를 통째로 산에 반납하고
 * 패산에서 새 손을 받는다. "이 손으로는 못 살아" — 마음에 안 드는 배패를 매 국 엎는다.
 *
 * 부수는 상식: 배패는 받아들여야 할 운명 — 마음에 안 들면 상을 엎는다.
 *
 * 도파민 순간: 13장이 쾅 공개되고 새 손이 깔린다. 쓰레기가 리치 그림으로 환생하면 함성,
 * 더 구려지면 그날의 개그.
 *
 * 대응: 엎은 손이 통째로 공개 정보가 되므로 버린 색·형태로 새 손의 방향까지 좁혀진다.
 * 매 국 가능하지만 공개 비용 탓에 남발이 곧 자해다.
 *
 * 구현: full_hand_swap 방식 재사용 — 손패를 **패산 맨 밑**으로 반납하고 패산 **위**에서 같은
 * 장수를 새로 받는다(moveTiles). 결정적이라 리플레이 안전(prng 불필요), 패산 총량 불변.
 * 리미트는 매 국 1회(roundKey 스코프), 페널티 없음. 반납한 손패는 전원에게 공개된다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindOf,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import {
  flagOf,
  publishUsesLeft,
  replaceDrawnTile,
  roundViewKey,
} from "../util.js";
import { handIsPoor } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "table_flip";
const ACTION = "table_flip_do";
const TABLE_FLIP_PERFORMED = "TableFlipPerformed";

/** 매 국 1회 사용 플래그 (roundKey 스코프) */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

/** 배패 직후(자기 첫 순, 아직 이 국에서 안 버렸을 때)인가 */
function atFirstHand(state: GameState, holder: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== holder) return false;
  // 쯔모를 마친 순이어야 한다. 치·펑 직후에도 turn.act이지만 그때는 lastDrawnTile이
  // null이고, 리듀서가 새 손의 마지막 패를 쯔모패로 세우면 **후로 턴인데 쯔모 화료
  // 옵션이 열린다** — 실제 마작에서 불가능한 상태이고, lastDrawnTile을 읽는 규칙
  // (리치 쯔모기리 강제·안깡 판정)이 통째로 오염된다(docs/25 방해 #11).
  if (r.lastDrawnTile === null) return false;
  return (r.byPlayer[holder]?.discardCount ?? 0) === 0;
}

interface TableFlipPayload {
  holder: PlayerId;
  /** 산 맨 밑으로 반납하는 손패 전체 */
  returned: TileId[];
  /** 패산 위에서 새로 받는 패 (returned와 같은 장수) */
  drawn: TileId[];
  /** 반납한 손패의 kind (전원 공개용) */
  revealedKinds: TileKind[];
}

const tableFlipAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no table_flip augment";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    if (!atFirstHand(state, req.player)) return "only right after the deal";
    const hand = handIdsOf(state, req.player);
    // 반납한 손패는 맨 밑으로 가므로, 위에서 같은 장수를 받으려면 패산에 그만큼 있어야 한다
    if (wallLen(state) < hand.length) return "not enough wall tiles";
    return null;
  },
  toEvents: (req, { state }) => {
    const returned = [...handIdsOf(state, req.player)];
    // 내 손패는 패산 끝(맨 밑)으로 가므로, 앞쪽 N장은 그대로 남아 새 손이 된다
    const drawn = (state.zones[WALL]?.tileIds ?? []).slice(0, returned.length);
    const payload: TableFlipPayload = {
      holder: req.player,
      returned,
      drawn,
      revealedKinds: returned.map((id) => kindOf(state, id)),
    };
    return [{ type: TABLE_FLIP_PERFORMED, payload }];
  },
};

export const tableFlip: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "밥상 뒤엎기",
  description:
    "(매 국 1회) 국 첫 순에 손패를 통째로 뒤엎는다 — 반납한 손패는 전원에게 공개된다.",
  detail:
    "손패는 패산 맨 밑으로 반납되고 새 손패를 패산 위에서 받는다. 반납한 패는 **그 순의 쯔모패까지 포함해** 발동 순간 전원의 화면에 잠깐 펼쳐졌다가 사라진다.\n\n쯔모 없이 맞은 순(치·퐁 직후)에는 발동할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.reducers.has(TABLE_FLIP_PERFORMED)) {
      engine.reducers.register(TABLE_FLIP_PERFORMED, (state, event) => {
        const p = event.payload as TableFlipPayload;
        // ① 손패를 패산 맨 밑(배열 끝)으로 반납
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, p.returned);
        // ② 패산 위에서 같은 장수를 새 손으로 (①에서 넣은 패는 맨 밑이라 안 걸린다)
        zones = moveTiles(zones, WALL, handZone(p.holder), p.drawn);
        // ③ 쯔모패를 새 손의 마지막 패로 갱신한다.
        //    반납한 손패에는 그 순의 쯔모패도 들어 있다. 갱신하지 않으면 round.lastDrawnTile이
        //    **이제 패산에 있는 패**를 계속 가리켜, 쯔모 화료가 영영 성립하지 않고
        //    쯔모패를 손에서 빼는 다른 증강(무르기 등)이 moveTiles에서 국을 죽인다.
        // 원래 쯔모패가 없던 턴(후로 직후)이면 없는 채로 둔다 — validate가 이미
        // 막지만, 리듀서가 단독으로도 없던 쯔모패를 만들지 않게 한 겹 더 지킨다.
        const nextDrawn =
          state.round.lastDrawnTile === null
            ? null
            : (p.drawn.at(-1) ?? state.round.lastDrawnTile);
        return {
          ...state,
          zones,
          round: replaceDrawnTile(state.round, nextDrawn),
          augmentData: {
            ...state.augmentData,
            // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
            ...handAlteredMark(state, p.holder),
            [usedKey(state, p.holder)]: true,
            // 반납한 손패를 전원 공개
            [roundViewKey("*", `${ID}:${p.holder}`)]: p.revealedKinds,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(tableFlipAction);
    }

    ctx.holderTurnOptions((state) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (!atFirstHand(state, holder)) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  // 배패가 나쁘면(고립패가 많으면) 통째로 새로 받는다 — 이미 쓸 만한 배패는 지킨다.
  // 나쁜 손이 곧 발동 조건 — planner의 `advance` 적기와 방향이 반대다(개벽 참고).
  // 배패를 통째로 다시 받는 것뿐이라 손해가 없어 문턱을 낮게(3샹텐) 잡는다.
  bot: plan({
    // 손패를 전부 산에 반납하고 새로 받는다 — 갈아엎기다
    intent: "rewrite",
    fleeting: true,
    pick: (ctx) =>
      handIsPoor(ctx, 3) ? (ctx.options.find((o) => o.type === ACTION) ?? null) : null,
  }),
});
