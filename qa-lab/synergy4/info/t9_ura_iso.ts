/** T9 — 같은 정보 카드를 둘이 들었을 때, 한쪽이 본 내용이 다른 쪽 뷰에 실리는가. */
import { act, base, build, head, line, ok, view } from "./lib.js";
head("ura_peek을 p0·p1이 함께 — p0만 발동");
const g = build(base(), { p0: ["ura_peek"], p1: ["ura_peek"] });
line(`  p0 ura_peek_reveal → ${act(g, "p0", "ura_peek_reveal") ?? "ok"}`);
const raw = Object.entries(g.engine.state.augmentData).filter(([k]) => k.includes(":ura"));
line(`  raw = ${JSON.stringify(raw)}`);
for (const s of ["p0", "p1", "p2"] as const) {
  const v = view(g, s);
  line(`  ${s}.augmentView.ura = ${JSON.stringify(v.augmentView["ura"])}`);
}
ok(
  (view(g, "p1").augmentView["ura"] as unknown[] | undefined) === undefined ||
    (view(g, "p1").augmentView["ura"] as unknown[]).length === 0,
  "p1(미발동 보유자)에게 p0가 본 뒷도라가 실리지 않는다",
);
ok(view(g, "p2").augmentView["ura"] === undefined, "p2(비보유자)에게 실리지 않는다");

head("tenpai_scan을 p0·p1이 함께 — p0만 발동");
const g2 = build(base(), { p0: ["tenpai_scan"], p1: ["tenpai_scan"] });
line(`  p0 tenpai_scan_use → ${act(g2, "p0", "tenpai_scan_use") ?? "ok"}`);
for (const s of ["p0", "p1", "p2"] as const) {
  line(`  ${s}.augmentView.tenpai_scan = ${JSON.stringify(view(g2, s).augmentView["tenpai_scan"])}`);
}
ok(view(g2, "p1").augmentView["tenpai_scan"] === undefined, "p1에게 p0의 스캔 결과가 실리지 않는다");
