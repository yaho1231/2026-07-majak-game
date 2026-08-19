/**
 * ① 격(格) — "지목은 … 국이 끝나면 풀린다"인데 전원 공개 지목 배지가 정산 뒤에도 남는다.
 * ② 덤터기 — "나머지 두 명은 한 푼도 내지 않는다"가 Transfer 단계 증강 앞에서 깨진다.
 *
 * 실행: /Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/repro_rank_gate_and_scapegoat.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, lastSettled, start } from "../../score-b/scene.js";

const say = (s: string): void => {
  console.log(s);
};

const withRound = (s: GameState, r: Partial<GameState["round"]>): GameState => ({
  ...s,
  round: { ...s.round, ...r },
});

/** p0 쯔모 장면 (국 첫 순) */
const tsumoScene = (): GameState =>
  withRound(
    craft({
      hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { firstTurn: true, goAroundBroken: false },
  );

// ── ① rank_gate ────────────────────────────────────────────────────────────
say("===== ① 격(格) — 지목 배지의 수명");
{
  const { game, flow } = start(tsumoScene(), { p0: ["rank_gate"] } as never);
  const r = flow.submit("p0", {
    type: "rank_gate_mark",
    payload: { target: "p1" as PlayerId },
  });
  say(`  지목 결과=${r.kind}`);
  const dump = (tag: string): void => {
    const d = game.engine.state.augmentData;
    for (const k of Object.keys(d).filter((x) => x.includes("rank_gate"))) {
      say(`  ${tag} ${k} = ${JSON.stringify(d[k])}`);
    }
  };
  dump("[지목 직후]");
  const st = flow.submit("p0", { type: "win", payload: {} });
  say(`  화료=${st.kind}`);
  dump("[정산 직후]");
  say(
    "  ↑ view:*:rank_gate:p0 는 국 스코프 표식이 없어 다음 국이 시작될 때까지 살아 있다" +
      " (지우는 곳은 ROUND_STARTED 리액션 하나뿐)",
  );
}

// ── ② scapegoat ────────────────────────────────────────────────────────────
say("\n===== ② 덤터기 — '나머지 두 명은 한 푼도 내지 않는다'");
function scapeCase(tag: string, give: Record<string, string[]>): void {
  const { flow } = start(tsumoScene(), give as never);
  const m = flow.submit("p0", {
    type: "scapegoat_mark",
    payload: { target: "p2" as PlayerId },
  });
  if (m.kind === "rejected") {
    say(`  ${tag}: 지목 거부`);
    return;
  }
  const st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind !== "roundOver") {
    say(`  ${tag}: 화료 실패 ${st.kind}`);
    return;
  }
  const p = lastSettled(flow);
  say(`  ${tag}: deltas=${JSON.stringify(p.deltas)}`);
  const bystanders = (["p1", "p3"] as PlayerId[]).filter(
    (id) => (p.deltas[id] ?? 0) !== 0,
  );
  say(
    `     지목 대상 p2 = ${p.deltas.p2}, 나머지 둘이 무는가 = ${
      bystanders.length > 0 ? `★ 예 (${bystanders.map((b) => `${b}:${p.deltas[b]}`).join(", ")})` : "아니오"
    }`,
  );
}
scapeCase("덤터기만            ", { p0: ["scapegoat"] });
scapeCase("덤터기 + 뚫린 천장  ", { p0: ["scapegoat", "aotenjou_ceiling"] });
scapeCase("덤터기 + 가불 인생  ", { p0: ["scapegoat", "devils_advance"] });
