/**
 * augbug 경계 조건 런타임 재현 — 유국/나가시만관/더블론.
 * qa-lab/launch/augbug.md §3 미결 항목을 실제로 돌려 닫는다.
 * packages/ 는 건드리지 않는다 — 이 스크립트만 실행.
 */
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  discardsZone,
  installAugment,
  handZone,
} from "@majak/core";
import type { GameState, RoundSettledPayload, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { dieHard } from "../../../packages/content/src/augments/die_hard.js";
import { blameShift } from "../../../packages/content/src/augments/blame_shift.js";
import { pushRiichi } from "../../../packages/content/src/augments/push_riichi.js";
import { nagashiYakuman } from "../../../packages/content/src/augments/nagashi_yakuman.js";
import { WALL } from "@majak/core";

const SYS = "__system";
type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}
function withScore(state: GameState, player: PlayerId, score: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, score } : p)),
  };
}
function lastSettled(game: Game): RoundSettledPayload {
  const e = [...game.engine.eventLog].reverse().find((ev) => ev.type === ROUND_SETTLED);
  if (e === undefined) throw new Error("no ROUND_SETTLED found");
  return e.payload as RoundSettledPayload;
}

let failures = 0;
function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK" : "FAIL"}: ${name}${ok ? "" : " — " + detail}`);
  if (!ok) failures++;
}

