/**
 * H4 — 오픈 리치(open_riichi_reveal)의 "리치를 3판으로 취급"(+2판 차액)이
 *      이중 선언(riichi_upgrade)과 겹치면 어긋나는가.
 *  · riichi_upgrade는 모든 리치를 **더블리치(2판)** 로 만들고, 자연 더블이면 +2판(트리플=4판).
 *  · open_riichi_reveal은 그 위에 무조건 +2판을 얹는다 (개문선언 open_riichi만 예외 처리).
 *  → 카드가 약속한 "리치 3판"이 4판·6판이 된다.
 */
import { runFocus } from "./focus.js";

const HAND = ["man1","man1","man1","man2","man3","man4","man5","man6","man7","pin1","pin1","pin1","sou2"];

interface Row { seed: number; yaku: string; extra: string; han: number }
const rows: Row[] = [];
let wins = 0;

for (const combo of [["open_riichi_reveal"], ["open_riichi_reveal", "riichi_upgrade"]]) {
  const label = combo.join("+");
  const got: Row[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    await runFocus({
      seed, mode: "tonpuu", noDraft: true,
      preset: { p0: combo, p1: [], p2: [], p3: [] },
      presetHands: { p0: HAND },
      prefer: { p0: ["open_riichi"] },
      onEvent: (e) => {
        if (e.type !== "RoundSettled") return;
        const infos = (e.payload["winInfos"] ?? []) as {
          winner: string; han: number; yaku: { id: string; han: number }[];
          extraHan: number; extraHanBy?: { augId: string; han: number }[];
        }[];
        for (const w of infos) {
          if (w.winner !== "p0") continue;
          wins++;
          got.push({
            seed,
            yaku: w.yaku.filter((y) => y.id.includes("riichi") || y.id === "ippatsu").map((y) => `${y.id}:${y.han}`).join(","),
            extra: JSON.stringify(w.extraHanBy ?? []),
            han: w.han,
          });
        }
      },
      timeoutMs: 120_000,
    });
  }
  const uniq = [...new Map(got.map((r) => [r.yaku + r.extra, r])).values()];
  console.log(`### ${label} — wins=${got.length}`);
  for (const r of uniq.slice(0, 8)) console.log(`  seed=${r.seed} han=${r.han} riichiYaku=[${r.yaku}] extraHanBy=${r.extra}`);
  rows.push(...got);
}
console.log(`totalWins=${wins}`);
