import { contentAugments } from "@majak/content";
const ids = ["spy","jackpot","big_hand","aotenjou_ceiling","counter","parasite","unification","devils_advance"];
const byId = new Map(contentAugments.map(d=>[d.id,d]));
for (const id of ids) {
  const d = byId.get(id);
  console.log(id, "conflicts:", d?.conflicts, "modes:", d?.modes, "tier:", d?.tier);
}
