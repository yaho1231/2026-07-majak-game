/**
 * 방마다 봇의 **성격이 달라지는지** 검증한다.
 *
 * `bot/profile.ts`는 원형 6종(공격·수비·속공·타점·균형·변덕)을 균등하게 뽑도록
 * 되어 있었지만, 실대국에서는 그 추첨이 **얼어 있었다.** `BotAgent`는 시드를 안 주면
 * 좌석 id 문자열로 시드를 만드는데 방의 봇 좌석은 언제나 `p1`·`p2`·`p3`이라, 세상의
 * 모든 방이 같은 조합(p1 공격형 · p2·p3 속공형)을 받았다. 수비형·균형형·타점형·
 * 변덕형은 아레나에서만 살아 있고 사람과의 대국에는 한 번도 나온 적이 없었다.
 *
 * 그래서 여기서 잡는 것은 둘이다.
 *   1. 방이 다르면 성격 조합도 달라진다 (얼어 있지 않다)
 *   2. 같은 방·같은 좌석이면 늘 같다 (재현성은 그대로)
 */

import { describe, expect, it } from "vitest";
import { BotAgent, botSeed, seedFromId } from "../src/BotAgent.js";
import { ARCHETYPE_NAMES } from "../src/bot/profile.js";
import type { ArchetypeName } from "../src/bot/profile.js";

/** RoomManager가 쓰는 것과 같은 규칙 — 방 코드와 좌석을 섞는다 */
const seatSeed = (code: string, id: string): number => seedFromId(`${code}:${id}`);

const archetypeIn = (code: string, id: string): ArchetypeName =>
  new BotAgent(id, `Bot_${id}`, seatSeed(code, id)).archetype;

/** 방 하나의 봇 세 자리 성격 */
const tableOf = (code: string): ArchetypeName[] =>
  ["p1", "p2", "p3"].map((id) => archetypeIn(code, id));

/** 결정론적인 가짜 방 코드 (실제 코드와 같은 4글자 대문자꼴) */
function roomCodes(n: number): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let code = "";
    let v = i * 2654435761 + 12345;
    for (let k = 0; k < 4; k++) {
      code += chars[Math.abs(v) % chars.length];
      v = Math.floor(v / chars.length) + k * 7919;
    }
    out.push(code);
  }
  return out;
}

describe("방마다 봇 성격이 달라진다", () => {
  it("좌석 id만으로 시드를 만들면 모든 방이 같은 조합이 된다 (예전 동작)", () => {
    // 시드를 안 주면 BotAgent가 좌석 id로만 시드를 만든다 — 방이 달라도 같은 값이다
    const frozen = ["p1", "p2", "p3"].map((id) => new BotAgent(id, `Bot_${id}`).archetype);
    const again = ["p1", "p2", "p3"].map((id) => new BotAgent(id, `Bot_${id}`).archetype);
    expect(again).toEqual(frozen);
  });

  it("방 코드를 섞으면 방마다 조합이 달라진다", () => {
    const tables = roomCodes(40).map((code) => tableOf(code).join(","));
    const distinct = new Set(tables);
    // 40개 방에서 조합이 하나로 얼어붙지 않는다 — 넉넉히 여러 가지가 나온다
    expect(distinct.size).toBeGreaterThan(10);
  });

  it("원형 6종이 전부 실제로 등장한다 — 예전에는 2종만 나왔다", () => {
    const seen = new Set<ArchetypeName>();
    for (const code of roomCodes(200)) for (const a of tableOf(code)) seen.add(a);
    for (const name of ARCHETYPE_NAMES) expect(seen).toContain(name);
  });

  it("같은 방 코드·같은 좌석이면 늘 같은 성격이다 (재현성)", () => {
    for (const code of roomCodes(5)) {
      expect(tableOf(code)).toEqual(tableOf(code));
    }
  });

  it("같은 방 안에서 좌석마다 시드가 다르다", () => {
    const seeds = ["p1", "p2", "p3"].map((id) => seatSeed("ABCD", id));
    expect(new Set(seeds).size).toBe(3);
  });
});

/**
 * **판마다 성격이 리롤되는가.**
 *
 * `RoomManager.botSeed(code, id)`는 방 코드와 좌석 이름만 섞는다. 둘 다 방이 사는
 * 동안 변하지 않으므로 **같은 방 코드에서는 영원히 같은 성격 셋**이 앉고, 재대국에도
 * 같은 시드가 들어가 리롤이 없다 — 친구들과 방 하나를 계속 쓰면 몇십 판을 두어도
 * 상대 셋이 한 번도 안 바뀐다.
 */
describe("판마다 새 사람이 앉는다", () => {
  const tableAt = (code: string, game: number): ArchetypeName[] =>
    ["p1", "p2", "p3"].map(
      (id) => new BotAgent(id, `Bot_${id}`, botSeed(code, id, game)).archetype,
    );

  it("같은 방 코드라도 판 번호가 다르면 조합이 달라진다", () => {
    const tables = [0, 1, 2, 3, 4, 5].map((g) => tableAt("ABCD", g).join(","));
    expect(new Set(tables).size).toBeGreaterThan(1);
  });

  it("같은 방·같은 판이면 늘 같다 (리플레이가 깨지지 않는다)", () => {
    expect(tableAt("ABCD", 3)).toEqual(tableAt("ABCD", 3));
  });

  it("판 번호를 생략하면 예전 좌석 시드와 같은 자리에 선다", () => {
    expect(botSeed("ABCD", "p1", 0)).toBe(botSeed("ABCD", "p1"));
  });
});
