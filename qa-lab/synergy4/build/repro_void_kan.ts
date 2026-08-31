/**
 * 재현 — 성립하지 않는 깡(void_kan)이 실게임에서 «기회 자체»를 몇 번이나 만나는가.
 * 상대의 안깡·가깡(창깡 대상) 선언 수를 센다. 대명깡은 코어상 대상이 아니다.
 *   tsx qa-lab/synergy4/build/repro_void_kan.ts [seeds=20]
 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";

const N = Number(process.argv[2] ?? 20);
let rounds = 0, kanAll = 0, kanByOpp = 0, kanOpen = 0, chankanWins = 0;
for (let s = 1; s <= N; s++) {
  const r = await runBuild({
    seed: s, mode: "hanchan",
    preset: { p0: ["void_kan"], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
    onEvent: (e) => {
      const t = String(e.type ?? "");
      if (t === "RoundStarted") rounds++;
      if (t === "KanDeclared") {
        kanAll++;
        const p = e.payload as { player?: string; kind?: string; kanKind?: string };
        const kind = String(p.kanKind ?? p.kind ?? "?");
        if (p.player !== "p0") { kanByOpp++; if (kind.includes("open") || kind === "minkan") kanOpen++; }
      }
      if (t === "RoundSettled") {
        const j = JSON.stringify(e.payload ?? {});
        if (j.includes("chankan") && j.includes('"winner":"p0"')) chankanWins++;
      }
    },
    timeoutMs: 300_000,
  });
  if (r.crash !== undefined) console.log(`crash s=${s}: ${r.crash.slice(0, 150)}`);
}
console.log(`시드 ${N}판 · 국=${rounds} · 깡 전체=${kanAll} · 상대 깡=${kanByOpp} (그중 대명깡=${kanOpen}) · p0 창깡 화료=${chankanWins}`);
