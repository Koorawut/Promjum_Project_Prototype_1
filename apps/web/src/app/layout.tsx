import type { Metadata } from "next";
import { Mitr, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import IconSprite from "@/components/icon-sprite";
import AuthInitializer from "@/components/auth-initializer";
import ForceLogoutListener from "@/components/force-logout-listener";

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
  title: "SpeakUp",
  description: "ฝึกพูดภาษาอังกฤษทีละประโยค",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`h-full ${mitr.variable} ${notoSansThai.variable}`}>
      <body className="min-h-full flex flex-col">
        <IconSprite />
        <AuthInitializer />
        <ForceLogoutListener />
        {children}
      </body>
    </html>
  );
}
