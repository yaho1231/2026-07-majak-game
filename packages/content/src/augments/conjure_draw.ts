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
import { flagOf, publishUsesLeft, roundViewKey } from "../util.js";
import { handKindsOf, kindCounts } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { haiteiLordWaits } from "./haitei_lord.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "conjure_draw";
const ACTION = "conjure_tsumo";

/**
 * 다음 쯔모로 소환할 목표 패(TileKind 객체). 소비되면 비운다.
 *
 * ⚠ **국 스코프여야 한다.** 소비 전에 국이 끝나면(남이 론·쯔모·유국) 게임 스코프 키에는
 * 예약이 그대로 남아, 다음 국의 첫 쯔모를 강탈하고 그 국의 소환권(국당 1회)까지 한 번 더
 * 주는 이중 발동이 됐다(2026-07-29 감사). 국 스코프로 두면 저절로 만료된다.
 */
const pendingKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "pending", state, h);
/** 국당 1회 소진 플래그 (roundKey 스코프 — 매 국 초기화) */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

/** augmentData에 저장된 대기 목표 kind를 읽는다 (없거나 비었으면 null) */
function pendingKind(state: GameState, h: PlayerId): TileKind | null {
  const v = state.augmentData[pendingKey(state, h)];
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
      augmentDataSet(pendingKey(state, req.player), { suit: kind.suit, rank: kind.rank }),
      // 국당 1회 소진
      augmentDataSet(usedKey(state, req.player), true),
      // 발동 + 무엇을 불렀는지 전원 공개
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), kindKey(kind)),
    ];
  },
};

export const conjureDraw: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "소환",
  description:
    "(매 국 1회) 자기 순에 손패 1장을 지목하면, 다음 내 쯔모가 그 패의 복제(생성패)로 바뀐다.",
  detail:
    "(매 국 1회) 지목한 패의 종류가 목표가 된다. 다음 쯔모는 패산에서 평소대로 한 장 뽑히되 그 자리에서 바뀌므로, 패산도 손패 장수도 그대로다.\n\n깡으로 뽑는 영상패에는 반응하지 않는다. 해저의 지배자가 가져가는 해저패에도 반응하지 않는다. 무엇을 불렀는지는 발동 즉시 전원에게 공개된다.",
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
      /*
       * ⚠ **해저패는 해저의 지배자의 것이다** — 이 한 장은 양보하고 예약도 남긴다.
       *
       * 같은 좌석이 `haitei_lord`를 함께 들면 둘이 같은 tileId에 `tileKindChanged`를
       * 쏴서, 나중에 설치된 쪽(= 드래프트 픽 순서)이 이기고 진 쪽은 조용히 죽었다
       * (2026-08-23, QA synergy3 kandora 확정 2). 여기서 물러나는 이유는 보유자에게
       * 그쪽이 언제나 낫기 때문이다 — 오름패로 바뀌면 그 자리에서 해저로월 화료 + 3판.
       *
       * 예약(`pendingKey`)은 **비우지 않는다.** 지배자가 못 가져간 경우에만 이 아래로
       * 내려오므로 여기서 남기는 것은 순수한 양보다. 국 스코프라 국이 끝나면 저절로
       * 만료된다(위 pendingKey 주석).
       */
      if (haiteiLordWaits(rc.state, engine.rules, holder, p.tileId).length > 0) return;
      // 방금 뽑은 패 그 한 장을 목표 kind로 변환(conjured). 손패 장수 불변.
      rc.emit(
        tileKindChanged([
          { tileId: p.tileId, kind: target, attrs: { conjured: true } },
        ]),
      );
      // 소비했으니 대기열을 비운다 (한 번의 소환 = 한 번의 쯔모)
      //
      // ⚠ "소환 성공" 공개 채널(`{id}:done:{holder}`)은 2026-08-15 사용자 지시로 없앴다.
      // 발동 알림(위 conjureAction)이 이미 무엇을 불렀는지 전원에게 알리므로, 도착까지
      // 두 번 알리면 같은 사건에 컷인이 두 번 터진다 — 첫 사용 알림 하나만 남긴다.
      rc.emit(augmentDataSet(pendingKey(rc.state, holder), null));
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
  bot: plan({
    intent: "advance",
    // 부른 패가 다음 쯔모로 온다 — 제시되는 순간이 곧 때다.
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
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
  }),
});
