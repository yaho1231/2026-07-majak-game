import { runDraftMatch, auditAugments, auditSchedule, auditEnd, auditRoundScope } from "./lib.js";

const rep = await runDraftMatch({ seed: 1, mode: "hanchan" });
console.log("rounds", rep.rounds, "end", rep.endReason, rep.finalRound, rep.finalScores);
console.log("drafts", rep.drafts.map((d) => `${d.stage}@${d.wind}-${d.round}-${d.honba}`).join(" "));
console.log("held", JSON.stringify(rep.finalAugments));
console.log("crash", rep.crash);
console.log("effectErrors", rep.effectErrors.slice(0, 5));
console.log("violations", rep.violations.slice(0, 5));
console.log("audit", auditAugments(rep), auditSchedule(rep), auditEnd(rep), auditRoundScope(rep).slice(0, 10));
console.log("digest", rep.logDigest);
