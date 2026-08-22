/** 실제 완주 게임: 좌석이 conflicts 쌍을 동시 보유 / 게임 내 같은 증강 중복 보유 */
import { Prng } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, SEATS, byId, runMatch } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";
const conf = (a: string, b: string): boolean =>
  (byId.get(a)?.conflicts ?? []).includes(b) || (byId.get(b)?.conflicts ?? []).includes(a);
const N = Number(process.argv[2] ?? 60);
const base = Number(process.argv[3] ?? 8_100_000);
const plist = Object.values(PERSONAS) as Persona[];
let bad = 0, dupg = 0, g = 0;
const seen = new Set<string>();
for (let i = 0; i < N; i++) {
  const seed = base + i * 31;
  const rng = new Prng(seed);
  const mode: "hanchan" | "tonpuu" = i % 3 === 0 ? "tonpuu" : "hanchan";
  const personas = Object.fromEntries(SEATS.map((s) => [s, plist[rng.int(plist.length)]!])) as Record<PlayerId, Persona>;
  let last: Record<string, string[]> = {};
  const check = (st: GameState): void => {
    const snap: Record<string, string[]> = {};
    for (const p of st.players) snap[p.id] = [...p.augments];
    last = snap;
    const owner = new Map<string, string>();
    for (const [pid, ids] of Object.entries(snap)) {
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        if (conf(ids[a]!, ids[b]!)) {
          const k = `C ${ids[a]}+${ids[b]}`; if (seen.has(k)) continue; seen.add(k); bad++;
          console.log(`CONFLICT_HELD seed=${seed} ${mode} ${pid} ${ids[a]}+${ids[b]} held=[${ids.join(",")}]`);
        }
      }
      for (const id of ids) { const prev = owner.get(id); if (prev !== undefined) {
        const k = `D ${seed} ${id}`; if (seen.has(k)) continue; seen.add(k); dupg++;
        console.log(`DUP_GAME seed=${seed} ${mode} ${id} ${prev}+${pid}`);
      } else owner.set(id, pid); }
    }
  };
  try {
    const r = await runMatch({ seed, mode, preset: { p0:["cornucopia"], p1:[], p2:[], p3:[] } as never,
      personas, onState: check, timeoutMs: 120_000 });
    g++;
    if (r.crash !== undefined) console.log(`CRASH seed=${seed} ${r.crash.slice(0,160)}`);
    if (r.effectErrors.length > 0) console.log(`EFFERR seed=${seed} ${[...new Set(r.effectErrors)].slice(0,3).join(" | ")}`);
  } catch (e) { console.log(`THROW seed=${seed} ${String(e).slice(0,160)}`); }
  if ((i+1) % 20 === 0) console.log(`-- ${i+1} conflictHeld=${bad} dup=${dupg}`);
}
console.log(`games=${g} conflictHeld=${bad} dupInGame=${dupg}`);
