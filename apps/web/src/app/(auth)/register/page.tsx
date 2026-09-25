"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { useAuth, ApiError } from "@/hooks/useAuth";
import { API_URL } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ user: false, email: false, pass: false, confirm: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Full-page navigation (not a fetch) — redirect-based OAuth flow. Won't
  // actually authenticate until real Google credentials replace the
  // "not-configured" placeholders in apps/api/.env.
  const googleHref = `${API_URL}/auth/google`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();
    const m = email.trim();
    const p = password;
    const ok = {
      user: u.length >= 3,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m),
      pass: p.length >= 8,
      confirm: p.length >= 8 && p === confirmPassword,
    };
    setErrors({ user: !ok.user, email: !ok.email, pass: !ok.pass, confirm: !ok.confirm });
    setFormError(null);
    if (!ok.user || !ok.email || !ok.pass || !ok.confirm) return;

    setSubmitting(true);
    try {
      await register(u, m, p);
      router.push(`/verify-email?email=${encodeURIComponent(m)}`);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "สมัครสมาชิกไม่สำเร็จ",
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
            เริ่มจากประโยคง่ายๆ
            <br />
            ในชีวิตประจำวัน
          </h2>
          <div className="brand-bubbles" aria-hidden="true">
            <div className="bubble bubble-a">
              <span className="en">Where is the train station?</span>
              <small>สถานีรถไฟอยู่ที่ไหน</small>
            </div>
            <div className="bubble bubble-b">
              <span className="en">Go straight, then turn left.</span>
              <small>ตรงไป แล้วเลี้ยวซ้าย</small>
            </div>
          </div>
        </div>
        <div className="brand-points">
          <span>
            <Icon name="speaker" />
            ฟังเสียงเจ้าของภาษา
          </span>
          <span>
            <Icon name="check" />
            ทำ Quiz ทุกประโยค
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
          id="reg-form"
          noValidate
          onSubmit={handleSubmit}
          data-od-id="register-form"
        >
          <h1 data-od-id="register-title">สร้างบัญชีใหม่</h1>
          <p className="muted">ใช้เวลาไม่ถึงนาที แล้วเริ่มฝึกได้เลย</p>
          {formError && <p className="field-error" style={{ display: "block" }}>{formError}</p>}

          <a
            className="btn btn-secondary btn-block"
            href={googleHref}
            data-od-id="register-google"
          >
            <Icon name="google" />
            สมัครด้วย Google
          </a>
          <p className="caption muted" style={{ textAlign: "center", marginTop: "8px" }}>
            สมัครด้วย Google ไม่ต้องยืนยันอีเมลซ้ำ
          </p>

          <div className="divider" style={{ margin: "20px 0 24px" }}>
            หรือกรอกข้อมูล
          </div>

          <div className="stack" style={{ "--gap": "18px" } as React.CSSProperties}>
            <div className={`field${errors.user ? " has-error" : ""}`} id="f-user">
              <label htmlFor="username">ชื่อผู้ใช้</label>
              <input
                className="input"
                id="username"
                autoComplete="username"
                placeholder="ตัวอักษรอังกฤษหรือตัวเลข"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="field-error">ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร</p>
            </div>
            <div className={`field${errors.email ? " has-error" : ""}`} id="f-email">
              <label htmlFor="email">อีเมล</label>
              <input
                className="input"
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="field-hint">เราจะส่งลิงก์ยืนยันไปที่อีเมลนี้</p>
              <p className="field-error">รูปแบบอีเมลยังไม่ถูกต้อง</p>
            </div>
            <div className={`field${errors.pass ? " has-error" : ""}`} id="f-pass">
              <label htmlFor="password">รหัสผ่าน</label>
              <div className="pw-wrap">
                <input
                  className="input"
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="อย่างน้อย 8 ตัวอักษร"
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
              <p className="field-error">รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร</p>
            </div>
            <div className={`field${errors.confirm ? " has-error" : ""}`} id="f-confirm">
              <label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</label>
              <input
                className="input"
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <p className="field-error">รหัสผ่านไม่ตรงกัน</p>
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            style={{ marginTop: "28px" }}
            data-od-id="register-submit"
            disabled={submitting}
          >
            {submitting ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
          </button>

          <p className="auth-foot muted">
            มีบัญชีอยู่แล้ว? <Link className="link" href="/login">เข้าสู่ระบบ</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
