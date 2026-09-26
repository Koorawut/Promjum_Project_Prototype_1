"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/store/game";
import { useAuthStore } from "@/store/auth";

const TOTAL_ROUNDS = 4;

type GameImg = { id: string; imageUrl: string; label: string };
type RoundStart =
  | { roundNumber: number; role: "describer"; targetImage: GameImg; timeLimitSec: number }
  | { roundNumber: number; role: "guesser"; images: GameImg[]; timeLimitSec: number };
type RoundResult = {
  roundNumber: number;
  correctImageId: string;
  chosenImageId: string | null;
  isCorrect: boolean;
  score: number;
  totalScores: Record<string, number>;
};
type MatchEnd = {
  matchId: string;
  reason: "completed" | "opponent_disconnected" | "opponent_left" | "voice_failed";
  totalScores: Record<string, number>;
};

export default function GameMatchPage() {
  const router = useRouter();
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const socket = useSocket();
  const user = useAuthStore((s) => s.user);
  const opponentUsername = useGameStore((s) => s.opponentUsername) ?? "คู่แข่ง";
  const endReason = useGameStore((s) => s.endReason);
  const setMatchEnd = useGameStore((s) => s.setMatchEnd);
  const voiceConnected = useGameStore((s) => s.voiceConnected);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const setMuted = useGameStore((s) => s.setMuted);

  const [round, setRound] = useState<RoundStart | null>(null);
  const [phase, setPhase] = useState<"waiting" | "play" | "result">("waiting");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [opponentLeftNotice, setOpponentLeftNotice] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmutedRef = useRef(false);

  // Voice itself is owned by the globally-mounted CallSessionManager (see
  // app/layout.tsx) so it survives the navigation to the summary page
  // instead of being torn down when this page unmounts.

  // The mic starts muted (set in store/game.ts's setMatch, right when
  // "matched" arrives) so nothing leaks out during the lobby's countdown
  // *or* the "waiting for opponent/voice" phase below — that phase can take
  // a few seconds, so unmuting on page-mount alone reopened the mic too
  // early. Round 1's round_start is the real "safe to talk" signal.
  //
  // Tell the server this page has actually mounted and is listening — the
  // server holds round 1 until both players' pages report this (see
  // realtime.gateway.ts's game_ready handler), so a client that's slow to
  // load can't have round 1 start (and its timer run out) before they're
  // even watching.
  useEffect(() => {
    if (!socket) return;
    socket.emit("game_ready");
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    function onRoundStart(payload: RoundStart) {
      if (!unmutedRef.current) {
        unmutedRef.current = true;
        setMuted(false);
      }
      setRound(payload);
      setChosenId(null);
      setLastResult(null);
      setPhase("play");
      setTimeLeft(payload.timeLimitSec);
      window.scrollTo(0, 0);
    }

    function onRoundResult(payload: RoundResult) {
      if (timerRef.current) clearInterval(timerRef.current);
      setLastResult(payload);
      setPhase("result");
    }

    function onMatchEnd(payload: MatchEnd) {
      if (timerRef.current) clearInterval(timerRef.current);
      setMatchEnd(payload.totalScores, payload.reason);
      if (payload.reason === "opponent_left" || payload.reason === "voice_failed") {
        // Opponent voluntarily exited, or the voice connection never came
        // up for both sides within the server's waiting window (voice is
        // the core of this game, so the match is abandoned rather than
        // played voiceless): show a brief notice, then send this player
        // home (not to the summary page — the match was abandoned, not
        // completed).
        setOpponentLeftNotice(true);
        setTimeout(() => router.push("/home"), 1800);
        return;
      }
      router.push(`/game/${payload.matchId}/summary`);
    }

    socket.on("round_start", onRoundStart);
    socket.on("round_result", onRoundResult);
    socket.on("match_end", onMatchEnd);
    return () => {
      socket.off("round_start", onRoundStart);
      socket.off("round_result", onRoundResult);
      socket.off("match_end", onMatchEnd);
    };
  }, [socket, router, setMatchEnd]);

  useEffect(() => {
    if (phase !== "play") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 0.1));
    }, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  function handlePick(imgId: string) {
    if (chosenId !== null || phase !== "play" || !round || round.role !== "guesser") return;
    setChosenId(imgId);
    socket?.emit("submit_answer", { chosenImageId: imgId });
  }

  function exitMatch() {
    socket?.emit("leave_match");
    router.push("/home");
  }

  const teamTotal = useMemo(() => {
    if (!lastResult) return 0;
    return Object.values(lastResult.totalScores).reduce((a, b) => a + b, 0);
  }, [lastResult]);

  const timeLimit = round?.timeLimitSec ?? 30;
  const low = timeLeft <= timeLimit * 0.25;
  const speakingMe = round?.role === "describer";
  const speakingThem = round?.role === "guesser";
  const roleMe = round?.role === "guesser" ? "คนทาย" : round?.role === "describer" ? "คนอธิบาย" : "";
  const roleThem = round?.role === "guesser" ? "คนอธิบาย" : round?.role === "describer" ? "คนทาย" : "";
  const myInitial = (user?.username ?? "?").slice(0, 1).toUpperCase();
  const theirInitial = opponentUsername.slice(0, 1).toUpperCase();
  const roundNumber = round?.roundNumber ?? lastResult?.roundNumber ?? 1;
  const isLastRound = roundNumber >= TOTAL_ROUNDS;

  return (
    <div className="match-body">
      <header className="focusbar" style={{ borderBottom: "1px solid var(--border)" }} data-od-id="match-header">
        <div className="wrap">
          <div className="players">
            <button className="icon-btn" aria-label="ออกจากเกม" data-od-id="match-exit" onClick={() => setDialogOpen(true)}>
              <Icon name="close" />
            </button>
            <div className={`pl${speakingMe ? " speaking" : ""}`}>
              <span className="avatar">{myInitial}</span>
              <div>
                <div className="name">คุณ</div>
                <div className="role">{roleMe}</div>
              </div>
            </div>
            <div className={`pl pl-right${speakingThem ? " speaking" : ""}`}>
              <span className="avatar sun">{theirInitial}</span>
              <div>
                <div className="name">{opponentUsername}</div>
                <div className="role">{roleThem}</div>
              </div>
            </div>
          </div>
          <div className="row" style={{ paddingBottom: "14px" }}>
            <span className="round-pill">รอบ {roundNumber} / {TOTAL_ROUNDS}</span>
            <div className="rounds spacer" aria-hidden="true">
              {Array.from({ length: TOTAL_ROUNDS }).map((_, k) => (
                <span key={k} className={k < roundNumber - 1 ? "done" : k === roundNumber - 1 ? "current" : ""} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="wrap board" aria-live="polite">
        {phase === "waiting" && (
          <section className="pop" style={{ textAlign: "center" }}>
            <p className="muted">
              {voiceConnected
                ? "เสียงเชื่อมต่อแล้ว กำลังรอเพื่อน…"
                : "กำลังเชื่อมต่อเสียงกับเพื่อน… เกมจะเริ่มเมื่อเชื่อมต่อสำเร็จ"}
            </p>
          </section>
        )}

        {phase === "play" && round?.role === "guesser" && (
          <section className="pop" data-od-id="match-guess-view">
            <span className="badge badge-sun">
              <Icon name="eye" />
              คุณเป็นคนทาย
            </span>
            <h1 style={{ marginTop: "12px" }}>ฟังเพื่อนอธิบาย แล้วเลือกภาพที่ใช่</h1>
            <div className={`timebar${low ? " low" : ""}`}>
              <i style={{ transform: `scaleX(${timeLeft / timeLimit})` }} />
            </div>
            <div className="time-row">
              <span>เวลาที่เหลือ</span>
              <b>{Math.ceil(timeLeft)}</b>
            </div>
            <div className="grid4" role="radiogroup" aria-label="เลือกภาพ">
              {round.images.map((img, k) => {
                const isDone = chosenId !== null;
                let cls = "";
                if (isDone) {
                  cls += " dim";
                  if (img.id === chosenId) cls += " is-wrong";
                }
                return (
                  <button
                    key={img.id}
                    className={`pick${cls}`}
                    disabled={isDone}
                    aria-label={`ภาพ ${"ABCD"[k]}: ${img.label}`}
                    data-od-id={`match-option-${k + 1}`}
                    onClick={() => handlePick(img.id)}
                  >
                    <span className="key">{"ABCD"[k]}</span>
                    <div className="ph-img" style={{ padding: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt={img.label} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {phase === "play" && round?.role === "describer" && (
          <section className="pop" style={{ textAlign: "center" }} data-od-id="match-describe-view">
            <span className="badge badge-sun">
              <Icon name="mic" />
              ตาคุณอธิบาย
            </span>
            <h1 style={{ marginTop: "12px" }}>อธิบายภาพนี้เป็นภาษาอังกฤษ</h1>
            <p className="muted">เพื่อนเห็น 4 ภาพ และต้องเลือกภาพนี้ให้ถูก</p>
            <div className={`timebar${low ? " low" : ""}`}>
              <i style={{ transform: `scaleX(${timeLeft / timeLimit})` }} />
            </div>
            <div className="time-row">
              <span>เวลาที่เหลือ</span>
              <b>{Math.ceil(timeLeft)}</b>
            </div>
            <div className="describe-img">
              <div className="ph-img" style={{ padding: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={round.targetImage.imageUrl}
                  alt={round.targetImage.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                />
              </div>
            </div>
            <p className="secret">
              <Icon name="lock" />
              มีแค่คุณที่เห็นภาพนี้
            </p>
            <div className="tips" aria-label="คำช่วยพูด">
              <span lang="en">It&apos;s a…</span>
              <span lang="en">The color is…</span>
              <span lang="en">It&apos;s next to…</span>
            </div>
            <p className="small muted" style={{ marginTop: "18px" }}>รอเพื่อนเลือกคำตอบ…</p>
          </section>
        )}

        {phase === "result" && lastResult && round && (
          <section className="card result pop" data-od-id="match-round-result">
            <div className={`icon-wrap ${lastResult.isCorrect ? "ok-wrap" : "no-wrap"}`}>
              <Icon name={lastResult.isCorrect ? "check" : "x"} />
            </div>
            <h2>
              {round.role === "describer"
                ? lastResult.isCorrect
                  ? "เพื่อนทายถูก!"
                  : "เพื่อนเลือกภาพอื่น"
                : lastResult.isCorrect
                  ? "ทายถูก!"
                  : "ยังไม่ใช่ภาพนี้"}
            </h2>
            <p className="muted">{lastResult.isCorrect ? "เก่งมาก!" : "รอบนี้ไม่ได้คะแนน"}</p>
            <p className="big" style={{ marginTop: "12px" }}>+{lastResult.score}</p>
            <p className="small muted">คะแนนรวมทีม {teamTotal} / {TOTAL_ROUNDS * 100}</p>
            <p className="next-role">
              {isLastRound ? "ครบรอบสุดท้ายแล้ว กำลังไปหน้าสรุปคะแนน…" : "กำลังไปรอบต่อไป…"}
            </p>
          </section>
        )}
      </main>

      <footer className="controls" data-od-id="match-controls">
        <div className="wrap">
          <button
            className="mic-btn"
            aria-pressed={muted}
            data-od-id="match-mic-toggle"
            onClick={toggleMute}
          >
            <Icon name={muted ? "mic-off" : "mic"} />
            <span>{muted ? "ปิดไมค์อยู่" : "ไมค์เปิดอยู่"}</span>
          </button>
          <span className="conn">{voiceConnected ? "เชื่อมต่อเสียงแล้ว" : "กำลังเชื่อมต่อเสียง…"}</span>
        </div>
      </footer>

      {opponentLeftNotice && (
        <dialog className="exit-dialog" open data-od-id="match-opponent-left-dialog">
          <h2 style={{ fontSize: "22px" }}>
            {endReason === "voice_failed" ? "เชื่อมต่อเสียงไม่สำเร็จ" : "เพื่อนออกจากเกมแล้ว"}
          </h2>
          <p className="muted" style={{ marginTop: "8px" }}>
            {endReason === "voice_failed"
              ? "ไม่สามารถเชื่อมต่อเสียงระหว่างคุณสองคนได้ ลองจับคู่ใหม่อีกครั้งนะ กำลังพากลับหน้าหลัก…"
              : `${opponentUsername} ออกจากการเล่น กำลังพากลับหน้าหลัก…`}
          </p>
        </dialog>
      )}

      {dialogOpen && (
        <dialog className="exit-dialog" open data-od-id="match-exit-dialog">
          <h2 style={{ fontSize: "22px" }}>ออกจากเกมนี้?</h2>
          <p className="muted" style={{ marginTop: "8px" }}>
            คะแนนของรอบนี้จะไม่ถูกบันทึก และเพื่อนของคุณจะถูกออกจากเกมด้วย
          </p>
          <div className="row">
            <button className="btn btn-secondary" onClick={() => setDialogOpen(false)}>
              เล่นต่อ
            </button>
            <button className="btn btn-danger" onClick={exitMatch}>
              ออกจากเกม
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
