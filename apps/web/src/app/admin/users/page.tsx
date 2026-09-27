"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/icon";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

/**
 * A <dialog open> sits inline in the document flow (bottom-left corner)
 * instead of the browser top layer. Calling showModal() is what actually
 * centers it and dims the page behind it.
 */
function useModalOpen(active: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [active]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);
  return ref;
}

type UserRow = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  createdAt: string;
};

export default function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const deleteModalRef = useModalOpen(pendingDelete !== null, () =>
    setPendingDelete(null),
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadUsers = useCallback((q: string) => {
    setRows(null);
    setLoadError(null);
    apiFetch<UserRow[]>(`/admin/users${q ? `?search=${encodeURIComponent(q)}` : ""}`)
      .then(setRows)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดรายชื่อไม่สำเร็จ"),
      );
  }, []);

  // Debounced search — the design fires queries as you type, not on submit.
  useEffect(() => {
    const t = setTimeout(() => loadUsers(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  async function handleVerify(row: UserRow) {
    // Optimistic; revert on failure.
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === row.id ? { ...r, emailVerified: true } : r)) : prev,
    );
    try {
      await apiFetch(`/admin/users/${row.id}/verify`, { method: "PATCH" });
      showToast(`ยืนยันบัญชี ${row.username} เรียบร้อย`);
    } catch {
      setRows((prev) =>
        prev ? prev.map((r) => (r.id === row.id ? { ...r, emailVerified: false } : r)) : prev,
      );
      showToast("ยืนยันบัญชีไม่สำเร็จ");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await apiFetch(`/admin/users/${target.id}`, { method: "DELETE" });
      setRows((prev) => (prev ? prev.filter((r) => r.id !== target.id) : prev));
      showToast("ลบบัญชีแล้ว");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ลบบัญชีไม่สำเร็จ");
      loadUsers(search.trim());
    }
  }

  return (
    <div className="container" style={{ maxWidth: "960px" }}>
      <Link className="admin-back" href="/admin">
        <Icon name="arrow-left" />
        กลับหน้า Dashboard
      </Link>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Admin Panel · SpeakUp</p>
          <h1>จัดการผู้ใช้</h1>
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label htmlFor="usr-search" className="sr-only">ค้นหาผู้ใช้</label>
        <input
          id="usr-search"
          className="input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาด้วย Display name หรือ Email…"
        />
      </div>

      {loadError && <p className="field-error" style={{ display: "block" }}>{loadError}</p>}

      <div className="usr-list" aria-live="polite">
        {rows === null ? (
          <p className="muted">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <div className="notice">
            <Icon name="info" />
            <span>ไม่พบผู้ใช้ที่ตรงกับการค้นหา</span>
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="card-flat usr-row">
              <span className="avatar">
                <Icon name="user" />
              </span>
              <div className="usr-info">
                <span className="usr-line">
                  <b>{r.username}</b>
                  <span className="usr-email">{r.email}</span>
                </span>
                <span className="qz-tags">
                  {r.role === "admin" && (
                    <span className="badge badge-sun">
                      <Icon name="shield" />
                      แอดมิน
                    </span>
                  )}
                  <span className={`badge ${r.emailVerified ? "badge-success" : ""}`}>
                    <Icon name={r.emailVerified ? "check" : "mail"} />
                    {r.emailVerified ? "ยืนยันอีเมลแล้ว" : "ยังไม่ยืนยันอีเมล"}
                  </span>
                </span>
              </div>
              <div className="usr-actions">
                {!r.emailVerified && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleVerify(r)}>
                    <Icon name="check" />
                    ยืนยันบัญชี
                  </button>
                )}
                <button
                  className="icon-btn"
                  aria-label="ลบบัญชี"
                  disabled={r.id === me?.id || r.role === "admin"}
                  title={
                    r.id === me?.id
                      ? "ไม่สามารถลบบัญชีของตัวเองได้"
                      : r.role === "admin"
                        ? "ไม่สามารถลบบัญชีแอดมินได้"
                        : "ลบบัญชี"
                  }
                  onClick={() => setPendingDelete(r)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="notice" style={{ marginTop: 24 }}>
        <Icon name="lock" />
        <span>ระบบแสดงเฉพาะ Display name, Email และสถานะการยืนยันเท่านั้น — ไม่มีการเข้าถึงรหัสผ่านของผู้ใช้ทุกคน</span>
      </div>

      {/* ---------- delete confirm ---------- */}
      <dialog className="modal" ref={deleteModalRef} onCancel={() => setPendingDelete(null)}>
        {pendingDelete && (
          <>
            <h2 style={{ fontSize: 22 }}>ลบบัญชี “{pendingDelete.username}”?</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              การลบจะมีผลกับฐานข้อมูลทันที ประวัติการเรียนและความคืบหน้าของบัญชีนี้จะหายไปทั้งหมด และไม่สามารถย้อนกลับได้
            </p>
            <div className="row">
              <button className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                ลบบัญชี
              </button>
            </div>
          </>
        )}
      </dialog>

      {toast && (
        <div className="toast show" role="status" aria-live="polite">
          <Icon name="check" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
