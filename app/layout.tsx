import "./globals.css";
import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "VibeMoji — 한 줄로 32장 이모티콘 만들기",
  description:
    "그림 못 그려도 괜찮아요. 한 줄 입력하면 32개 스티커가 나오고, 카카오/OGQ/라인/Etsy까지 한 번에 신청할 수 있어요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-theme="vibemoji">
      <body className="min-h-screen bg-base-200">
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-12 text-center text-sm text-base-content/60">
          <p>© 2026 VibeMoji · 모든 캐릭터의 저작권은 창작자에게 귀속돼요</p>
          <p className="mt-1">목업 빌드 · Firebase 연동 전</p>
        </footer>
      </body>
    </html>
  );
}
