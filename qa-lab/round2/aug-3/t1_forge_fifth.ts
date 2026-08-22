/**
 * H1 — peek_forge(선언 간파의 위조)가 세상에 없는 **5번째 장**을 만드는가.
 * off_by_one은 같은 함정을 `copiesLeftUndrawn`으로 막는데, peek_forge에는 그 검사가 없다.
 * 드래프트를 **끄고**(noDraft) p0에게만 peek_riichi_waits를 주어 다른 '패를 만드는' 증강을 배제한다.
 */
import { kindKey } from "@majak/core";
import type { GameState } from "@majak/core";
import { runFocus } from "./focus.js";

let games = 0, forges = 0;
const found: string[] = [];
for (let seed = 1; seed <= 120; seed++) {
  let last: GameState | null = null;
  const bad: string[] = [];
  const seen = new Set<string>();
  const r = await runFocus({
    seed,
    mode: "hanchan",
    noDraft: true,
    preset: { p0: ["peek_riichi_waits"], p1: [], p2: [], p3: [] },
    prefer: { p0: ["peek_waits", "peek_forge"] },
    riichi: { p1: true, p2: true, p3: true },
    onState: (st: GameState) => { last = st; },
    onEvent: (e, st) => {
      if (st === null) return;
      if (e.type !== "TileKindChanged") return;
      // **패산·왕패를 뺀 '이미 나온' 장수**만 센다.
      // 손에서 만들어 낸 패는 원리적으로 총량 5장을 만들 수밖에 없지만(off_by_one도 같다),
      // 문제가 되는 것은 **눈에 보이는 자리에 5장째가 서는 것**이다 —
      // 대기 잔량 계산(botHelpers.waitTilesLeft)이 0이라고 말하는데 화료가 나는 상태.
      const cnt = new Map<string, number>();
      for (const z of Object.values(st.zones)) {
        if (z.id === "wall" || z.id === "deadWall") continue;
        for (const id of z.tileIds) {
          const k = st.tiles[id as unknown as number]?.kind;
          if (k === undefined) continue;
          const key = kindKey(k);
          cnt.set(key, (cnt.get(key) ?? 0) + 1);
        }
      }
      for (const [k, c] of cnt) {
        if (c > 4 && !seen.has(k)) {
          seen.add(k);
          bad.push(`${k} x${c} @${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} (changes=${JSON.stringify(e.payload["changes"])})`);
        }
      }
    },
    timeoutMs: 150_000,
  });
  games++;
  forges += r.actions["peek_forge"] ?? 0;
  if (r.crash !== undefined) console.log(`CRASH seed=${seed} ${r.crash}`);
  if (r.effectErrors.length > 0) console.log(`EFFERR seed=${seed} ${[...new Set(r.effectErrors)].slice(0,3).join(" | ")}`);
  if (bad.length > 0) {
    found.push(`seed=${seed}`);
    console.log(`OVERFLOW seed=${seed} forges=${r.actions["peek_forge"] ?? 0}\n  ${bad.slice(0, 3).join("\n  ")}`);
  }
  void last;
}
console.log(`DONE games=${games} forges=${forges} overflowGames=${found.length} (${found.slice(0,10).join(",")})`);
