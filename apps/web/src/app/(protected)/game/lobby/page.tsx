"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/store/game";
import { useAuthStore } from "@/store/auth";

type LobbyState = "idle" | "mic" | "search" | "matched";

export default function GameLobbyPage() {
  const router = useRouter();
  const socket = useSocket();
  const username = useAuthStore((s) => s.user?.username ?? "");
  const setLocalStream = useGameStore((s) => s.setLocalStream);
  const setMatch = useGameStore((s) => s.setMatch);

  const [state, setState] = useState<LobbyState>("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [matchedInfo, setMatchedInfo] = useState<{ matchId: string; opponentUsername: string } | null>(null);
  const [countdown, setCountdown] = useState(3);

  const searchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (searchTimer.current) clearInterval(searchTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }

  useEffect(() => {
    if (!socket) return;
    function onMatched(payload: {
      matchId: string;
      opponent: { username: string };
      isInitiator: boolean;
    }) {
      clearTimers();
      setMatchedInfo({ matchId: payload.matchId, opponentUsername: payload.opponent.username });
      setMatch(payload.matchId, payload.opponent.username, payload.isInitiator);
      setCountdown(3);
      setState("matched");
    }
    socket.on("matched", onMatched);
    return () => {
      socket.off("matched", onMatched);
    };
  }, [socket, setMatch]);

  useEffect(() => {
    if (state !== "search") return;
    let t = 0;
    searchTimer.current = setInterval(() => {
      t++;
      setSearchSeconds(t);
    }, 1000);
    return () => {
      if (searchTimer.current) clearInterval(searchTimer.current);
    };
  }, [state]);

  useEffect(() => {
    if (state !== "matched" || !matchedInfo) return;
    let n = 3;
    countdownTimer.current = setInterval(() => {
      n--;
      setCountdown(n);
      if (n <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        router.push(`/game/${matchedInfo.matchId}`);
      }
    }, 1000);
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [state, matchedInfo, router]);

  useEffect(() => () => clearTimers(), []);

  function go(next: LobbyState) {
    clearTimers();
    if (next === "search") {
      setSearchSeconds(0);
      socket?.emit("join_queue");
    }
    if (next === "idle" && state === "search") {
      socket?.emit("leave_queue");
    }
    setState(next);
  }

  async function handleAllow() {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        // Arriving via "เล่นอีกรอบ" keeps the previous match's stream in the
        // store (deliberately — see summary page). If it's still live, reuse
        // it instead of requesting a second getUserMedia (which would both
        // re-prompt and leak a parallel track); only fetch a fresh one when
        // the old one is gone or dead.
        const existing = useGameStore.getState().localStream;
        const existingAlive =
          existing && existing.getAudioTracks().some((t) => t.readyState === "live");
        if (!existingAlive) {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          setLocalStream(s);
        }
      }
      setMicDenied(false);
      go("search");
    } catch {
      setMicDenied(true);
    }
  }

  const mm = Math.floor(searchSeconds / 60);
  const ss = String(searchSeconds % 60).padStart(2, "0");

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
        <Link className="btn btn-ghost btn-sm" href="/home">
          <Icon name="arrow-left" />
          กลับหน้าหลัก
        </Link>
      </div>
      <div className="lobby">
        <section className="card hero-card" data-od-id="lobby-panel">
          {state === "idle" && (
            <div id="st-idle" data-od-id="lobby-idle">
              <span className="badge badge-sun">
                <Icon name="users" />
                เล่นกับเพื่อนแบบสด 2 คน
              </span>
              <h1>
                เกมทายภาพ
                <br />
                พูดอธิบาย ให้เพื่อนทาย
              </h1>
              <p className="muted">คุยกันด้วยเสียงจริงเป็นภาษาอังกฤษ ผลัดกันเป็นคนอธิบายและคนทาย</p>
              <ol className="how" data-od-id="lobby-how-to">
                <li>
                  <span className="n">1</span>
                  <div>
                    <b>ระบบจับคู่ให้อัตโนมัติ</b>
                    <span className="small">กับคนที่กดเริ่มในเวลาใกล้กัน</span>
                  </div>
                </li>
                <li>
                  <span className="n">2</span>
                  <div>
                    <b>คนอธิบายเห็นภาพ 1 ภาพ</b>
                    <span className="small">พูดบรรยายภาพนั้นให้เพื่อนฟัง</span>
                  </div>
                </li>
                <li>
                  <span className="n">3</span>
                  <div>
                    <b>คนทายเลือกจาก 4 ภาพ</b>
                    <span className="small">ยิ่งตอบถูกเร็ว ยิ่งได้คะแนนเยอะ · เล่น 4 รอบ สลับบทบาททุกรอบ</span>
                  </div>
                </li>
              </ol>
              <button className="btn btn-primary btn-block" data-od-id="lobby-start" onClick={() => go("mic")}>
                เริ่มหาคู่เล่น
              </button>
              <p className="caption muted" style={{ textAlign: "center", marginTop: "12px" }}>
                ต้องใช้ไมโครโฟน · เสียงส่งตรงถึงเพื่อน ไม่มีการบันทึกเก็บไว้
              </p>
            </div>
          )}

          {state === "mic" && (
            <div className="mm pop" id="st-mic" data-od-id="lobby-mic-permission">
              <div className="mm-visual">
                <span className="core mic-core">
                  <Icon name="mic" />
                </span>
              </div>
              <h2>ขออนุญาตใช้ไมโครโฟน</h2>
              <p className="muted">เบราว์เซอร์จะถามสิทธิ์ใช้ไมค์ กด “อนุญาต” เพื่อคุยกับเพื่อนระหว่างเกม</p>
              <div className="row" style={{ justifyContent: "center", marginTop: "24px", flexWrap: "wrap" }}>
                <button className="btn btn-secondary" onClick={() => go("idle")}>
                  ยกเลิก
                </button>
                <button className="btn btn-primary" data-od-id="lobby-mic-allow" onClick={handleAllow}>
                  อนุญาตไมโครโฟน
                </button>
              </div>
              {micDenied && (
                <div className="notice notice-warn" role="alert">
                  <Icon name="info" />
                  <span>ไม่ได้รับสิทธิ์ไมโครโฟน เปิดสิทธิ์ได้ที่ไอคอนรูปกุญแจข้างแถบที่อยู่ แล้วลองอีกครั้ง</span>
                </div>
              )}
            </div>
          )}

          {state === "search" && (
            <div className="mm pop" id="st-search" data-od-id="lobby-searching">
              <div className="mm-visual">
                <span className="ring" />
                <span className="ring r2" />
                <span className="core">
                  <Icon name="users" />
                </span>
              </div>
              <h2>กำลังหาคู่เล่น…</h2>
              <p className="muted">รอสักครู่ ระบบกำลังหาคนที่พร้อมเล่นอยู่ตอนนี้</p>
              <p className="timer" aria-live="off">
                {mm}:{ss}
              </p>
              <button className="btn btn-secondary" data-od-id="lobby-cancel" onClick={() => go("idle")}>
                ยกเลิกการค้นหา
              </button>
              <p className="caption muted" style={{ marginTop: "16px" }}>
                ครั้งแรกของวันอาจใช้เวลานานขึ้นเล็กน้อยระหว่างเชื่อมต่อเซิร์ฟเวอร์
              </p>
            </div>
          )}

          {state === "matched" && matchedInfo && (
            <div className="mm pop" id="st-matched" data-od-id="lobby-matched">
              <span className="badge badge-success">
                <Icon name="check" />
                เจอคู่แล้ว
              </span>
              <div className="pair" style={{ marginTop: "20px" }}>
                <div className="who">
                  <span className="avatar lg">{username.slice(0, 1).toUpperCase()}</span>คุณ
                </div>
                <span className="vs">กับ</span>
                <div className="who">
                  <span className="avatar lg sun">{matchedInfo.opponentUsername.slice(0, 1).toUpperCase()}</span>
                  {matchedInfo.opponentUsername}
                </div>
              </div>
              <p className="muted">
                กำลังเชื่อมต่อเสียง… เกมจะเริ่มใน <b style={{ color: "var(--fg)" }}>{countdown}</b>
              </p>
            </div>
          )}
        </section>

        <aside className="card score-card" data-od-id="lobby-scoring">
          <h2>คิดคะแนนยังไง?</h2>
          <p className="small muted" style={{ marginBottom: "12px" }}>
            นาฬิกาเริ่มเดินตั้งแต่เห็นตัวเลือก ยิ่งกดถูกเร็ว คะแนนยิ่งเหลือเยอะ
          </p>
          <dl className="formula">
            <div>
              <dt>คะแนนเต็มต่อรอบ</dt>
              <dd>100</dd>
            </div>
            <div>
              <dt>เวลาตอบสูงสุด</dt>
              <dd>30 วินาที</dd>
            </div>
            <div>
              <dt>ตอบถูก (ช้าแค่ไหนก็ได้)</dt>
              <dd>อย่างน้อย 10</dd>
            </div>
            <div>
              <dt>ตอบผิด / หมดเวลา</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>คะแนนรวม</dt>
              <dd>4 รอบ · เต็ม 400</dd>
            </div>
          </dl>
          <figure className="curve" style={{ margin: "14px 0 0" }} data-od-id="lobby-score-curve">
            <svg
              viewBox="0 0 300 130"
              role="img"
              aria-label="กราฟคะแนนลดลงตามเวลา จาก 100 ที่ 0 วินาที ถึงขั้นต่ำ 10 ที่ 27 ถึง 30 วินาที"
            >
              <line x1="30" y1="10" x2="30" y2="110" stroke="var(--border)" strokeWidth="1.5" />
              <line x1="30" y1="110" x2="290" y2="110" stroke="var(--border)" strokeWidth="1.5" />
              <path d="M30 110 L30 12 L264 100 L290 100 L290 110 Z" fill="var(--sun-soft)" />
              <path d="M30 12 L264 100 L290 100" fill="none" stroke="var(--sun-shade)" strokeWidth="3" strokeLinejoin="round" />
              <circle cx="30" cy="12" r="4.5" fill="var(--sun-shade)" />
              <text x="24" y="16" textAnchor="end" fontSize="11" fill="var(--muted)">100</text>
              <text x="24" y="104" textAnchor="end" fontSize="11" fill="var(--muted)">10</text>
              <text x="30" y="126" textAnchor="middle" fontSize="11" fill="var(--muted)">0 วิ</text>
              <text x="290" y="126" textAnchor="end" fontSize="11" fill="var(--muted)">30 วิ</text>
            </svg>
          </figure>
        </aside>
      </div>
    </div>
  );
}
