/**
 * 우는 국사무쌍 (open_kokushi, prism) — 서로 다른 요구패 3장을 '퐁'해 국사를 완성한다.
 *
 * 특수 부로(kokushi_pon): 다음 묶음 중 하나를 이루도록, 버려진 요구패 1장 + 손패 2장을
 * 퐁할 수 있다.
 *   · 1만-1통-1삭   · 9만-9통-9삭   · 백-발-중(삼원)   · 동남서북 중 서로 다른 3패
 * 이 특수 퐁을 하면 손이 열려 국사(kokushi) 외의 형태로는 화료할 수 없게 되고,
 * 머리(작두)는 반드시 울지 않은 손패로 만들어야 한다. 퐁 횟수 제한은 없다.
 * 이렇게 완성한 국사는 역만이 아니라 3판이 된다.
 *
 * 구현:
 * - scoring.kokushiMeldAssist(보유자 전용)로 분해 단계에 kokushi_pon 부로의 3종을
 *   국사 덮개로 넘긴다(helpers.scoringOptionsOf + decompose가 처리).
 * - 리액션 확장 훅(engine.registerReactionOptions)으로 버림패에 대한 kokushi_pon 후보를
 *   낸다. FlowController가 커스텀 콜로 펑과 치 사이 우선순위로 처리한다.
 * - kokushi_pon 액션은 CALL_MADE(meldKind:"kokushi_pon")로 특수 부로를 만든다.
 * - 8판 역만 → 3판 커스텀 역 kokushi_open. 퐁 개수 제한 없음.
 */

import {
  CALL_MADE,
  WALL,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";

const ID = "open_kokushi";
const ACTION = "kokushi_pon";

const isNumSuit = (s: string): s is "man" | "pin" | "sou" =>
  s === "man" || s === "pin" || s === "sou";

/** 요구패(1·9 수패 · 자패)인가 */
function isOrphan(k: TileKind): boolean {
  if (k.suit === "wind" || k.suit === "dragon") return true;
  return isNumSuit(k.suit) && (k.rank === 1 || k.rank === 9);
}

/** 서로 다른 요구패 3장이 유효한 kokushi_pon 묶음인가 */
function isKokushiGroup(kinds: TileKind[]): boolean {
  if (kinds.length !== 3) return false;
  if (new Set(kinds.map(kindKey)).size !== 3) return false; // 서로 달라야 한다
  if (kinds.every((k) => k.suit === "wind")) return true; // 동남서북 중 서로 다른 3패
  if (kinds.every((k) => k.suit === "dragon")) return true; // 백-발-중
  // 1만1통1삭 / 9만9통9삭: 전부 수패, 같은 랭크(1 또는 9), 만·통·삭 각 1장
  if (kinds.every((k) => isNumSuit(k.suit))) {
    const rank = kinds[0]!.rank;
    return (
      (rank === 1 || rank === 9) &&
      kinds.every((k) => k.rank === rank) &&
      new Set(kinds.map((k) => k.suit)).size === 3
    );
  }
  return false;
}

/** 버려진 요구패로 kokushi_pon을 만들 때 손에서 필요한 파트너 kind 쌍들 */
function neededPartners(dk: TileKind): [TileKind, TileKind][] {
  if (isNumSuit(dk.suit)) {
    if (dk.rank !== 1 && dk.rank !== 9) return [];
    const suits = (["man", "pin", "sou"] as const).filter((s) => s !== dk.suit);
    return [[{ suit: suits[0]!, rank: dk.rank }, { suit: suits[1]!, rank: dk.rank }]];
  }
  if (dk.suit === "dragon") {
    const others = [1, 2, 3].filter((r) => r !== dk.rank);
    return [[{ suit: "dragon", rank: others[0]! }, { suit: "dragon", rank: others[1]! }]];
  }
  if (dk.suit === "wind") {
    const others = [1, 2, 3, 4].filter((r) => r !== dk.rank);
    const pairs: [TileKind, TileKind][] = [];
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        pairs.push([{ suit: "wind", rank: others[i]! }, { suit: "wind", rank: others[j]! }]);
      }
    }
    return pairs;
  }
  return [];
}

const wallLen = (state: GameState): number => state.zones[WALL]?.tileIds.length ?? 0;

const kokushiPonAction: ActionDef<{ tileIds: [TileId, TileId] }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no open_kokushi augment";
    if (state.round.phase !== "reaction") return "not in reaction phase";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    if (wallLen(state) === 0) return "no calls on the last discard";
    const [a, b] = req.payload.tileIds;
    if (a === b) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(a) || !hand.includes(b)) return "tiles not in hand";
    const kinds = [kindOf(state, last.tileId), kindOf(state, a), kindOf(state, b)];
    if (!isKokushiGroup(kinds)) return "not a valid kokushi group";
    return null;
  },
  toEvents: (req, { state }) => {
    const last = state.round.lastDiscard as { player: PlayerId; tileId: TileId };
    return [
      {
        type: CALL_MADE,
        payload: {
          caller: req.player,
          from: last.player,
          meldKind: "kokushi_pon",
          handTileIds: [...req.payload.tileIds],
          calledTileId: last.tileId,
        },
      },
    ];
  },
};

export const openKokushi: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "우는 국사무쌍",
  description:
    "서로 다른 요구패 3장(1만1통1삭·9만9통9삭·백발중·동남서북 중 3패)을 퐁해 국사를 완성할 수 있다. 이 특수 퐁을 하면 국사로만 화료할 수 있고 머리는 울지 않은 패라야 한다. 완성 시 역만이 아니라 3판.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 보유자만 국사 분해에 kokushi_pon 부로를 인정한다 (helpers/decompose가 읽음)
    ctx.setHolderRule("scoring.kokushiMeldAssist", true);

    // 액션은 게임당 한 번만 등록 (여러 보유자가 있어도 안전)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(kokushiPonAction);
    }

    // 리액션(부로) 프롬프트에 kokushi_pon 후보 노출 — 합법성은 validate가 최종 판정
    engine.registerReactionOptions((state, player, discard) => {
      if (player !== holder) return [];
      const dk = kindOf(state, discard.tileId);
      if (!isOrphan(dk)) return [];
      // 손패의 요구패를 kind별로 모은다
      const byKind = new Map<string, TileId[]>();
      for (const id of handIdsOf(state, holder)) {
        const k = kindOf(state, id);
        if (!isOrphan(k)) continue;
        const key = kindKey(k);
        const list = byKind.get(key);
        if (list === undefined) byKind.set(key, [id]);
        else list.push(id);
      }
      const out: { type: string; payload: { tileIds: [TileId, TileId] } }[] = [];
      for (const [ka, kb] of neededPartners(dk)) {
        const idsA = byKind.get(kindKey(ka));
        const idsB = byKind.get(kindKey(kb));
        if (idsA?.[0] !== undefined && idsB?.[0] !== undefined) {
          out.push({ type: ACTION, payload: { tileIds: [idsA[0], idsB[0]] } });
        }
      }
      return out;
    });

    // 부로 국사 = 3판짜리 커스텀 역 (역만 아님). 게임(YakuRegistry)당 1회 등록.
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    if (yaku.get("kokushi_open") === undefined) {
      yaku.register({
        id: "kokushi_open",
        name: "우는 국사무쌍",
        closedHan: 3,
        openHan: 3,
        // kokushi_pon 부로가 있는 국사 화료만 성립 (닫힌 국사는 표준 역만이 잡는다)
        check: (variant, wctx) =>
          variant.form === "kokushi" &&
          wctx.melds.some((m) => m.kind === "kokushi_pon"),
      });
    }
  },
});
