import { AUGMENT_POWER_TIERS, powerScore, formulaTier, shiftTier } from "@majak/core";
const T = AUGMENT_POWER_TIERS as Record<string, any>;
const ids = process.argv.slice(2);
const list = ids.length ? ids : Object.keys(T);
for (const id of list) {
  const e = T[id]; if (!e) { console.log(id, "MISSING"); continue; }
  const sc = powerScore(e);
  const t = e.fixed ?? shiftTier(formulaTier(sc), e.shift ?? 0);
  console.log(`${id}\t${sc}\t${t}\tshift=${e.shift ?? 0}`);
}
