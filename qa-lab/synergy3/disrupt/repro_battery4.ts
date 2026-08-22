/** 방해·수비·좌석 축 — 배터리 4 (덤터기 × 기생충 · 봉인술사 × 누명 · 방어 이중) */
import { craft, setup, submit, startFlow2, lastSettled, table, turnOptions } from "./lib.js";
import type { Game, GameState, PlayerId } from "./lib.js";

function patch(game: Game, round: Record<string, unknown>): void {
  (game.engine as unknown as { currentState: GameState }).currentState = {
    ...game.engine.state,
    round: { ...game.engine.state.round, ...round },
  };
}
const sum = (d: Record<string, number>): number =>
  Object.values(d).reduce((a, b) => a + b, 0);
const roundKeyOf = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

// ══════ 25. 덤터기(scapegoat) × 기생충(parasite) ══════
// scapegoat detail: "나머지 두 명은 한 푼도 내지 않는다 — 다른 증강이 새로 부과하는 지불까지 몰린다"
// parasite       : "숙주가 얻는 점수의 절반" (Transfer 단계 = Redistribute 뒤)
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "123m456m789m11p234p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  const run = (
    label: string,
    aug: Partial<Record<PlayerId, string[]>>,
    mark: boolean,
    parasiteOf?: [PlayerId, PlayerId],
  ) => {
    const g = setup(scene(), aug);
    if (parasiteOf) {
      const [holder, host] = parasiteOf;
      (g.engine as unknown as { currentState: GameState }).currentState = {
        ...g.engine.state,
        augmentData: {
          ...g.engine.state.augmentData,
          [`parasite:target:${holder}:${roundKeyOf(g.engine.state)}#round`]: host,
        },
      };
    }
    if (mark) submit(g, "p0", "scapegoat_mark", { target: "p1" });
    const { flow } = startFlow2(g);
    const s = flow.submit("p0", { type: "win", payload: {} });
    if (s.kind !== "roundOver") return { 조합: label, 결과: s.kind };
    const d = (lastSettled(g) as { deltas: Record<string, number> }).deltas;
    return {
      조합: label,
      p0: d["p0"],
      "p1(덤터기 대상)": d["p1"],
      "p2(기생충 보유)": d["p2"],
      p3: d["p3"],
      총합: sum(d),
    };
  };
  table("25. 덤터기 × 기생충 — «나머지 둘은 한 푼도 내지 않는다»가 지켜지나", [
    run("없음", {}, false),
    run("A=덤터기(p0→p1)", { p0: ["scapegoat"] }, true),
    run("B=기생충(p2→p0)", { p2: ["parasite"] }, false, ["p2", "p0"]),
    run("A+B", { p0: ["scapegoat"], p2: ["parasite"] }, true, ["p2", "p0"]),
  ]);
}

// ══════ 26. 봉인술사(discard_lock) × 누명(frame_up) — 잠긴 패를 심을 수 있나 ══════
{
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "234567m234567p1s",
        p1: "123456789m11p234p",
        p2: "*",
        p3: "*",
      },
      discards: { p0: "9p", p2: "9p", p3: "9p" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
  const rows: Record<string, unknown>[] = [];
  for (const seal of [false, true]) {
    const g = setup(scene(), { p0: ["frame_up"], p1: ["discard_lock"] });
    if (seal) {
      patch(g, { turnSeat: 1, firstTurn: true });
      submit(g, "p1", "seal_hands", {});
    }
    // 봉인 뒤 «첫 바퀴»를 지나게 한다 (누명은 첫 바퀴에 못 쓴다)
    const st = g.engine.state;
    patch(g, {
      turnSeat: 0,
      firstTurn: false,
      byPlayer: {
        ...st.round.byPlayer,
        p1: { ...st.round.byPlayer["p1"]!, discardedKinds: ["pin9"], discardCount: 1 },
      },
    });
    const opts = turnOptions(g, "p0").filter((o) => o.type === "frame_discard");
    const sealed = g.engine.state.augmentData[`view:p1:discardLockReveal:p0#round`];
    const sealedIds = new Set((Array.isArray(sealed) ? sealed : []) as number[]);
    const plantable = new Set(
      opts.map((o) => (o.payload as { tileId: number }).tileId),
    );
    rows.push({
      조합: seal ? "봉인 걸림" : "봉인 없음",
      "봉인된 p0 패 수": sealedIds.size,
      "누명 후보 tileId 종수": plantable.size,
      "봉인패가 후보에 남아 있나": [...sealedIds].some((id) => plantable.has(id)),
    });
  }
  table("26. discard_lock × frame_up — «봉인된 패는 심을 수 없다»", rows);
}

// ══════ 27. 천하무적 × 역만 방어술 (같은 좌석) — 방어가 이중으로 적용되나 ══════
{
  const scene = (): GameState =>
    craft({
      hands: { p0: "111m222m333m444p5s", p1: "*", p2: "*", p3: "*" },
      discards: { p3: "9p" },
      phase: "reaction",
      turnSeat: 3,
      lastDiscard: { player: "p3", spec: "5s" },
    });
  const run = (label: string, aug: Partial<Record<PlayerId, string[]>>) => {
    const g = setup(scene(), aug);
    const { flow } = startFlow2(g);
    const s = flow.submit("p0", { type: "win", payload: {} });
    if (s.kind !== "roundOver") return { 조합: label, 결과: s.kind };
    const d = (lastSettled(g) as { deltas: Record<string, number> }).deltas;
    return { 조합: label, p0: d["p0"], p3: d["p3"], 총합: sum(d) };
  };
  table("27. 역만 방어술 겹침 (p3 가 방어막 · p1 도 방어막)", [
    run("없음", {}),
    run("p3만 방어막", { p3: ["yakuman_shield"] }),
    run("p3·p1 둘 다 방어막", { p3: ["yakuman_shield"], p1: ["yakuman_shield"] }),
  ]);
}
