import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const ALL = [...standardAugments, ...contentAugments];
const byId = new Map(ALL.map(a => [a.id, a]));
const mine = "alchemist all_or_nothing always_tenpai ankan_dora aotenjou_ceiling async_chiitoi avenger big_hand blame_shift blind_ron blood_contract bluff_pretense bottom_deal bottom_yaku brief_fog broken_border broken_wall call_seal cliff_bloom conjure_draw cornucopia counter danger_sense dead_wall_master devils_advance die_hard disarm discard_lock discard_recall dora_afterimage dora_conceal eternal_dealer even_world foresight frame_up free_riichi_discard full_hand_swap future_sight genesis giant_god grave_rob haitei_lord hand_swap3 hidden_blade hidden_river honba_hunter honor_return hourglass invincible iron_wall jackpot joker karma last_stand late_bloomer late_bloomer_east late_double let_it_ride meld_dissolve".split(" ");
for (const id of mine) {
  const a = byId.get(id);
  if (!a) { console.log("MISSING", id); continue; }
  const eff = new Set<string>([...(a.conflicts ?? [])]);
  for (const o of ALL) if ((o.conflicts ?? []).includes(id)) eff.add(o.id);
  if (eff.size === 0) continue;
  const text = `${a.description} ${a.detail ?? ""}`;
  const names = [...eff].map(x => `${x}(${byId.get(x)?.name})`);
  const mentioned = [...eff].filter(x => text.includes(byId.get(x)?.name ?? "\0"));
  console.log(`${id}(${a.name}) eff=[${names.join(", ")}] textmentions=[${mentioned.join(",")}]`);
}
