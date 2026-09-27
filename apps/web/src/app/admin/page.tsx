"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/icon";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

type Stats = {
  quizzes: { total: number };
  users: { total: number; verified: number; unverified: number };
};

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Stats>("/admin/stats")
      .then(setStats)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "โหลดสถิติไม่สำเร็จ"),
      );
  }, []);

  return (
    <div className="container" style={{ maxWidth: "960px" }}>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Admin Panel · PromJum</p>
          <h1>ภาพรวมระบบ</h1>
        </div>
        {user && (
          <span className="badge badge-sun">
            <Icon name="user" />
            {user.username}
          </span>
        )}
      </div>

      {error && <p className="field-error" style={{ display: "block" }}>{error}</p>}

      <div className="admin-stats">
        <div className="card stat-card">
          <span className="stat-ic">
            <Icon name="book" className="icon icon-lg" />
          </span>
          <div>
            <div className="stat-num">{stats ? stats.quizzes.total : "…"}</div>
            <div className="stat-label">Quiz ทั้งหมด</div>
          </div>
        </div>
        <div className="card stat-card">
          <span className="stat-ic">
            <Icon name="users" className="icon icon-lg" />
          </span>
          <div>
            <div className="stat-num">{stats ? stats.users.total : "…"}</div>
            <div className="stat-label">บัญชีที่สมัครทั้งหมด</div>
          </div>
        </div>
        <div className="card stat-card">
          <span className="stat-ic tint-success">
            <Icon name="check" className="icon icon-lg" />
          </span>
          <div>
            <div className="stat-num">{stats ? stats.users.verified : "…"}</div>
            <div className="stat-label">ยืนยันอีเมลแล้ว</div>
          </div>
        </div>
        <div className="card stat-card">
          <span className="stat-ic tint-warn">
            <Icon name="mail" className="icon icon-lg" />
          </span>
          <div>
            <div className="stat-num">{stats ? stats.users.unverified : "…"}</div>
            <div className="stat-label">ยังไม่ยืนยันอีเมล</div>
          </div>
        </div>
      </div>

      <div className="admin-panels">
        <Link className="panel-link" href="/admin/quizzes">
          <span className="cat-icon cat-daily">
            <Icon name="book" className="icon icon-lg" />
          </span>
          <div>
            <b>จัดการ Quiz</b>
            <p>เลือกหมวด เพิ่ม/แก้ไข/ลบ Quiz พร้อมแนบรูปภาพและไฟล์เสียง และเปิด–ปิดการแสดงผล — ทุกการเปลี่ยนแปลงอัปเดตขึ้นเว็บไซต์ทันที</p>
          </div>
          <Icon name="arrow-right" className="icon icon-arrow" />
        </Link>
        <Link className="panel-link" href="/admin/minigame">
          <span className="cat-icon cat-travel">
            <Icon name="game" className="icon icon-lg" />
          </span>
          <div>
            <b>จัดการมินิเกม</b>
            <p>จัดชุดคำตอบของเกมทายภาพ — อัปโหลดรูป 4 รูปต่อชุด เลือกภาพคำตอบที่ “คนอธิบาย” จะเห็น ทุกชุดถูกสุ่มเข้าเกมทันที</p>
          </div>
          <Icon name="arrow-right" className="icon icon-arrow" />
        </Link>
        <Link className="panel-link" href="/admin/users">
          <span className="cat-icon cat-biz">
            <Icon name="users" className="icon icon-lg" />
          </span>
          <div>
            <b>จัดการผู้ใช้</b>
            <p>ดู Display name, Email และสถานะการยืนยันของทุกบัญชี ค้นหาด้วยชื่อ/อีเมล ยืนยันบัญชีแทน หรือลบบัญชีออกจากฐานข้อมูล</p>
          </div>
          <Icon name="arrow-right" className="icon icon-arrow" />
        </Link>
      </div>

      <div className="notice" style={{ marginTop: 24 }}>
        <Icon name="info" />
        <span>บัญชี Admin ใช้งานเว็บไซต์ส่วนผู้ใช้ทั่วไปได้ตามปกติ — สลับไปมาระหว่างหน้าแรกของผู้ใช้กับหน้า Dashboard ได้ทุกเมื่อ ด้วยปุ่มลูกศรซ้ายที่ Topbar ด้านบน</span>
      </div>
    </div>
  );
}
