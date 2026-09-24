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

  it("가지치기는 조합 목록 모달이 아니라 실제 손패 3장 클릭(hand3)으로 고른다", () => {
    // 2026-09-24 사용자 지시: 3장 조합(최대 364개)을 버튼으로 늘어놓지 않는다.
    expect(armMode.get("pruning_swap")).toBe("hand3");
    expect(setLiterals("MODAL_PICK_TYPES").has("pruning_swap")).toBe(false);
    expect(actionAugment.get("pruning_swap")).toBe("pruning");
    expect(activeAugmentIds.has("pruning")).toBe(true);
    // 손패 클릭은 제출이 아니라 선택 토글이고, 제출은 [확인] 버튼이 한다
    expect(SRC).toMatch(/if \(hand3Picking\) \{\s*toggleHandPick\(id\);/);
    expect(SRC).toMatch(/if \(hand3Option !== undefined\) sel\.submit\(hand3Option\)/);
  });

  it("이면투시 바꿔치기·붉은 손길은 모달이 아니라 실제 손패 클릭(hand)으로 고른다", () => {
    // 2026-09-25 docs/59 U01·U02 — 판에 보이는 내 손패를 모달에 다시 그리지 않는다(§2 원칙 2)
    expect(armMode.get("ura_swap")).toBe("hand");
    expect(armMode.get("red_touch")).toBe("hand");
    const modal = setLiterals("MODAL_PICK_TYPES");
    expect(modal.has("ura_swap")).toBe(false);
    expect(modal.has("red_touch")).toBe(false);
    // 옛 모달 JSX가 죽은 코드로 남지 않는다
    expect(SRC).not.toContain('pickModal === "ura_swap"');
    expect(SRC).not.toContain('pickModal === "red_touch"');
    // 서버 payload는 그대로 — 두 액션은 여전히 액티브 메뉴 입구를 가진다
    expect(augmentActionTypes.has("ura_swap")).toBe(true);
    expect(augmentActionTypes.has("red_touch")).toBe(true);
  });

  it("종류 지목형(스파이·소환)은 같은 종류의 어느 장을 눌러도 대표 옵션을 낸다", () => {
    // docs/59 U17 — 서버가 종류마다 첫 장만 후보로 내서 둘째 장이 어두워지고 무장이 풀렸다
    const kindTarget = new Set(ids(setLiterals("KIND_TARGET_ARM_TYPES")));
    expect([...kindTarget].sort()).toEqual(["conjure_tsumo", "spy_mark"]);
    for (const t of kindTarget) expect(armMode.get(t)).toBe("hand");
  });

  it("되돌릴 수 없는 손패 무장은 «두 번 눌러 확정» 게이트를 탄다", () => {
    // docs/59 U01 — 국당 1회인 이면투시 바꿔치기는 증강 리치와 같은 게이트
    expect(ids(setLiterals("ARM_CONFIRM_TYPES"))).toContain("ura_swap");
    // docs/59 U16 (B06) — 후보 한 장이면 누르는 순간 확정되는 손패 무장 전부. 누명은 1단계가
    // 고르기일 뿐이라 빠지고, 증강 리치는 DRAG_DISCARD 쪽으로 이미 걸린다.
    const confirm = ids(setLiterals("ARM_CONFIRM_TYPES"));
    // B07(docs/59 U03) — 미래를 보는 자의 버릴 패도 누르는 순간 바닥으로 나가 같은 게이트를 탄다
    expect(confirm).toEqual(
      [
        "alchemy",
        "conjure_tsumo",
        "future_exchange",
        "joker_call",
        "peek_forge",
        "split_tile",
        "spy_mark",
        "tile_dye",
        "ura_swap",
      ],
    );
    for (const t of confirm) expect(armMode.get(t), t).toBe("hand");
    expect(confirm).not.toContain("frame_discard");
    expect(SRC).toContain(
      "(DRAG_DISCARD_ARM_TYPES.has(armedAug) || ARM_CONFIRM_TYPES.has(armedAug)) &&",
    );
  });

  /*
   * 2026-09-25 (docs/59 U62·U11): 버튼형(AUGMENT_ACTION_TYPES)만 라벨을 검사하면, 새 무장형
   * 액션을 ARM_MODE에만 넣고 이름을 빠뜨렸을 때 «입구» 검사는 armMode.has로 통과하고
   * 라벨 검사는 놓친다 — 그러면 무장 안내가 «frame_discard: …»처럼 내부 id로 선다.
   * setLiterals는 주석 속 따옴표 문자열까지 줍기 때문에 식별자 모양만 남긴다.
   */
  const ids = (xs: Iterable<string>): string[] =>
    [...xs].filter((x) => /^[a-z0-9_]+$/.test(x)).sort();

  it("무장형·모달형·증강 리치 액션도 전부 사람이 읽는 라벨을 가진다", () => {
    const pools = [
      ids(armMode.keys()),
      ids(setLiterals("MODAL_PICK_TYPES")),
      ids(setLiterals("DRAG_DISCARD_ARM_TYPES")),
    ];
    // 파서가 헛돌아 빈 목록으로 통과하는 것을 막는다. 모달형은 docs/59 배치들이 실물 클릭으로 옮기며
    // 줄었다 — B13(2026-09-25)이 왕패의 주인을 빼 단색 세계·편식·영상 정찰 셋이 남는다
    for (const pool of pools) expect(pool.length).toBeGreaterThan(2);
    const missing = pools.flat().filter((t) => !actionLabel.has(t));
    expect(missing).toEqual([]);
  });

  it("무장형과 모달형은 겹치지 않는다 — 무장이 먼저 가로채 모달이 죽은 코드가 된다", () => {
    // activate()는 ARM_MODE를 MODAL_PICK_TYPES보다 먼저 본다. 둘 다 등록하면 모달은
    // 영영 안 열리고, 그 안의 옛 안내만 코드에 남는다(정적의 손 모달이 그렇게 남았었다).
    const modal = new Set(ids(setLiterals("MODAL_PICK_TYPES")));
    expect(ids(armMode.keys()).filter((t) => modal.has(t))).toEqual([]);
    expect(SRC).not.toContain('pickModal === "silent_take"');
  });

  it("무장해제·재장전은 이름표 pill을 누르는 무장이다 — 2단계 글자 목록으로 새지 않는다", () => {
    // 2026-09-25 (docs/59 U24·U32): ARM_MODE에 없으면 activate()가 옵션 여럿일 때 ✦ 메뉴 2단계의
    // «봇1의 ○○» 텍스트 버튼(무장해제 최대 12개)으로 떨어진다. opp로 두면 target만 보고 첫 옵션을 집는다.
    expect(armMode.get("disarm_lock")).toBe("opp-aug");
    expect(armMode.get("reload_use")).toBe("own-aug");
  });

  it("파혼은 판의 내 후로를 누르는 무장이다 — 후로 수만큼 똑같은 «파혼» 줄로 새지 않는다", () => {
    // 2026-09-25 (docs/59 U31): 후보가 {meldIndex}뿐이라 ARM_MODE에 없으면 후로가 둘 이상일 때
    // 2단계에 구별할 수 없는 «파혼» 버튼만 N개 섰고, 하나면 ✦를 누르는 즉시 되돌릴 수 없이 해체됐다.
    expect(armMode.get("dissolve_meld")).toBe("own-meld");
  });

  it("ARM_MODE 값은 전부 실제 쓰이는 ArmMode다 — 아무도 안 쓰는 무장 방식이 남지 않는다", () => {
    // 2026-09-25 (docs/59 U11): ArmMode "swap3"(상대 → 내 3장)는 ARM_MODE.swap3가 "opp"로 바뀐
    // 뒤 아무 액션도 쓰지 않았는데, useSelection·OwnArea·armHint에 분기와 안내 줄이 그대로 남아
    // 어느 경로가 실제로 도는지 헷갈리게 했다. 값 ⊆ 유니언, 유니언 ⊆ 값 둘 다 본다.
    const m = /^type ArmMode = ([^;]+);/m.exec(SRC);
    if (m === null) throw new Error("ArmMode 선언을 못 찾았다 (형태가 바뀌었는가?)");
    const union = new Set([...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!));
    expect(union.size).toBeGreaterThan(3);
    const used = new Set(armMode.values());
    expect([...used].filter((v) => !union.has(v))).toEqual([]);
    expect([...union].filter((v) => !used.has(v))).toEqual([]);
    expect(union.has("swap3")).toBe(false);
  });

  it("핏빛 계약이 고르게 하는 역은 전부 한글 역 이름이 있다", () => {
    // 없으면 선택지 라벨이 비고(optionDetail은 원문 키 대신 생략한다) 버튼만 남는다
    const bc = readFileSync(join(HERE, "../src/augments/blood_contract.ts"), "utf8");
    const m = /const CONTRACT_YAKU = \[([\s\S]*?)\] as const;/.exec(bc);
    if (m === null) throw new Error("CONTRACT_YAKU 선언을 못 찾았다 (형태가 바뀌었는가?)");
    const contract = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
    expect(contract.length).toBeGreaterThan(5);
    const yakuNames = recordLiterals("YAKU_NAMES", "string");
    expect(contract.filter((y) => !yakuNames.has(y))).toEqual([]);
  });

  /*
   * 2026-09-25 (docs/59 U41): 위의 «입구» 검사는 ACTIVE_AUGMENT_IDS → 액션 방향만 본다.
   * 반전(sign_flip)이 2026-09-01 액티브로 바뀌며 액션 쪽 세 레지스트리에는 들어갔는데
   * ACTIVE_AUGMENT_IDS만 빠져, 첫 순에만 ✦ 버튼이 불쑥 섰고 ✦ 배지·쿨다운 사유가 없었다.
   * 반대 방향 — 입구가 있는 액션의 증강은 전부 액티브 목록에 있다 — 을 함께 본다.
   */
  it("입구(버튼·무장·모달)가 있는 액션의 증강은 전부 ACTIVE_AUGMENT_IDS에 있다", () => {
    const entries = new Set([
      ...ids(augmentActionTypes),
      ...ids(armMode.keys()),
      ...ids(setLiterals("MODAL_PICK_TYPES")),
    ]);
    const missing: string[] = [];
    for (const t of [...entries].sort()) {
      const aug = actionAugment.get(t);
      if (aug === undefined) continue; // 주석 속 따옴표 문자열 등 — 액션이 아니다
      if (!activeAugmentIds.has(aug)) missing.push(`${t} → ${aug}`);
    }
    expect(missing).toEqual([]);
    expect(activeAugmentIds.has("sign_flip")).toBe(true);
  });

  it("한 증강이 액션을 둘 이상 내면 전부 행동 부제(ACTION_VERB)를 가진다", () => {
    // docs/59 U38 — 이름은 증강 이름 하나라 이면투시 확인·바꿔치기, 선언 간파 간파·위조가
    // 메뉴 줄에서 같은 이름으로 섰다. 동사가 빠지면 두 줄을 구별할 수 없다.
    const verb = recordLiterals("ACTION_VERB", "string");
    expect(verb.size).toBeGreaterThan(10);
    const byAug = new Map<string, string[]>();
    for (const [t, aug] of actionAugment) byAug.set(aug, [...(byAug.get(aug) ?? []), t]);
    const missing = [...byAug.values()]
      .filter((ts) => ts.length > 1)
      .flat()
      .filter((t) => !verb.has(t))
      .sort();
    expect(missing).toEqual([]);
    // 동사 표에 레지스트리에 없는 액션(오타)이 남지 않는다
    expect([...verb.keys()].filter((t) => !actionAugment.has(t))).toEqual([]);
    expect(verb.get("cancel_riichi")).toBe("리치 취소");
    expect(verb.get("ura_swap")).toBe("뒷도라 바꿔치기");
  });

  it("첫 순 한정 표(FIRST_TURN_ONLY_TYPES)는 실제 액티브 액션만 담는다", () => {
    // docs/59 U40 — 오타가 나면 배지가 조용히 안 붙는다
    const first = ids(setLiterals("FIRST_TURN_ONLY_TYPES"));
    expect(first.length).toBeGreaterThanOrEqual(14);
    expect(first.filter((t) => !actionAugment.has(t))).toEqual([]);
    expect(first).toContain("sign_flip_use");
    expect(first).toContain("blood_contract_declare");
  });

  it("핏빛 계약의 역마다 한 줄 정의가 있다", () => {
    // docs/59 U39 — 격자 칸에 역 이름만 서지 않게. 역 id는 content CONTRACT_YAKU와 같아야 한다
    const bc = readFileSync(join(HERE, "../src/augments/blood_contract.ts"), "utf8");
    const m = /const CONTRACT_YAKU = \[([\s\S]*?)\] as const;/.exec(bc);
    if (m === null) throw new Error("CONTRACT_YAKU 선언을 못 찾았다 (형태가 바뀌었는가?)");
    const contract = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!).sort();
    const note = recordLiterals("CONTRACT_YAKU_NOTE", "string");
    expect([...note.keys()].sort()).toEqual(contract);
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
