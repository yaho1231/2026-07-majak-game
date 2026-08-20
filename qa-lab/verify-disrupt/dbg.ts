import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { ActionOption, AugmentDef, DecisionPrompt, DraftStage, PlayerAgent, PlayerId, PlayerView } from "@majak/core";
import { contentAugments } from "@majak/content";
import { lockedDiscardIds, sealedDiscardIds, handIdsOf } from "@majak/core";
let GAME: any = null;
let n=0; let seen=false;
class A implements PlayerAgent {
  readonly isBot = true; nickname: string;
  constructor(readonly id: PlayerId) { this.nickname = id; }
  sendView(v: PlayerView): void {
    const s = v.sealedTileIds ?? [];
    const ch = Object.keys(v.augmentView).filter(k=>k.startsWith("sealed:")||k.startsWith("discardLockReveal:"));
    if (n<8 && seen && this.id==="p1" && GAME) { n++; const st=GAME.engine.state; console.log(this.id,"view.sealed=",JSON.stringify(s),"raw=",JSON.stringify([...sealedDiscardIds(st,GAME.engine.rules,"p1")]),"locked=",JSON.stringify([...lockedDiscardIds(st,GAME.engine.rules,"p1")]),"hand=",JSON.stringify(handIdsOf(st,"p1")),"key=",JSON.stringify(Object.entries(st.augmentData).filter(([k])=>k.includes("discardLockReveal")))); }
  }
  async decide(p: DecisionPrompt): Promise<ActionOption> {
    const o = p.options;
    if (this.id==="p0" && !seen) { const s=o.find(x=>x.type==="seal_hands"); if (s) { seen=true; console.log("SEAL offered & taken"); return s; } }
    const w=o.find(x=>x.type==="win"); if(w) return w;
    const pa=o.find(x=>x.type==="pass"); if(pa) return pa;
    const d=o.filter(x=>x.type==="discard"); if(d.length) return d[0]!;
    return o[0]!;
  }
  async decideDraft(_s: DraftStage, c: AugmentDef[]): Promise<string> { return c[0]!.id; }
}
const agents=(["p0","p1","p2","p3"] as PlayerId[]).map(i=>new A(i));
const ctrl=new HanchanController(agents,{...DEFAULT_HANCHAN_CONFIG,mode:"tonpuu",seed:3,maxWind:1,westEntry:false,draftSchedules:[],extraAugments:contentAugments,presetAugments:{p0:["discard_lock"],p1:[],p2:[],p3:[]},agentDecideTimeoutMs:20000} as never,{ onRoundStart: (g:any)=>{ GAME=g; } } as never);
await ctrl.run().catch(e=>console.log("end",String(e).slice(0,80)));
