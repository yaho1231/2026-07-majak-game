/** 남은 문구 주장 몇 가지를 조립 케이스로 확인한다. */
import { YakuRegistry, evaluateWin, isWinningShape, registerStandardYaku } from "@majak/core";
import type { DecomposeOptions, MeldInfo, TileKind, WinContext } from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);

function mk(
  spec: string,
  melds: MeldInfo[],
  winning: string,
  opts: DecomposeOptions = {},
): WinContext {
  return {
    hand: h(spec),
    melds,
    winningTile: h(winning)[0] as TileKind,
    winType: "tsumo",
    seatWind: 1,
    prevalentWind: 1,
    riichi: null,
    options: opts,
    winnerId: "p0",
  } as unknown as WinContext;
}
function show(label: string, ctx: WinContext): void {
  const r = evaluateWin(ctx, reg);
  console.log(
    `  ${label}\n    -> ${r === null ? "NO WIN" : `[${r.yaku.map((y) => `${y.id}:${y.han}`).join(" ")}] han=${r.han} fu=${r.fu} ym=${r.yakumanCount} ok=${r.ok}`}`,
  );
}
const kan = (spec: string): MeldInfo => ({ kind: "kan_closed", tiles: h(spec) });
const kpon = (spec: string): MeldInfo => ({ kind: "kokushi_pon", tiles: h(spec) });

console.log("=== snake_kan × broken_wall: 8-9-1-2 장사진 (detail: 하나의 깡이다)");
show("kan 8912m + 234p567p111z + 99s (+9s)", mk("234p567p111z99s", [kan("8912m")], "9s", { wrapRuns: true }));

console.log("\n=== open_kokushi: '이 특수 퐁은 횟수 제한이 없다' (kokushiOnly 켠 진짜 조건) ===");

reg.register({
  id: "kokushi_open",
  name: "우는 국사무쌍",
  closedHan: 13,
  openHan: 13,
  isYakuman: true,
  check: (variant, wctx) =>
    variant.form === "kokushi" && wctx.melds.some((m) => m.kind === "kokushi_pon"),
});

const sets: Record<number, { melds: MeldInfo[]; kinds: TileKind[]; hand: string }> = {
  1: { melds: [kpon("1p9p1s")], kinds: h("1p9p1s"), hand: "19m9s1234567z1z" },
  2: { melds: [kpon("1p9p1s"), kpon("1z2z3z")], kinds: h("1p9p1s1z2z3z"), hand: "19m9s4567z9m" },
  3: {
    melds: [kpon("1p9p1s"), kpon("1z2z3z"), kpon("4z5z6z")],
    kinds: h("1p9p1s1z2z3z4z5z6z"),
    hand: "19m9s7z1m",
  },
  4: {
    melds: [kpon("1p9p1s"), kpon("1z2z3z"), kpon("4z5z6z"), kpon("7z9s9m")],
    kinds: h("1p9p1s1z2z3z4z5z6z7z9s9m"),
    hand: "11m",
  },
};
for (const n of [1, 2, 3, 4]) {
  const c = sets[n]!;
  const opts: DecomposeOptions = { kokushiOnly: true, kokushiMeldKinds: c.kinds };
  const hand = h(c.hand);
  console.log(
    `  특수 퐁 ${n}묶음 — 손패 ${c.hand} (${hand.length}장) 화료형=${isWinningShape(hand, n, opts)}`,
  );
  show(
    `  채점 ${n}묶음`,
    mk(c.hand, c.melds, c.hand.slice(-2), opts),
  );
}

