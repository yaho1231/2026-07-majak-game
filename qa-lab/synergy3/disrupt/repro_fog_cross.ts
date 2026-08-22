/**
 * 안개 덮인 바닥(hidden_river) × 박무(brief_fog) — 대조군 4칸.
 *
 * 기대(설명이 약속한 것):
 *  - hidden_river: "보유자만 네 바닥을 그대로 읽는다"
 *  - brief_fog:    "나만 네 개의 바닥을 그대로 본다"
 *  둘을 다른 좌석이 동시에 걸면, **두 보유자는 각각 자기 약속대로 그대로 읽어야** 한다.
 *  비보유자(p2·p3)는 더 좁은 쪽(count_only)에 걸린다.
 *
 * 재는 값: `visibility.discards` 규칙의 최종 합성값 (뷰어별) +
 *          실제 PlayerView 의 남의 바닥 tileIds 장수.
 */
import { craft, setup, submit, table, view, rule } from "./lib.js";
import type { Game, GameState, PlayerId } from "./lib.js";

function scene(): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    discards: {
      p0: "123456789m1p",
      p1: "123456789m2p",
      p2: "123456789m3p",
      p3: "123456789m4p",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 어느 뷰어가 어느 바닥을 몇 장이나 실제로 보는가 */
function riverSeen(game: Game, viewer: PlayerId, owner: PlayerId): string {
  const v = view(game, viewer);
  const z = v.zones[`discards:${owner}`];
  const shown = z?.tileIds.length ?? 0;
  const hidden = (z as { hiddenCount?: number } | undefined)?.hiddenCount ?? 0;
  return `${shown}장 공개/${hidden}장 가림`;
}

function visRule(game: Game, viewer: PlayerId, owner: PlayerId): string {
  const r = game.engine.rules.resolve("visibility.discards", {
    playerId: viewer,
    zoneOwner: owner,
    state: game.engine.state,
  } as never);
  return typeof r === "object" ? JSON.stringify(r) : String(r);
}

function run(
  label: string,
  hr: boolean,
  bf: boolean,
  p0id = "hidden_river",
  p1id = "brief_fog",
): Record<string, unknown> {
  const map: Record<string, string[]> = {};
  if (hr) map["p0"] = [p0id];
  if (bf) map["p1"] = [p1id];
  const game = setup(scene(), map);
  // p0 의 순: 안개 선언
  const act = (id: string): string =>
    id === "hidden_river" ? "declare_fog" : "declare_brief_fog";
  if (hr) submit(game, "p0", act(p0id), {});
  if (bf) {
    // p1 순으로 돌리지 않고 turnSeat 만 옮겨서 선언한다 (규칙 합성만 재는 것이 목적)
    (game.engine as unknown as { currentState: GameState }).currentState = {
      ...game.engine.state,
      round: { ...game.engine.state.round, turnSeat: 1 },
    };
    submit(game, "p1", act(p1id), {});
  }
  return {
    조합: label,
    "p0 보유자가 보는 p2 바닥": riverSeen(game, "p0", "p2"),
    "p1 보유자가 보는 p2 바닥": riverSeen(game, "p1", "p2"),
    "p2(비보유)가 보는 p0 바닥": riverSeen(game, "p2", "p0"),
    "규칙 p0→p2": visRule(game, "p0", "p2"),
    "규칙 p1→p2": visRule(game, "p1", "p2"),
    "규칙 p2→p0": visRule(game, "p2", "p0"),
  };
}

const rows = [
  run("없음", false, false),
  run("A=hidden_river만", true, false),
  run("B=brief_fog만", false, true),
  run("A+B", true, true),
];
table("hidden_river × brief_fog — 바닥 가시성", rows);

table("같은 증강 둘 (좌석 교차) — 보유자 면제가 서로에게도 서는가", [
  run("hidden_river × hidden_river", true, true, "hidden_river", "hidden_river"),
  run("brief_fog × brief_fog", true, true, "brief_fog", "brief_fog"),
]);
void rule;
