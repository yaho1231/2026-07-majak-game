/**
 * 봉인술사(discard_lock)가 잠근 패를 **올인 리치(all_or_nothing)**로 털어낼 수 있는가.
 *
 * 표준 리치 액션은 2026-08 수정(docs/25 방해 #2)으로 `lockedDiscardIds`를 검사한다 —
 * "봉인된 패는 리치 선언으로도 버릴 수 없다". 스텔스 리치·물러설 수 없는 선언·혼신의
 * 일격도 같은 검사를 복사해 갔다. 올인 리치에는 그 줄이 없다.
 */
import {
  ROUND_SCOPED_MARK,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));
const allOrNothing = A.get("all_or_nothing") as AugmentDef;
const discardLock = A.get("discard_lock") as AugmentDef;
const stealth = A.get("stealth_riichi") as AugmentDef;

const HAND = "man2 man3 man4 man5 man6 man7 pin2 pin3 pin4 sou5 sou5 sou5 pin9 pin9";

const base = craft({
  hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});

// p0 손패에서 pin9 하나를 고른다 (버리면 단기 텐파이가 남는 패)
const pin9 = handIdsOf(base, "p0").find((id) => kindKey(kindOf(base, id)) === "pin9");
if (pin9 === undefined) throw new Error("pin9 not found");

// 봉인술사(p1)가 p0의 그 패를 잠근 상태 — discard_lock이 읽는 채널에 직접 심는다
const sealKey = `view:p1:discardLockReveal:p0${ROUND_SCOPED_MARK}`;
const state: GameState = {
  ...base,
  players: base.players.map((p) => ({
    ...p,
    augments:
      p.id === "p0" ? ["all_or_nothing", "stealth_riichi"] : p.id === "p1" ? ["discard_lock"] : [],
  })),
  augmentData: { ...base.augmentData, [sealKey]: [pin9] },
};

const game = createStandardGameFromState(state, undefined, [allOrNothing, discardLock, stealth]);
installAugment(game.engine, allOrNothing, "p0", { yaku: game.yaku });
installAugment(game.engine, stealth, "p0", { yaku: game.yaku });
installAugment(game.engine, discardLock, "p1", { yaku: game.yaku });

const check = (type: string, payload: unknown): string => {
  const def = game.engine.actions.get(type);
  if (def === undefined) return "NO SUCH ACTION";
  const r = def.validate(
    { player: "p0" as PlayerId, type, payload } as never,
    { state: game.engine.state, rules: game.engine.rules },
  );
  return r === null ? "허용됨 (null)" : `거부: ${r}`;
};

console.log(`봉인된 패 = tile ${pin9} (pin9)\n`);
console.log(`표준 리치         : ${check("riichi", { tileId: pin9 })}`);
console.log(`스텔스 리치       : ${check("stealth_riichi", { tileId: pin9 })}`);
console.log(`버림(discard)     : ${check("discard", { tileId: pin9 })}`);
console.log(`올인 리치         : ${check("all_in_riichi", { tileId: pin9 })}   ← 여기`);

const ok = check("all_in_riichi", { tileId: pin9 }).startsWith("거부");
console.log(
  ok ? "\nOK — 올인 리치도 봉인을 지킨다" : "\n❌ 올인 리치는 봉인을 무시한다 (표준 리치는 거부)",
);
