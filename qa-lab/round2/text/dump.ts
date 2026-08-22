import { contentAugments } from "@majak/content";
import { standardAugments } from "@majak/core";
const all = [...(standardAugments as any[]), ...contentAugments];
const rows = all.map((a) => ({
  id: a.id, tier: a.tier, category: a.category, complexity: a.complexity ?? null,
  name: a.name, description: a.description, detail: a.detail ?? "",
  conflicts: a.conflicts ?? [], modes: a.modes ?? [], draftStages: a.draftStages ?? [],
  hasBot: !!a.bot,
}));
console.log(JSON.stringify(rows, null, 1));
