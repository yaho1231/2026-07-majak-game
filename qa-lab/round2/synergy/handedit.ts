/**
 * 손패를 물리적으로 바꾸는 것들만 골라 **한 좌석에 3개**씩 몰아 준다.
 * swap·split·dyeing·unify·되감기 계열이 서로를 밟으면 장수/총량이 깨진다.
 * 사용: tsx qa-lab/round2/synergy/handedit.ts <shard> <shards> <games> <mode>
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, SEATS, conflicting, offerable, byId, runMatch, pairInvariants } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";
const POOL = ["full_hand_swap","hand_swap3","silent_swap","tile_split","tile_dyeing","suit_unify",
  "honor_return","north_trader","palm_flip","take_back","regret","grave_rob","pond_snatch",
  "seat_swap","table_flip","meld_dissolve","true_dragon","genesis","giant_god","three_dragons_will",
  "broken_border","mixed_nine_gates","royal_kokushi","async_chiitoi","conjure_draw","picky_eater",
  "brief_fog","xray_hand","big_hand","sign_flip"].filter((id) => byId.get(id) !== undefined);
const shard=Number(process.argv[2]??0), shards=Number(process.argv[3]??1);
const games=Number(process.argv[4]??120), mode=(process.argv[5]??"tonpuu") as "hanchan"|"tonpuu";
const usable = POOL.filter((id)=>offerable(byId.get(id)!, mode));
const mixes: Persona[][] = [
  [PERSONAS.masher!,PERSONAS.masher!,PERSONAS.masher!,PERSONAS.masher!],
  [PERSONAS.masher!,PERSONAS.caller!,PERSONAS.riichiRusher!,PERSONAS.chaos!],
  [PERSONAS.chaos!,PERSONAS.chaos!,PERSONAS.caller!,PERSONAS.stall!],
];
let ok=0,crash=0,eff=0,viol=0,rounds=0; const t0=Date.now();
for (let i=0;i<games;i++){
  if (i%shards!==shard) continue;
  const seed=6_000_000+i*29;
  const rng=new Prng(seed*7919+3);
  const taken=new Set<string>();
  const preset:Record<string,string[]>={p0:[],p1:[],p2:[],p3:[]};
  for (const s of SEATS){
    const held:string[]=[]; let g=0;
    while(held.length<3 && g++<400){
      const id=usable[rng.int(usable.length)]!;
      if (taken.has(id)) continue;
      if (held.some(h=>conflicting(h,id))) continue;
      held.push(id); taken.add(id);
    }
    preset[s]=held;
  }
  const inv=pairInvariants(preset["p0"] as string[]);
  const mx=mixes[i%mixes.length]!;
  let r;
  try { r = await runMatch({ seed, mode, preset: preset as never,
    personas:{p0:mx[0]!,p1:mx[1]!,p2:mx[2]!,p3:mx[3]!} as Record<PlayerId,Persona>,
    onState: inv.onState, onRound: inv.onRound, timeoutMs:120_000 }); }
  catch(e){ crash++; console.log(`THROW seed=${seed} ${JSON.stringify(preset)}\n  ${String(e).slice(0,200)}`); continue; }
  ok++; rounds+=r.rounds;
  const tag=`seed=${seed} ${mode} ${JSON.stringify(preset)}`;
  if (r.crash!==undefined){crash++;console.log(`CRASH ${tag}\n  ${r.crash.slice(0,300)}`);}
  if (r.effectErrors.length>0){eff++;console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0,4).join("\n  ")}`);}
  const bad=r.violations.filter(v=>v.kind!=="SCORE_DRIFT_ATTRIBUTED" && !(v.kind==="HAND_SIZE_STRICT" && v.detail.includes("true_dragon")));
  if (bad.length>0){viol++;console.log(`VIOL ${tag}\n  ${JSON.stringify(bad.slice(0,6))}`);}
  if (ok%20===0) console.log(`-- s${shard} ${ok}g ${rounds}r ${(Date.now()-t0)/1000|0}s crash=${crash} eff=${eff} viol=${viol}`);
}
console.log(`DONE shard=${shard} games=${ok} rounds=${rounds} crash=${crash} eff=${eff} viol=${viol}`);
