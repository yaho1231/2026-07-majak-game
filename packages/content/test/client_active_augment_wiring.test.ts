/**
 * 클라이언트 액티브 증강 배선 가드 — 새 액티브 증강을 넣을 때 **레지스트리 한 곳을
 * 빠뜨리면 조용히 엉뚱한 자리에 뜨는** 사고를 막는다.
 *
 * 배경(2026-07-26): 밑장빼기(`bottom_deal`)를 넣으며 `ACTIVE_AUGMENT_IDS`·`ACTION_AUGMENT`·
 * `ACTION_LABEL`에는 등록했는데 **`AUGMENT_ACTION_TYPES`만 빠뜨렸다.** 이 집합은 분기점이라
 * 누락 하나로 정확히 "후로 줄(ActionBar)에는 뜨는데 액티브 증강 버튼에는 안 뜨는" 상태가 됐다.
 *   - `ActionBar`  : 이 집합에 있는 타입을 **제외**한다(치·펑·깡 줄에 안 뜬다)
 *   - `augOptions` : 이 집합에 있는 타입만 **포함**한다(액티브 증강 버튼에 뜬다)
 * 액션 타입이 문자열이고 레지스트리가 손으로 관리하는 집합이라 tsc가 못 잡는다.
 *
 * 정적 소스 스캔이다(클라를 렌더하지 않는다) — `bot_policy_coverage.test.ts`가 이미
 * 콘텐츠·코어 소스를 스캔하는 것과 같은 방식이고, 여기서는 클라 소스를 읽는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_TSX = join(HERE, "../../client/src/App.tsx");
const SRC = readFileSync(APP_TSX, "utf8");

/** `const NAME = new Set([... "a", "b" ...]);` 의 문자열 리터럴을 뽑는다 */
function setLiterals(name: string): Set<string> {
  const m = new RegExp(
    `const ${name} = new Set(?:<string>)?\\(\\[([\\s\\S]*?)^\\]\\);`,
    "m",
  ).exec(SRC);
  if (m === null) throw new Error(`${name} 선언을 못 찾았다 (형태가 바뀌었는가?)`);
  return new Set([...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!));
}

/** `const NAME: Record<string, T> = { key: "value", ... };` 를 뽑는다 */
function recordLiterals(name: string, valueType: string): Map<string, string> {
  const m = new RegExp(
    `const ${name}: Record<string, ${valueType}> = \\{([\\s\\S]*?)^\\};`,
    "m",
  ).exec(SRC);
  if (m === null) throw new Error(`${name} 선언을 못 찾았다 (형태가 바뀌었는가?)`);
  return new Map(
    [...m[1]!.matchAll(/(\w+):\s*"([^"]+)"/g)].map((x) => [x[1]!, x[2]!]),
  );
}

describe("클라이언트 액티브 증강 배선", () => {
  const augmentActionTypes = setLiterals("AUGMENT_ACTION_TYPES");
  const activeAugmentIds = setLiterals("ACTIVE_AUGMENT_IDS");
  const actionAugment = recordLiterals("ACTION_AUGMENT", "string");
  const actionLabel = recordLiterals("ACTION_LABEL", "string");
  const armMode = recordLiterals("ARM_MODE", "ArmMode");

  /** 정규식이 헛돌아 빈 집합으로 통과하는 것을 막는다 */
  it("레지스트리를 실제로 파싱했다", () => {
    expect(augmentActionTypes.size).toBeGreaterThan(30);
    expect(activeAugmentIds.size).toBeGreaterThan(30);
    expect(actionAugment.size).toBeGreaterThan(30);
    expect(armMode.size).toBeGreaterThan(5);
  });

  it("액티브 증강은 버튼으로든 클릭 발동으로든 반드시 입구가 있다", () => {
    const broken: string[] = [];
    for (const augmentId of [...activeAugmentIds].sort()) {
      const types = [...actionAugment.entries()]
        .filter(([, id]) => id === augmentId)
        .map(([type]) => type);
      if (types.length === 0) {
        broken.push(`${augmentId}: ACTION_AUGMENT에 액션 타입 매핑이 없다`);
        continue;
      }
      // 버튼형(AUGMENT_ACTION_TYPES)이거나 클릭 발동형(ARM_MODE)이어야 한다.
      // 둘 다 아니면 ActionBar가 치·펑·깡과 같은 줄에 일반 버튼으로 그려 버린다.
      const hasEntry = types.some(
        (t) => augmentActionTypes.has(t) || armMode.has(t),
      );
      if (!hasEntry) {
        broken.push(
          `${augmentId}: 액션 ${types.join("·")} 이 AUGMENT_ACTION_TYPES에도 ARM_MODE에도 없다` +
            " → 액티브 버튼에 안 뜨고 후로 줄에 샌다",
        );
      }
    }
    expect(broken).toEqual([]);
  });

  it("버튼형 액션 타입은 전부 사람이 읽는 라벨을 가진다", () => {
    // 라벨이 없으면 버튼에 원시 액션 타입 문자열이 그대로 노출된다.
    const missing = [...augmentActionTypes]
      .filter((t) => !actionLabel.has(t))
      .sort();
    expect(missing).toEqual([]);
  });

  it("밑장빼기가 네 레지스트리에 모두 배선돼 있다", () => {
    // 2026-07-26 회귀 케이스 자체를 못으로 박아 둔다.
    expect(activeAugmentIds.has("bottom_deal")).toBe(true);
    expect(augmentActionTypes.has("bottom_deal")).toBe(true);
    expect(actionAugment.get("bottom_deal")).toBe("bottom_deal");
    expect(actionLabel.get("bottom_deal")).toBe("밑장빼기");
    // 고를 payload가 없으므로 모달형이 아니다
    expect(setLiterals("MODAL_PICK_TYPES").has("bottom_deal")).toBe(false);
  });

  it("폐기된 도박사의 손 배선이 남아 있지 않다", () => {
    for (const s of [augmentActionTypes, activeAugmentIds, setLiterals("MODAL_PICK_TYPES")]) {
      expect(s.has("take_rinshan")).toBe(false);
      expect(s.has("rinshan_gamble")).toBe(false);
    }
    expect(actionAugment.has("take_rinshan")).toBe(false);
    expect(actionLabel.has("take_rinshan")).toBe(false);
  });
});
