/**
 * 손패 조작·쯔모·템포 축 전수 소크 — 축 안의 **모든 2장 조합**을 좌석에 심고
 * 동풍전을 완주시켜 하네스 기본 불변식을 본다.
 *
 * p0 = A+B (조합), p1 = A 단독, p2 = B 단독, p3 = 없음 —
 * 같은 판 안에서 «단독 A / 단독 B / A+B» 세 조건이 동시에 굴러간다.
 *
 * 사용: tsx soak.ts [shardIndex] [shardCount]
 */
import { PERSONAS, byId, conflicting, runMatch } from "../../harness.js";
import type { PlayerId } from "@majak/core";

/** 담당 축 — catalog.tsv 에서 hand_edit|draw|tempo 태그가 붙은 전부 */
export const AXIS: string[] = [
  "take_back",
  "omni_chi",
  "tile_dyeing",
  "suit_unify",
  "hand_swap3",
  "full_hand_swap",
  "future_sight",
  "bottom_deal",
  "nagashi_yakuman",
  "alchemist",
  "time_stop",
  "haitei_lord",
  "dead_wall_master",
  "genesis",
  "table_flip",
  "always_tenpai",
  "even_world",
  "giant_god",
  "conjure_draw",
  "regret",
  "tile_split",
  "three_dragons_will",
  "hourglass",
  "time_pressure",
  "soul_strike",
  "picky_eater",
  "joker",
];

const STD = new Set([
  "discard",
  "pass",
  "riichi",
  "pon",
  "chi",
  "win",
  "minkan",
  "ankan",
  "shouminkan",
  "kyushuKyuhai",
]);

async function main(): Promise<void> {
  const shard = Number(process.argv[2] ?? 0);
  const shards = Number(process.argv[3] ?? 1);
  const pairs: [string, string][] = [];
  for (let i = 0; i < AXIS.length; i++) {
    for (let j = i + 1; j < AXIS.length; j++) {
      const a = AXIS[i] as string;
      const b = AXIS[j] as string;
      if (byId.get(a) === undefined || byId.get(b) === undefined) {
        console.log(`SKIP(unknown id) ${a}+${b}`);
        continue;
      }
      if (conflicting(a, b)) {
        console.log(`SKIP(conflicts) ${a}+${b}`);
        continue;
      }
      pairs.push([a, b]);
    }
  }
  let n = 0;
  for (const [a, b] of pairs) {
    if (n++ % shards !== shard) continue;
    for (const seed of [11, 23]) {
      const preset: Record<PlayerId, readonly string[]> = {
        p0: [a, b],
        p1: [a],
        p2: [b],
        p3: [],
      };
      const r = await runMatch({
        seed,
        mode: "tonpuu",
        preset,
        personas: {
          p0: PERSONAS.masher as never,
          p1: PERSONAS.masher as never,
          p2: PERSONAS.chaos as never,
          p3: PERSONAS.riichiRusher as never,
        },
        timeoutMs: 120_000,
      });
      const used = Object.entries(r.actionsTaken)
        .filter(([k]) => !STD.has(k))
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      const bad = [
        r.crash === undefined ? "" : `CRASH ${r.crash.split("\n")[0]}`,
        r.effectErrors.length > 0 ? `EFFECT ${r.effectErrors.slice(0, 2).join("|")}` : "",
        r.violations.length > 0
          ? `VIOL ${r.violations
              .slice(0, 3)
              .map((v) => `${v.kind}/${v.detail}`)
              .join("|")}`
          : "",
      ].filter((s) => s !== "");
      console.log(
        `${a}+${b} seed=${seed} rounds=${r.rounds} ${bad.length === 0 ? "clean" : "!! " + bad.join(" ;; ")}`,
      );
      if (bad.length > 0) console.log(`    액션: ${used}`);
    }
  }
}

void main();
