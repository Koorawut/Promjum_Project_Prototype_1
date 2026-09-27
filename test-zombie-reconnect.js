// Detect which code version production is running:
// NEW code: a socket reconnecting with a token issued BEFORE the kick gets
//   re-kicked (force_logout arrives right after connect, then server
//   disconnects it).
// OLD code: the zombie reconnects and STAYS connected.
// NOTE: the client's 'connect' event fires before the server's
// handleConnection emit reaches us, so we must wait after connect before
// concluding anything.
const API = "https://promjumprojectprototype1-production.up.railway.app";

async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const { io } = require("socket.io-client");

  const first = await login("dupprobe1", "TempPass1234!");
  console.log("[1] first login ok");

  const socketA = io(API, {
    path: "/socket.io/",
    auth: { token: first.accessToken },
    transports: ["websocket"],
  });
  await new Promise((resolve, reject) => {
    socketA.on("connect", resolve);
    socketA.on("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 10_000);
  });
  console.log("[2] socket A connected (token iat predates upcoming kick)");

  await new Promise((r) => setTimeout(r, 500));
  const second = await login("dupprobe1", "TempPass1234!");
  console.log("[3] duplicate login done — A should have been kicked");

  await new Promise((r) => setTimeout(r, 3000));

  // Now the zombie reconnect with the OLD token.
  const zombie = io(API, {
    path: "/socket.io/",
    auth: { token: first.accessToken },
    transports: ["websocket"],
  });

  let kicked = false;
  let stayedConnected = false;
  zombie.on("force_logout", () => {
    kicked = true;
    console.log("   zombie got force_logout");
  });
  zombie.on("disconnect", (reason) => {
    if (kicked || reason === "io server disconnect") {
      kicked = true;
      console.log("   zombie disconnected by server:", reason);
    }
  });

  await new Promise((r) => setTimeout(r, 5000));
  stayedConnected = zombie.connected && !kicked;

  console.log("[4]", kicked
    ? "RE-KICKED — NEW CODE is live ✅"
    : stayedConnected
      ? "ZOMBIE RECONNECTED AND STAYED — OLD CODE still running ❌"
      : "AMBIGUOUS — disconnected without force_logout");

  zombie.close();
  socketA.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
