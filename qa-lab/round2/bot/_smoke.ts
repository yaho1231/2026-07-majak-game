import { runArena, formatArena } from "../../../packages/server/src/bot/arena.js";
const t=Date.now();
const r = await runArena({ games: 5, seed: 1, mode: "tonpuu" });
console.log(formatArena(r), "ms", Date.now()-t);
