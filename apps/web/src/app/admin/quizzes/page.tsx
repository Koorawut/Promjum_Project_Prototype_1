"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/icon";
import { apiFetch, apiUpload, ApiError, API_URL } from "@/lib/api-client";

type QuizRow = {
  id: string;
  categoryId: string;
  textEn: string;
  textTh: string | null;
  question: string | null;
  options: string[] | null;
  correctIndex: number | null;
  imageUrl: string | null;
  audioUrl: string | null;
  isEnabled: boolean;
};

type Category = { id: string; name: string; slug: string };

// Seed categories map onto the four card tints; anything added later
// cycles through the palette by index.
const CAT_TINTS: Record<string, string> = {
  "daily-life": "daily",
  travel: "travel",
  "food-dining": "biz",
  shopping: "law",
};

function tintFor(slug: string, index: number) {
  return CAT_TINTS[slug] ?? ["daily", "travel", "biz", "law"][index % 4];
}

/** imageUrl may be a /media/... path from our own upload service. */
export function mediaSrc(url: string) {
  return url.startsWith("/media/") ? `${API_URL}${url}` : url;
}

/**
 * A <dialog open> sits inline in the document flow (bottom-left corner)
 * instead of the browser top layer. Calling showModal() is what actually
 * centers it and dims the page behind it — this effect does that whenever
 * a modal is shown.
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
  // Native dialogs also close on Esc — sync React state when that happens.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);
  return ref;
}

const EMPTY_FORM = {
  textEn: "",
  textTh: "",
  question: "",
  options: ["", "", "", ""],
  correctIndex: 0,
};

export default function AdminQuizzesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [activeSlug, setActiveSlug] = useState<string>("");
  const [rows, setRows] = useState<QuizRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // edit modal state
  const [editing, setEditing] = useState<QuizRow | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<QuizRow | null>(null);
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

  const loadRows = useCallback((slug: string) => {
    setRows(null);
    setLoadError(null);
    apiFetch<QuizRow[]>(`/admin/quizzes?category=${encodeURIComponent(slug)}`)
      .then(setRows)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดรายการไม่สำเร็จ"),
      );
  }, []);

  useEffect(() => {
    apiFetch<Category[]>("/categories")
      .then((cats) => {
        setCategories(cats);
        if (cats.length > 0) {
          setActiveSlug(cats[0].slug);
          loadRows(cats[0].slug);
        }
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดหมวดไม่สำเร็จ"),
      );
  }, [loadRows]);

  function switchTab(slug: string) {
    setActiveSlug(slug);
    loadRows(slug);
  }

  function openEdit(row: QuizRow | "new") {
    setSaveError(null);
    setImgFile(null);
    setAudioFile(null);
    if (imgPreview) {
      URL.revokeObjectURL(imgPreview);
      setImgPreview(null);
    }
    if (row === "new") {
      setEditing("new");
      setForm(EMPTY_FORM);
    } else {
      setEditing(row);
      setForm({
        textEn: row.textEn,
        textTh: row.textTh ?? "",
        question: row.question ?? "",
        options: row.options ?? ["", "", "", ""],
        correctIndex: row.correctIndex ?? 0,
      });
    }
  }

  function closeEdit() {
    if (imgPreview) {
      URL.revokeObjectURL(imgPreview);
      setImgPreview(null);
    }
    setEditing(null);
  }

  function pickImage(file: File | null) {
    if (imgPreview) {
      URL.revokeObjectURL(imgPreview);
      setImgPreview(null);
    }
    setImgFile(file);
    if (file) setImgPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!editing) return;
    if (
      !form.textEn.trim() ||
      !form.textTh.trim() ||
      !form.question.trim() ||
      form.options.some((o) => !o.trim())
    ) {
      setSaveError("กรอกประโยค คำถาม และตัวเลือกให้ครบทุกช่องก่อนบันทึก");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Audio goes up first on its own endpoint; the returned /media/...
      // URL then rides along as a plain field on the quiz save.
      let audioUrl: string | undefined;
      if (audioFile) {
        const audioFd = new FormData();
        audioFd.append("audio", audioFile);
        ({ url: audioUrl } = await apiUpload<{ url: string }>(
          "/admin/media/audio",
          audioFd,
        ));
      }

      const fd = new FormData();
      fd.append("textEn", form.textEn);
      fd.append("textTh", form.textTh);
      fd.append("question", form.question);
      fd.append("options", JSON.stringify(form.options));
      fd.append("correctIndex", String(form.correctIndex));
      if (imgFile) fd.append("image", imgFile);

      if (editing === "new") {
        fd.append("category", activeSlug);
        if (audioUrl) fd.append("audioUrl", audioUrl);
      } else {
        if (editing.imageUrl && !imgFile) fd.append("imageUrl", editing.imageUrl);
        if (audioUrl) {
          fd.append("audioUrl", audioUrl);
        } else if (editing.audioUrl) {
          fd.append("audioUrl", editing.audioUrl);
        }
      }

      await apiUpload(
        `/admin/quizzes${editing === "new" ? "" : `/${editing.id}`}`,
        fd,
        { method: editing === "new" ? "POST" : "PATCH" },
      );

      closeEdit();
      loadRows(activeSlug);
      showToast("บันทึกแล้ว — เนื้อหาบนเว็บไซต์อัปเดตทันที");
    } catch (err) {
      setSaveError(err instanceof ApiError || err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(row: QuizRow, enabled: boolean) {
    // Optimistic UI; revert on failure.
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === row.id ? { ...r, isEnabled: enabled } : r)) : prev,
    );
    try {
      await apiFetch(`/admin/quizzes/${row.id}`, {
        method: "PATCH",
        body: { enabled },
      });
      showToast(enabled ? "แสดง Quiz นี้บนเว็บไซต์แล้ว" : "ซ่อน Quiz นี้จากเว็บไซต์แล้ว");
    } catch {
      setRows((prev) =>
        prev ? prev.map((r) => (r.id === row.id ? { ...r, isEnabled: !enabled } : r)) : prev,
      );
      showToast("เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await apiFetch(`/admin/quizzes/${target.id}`, { method: "DELETE" });
      setRows((prev) => (prev ? prev.filter((r) => r.id !== target.id) : prev));
      showToast("ลบ Quiz แล้ว — เนื้อหาบนเว็บไซต์อัปเดตทันที");
    } catch {
      showToast("ลบไม่สำเร็จ");
      loadRows(activeSlug);
    }
  }

  if (loadError) {
    return (
      <div className="container" style={{ maxWidth: "960px" }}>
        <p className="field-error" style={{ display: "block" }}>{loadError}</p>
      </div>
    );
  }

  const activeIndex = categories?.findIndex((c) => c.slug === activeSlug) ?? 0;
  const tint = tintFor(activeSlug, activeIndex < 0 ? 0 : activeIndex);
  const hiddenCount = rows?.filter((r) => !r.isEnabled).length ?? 0;

  return (
    <div className="container" style={{ maxWidth: "960px" }}>
      <Link className="admin-back" href="/admin">
        <Icon name="arrow-left" />
        กลับหน้า Dashboard
      </Link>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Admin Panel · SpeakUp</p>
          <h1>จัดการ Quiz</h1>
        </div>
      </div>

      <div className="qz-tabs" role="tablist" aria-label="เลือกหมวด">
        {(categories ?? []).map((c, i) => (
          <button
            key={c.slug}
            className={`qz-tab ${c.slug === activeSlug ? "is-active" : ""}`}
            onClick={() => switchTab(c.slug)}
            role="tab"
            aria-selected={c.slug === activeSlug}
          >
            <span className={`cat-icon cat-${tintFor(c.slug, i)}`}>
              <Icon name="book" />
            </span>
            {c.name}
          </button>
        ))}
      </div>

      <div className="qz-toolbar">
        <p className="qz-count">
          {rows
            ? `${rows.length} Quiz ในหมวดนี้${hiddenCount ? ` · ซ่อนอยู่ ${hiddenCount}` : ""}`
            : "กำลังโหลด..."}
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => openEdit("new")}>
          <Icon name="plus" />
          เพิ่ม Quiz
        </button>
      </div>

      <div className="qz-list" aria-live="polite">
        {rows === null ? (
          <p className="muted">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <div className="notice">
            <Icon name="info" />
            <span>ยังไม่มี Quiz ในหมวดนี้ กด “เพิ่ม Quiz” เพื่อสร้างรายการแรก</span>
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className={`card-flat qz-row ${r.isEnabled ? "" : "is-off"}`}>
              <div className={`ph-img tint-${tint}`}>
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(r.imageUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name="image" />
                )}
              </div>
              <div className="qz-info">
                <b className="en" lang="en">{r.textEn}</b>
                <span className="th">{r.textTh}</span>
                {r.question && <span className="qz-q">คำถาม: {r.question}</span>}
                {r.audioUrl && (
                  <span className="qz-tags">
                    <span className="badge">
                      <Icon name="speaker" />
                      มีไฟล์เสียง
                    </span>
                  </span>
                )}
              </div>
              <label className="qz-status" title="เปิด/ปิดการแสดง Quiz นี้บนเว็บไซต์">
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={r.isEnabled}
                    onChange={(e) => handleToggle(r, e.target.checked)}
                    aria-label="เปิด/ปิดการแสดง Quiz นี้"
                  />
                  <span className="track"></span>
                </span>
                <span className={`badge ${r.isEnabled ? "badge-success" : ""}`}>
                  {r.isEnabled ? "แสดงอยู่" : "ซ่อนอยู่"}
                </span>
              </label>
              <div className="qz-actions">
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
              {editing === "new" ? "เพิ่ม Quiz ใหม่" : "แก้ไข Quiz"}
            </h2>
            <button className="icon-btn modal-close" aria-label="ปิด" onClick={closeEdit}>
              <Icon name="close" />
            </button>
          </div>
          <div className="modal-fields">
            <div className="media-edit">
              <div className="media-thumb">
                {imgPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : editing !== "new" && editing.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(editing.imageUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name="image" />
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => document.getElementById("f-img")?.click()}
                >
                  <Icon name="image" />
                  เลือกไฟล์รูปภาพ…
                </button>
                <p className="file-name">
                  {imgFile
                    ? imgFile.name
                    : editing !== "new" && editing.imageUrl
                      ? "ไฟล์ปัจจุบัน: รูปเดิม (ไม่เปลี่ยนถ้าไม่เลือกใหม่)"
                      : "ยังไม่มีรูปภาพ"}
                </p>
                <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  แนะนำ 4:3 · JPG/PNG/WebP · ไม่เกิน 2MB
                </p>
              </div>
              <input
                type="file"
                id="f-img"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="media-edit">
              <div className="media-thumb audio">
                <Icon name="speaker" />
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => document.getElementById("f-audio")?.click()}
                >
                  <Icon name="speaker" />
                  เลือกไฟล์เสียง…
                </button>
                <p className="file-name">
                  {audioFile
                    ? audioFile.name
                    : editing !== "new" && editing.audioUrl
                      ? "ไฟล์ปัจจุบัน: เสียงเดิม (ไม่เปลี่ยนถ้าไม่เลือกใหม่)"
                      : "ยังไม่มีไฟล์เสียง"}
                </p>
                <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  MP3/M4A/WAV · ไม่เกิน 5MB · ใช้ในโหมดฟังเสียงระหว่างฝึกพูด
                </p>
              </div>
              <input
                type="file"
                id="f-audio"
                accept="audio/mpeg,audio/mp4,audio/wav"
                hidden
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="field">
              <label htmlFor="f-en">ประโยคภาษาอังกฤษ</label>
              <input
                className="input en"
                id="f-en"
                value={form.textEn}
                onChange={(e) => setForm({ ...form, textEn: e.target.value })}
                placeholder="Can I get an iced latte, please?"
              />
            </div>
            <div className="field">
              <label htmlFor="f-th">ประโยคภาษาไทย</label>
              <input
                className="input"
                id="f-th"
                value={form.textTh}
                onChange={(e) => setForm({ ...form, textTh: e.target.value })}
                placeholder="ขอลาเต้เย็นหนึ่งแก้วได้ไหมครับ"
              />
            </div>
            <div className="field">
              <label htmlFor="f-q">คำถาม Quiz</label>
              <input
                className="input"
                id="f-q"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="What is the customer asking for?"
              />
            </div>
            <div className="field">
              <label>ตัวเลือกคำตอบ (เลือกข้อที่ถูก)</label>
              <div className="stack" style={{ "--gap": "10px", marginTop: 8 } as React.CSSProperties}>
                {form.options.map((o, k) => (
                  <div className="opt-row" key={k}>
                    <input
                      type="radio"
                      name="ans"
                      value={k}
                      checked={form.correctIndex === k}
                      onChange={() => setForm({ ...form, correctIndex: k })}
                      aria-label={`ตัวเลือกที่ถูก ข้อ ${k + 1}`}
                    />
                    <input
                      className="input"
                      value={o}
                      onChange={(e) => {
                        const options = [...form.options];
                        options[k] = e.target.value;
                        setForm({ ...form, options });
                      }}
                      placeholder={`ตัวเลือกที่ ${k + 1}`}
                    />
                  </div>
                ))}
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
              กลับ
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
        <h2 style={{ fontSize: 22 }}>ลบ Quiz นี้?</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          การลบจะมีผลกับฐานข้อมูลทันที เนื้อหาหายไปจากเว็บไซต์ทันที และไม่สามารถย้อนกลับได้
        </p>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
            ยกเลิก
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            ลบ Quiz
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
