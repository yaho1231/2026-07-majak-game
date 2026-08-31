/** 14b — 양극+결속으로만 서는 «무늬 섞인 노두 몸통» 손의 역만 */
import { contentAugments } from "@majak/content";
import { measure, line } from "./lib.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;
const on = (...ids: string[]) => (state: any, holder: any) => Object.fromEntries(ids.map((id) => [roundScopedKey(id, "on", state, holder), true]));
const t = "1m9p1s1m9p1s9m1p9s9m1p9s11m";
console.log("장수", t.replace(/[mps]/g, "").length);
line("양극+결속", measure({ hand: t, winType: "tsumo", data: on("mixed_triplet") }, [A("polar_ends"), A("mixed_triplet")]));
line("결속만", measure({ hand: t, winType: "tsumo", data: on("mixed_triplet") }, [A("mixed_triplet")]));
line("양극만", measure({ hand: t, winType: "tsumo" }, [A("polar_ends")]));
line("양극+결속+탕해방", measure({ hand: t, winType: "tsumo", data: on("mixed_triplet") }, [A("polar_ends"), A("mixed_triplet"), A("tanyao_break")]));
