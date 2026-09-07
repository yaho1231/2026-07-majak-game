/**
 * 왕초보 방에서는 초읽기(time_pressure)가 나오지 않는다 (2026-09-07 사용자 지시).
 *
 * 초읽기는 그 국 동안 전원의 결정을 5초로 조인다 — 한 수에 300초를 준 방에서 그게
 * 걸리면 아직 읽고 있는 사람의 차례가 통째로 쯔모기리로 흘러간다.
 *
 * 지키는 선은 **문이 하나**라는 것이다: 드래프트 후보(`DraftController`)와 지급형
 * 증강(수상한 주사위 `ctx.grantAugments`)이 같은 카탈로그 하나를 보므로, 카탈로그에서
 * 빼면 두 길이 함께 막힌다. 드래프트만 거르면 지급이 그대로 옆문이 된다 — 이 테스트는
 * 그 «한 문»이 실제로 카탈로그라는 것을 지킨다.
 */

import { describe, expect, it } from "vitest";
import { contentAugments } from "@majak/content";
import { ROOM_PACES } from "@majak/core/network/protocol.js";
import type { RoomPace } from "@majak/core/network/protocol.js";
import { augmentsForPace } from "../src/RoomManager.js";

const ids = (defs: readonly { id: string }[]): Set<string> => new Set(defs.map((d) => d.id));

describe("왕초보 방 증강 카탈로그", () => {
  it("왕초보에서는 초읽기가 빠진다", () => {
    expect(ids(augmentsForPace("novice")).has("time_pressure")).toBe(false);
  });

  it("나머지 속도는 종전 그대로다 (카탈로그가 한 종도 줄지 않는다)", () => {
    for (const pace of Object.keys(ROOM_PACES) as RoomPace[]) {
      if (pace === "novice") continue;
      expect(augmentsForPace(pace)).toEqual(contentAugments);
    }
  });

  it("빠지는 것은 초읽기 하나뿐이다", () => {
    const kept = ids(augmentsForPace("novice"));
    const dropped = contentAugments.filter((a) => !kept.has(a.id)).map((a) => a.id);
    expect(dropped).toEqual(["time_pressure"]);
  });
});
