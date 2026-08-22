import { signup, hostRoomWithBots, health, sleep } from "./lib.js";

const { c, auth, name } = await signup();
console.log("auth", name, "seat?", Object.keys(auth));
const code = await hostRoomWithBots(c, "tonpuu");
console.log("room", code);
const v = await c.wait("view", 15000);
console.log("first view keys", Object.keys(v));
console.log("health", await health());
c.close();
await sleep(300);
process.exit(0);
