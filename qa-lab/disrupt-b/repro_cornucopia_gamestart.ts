/**
 * 수상한 주사위(cornucopia)가 **게임 시작 드래프트 전용** 증강을 남3국에 지급한다.
 *
 * core/src/augment/Augment.ts 의 후보 필터가
 *   d.draftStages === undefined || d.draftStages.includes("gameStart")
 * 라서, `draftStages: ["gameStart"]` 인 증강(가불 인생·대기만성)이 **오히려 통과**한다.
 * 바로 위 주석은 그 반대를 막으려 넣은 필터라고 적혀 있다.
 */
import {
  augmentGrantKey,
  createStandardGameFromState,
  defineAugment,
  installAugment,
  ROUND_STARTED,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../packages/content/test/helpers.js";
import { cornucopia } from "../../packages/content/src/augments/cornucopia.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (map[p.id] ? { ...p, augments: [...map[p.id]!] } : p)),
  };
}

/** 남3국(=늦은 드래프트 시점) 상태 */
function lateState(seed: number): GameState {
  const s = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, seed });
  return { ...s, round: { ...s.round, prevalentWind: 2, roundNumber: 3 } };
}

// ── ① 후보 목록에 gameStart 전용 증강이 들어 있는가 ──────────────────
let captured: readonly AugmentDef[] = [];
const probe: AugmentDef = defineAugment({
  id: "qa_probe", tier: "prism", category: "etc", complexity: 1,
  name: "probe", description: "probe", detail: "probe",
  install(ctx) { ctx.grantAugments((av) => { captured = av; return []; }); },
});
{
  const st = withAug(lateState(1), { p0: ["qa_probe"] });
  const game = createStandardGameFromState(st, undefined, [...contentAugments, probe]);
  installAugment(game.engine, probe, "p0", { yaku: game.yaku, catalog: game.augments });
  const gsOnly = captured.filter((d) => d.draftStages?.includes("gameStart") === true).map((d) => d.id);
  const lateOnly = captured.filter(
    (d) => d.draftStages !== undefined && !d.draftStages.includes("gameStart"),
  ).map((d) => d.id);
  console.log(`후보 ${captured.length}개 중 gameStart 전용:`, gsOnly);
  console.log("후보에서 빠진 늦은 스테이지 전용:", lateOnly);
}

// ── ② 실제로 지급되는가 (시드를 훑는다) ───────────────────────────────
const hits: { seed: number; granted: string[] }[] = [];
for (let seed = 1; seed <= 60; seed++) {
  const st = withAug(lateState(seed), { p0: ["cornucopia"] });
  const game = createStandardGameFromState(st, undefined, contentAugments);
  installAugment(game.engine, cornucopia, "p0", { yaku: game.yaku, catalog: game.augments });
  const granted = game.engine.state.augmentData[augmentGrantKey("p0", "cornucopia")];
  const ids = Array.isArray(granted) ? (granted as string[]) : [];
  if (ids.some((i) => i === "devils_advance" || i === "late_bloomer" || i === "late_bloomer_east")) {
    hits.push({ seed, granted: ids });
  }
}
console.log(`\n남3국 지급 60회 중 게임시작 전용이 섞인 경우 ${hits.length}회:`, hits.slice(0, 6));

// ── ③ 남3국에 받은 '가불 인생'이 실제로 +10,000을 만드는가 ────────────
{
  const hit = hits.find((h) => h.granted.includes("devils_advance"));
  if (hit === undefined) {
    console.log("\n(이 시드 범위에서는 가불 인생이 안 나왔다 — ①이 이미 후보 통과를 보인다)");
  } else {
    const st = withAug(lateState(hit.seed), { p0: ["cornucopia"] });
    const game = createStandardGameFromState(st, undefined, contentAugments);
    installAugment(game.engine, cornucopia, "p0", { yaku: game.yaku, catalog: game.augments });
    // (지급 경로가 설치까지 끝낸다 — 여기서 다시 설치하지 않는다)
    const sum = (): number => game.engine.state.players.reduce((a, p) => a + p.score, 0);
    console.log("\n지급 후 p0 증강:", game.engine.state.players.find((p) => p.id === "p0")!.augments);
    console.log("국 시작 전 총점:", sum(), game.engine.state.players.map((p) => p.score));
    if (!game.engine.actions.has("__qa_emit")) {
      game.engine.actions.register({
        type: "__qa_emit",
        validate: () => null,
        toEvents: (req) => [req.payload as { type: string; payload: unknown }],
      });
    }
    game.engine.submit({ player: "p0" as PlayerId, type: "__qa_emit", payload: { type: ROUND_STARTED, payload: {} } });
    console.log("남3국 시작 후 총점:", sum(), game.engine.state.players.map((p) => p.score));
  }
}
void ROUND_STARTED;
