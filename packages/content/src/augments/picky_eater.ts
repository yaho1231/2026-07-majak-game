/**
 * 편식 (picky_eater, prism) — 단색 세계의 **퀘스트판**. "12장을 골라 버리면, 손이 물든다".
 *
 * 국이 시작된 뒤 **만·통·삭 중 한 무늬(+자패는 언제든 허용)만 골라 12장을 버리면**
 * 액티브 버튼이 열린다. 발동하면 **손패의 수패를 원하는 한 색으로 통일**한다 —
 * 효과는 단색 세계와 완전히 같다(숫자 유지, 패산의 실물과 1:1 교환, 청일색 인정).
 *
 * 다른 무늬를 **한 장이라도** 버리면 그 국의 퀘스트는 즉시 실패하고, 12장을 채웠더라도
 * 다음 국이 되면 처음부터 다시 센다 — **그 국 안에서만 유효**하다.
 *
 * 편식을 쓸 수 없는 국(쿨다운 중·이미 이 국에 사용·무장해제로 잠김)에는 진행을 아예
 * 세지 않고 표시도 지운다 — 발동할 수 없는 조건에 손패를 맞출 이유가 없다.
 *
 * 단색 세계가 "첫 순에 공짜로" 물들이는 것과 정반대다. 이쪽은 국의 절반을 편식하며
 * 걸어와야 하고, 그 12장이 전부 공개되므로 상대는 **한참 전부터 이 사람이 무엇을
 * 준비하는지 안다** — 대응 시간이 아주 길다(Rule #4).
 *
 * 구현: 실물 패 교환은 `suitUnifyCore`가 단일 진실이다(단색 세계와 공유).
 * 퀘스트 진행은 상태를 따로 쌓지 않고 **버림 이력**(`round.byPlayer[h].discardedKinds`)에서
 * 그때그때 계산한다 — 저장을 안 하니 재구성·리플레이에서 어긋날 여지가 없다.
 */

import {
  AUGMENT_DISARMED,
  ROUND_STARTED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  AugmentDisarmedPayload,
  GameState,
  PlayerId,
  Suit,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundKey,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { handKindsOf } from "./botHelpers.js";
import {
  NUMBER_SUITS,
  monoWorldEvent,
  registerMonoWorldReducer,
} from "./suitUnifyCore.js";
import { plan } from "./botPlan.js";

const ID = "picky_eater";
const ACTION = "picky_unify";

/** 퀘스트 달성에 필요한 버림 장수 */
const QUEST_DISCARDS = 12;
/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;

/** 이번 국에 이미 발동했는가 */
const doneKey = (state: GameState, h: PlayerId): string =>
  `${ID}:done:${roundKey(state)}:${h}`;

/** kindKey(`man3`·`wind1`…)에서 무늬만 떼어 낸다 */
const suitOfKey = (key: string): string => key.replace(/\d+$/, "");
/** 수패 무늬인가 (자패는 언제 버려도 퀘스트가 깨지지 않는다) */
const isNumberSuitKey = (key: string): boolean =>
  (NUMBER_SUITS as readonly string[]).includes(suitOfKey(key));

export interface QuestProgress {
  /** 이 국에 잠긴 수패 무늬 (아직 수패를 안 버렸으면 null) */
  suit: string | null;
  /** 지금까지 버린 장수 */
  count: number;
  /** 다른 무늬를 버려 실패했는가 */
  failed: boolean;
  /** 지금 발동할 수 있는가 */
  ready: boolean;
}

/** 진행을 세지 않는 국의 결과 — 아무것도 안 버린 것과 같은 모습이다 */
const idle = (): QuestProgress => ({ suit: null, count: 0, failed: false, ready: false });

/**
 * 이번 국에 편식을 실제로 쓸 수 있는가 — 쿨다운(2국)이 남았거나 이미 이 국에 썼으면 아니다.
 *
 * 못 쓰는 국에는 퀘스트를 **아예 세지 않는다**(2026-08-08 사용자 지시). 예전에는 쿨다운
 * 중에도 진행도가 올라가고 다른 무늬를 버리는 순간 "실패" 칩까지 떴다 — 홀더는 발동할 수도
 * 없는 조건에 손패를 맞추게 되고, 상대에게는 아무 의미 없는 정보가 국의 절반 동안 나갔다.
 */
function questActive(state: GameState, h: PlayerId): boolean {
  if (!cooldownReady(state, ID, h, COOLDOWN_ROUNDS)) return false;
  return state.augmentData[doneKey(state, h)] !== true;
}

/** 이번 국의 퀘스트 진행 — 버림 이력에서 그때그때 센다 */
export function questProgress(state: GameState, h: PlayerId): QuestProgress {
  if (!questActive(state, h)) return idle();
  const discards = state.round.byPlayer[h]?.discardedKinds ?? [];
  let suit: string | null = null;
  let failed = false;
  for (const key of discards) {
    if (!isNumberSuitKey(key)) continue; // 자패는 무늬를 잠그지도, 깨지도 않는다
    const s = suitOfKey(key);
    if (suit === null) suit = s;
    else if (s !== suit) failed = true;
  }
  const count = discards.length;
  return { suit, count, failed, ready: !failed && count >= QUEST_DISCARDS };
}

const pickyAction: ActionDef<{ suit: Suit }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no picky_eater augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!cooldownReady(state, ID, req.player, COOLDOWN_ROUNDS)) {
      return "on cooldown";
    }
    if (state.augmentData[doneKey(state, req.player)] === true) {
      return "already used this round";
    }
    if (!questProgress(state, req.player).ready) return "quest not complete";
    if (!(NUMBER_SUITS as readonly string[]).includes(req.payload.suit)) {
      return "invalid suit";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    monoWorldEvent(state, req.player, req.payload.suit),
    augmentDataSet(doneKey(state, req.player), true),
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    // 어떤 색으로 통일됐는지 전원 공개
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), req.payload.suit),
  ],
};

