import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dawith-ai.github.io/emoticon";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "VibeMoji — 한 줄로 32장 이모티콘 만들기",
    template: "%s · VibeMoji",
  },
  description:
    "그림 못 그려도 괜찮아요. 자연어로 캐릭터를 만들고, 카카오·OGQ·라인·Etsy까지 한 번에 신청할 수 있어요.",
  keywords: [
    "AI 이모티콘",
    "카카오 이모티콘",
    "라인 스티커",
    "OGQ 마켓",
    "Etsy 스티커",
    "캐릭터 생성",
    "Nano Banana",
  ],
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "VibeMoji — 한 줄로 32장 이모티콘",
    description:
      "자연어로 캐릭터 만들고 카카오·OGQ·라인·Etsy 25개 플랫폼에 한 번에 등록하세요.",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "VibeMoji" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeMoji — 한 줄로 32장 이모티콘",
    description: "자연어로 캐릭터 만들고 25개 플랫폼 자동 변환",
    images: ["/og-image.svg"],
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FF5C8A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "VibeMoji",
        description:
          "그림 못 그려도 괜찮아요. 자연어로 캐릭터를 만들고, 카카오·OGQ·라인·Etsy까지 한 번에 신청할 수 있어요.",
        inLanguage: "ko-KR",
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "VibeMoji",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        description:
          "AI로 카카오·OGQ·라인·Etsy 이모티콘 32장을 만들고 합격까지 코칭하는 서비스.",
      },
    ],
  };

  return (
    <html lang="ko" data-theme="vibemoji">
      <body className="min-h-screen bg-base-200">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AuthProvider>
          <NavBar />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </AuthProvider>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
