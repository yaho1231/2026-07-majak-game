/**
 * 최소 재현 — 거울의 도라(mirror_dora)의 **전원 공개 채널**이 표시패 교체를 못 따라간다.
 *
 * mirror_dora 는 `ROUND_STARTED` · `DORA_FLIPPED` 두 계기에서만 앞도라를 공개한다.
 * 왕패의 주인(dead_wall_master)이 **표시패 자리를 손패와 맞바꾸면** 표시패가 그 자리에서
 * 바뀌는데(dead_wall_master.ts:209-213), 그때는 두 이벤트 중 어느 것도 나지 않는다.
 * → 점수는 새 표시패로 맞게 계산되지만, 채널은 **없는 도라**를 계속 광고한다.
 *
 * 실행: tsx qa-lab/score-b/repro_mirror_channel.ts
 */
import { DEAD_WALL, doraIndicatorIndex, frontDoraKindFor, handIdsOf, kindKey } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft, setDeadWallKind, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };
const CH = "view:*:mirror_dora:p0#round";

function show(tag: string, s: GameState): void {
  const want = s.round.doraIndicators.map((t) => kindKey(frontDoraKindFor(s.tiles[t]!.kind)));
  const got = s.augmentData[CH];
  say(
    `${tag}\n   표시패=${s.round.doraIndicators.map((t) => kindKey(s.tiles[t]!.kind))} ` +
    `→ 내 앞도라(실제)=${JSON.stringify(want)}\n   전원 공개 채널=${JSON.stringify(got)} ` +
    `${JSON.stringify(got) === JSON.stringify(want) ? "일치" : "← 어긋남"}`,
  );
}

// p0 = mirror_dora, p1 = dead_wall_master. p1 첫 순에 표시패 자리를 자기 손패와 맞바꾼다.
let base = craft({
  hands: { p0: "*", p1: "123m456m789m123s5p", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
});
base = setDeadWallKind(base, 4, { suit: "sou", rank: 8 }); // 표시패 8s → 표준도라 9s, 앞도라 7s

// 국 시작 공개를 흉내낸다 (실게임에서는 mirror_dora 의 ROUND_STARTED 리액션이 낸다)
base = {
  ...base,
  augmentData: {
    ...base.augmentData,
    [CH]: base.round.doraIndicators.map((t) => kindKey(frontDoraKindFor(base.tiles[t]!.kind))),
  },
};
const { game, flow } = start(base, { p0: ["mirror_dora"], p1: ["dead_wall_master"] } as never);
show("① 배패 직후 (채널이 국 시작에 한 번 나간 상태)", game.engine.state);

const st = game.engine.state;
const idx = doraIndicatorIndex(st, 0);
const mine = handIdsOf(st, "p1").find((id: TileId) => kindKey(st.tiles[id]!.kind) === "pin5") as TileId;
say(`\n왕패 표시패 자리(index=${idx})를 p1의 5p 와 맞바꾼다`);
const res = flow.submit("p1", { type: "dw_swap", payload: { handTileId: mine, deadIndex: idx } });
say(`dw_swap kind=${res.kind}`);
show("② 표시패 교체 직후", game.engine.state);
const fin = game.engine.state;
say(`\n왕패 길이=${fin.zones[DEAD_WALL]?.tileIds.length} (교체라 그대로)`);
say("→ 점수 계산은 새 표시패를 쓰므로 판수는 맞지만, 카드가 약속한 \"무엇이 도라가 됐는지 전원 공개\"는 거짓이 된다.");
