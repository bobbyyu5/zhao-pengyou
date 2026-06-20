// Accounts + progress API smoke test (in-memory mode). Verifies guest accounts, progress
// storage, the multi-device merge rule (max counts, union unlocks), and auth rejection.
// Run: node server/api-smoke.mjs

process.env.PORT = process.env.PORT || "8801";
await import("./server.js");
await new Promise((r) => setTimeout(r, 400));

const B = `http://localhost:${process.env.PORT}`;
let fail = false;
const ok = (c, m) => { if (!c) { fail = true; console.error("✖", m); } else console.log("✔", m); };

const g = await (await fetch(B + "/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Mom" }) })).json();
ok(g.token && g.userId, "guest account created with token");

const auth = { "content-type": "application/json", authorization: `Bearer ${g.token}` };
const p1 = await (await fetch(B + "/api/progress", { method: "POST", headers: auth, body: JSON.stringify({ handsPlayed: 5, handsWon: 2, streak: 3, unlocked: ["cinnabar-seal", "brass-medallion"] }) })).json();
ok(p1.handsPlayed === 5 && p1.streak === 3, "progress stored");

// a second device pushes lower counts / different unlocks → merge keeps the best of both
const p2 = await (await fetch(B + "/api/progress", { method: "POST", headers: auth, body: JSON.stringify({ handsPlayed: 3, handsWon: 4, unlocked: ["plum-blossom"] }) })).json();
ok(p2.handsPlayed === 5 && p2.handsWon === 4, "merge takes the max of counts (multi-device safe)");
ok(p2.unlocked.includes("brass-medallion") && p2.unlocked.includes("plum-blossom"), "merge unions unlocked card backs");

const u = await fetch(B + "/api/progress", { method: "GET" });
ok(u.status === 401, "rejects a request with no token");

// ── friends + leaderboard ──
const me = await (await fetch(B + "/api/me", { headers: auth })).json();
ok(me.friendCode && me.friendCode.length === 7, "account has a 7-char friend code");

// second player (Dad), give them a higher best streak
const g2 = await (await fetch(B + "/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Dad" }) })).json();
const auth2 = { "content-type": "application/json", authorization: `Bearer ${g2.token}` };
await fetch(B + "/api/progress", { method: "POST", headers: auth2, body: JSON.stringify({ handsWon: 9, bestStreak: 7 }) });

// Mom adds Dad by code
const add = await (await fetch(B + "/api/friends/add", { method: "POST", headers: auth, body: JSON.stringify({ code: g2.friendCode }) })).json();
ok(add.ok && add.friend.name === "Dad", "added friend by code");

const lb = await (await fetch(B + "/api/leaderboard", { headers: auth })).json();
ok(lb.length === 2, "leaderboard shows you + friend");
ok(lb[0].name === "Dad" && lb[0].rank === 1, "ranked by best streak (Dad's 7 leads)");
ok(lb.some((r) => r.you), "leaderboard marks which row is you");

const bad = await fetch(B + "/api/friends/add", { method: "POST", headers: auth, body: JSON.stringify({ code: "ZZZZZZZ" }) });
ok(bad.status === 404, "unknown friend code is rejected");

console.log(fail ? "\nAPI SMOKE FAILED" : "\nAPI SMOKE OK ✅");
process.exit(fail ? 1 : 0);
