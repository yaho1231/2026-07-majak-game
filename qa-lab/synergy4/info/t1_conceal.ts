/**
 * T1 — 가려진 도라(dora_conceal) 단독 / 둘 / 도라 열람 카드와의 맞대결.
 *
 * 예측:
 *  A) 단독: 보유자는 도라 표시패를 보고, 나머지 셋은 자리표(뒷면)만 본다.
 *  B) 둘(p0·p1이 각각 보유): 카드 설명("도라는 나만 알 수 있다")대로면 **둘 다** 자기 도라를
 *     본다. 구현이 `rctx.playerId !== holder → true`뿐이라면 서로의 모디파이어에 걸려
 *     **둘 다 못 본다** — 안개(fogScope)가 이미 한 번 밟은 함정과 같은 모양.
 *  C) 보유자가 아닌 좌석이 왕패를 여는 카드(왕패의 주인)를 들면 표시패는 자리표로 가려진다.
 */
import { act, DEAD_WALL, allViews, base, build, doraKindsIn, head, kindKey, kindOf, line, ok, view, zoneKinds } from "./lib.js";

const st = base();
const trueDora = kindKey(kindOf(st, st.round.doraIndicators[0]!));
line(`실제 도라 표시패: ${trueDora}`);

head("A) dora_conceal 단독 (p0)");
{
  const g = build(st, { p0: ["dora_conceal"] });
  const vs = allViews(g);
  line(`  p0 doraIndicators = ${JSON.stringify(doraKindsIn(vs["p0"]!))}`);
  line(`  p1 doraIndicators = ${JSON.stringify(doraKindsIn(vs["p1"]!))}`);
  ok(doraKindsIn(vs["p0"]!)[0] === trueDora, "보유자 p0는 도라를 본다");
  ok(doraKindsIn(vs["p1"]!).length === 0, "비보유자 p1은 못 본다");
  line(`  관전자 doraIndicators = ${JSON.stringify(doraKindsIn(vs["__spectator"]!))}`);
}

head("B) dora_conceal 둘 (p0 + p1)");
{
  const g = build(st, { p0: ["dora_conceal"], p1: ["dora_conceal"] });
  const vs = allViews(g);
  for (const s of ["p0", "p1", "p2"]) {
    line(`  ${s} doraIndicators = ${JSON.stringify(doraKindsIn(vs[s]!))}`);
  }
  ok(doraKindsIn(vs["p0"]!)[0] === trueDora, "p0(보유자)는 여전히 자기 도라를 본다");
  ok(doraKindsIn(vs["p1"]!)[0] === trueDora, "p1(보유자)는 여전히 자기 도라를 본다");
  ok(doraKindsIn(vs["p2"]!).length === 0, "p2는 못 본다");
}

head("C) dora_conceal(p0) + 왕패 열람 카드(p1)");
for (const opener of ["dead_wall_master", "rinshan_preview", "cliff_bloom"]) {
  const g = build(st, { p0: ["dora_conceal"], p1: [opener] });
  const v1 = view(g, "p1");
  const dw = zoneKinds(v1, DEAD_WALL);
  line(`  ${opener}: p1의 왕패 = ${JSON.stringify(dw)}`);
  line(`             p1 doraIndicators = ${JSON.stringify(doraKindsIn(v1))}`);
  ok(dw[4] === "?", `${opener} 보유자에게 표시패 자리(4)는 가려진다`);
  ok(dw.length === 14, `${opener} 왕패 자리 수 보존(14)`);
}

head("C') dora_conceal(p0) + ura_peek(p1) — 발동 후 왕패 전체 열람");
{
  const g = build(base({ turnSeat: 1, drawnLastFor: "p1" }), { p0: ["dora_conceal"], p1: ["ura_peek"] });

  line(`  ura_peek_reveal → ${act(g, "p1", "ura_peek_reveal") ?? "ok"}`);
  const v1 = view(g, "p1");
  line(`  p1의 왕패 = ${JSON.stringify(zoneKinds(v1, DEAD_WALL))}`);
  line(`  p1 augmentView.ura = ${JSON.stringify(v1.augmentView["ura"])}`);
  ok(zoneKinds(v1, DEAD_WALL)[4] === "?", "표도라 표시패는 여전히 가려진다");
}
