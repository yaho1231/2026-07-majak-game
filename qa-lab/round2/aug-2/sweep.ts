/** aug-2 광역 스위프 — 담당 28증강, 좌석1/좌석2 보유, 페르소나 혼합 */
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";

const MINE = `eternal_dealer even_world foresight frame_up free_riichi_discard full_hand_swap future_sight genesis giant_god grave_rob haitei_lord hand_swap3 hidden_blade hidden_river honba_hunter honor_return hourglass invincible jackpot joker karma last_stand late_bloomer late_bloomer_east late_double let_it_ride meld_dissolve mirror_dora mixed_nine_gates mixed_triplet`.split(/\s+/);

const plist = Object.values(PERSONAS) as Persona[];
const perAug = Number(process.argv[2] ?? 40);
const offset = Number(process.argv[3] ?? 0);
const only = process.argv[4];

let games = 0, crashes = 0, effs = 0, viols = 0;
const sel = (only ?? "").split(",").filter((x) => x !== "");
const augList = sel.length > 0 ? MINE.filter((a) => sel.includes(a)) : MINE;
for (const aug of augList) {
  for (let k = 0; k < perAug; k++) {
    const i = offset + k;
    const rng = new Prng((i + 1) * 2654435761 + aug.length * 7919);
    const mode = k % 4 === 0 ? "tonpuu" : "hanchan";
    const preset = assignPreset(rng, mode, [aug], 2);
    // 1/3 확률로 두 좌석이 같은 증강을 든다
    if (k % 3 === 1) (preset.p2 as string[])[0] = aug;
    // 1/4 확률로 담당 증강 2개 조합
    if (k % 4 === 2) (preset.p0 as string[])[1] = MINE[(k * 13 + aug.length) % MINE.length] as string;
    const personas = Object.fromEntries(SEATS.map((s) => [s, plist[rng.int(plist.length)] as Persona])) as Record<string, Persona>;
    const r = await runMatch({ seed: i * 7919 + 13, mode, preset, personas: personas as never, timeoutMs: 90_000 });
    games++;
    const tag = `aug=${aug} k=${k} seed=${i * 7919 + 13} mode=${mode}`;
    if (r.crash !== undefined) { crashes++; console.log(`CRASH ${tag}\n  preset=${JSON.stringify(r.preset)}\n  ${r.crash}`); }
    if (r.effectErrors.length > 0) { effs++; console.log(`EFFERR ${tag}\n  preset=${JSON.stringify(r.preset)}\n  ${r.effectErrors.slice(0, 4).join("\n  ")}`); }
    const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    if (bad.length > 0) { viols++; console.log(`VIOL ${tag}\n  preset=${JSON.stringify(r.preset)}\n  ${JSON.stringify(bad.slice(0, 6))}`); }
    if (games % 5 === 0) console.log(`.. ${games} games (crash=${crashes} eff=${effs} viol=${viols})`);
  }
  console.log(`-- done ${aug}: games=${games} crash=${crashes} eff=${effs} viol=${viols}`);
}
console.log(`DONE games=${games} crash=${crashes} eff=${effs} viol=${viols}`);
