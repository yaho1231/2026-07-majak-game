/**
 * 공용 헬퍼 사용 계약 — 소스 스캔 (docs/25 §1).
 *
 * 이번 감사 결함의 절반이 "한 파일에서 고쳤는데 형제 파일에 안 퍼진 사본"이었다.
 * 헬퍼를 만드는 것만으로는 부족하고, 안 쓰면 잡히게 해야 재발이 멈춘다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AUG_DIR = fileURLToPath(new URL("../src/augments/", import.meta.url));
const files = readdirSync(AUG_DIR).filter((f) => f.endsWith(".ts"));
const read = (f: string): string => readFileSync(AUG_DIR + f, "utf8");

describe("widenPeek 계약 (docs/25 P7)", () => {
  /**
   * 같은 가시성 규칙에 여러 증강이 모디파이어를 걸면, 각자 `cur`를 무시하고 덮을 때
   * 최종 열람 범위가 **드래프트 픽 순서로 갈린다**. 실제로 rinshan_preview가
   * `{ mode:"peek", count:1 }`을 그대로 돌려줘서, 왕패를 더 넓게 여는 증강
   * (왕패의 주인 14장·이면투시 전체 공개)을 1장으로 좁혀 버렸다.
   */
  /**
   * 예외: **가리는**(narrowing) 모디파이어. 남에게서 정보를 빼앗는 것이 능력이라
   * "더 넓은 쪽을 남긴다"는 widenPeek의 의미가 반대로 적용된다. 이들은 대신
   * cur를 직접 비교해 이미 더 좁게 가려진 것을 넓히지 않는지 스스로 확인한다.
   */
  const NARROWING = new Set(["hidden_river.ts", "brief_fog.ts"]);

  it("정보를 여는 visibility.* 모디파이어는 widenPeek을 거친다", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f);
      if (!src.includes("addModifier<VisibilityRule>")) continue;
      if (NARROWING.has(f)) continue;
      // `return { mode: "peek" ... }` 형태로 cur를 무시하고 덮는 곳
      if (/return\s*\{\s*mode:\s*"peek"/.test(src)) offenders.push(f);
    }
    expect(offenders, "widenPeek 없이 peek을 덮어쓰는 증강").toEqual([]);
  });

  // 참고: brief_fog는 비보유자에게 무조건 "count_only"를 돌려줘 **피해자가 자기 바닥도
  // 못 보는** 별개 결함이 있다(docs/25 정보 계열 #2, 미해결). 그 수정은 owner 면제를
  // 다루는 별도 작업이라 여기서 계약으로 강제하지 않는다.
});

describe("숨은 리치 인지 계약 (docs/25 P3)", () => {
  /**
   * 리치 중인 **상대**를 대상에서 빼는 증강은 원시 `byPlayer[target].riichi`를
   * 보면 안 된다 — 스텔스 리치를 건 사람만 후보에서 조용히 사라져, 그 빈자리가
   * 곧 "저 사람이 리치다"가 된다. riichiBlocksSwap/riichiHidden을 거쳐야 한다.
   *
   * 자기 자신의 리치를 보는 것은 무해하다(본인은 이미 안다).
   */
  const SELF_READ = /byPlayer\[(?:req\.player|player|holder|h|me|p\.id|winner)\]/;

  it("손 교환 3종은 대상 판정에 riichiBlocksSwap을 쓴다", () => {
    for (const f of ["hand_swap3.ts", "full_hand_swap.ts", "seat_swap.ts"]) {
      const src = read(f);
      expect(src, `${f}: riichiBlocksSwap 미사용`).toContain("riichiBlocksSwap");
      // 대상(target)에 대한 원시 riichi 조회가 남아 있으면 안 된다
      const rawTargetReads = (src.match(/byPlayer\[target[^\]]*\]\??\.riichi/g) ?? []).filter(
        (m) => !SELF_READ.test(m),
      );
      expect(rawTargetReads, `${f}: 대상의 원시 riichi 조회`).toEqual([]);
    }
  });
});
