/**
 * 우는 국사무쌍 (open_kokushi, prism) — 서로 다른 요구패 3장을 '퐁'해 국사를 완성한다.
 *
 * 특수 후로(kokushi_pon): 다음 묶음 중 하나를 이루도록, 버려진 요구패 1장 + 손패 2장을
 * 퐁할 수 있다.
 *   · 1만-1통-1삭   · 9만-9통-9삭   · 백-발-중(삼원)   · 동남서북 중 서로 다른 3패
 * 이 특수 퐁을 하면 손이 열려 국사(kokushi) 외의 형태로는 화료할 수 없게 되고,
 * 머리(작두)는 반드시 울지 않은 손패로 만들어야 한다. 퐁 횟수 제한은 없다.
 * (분해 차단은 scoringOptionsOf가 kokushiOnly로 넘긴다 — 안 막으면 남은 손패가
 *  표준형 텐파이로 잡혀 "69삭 양면"이 오름패가 된다.)
 * 이렇게 완성한 국사도 정식 역만(13판)이다.
 *
 * 구현:
 * - scoring.kokushiMeldAssist(보유자 전용)로 분해 단계에 kokushi_pon 후로의 3종을
 *   국사 덮개로 넘긴다(helpers.scoringOptionsOf + decompose가 처리).
 * - 리액션 확장 훅(engine.registerReactionOptions)으로 버림패에 대한 kokushi_pon 후보를
 *   낸다. FlowController가 커스텀 콜로 펑과 치 사이 우선순위로 처리한다.
 * - kokushi_pon 액션은 CALL_MADE(meldKind:"kokushi_pon")로 특수 후로를 만든다.
 * - 커스텀 역 kokushi_open(13판 역만)으로 채점. 퐁 개수 제한 없음.
 */

