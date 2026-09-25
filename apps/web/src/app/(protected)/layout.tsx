"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/icon";
import { useAuthStore } from "@/store/auth";
import { useAuth } from "@/hooks/useAuth";

const FOCUS_MODE_PREFIXES = [/^\/practice\/[^/]+$/, /^\/game\/[^/]+$/];

function isFocusMode(pathname: string) {
  return FOCUS_MODE_PREFIXES.some((re) => re.test(pathname));
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const { refresh, logout } = useAuth();

  useEffect(() => {
    if (status === "idle") {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "idle" || status === "loading") return null;
  if (status === "unauthenticated" || !user) return null;

  if (isFocusMode(pathname)) {
    return <>{children}</>;
  }

  const initial = user.username.slice(0, 1).toUpperCase();

  return (
    <>
      <header className="topbar" data-od-id="topbar">
        <div className="container topbar-inner">
          <Link className="logo" href="/home">
            <span className="logo-mark">
              <Icon name="logo" />
            </span>
            SpeakUp
          </Link>
          <nav className="nav" aria-label="เมนูหลัก">
            <Link href="/home" aria-current={pathname === "/home" ? "page" : undefined}>
              <Icon name="logo" />
              หน้าแรก
            </Link>
            <Link href="/practice/select" aria-current={pathname.startsWith("/practice") ? "page" : undefined}>
              <Icon name="book" />
              ฝึกพูด
            </Link>
            <Link href="/game/lobby" aria-current={pathname.startsWith("/game") ? "page" : undefined}>
              <Icon name="game" />
              มินิเกม
            </Link>
          </nav>
          <span className="spacer"></span>
          <div className="user-chip">
            <span className="avatar">{initial}</span>
            <span className="user-name">{user.username}</span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            aria-label="ออกจากระบบ"
            onClick={() => logout()}
            data-od-id="logout"
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <main className="page">{children}</main>

      <nav className="tabbar" aria-label="เมนูหลัก">
        <Link href="/home" aria-current={pathname === "/home" ? "page" : undefined}>
          <Icon name="logo" />
          หน้าแรก
        </Link>
        <Link href="/practice/select" aria-current={pathname.startsWith("/practice") ? "page" : undefined}>
          <Icon name="book" />
          ฝึกพูด
        </Link>
        <Link href="/game/lobby" aria-current={pathname.startsWith("/game") ? "page" : undefined}>
          <Icon name="game" />
          มินิเกม
        </Link>
      </nav>
    </>
  );
}
