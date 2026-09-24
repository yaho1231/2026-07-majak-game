/**
 * 늪 (swamp, prism) — 내 패를 운 사람은 두 순 동안 쯔모기리만 한다.
 *
 * (2국에 1회) 자기 순에 발동하면 **그 국 동안**, 타가가 내 버림패를 치·퐁·대명깡하는 순간
 * 그 사람이 늪에 빠진다. 늪에 빠진 사람은 다음 2순 동안 쯔모한 패만 버릴 수 있다.
 * 다시 울면 남은 순이 2로 돌아간다(쌓이지 않는다). 론은 울기가 아니다.
 *
 * ## 구현
 * - 발동은 표식 하나(국 스코프). 쿨다운은 공용 "N국에 1회" 도구.
 * - `CALL_MADE`(치·퐁)와 `KAN_DECLARED`(대명깡)에서 «내 버림을 울었는가»를 본다.
 * - 강제 쯔모기리 자체는 `forcedTsumogiri.ts`가 한다(위압감과 공용). 남은 순은 걸린 사람
 *   이름표에 전원 공개로 보인다.
 */

import {
  CALL_MADE,
  KAN_DECLARED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  CallMadePayload,
  GameState,
  KanDeclaredPayload,
  PlayerId,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  flagOf,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { plan } from "./botPlan.js";
import {
  forceTsumogiriEvents,
  installForcedTsumogiri,
} from "./forcedTsumogiri.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "swamp";
const ACTION = "swamp_activate";
/** 쿨다운 — 한 번 쓰면 이만큼 국이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;
/** 늪에 빠진 사람이 쯔모기리해야 하는 순 수 */
const SWAMP_TURNS = 2;

/** 이번 국에 늪을 펼쳤는가 */
const onKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "on", state, holder);

function reject(state: GameState, player: PlayerId): string | null {
  const me = state.players.find((p) => p.id === player);
  if (me === undefined || !me.augments.includes(ID)) return "no swamp augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player)
    return "not your turn";
  if (flagOf(state, onKey(state, player))) return "already active this round";
  if (!cooldownReady(state, ID, player, COOLDOWN_ROUNDS)) return "on cooldown";
  return null;
}

const activateAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => reject(state, req.player),
  toEvents: (req, { state }) => [
    augmentDataSet(onKey(state, req.player), true),
    // 발동은 전원 공개 — 울기 전에 알아야 대응할 수 있다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), true),
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
  ],
};

export const swamp: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  // 난도 3: 후로 종류(치·퐁·대명깡)·강제 쯔모기리·남은 순이 겹친다
  complexity: 3,
  name: "늪",
  description:
    "(2국에 1회) 발동하면 이번 국 동안 내 패를 운 타가는 다음 2순 동안 쯔모기리만 할 수 있다.",
  detail:
    "발동한 국에 타가가 내 버림패를 치·퐁·대명깡하면 늪에 빠진다. 늪에 빠지면 다음 2순 동안 쯔모한 패만 버릴 수 있다.\n\n쯔모 화료·깡·리치는 할 수 있다. 다시 울면 남은 순이 2순으로 돌아간다. 발동과 남은 순은 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;
    if (!engine.actions.has(ACTION)) engine.actions.register(activateAction);

    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);
    installForcedTsumogiri(ctx, ID);

    const sink = (
      state: GameState,
      caller: PlayerId,
      from: PlayerId | undefined,
    ) => {
      if (from !== holder || caller === holder) return [];
      if (!flagOf(state, onKey(state, holder))) return [];
      return forceTsumogiriEvents(state, ID, holder, caller, SWAMP_TURNS);
    };
    ctx.reaction(CALL_MADE, (event, rc) => {
      const p = event.payload as CallMadePayload;
      for (const e of sink(rc.state, p.caller, p.from)) rc.emit(e);
    });
    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      if (p.kanKind !== "kan_open") return;
      for (const e of sink(rc.state, p.player, p.calledFrom)) rc.emit(e);
    });

    ctx.holderTurnOptions((state) =>
      reject(state, holder) === null ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  /** 남의 후로를 벌하는 방해 — 펼쳐 두면 그 국 내내 효과가 있으니 이른 순에 편다 */
  bot: plan({
    intent: "disrupt",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