// ─────────────────────────────────────────────────────────────
// 1) die_hard × 황패유국 노텐 벌부 — 방총이 아니라 노텐 벌부로 내려가는 손실에도
//    죽기살기가 반응해 부호를 뒤집는가? (설명 문구는 "국에서 잃을 점수"라 방총으로
//    한정하지 않지만, 실제 카드의 서사·주석은 전부 "방총"만 예로 든다 — 회귀 테스트도
//    노텐 벌부 경로를 전혀 다루지 않는다. 실제로 발동하는지 실행해서 확인한다.)
// ─────────────────────────────────────────────────────────────
function dieHardVsNoten(): void {
  // p0 노텐, p1/p2/p3 텐파이 → p0가 3000점 전액을 낸다(-3000), 텐파이 셋이 1000씩 받는다.
  // p0: 13장 전부 고립패 — 절대 텐파이가 아니다.
  // p1/p2/p3: 4몸통(멘쯔) 완성 + 마지막 1장 단기 대기(탕키) — 확실한 텐파이.
  // 종류가 겹쳐도 사용 매수가 4장을 넘지 않도록 설계했다(콴 확인 완료).
  const base = craft({
    hands: {
      p0: "1m5m9m1p5p9p1s5s9s1z3z5z7z",
      p1: "123m456p789s123p9m",
      p2: "123s456m789p456s9p",
      p3: "234m567p234s567s9s",
    },
    phase: "turn.draw",
    turnSeat: 0,
  });
  const dead = { ...base, zones: { ...base.zones, [WALL]: { ...base.zones[WALL]!, tileIds: [] } } };
  const withLow = withScore(withAug(dead, "p0", ["die_hard"]), "p0", 12000);
  const game = createStandardGameFromState(withLow);
  installAugment(game.engine, dieHard, "p0", { yaku: game.yaku });

  const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  if (!r.ok) {
    console.log(`SETUP FAILED (die_hard vs noten): ${r.reason}`);
    return;
  }
  const settled = lastSettled(game);
  const p0Delta = settled.deltas["p0"] ?? 0;
  const revivedBy = (settled as RoundSettledPayload & { revivedBy?: PlayerId[] }).revivedBy ?? [];
  console.log(`  die_hard vs noten: p0.delta=${p0Delta} revivedBy=${JSON.stringify(revivedBy)}`);
  // 기대(카드 설명이 방총에 한정하지 않으므로): 노텐 벌부도 "국에서 잃은 점수"이므로
  // 뒤집혀야 한다면 delta는 양수여야 한다. 사양이 방총 한정이라면 delta는 음수(-3000)여야
  // 한다 — 어느 쪽이든 "무슨 일이 일어나는지"를 기록하는 것이 이 재현의 목적이다.
  report(
    "die_hard가 노텐 벌부에도 반응하는가 (사양 미기재 — 실제 동작 기록)",
    true, // 항상 기록만, 판정은 사람이 문서에서 내린다
    `p0Delta=${p0Delta}, revivedBy=${JSON.stringify(revivedBy)}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 2) die_hard × 유국만관(나가시만관) — 지불자가 유국만관 지불로 12,500 이하가
//    되는 경우, 그 지불(손실)이 뒤집히는가?
// ─────────────────────────────────────────────────────────────
function dieHardVsNagashiMangan(): void {
  // p1이 유국역만/유국만관 요구패만 버려 나가시만관 성립. p0는 그 지불로 손실을 본다.
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "234m", p1: "19m19p19s1234z567z", p2: "234m", p3: "234m" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  const dead = { ...base, zones: { ...base.zones, [WALL]: { ...base.zones[WALL]!, tileIds: [] } } };
  // p1은 자(seat index 1) → 나머지 세 명이 나눠 낸다. p0에게 die_hard, 낮은 점수로.
  const withLow = withScore(withAug(dead, "p0", ["die_hard"]), "p0", 12000);
  const game = createStandardGameFromState(withLow);
  installAugment(game.engine, dieHard, "p0", { yaku: game.yaku });

  const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  if (!r.ok) {
    console.log(`SETUP FAILED (die_hard vs nagashi mangan): ${r.reason}`);
    return;
  }
  const settled = lastSettled(game);
  const p0Delta = settled.deltas["p0"] ?? 0;
  const revivedBy = (settled as RoundSettledPayload & { revivedBy?: PlayerId[] }).revivedBy ?? [];
  console.log(`  die_hard vs nagashi mangan: p0.delta=${p0Delta} revivedBy=${JSON.stringify(revivedBy)}`);
  report(
    "die_hard가 나가시만관 지불에도 반응하는가 (실제 동작 기록)",
    true,
    `p0Delta=${p0Delta}, revivedBy=${JSON.stringify(revivedBy)}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 3) 나가시만관 성립 시 점수 증강(mirror_dora 류가 아니라 실제 han/점수 배수계)이
//    표준 유국만관 경로를 정상적으로 타는가 — nagashi_yakuman이 이미 표준 규칙을
//    끄고 대체하는 회귀는 있으므로, 여기서는 표준 유국만관 자체가 die_hard와 별개로
//    정상 지불되는지(기준선)만 별도로 재확인한다.
// ─────────────────────────────────────────────────────────────
function nagashiManganBaseline(): void {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "234m", p1: "19m19p19s1234z567z", p2: "234m", p3: "234m" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  const dead = { ...base, zones: { ...base.zones, [WALL]: { ...base.zones[WALL]!, tileIds: [] } } };
  const game = createStandardGameFromState(dead);
  const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
  if (!r.ok) {
    console.log(`SETUP FAILED (nagashi baseline): ${r.reason}`);
    return;
  }
  const settled = lastSettled(game);
  console.log(`  nagashi mangan baseline deltas: ${JSON.stringify(settled.deltas)}`);
  // p1은 자(비오야) → 오야 아닌 유국만관은 전원에게서 2000씩 걷어 총 6000.
  const total = Object.values(settled.deltas).reduce((a, b) => a + (b ?? 0), 0);
  report("나가시만관 기준선 총합 0 (제로섬)", total === 0, `total=${total}`);
}

// ─────────────────────────────────────────────────────────────
// 4) 더블론 — blame_shift(론 +2판, 지불 분산)와 push_riichi(강제리치 직격론 +3->2판)를
//    동시에 서로 다른 화료자에게 걸고 더블론을 만들어, 각자 정확히 자기 몫만 받는지 확인.
// ─────────────────────────────────────────────────────────────
function doubleRonBlameShift(): void {
  // p2가 버린 패에 p0과 p1이 동시에 론 — 둘 다 blame_shift 보유, 각자 +2판이 각자에게만
  // 붙어야 한다(서로의 화료에 상대 판수가 섞이면 버그).
  // p0/p1 모두 5s 단기(탕키) 대기지만 나머지 세 몸통은 서로 다른 종류/숫자로 지어
  // 같은 패(kind)가 4장을 넘지 않게 했다(콴 확인 완료).
  // 둘 다 탕야오(전부 2~8)로 야쿠를 확보한다 — 탕키 대기는 핑후가 안 되므로
  // 야쿠 없는 화료가 되지 않게 종류를 전부 단순패로 지었다(콴 확인 완료).
  const base = craft({
    hands: {
      p0: "234m567p234s456p5s", // 탕야오, 5s 탕키
      p1: "678m234p678s333p5s", // 탕야오, 5s 탕키 (다른 몸통 구성)
      p2: "*",
      p3: "*",
    },
    discards: { p2: "5s" },
    phase: "turn.act",
    turnSeat: 2, // p2가 방금 버림 (seat index 2)
  });
  let st = withAug(base, "p0", ["blame_shift"]);
  st = withAug(st, "p1", ["blame_shift"]);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, blameShift, "p0", { yaku: game.yaku });
  installAugment(game.engine, blameShift, "p1", { yaku: game.yaku });

  const ronTile = game.engine.state.zones[discardsZone("p2")]?.tileIds[0] as TileId;
  const r = game.engine.submit({
    player: SYS,
    type: "sys.settleWin",
    payload: {
      wins: [
        { winner: "p0", from: "p2", tileId: ronTile, winType: "ron" },
        { winner: "p1", from: "p2", tileId: ronTile, winType: "ron" },
      ],
    },
  });
  if (!r.ok) {
    console.log(`SETUP FAILED (double ron blame_shift): ${r.reason}`);
    return;
  }
  const settled = lastSettled(game);
  console.log(`  double ron blame_shift deltas: ${JSON.stringify(settled.deltas)}`);
  const winYaku = (settled as unknown as { wins?: { winner: string; yaku?: { id: string }[] }[] }).wins;
  console.log(`  wins detail: ${JSON.stringify(winYaku)}`);
}

