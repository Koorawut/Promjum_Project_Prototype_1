"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/icon";
import { apiFetch, apiUpload, ApiError, mediaSrc } from "@/lib/api-client";

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

type MgSet = {
  id: string;
  name: string;
  images: string[];
  correctIndex: number;
  imageCount: number;
  createdAt: string;
};

const KEYS = ["A", "B", "C", "D"];

// One image per A–D slot. `file` = newly picked (not yet uploaded),
// `preview` = ObjectURL for that file (owned here, revoked on change),
// `url` = previously stored URL from the server.
type Slot = { file: File | null; preview: string | null; url: string | null };

const EMPTY_SLOTS: Slot[] = [
  { file: null, preview: null, url: null },
  { file: null, preview: null, url: null },
  { file: null, preview: null, url: null },
  { file: null, preview: null, url: null },
];

function slotPreviewSrc(s: Slot): string | null {
  return s.preview ?? (s.url ? mediaSrc(s.url) ?? null : null);
}

export default function AdminMinigamePage() {
  const [sets, setSets] = useState<MgSet[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<MgSet | "new" | null>(null);
  const [slots, setSlots] = useState<Slot[]>(EMPTY_SLOTS);
  const [ans, setAns] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<MgSet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const editModalRef = useModalOpen(editing !== null, closeEdit);
  const deleteModalRef = useModalOpen(pendingDelete !== null, () =>
    setPendingDelete(null),
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // setState happens in the .then/.catch callbacks, not synchronously
    // in the effect body.
    apiFetch<MgSet[]>("/admin/minigame-sets")
      .then((data) => {
        setSets(data);
        setLoadError(null);
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดรายการไม่สำเร็จ"),
      );
  }, [reloadKey]);

  function openEdit(row: MgSet | "new") {
    setSaveError(null);
    if (row === "new") {
      setEditing("new");
      setSlots(EMPTY_SLOTS.map((s) => ({ ...s })));
      setAns(0);
    } else {
      setEditing(row);
      // Slot k = stored image k; "" holes for sets with ≠4 images so the
      // admin fills the missing slots.
      setSlots(
        KEYS.map((_, k) => ({
          file: null,
          preview: null,
          url: row.images[k] ?? null,
        })),
      );
      setAns(row.correctIndex);
    }
  }

  function closeEdit() {
    // Release every preview ObjectURL — they're only needed while the
    // modal is open.
    for (const s of slots) {
      if (s.preview) URL.revokeObjectURL(s.preview);
    }
    setEditing(null);
  }

  function pickSlot(k: number, file: File | null) {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== k) return s;
        if (s.preview) URL.revokeObjectURL(s.preview);
        return {
          file,
          preview: file ? URL.createObjectURL(file) : null,
          url: file ? null : s.url,
        };
      }),
    );
  }

  async function handleSave() {
    if (!editing) return;
    if (slots.some((s) => !s.file && !s.url)) {
      setSaveError("เลือกรูปภาพให้ครบทั้ง 4 รูป (A–D) ก่อนบันทึก");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append("correctIndex", String(ans));

      const changed = slots.filter((s) => s.file);
      for (const s of changed) fd.append("images", s.file!);

      if (editing === "new") {
        await apiUpload("/admin/minigame-sets", fd);
      } else {
        // "" marks slots replaced by a new file; kept slots carry their URL.
        fd.append(
          "slots",
          JSON.stringify(slots.map((s) => (s.file ? "" : s.url ?? ""))),
        );
        await apiUpload(`/admin/minigame-sets/${editing.id}`, fd, {
          method: "PATCH",
        });
      }

      closeEdit();
      reload();
      showToast("บันทึกแล้ว — เกมจะใช้ชุดคำตอบนี้ทันที");
    } catch (err) {
      setSaveError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "บันทึกไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await apiFetch(`/admin/minigame-sets/${target.id}`, { method: "DELETE" });
      setSets((prev) => (prev ? prev.filter((s) => s.id !== target.id) : prev));
      showToast("ลบชุดคำตอบแล้ว — เกมจะไม่สุ่มเจอชุดนี้อีกทันที");
    } catch {
      showToast("ลบไม่สำเร็จ");
      reload();
    }
  }

  const ansSlot = slots[ans];
  const ansPreview = ansSlot ? slotPreviewSrc(ansSlot) : null;

  return (
    <div className="container" style={{ maxWidth: "960px" }}>
      <Link className="admin-back" href="/admin">
        <Icon name="arrow-left" />
        กลับหน้า Dashboard
      </Link>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Admin Panel · PromJum</p>
          <h1>จัดการมินิเกม</h1>
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 20 }}>
        <Icon name="info" />
        <span>ชุดคำตอบ 1 ชุด = ภาพ 4 รูป โดยมี 1 รูปเป็น “ภาพคำตอบ” — ระหว่างเล่น ระบบสุ่มเลือกชุดแล้วสลับตำแหน่งภาพให้ “คนทาย” เห็นทั้ง 4 รูป ส่วน “คนอธิบาย” จะเห็นเฉพาะภาพคำตอบ แล้วอธิบายเป็นภาษาอังกฤษให้เพื่อนเลือกภาพนั้นให้ถูก</span>
      </div>

      {loadError && <p className="field-error" style={{ display: "block" }}>{loadError}</p>}

      <div className="qz-toolbar">
        <p className="qz-count">
          {sets
            ? `${sets.length} ชุดคำตอบ · เกมจะสุ่มเลือกจากชุดทั้งหมดนี้`
            : "กำลังโหลด..."}
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => openEdit("new")}>
          <Icon name="plus" />
          เพิ่มชุดคำตอบ
        </button>
      </div>

      <div className="mg-list" aria-live="polite">
        {sets === null ? (
          <p className="muted">กำลังโหลด...</p>
        ) : sets.length === 0 ? (
          <div className="notice">
            <Icon name="info" />
            <span>ยังไม่มีชุดคำตอบ กด “เพิ่มชุดคำตอบ” เพื่อสร้างชุดแรก — หากไม่มีชุดเลย เกมทายภาพจะไม่มีรอบให้เล่น</span>
          </div>
        ) : (
          sets.map((r, i) => (
            <div key={r.id} className="card-flat mg-row">
              <div className="mg-thumbs">
                {r.images.map((img, k) => (
                  <span
                    key={k}
                    className={`mg-thumb ${r.correctIndex === k ? "is-ans" : ""}`}
                    aria-label={`รูป ${KEYS[k]}${r.correctIndex === k ? " (ภาพคำตอบ)" : ""}`}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaSrc(img) ?? ""} alt={`รูป ${KEYS[k]}`} />
                    ) : (
                      <span className="ph-img"><Icon name="image" /></span>
                    )}
                    <span className="mg-key">{KEYS[k]}</span>
                    {r.correctIndex === k && (
                      <span className="ans-mark"><Icon name="check" /></span>
                    )}
                  </span>
                ))}
              </div>
              <div className="mg-info">
                <b>ชุดคำตอบ #{i + 1}</b>
                <span>
                  ภาพคำตอบ: ตำแหน่ง {KEYS[r.correctIndex] ?? "?"} — คนอธิบายเห็นเฉพาะรูปนี้
                  {r.imageCount !== 4 && ` (ชุดนี้มีรูป ${r.imageCount} รูป — แก้ไขเพื่อปรับให้ครบ 4)`}
                </span>
              </div>
              <div className="mg-actions">
                <button className="icon-btn" aria-label="แก้ไข" onClick={() => openEdit(r)}>
                  <Icon name="edit" />
                </button>
                <button className="icon-btn" aria-label="ลบ" onClick={() => setPendingDelete(r)}>
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---------- edit / add modal ---------- */}
      <dialog className="modal modal-lg" ref={editModalRef} onCancel={closeEdit}>
        {editing && (
          <>
            <div className="modal-head">
              <h2 style={{ fontSize: 22 }}>
                {editing === "new" ? "เพิ่มชุดคำตอบ" : "แก้ไขชุดคำตอบ"}
              </h2>
              <button className="icon-btn modal-close" aria-label="ปิด" onClick={closeEdit}>
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-fields">
              <div className="field" style={{ marginBottom: -4 }}>
                <label>รูปภาพทั้ง 4 รูป (กดที่ช่องเพื่อเลือกไฟล์ · เลือก 1 รูปเป็นภาพคำตอบ)</label>
              </div>
              <div className="mg-grid">
                {slots.map((s, k) => {
                  const src = slotPreviewSrc(s);
                  return (
                    <div className="mg-slot" key={k}>
                      <button
                        type="button"
                        className={`mg-drop ${src ? "is-filled" : ""} ${ans === k ? "is-ans" : ""}`}
                        aria-label={`เลือกหรือเปลี่ยนรูปภาพช่อง ${KEYS[k]}`}
                        onClick={() =>
                          document.getElementById(`mg-file-${k}`)?.click()
                        }
                      >
                        <span className="mg-key">{KEYS[k]}</span>
                        <span className="mg-ans-badge" hidden={ans !== k}>คำตอบ</span>
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={`รูปภาพช่อง ${KEYS[k]}`} />
                        ) : (
                          <span className="mg-empty">
                            <Icon name="image" />
                            <span>กดเพื่อเลือกรูป</span>
                          </span>
                        )}
                      </button>
                      <label className="mg-answer">
                        <input
                          type="radio"
                          name="mg-ans"
                          value={k}
                          checked={ans === k}
                          onChange={() => setAns(k)}
                          aria-label={`ตั้งรูป ${KEYS[k]} เป็นภาพคำตอบ`}
                        />
                        <span>ภาพคำตอบ</span>
                      </label>
                      <input
                        type="file"
                        id={`mg-file-${k}`}
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        onChange={(e) => pickSlot(k, e.target.files?.[0] ?? null)}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="caption muted" style={{ marginTop: -6 }}>
                JPG/PNG/WebP · ไม่เกิน 2MB ต่อรูป · ตอนผู้เล่นเห็น ระบบจะสลับตำแหน่งรูปเอง
              </p>
              <div className="mg-preview">
                <div className="mg-preview-thumb">
                  {ansPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ansPreview} alt="ภาพคำตอบที่คนอธิบายจะเห็น" />
                  ) : (
                    <Icon name="eye" />
                  )}
                </div>
                <div>
                  <b>พรีวิวฝั่ง “คนอธิบาย” — จะเห็นเฉพาะภาพคำตอบนี้</b>
                  <p>ส่วน “คนทาย” เห็นภาพทั้ง 4 พร้อมกันแล้วเลือกว่ารูปไหนตรงกับคำอธิบาย</p>
                </div>
              </div>
            </div>
            {saveError && (
              <p className="field-error" style={{ display: "block", marginTop: 12 }}>
                {saveError}
              </p>
            )}
            <div className="row">
              <button className="btn btn-secondary" onClick={closeEdit}>
                ยกเลิก
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </>
        )}
      </dialog>

      {/* ---------- delete confirm ---------- */}
      <dialog className="modal" ref={deleteModalRef} onCancel={() => setPendingDelete(null)}>
        <h2 style={{ fontSize: 22 }}>ลบชุดคำตอบนี้?</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          ชุดนี้จะหายจากเกมทันที — แมตช์ใหม่จะไม่สุ่มเจอชุดนี้อีก (แมตช์ที่กำลังเล่นอยู่ใช้ภาพที่แจกไว้แล้วจนจบรอบ) และไม่สามารถย้อนกลับได้
        </p>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
            ยกเลิก
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            ลบชุดคำตอบ
          </button>
        </div>
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
