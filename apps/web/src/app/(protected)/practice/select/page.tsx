"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { apiFetch, ApiError } from "@/lib/api-client";

type Category = {
  id: string;
  name: string;
  slug: string;
  sentenceCount: number;
  hasHistory: boolean;
};

// The backend has no per-category icon/tint metadata, so we assign a
// deterministic cosmetic icon+tint by slug (falling back to a rotation of
// the existing CSS tint classes for any category not explicitly listed).
const ICON_BY_SLUG: Record<string, { icon: string; tint: string }> = {
  "daily-life": { icon: "sun", tint: "daily" },
  travel: { icon: "plane", tint: "travel" },
  "food-dining": { icon: "speaker", tint: "biz" },
};
const TINT_FALLBACKS = ["daily", "travel", "biz", "law"];

function iconFor(slug: string, index: number) {
  return (
    ICON_BY_SLUG[slug] ?? {
      icon: "book",
      tint: TINT_FALLBACKS[index % TINT_FALLBACKS.length],
    }
  );
}

type Mode = "new" | "mixed";

export default function PracticeSelectPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("mixed");
  const [count, setCount] = useState<2 | 3>(3);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Category[]>("/categories")
      .then((cats) => {
        setCategories(cats);
        if (cats.length > 0) setCategoryId(cats[0].id);
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "โหลดหมวดไม่สำเร็จ"),
      );
  }, []);

  const cat = categories?.find((c) => c.id === categoryId) ?? null;
  const effectiveMode: Mode = cat?.hasHistory ? mode : "new";

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    const next = categories?.find((c) => c.id === id);
    if (next && !next.hasHistory && mode === "mixed") setMode("new");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    setStarting(true);
    setStartError(null);
    try {
      const { sessionId } = await apiFetch<{ sessionId: string }>(
        "/practice/session",
        { method: "POST", body: { categoryId, count } },
      );
      router.push(`/practice/${sessionId}`);
    } catch (err) {
      setStartError(
        err instanceof ApiError ? err.message : "เริ่มฝึกไม่สำเร็จ",
      );
      setStarting(false);
    }
  }

  if (loadError) {
    return (
      <div className="container narrow" style={{ maxWidth: "880px" }}>
        <p className="field-error" style={{ display: "block" }}>{loadError}</p>
      </div>
    );
  }

  if (!categories || !cat) {
    return (
      <div className="container narrow" style={{ maxWidth: "880px" }}>
        <p className="muted">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="container narrow" style={{ maxWidth: "880px" }}>
      <div className="hello" data-od-id="practice-hello">
        <div>
          <p className="eyebrow">ฝึกพูด</p>
          <h1>วันนี้อยากฝึกเรื่องอะไรดี?</h1>
        </div>
      </div>

      <form id="setup" data-od-id="practice-setup-form" onSubmit={handleSubmit}>
        <section className="step" style={{ marginTop: 0 }} data-od-id="step-category">
          <div className="step-head">
            <span className="step-num">1</span>
            <h2>เลือกหมวด</h2>
          </div>
          <div className="cats" role="radiogroup" aria-label="หมวดประโยค">
            {categories.map((c, i) => {
              const { icon, tint } = iconFor(c.slug, i);
              return (
                <label className="choice" key={c.id} data-od-id={`cat-card-${c.slug}`}>
                  <input
                    type="radio"
                    name="cat"
                    value={c.id}
                    checked={categoryId === c.id}
                    onChange={() => handleCategoryChange(c.id)}
                  />
                  <span className="choice-body">
                    <span className={`cat-icon cat-${tint}`}>
                      <Icon name={icon} className="icon icon-lg" />
                    </span>
                    <span className="cat-name">
                      {c.name}
                      <span className="cat-en">{c.sentenceCount} ประโยค</span>
                    </span>
                    <span className="choice-tick">
                      <Icon name="check" />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="step" data-od-id="step-mode">
          <div className="step-head">
            <span className="step-num">2</span>
            <h2>ฝึกแบบไหน</h2>
          </div>
          <div className="modes" role="radiogroup" aria-label="รูปแบบการฝึก">
            <label className="choice" data-od-id="mode-card-new">
              <input
                type="radio"
                name="mode"
                value="new"
                checked={effectiveMode === "new"}
                onChange={() => setMode("new")}
              />
              <span className="choice-body">
                <span className="mode-ic">
                  <Icon name="sparkle" />
                </span>
                <span>
                  <span className="choice-title">ประโยคใหม่ทั้งหมด</span>
                  <br />
                  <span className="choice-sub">ยังไม่เคยเจอมาก่อน</span>
                </span>
                <span className="choice-tick">
                  <Icon name="check" />
                </span>
              </span>
            </label>
            <label className="choice" data-od-id="mode-card-mixed">
              <input
                type="radio"
                name="mode"
                value="mixed"
                disabled={!cat.hasHistory}
                checked={effectiveMode === "mixed"}
                onChange={() => setMode("mixed")}
              />
              <span className="choice-body">
                <span className="mode-ic">
                  <Icon name="repeat" />
                </span>
                <span>
                  <span className="choice-title">ใหม่ + ทบทวนของเก่า</span>
                  <br />
                  <span className="choice-sub" id="mixed-sub">
                    {cat.hasHistory ? "ผสมประโยคที่เคยฝึกจบแล้ว" : "ยังไม่มีประโยคที่ฝึกจบในหมวดนี้"}
                  </span>
                </span>
                <span className="choice-tick">
                  <Icon name="check" />
                </span>
              </span>
            </label>
          </div>
          <p className="small muted" style={{ marginTop: "10px" }}>
            ระบบจะเลือกประโยคใหม่/ทบทวนให้อัตโนมัติตามประวัติการฝึกของคุณ
          </p>
        </section>

        <section className="step" data-od-id="step-count">
          <div className="step-head">
            <span className="step-num">3</span>
            <h2>จำนวนประโยค</h2>
          </div>
          <div className="counts" role="radiogroup" aria-label="จำนวนประโยค">
            {([2, 3] as const).map((n) => (
              <label className="choice" key={n} data-od-id={`count-card-${n}`}>
                <input
                  type="radio"
                  name="count"
                  value={n}
                  checked={count === n}
                  onChange={() => setCount(n)}
                />
                <span className="choice-body">
                  <span className="count-big">{n}</span>
                  <span>
                    <span className="choice-title">ประโยค · {n === 2 ? "รอบสั้น" : "รอบปกติ"}</span>
                  </span>
                  <span className="choice-tick">
                    <Icon name="check" />
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <div className="actionbar" data-od-id="practice-start-bar">
          <div className="card">
            <div className="summary-text" id="summary">
              <strong>
                {cat.name} · {count} ประโยค
              </strong>
              {startError && <span className="field-error" style={{ display: "block" }}>{startError}</span>}
            </div>
            <span className="spacer"></span>
            <button className="btn btn-primary" type="submit" data-od-id="practice-start" disabled={starting}>
              {starting ? "กำลังเริ่ม..." : "เริ่มฝึก"}
              <Icon name="arrow-right" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
