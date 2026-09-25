"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/icon";
import { useAuth } from "@/hooks/useAuth";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const email = params.get("email");
  const { verifyEmail, resendVerification } = useAuth();

  const [state, setState] = useState<"checking" | "sent" | "verified" | "failed">(
    token ? "checking" : "sent",
  );
  const [cooldown, setCooldown] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => setState("verified"))
      .catch(() => setState("failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleResend() {
    setResendError(null);
    try {
      if (email) await resendVerification(email);
    } catch {
      setResendError("ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }
    setCooldown(60);
    intervalRef.current = setInterval(() => {
      setCooldown((t) => {
        if (t <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  return (
    <div className="verify">
      <Link className="logo" href="/">
        <span className="logo-mark">
          <Icon name="logo" />
        </span>
        SpeakUp
      </Link>

      {(state === "sent" || state === "failed" || state === "checking") && (
        <section className="card verify-card pop" id="state-sent" data-od-id="verify-sent">
          <div className="verify-icon sent">
            <Icon name="mail" />
          </div>
          {state === "checking" && <h1>กำลังยืนยัน...</h1>}
          {state === "failed" && <h1>ลิงก์ไม่ถูกต้องหรือหมดอายุ</h1>}
          {state === "sent" && <h1>เช็กอีเมลของคุณ</h1>}
          <p className="muted">เราส่งลิงก์ยืนยันไปที่</p>
          <span className="email-pill" id="email-out">
            {email || "you@example.com"}
          </span>
          <p className="small muted" style={{ marginBottom: "24px" }}>
            กดลิงก์ในอีเมลเพื่อเปิดใช้งานบัญชี ถ้าไม่เจอ ลองดูในโฟลเดอร์สแปม
          </p>
          {resendError && <p className="field-error" style={{ display: "block" }}>{resendError}</p>}
          <button
            className="btn btn-secondary btn-block"
            type="button"
            id="resend"
            disabled={cooldown > 0}
            onClick={handleResend}
            data-od-id="verify-resend"
          >
            {cooldown > 0 ? `ส่งแล้ว · ส่งใหม่ได้ใน ${cooldown} วินาที` : "ส่งอีเมลอีกครั้ง"}
          </button>
          <p className="small muted" style={{ marginTop: "20px" }}>
            ใส่อีเมลผิด? <Link className="link" href="/register">กลับไปแก้ไข</Link>
          </p>
        </section>
      )}

      {state === "verified" && (
        <section className="card verify-card pop" id="state-ok" data-od-id="verify-success">
          <div className="verify-icon ok">
            <Icon name="check" />
          </div>
          <h1>ยืนยันอีเมลเรียบร้อย</h1>
          <p className="muted" style={{ marginBottom: "28px" }}>
            บัญชีของคุณพร้อมใช้งานแล้ว เริ่มฝึกประโยคแรกกันเลย
          </p>
          <Link className="btn btn-primary btn-block" href="/login" data-od-id="verify-continue">
            เข้าสู่ระบบ
            <Icon name="arrow-right" />
          </Link>
        </section>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
