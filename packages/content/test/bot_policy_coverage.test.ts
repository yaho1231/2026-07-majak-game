/**
 * 봇 액티브 증강 커버리지 — 봇이 **직접 골라야 하는 선택지를 내는** 증강은 전부
 * `bot` 정책을 갖거나, 봇이 판단할 수 없는 소수의 예외(BOT_SKIP)에 들어 있어야 한다.
 * 새 액티브 증강이 정책 없이 조용히 추가돼 봇이 영영 안 쓰는 일을 막는다.
 *
 * 선택지를 내는 경로는 둘이다:
 *   - `holderTurnOptions` — 내 턴의 추가 액션 (대부분의 액티브)
 *   - `registerReactionOptions` — 남의 버림에 대한 커스텀 콜 (우는 국사·허장성세·묵계)
 * 2026-07-26까지 두 번째 경로가 스캔에서 빠져 있어, 커스텀 콜 증강 3종이 정책 없이
 * 통과하고 있었다(봇이 한 번도 울지 않았다).
 *
 * 정적 소스 스캔이다(엔진을 돌리지 않는다) — install 본문의 옵션 등록·bot 존재만 본다.
 * 콘텐츠 증강뿐 아니라 **코어 표준 증강**(standardAugments.ts)도 함께 본다.
 * 배경: 2026-07-25, 봇이 액티브 증강을 잘 안 쓰던 문제를 고치며 도입.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOT_UNUSABLE_AUGMENTS } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUGMENTS_DIR = join(HERE, "../src/augments");
const CORE_STANDARD = join(HERE, "../../core/src/augment/standardAugments.ts");

/**
 * 봇 정책을 일부러 두지 않는 액티브 증강 — 목록은 콘텐츠 소스가 단일 진실이다
 * (`botHelpers.BOT_UNUSABLE_AUGMENTS`). 같은 목록을 BotAgent가 드래프트 후순위로도 쓴다.
 * 각 파일에는 "봇 정책 없음 — 이유" 주석이 있어야 한다.
 */
const BOT_SKIP = new Set(BOT_UNUSABLE_AUGMENTS);

/** 액티브 판정 — 봇에게 선택지가 제시되는 등록 경로 */
const OPTION_HOOKS = ["holderTurnOptions", "registerReactionOptions"];

/**
 * 정책은 두 모양 중 하나다 — 손수 쓴 `bot: { choose }` 또는 의도 선언
 * `bot: plan({ intent, pick })`. 후자는 타이밍·강도를 공용 planner가 맡는다.
 */
const hasBotPolicy = (src: string): boolean => /\n\s*bot:\s*(\{|plan\()/.test(src);

function augmentFiles(): string[] {
  return readdirSync(AUGMENTS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "botHelpers.ts");
}

describe("봇 액티브 증강 커버리지", () => {
  it("선택지를 내는 증강은 bot 정책이 있거나 문서화된 예외여야 한다", () => {
    const missing: string[] = [];
    for (const file of augmentFiles()) {
      const src = readFileSync(join(AUGMENTS_DIR, file), "utf8");
      if (!OPTION_HOOKS.some((h) => src.includes(h))) continue; // 액티브가 아님
      const id = file.replace(/\.ts$/, "");
      if (!hasBotPolicy(src) && !BOT_SKIP.has(id)) missing.push(id);
    }
    expect(missing, `bot 정책이 없는 액티브 증강: ${missing.join(", ")}`).toEqual([]);
  });

  it("코어 표준 증강도 액티브면 정책을 갖는다", () => {
    const src = readFileSync(CORE_STANDARD, "utf8");
    // 표준 증강 중 액티브는 회수(discard_recall) 하나뿐이다 — 파일 단위로 검사한다.
    if (OPTION_HOOKS.some((h) => src.includes(h))) {
      expect(hasBotPolicy(src), "standardAugments.ts: 액티브인데 bot 정책 없음").toBe(true);
    }
  });

  it("BOT_SKIP 예외는 실제 파일이고 사유 주석을 단다", () => {
    const files = new Set(augmentFiles().map((f) => f.replace(/\.ts$/, "")));
    for (const id of BOT_SKIP) {
      expect(files.has(id), `BOT_SKIP의 낡은 항목: ${id}`).toBe(true);
      const src = readFileSync(join(AUGMENTS_DIR, `${id}.ts`), "utf8");
      expect(src.includes("봇 정책 없음"), `${id}: 사유 주석 누락`).toBe(true);
      expect(hasBotPolicy(src), `${id}: 예외인데 bot 정책이 있다`).toBe(false);
    }
  });
});
