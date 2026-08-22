/**
 * 확정 1 재현 — 2026-08-20 «샹퐁이 서면 단기 변형을 버린다» 필터가
 * **증강 없는 표준 손**에서도 발동해 부수가 2부 깎인다.
 *
 * 전제(fixlog #88): "표준 마작에서는 두 해석이 함께 설 수 없어 표준 채점은 안 바뀐다."
 * → 화료패가 손에 **3장** 있고 그 중 하나가 슌쯔로도 읽히면 두 해석이 함께 선다. 전제가 거짓.
 */
import { buildVariants, evaluateWin, calculateScore, YakuRegistry, registerStandardYaku } from "@majak/core";
import type { TileKind, WinContext } from "@majak/core";

const reg = new YakuRegistry(); registerStandardYaku(reg);
const T = (spec: string): TileKind[] => {
  const out: TileKind[] = []; let d = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") { d += ch; continue; }
    for (const c of d) {
      const r = Number(c);
      out.push(ch === "m" ? { suit: "man", rank: r } : ch === "p" ? { suit: "pin", rank: r }
        : ch === "s" ? { suit: "sou", rank: r } : r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
    }
    d = "";
  }
  return out;
};

interface Case { name: string; hand: string; win: TileKind; wt: "tsumo" | "ron"; dealer: boolean; wantFu: number; why: string }
const cases: Case[] = [
  { name: "333m 456m 66m 777p 234s — 6m 쯔모 (자)", hand: "33345666m777p234s", win: T("6m")[0]!, wt: "tsumo", dealer: false, wantFu: 40,
    why: "단기해석 20+안커333m 4+안커777p 4+단기 2+쯔모 2 = 32→40 / 샹퐁해석 30" },
  { name: "333m 456m 66m 777p 234s — 6m 론 (자)", hand: "33345666m777p234s", win: T("6m")[0]!, wt: "ron", dealer: false, wantFu: 40,
    why: "단기 20+4+4+단기2 = 30→30? (론 멘젠 +10) = 40 / 샹퐁은 론이라 666m 명각 2부 → 20+4+2+10=36→40" },
  { name: "222p 345p 22s... 노두 버전: 111m 123m 11m? ", hand: "11123m111999p22s", win: T("1m")[0]!, wt: "tsumo", dealer: false, wantFu: 0, why: "참고용" },
];

for (const c of cases.slice(0, 2)) {
  const hand = T(c.hand);
  const ctx: WinContext = {
    hand, melds: [], winningTile: c.win, winType: c.wt, seatWind: 2, prevalentWind: 1,
    riichi: null, flags: {}, doraKinds: [], uraDoraKinds: [], redCount: 0,
  };
  const vs = buildVariants(ctx);
  const ev = evaluateWin(ctx, reg)!;
  const got = calculateScore({ han: ev.han, fu: ev.fu, yakumanCount: ev.yakumanCount, isDealer: c.dealer, winType: c.wt });
  const want = calculateScore({ han: ev.han, fu: c.wantFu, yakumanCount: 0, isDealer: c.dealer, winType: c.wt });
  console.log(`\n■ ${c.name}`);
  console.log(`  변형 ${vs.length}개: ${vs.map(v => v.waitType).join(", ")}  (단기 포함? ${vs.some(v => v.waitType === "tanki")})`);
  console.log(`  ${c.why}`);
  console.log(`  엔진   : ${ev.han}판 ${ev.fu}부 wait=${ev.waitType} → 합계 ${got.total}`);
  console.log(`  표준기대: ${ev.han}판 ${c.wantFu}부 → 합계 ${want.total}`);
  console.log(`  ${ev.fu === c.wantFu ? "OK" : "MISMATCH ***"}`);
}
