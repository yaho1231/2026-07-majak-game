/**
 * 소환 (conjure_draw, prism) — 액티브. 국당 1회.
 *
 * 자기 턴(turn.act)에 내 손패 1장을 지목하면, 그 패의 종류(kind)가 목표가 된다.
 * 다음 내 쯔모는 **그 패의 새 복제(conjured)**로 온다 — 패산에서 뽑히는 게 아니라
 * 허공에서 생성되어 손에 들어온다. "내가 부른 패가 다음 쯔모로 온다."
 *
 * 부수는 상식: 쯔모는 운이다 — 무엇이 올지는 패산이 정한다. 소환은 그 대전제를
 * 한 번 무력화해, 다음에 뽑을 실물 패의 kind를 내가 부른 패로 바꿔 conjured 표식을 단다.
 *
 * 도파민 순간: 대기가 한 장에 걸린 홀더가 그 한 장을 손에서 지목하면, 다음 턴 쯔모가
 * 정확히 그 패로 물질화된다 — 단기 대기가 확정 쯔모로 바뀌는 장면.
 *
 * 대응: 발동은 전원 공개(view:*)라 "무엇을 불렀는지"가 드러난다. 국당 1회라
 * 그 국 안에서 한 번 소진되면 그만이니, 발동을 유도해 흘려보내는 것이 대응이다.
 *
 * 구현 메모:
 * - 엔진은 실물 없는 새 tileId를 만들 수 없다 → **다음에 뽑는 실물 쯔모패의 kind를
 *   목표로 바꾸고**(tileKindChanged, conjured) 손패 장수는 그대로 둔다. 쯔모 한 장을
 *   정상적으로 뽑되 그 한 장의 정체만 바뀌므로 손패 산술이 정확히 맞는다.
 * - 대기 중인 목표 kind는 augmentData(`conjure_draw:pending:<holder>`)에 TileKind
 *   객체로 저장한다({suit, rank} — JSON 직렬화 가능). 다음 정상 쯔모(TILE_DRAWN,
 *   rinshan=false)에서 소비하고 즉시 비운다.
 * - 국당 1회 플래그(`conjure_draw:used:<round>:<holder>`)는 roundKey 스코프 — 매 국 초기화.
 * - 결정적: 난수를 소비하지 않는다(이미 뽑힌 패의 kind만 바꾼다). prngState를 넘기지 않는다.
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { flagOf, roundKey, viewKey } from "../util.js";
import { handKindsOf, kindCounts } from "./botHelpers.js";

const ID = "conjure_draw";
const ACTION = "conjure_tsumo";

/** 다음 쯔모로 소환할 목표 패(TileKind 객체). 소비되면 비운다 — 국이 아니라 즉시 만료 */
const pendingKey = (h: PlayerId): string => `${ID}:pending:${h}`;
/** 국당 1회 소진 플래그 (roundKey 스코프 — 매 국 초기화) */
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

/** augmentData에 저장된 대기 목표 kind를 읽는다 (없거나 비었으면 null) */
function pendingKind(state: GameState, h: PlayerId): TileKind | null {
  const v = state.augmentData[pendingKey(h)];
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

const conjureAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no conjure_draw augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    if (pendingKind(state, req.player) !== null) return "conjure already pending";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const kind = kindOf(state, req.payload.tileId);
    return [
      // 목표 kind를 대기열에 (TileKind 객체 그대로 — 다음 쯔모에서 읽어 쓴다)
      augmentDataSet(pendingKey(req.player), { suit: kind.suit, rank: kind.rank }),
      // 국당 1회 소진
      augmentDataSet(usedKey(state, req.player), true),
      // 발동 + 무엇을 불렀는지 전원 공개
      augmentDataSet(viewKey("*", `${ID}:${req.player}`), kindKey(kind)),
    ];
  },
};

export const conjureDraw: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "소환",
  description:
    "(매 국 1회) 자기 순에 손패 1장을 지목하면, 다음 내 쯔모가 그 패의 복제(생성패)로 허공에서 온다 — 내가 부른 패가 다음 쯔모가 된다.",
  detail:
    "(매 국 1회) 자기 순에 손패 1장을 지목해 그 패의 종류를 목표로 삼는다. 다음 내 쯔모는 패산이 아니라 허공에서 생성되어 그 패의 복제(생성패)로 손에 들어오며, 손패 장수는 정상 그대로다. 무엇을 불렀는지는 발동 즉시 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(conjureAction);
    }

    // 다음 정상 쯔모(영상패 아님)를 목표 패로 물질화한다 — "부른 패가 다음 쯔모로 온다".
    // 이미 뽑힌 실물 패의 kind만 바꾸므로 난수를 소비하지 않는다(prngState 없음).
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      if (p.rinshan) return; // 영상패(깡 후 쯔모)에는 반응하지 않는다 — 정상 쯔모만
      const target = pendingKind(rc.state, holder);
      if (target === null) return;
      // 방금 뽑은 패 그 한 장을 목표 kind로 변환(conjured). 손패 장수 불변.
      rc.emit(
        tileKindChanged([
          { tileId: p.tileId, kind: target, attrs: { conjured: true } },
        ]),
      );
      // 소비했으니 대기열을 비운다 (한 번의 소환 = 한 번의 쯔모)
      rc.emit(augmentDataSet(pendingKey(holder), null));
      rc.emit(augmentDataSet(viewKey("*", `${ID}:done:${holder}`), kindKey(target)));
    });

    // 발동 후보 — 손패 종류당 하나만 제시(같은 종류를 여러 번 내지 않는다).
    // 합법성 최종 판정은 validate.
    ctx.holderTurnOptions((state) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (pendingKind(state, holder) !== null) return [];
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      const seen = new Set<string>();
      const out: { type: string; payload: { tileId: TileId } }[] = [];
      for (const tileId of handIdsOf(state, holder)) {
        const key = kindKey(kindOf(state, tileId));
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: ACTION, payload: { tileId } });
      }
      return out;
    });
  },
  // 다음 쯔모를 지목한 패의 복제로 부른다(국당 1회). 이미 2장 든 패를 지목하면
  // 그 쯔모로 커쯔가 완성되는 확실한 이득 — 그럴 때만 발동해 1회를 값지게 쓴다.
  bot: {
    choose({ options, view, holder, tenpai }) {
      if (tenpai) return null; // 텐파이면 오름패를 그냥 쯔모하는 게 낫다
      const counts = kindCounts(handKindsOf(view, holder));
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const tileId = (o.payload as { tileId?: number }).tileId;
        const k = tileId !== undefined ? view.tiles[tileId]?.kind : undefined;
        if (k === undefined) continue;
        if ((counts.get(kindKey(k)) ?? 0) >= 2) return o; // 2장 → 쯔모로 커쯔 완성
      }
      return null;
    },
  },
});
