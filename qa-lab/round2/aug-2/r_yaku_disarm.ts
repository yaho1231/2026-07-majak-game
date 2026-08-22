/**
 * 커스텀 역은 **첫 설치자의 instanceId**로 등록된다 (`if (yaku.get(ID) === undefined)`).
 * 그래서 같은 증강을 둘이 들고 있을 때 **무장해제가 첫 설치자를 잠그면 두 번째 보유자의
 * 역까지 함께 사라진다** — evaluate가 `WinContext.disarmedSources`와 역의 `source`를
 * 대조하기 때문이다. 잠긴 적이 없는 사람이 자기 역을 잃는다.
 *
 * 담당 증강 중 해당: hidden_blade(+2판) · mixed_nine_gates(역만 13판) · eternal_dealer(역패 동).
 */
import {
  DISARMED_SOURCES_KEY, ROUND_SETTLED, SYSTEM_PLAYER, augmentInstanceId,
  createStandardGameFromState, discardsZone, installAugment,
} from "@majak/core";
import type { GameEvent, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { hiddenBlade } from "../../../packages/content/src/augments/hidden_blade.js";

function withAug(s: GameState, ids: Record<string, string[]>): GameState {
  return { ...s, players: s.players.map((p) => (ids[p.id] ? { ...p, augments: [...ids[p.id]!] } : p)) };
}

function run(disarmFirst: boolean): void {
  const base = craft({
    // p2가 멘젠 다마텐 론 — 탕야오 성립 (숨은 칼날 +2판이 얹힐 손)
    hands: { p0: "*", p1: "*", p2: "234m567m234p55s67s", p3: "*" },
    discards: { p0: "5s" },
    phase: "reaction", turnSeat: 0,
  });
  const state = withAug(base, { p1: ["hidden_blade"], p2: ["hidden_blade"] });
  const withDisarm: GameState = disarmFirst
    ? { ...state, augmentData: { ...state.augmentData, [DISARMED_SOURCES_KEY]: [augmentInstanceId("p1" as PlayerId, "hidden_blade")] } }
    : state;
  const game = createStandardGameFromState(withDisarm);
  // 설치 순서: p1이 먼저 → 커스텀 역의 source = p1 인스턴스
  installAugment(game.engine, hiddenBlade, "p1", { yaku: game.yaku });
  installAugment(game.engine, hiddenBlade, "p2", { yaku: game.yaku });

  const ronTile = game.engine.state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
  const r = game.engine.submit({
    player: SYSTEM_PLAYER, type: "sys.settleWin",
    payload: { wins: [{ winner: "p2", from: "p0", tileId: ronTile, winType: "ron" }] },
  });
  const e = game.engine.eventLog.filter((x: GameEvent) => x.type === ROUND_SETTLED).at(-1);
  const p = e?.payload as { winInfos?: { winner: string; han: number; points: number; yaku: { id: string }[] }[] };
  const wi = p?.winInfos?.[0];
  console.log(
    `disarm(p1)=${disarmFirst ? "yes" : "no "} → p2 ok=${r.ok} han=${wi?.han} points=${wi?.points} yaku=${wi?.yaku.map((y) => y.id).join(",")}`,
  );
}
run(false);
run(true);
