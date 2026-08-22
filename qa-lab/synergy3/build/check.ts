import { contentAugments } from "@majak/content";
import { BUILDS } from "./builds.js";

const by = new Map(contentAugments.map((d) => [d.id, d]));
for (const b of BUILDS) {
  const problems: string[] = [];
  for (const id of b.ids) {
    const d = by.get(id);
    if (d === undefined) { problems.push(`MISSING ${id}`); continue; }
    if (d.modes !== undefined && !d.modes.includes(b.mode)) problems.push(`MODE ${id} = ${d.modes.join(",")}`);
    for (const o of b.ids) {
      if (o === id) continue;
      if ((d.conflicts ?? []).includes(o)) problems.push(`CONFLICT ${id} x ${o}`);
    }
  }
  console.log(`${b.key.padEnd(9)} ${b.ids.join(" + ")}  ${problems.length === 0 ? "OK" : "!! " + problems.join(" | ")}`);
}
