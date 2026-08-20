/**
 * 사전 지급(`presetAugments`)이 **같은 좌석의 상호 배제(conflicts)** 를 지키는가.
 *
 * 예전 `installPreset` 은 좌석·id 를 하나씩 `draftPick` → 즉시 `installAugment` 로 돌렸다.
 * 그래서 어떤 증강이 설치되는 시점에 같은 좌석의 **뒤쪽 preset 이 아직 상태에 없었고**,
 * 지급형 증강(수상한 주사위)의 후보 필터가 보는 `mine` 이 불완전했다 — `[cornucopia, X]`
 * 순서면 X 와 상호 배제인 증강이 그대로 지급됐다(120시드 중 17건. 순서를 뒤집으면 0건).
 * 중복 쪽은 `reservedAugmentIds` 로 닫혔지만 예약 목록은 "그 id 자신"만 막는다.
 * (2026-08-20 QA disrupt 확정 3. 서버 샌드박스·튜토리얼이 이 경로를 쓴다.)
 *
 * 여기서는 코어만으로 두 계약을 못 박는다:
 *  1. preset 이 **뒤쪽 id 까지 미리** 상태에 올라간 뒤에 설치된다 (지급형이 완전한 `mine` 을 본다).
 *  2. preset **자기들끼리** 상호 배제인 조합은 뒤엣것을 지급하지 않는다.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "../src/match/HanchanController.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import type { PlayerView } from "../src/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { DraftStage } from "../src/network/protocol.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

class Silent implements PlayerAgent {
  readonly isBot = true;
  nickname: string;
  constructor(readonly id: PlayerId) {
    this.nickname = id;
  }
  sendView(_v: PlayerView): void {
    /* noop */
  }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const pass = p.options.find((o) => o.type === "pass");
    if (pass !== undefined) return pass;
    const d = p.options.find((o) => o.type === "discard");
    return d ?? p.options[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> {
    return c[0]!.id;
  }
}

/** 아무 일도 하지 않는 더미 증강 */
function dummy(id: string, conflicts?: string[]): AugmentDef {
  return {
    id,
    tier: "prism",
    category: "scoring",
    name: id,
    description: id,
    detail: id,
    ...(conflicts !== undefined ? { conflicts } : {}),
    install: () => undefined,
  } as AugmentDef;
}

/**
 * 설치 시점에 **자기 좌석이 이미 들고 있는 증강 목록**을 기록하는 탐침 증강.
 * 지급형 증강(수상한 주사위)이 `mine` 으로 보는 것과 같은 값이다.
 */
function probe(id: string, sink: string[][]): AugmentDef {
  return {
    id,
    tier: "prism",
    category: "scoring",
    name: id,
    description: id,
    detail: id,
    install: (ctx) => {
      const mine =
        ctx.engine.state.players.find((p) => p.id === ctx.holder)?.augments ?? [];
      sink.push([...mine]);
    },
  } as AugmentDef;
}

/** 배패 직전까지만 세우고 좌석별 보유 증강을 읽는다 (국은 치지 않는다). */
async function heldAfterPreset(
  extras: AugmentDef[],
  preset: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const agents = SEATS.map((id) => new Silent(id));
  let snap: Record<string, string[]> = {};
  const ctrl = new HanchanController(
    agents,
    {
      ...DEFAULT_HANCHAN_CONFIG,
      mode: "tonpuu",
      seed: 7,
      maxWind: 1,
      westEntry: false,
      draftSchedules: [],
      extraAugments: extras,
      presetAugments: preset,
      agentDecideTimeoutMs: 20_000,
    },
    {
      onRoundStart: (g) => {
        snap = Object.fromEntries(
          g.engine.state.players.map((p) => [p.id, [...p.augments]]),
        );
        ctrl.requestAbort();
      },
    },
  );
  await ctrl.run().catch(() => {
    /* abort */
  });
  return snap;
}

describe("사전 지급 × 상호 배제", () => {
  it("설치는 전 좌석의 draftPick 이 끝난 **뒤에** 돈다 — 지급형이 완전한 mine 을 본다", async () => {
    const seen: string[][] = [];
    const extras = [probe("__probe_a", seen), dummy("__probe_b")];
    const held = await heldAfterPreset(extras, { p3: ["__probe_a", "__probe_b"] });
    expect(held["p3"]).toEqual(["__probe_a", "__probe_b"]);
    // 탐침이 설치되는 순간, 같은 좌석의 **뒤쪽** preset 이 이미 상태에 있어야 한다.
    // 예전 순차 설치에서는 여기가 ["__probe_a"] 였다.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(["__probe_a", "__probe_b"]);
  });

  it("preset 끼리 상호 배제면 뒤엣것을 지급하지 않는다", async () => {
    const extras = [dummy("__clash_a"), dummy("__clash_b", ["__clash_a"])];
    const held = await heldAfterPreset(extras, { p2: ["__clash_a", "__clash_b"] });
    expect(held["p2"]).toEqual(["__clash_a"]);
  });

  it("관계는 대칭이다 — 순서를 뒤집어도 하나만 남는다", async () => {
    const extras = [dummy("__clash_a"), dummy("__clash_b", ["__clash_a"])];
    const held = await heldAfterPreset(extras, { p2: ["__clash_b", "__clash_a"] });
    expect(held["p2"]).toEqual(["__clash_b"]);
  });

  it("상호 배제가 없으면 preset 은 그대로 다 들어간다 (회귀 방지)", async () => {
    const extras = [dummy("__fine_a"), dummy("__fine_b")];
    const held = await heldAfterPreset(extras, { p1: ["__fine_a", "__fine_b"] });
    expect(held["p1"]).toEqual(["__fine_a", "__fine_b"]);
  });
});