export const pickyEater: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "편식",
  description:
    "(2국에 1회) 국이 시작된 뒤 한 무늬의 수패(자패는 허용)만 12장 버리면 액티브가 열린다 — 발동하면 손패의 수패를 원하는 한 색으로 통일한다. 다른 무늬를 한 장이라도 버리면 그 국은 실패.",
  detail:
    "국이 시작된 뒤 만·통·삭 중 한 무늬와 자패만으로 12장을 버리면 발동할 수 있다. 발동하면 만·통·삭 중 한 색을 골라 손패의 수패를 전부 그 색으로 바꾼다.\n\n숫자는 유지되고 통일된 색으로 청일색이 성립한다. 새 패는 패산에 있는 같은 숫자의 실물과 교환되며, 패산에 없을 때만 그 자리에서 만들어진다.\n\n다른 무늬의 수패를 한 장이라도 버리면 그 국의 진행은 실패한다. 진행도는 국이 바뀌면 처음부터 다시 센다.\n\n쿨다운 중이거나 이미 이 국에 발동했다면 진행을 세지 않는다 — 발동할 수 있는 국에만 퀘스트가 돈다.",
  install(ctx) {
    const { engine, holder } = ctx;

    registerMonoWorldReducer(engine);
    if (!engine.actions.has(ACTION)) engine.actions.register(pickyAction);

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    const progressKey = roundViewKey("*", `${ID}:progress:${holder}`);

    // 퀘스트 진행도를 전원에게 공개한다 — 몇 장 남았는지 보여야 대응이 성립한다.
    // 못 쓰는 국(쿨다운·이미 사용)에는 null을 실어 표시 자체를 지운다.
    const publish = (state: GameState): ReturnType<typeof augmentDataSet> => {
      if (!questActive(state, holder)) return augmentDataSet(progressKey, null);
      const p = questProgress(state, holder);
      return augmentDataSet(progressKey, {
        suit: p.suit,
        count: p.count,
        need: QUEST_DISCARDS,
        failed: p.failed,
      });
    };
    ctx.reaction(ROUND_STARTED, (_event, rc) => rc.emit(publish(rc.state)));
    ctx.reaction(TILE_DISCARDED, (_event, rc) => rc.emit(publish(rc.state)));

    /*
     * 무장해제로 잠기는 순간 진행도 표시를 지운다.
     *
     * 잠긴 뒤에는 위 두 리액션이 게이트에 막혀 아예 돌지 않으므로, 국 중간에 잠기면
     * 마지막으로 찍힌 진행도가 국이 끝날 때까지 그대로 남는다. 통보(AUGMENT_DISARMED)는
     * 잠그기 **직전**에 오는 것이 무장해제의 계약이라, 이 리액션은 아직 살아 있다.
     */
    ctx.reaction(AUGMENT_DISARMED, (event, rc) => {
      const p = event.payload as AugmentDisarmedPayload;
      if (p.augmentId !== ID || p.target !== holder) return;
      rc.emit(augmentDataSet(progressKey, null));
    });

    // 퀘스트를 달성한 자기 순에만 색 후보 3개를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!questProgress(state, holder).ready) return [];
      if (state.augmentData[doneKey(state, holder)] === true) return [];
      return NUMBER_SUITS.map((suit) => ({ type: ACTION, payload: { suit } }));
    });
  },
  bot: plan({
    // 손패의 수패를 통째로 한 색으로 통일한다 — 갈아엎기다
    intent: "rewrite",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    // 퀘스트를 우연히 달성했다면 수패가 가장 많은 색으로 통일한다 (단색 세계와 같은 기준)
    pick: ({ options, view, holder, tenpai }) => {
      if (tenpai) return null;
      const counts: Record<string, number> = { man: 0, pin: 0, sou: 0 };
      let total = 0;
      for (const k of handKindsOf(view, holder)) {
        if (k.suit in counts) {
          counts[k.suit] = (counts[k.suit] ?? 0) + 1;
          total++;
        }
      }
      if (total < 5) return null;
      let bestSuit = "man";
      for (const s of ["man", "pin", "sou"]) {
        if ((counts[s] ?? 0) > (counts[bestSuit] ?? 0)) bestSuit = s;
      }
      return (
        options.find(
          (o) => o.type === ACTION && (o.payload as { suit?: string }).suit === bestSuit,
        ) ?? null
      );
    },
  }),
});
