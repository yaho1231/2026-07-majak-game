import { signup, sleep, uniq } from "./lib.js";
const { c, auth } = await signup(uniq("ADM"), "qatest1234", "qaadmin123");
console.log("isAdmin", auth.isAdmin);
await sleep(500);
for (const t of ["adminUsers", "liveGames", "leaderboard", "adminAugmentTiers"]) {
  c.send({ type: t });
  await sleep(1500);
  console.log(t, "->", c.log.slice(-1).map(m=>m.type).join(","));
}
console.log("all types:", c.log.map(m=>m.type).join(","));
const lg = c.last("liveGames");
console.log("liveGames rooms:", lg ? lg.rooms?.length : "NONE");
process.exit(0);
