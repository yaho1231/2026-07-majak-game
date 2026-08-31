/**
 * 실게임에서 «생성패가 공용 패산에 들어 있는 상태»가 실제로 나오는가 —
 * 조합별로 반장전을 완주시키며 매 뷰마다 패산 안의 conjured 실물을 센다.
 *
 * 예측: repro_conjured_wall.ts 가 강제 장면에서 확인한 경로가, 봇이 스스로 고르는
 *       실게임에서도 나온다. 특히 미련(regret)은 **다음 국 배패 13장을 전부 생성패로**
 *       주입하므로, 그 국에 밥상 뒤엎기·통째로 바꾸기·개벽이 겹치면 열 장 넘는
 *       생성패가 한꺼번에 패산으로 들어간다.
 */
import { PERSONAS, runMatch } from "../../harness.js";
import { WALL } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";

const PAIRS: [string, string][] = [
  ["regret", "table_flip"],
  ["regret", "full_hand_swap"],
  ["regret", "genesis"],
  ["three_dragons_will", "table_flip"],
  ["even_world", "table_flip"],
  ["suit_unify", "genesis"],
  ["joker", "full_hand_swap"],
  ["tile_split", "table_flip"],
];

async function main(): Promise<void> {
  for (const [a, b] of PAIRS) {
    for (const seed of [11, 23, 37]) {
      let worst = 0;
      let worstRound = "";
      const onState = (st: GameState): void => {
        let n = 0;
        for (const id of st.zones[WALL]?.tileIds ?? []) {
          if (st.tiles[id]?.attrs?.conjured === true) n++;
        }
        if (n > worst) {
          worst = n;
          worstRound = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
        }
      };
      const r = await runMatch({
        seed,
        mode: "hanchan",
        preset: { p0: [a, b], p1: [a], p2: [b], p3: [] } as Record<PlayerId, readonly string[]>,
        personas: {
          p0: PERSONAS.masher as never,
          p1: PERSONAS.masher as never,
          p2: PERSONAS.chaos as never,
          p3: PERSONAS.riichiRusher as never,
        },
        onState,
        timeoutMs: 180_000,
      });
      console.log(
        `${a}+${b} seed=${seed} rounds=${r.rounds} · 패산 속 생성패 최대 ${worst}장 (${worstRound})${r.crash === undefined ? "" : " CRASH " + r.crash.split("\n")[0]}`,
      );
    }
  }
}
void main();
