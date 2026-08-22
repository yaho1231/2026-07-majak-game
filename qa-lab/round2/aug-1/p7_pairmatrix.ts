/**
 * 정산 계열 담당 증강 2개 조합 전수 — 론 한 판을 흘려보내고
 * "지지 않은 사람이 이득을 보지 않는가 / 총액이 근거 없이 새지 않는가"를 본다.
 *
 * 불변식
 *  A) 쏜 사람(discarder)의 최종 delta > 0 이면 이상 (죽기살기 보유자는 예외)
 *  B) 화료자도 방총자도 아닌 사람이 +가 되면 이상 (죽기살기 예외)
 *  C) sum(deltas) != sum(augPoints) 이면 뱅크 발행이 근거 없이 샜다
 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, win, sum, roundKeyOf } from "./rig.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));

/** 각 증강을 "지금 켜져 있는" 상태로 만드는 augmentData */
function armData(id: string, holder: string, rk: string): Record<string, unknown> {
  switch (id) {
    case "blind_ron":
      return { [`blind_ron:armedRound:${holder}`]: rk };
    case "big_hand":
      return { [`big_hand:round:${holder}`]: rk };
    case "blood_contract":
      return { [`blood_contract:yaku:${rk}:${holder}#round`]: "tanyao" };
    case "all_or_nothing":
      return { [`all_or_nothing:active:${rk}:${holder}#round`]: 12000 };
    default:
      return {};
  }
}

const IDS = [
  "all_or_nothing", "aotenjou_ceiling", "big_hand", "blame_shift", "blind_ron",
  "blood_contract", "devils_advance", "die_hard",
];
const SEATS = ["p0", "p1", "p2", "p3"];

let checked = 0;
const hits: string[] = [];

for (const a of IDS) {
  for (const b of IDS) {
    for (const sa of SEATS) {
      for (const sb of SEATS) {
        if (a === b && sa === sb) continue;
        for (let honba = 0; honba < 4; honba++) {
          const augments: Record<string, unknown[]> = {};
          (augments[sa] ??= []).push(A.get(a)!);
          (augments[sb] ??= []).push(A.get(b)!);
          const probe = scene({ augments: augments as never, honba });
          const rk = roundKeyOf(probe);
          const data = { ...armData(a, sa, rk), ...armData(b, sb, rk) };
          const gm = scene({ augments: augments as never, data, honba, scores: { p0: 25000, p1: 25000, p2: 25000, p3: 25000 } });
          // 리치 상태(올인·카운터 게이트용)
          for (const s of [sa, sb]) {
            const bp = gm.engine.state.round.byPlayer as Record<string, Record<string, unknown>>;
            bp[s] = { ...(bp[s] ?? {}), riichi: { turn: 1, ippatsu: false, double: false } };
          }
          // p3 화료(론), p1 방총, 8000점
          const before = { p0: 0, p1: -8000, p2: 0, p3: 8000 };
          const info = win({
            winner: "p3", from: "p1", winType: "ron", points: 8000,
            han: 5, fu: 30, limit: "mangan",
          } as never);
          let out;
          try {
            out = settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] }));
          } catch (e) {
            hits.push(`THROW ${a}@${sa} × ${b}@${sb} honba=${honba}: ${String(e)}`);
            continue;
          }
          checked++;
          const d = out.deltas as Record<string, number>;
          const notes = (out.augPoints ?? []) as { player: string; augId: string; points: number }[];
          const dieHard = new Set(
            [sa, sb].filter((s) => (s === sa ? a : b) === "die_hard"),
          );
          const tag = `${a}@${sa} × ${b}@${sb} honba=${honba}`;
          if ((d["p1"] ?? 0) > 0 && !dieHard.has("p1")) {
            hits.push(`A 쏜사람 이득  ${tag}  ${JSON.stringify(d)}`);
          }
          for (const s of SEATS) {
            if (s === "p3" || s === "p1") continue;
            if ((d[s] ?? 0) > 0 && !dieHard.has(s)) {
              hits.push(`B 무관자 이득  ${tag}  seat=${s} ${JSON.stringify(d)}`);
            }
          }
          // C: 뱅크 발행 총액 = augPoints 중 뱅크 발행분. 재배선 노트는 합이 0이 되므로
          //    전체 노트 합과 deltas 합이 같아야 한다.
          const noteSum = notes.reduce((s2, n) => s2 + n.points, 0);
          if (sum(d) !== noteSum) {
            hits.push(`C 근거 불일치  ${tag}  sumΔ=${sum(d)} sumNotes=${noteSum} ${JSON.stringify(d)} ${JSON.stringify(notes)}`);
          }
        }
      }
    }
  }
}

const uniq = [...new Set(hits.map((h) => h.replace(/honba=\d/, "honba=*")))];
console.log(`checked=${checked}  hits=${hits.length} (unique=${uniq.length})`);
for (const h of uniq.slice(0, 60)) console.log("  " + h);
