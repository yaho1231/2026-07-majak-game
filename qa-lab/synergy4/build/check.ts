/** conflicts / 존재 여부 검증 */
import { byId } from "../../harness.js";
import { BUILDS } from "./builds.js";
let bad = 0;
for (const b of BUILDS) {
  for (const id of b.ids) if (!byId.has(id)) { console.log(`MISSING ${b.key} ${id}`); bad++; }
  for (const a of b.ids) for (const c of b.ids) {
    if (a === c) continue;
    const conf = (byId.get(a)?.conflicts ?? []).includes(c);
    if (conf) { console.log(`CONFLICT ${b.key}: ${a} x ${c}`); bad++; }
  }
  const modes = b.ids.map((i) => byId.get(i)?.modes).filter((m) => m !== undefined);
  if (modes.length > 0) console.log(`MODES ${b.key}: ${JSON.stringify(modes)}`);
}
console.log(`builds=${BUILDS.length} problems=${bad}`);
