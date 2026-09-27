// Verify the freshly deployed frontend bundle contains the new code.
// NOTE: this Next.js version serves assets from /_next/static/immutable/
// (content-hashed filenames), not the classic /_next/static/chunks/.
(async () => {
  const base = "https://web-woad-two-58zkxybk8s.vercel.app";
  for (const path of ["/", "/game/lobby", "/game/probe-match-id"]) {
    const html = await (await fetch(base + path)).text();
    const scripts = [...html.matchAll(/\/_next\/static\/[^"]+\.js/g)].map((m) => m[0]);
    console.log(`${path}: script tags found:`, new Set(scripts).size);
    for (const s of new Set(scripts)) {
      try {
        const t = await (await fetch(base + s)).text();
        if (t.includes("voice_failed")) {
          console.log("✅ FOUND voice_failed in", s);
          process.exit(0);
        }
      } catch {}
    }
  }
  console.log("❌ voice_failed not found in any referenced script");
})().catch((e) => console.log("err", e.message));
