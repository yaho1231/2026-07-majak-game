/**
 * 쯔모 화료 / 유국 시나리오로 담당 정산 증강 2개 조합을 훑는다.
 *  - 쯔모: 화료자 아닌 사람이 이득을 보면 이상 (die_hard 예외)
 *  - 유국: 총액 보존이 깨지면 이상 (승승장구는 제로섬이어야 한다)
 *  - 두 시나리오 모두 sum(deltas) == sum(augPoints) 여야 한다
 *    (가불 인생은 설계상 예외 — 9,000점이 뱅크로 사라진다, qa-lab/findings/pairs.md 부수확인 1)
 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, drawPayload, win, sum, roundKeyOf } from "./rig.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));

function armData(id: string, holder: string, rk: string): Record<string, unknown> {
  switch (id) {
    case "blind_ron": return { [`blind_ron:armedRound:${holder}`]: rk };
    case "big_hand": return { [`big_hand:round:${holder}`]: rk };
    case "blood_contract": return { [`blood_contract:yaku:${rk}:${holder}#round`]: "tanyao" };
    case "all_or_nothing": return { [`all_or_nothing:active:${rk}:${holder}#round`]: 12000 };
    default: return {};
  }
}

const IDS = [
  "all_or_nothing", "always_tenpai", "aotenjou_ceiling", "big_hand", "blame_shift",
  "blind_ron", "blood_contract", "devils_advance", "die_hard",
];
const SEATS = ["p0", "p1", "p2", "p3"];
const hits: string[] = [];
let checked = 0;

for (const a of IDS) {
  for (const b of IDS) {
    for (const sa of SEATS) {
      for (const sb of SEATS) {
        if (a === b && sa === sb) continue;
        const augments: Record<string, unknown[]> = {};
        (augments[sa] ??= []).push(A.get(a)!);
        (augments[sb] ??= []).push(A.get(b)!);
        const probe = scene({ augments: augments as never });
        const rk = roundKeyOf(probe);
        const data = { ...armData(a, sa, rk), ...armData(b, sb, rk) };
        const gm = scene({ augments: augments as never, data, scores: { p0: 25000, p1: 25000, p2: 25000, p3: 25000 } });
        for (const s of [sa, sb]) {
          const bp = gm.engine.state.round.byPlayer as Record<string, Record<string, unknown>>;
          bp[s] = { ...(bp[s] ?? {}), riichi: { turn: 1, ippatsu: false, double: false } };
        }
        const dieHard = new Set([sa, sb].filter((s) => (s === sa ? a : b) === "die_hard"));
        const hasDevils = a === "devils_advance" || b === "devils_advance";
        const tag = `${a}@${sa} × ${b}@${sb}`;

        // ── 쯔모 (p3 자, 만관 8000) ──
        {
          const before = { p0: -2000, p1: -2000, p2: -4000, p3: 8000 };
          const info = win({ winner: "p3", from: null, winType: "tsumo", points: 8000, han: 5, fu: 30, limit: "mangan" } as never);
          const out = settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] }));
          const d = out.deltas as Record<string, number>;
          const notes = (out.augPoints ?? []) as { player: string; points: number }[];
          checked++;
          for (const s of SEATS) {
            if (s === "p3") continue;
            if ((d[s] ?? 0) > 0 && !dieHard.has(s)) hits.push(`TSUMO 무관자 이득 ${tag} seat=${s} ${JSON.stringify(d)}`);
          }
          const ns = notes.reduce((x, n) => x + n.points, 0);
          if (sum(d) !== ns && !hasDevils) hits.push(`TSUMO 근거 불일치 ${tag} sumΔ=${sum(d)} notes=${ns} ${JSON.stringify(d)}`);
        }

        // ── 유국 (p0만 텐파이) ──
        {
          const before = { p0: 3000, p1: -1000, p2: -1000, p3: -1000 };
          const out = settle(gm, drawPayload(gm, { deltas: { ...before }, tenpaiPlayers: ["p0"] }));
          const d = out.deltas as Record<string, number>;
          const notes = (out.augPoints ?? []) as { player: string; points: number }[];
          checked++;
          if (sum(d) !== 0 && !dieHard.size) hits.push(`DRAW 총액 ${sum(d)} ${tag} ${JSON.stringify(d)}`);
          const ns = notes.reduce((x, n) => x + n.points, 0);
          if (sum(d) !== ns && !hasDevils && ns !== 0) hits.push(`DRAW 근거 불일치 ${tag} sumΔ=${sum(d)} notes=${ns}`);
        }
      }
    }
  }
}
const uniq = [...new Set(hits)];
console.log(`checked=${checked} hits=${hits.length} unique=${uniq.length}`);
for (const h of uniq.slice(0, 50)) console.log("  " + h);
