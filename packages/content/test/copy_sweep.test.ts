/**
 * 카피 실전 스위프 — 복사 가능한 증강 **전부**를 실제 게임 흐름에서 한 번씩 빌려 써 본다.
 *
 * p0는 카피, p1은 복사 가능한 증강 하나만 든다(후보가 하나라 무작위가 그것을 고른다).
 * p0 봇은 카피가 뜨면 곧바로 p1을 지목하고, 빌린 증강의 버튼이 뜨면 우선 누른다.
 * 빌려 온 증강이 원래 주인과 동시에 살아 있는 채로 국이 돌고, 국 끝에 걷히는 전 과정에서
 * 매치가 죽지 않아야 한다 — 단위 테스트(`copy.test.ts`)로는 닿지 않는 흐름(프롬프트·
 * 리액션·정산·다음 국 배패)을 여기서 본다.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_HANCHAN_CONFIG, HanchanController, Prng } from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  DraftStage,
  PlayerAgent,
  PlayerView,
} from "@majak/core";
import { contentAugments } from "../src/index.js";
import { COPYABLE } from "../src/augments/copy.js";

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

class CopyBot implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private readonly rng: Prng;
  copied = false;
  used = 0;
  constructor(readonly id: string, seed: number) {
    this.nickname = `B-${id}`;
    this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const win = prompt.options.find((o) => o.type === "win");
    if (win !== undefined) return win;
    const take = prompt.options.find(
      (o) => o.type === "copy_take" && (o.payload as { target?: string }).target === "p1",
    );
    if (take !== undefined) {
      this.copied = true;
      return take;
    }
    const augs = prompt.options.filter((o) => !STD.has(o.type) && o.type !== "copy_take");
    if (this.id === "p0" && this.copied && augs.length > 0) {
      this.used++;
      return augs[this.rng.int(augs.length)] as ActionOption;
    }
    const std = prompt.options.filter((o) => STD.has(o.type));
    const pool = std.length > 0 ? std : prompt.options;
    return pool[this.rng.int(pool.length)] as ActionOption;
  }
  async decideDraft(_s: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[this.rng.int(choices.length)]!.id;
  }
}

const IDS = [...COPYABLE].sort();

describe("카피 — 복사 가능한 증강 전부를 실전에서 빌려 쓴다", () => {
  const CHUNK = 15;
  for (let c = 0; c * CHUNK < IDS.length; c++) {
    const slice = IDS.slice(c * CHUNK, (c + 1) * CHUNK);
    it(
      `청크 ${c + 1}: ${slice[0]}..${slice[slice.length - 1]}`,
      async () => {
        const failures: string[] = [];
        let copiedGames = 0;
        let usedGames = 0;
        for (const [i, id] of slice.entries()) {
          const seed = 7 + i + c * CHUNK;
          // 동풍전 — 카피 1회를 쓰고 국 경계를 여러 번 넘기에 충분하다 (반장전은 시간만 두 배)
          const mode = "tonpuu";
          const agents = ["p0", "p1", "p2", "p3"].map((p, k) => new CopyBot(p, seed * 31 + k));
          try {
            const ranks = await new HanchanController(agents, {
              ...DEFAULT_HANCHAN_CONFIG,
              mode,
              seed,
              maxWind: 1,
              westEntry: false,
              draftSchedules: [],
              extraAugments: contentAugments,
              presetAugments: { p0: ["copy"], p1: [id], p2: [], p3: [] },
            }).run();
            expect(ranks.length).toBe(4);
            if (agents[0]!.copied) copiedGames++;
            if (agents[0]!.used > 0) usedGames++;
          } catch (e) {
            failures.push(`[${id}] seed=${seed} ${mode}: ${e instanceof Error ? e.stack : e}`);
          }
        }
        if (failures.length > 0) console.error("\n\n" + failures.join("\n\n"));
        expect(failures).toEqual([]);
        // 모든 판에서 실제로 빌려 왔고, 대부분은 빌린 버튼까지 눌렀다 (스위프가 헛돌지 않았다).
        // «국의 첫 순에만» 같은 조건에 막혀 못 누르는 증강이 있어 전부일 수는 없다.
        expect(copiedGames).toBe(slice.length);
        expect(usedGames).toBeGreaterThanOrEqual(Math.floor(slice.length / 2));
      },
      600_000,
    );
  }
});
