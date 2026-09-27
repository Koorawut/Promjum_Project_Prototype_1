// Live probe of the production duplicate-login enforcement:
// 1) login as turncheck1 on socket A, connect
// 2) login AGAIN from a second client
// 3) verify socket A receives force_logout within a few seconds
// Usage: node test-force-logout.js
const API = "https://promjumprojectprototype1-production.up.railway.app";

async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const { io } = require("socket.io-client");

  const first = await login("dupprobe1", "TempPass1234!");
  console.log("[1] first login ok, duplicateLogin =", first.duplicateLogin);

  const socketA = io(API, {
    path: "/socket.io/",
    auth: { token: first.accessToken },
    transports: ["websocket"],
  });

  const gotForceLogout = new Promise((resolve) => {
    socketA.on("force_logout", (p) => resolve(`force_logout RECEIVED: ${p.message}`));
  });

  await new Promise((resolve, reject) => {
    socketA.on("connect", resolve);
    socketA.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket A connect timeout (10s)")), 10_000);
  });
  console.log("[2] socket A connected:", socketA.id);

  // Give it a moment, then do the duplicate login.
  await new Promise((r) => setTimeout(r, 1000));
  console.log("[3] logging in again (duplicate)...");
  const second = await login("dupprobe1", "TempPass1234!");
  console.log("[4] second login ok, duplicateLogin =", second.duplicateLogin);

  const result = await Promise.race([
    gotForceLogout,
    new Promise((r) => setTimeout(() => r("TIMEOUT — force_logout never arrived after 8s"), 8000)),
  ]);
  console.log("[5]", result);

  // Also watch the disconnect.
  socketA.on("disconnect", (reason) => console.log("[6] socket A disconnected, reason:", reason));
  await new Promise((r) => setTimeout(r, 2000));

  socketA.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
