"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/icon";
import { apiFetch, ApiError } from "@/lib/api-client";

type SummaryData = {
  matchId: string;
  status: string;
  you: { userId: string; username: string; totalScore: number };
  opponent: { userId: string; username: string; totalScore: number } | null;
  rounds: {
    roundNumber: number;
    describerId: string;
    guesserId: string;
    isCorrect: boolean;
    score: number;
    elapsedMs: number;
  }[];
};

export default function GameSummaryPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [data, setData] = useState<SummaryData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayTotal, setDisplayTotal] = useState(0);

  useEffect(() => {
    apiFetch<SummaryData>(`/game/summary/${matchId}`)
      .then(setData)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดสรุปคะแนนไม่สำเร็จ"),
      );
  }, [matchId]);

  const total = data ? data.you.totalScore + (data.opponent?.totalScore ?? 0) : 0;
  const maxTotal = data ? data.rounds.length * 100 : 400;

  useEffect(() => {
    if (!data) return;
    let n = 0;
    const step = Math.max(1, Math.ceil(total / 40));
    const iv = setInterval(() => {
      n = Math.min(total, n + step);
      setDisplayTotal(n);
      if (n >= total) clearInterval(iv);
    }, 20);
    return () => clearInterval(iv);
  }, [data, total]);

  if (loadError) {
    return (
      <div className="container sum">
        <p className="field-error" style={{ display: "block" }}>{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container sum">
        <p className="muted">กำลังโหลด...</p>
      </div>
    );
  }

  const verdict =
    total >= maxTotal * 0.75
      ? "สื่อสารกันเข้าใจดีมาก!"
      : total >= maxTotal * 0.375
        ? "ทำได้ดี ลองพูดให้ชัดขึ้นอีกนิด"
        : "ไม่เป็นไร รอบหน้าเอาใหม่";

  const myInitial = data.you.username.slice(0, 1).toUpperCase();
  const oppUsername = data.opponent?.username ?? "คู่แข่ง";
  const oppInitial = oppUsername.slice(0, 1).toUpperCase();

  return (
    <div className="container sum">
      <section className="card total pop" data-od-id="summary-total">
        <div className="trophy">
          <Icon name="trophy" />
        </div>
        <p className="eyebrow">คะแนนรวมของทีม</p>
        <p className="num">
          {displayTotal}
          <small> / {maxTotal}</small>
        </p>
        <p className="muted" style={{ marginTop: "6px" }}>{verdict}</p>
        <div className="summary-pair">
          <span className="avatar">{myInitial}</span>คุณ<span className="muted" style={{ fontWeight: 400 }}>กับ</span>
          <span className="avatar sun">{oppInitial}</span>
          {oppUsername}
        </div>
      </section>

      <h2 style={{ marginTop: "32px", fontSize: "20px" }}>คะแนนแต่ละรอบ</h2>
      <div className="rounds-list" data-od-id="summary-rounds">
        {data.rounds.map((rd) => {
          const iAmDescriber = rd.describerId === data.you.userId;
          const roleLabel = iAmDescriber
            ? `คุณอธิบาย · ${oppUsername} ทาย`
            : `คุณทาย · ${oppUsername} อธิบาย`;
          return (
            <div className="card-flat rd" key={rd.roundNumber} data-od-id={`summary-round-${rd.roundNumber}`}>
              <span className="rd-n">{rd.roundNumber}</span>
              <div className="rd-info">
                <b>{rd.isCorrect ? "ทายถูก" : "ไม่ได้คะแนน"}</b>
                <span className="small muted">{roleLabel}</span>
                <div className="rd-bar">
                  <i style={{ width: `${rd.score}%` }} />
                </div>
              </div>
              <span className="rd-pts">{rd.score}</span>
            </div>
          );
        })}
      </div>

      <div className="actions" data-od-id="summary-actions">
        <Link className="btn btn-secondary" href="/home">
          <Icon name="arrow-left" />
          กลับหน้าหลัก
        </Link>
        <Link className="btn btn-secondary" href="/practice/select">
          กลับไปฝึกพูด
        </Link>
        <Link className="btn btn-primary" href="/game/lobby" data-od-id="summary-play-again">
          เล่นอีกรอบ
        </Link>
      </div>
    </div>
  );
}
