/**
 * C1 — dora_conceal(가려진 도라) × mirror_dora(거울)
 * 기대: 상대·관전자 뷰 어디에서도 이번 국 도라 표시패의 종류를 알 수 없어야 한다.
 */
import { craft, setIndicator, setup, reserveInWall, kindKey, kindOf, table } from "./lib.js";
import { buildPlayerView, SPECTATOR_ID, DEAD_WALL } from "@majak/core";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { doraConceal } from "../../../packages/content/src/augments/dora_conceal.js";
import { doraAfterimage } from "../../../packages/content/src/augments/dora_afterimage.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { FlowController } from "@majak/core";

const DEFS: Record<string, any> = {
  mirror_dora: mirrorDora, dora_conceal: doraConceal,
  dora_afterimage: doraAfterimage, ankan_dora: ankanDora,
};

function run(label: string, augs: string[]) {
  let st = craft({ hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
  st = reserveInWall(st, ["4m"]);
  st = setIndicator(st, "4m"); // 표시패 4m → 도라 5m, 거울 앞도라 3m
  const game = setup(st, augs.map((a) => ({ def: DEFS[a], holder: "p0" as const })));
  // 리액션이 돌도록 흐름을 한 번 태운다
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  // p0가 한 장 버려 이벤트를 흘린다 (거울의 announce 리액션은 매 이벤트마다 돈다)
  if (status.kind === "awaiting") {
    const pr = status.prompts.find((p) => p.player === "p0");
    const d = pr?.options.find((o) => o.type === "discard");
    if (d) flow.submit("p0", d as any);
  }
  const s = game.engine.state;
  const indicatorId = s.round.doraIndicators[0]!;
  const real = kindKey(kindOf(s, indicatorId));
  const view = buildPlayerView(s, "p1", game.engine.rules);
  const spec = buildPlayerView(s, SPECTATOR_ID, game.engine.rules);
  const chans = Object.entries(view.augmentView ?? {}).filter(([k]) => /mirror|ankan|afterimage/.test(k));
  const raw = Object.entries(s.augmentData).filter(([k]) => /mirror/.test(k));
  return {
    조합: label,
    "실제 표시패": real,
    "p1 round.doraIndicators": view.round.doraIndicators.length,
    "p1 왕패에 표시패 실물": (view.zones[DEAD_WALL]?.tileIds ?? []).includes(indicatorId),
    "p1이 받는 증강 채널": JSON.stringify(chans),
    "관전자 doraIndicators": spec.round.doraIndicators.length,
    "augmentData(mirror)": JSON.stringify(raw),
  };
}

const rows = [
  run("없음", []),
  run("dora_conceal만", ["dora_conceal"]),
  run("mirror만", ["mirror_dora"]),
  run("conceal + mirror", ["dora_conceal", "mirror_dora"]),
];
for (const r of rows) { console.log("\n---", r.조합); for (const [k, v] of Object.entries(r)) if (k !== "조합") console.log("   ", k, "=", v); }

// ── C1b: 은닉자(p0)와 거울 보유자(p1)가 서로 다른 좌석일 때 ─────────────
{
  let st = craft({ hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
  st = reserveInWall(st, ["4m"]);
  st = setIndicator(st, "4m");
  const game = setup(st, [
    { def: doraConceal, holder: "p0" },
    { def: mirrorDora, holder: "p1" },
  ]);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind === "awaiting") {
    const pr = status.prompts.find((p) => p.player === "p0");
    const d = pr?.options.find((o) => o.type === "discard");
    if (d) flow.submit("p0", d as any);
  }
  const s2 = game.engine.state;
  console.log("\n--- C1b: p0=dora_conceal · p1=mirror_dora · 증강 없는 p2 시점");
  const v2 = buildPlayerView(s2, "p2", game.engine.rules);
  console.log("    실제 표시패 =", kindKey(kindOf(s2, s2.round.doraIndicators[0]!)));
  console.log("    p2 round.doraIndicators =", v2.round.doraIndicators.length, "(가려짐)");
  console.log("    p2가 받는 채널 =", JSON.stringify(Object.entries(v2.augmentView ?? {}).filter(([k]) => /mirror/.test(k))));
}
