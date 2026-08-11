/**
 * 오름패 남은 장수 세기 회귀 테스트.
 *
 * 핵심 회귀 포인트는 **증강 생성패 제외**다 — 생성패를 진짜 패로 세면 아직 남아 있는
 * 대기를 "0장(못 난다)"으로 그리게 되고, 화면이 거짓말을 한다.
 */

import { describe, expect, it } from "vitest";
import type { TileKind } from "@majak/core";
import { remainingCounter, seenKindCounts } from "../src/waitCounts.js";
import type { RemainingSource } from "../src/waitCounts.js";

const M = (rank: number): TileKind => ({ suit: "man", rank });
const P = (rank: number): TileKind => ({ suit: "pin", rank });

type Spec = { kind: TileKind; conjured?: boolean };

/** id를 붙여 가며 뷰 조각을 만드는 소도구. */
function build(spec: {
  hand?: Spec[];
  discards?: Record<string, Spec[]>;
  melds?: Record<string, Spec[]>;
  dora?: Spec[];
  players?: string[];
  me?: string;
  /** 세면 안 되는 것을 일부러 끼워 넣는 자리 (남의 손패·뒷면 자리표) */
  extraZones?: Record<string, number[]>;
  extraTiles?: Record<number, TileKind>;
}): { src: RemainingSource; me: string } {
  const me = spec.me ?? "p0";
  const players = spec.players ?? ["p0", "p1", "p2", "p3"];
  const tiles: Record<number, { kind: TileKind; attrs?: { conjured?: boolean } }> = {};
  const zones: Record<string, { tileIds: number[] }> = {};
  let next = 1;
  const add = (t: Spec): number => {
    const id = next++;
    tiles[id] = t.conjured === true ? { kind: t.kind, attrs: { conjured: true } } : { kind: t.kind };
    return id;
  };
  const put = (zoneId: string, list: Spec[]): void => {
    zones[zoneId] = { tileIds: list.map(add) };
  };
  put(`hand:${me}`, spec.hand ?? []);
  for (const p of players) {
    put(`discards:${p}`, spec.discards?.[p] ?? []);
    put(`melds:${p}`, spec.melds?.[p] ?? []);
  }
  const doraIds = (spec.dora ?? []).map(add);
  for (const [id, kind] of Object.entries(spec.extraTiles ?? {})) tiles[Number(id)] = { kind };
  for (const [z, ids] of Object.entries(spec.extraZones ?? {})) {
    zones[z] = { tileIds: [...(zones[z]?.tileIds ?? []), ...ids] };
  }
  return {
    me,
    src: {
      tiles,
      zones,
      players: players.map((id) => ({ id })),
      round: { doraIndicators: doraIds },
    },
  };
}

describe("remainingCounter", () => {
  it("아무것도 안 보이면 4장 남는다", () => {
    const { src, me } = build({});
    expect(remainingCounter(src, me)(M(3))).toBe(4);
  });

  it("보이는 곳(손패·버림패·후로·도라 표시패)을 전부 뺀다", () => {
    const { src, me } = build({
      hand: [{ kind: M(3) }],
      discards: { p1: [{ kind: M(3) }, { kind: P(1) }] },
      melds: { p2: [{ kind: M(3) }] },
      dora: [{ kind: P(1) }],
    });
    const left = remainingCounter(src, me);
    expect(left(M(3))).toBe(1); // 손1 + 버림1 + 후로1 = 3장 보임
    expect(left(P(1))).toBe(2); // 버림1 + 도라 표시1
  });

  it("4장이 전부 보이면 0장 — 그 패로는 못 난다", () => {
    const { src, me } = build({
      discards: { p1: [{ kind: M(7) }, { kind: M(7) }], p3: [{ kind: M(7) }, { kind: M(7) }] },
    });
    expect(remainingCounter(src, me)(M(7))).toBe(0);
  });

  it("증강 생성패는 세지 않는다 — 남은 장수를 깎으면 안 된다", () => {
    const { src, me } = build({
      hand: [{ kind: M(5), conjured: true }],
      discards: { p1: [{ kind: M(5), conjured: true }, { kind: M(5), conjured: true }] },
      melds: { p2: [{ kind: M(5), conjured: true }] },
      dora: [{ kind: M(5), conjured: true }],
    });
    expect(remainingCounter(src, me)(M(5))).toBe(4);
  });

  it("진짜 패와 생성패가 섞여 있으면 진짜 것만 센다", () => {
    const { src, me } = build({
      discards: {
        p1: [{ kind: M(5) }, { kind: M(5), conjured: true }, { kind: M(5), conjured: true }],
      },
    });
    expect(remainingCounter(src, me)(M(5))).toBe(3);
  });

  it("같은 종류가 4장을 넘게 보여도 음수로 내려가지 않는다", () => {
    const { src, me } = build({
      discards: { p1: Array.from({ length: 6 }, () => ({ kind: M(9) })) },
    });
    expect(remainingCounter(src, me)(M(9))).toBe(0);
  });

  it("정체가 안 실려 온 패(뒷면 자리표)는 셀 수 없으므로 무시한다", () => {
    const { src, me } = build({
      discards: { p1: [{ kind: M(2) }] },
      extraZones: { "discards:p1": [9999] },
    });
    expect(remainingCounter(src, me)(M(2))).toBe(3);
  });

  it("남의 손패 zone은 절대 세지 않는다 (정보 비대칭)", () => {
    const { src, me } = build({
      hand: [{ kind: M(4) }],
      extraZones: { "hand:p1": [777] },
      extraTiles: { 777: M(4) },
    });
    expect(remainingCounter(src, me)(M(4))).toBe(3);
  });

  it("패산(wall)은 관전 뷰에 실려 와도 세지 않는다", () => {
    const { src, me } = build({
      extraZones: { wall: [888, 889] },
      extraTiles: { 888: M(6), 889: M(6) },
    });
    expect(remainingCounter(src, me)(M(6))).toBe(4);
  });

  it("handOwner가 null이면 손패를 아예 세지 않는다", () => {
    const { src } = build({ hand: [{ kind: M(4) }, { kind: M(4) }] });
    expect(remainingCounter(src, null)(M(4))).toBe(4);
  });

  it("seenKindCounts는 종류별 관측 장수를 그대로 준다", () => {
    const { src, me } = build({ hand: [{ kind: M(1) }, { kind: M(1) }] });
    expect(seenKindCounts(src, me).get("man1")).toBe(2);
  });
});
