/**
 * T2 — 도라 정보 카드끼리: 가려진 도라 × 거울 / 잔상 / 붉은 손길 / 이면투시.
 *
 * 예측:
 *  A) 거울(p1) + 가려진 도라(p0): 거울은 앞도라 종류를 «전원 공개» 채널에 싣는데, 앞도라는
 *     표시패의 정확한 역함수라 그대로 표시패를 알려 준다. 2026-08-23에 좌석 채널로 갈랐다니
 *     p2·p3에게는 안 가야 한다. 거울 보유자 본인에게는 간다(= 은폐를 뚫는다).
 *  B) 거울과 가려진 도라를 **같은 사람**이 들면: 남들에게 아무것도 안 가야 한다.
 *  C) 거울 보유자가 **가려진 도라 보유자 본인**일 때 vs 제3자일 때의 차이.
 *  D) 잔상(dora_afterimage)의 공개 채널이 이번 국 도라를 새게 하지 않는가.
 */
import {
  allViews,
  base,
  build,
  doraKindsIn,
  head,
  kindKey,
  kindOf,
  line,
  ok,
  SEATS,
  view,
  poke,
  act,
} from "./lib.js";

const st = base();
const ind = kindKey(kindOf(st, st.round.doraIndicators[0]!));
line(`표시패 = ${ind} (도라 = 그 다음, 앞도라 = 그 이전)`);

function mirrorChannels(g: ReturnType<typeof build>): Record<string, unknown> {
  poke(g);
  const out: Record<string, unknown> = {};
  const vs = allViews(g);
  for (const [seat, v] of Object.entries(vs)) {
    const hits = Object.entries(v.augmentView).filter(([k]) => k.startsWith("mirror_dora"));
    out[seat] = Object.fromEntries(hits);
  }
  return out;
}

head("A) mirror_dora(p1) + dora_conceal(p0) — 서로 다른 좌석");
{
  const g = build(st, { p0: ["dora_conceal"], p1: ["mirror_dora"] });
  const ch = mirrorChannels(g);
  for (const s of [...SEATS, "__spectator"]) line(`  ${s}: ${JSON.stringify(ch[s])}`);
  ok(Object.keys(ch["p2"] as object).length === 0, "제3자 p2에게 앞도라가 새지 않는다");
  ok(Object.keys(ch["p3"] as object).length === 0, "제3자 p3에게 앞도라가 새지 않는다");
  ok(Object.keys(ch["p1"] as object).length > 0, "거울 보유자 본인은 자기 앞도라를 본다");
  line(`  → 거울 보유자 p1은 도라 표시패를 못 보지만(${JSON.stringify(doraKindsIn(view(g, "p1")))}) 앞도라로 역산 가능`);
}

head("B) mirror_dora + dora_conceal 을 같은 사람(p0)이");
{
  const g = build(st, { p0: ["dora_conceal", "mirror_dora"] });
  const ch = mirrorChannels(g);
  for (const s of [...SEATS]) line(`  ${s}: ${JSON.stringify(ch[s])}`);
  ok(Object.keys(ch["p1"] as object).length === 0, "p1에게 안 샌다");
  ok(Object.keys(ch["p0"] as object).length > 0, "보유자는 본다");
}

head("C) dora_conceal 둘(p0·p1) + mirror_dora(p2) — 은폐끼리 서로를 가릴 때");
{
  const g = build(st, {
    p0: ["dora_conceal"],
    p1: ["dora_conceal"],
    p2: ["mirror_dora"],
  });
  const ch = mirrorChannels(g);
  for (const s of SEATS) line(`  ${s}: ${JSON.stringify(ch[s])}`);
  for (const s of SEATS) line(`  ${s} doraIndicators = ${JSON.stringify(doraKindsIn(view(g, s)))}`);
}

head("D) dora_afterimage(p0) + dora_conceal(p1) — 잔상 공개 채널");
{
  const g = build(
    st,
    { p0: ["dora_afterimage"], p1: ["dora_conceal"] },
    { "dora_afterimage:prevDora": [{ suit: "sou", rank: 3 }] },
  );
  const before = allViews(g);
  line(`  발동 전 p1 augmentView keys = ${JSON.stringify(Object.keys(before["p1"]!.augmentView).filter((k) => k.includes("afterimage")))}`);
  line(`  dora_recall → ${act(g, "p0", "dora_recall") ?? "ok"}`);
  const after = allViews(g);
  for (const s of SEATS) {
    const hits = Object.entries(after[s]!.augmentView).filter(([k]) => k.includes("afterimage"));
    line(`  ${s}: ${JSON.stringify(Object.fromEntries(hits))}`);
  }
  ok(
    !JSON.stringify(after["p2"]!.augmentView).includes(ind),
    "잔상 공개 채널이 이번 국 표시패를 알려 주지 않는다",
  );
}
