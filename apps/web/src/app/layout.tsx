import type { Metadata } from "next";
import { Mitr, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import IconSprite from "@/components/icon-sprite";
import AuthInitializer from "@/components/auth-initializer";
import ForceLogoutListener from "@/components/force-logout-listener";
import CallSessionManager from "@/components/call-session-manager";

const mitr = Mitr({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mitr",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans-thai",
});

export const metadata: Metadata = {
  title: "PromJum",
  description: "ฝึกพูดภาษาอังกฤษทีละประโยค",
};

// App version shown bottom-right on every page. Bump this with each
// user-visible update (kept in one place; v1.1 = first versioned release).
// v1.2 = quiz admin fixes: options format, media URL resolution, edit form.
// v1.3 = minigame answer set management in the admin panel.
// v1.3.1 = full e2e verification of minigame admin against production.
export const APP_VERSION = "1.3.1";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`h-full ${mitr.variable} ${notoSansThai.variable}`}>
      <body className="min-h-full flex flex-col">
        <IconSprite />
        <AuthInitializer />
        <ForceLogoutListener />
        <CallSessionManager />
        {children}
        <div className="version-badge" aria-hidden="true">v{APP_VERSION}</div>
      </body>
    </html>
  );
}
