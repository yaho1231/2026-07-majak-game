/**
 * 실게임 소크 — 손패 조작 축의 위험 조합을 좌석에 강제로 심고 반장전을 완주시킨다.
 * 하네스 기본 불변식(패 중복·왕패 크기·손패 장수·소프트락·훅 예외)이 조합별로 잡히는지 본다.
 */
import { PERSONAS, runMatch } from "../../harness.js";
import type { PlayerId } from "@majak/core";

const PAIRS: [string, string][] = [
  ["frame_up", "silent_swap"],
  ["frame_up", "grave_rob"],
  ["frame_up", "bottom_yaku"],
  ["hourglass", "pond_snatch"],
  ["hourglass", "regret"],
  ["take_back", "silent_swap"],
  ["take_back", "conjure_draw"],
  ["tile_split", "alchemist"],
  ["suit_unify", "picky_eater"],
  ["joker", "suit_unify"],
  ["table_flip", "dead_wall_master"],
  ["full_hand_swap", "hand_swap3"],
  ["even_world", "tile_dyeing"],
  ["time_stop", "future_sight"],
  ["dead_wall_master", "hourglass"],
];

const seeds = [11, 23];

async function main(): Promise<void> {
  for (const [a, b] of PAIRS) {
    for (const seed of seeds) {
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
          p0: PERSONAS.masher!,
          p1: PERSONAS.masher!,
          p2: PERSONAS.chaos!,
          p3: PERSONAS.riichiRusher!,
        },
        timeoutMs: 120000,
      });
      const used = Object.entries(r.actionsTaken)
        .filter(([k]) => !["discard", "pass", "riichi", "pon", "chi", "win", "minkan", "ankan", "shouminkan", "kyushuKyuhai"].includes(k))
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      const bad = [
        r.crash ? `CRASH ${r.crash}` : "",
        r.effectErrors.length > 0 ? `EFFECT ${r.effectErrors.slice(0, 2).join("|")}` : "",
        r.violations.length > 0
          ? `VIOL ${r.violations.slice(0, 3).map((v) => `${v.kind}/${v.detail}`).join("|")}`
          : "",
      ].filter(Boolean);
      console.log(
        `${a}+${b} seed=${seed} rounds=${r.rounds} ${bad.length === 0 ? "clean" : "!! " + bad.join(" ;; ")}`,
      );
      if (used !== "") console.log(`    액션: ${used}`);
    }
  }
}

await main();