dieHardVsNoten();
dieHardVsNagashiMangan();
nagashiManganBaseline();
doubleRonBlameShift();

console.log(`\n${failures === 0 ? "모든 자동판정 OK" : failures + "건 자동판정 FAIL"} (수동 판독 항목은 위 로그 참고)`);

// ─────────────────────────────────────────────────────────────
// 5) doubleRonBlameShift 진단 — 기준선(증강 없음) 대비 총합이 보존되는지 별도 확인.
// ─────────────────────────────────────────────────────────────
function doubleRonDiagnostic(): void {
  function scene(withAugments: boolean): GameState {
    let st = craft({
      hands: {
        p0: "234m567p234s456p5s",
        p1: "678m234p678s333p5s",
        p2: "*",
        p3: "*",
      },
      discards: { p2: "5s" },
      phase: "turn.act",
      turnSeat: 2,
    });
    if (withAugments) {
      st = withAug(st, "p0", ["blame_shift"]);
      st = withAug(st, "p1", ["blame_shift"]);
    }
    return st;
  }
  function settle(st: GameState, withAugments: boolean): RoundSettledPayload {
    const game = createStandardGameFromState(st);
    if (withAugments) {
      installAugment(game.engine, blameShift, "p0", { yaku: game.yaku });
      installAugment(game.engine, blameShift, "p1", { yaku: game.yaku });
    }
    const ronTile = game.engine.state.zones[discardsZone("p2")]?.tileIds[0] as TileId;
    const r = game.engine.submit({
      player: SYS,
      type: "sys.settleWin",
      payload: {
        wins: [
          { winner: "p0", from: "p2", tileId: ronTile, winType: "ron" },
          { winner: "p1", from: "p2", tileId: ronTile, winType: "ron" },
        ],
      },
    });
    if (!r.ok) throw new Error(r.reason);
    return lastSettled(game);
  }

  const base = settle(scene(false), false);
  const aug = settle(scene(true), true);
  const baseTotal = Object.values(base.deltas).reduce((a, b) => a + (b ?? 0), 0);
  const augTotal = Object.values(aug.deltas).reduce((a, b) => a + (b ?? 0), 0);
  console.log(`  더블론 기준선(증강 없음) deltas: ${JSON.stringify(base.deltas)} total=${baseTotal}`);
  console.log(`  더블론 blame_shift×2 deltas:     ${JSON.stringify(aug.deltas)} total=${augTotal}`);
  report(
    "더블론에서 blame_shift 둘 다 걸어도 총합이 보존된다",
    augTotal === 0,
    `augTotal=${augTotal} (기준선은 ${baseTotal}이어야 정상)`,
  );
}
doubleRonDiagnostic();
console.log(`\n최종: ${failures} 건 FAIL`);

