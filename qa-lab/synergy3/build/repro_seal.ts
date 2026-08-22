/**
 * 봉인 빌드 검증: riichi_seal 이 실제로 상대 리치를 막는가.
 *
 * 국마다 (p0 리치 선언 순서, 그 뒤 상대 리치 선언 수)를 센다.
 * 봉인이 서면 그 뒤 상대 리치는 0이어야 한다.
 */
import { runBuild } from "./run.js";
import type { PlayerId } from "@majak/core";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

interface Round { p0First: boolean; p0At: number | null; after: string[]; before: string[] }

async function go(ids: readonly string[], label: string): Promise<void> {
  let rounds = 0, sealed = 0, leaked = 0, oppRiichi = 0;
  const detail: string[] = [];
  for (const seed of SEEDS) {
    let cur: Round = { p0First: false, p0At: null, after: [], before: [] };
    let n = 0;
    await runBuild({
      seed, mode: "tonpuu",
      preset: { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
      onEvent: (e) => {
        if (e.type === "RoundStarted") { cur = { p0First: false, p0At: null, after: [], before: [] }; n = 0; }
        if (e.type === "TileDiscarded") {
          n++;
          if (e.payload?.["riichi"] === true) {
            const p = String(e.payload["player"]);
            if (p === "p0") {
              if (cur.p0At === null) { cur.p0At = n; cur.p0First = cur.before.length === 0; }
            } else if (cur.p0At === null) cur.before.push(`${p}@${n}`);
            else cur.after.push(`${p}@${n}`);
          }
        }
        if (e.type === "RoundSettled") {
          rounds++;
          oppRiichi += cur.before.length + cur.after.length;
          if (cur.p0First) {
            sealed++;
            if (cur.after.length > 0) {
              leaked++;
              detail.push(`seed${seed} p0리치@${cur.p0At} 이후 상대 리치: ${cur.after.join(",")}`);
            }
          }
        }
      },
    });
  }
  console.log(`${label}: 국 ${rounds} · p0 선제리치(봉인 성립) ${sealed} · 그 뒤 상대 리치가 뚫린 국 ${leaked} · 상대 리치 총 ${oppRiichi}`);
  for (const d of detail.slice(0, 10)) console.log("   ", d);
}

await go(["riichi_seal", "call_seal", "disarm", "time_stop"], "disrupt 빌드");
await go([], "대조군(증강 없음)");
