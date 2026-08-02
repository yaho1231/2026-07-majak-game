/**
 * 귀환 (honor_return, prism) — "그거 아까 버린 거잖아?!"
 *
 * 동풍전 1·반장전 2회, 자기 턴에 발동하면 **이번 국에 내가 버린 자패**(바람·삼원)를
 * 최대 4장까지 기억해 두었다가, **다음 국 배패에 그대로 되받는다**(보랏빛 conjured).
 * 다음 국이 시작되면 역패 커쯔가 반쯤 완성된 채로 출발한다.
 *
 * 구현: 순수 콘텐츠(코어 무변경) — 미련(`regret`)과 같은 크로스국 주입 패턴.
 * - 발동 시 홀더 바닥의 자패 kind를 최대 4개(가장 최근에 버린 것부터) 게임 단위 augmentData에
 *   기록하고 전원 공개한다.
 * - 다음 `ROUND_STARTED`(setupRound가 배패를 새로 돌린 뒤) 리액션이 갓 받은 배패의 앞 N장을
 *   기록된 kind로 `tileKindChanged`(conjured) 덮어쓰고 기록을 비운다.
 * - **손패 장수 불변식 준수**: 배패 13장 "안에서 교체"한다(장수를 늘리지 않는다).
 *   스펙의 "패산에서 빠진다"는 개념적 서술이며, 실제 구현은 배패 내 교체가 유일하게 안전한 길이다
 *   (docs/16 §2b 구현 노트와 일치).
 * - setupRound가 매 국 tiles를 원본 재생성하므로 능력을 안 쓴 국엔 변형이 새지 않는다.
 */

import {
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  discardsZone,
  handZone,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";
import { counterOf, matchUses, viewKey } from "../util.js";

const ID = "honor_return";
const ACTION = "honor_recall";
/** 되받을 수 있는 최대 장수 */
const MAX_RETURN = 4;

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/** 다음 국 배패에 주입할 자패 kind (게임 단위 — 국을 넘어 유지) */
const keepKey = (h: PlayerId): string => `${ID}:keep:${h}`;
/** 전원 공개 채널 */
const noticeKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 자패(바람·삼원)인가 */
function isHonor(kind: TileKind): boolean {
  return kind.suit === "wind" || kind.suit === "dragon";
}

/**
 * 이번 국 홀더 바닥의 자패 kind — **가장 최근에 버린 것부터** 최대 4개.
 * (늦게 버린 자패일수록 의도적으로 흘린 것이라 되받는 값이 크다. 결정적.)
 */
function recallableHonors(state: GameState, holder: PlayerId): TileKind[] {
  const ids: readonly TileId[] = state.zones[discardsZone(holder)]?.tileIds ?? [];
  const out: TileKind[] = [];
  for (let i = ids.length - 1; i >= 0 && out.length < MAX_RETURN; i--) {
    const kind = kindOf(state, ids[i] as TileId);
    if (isHonor(kind)) out.push({ ...kind });
  }
  return out;
}

/** augmentData에 보존된 주입 대상 kind 목록 */
function keptKinds(state: GameState, holder: PlayerId): TileKind[] {
  const v = state.augmentData[keepKey(holder)];
  return Array.isArray(v) ? (v as TileKind[]) : [];
}

const recallAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no honor_return augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    // 같은 계열(giant_god·tile_split·genesis·even_world)과 같은 규약 — 리치 중에는
    // 손패를 건드리는 액티브를 막는다(docs/21 D-2). 이 증강은 다음 국 배패에만
    // 영향을 주지만, "리치 중엔 손 관련 액티브 정지"라는 일관된 규약을 지킨다.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: hand is frozen";
    }
    if (keptKinds(state, req.player).length > 0) return "already recalled, pending next round";
    if (recallableHonors(state, req.player).length === 0) {
      return "no honor tiles in your discards";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const kinds = recallableHonors(state, req.player);
    return [
      augmentDataSet(keepKey(req.player), kinds),
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 다음 국에 무엇이 부활하는지 상대도 안다
      augmentDataSet(noticeKey(req.player), kinds),
    ];
  },
};

export const honorReturn: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "귀환",
  description:
    "(동풍전 1회 · 반장전 2회) 액티브 버튼을 누른 그 시점까지 이번 국에 내가 버린 자패를 가장 최근 것부터 최대 4장까지 기억해, 다음 국 배패에 그대로 되받는다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 발동하면 **발동 시점까지** 이번 국에 버린 자패(바람·삼원)가 가장 최근 것부터 최대 네 장까지 기억되어 다음 국 배패에 그대로 섞여 돌아온다. 기억은 버튼을 누른 순간에 확정되므로, 그 뒤에 버리는 자패는 아무리 늘려도 되받는 목록에 추가되지 않는다 — 자패를 몇 장 흘려 둔 뒤에 누를수록 값이 커진다. 되받는 자패는 배패 13장 안에서 교체되므로 손패 장수는 그대로이며, 무엇이 부활하는지는 발동 즉시 전원에게 공개된다. 자패를 한 장도 버리지 않았다면 발동할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(recallAction);
    }

    // 다음 국 시작(딜 완료 후) → 기록된 자패를 배패 앞자리에 주입하고 기록을 비운다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const kinds = keptKinds(rc.state, holder);
      if (kinds.length === 0) return;
      const hand: readonly TileId[] = rc.state.zones[handZone(holder)]?.tileIds ?? [];
      const n = Math.min(hand.length, kinds.length);
      const changes = [];
      for (let i = 0; i < n; i++) {
        changes.push({
          tileId: hand[i] as TileId,
          kind: kinds[i] as TileKind,
          // red를 반드시 끈다 — attrs는 병합이라, 덮어쓴 자리가 하필 적5(또는 붉은
          // 손길로 물든 패)였으면 그 표식이 자패에 그대로 따라붙었다. 화면에서는
          // 되받은 자패 한 장만 보랏빛(conjured)이 아니라 붉은빛(tile-red)으로 떠
          // "왜 얘만 이펙트가 다르냐"가 됐고(2026-08-02 사용자 보고), 채점에서도
          // 자패가 적도라 1판을 몰래 얹었다. 자패는 적도라가 될 수 없다.
          attrs: { conjured: true, red: false },
        });
      }
      // 배패 13장 안에서 교체 — 장수 불변, 결정적(prng 불필요)
      if (changes.length > 0) rc.emit(tileKindChanged(changes));
      rc.emit(augmentDataSet(keepKey(holder), []));
      rc.emit(augmentDataSet(noticeKey(holder), []));
    });

    // 사용 횟수가 남았고 되받을 자패가 있으면 보유자 턴에 발동 후보를 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (keptKinds(state, holder).length > 0) return [];
      if (recallableHonors(state, holder).length === 0) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  // 봇: 되받을 자패가 있으면 발동한다 — 자해 위험이 없는 순수 이득이다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
