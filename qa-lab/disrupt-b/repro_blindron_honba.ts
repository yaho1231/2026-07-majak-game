/**
 * 눈먼 총알(blind_ron)이 **본장 가산분까지 함께** 엉뚱한 사람에게 옮긴다.
 *
 * detail: "옮겨 가는 것은 손의 지불분이며 공탁·본장은 원래대로 정산된다."
 * 구현(blind_ron.ts:117 `const owed = -(deltas[shooter] ?? 0)`)은 쏜 사람의 **음수 델타
 * 전체**를 옮기는데, 론의 델타에는 본장 가산분(300×본장)이 이미 섞여 있다
 * (standardActions.ts:966-969). 그래서 본장 몫도 함께 날아간다.
 */
import { ROUND_SETTLED, ROUND_STARTED, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { blindRon } from "../../packages/content/src/augments/blind_ron.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (map[p.id] ? { ...p, augments: [...map[p.id]!] } : p)),
  };
}

const HONBA = 2;
const HAND = 8000;
const HONBA_PAY = 300 * HONBA;

for (const seed of [1, 2, 3, 4, 5, 6]) {
  const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, seed });
  const s: GameState = {
    ...withAug(base, { p0: ["blind_ron"] }),
    round: { ...base.round, honba: HONBA },
  };
  const game = createStandardGameFromState(s, undefined, []);
  installAugment(game.engine, blindRon, "p0", { yaku: game.yaku });
  game.engine.actions.register({
    type: "__qa_emit",
    validate: () => null,
    toEvents: (req) => [req.payload as { type: string; payload: unknown }],
  });
  // 이 국에 켠다
  game.engine.submit({ player: "p0" as PlayerId, type: "__qa_emit", payload: { type: ROUND_STARTED, payload: {} } });
  const before = Object.fromEntries(game.engine.state.players.map((p) => [p.id, p.score]));
  // p2 → p1 론 (8000 + 본장 600)
  game.engine.submit({
    player: "p0" as PlayerId,
    type: "__qa_emit",
    payload: {
      type: ROUND_SETTLED,
      payload: {
        outcome: "win",
        deltas: { p0: 0, p1: HAND + HONBA_PAY, p2: -(HAND + HONBA_PAY), p3: 0 },
        winInfos: [
          { winner: "p1", winType: "ron", from: "p2", han: 4, fu: 30, points: HAND, yakumanCount: 0, limit: null, yaku: [] },
        ],
      },
    },
  });
  const after = Object.fromEntries(game.engine.state.players.map((p) => [p.id, p.score]));
  const d = Object.fromEntries(Object.keys(after).map((k) => [k, after[k]! - before[k]!]));
  const victim = Object.entries(d).find(([k, v]) => k !== "p1" && v! < 0)?.[0];
  console.log(
    `seed=${seed} 본장=${HONBA} 실제 쏜 사람=p2 → 청구된 사람=${victim} ` +
      `증감 ${JSON.stringify(d)}  ` +
      (victim !== undefined && victim !== "p2"
        ? `※ 본장 ${HONBA_PAY}점까지 함께 옮겨 갔다 (기대: ${HAND}만 옮기고 p2가 ${HONBA_PAY} 부담)`
        : "(이 시드는 쏜 사람이 그대로 뽑혔다)"),
  );
}
