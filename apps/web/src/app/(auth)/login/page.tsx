"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { useAuth, ApiError } from "@/hooks/useAuth";
import { API_URL } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [userError, setUserError] = useState(false);
  const [passError, setPassError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Full-page navigation (not a fetch) since this is a redirect-based OAuth
  // flow. Won't actually authenticate until real Google credentials replace
  // the "not-configured" placeholders in apps/api/.env.
  const googleHref = `${API_URL}/auth/google`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();
    const p = password;
    setUserError(!u);
    setPassError(!p);
    setFormError(null);
    if (!u || !p) return;

    setSubmitting(true);
    try {
      await login(u, p);
      router.push("/home");
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "เข้าสู่ระบบไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand" data-od-id="auth-brand-panel">
        <Link className="logo" href="/">
          <span className="logo-mark">
            <Icon name="logo" />
          </span>
          SpeakUp
        </Link>
        <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
          <h2>
            ฝึกพูดทีละประโยค
            <br />
            แล้วลองคุยกับเพื่อนจริง
          </h2>
          <div className="brand-bubbles" aria-hidden="true">
            <div className="bubble bubble-a">
              <span className="en">Can I get an iced latte, please?</span>
              <small>ขอลาเต้เย็นหนึ่งแก้วได้ไหมครับ</small>
            </div>
            <div className="bubble bubble-b">
              <span className="en">Sure! Anything else?</span>
              <small>ได้เลย! รับอะไรเพิ่มไหม</small>
            </div>
          </div>
        </div>
        <div className="brand-points">
          <span>
            <Icon name="book" />
            ฝึกพูด 4 หมวด
          </span>
          <span>
            <Icon name="game" />
            เกมทายภาพแบบคู่
          </span>
        </div>
      </aside>

      <main className="auth-main">
        <Link className="logo" href="/">
          <span className="logo-mark">
            <Icon name="logo" />
          </span>
          SpeakUp
        </Link>
        <form
          className="auth-form"
          id="login-form"
          noValidate
          onSubmit={handleSubmit}
          data-od-id="login-form"
        >
          <h1 data-od-id="login-title">ยินดีต้อนรับกลับมา</h1>
          <p className="muted">เข้าสู่ระบบเพื่อฝึกต่อจากครั้งที่แล้ว</p>
          {formError && <p className="field-error" style={{ display: "block" }}>{formError}</p>}

          <a
            className="btn btn-secondary btn-block"
            href={googleHref}
            data-od-id="login-google"
          >
            <Icon name="google" />
            ดำเนินการต่อด้วย Google
          </a>

          <div className="divider" style={{ margin: "24px 0" }}>
            หรือใช้ชื่อผู้ใช้
          </div>

          <div className="stack" style={{ "--gap": "18px" } as React.CSSProperties}>
            <div className={`field${userError ? " has-error" : ""}`} id="f-user">
              <label htmlFor="username">ชื่อผู้ใช้</label>
              <input
                className="input"
                id="username"
                name="username"
                autoComplete="username"
                placeholder="เช่น mint_2009"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="field-error">กรอกชื่อผู้ใช้ก่อนนะ</p>
            </div>
            <div className={`field${passError ? " has-error" : ""}`} id="f-pass">
              <label htmlFor="password">รหัสผ่าน</label>
              <div className="pw-wrap">
                <input
                  className="input"
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="รหัสผ่านของคุณ"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="pw-toggle"
                  type="button"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <Icon name="eye" />
                </button>
              </div>
              <p className="field-error">กรอกรหัสผ่านก่อนนะ</p>
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            style={{ marginTop: "24px" }}
            data-od-id="login-submit"
            disabled={submitting}
          >
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <p className="auth-foot muted">
            ยังไม่มีบัญชี? <Link className="link" href="/register">สมัครสมาชิก</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
