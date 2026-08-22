import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const stages: Record<string,string[]> = {
  hanchan: ["gameStart","eastThird","southEntry","southThird"],
  tonpuu: ["gameStart","eastThird","eastFourth"],
};
for (const [mode, ss] of Object.entries(stages)) for (const st of ss) {
  const pool = all.filter(d => (d.draftStages===undefined||d.draftStages.includes(st)) && (d.modes===undefined||d.modes.includes(mode)));
  const hard = st==="gameStart" ? pool.filter(d=>(d.complexity??2)>=3).length : 0;
  const fit = Math.floor((pool.length-6)/4);
  console.log(`${mode} ${st}: offerable=${pool.length} fit=${fit} cell=${Math.min(24,fit)} fallback=${Math.min(24,fit)<12} (gameStart hard-excl=${hard})`);
}
