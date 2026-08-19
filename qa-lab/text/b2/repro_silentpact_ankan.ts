/**
 * 묵계(silent_pact) description: "같은 국에 평범한 퐁·치·**깡**을 하나라도 더 하면
 * 그 순간 손이 열려 전부 잃는다."  ← detail은 "퐁·치·**대명깡**"이라고 적어 서로 어긋난다.
 * 실제로 **안깡**은 손을 열지 않는다 — 묵계 퐁 + 안깡 손은 그대로 멘젠이다.
 */
import {
  buildWinContext, createStandardGameFromState, evaluateWin, openMeldCountOf,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";

function scene(extra: "none" | "ankan" | "pon"): GameState {
  const melds: any = { p0: [{ kind: "pon", spec: "555z", from: "p1" }] };
  if (extra === "ankan") melds.p0.push({ kind: "kan_closed", spec: "1111m" });
  if (extra === "pon") melds.p0.push({ kind: "pon", spec: "999m", from: "p1" });
  const hand = extra === "none" ? "234p567p234s55s" : extra === "ankan" ? "234p567p55s" : "234p567p55s";
  const base = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, melds, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  // 묵계 퐁 표식(silent) — 코어의 멘젠 판정 세 곳이 이걸 안깡처럼 취급한다
  const rs = base.round.byPlayer["p0"]!;
  return {
    ...base,
    round: {
      ...base.round,
      byPlayer: { ...base.round.byPlayer, p0: { ...rs, melds: rs.melds.map((m, i) => (i === 0 ? { ...m, silent: true } : m)) } },
    },
  };
}

for (const extra of ["none", "ankan", "pon"] as const) {
  const st = scene(extra);
  const g = createStandardGameFromState(st);
  const s = g.engine.state;
  const openCnt = openMeldCountOf(s, "p0");
  const hand = s.zones["hand:p0"]!.tileIds;
  const riichiVerdict = g.engine.actions.get("riichi")?.validate(
    { player: "p0", type: "riichi", payload: { tileId: hand.at(-1)! } },
    { state: s, rules: g.engine.rules } as never,
  );
  const wctx = buildWinContext(s, "p0", "tsumo", s.round.lastDrawnTile!, { rules: g.engine.rules });
  const ev = evaluateWin(wctx, g.yaku);
  console.log(
    `묵계퐁 + ${extra.padEnd(5)}: openMeldCount=${openCnt} 표준riichi=${JSON.stringify(riichiVerdict)} ` +
      `화료판정 isClosed=${ev?.variant?.isClosed ?? "-"} yaku=${(ev?.yaku ?? []).map((y: any) => y.id).join(",") || "-"}`,
  );
}
