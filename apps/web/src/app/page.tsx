"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function Home() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "idle" || status === "loading") return;
    router.replace(status === "authenticated" ? "/home" : "/login");
  }, [status, router]);

  return null;
}
