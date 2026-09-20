import { contentAugments } from "@majak/content";
import { walkReplay } from "./replayWalk.js";

const path = process.argv[2] as string;
const t0 = Date.now();
let n = 0, matched = 0, unresolved = 0;
const byType: Record<string, number> = {};
const r = walkReplay(path, contentAugments, {
  onDecision: (dp) => {
    n++;
    const key = `${dp.kind}:${dp.actual?.type ?? "null"}:${dp.actualEventType}`;
    byType[key] = (byType[key] ?? 0) + 1;
    if (dp.actual === null) unresolved++;
    else if (dp.prompt.options.some((o) => JSON.stringify(o) === JSON.stringify(dp.actual))) matched++;
  },
  onDraft: (d) => { byType[`draft:${d.picked}`] = (byType[`draft:${d.picked}`] ?? 0) + 1; },
});
console.log({ mode: r.mode, seats: r.seats, events: r.events.length, points: n, matched, unresolved, ms: Date.now() - t0 });
console.log(byType);