import {
  CALL_MADE,
  WALL,
  augmentInstanceId,
  defineAugment,
  handIdsOf,
  isSourceDisarmed,
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

import { handKindsOf } from "./botHelpers.js";

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
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no open_kokushi augment";
    if (state.round.phase !== "reaction") return "not in reaction phase";
    // 무장해제된 증강의 콜은 성립하지 않는다 (버튼은 holderReactionOptions가 이미 가리지만,
    // 제출 경로에서도 최종 차단한다).
    if (isSourceDisarmed(state, augmentInstanceId(req.player, ID))) {
      return "augment is disarmed";
    }
    // 후로 봉인(함구령 등)을 우회하지 않는다 — 커스텀 콜도 표준 펑과 같은 규칙을 탄다.
    // ⚠ call.pon.enabled는 일부러 안 본다 — 아래 install()에서 "국사 외길 강제"를 위해
    // 커밋 후 표준 펑만 그 토글로 막는데, kokushi_pon까지 같이 막히면 이 증강의 핵심
    // ("퐁 횟수 제한 없음")이 깨진다. kokushi_pon은 이 자체 validate로만 통제한다.
    if (rules.resolve<boolean>("call.blocked", { playerId: req.player, state })) {
      return "calls are sealed";
    }
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
  category: "call",
  name: "우는 국사무쌍",
  description:
    "(상시) 서로 다른 요구패 3장(1만1통1삭 · 9만9통9삭 · 백발중 · 동남서북 중 3패)을 퐁해 국사를 완성할 수 있다. 요구패 13종+@(아무 요구패)의 형태를 완성하면 국사무쌍으로 취급한다.",
  detail:
    "(상시) 상대가 버린 요구패 1장과 손패의 요구패 2장을 합쳐, 서로 다른 요구패 3장(1만1통1삭 / 9만9통9삭 / 백발중 / 동남서북 중 3패)을 하나의 묶음으로 퐁할 수 있다. 퐁 횟수 제한은 없고 완성 시 정식 역만 13판이다. 단, 이 특수 퐁을 한 번이라도 하면 손이 열려 국사무쌍 외의 형태로는 화료할 수 없게 되고 머리(작두)는 반드시 울지 않은 손패로 만들어야 한다.",
  /**
   * 봇: 이 콜을 한 번이라도 하면 **국사로만 화료**할 수 있게 손이 잠긴다. 그래서
   * ① 이미 우는 국사 묶음이 있으면(되돌릴 수 없으니) 계속 밀고,
   * ② 아직 없으면 손패의 서로 다른 요구패가 8종 이상일 때만 뛰어든다.
   * 잡손으로 부르면 그 국을 통째로 버리는 셈이라 문턱을 높게 잡았다.
   */
  bot: {
    choose({ options, view, holder }) {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const committed = (view.round.byPlayer[holder]?.melds ?? []).some(
        (m) => m.kind === "kokushi_pon",
      );
      if (committed) return opt;
      const orphanKinds = new Set(
        handKindsOf(view, holder).filter(isOrphan).map(kindKey),
      );
      return orphanKinds.size >= 8 ? opt : null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 보유자만 국사 분해에 kokushi_pon 후로를 인정한다 (helpers/decompose가 읽음)
    ctx.setHolderRule("scoring.kokushiMeldAssist", true);

    // kokushi_pon을 한 번이라도 하면 core의 scoringOptionsOf가 그 국 내내
    // kokushiOnly=true로 표준형 분해를 막는다(helpers.ts). 그런데 이 증강은 일반
    // 펑·치·깡까지는 막지 않아서, kokushi_pon 뒤에 일반 펑·치를 하나라도 하면
    // 표준형은 kokushiOnly에 막히고 국사는 요구패 아닌 패로 된 그 멘쯔 때문에
    // 절대 완성될 수 없어 그 국 내내 화료·텐파이가 불가능한 소프트락이 된다.
    // → kokushi_pon으로 손이 한 번 열리면 그 뒤로는 kokushi_pon 외의 모든 콜을
    //   막아 "국사 외길"을 강제한다(2026-08 감사).
    const committedToKokushi = (state: GameState): boolean =>
      (state.round.byPlayer[holder]?.melds ?? []).some((m) => m.kind === "kokushi_pon");
    for (const rule of ["call.pon.enabled", "call.chi.enabled", "call.kan.enabled"] as const) {
      ctx.engine.rules.addModifier<boolean>(rule, {
        source: ctx.instanceId,
        layer: ctx.layer,
        apply: (cur, rctx) => {
          if (rctx.playerId !== holder) return cur;
          // 표준 pon·chi는 resolve 호출부가 state를 안 넘긴다(core standardActions.ts) —
          // rctx.state에 기대지 않고 엔진의 현재 상태를 직접 본다. 이 resolve는 항상
          // 그 액션의 validate 안에서 동기로 일어나므로 engine.state와 검증 대상 state가
          // 같다.
          const st = (rctx.state as GameState | undefined) ?? ctx.engine.state;
          return committedToKokushi(st) ? false : cur;
        },
      });
    }

    // 액션은 게임당 한 번만 등록 (여러 보유자가 있어도 안전)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(kokushiPonAction);
    }

    // 리액션(후로) 프롬프트에 kokushi_pon 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderReactionOptions((state, discard) => {
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

    // 48차 무페널티: "울면 역만이 아니라 4판" 강등을 삭제했다 — 울어서 만든 국사도
    // 진짜 역만이다. 게임(YakuRegistry)당 1회 등록.
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    if (yaku.get("kokushi_open") === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: "kokushi_open",
        name: "우는 국사무쌍",
        closedHan: 13,
        openHan: 13,
        isYakuman: true,
        // kokushi_pon 후로가 있는 국사 화료만 성립 (닫힌 국사는 표준 역만이 잡는다)
        check: (variant, wctx) =>
          variant.form === "kokushi" &&
          wctx.melds.some((m) => m.kind === "kokushi_pon"),
      });
    }
  },
});
