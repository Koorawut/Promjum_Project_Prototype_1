"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/icon";
import { apiFetch, ApiError } from "@/lib/api-client";

type QuizOption = { key: string; text: string };
type Quiz = { question: string; options: QuizOption[] };
type Sentence = {
  id: string;
  text: string;
  audioUrl: string;
  imageUrl: string;
  quiz: Quiz | null;
};
type SessionData = {
  sessionId: string;
  categoryId: string;
  sentences: Sentence[];
};

type Step = "show" | "listen" | "quiz" | "done";

function SentenceImg({ s, label = true }: { s: Sentence; label?: boolean }) {
  return (
    <div className="ph-img tint-daily sentence-img" role="img" aria-label={s.text}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
      {label ? <span className="sr-only">{s.text}</span> : null}
    </div>
  );
}

export default function PracticeSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [data, setData] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [i, setI] = useState(0);
  const [step, setStep] = useState<Step>("show");
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctKey, setCorrectKey] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    apiFetch<SessionData>(`/practice/session/${sessionId}`)
      .then(setData)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดรอบฝึกไม่สำเร็จ"),
      );
  }, [sessionId]);

  if (loadError) {
    return (
      <div className="session-body">
        <main className="session">
          <p className="field-error" style={{ display: "block" }}>{loadError}</p>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="session-body">
        <main className="session">
          <p className="muted">กำลังโหลด...</p>
        </main>
      </div>
    );
  }

  const S = data.sentences;
  const s = S[i];

  function play() {
    setPlaying(true);
    const el = audioRef.current;
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {});
    }
  }

  async function check() {
    if (!picked) return;
    if (!s.quiz) {
      setChecked(true);
      return;
    }
    setGrading(true);
    setGradeError(null);
    try {
      const res = await apiFetch<{ isCorrect: boolean; correctOptionKey: string }>(
        `/practice/session/${sessionId}/complete-sentence`,
        { method: "POST", body: { sentenceId: s.id, selectedOptionKey: picked } },
      );
      setCorrectKey(res.correctOptionKey);
      setResults((r) => {
        const next = [...r];
        next[i] = res.isCorrect;
        return next;
      });
      setChecked(true);
    } catch (err) {
      setGradeError(err instanceof ApiError ? err.message : "ตรวจคำตอบไม่สำเร็จ");
    } finally {
      setGrading(false);
    }
  }

  function continueNext() {
    if (i < S.length - 1) {
      setI(i + 1);
      setStep("show");
    } else {
      setStep("done");
    }
    setPicked(null);
    setChecked(false);
    setCorrectKey(null);
    setPlayed(false);
    setPlaying(false);
    window.scrollTo(0, 0);
  }

  return (
    <div className="session-body">
      <header className="focusbar" data-od-id="practice-progress-bar">
        <div className="session" style={{ flex: "none" }}>
          <div className="focusbar-inner">
            <Link className="icon-btn" href="/practice/select" aria-label="ออกจากรอบฝึก" data-od-id="practice-exit">
              <Icon name="close" />
            </Link>
            <div className="segments" id="segments" aria-hidden="true">
              {S.map((_, k) => (
                <span key={k} className={k < i || step === "done" ? "done" : k === i ? "current" : ""} />
              ))}
            </div>
            <span className="counter" id="counter">
              {step === "done" ? "ครบแล้ว" : `${i + 1} / ${S.length}`}
            </span>
          </div>
        </div>
      </header>

      <main className="session" aria-live="polite">
        {step === "show" && (
          <>
            <section className="stage pop" data-od-id="practice-step-read">
              <SentenceImg s={s} />
              <p className="sentence-en" lang="en">{s.text}</p>
            </section>
            <div className="focus-actions">
              <button
                className="btn btn-primary btn-block"
                data-od-id="practice-next"
                onClick={() => setStep("listen")}
              >
                ถัดไป · ฟังเสียง
                <Icon name="arrow-right" />
              </button>
            </div>
          </>
        )}

        {step === "listen" && (
          <>
            <section className="stage listen pop" data-od-id="practice-step-listen">
              <SentenceImg s={s} label={false} />
              <audio
                ref={audioRef}
                src={s.audioUrl}
                onEnded={() => {
                  setPlaying(false);
                  setPlayed(true);
                }}
                style={{ display: "none" }}
              />
              <button
                className={`speaker${playing ? " playing" : ""}`}
                aria-label="เล่นเสียงประโยค"
                data-od-id="practice-speaker"
                onClick={play}
              >
                <Icon name="speaker" />
              </button>
              <p className="listen-hint" id="hint">
                {playing ? "กำลังเล่นเสียง…" : played ? "ฟังซ้ำได้ตามต้องการ แล้วลองพูดตามดังๆ" : "แตะลำโพงเพื่อฟัง แล้วพูดตาม"}
              </p>
            </section>
            <div className="focus-actions">
              <div className="row">
                <button className="btn btn-secondary" aria-label="ย้อนกลับไปดูประโยค" onClick={() => setStep("show")}>
                  <Icon name="arrow-left" />
                </button>
                {s.quiz ? (
                  <button className="btn btn-primary" data-od-id="practice-to-quiz" onClick={() => setStep("quiz")}>
                    ไปทำ Quiz
                    <Icon name="arrow-right" />
                  </button>
                ) : (
                  <button className="btn btn-primary" data-od-id="practice-to-quiz" onClick={continueNext}>
                    {i < S.length - 1 ? "ประโยคถัดไป" : "จบรอบฝึก"}
                    <Icon name="arrow-right" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {step === "quiz" && s.quiz && (
          <>
            <section className="stage pop" data-od-id="practice-step-quiz">
              <div className="stage-head">
                <span className="badge badge-sun">Quiz</span>
              </div>
              <div className="quiz-ref">
                <SentenceImg s={s} label={false} />
                <p className="en" lang="en" style={{ fontWeight: 500 }}>{s.text}</p>
              </div>
              <h2 className="quiz-q">{s.quiz.question}</h2>
              <div className="options" role="radiogroup" aria-label="ตัวเลือก">
                {s.quiz.options.map((o) => {
                  let cls = "";
                  if (checked && o.key === correctKey) cls = "is-correct";
                  else if (checked && o.key === picked) cls = "is-wrong";
                  return (
                    <button
                      key={o.key}
                      className={`opt ${cls}`}
                      role="radio"
                      aria-checked={o.key === picked}
                      disabled={checked || grading}
                      data-od-id={`quiz-option-${o.key}`}
                      onClick={() => !checked && setPicked(o.key)}
                    >
                      <span className="key">{o.key}</span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
              {gradeError && <p className="field-error" style={{ display: "block" }}>{gradeError}</p>}
            </section>
            <div className="focus-actions">
              {checked &&
                (picked === correctKey ? (
                  <div className="feedback fb-ok pop" role="status">
                    <Icon name="check" />
                    <div>
                      ถูกต้อง!
                      <small>เก่งมาก ไปประโยคต่อไปกัน</small>
                    </div>
                  </div>
                ) : (
                  <div className="feedback fb-no pop" role="status">
                    <Icon name="x" />
                    <div>
                      ยังไม่ใช่
                      <small>คำตอบคือ “{s.quiz.options.find((o) => o.key === correctKey)?.text}”</small>
                    </div>
                  </div>
                ))}
              <button
                className="btn btn-primary btn-block"
                disabled={picked === null || grading}
                data-od-id="quiz-submit"
                onClick={() => (checked ? continueNext() : check())}
              >
                {grading ? "กำลังตรวจ..." : checked ? (i < S.length - 1 ? "ประโยคถัดไป" : "จบรอบฝึก") : "ตรวจคำตอบ"}
                {checked && !grading && <Icon name="arrow-right" />}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <section className="stage done pop" data-od-id="practice-complete">
              <div className="done-badge">
                <Icon name="trophy" />
              </div>
              <h1>ฝึกครบ {S.length} ประโยคแล้ว!</h1>
              <p className="muted" style={{ marginTop: "8px" }}>
                ตอบ Quiz ถูก {results.filter(Boolean).length} จาก {S.filter((x) => x.quiz).length} ข้อ
              </p>
              <div className="done-list">
                {S.map((x, k) => (
                  <div className="done-item" key={x.id}>
                    <Icon name={x.quiz ? (results[k] ? "check" : "x") : "sparkle"} />
                    <div>
                      <p className="en" lang="en">{x.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <div className="focus-actions">
              <div className="row">
                <Link className="btn btn-secondary" href="/game/lobby" data-od-id="done-to-game">
                  เล่นมินิเกม
                </Link>
                <Link className="btn btn-primary" href="/practice/select" data-od-id="done-again">
                  ฝึกอีกรอบ
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
