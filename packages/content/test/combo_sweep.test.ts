/**
 * 조합 크래시 스위프 — **실제 게임 형태**로 반장전을 완주시킨다.
 *
 * # 왜 필요한가 (2026-07-29 감사)
 *
 * 기존 스위프 테스트들은 전부 "증강 **1개**를 **1명**에게 설치하고 **한 국**"이다.
 * 그런데 실제 게임은 **4인 × 각 2증강 × 반장전 8국**이다. 그 간극에 숨어 있던 크래시를
 * 이 하네스가 실제로 잡았다:
 *   - 누명(frame_up)으로 심은 패를 누가 울면 `moveTiles`가 던져 매치가 죽었다
 *     (정상 드래프트 반장전 40판 중 3판 사망).
 *   - 밥상 뒤엎기 × 무르기를 함께 보유하면 쯔모패가 손 밖을 가리켜 죽었다.
 * 둘 다 단일 증강 스위프로는 **구조적으로 도달할 수 없는** 조합이었다.
 *
 * # 범위
 *
 * 기본은 **위험군**(손패 장수·패산·바닥을 물리적으로 건드리는 증강)만 돌려 실행 시간을
 * 짧게 유지한다. 전수 스위프는 `MAJAK_FULL_SWEEP=1`로 켠다 — 104종 × 시드라 수 분이 걸린다.
 * 새 증강이 손패/패산/바닥을 옮긴다면 RISKY에 추가할 것.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_HANCHAN_CONFIG, HanchanController, Prng } from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  DraftStage,
  PlayerAgent,
  PlayerId,
  PlayerView,
} from "@majak/core";
import { contentAugments } from "../src/index.js";

/** 표준 액션 — 그 외는 증강이 낸 액티브 후보다 */
const STD = new Set([
  "discard",
  "riichi",
  "pon",
  "chi",
  "minkan",
  "ankan",
  "shouminkan",
  "pass",
  "kyushuKyuhai",
]);

/** 증강 액션을 적극적으로 눌러 발동 경로까지 밀어 넣는 결정론 봇 */
class SweepBot implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private readonly rng: Prng;
  constructor(readonly id: string, seed: number) {
    this.nickname = `B-${id}`;
    this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const win = prompt.options.find((o) => o.type === "win");
    if (win !== undefined) return win;
    const augs = prompt.options.filter((o) => !STD.has(o.type));
    if (augs.length > 0 && this.rng.int(3) === 0) {
      return augs[this.rng.int(augs.length)] as ActionOption;
    }
    return prompt.options[this.rng.int(prompt.options.length)] as ActionOption;
  }
  async decideDraft(_s: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[this.rng.int(choices.length)]!.id;
  }
}

const byId = new Map(contentAugments.map((d) => [d.id, d]));

/** 드래프트에서 애초에 같이 나올 수 없는 조합은 만들지 않는다 (관계는 대칭) */
function conflicting(a: string, b: string): boolean {
  return (
    (byId.get(a)?.conflicts ?? []).includes(b) ||
    (byId.get(b)?.conflicts ?? []).includes(a)
  );
}

function offerable(d: AugmentDef, mode: "hanchan" | "tonpuu"): boolean {
  return d.modes === undefined || d.modes.includes(mode);
}

/** 4석에 2개씩, 서로 겹치지 않고 conflicts도 피해 결정론적으로 배정 */
function assign(
  rng: Prng,
  mode: "hanchan" | "tonpuu",
  forced: string,
): Record<PlayerId, string[]> {
  const pool = contentAugments
    .filter((d) => offerable(d, mode))
    .map((d) => d.id)
    .filter((id) => id !== forced);
  const out: Record<PlayerId, string[]> = { p0: [forced], p1: [], p2: [], p3: [] };
  const taken = new Set([forced]);
  for (const seat of ["p0", "p1", "p2", "p3"]) {
    const held = out[seat] as string[];
    while (held.length < 2 && pool.length > 0) {
      const id = pool.splice(rng.int(pool.length), 1)[0] as string;
      if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id);
      taken.add(id);
    }
  }
  return out;
}

async function runGame(
  seed: number,
  mode: "hanchan" | "tonpuu",
  preset: Record<PlayerId, string[]>,
): Promise<void> {
  const agents = ["p0", "p1", "p2", "p3"].map(
    (id, i) => new SweepBot(id, seed * 31 + i),
  );
  const ranks = await new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: preset,
  }).run();
  expect(ranks.length).toBe(4);
}

/**
 * 위험군 — 손패 장수·패산·왕패·바닥을 **물리적으로** 옮기거나 화료형 자체를 바꾸는 증강.
 * 이 부류가 서로 겹칠 때가 크래시·소프트락이 나오는 자리다.
 */
const RISKY = [
  "frame_up",
  "table_flip",
  "take_back",
  "full_hand_swap",
  "hand_swap3",
  "seat_swap",
  "true_dragon",
  "even_world",
  "genesis",
  "giant_god",
  "conjure_draw",
  "honor_return",
  "regret",
  "tile_split",
  "pond_snatch",
  "grave_rob",
  "meld_dissolve",
  "north_trader",
  "hourglass",
  "open_kokushi",
  "void_kan",
  "cliff_bloom",
  "dead_wall_master",
  "bottom_deal",
  "rinshan_preview",
  "free_riichi_discard",
  "snake_kan",
];

const FULL = process.env["MAJAK_FULL_SWEEP"] === "1";
const TARGETS = FULL ? contentAugments.map((d) => d.id) : RISKY;
const SEEDS = FULL ? [1, 2, 3, 4, 5, 6] : [4, 16];

describe("조합 크래시 스위프 — 4인 × 2증강 실전 반장전", () => {
  const CHUNK = 14;
  for (let c = 0; c * CHUNK < TARGETS.length; c++) {
    const slice = TARGETS.slice(c * CHUNK, (c + 1) * CHUNK);
    it(
      `청크 ${c + 1}: ${slice[0]}..${slice[slice.length - 1]}`,
      async () => {
        const failures: string[] = [];
        for (const id of slice) {
          for (const seed of SEEDS) {
            const mode: "hanchan" | "tonpuu" = seed % 2 === 0 ? "hanchan" : "tonpuu";
            const def = byId.get(id);
            if (def !== undefined && !offerable(def, mode)) continue;
            const preset = assign(new Prng(seed ^ 0x9e3779b9), mode, id);
            try {
              await runGame(seed, mode, preset);
            } catch (e) {
              failures.push(
                `[${id}] seed=${seed} ${mode} preset=${JSON.stringify(preset)}\n  ` +
                  (e instanceof Error ? e.message : String(e)),
              );
            }
          }
        }
        if (failures.length > 0) console.error("\n\n" + failures.join("\n\n"));
        expect(failures).toEqual([]);
      },
      600_000,
    );
  }
});
