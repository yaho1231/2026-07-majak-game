/**
 * open_riichi(개문선언 · 표준) × open_riichi_reveal(오픈 리치) × silent_pact(묵계)
 *
 * 설명:
 *  - 개문선언: "후로한 손으로도 리치를 선언할 수 있다. 후로한 채 리치로 화료하면 그
 *    리치를 **2판**으로 취급한다. 일발·뒷도라는 그대로. 손이 멘젠이 되는 것은 아니다."
 *  - 오픈 리치: "그 외의 화료에서는 그 리치를 **3판**으로 취급한다."
 *    코드 주석: 개문선언을 함께 들면 3판 취급이 4판이 되지 않도록 1만 얹는다.
 *  - 묵계: 후로해도 멘젠 → 오픈 리치의 멘젠 요구를 만족시킨다.
 *
 * 기대(먼저 적음):
 *  ① 후로 손 + 개문선언 리치 쯔모 → 리치 1판(역) + 개문선언 +1판 = "리치 2판 취급"
 *  ② 후로 손 + 개문선언 + 오픈 리치 선언 → "리치 3판 취급" = 리치 1 + 1 + 1
 *  ③ 묵계 퐁 손 + 오픈 리치 → 멘젠이므로 개문선언 몫은 0, 오픈 리치 +2 = 3판 취급.
 *     멘젠쯔모도 함께 붙어야 한다.
 *  ④ 비리치 상대에게서 론하면 오픈 리치 직격 = 역만(추가 판 없음).
 */
import { ROUND_SCOPED_MARK } from "@majak/core";
import type { GameState, Meld, PlayerId } from "@majak/core";
import { craft, start, stdAug, table, winReport } from "./lib.js";
import { openRiichiReveal } from "../../../packages/content/src/augments/open_riichi_reveal.js";
import { silentPact } from "../../../packages/content/src/augments/silent_pact.js";

const openRiichi = stdAug("open_riichi");
const P0 = "p0" as PlayerId;

/** p0 을 리치 상태로 만들고, 오픈 리치 선언 플래그도 원하면 세운다 */
function riichiState(
  s: GameState,
  opts: { revealDeclared?: boolean; silent?: boolean } = {},
): GameState {
  const rs = s.round.byPlayer[P0]!;
  const melds: Meld[] =
    opts.silent === true ? rs.melds.map((m) => ({ ...m, silent: true })) : rs.melds;
  const roundKey = `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;
  return {
    ...s,
    augmentData: {
      ...s.augmentData,
      ...(opts.revealDeclared === true
        ? { [`open_riichi_reveal:declared:${roundKey}:${P0}${ROUND_SCOPED_MARK}`]: true }
        : {}),
    },
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: {
          ...rs,
          melds,
          riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
        },
      },
    },
  };
}

/** 후로 1개(퐁 777z) + 손 11장 쯔모 직후 */
function scene(): GameState {
  return craft({
    hands: { p0: "234m567p234s99s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "777z", from: "p1" as PlayerId }] },
    discards: { p0: "1m" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: P0,
  });
}

function show(label: string, s: GameState, defs: Parameters<typeof start>[1]): void {
  const g = start(s, defs);
  const r = winReport(g, P0);
  table(label, [
    { label: "화료", value: r.err === null ? "OK" : r.err },
    { label: "han/fu", value: `${r.han}/${r.fu}` },
    { label: "yaku", value: r.yaku },
    { label: "손 점수", value: r.points },
    { label: "delta p0", value: r.deltas["p0"] },
    { label: "augPoints", value: r.augPoints },
  ]);
}

const openHand = riichiState(scene());
const openHandDeclared = riichiState(scene(), { revealDeclared: true });
const silentHand = riichiState(scene(), { silent: true });
const silentDeclared = riichiState(scene(), { silent: true, revealDeclared: true });

console.log("\n##### 후로(평범한 퐁) 손으로 리치 — 쯔모 화료");
show("① 증강 없음 (후로 리치 자체가 비정상 상태 · 기준선)", openHand, []);
show("② open_riichi 만", openHand, [openRiichi]);
show("③ open_riichi + 오픈리치 선언", openHandDeclared, [openRiichi, openRiichiReveal]);
show("④ 오픈리치만 선언 (개문선언 없음)", openHandDeclared, [openRiichiReveal]);

console.log("\n##### 묵계 퐁 손(멘젠 유지)으로 리치 — 쯔모 화료");
show("⑤ 묵계만", silentHand, [silentPact]);
show("⑥ 묵계 + 오픈리치 선언", silentDeclared, [silentPact, openRiichiReveal]);
show("⑦ 묵계 + 개문선언 + 오픈리치 선언", silentDeclared, [
  silentPact,
  openRiichi,
  openRiichiReveal,
]);