// ─────────────────────────────────────────────────────────────
// 5b) doubleRonDiagnostic 재점검 — surplus가 augPoints에 근거(han bonus)로 남는지 확인.
//     (settle_accounting_qa.test.ts의 기존 계약: 재배선 자체는 총액 불변이고, +2판
//     보너스만 뱅크 발행으로 늘어난다 — 그 발행분이 augPoints에 기록되는지가 진짜 판정.)
// ─────────────────────────────────────────────────────────────
function doubleRonAttributionCheck(): void {
  const st0 = craft({
    hands: {
      p0: "234m567p234s456p5s",
      p1: "678m234p678s333p5s",
      p2: "*",
      p3: "*",
    },
    discards: { p2: "5s" },
    phase: "turn.act",
    turnSeat: 2,
  });
  let st = withAug(st0, "p0", ["blame_shift"]);
  st = withAug(st, "p1", ["blame_shift"]);
  const game = createStandardGameFromState(st);
  installAugment(game.engine, blameShift, "p0", { yaku: game.yaku });
  installAugment(game.engine, blameShift, "p1", { yaku: game.yaku });
  const ronTile = game.engine.state.zones[discardsZone("p2")]?.tileIds[0] as TileId;
  const r = game.engine.submit({
    player: SYS,
    type: "sys.settleWin",
    payload: {
      wins: [
        { winner: "p0", from: "p2", tileId: ronTile, winType: "ron" },
        { winner: "p1", from: "p2", tileId: ronTile, winType: "ron" },
      ],
    },
  });
  if (!r.ok) {
    console.log(`SETUP FAILED (attribution check): ${r.reason}`);
    return;
  }
  const settled = lastSettled(game);
  const total = Object.values(settled.deltas).reduce((a, b) => a + (b ?? 0), 0);
  const hanNotes = (settled.augPoints ?? []).filter((n: { han?: number }) => n.han !== undefined);
  const hanTotal = hanNotes.reduce((a: number, n: { points: number }) => a + n.points, 0);
  console.log(`  attribution: deltas=${JSON.stringify(settled.deltas)} total=${total}`);
  console.log(`  attribution: augPoints(han)=${JSON.stringify(hanNotes)} hanTotal=${hanTotal}`);
  report(
    "더블론 blame_shift×2의 총합 잉여가 augPoints(han bonus)로 정확히 귀속된다",
    total === hanTotal,
    `total=${total}, hanTotal=${hanTotal} (차이=${total - hanTotal})`,
  );
}
doubleRonAttributionCheck();
console.log(`\n최종(전체): ${failures} 건 FAIL`);
