/**
 * s10 — 중계 패널(spectateInsight)이 증강의 분해 규칙을 무시한다.
 *
 * 같은 화면 위에 숫자가 둘 있다:
 *  · 좌석 뱃지(클라이언트 OpponentStrip) — `waitDecompOptions()`로 **그 좌석의
 *    증강**(공개 정보)을 반영해 대기·샹텐을 잰다.
 *  · 중계 패널(서버 spectateInsight) — `shantenOf(hand, meldCount)`.
 *    옵션 인자를 아예 넘기지 않는다(spectateInsight.ts:93). 관전 뷰의
 *    `scoringOptions`도 SPECTATOR_ID 면 `{}`다(PlayerView.ts:678).
 *
 * `shantenOf`가 실제로 반영하는 옵션은 totalSets · wildKinds · kokushiOnly 셋이다.
 * 그 셋을 켜는 증강을 든 좌석에서 두 숫자가 갈린다 — 같은 화면, 같은 좌석.
 */
import { shantenOf } from "../../../packages/core/src/index.js";
import type { TileKind } from "../../../packages/core/src/index.js";

const k = (s: string): TileKind => {
  const suit =
    s[0] === "m" ? "man" : s[0] === "p" ? "pin" : s[0] === "s" ? "sou" : s[0] === "w" ? "wind" : "dragon";
  return { suit, rank: Number(s.slice(1)) } as TileKind;
};
const hand = (t: string) => t.split(" ").map(k);

const cases = [
  {
    aug: "true_dragon (진짜 용 · 5멘쯔)",
    opt: { totalSets: 5 },
    tiles: "m1 m2 m3 p1 p2 p3 s1 s2 s3 w1 w1 w1 d1",
  },
  {
    aug: "joker (조커 · 백이 만능패)",
    opt: { wildKinds: [{ suit: "dragon", rank: 1 }] },
    tiles: "m1 m2 m3 p1 p2 p3 s1 s2 s9 w1 w1 d1 d1",
  },
  {
    aug: "open_kokushi (우는 국사무쌍)",
    opt: { kokushiOnly: true },
    tiles: "m1 m9 p1 p9 s1 s9 w1 w2 w3 w4 d1 d2 d3",
  },
] as const;

for (const c of cases) {
  const h = hand(c.tiles) as any;
  const panel = shantenOf(h, 0); // 서버 중계 패널
  const badge = shantenOf(h, 0, c.opt as any); // 클라 좌석 뱃지
  const label = (n: number) => (n < 0 ? "화료형" : n === 0 ? "텐파이" : `${n}샹텐`);
  console.log(
    `${c.aug.padEnd(30)} 패널 ${label(panel).padEnd(6)} / 뱃지 ${label(badge).padEnd(6)} ${panel !== badge ? "← 어긋남" : ""}`,
  );
}
process.exit(0);
