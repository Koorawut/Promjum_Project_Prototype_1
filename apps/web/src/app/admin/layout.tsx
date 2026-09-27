"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { useAuthStore } from "@/store/auth";
import { useAuth } from "@/hooks/useAuth";

// Admin Panel layout — dark topbar + "โหมดแอดมิน" badge per the design
// (admin-dashboard.html). Admin is a superset of a normal user: the
// arrow-left button returns to the normal site at any time.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "idle" || status === "loading") return null;
  if (status === "unauthenticated" || !user) return null;

  // Non-admins never see admin content even if they hand-type /admin/...
  // (the backend AdminGuard rejects them too — this is just UX).
  if (user.role !== "admin") {
    return (
      <main className="page">
        <div className="container narrow" style={{ maxWidth: "560px" }}>
          <div className="notice notice-warn" style={{ marginTop: "32px" }}>
            <Icon name="info" />
            <span>หน้านี้เฉพาะผู้ดูแลระบบ (admin) เท่านั้น</span>
          </div>
        </div>
      </main>
    );
  }

  const navItems: { href: string; label: string; icon: string }[] = [
    { href: "/admin", label: "ภาพรวม", icon: "home" },
    { href: "/admin/quizzes", label: "จัดการ Quiz", icon: "book" },
    { href: "/admin/minigame", label: "จัดการมินิเกม", icon: "game" },
    { href: "/admin/users", label: "จัดการผู้ใช้", icon: "users" },
  ];

  return (
    <>
      <header className="topbar admin-topbar">
        <div className="container topbar-inner">
          <Link className="logo" href="/admin">
            <span className="logo-mark">
              <Icon name="shield" />
            </span>
            PromJum
          </Link>
          <nav className="nav" aria-label="เมนู Admin">
            {navItems.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={
                  (n.href === "/admin" && pathname === "/admin") ||
                  (n.href !== "/admin" && pathname.startsWith(n.href))
                    ? "page"
                    : undefined
                }
              >
                <Icon name={n.icon} />
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="spacer"></span>
          <span className="admin-mode-badge">
            <Icon name="shield" />
            โหมดแอดมิน
          </span>
          <Link
            className="icon-btn"
            href="/home"
            aria-label="ไปหน้าแรกของผู้ใช้"
            title="ไปหน้าแรกของผู้ใช้"
          >
            <Icon name="arrow-left" />
          </Link>
          <button
            className="btn btn-ghost btn-sm"
            aria-label="ออกจากระบบ"
            onClick={() => logout()}
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
