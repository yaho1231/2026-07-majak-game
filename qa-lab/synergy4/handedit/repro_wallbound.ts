/**
 * 산 소모 · 왕패 경계 — 연장(hourglass)이 왕패에서 패산으로 4장을 끌어오고, 끝날 때
 * **남은 패산을 통째로 왕패로 되돌린다**(CLOSE_EVENT). 그 사이에 패산을 건드리는
 * 카드가 겹치면 왕패가 14장을 넘거나 도라 표시패가 어긋날 수 있다.
 *
 * 예측(먼저 적는다):
 *   연장 중 무엇을 하든 ① 왕패 ≤ 14 ② 도라 표시패가 그대로 ③ 총 136장·중복 0 ④ 영상패
 *   잔량이 음수가 되지 않는다.
 *   위험 후보: 미래를 보는 자(패산 −1, 맨 밑으로 2장 반납) · 무르기(맨 밑으로 1장 반납)
 *   · 밑장빼기(맨 밑에서 뽑기) · 왕패의 주인(왕패 ↔ 손패 교환).
 */
import {
  DEAD_WALL,
  FlowController,
  WALL,
  createStandardGameFromState,
  installAugment,
  rinshanRemaining,
} from "@majak/core";
import type { GameState } from "@majak/core";
import { hourglass } from "../../../packages/content/src/augments/hourglass.js";
import { futureSight } from "../../../packages/content/src/augments/future_sight.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { craft, withAugments, tileCensus, check, section, done } from "./lib.js";

const DEFS: Record<string, unknown> = {
  hourglass,
  future_sight: futureSight,
  take_back: takeBack,
  bottom_deal: bottomDeal,
  dead_wall_master: deadWallMaster,
};
/** 연장 중 눌러 볼 액션들 (제시되면 계속 누른다) */
const PRESS = ["future_arm", "future_exchange", "take_back", "bottom_deal", "dw_swap"];

function trimWall(s: GameState, n: number): GameState {
  const ids = s.zones[WALL]?.tileIds ?? [];
  const p3 = s.zones["discards:p3"];
  return {
    ...s,
    zones: {
      ...s.zones,
      [WALL]: { ...(s.zones[WALL] as never), tileIds: ids.slice(0, n) },
      "discards:p3": {
        ...(p3 as never),
        tileIds: [...(p3?.tileIds ?? []), ...ids.slice(n)],
      },
    },
  };
}

function run(partner: string): void {
  const augs = ["hourglass", partner];
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "5m5p", p1: "2z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(trimWall(withAugments(base, { p0: augs }), 1));
  for (const a of augs) {
    installAugment(game.engine, DEFS[a] as never, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    } as never);
  }
  const dora0 = [...(game.engine.state.round.doraIndicators ?? [])];
  const flow = new FlowController(game.engine);
  let st = flow.begin();
  let steps = 0;
  let maxDead = 0;
  let minRinshan = 99;
  while (st.kind === "awaiting" && steps < 200) {
    steps++;
    const pr = st.prompts[0];
    if (pr === undefined) break;
    let pick: (typeof pr.options)[number] | undefined;
    if (pr.player === "p0") pick = pr.options.find((o) => PRESS.includes(o.type));
    if (pick === undefined) {
      const drawn = game.engine.state.round.lastDrawnTile;
      pick =
        pr.options.find(
          (o) => o.type === "discard" && (o.payload as { tileId?: number })?.tileId === drawn,
        ) ??
        pr.options.find((o) => o.type === "discard") ??
        pr.options.find((o) => o.type === "pass");
    }
    if (pick === undefined) break;
    st = flow.submit(pr.player, pick as never);
    const s = game.engine.state;
    maxDead = Math.max(maxDead, s.zones[DEAD_WALL]?.tileIds.length ?? 0);
    minRinshan = Math.min(minRinshan, rinshanRemaining(s));
  }
  const s = game.engine.state;
  const c = tileCensus(s);
  const dora1 = [...(s.round.doraIndicators ?? [])];
  const problems: string[] = [];
  if (maxDead > 14) problems.push(`왕패 최대 ${maxDead}`);
  if (minRinshan < 0) problems.push(`영상 잔량 최소 ${minRinshan}`);
  if (c.total !== 136 || c.dupes.length !== 0) problems.push(`census ${c.total}/${c.dupes.length}`);
  if (JSON.stringify(dora0) !== JSON.stringify(dora1)) problems.push(`도라 ${JSON.stringify(dora0)}→${JSON.stringify(dora1)}`);
  console.log(
    `  ${problems.length === 0 ? "ok  " : "XX  "}hourglass + ${partner}: 왕패 최대 ${maxDead} · 최종 왕패 ${s.zones[DEAD_WALL]?.tileIds.length} · 패산 ${s.zones[WALL]?.tileIds.length} · 영상 최소 ${minRinshan} · census ${c.total}/${c.dupes.length} · 결과 ${st.kind === "roundOver" ? st.outcome : st.kind}${problems.length === 0 ? "" : " ‼ " + problems.join(" / ")}`,
  );
  check(`hourglass + ${partner}`, problems.length === 0, problems.join(" / "));
}

section("연장(hourglass) 중에 패산·왕패를 건드리는 카드");
for (const p of ["future_sight", "take_back", "bottom_deal", "dead_wall_master"]) run(p);
done();
