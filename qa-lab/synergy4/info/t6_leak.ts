/**
 * T6 — 3~4장 겹쳐 든 정보 스택에서 «남의 전용 채널»이 내 뷰에 실리는가.
 *
 * 네 좌석이 각자 정보 카드를 3~4장씩 들고 전부 발동한 뒤,
 * 각 좌석의 augmentView가 **자기 것 + 전원 공개**만 담고 있는지 raw augmentData와 대조한다.
 * 관전 뷰는 전부 봐도 정상(설계).
 */
import {
  SEATS,
  act,
  base,
  build,
  head,
  line,
  ok,
  poke,
  view,
} from "./lib.js";
import type { PlayerId } from "./lib.js";

const STACKS: Record<PlayerId, string[]> = {
  p0: ["xray_hand", "tenpai_scan", "dora_conceal", "bottom_deal"],
  p1: ["ura_peek", "danger_sense", "mirror_dora", "triple_peek"],
  p2: ["dead_wall_master", "hidden_river", "foresight"],
  p3: ["rinshan_preview", "brief_fog", "peek_riichi_waits", "dora_afterimage"],
};

const ACT: Record<string, string> = {
  xray_hand: "xray_reveal",
  tenpai_scan: "tenpai_scan_use",
  ura_peek: "ura_peek_reveal",
  danger_sense: "danger_sense_use",
  triple_peek: "triple_peek_use",
  hidden_river: "declare_fog",
  brief_fog: "declare_brief_fog",
  foresight: "foresight_reveal",
};

head("네 좌석이 정보 카드를 3~4장씩 — 각자 자기 순에 전부 발동");
const g = build(base(), STACKS);
for (let seat = 0; seat < 4; seat++) {
  const id = `p${seat}` as PlayerId;
  for (const aug of STACKS[id]!) {
    const type = ACT[aug];
    if (type === undefined) continue;
    const err = act(g, id, type);
    line(`  ${id} ${type} → ${err ?? "ok"}`);
  }
  if (seat < 3) {
    const e = poke(g);
    if (e !== null) line(`  (poke 실패: ${e})`);
    // 반응 페이즈면 나머지 셋이 패스해 다음 사람 순으로 넘긴다
    for (const other of SEATS) if (other !== id) act(g, other, "pass");
  }
}

head("채널 격리 검사");
const raw = g.engine.state.augmentData;
const privateOf: Record<string, string[]> = {};
for (const k of Object.keys(raw)) {
  const m = /^view:(p\d):(.+)$/.exec(k);
  if (m === null) continue;
  (privateOf[m[1]!] ??= []).push(m[2]!.replace(/#round.*$/, ""));
}
for (const s of SEATS) {
  const v = view(g, s);
  const keys = new Set(Object.keys(v.augmentView));
  const foreign: string[] = [];
  for (const [owner, chans] of Object.entries(privateOf)) {
    if (owner === s) continue;
    for (const c of chans) {
      // 같은 채널 이름을 내가 소유하고 있으면 내 것이 실린 것 — 제외
      if ((privateOf[s] ?? []).includes(c)) continue;
      if (keys.has(c)) foreign.push(`${owner}의 ${c}`);
    }
  }
  line(`  ${s}: 채널 ${keys.size}개 / 남의 전용 채널 ${foreign.length}개 ${foreign.slice(0, 6).join(", ")}`);
  ok(foreign.length === 0, `${s} 뷰에 남의 전용 채널이 없다`);
}

head("좌석별 열람 요약");
for (const s of SEATS) {
  const v = view(g, s);
  const others = SEATS.filter((o) => o !== s);
  line(
    `  ${s} [${STACKS[s]!.join(",")}]  tiles=${Object.keys(v.tiles).length}` +
      ` 남의손=${others.reduce((n, o) => n + (v.zones[`hand:${o}`]?.tileIds.length ?? 0), 0)}` +
      ` 왕패=${v.zones["deadWall"]?.tileIds.length ?? 0}` +
      ` 패산=${v.zones["wall"]?.tileIds.length ?? 0}` +
      ` 도라표시=${v.round.doraIndicators.length}`,
  );
}
