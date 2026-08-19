import { Prng } from "@majak/core";
import { PERSONAS, SEATS, runMatch } from "../harness.js";
import { riichiCheck, bumpRound } from "./check.js";
const preset = {p0:["open_riichi_reveal","free_riichi_discard"],p1:["siege_riichi","all_or_nothing"],p2:["palm_flip","no_retreat"],p3:["riichi_seal","late_double"]} as const;
const box:{w:null}={w:null};
const r = await runMatch({ seed:1, preset: preset as never,
  personas:{p0:PERSONAS.riichiRusher!,p1:{name:"m",augmentBias:.95,riichiBias:1,callBias:.15,kanBias:.4,alwaysWin:true},p2:PERSONAS.caller!,p3:PERSONAS.folder!},
  onRound:(st,ph)=>{ if(ph==="start"){bumpRound();console.log("START",st.round.prevalentWind,st.round.roundNumber,st.round.honba);} },
  onState:(st,out)=>riichiCheck(st,out,box as never)});
for (const v of r.violations) console.log(v.kind, v.round, v.seat, v.detail);
