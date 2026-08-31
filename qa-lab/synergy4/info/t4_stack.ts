/**
 * T4 — «정보 카드 둘을 겹치면 실제로 더 많이 보이는가».
 *
 * 같은 상태에서 단독 A / 단독 B / A+B 를 재고, p0가 정체를 아는 패의 수(|tiles|)와
 * 존별 열람 장수를 비교한다. A+B가 max(A,B)보다 **크거나 같지 않으면** 겹침이 서로를 깎은 것.
 *
 * 예측: 왕패 열람 셋(왕패의 주인 14 / 영상 정찰 4 / 이면투시 14)은 같은 규칙
 * `visibility.deadWall`을 widenPeek으로 넓히므로 «넓은 쪽»이 이겨야 한다.
 * 패산은 밑장빼기 하나뿐이라 충돌이 없다. 채널형(예지·삼세 예지·천리안…)은 키가 달라 합쳐져야 한다.
 */
import {
  DEAD_WALL,
  SEATS,
  WALL,
  act,
  base,
  build,
  head,
  handZone,
  line,
  view,
} from "./lib.js";
import type { PlayerView } from "./lib.js";

/** 활성화가 필요한 카드는 여기서 발동한다 (p0 기준, turn.act·p0 차례) */
const ACTIVATE: Record<string, (g: ReturnType<typeof build>) => string | null> = {
  ura_peek: (g) => act(g, "p0", "ura_peek_reveal"),
  xray_hand: (g) => act(g, "p0", "xray_reveal"),
  triple_peek: (g) => act(g, "p0", "triple_peek_use"),
  foresight: (g) => act(g, "p0", "foresight_reveal"),
  tenpai_scan: (g) => act(g, "p0", "tenpai_scan_use"),
  danger_sense: (g) => act(g, "p0", "danger_sense_use"),
  hidden_river: (g) => act(g, "p0", "declare_fog"),
  brief_fog: (g) => act(g, "p0", "declare_brief_fog"),
  bottom_deal: () => null, // 열람은 상시
  dead_wall_master: () => null,
  rinshan_preview: () => null,
  cliff_bloom: () => null,
  dora_conceal: () => null,
  mirror_dora: () => null,
};

interface Metric {
  tiles: number;
  wall: number;
  dead: number;
  hands: number;
  chans: string[];
}

function measure(ids: readonly string[]): Metric {
  const g = build(base(), { p0: ids });
  for (const id of ids) {
    const f = ACTIVATE[id];
    if (f !== undefined) {
      const err = f(g);
      if (err !== null) line(`      (발동 실패 ${id}: ${err})`);
    }
  }
  const v: PlayerView = view(g, "p0");
  return {
    tiles: Object.keys(v.tiles).length,
    wall: v.zones[WALL]?.tileIds.length ?? 0,
    dead: v.zones[DEAD_WALL]?.tileIds.length ?? 0,
    hands: SEATS.filter((s) => s !== "p0").reduce(
      (n, s) => n + (v.zones[handZone(s)]?.tileIds.length ?? 0),
      0,
    ),
    chans: Object.keys(v.augmentView).sort(),
  };
}

function fmt(m: Metric): string {
  return `tiles=${m.tiles} wall=${m.wall} dead=${m.dead} 남의손=${m.hands}`;
}

const PAIRS: [string, string][] = [
  ["dead_wall_master", "rinshan_preview"],
  ["dead_wall_master", "ura_peek"],
  ["rinshan_preview", "ura_peek"],
  ["dead_wall_master", "cliff_bloom"],
  ["rinshan_preview", "cliff_bloom"],
  ["bottom_deal", "dead_wall_master"],
  ["bottom_deal", "foresight"],
  ["bottom_deal", "triple_peek"],
  ["foresight", "triple_peek"],
  ["foresight", "ura_peek"],
  ["xray_hand", "tenpai_scan"],
  ["xray_hand", "danger_sense"],
  ["tenpai_scan", "danger_sense"],
  ["xray_hand", "bottom_deal"],
  ["dora_conceal", "mirror_dora"],
  ["hidden_river", "brief_fog"],
];

for (const [a, b] of PAIRS) {
  head(`${a} × ${b}`);
  const ma = measure([a]);
  const mb = measure([b]);
  const mab = measure([a, b]);
  line(`  단독 ${a}: ${fmt(ma)}`);
  line(`  단독 ${b}: ${fmt(mb)}`);
  line(`  A+B     : ${fmt(mab)}`);
  const worse: string[] = [];
  for (const k of ["tiles", "wall", "dead", "hands"] as const) {
    const m = Math.max(ma[k], mb[k]);
    if (mab[k] < m) worse.push(`${k}: A+B=${mab[k]} < max(단독)=${m}`);
  }
  const lost = [...new Set([...ma.chans, ...mb.chans])].filter((c) => !mab.chans.includes(c));
  if (lost.length > 0) worse.push(`사라진 채널: ${lost.join(",")}`);
  line(worse.length === 0 ? "  OK  겹쳐도 깎이지 않는다" : `  !!  ${worse.join(" | ")}`);
}
