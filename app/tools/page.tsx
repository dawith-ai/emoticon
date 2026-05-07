import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "도구 — VibeMoji",
  description:
    "PNG 흰색 테두리 생성기, 이모티콘 멀티 플랫폼 사이즈 변환기 등 브라우저에서 바로 쓰는 작가용 도구.",
};

const TOOLS = [
  {
    href: "/tools/outline",
    emoji: "🎨",
    title: "PNG 흰색 테두리 생성기",
    desc: "투명 PNG에 흰색(또는 원하는 색) 테두리를 한 번에. 카카오 심사 가독성 보강에 자주 쓰여요.",
    badge: "브라우저 처리",
  },
  {
    href: "/tools/resize",
    emoji: "📐",
    title: "이모티콘 사이즈 자동 변환기",
    desc: "한 장의 PNG를 카카오 360/큰 540/미니 180, OGQ 740×640, LINE 스티커·이모티콘, 비트윈 512, Etsy 1000 등 9개 플랫폼 규격으로 한 번에 변환 → ZIP 다운로드.",
    badge: "ZIP 일괄",
  },
  {
    href: "/resources",
    emoji: "📚",
    title: "외부 자료 큐레이션",
    desc: "표정 가이드, 도장 브러시, 자세 9종 브러시, 합격 캔버스 세팅 PDF 등 작가 커뮤니티 공유 자료 모음.",
    badge: "공유 링크",
  },
];

export default function ToolsIndexPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">🛠️ 작가 도구함</h1>
        <p className="mt-2 text-base-content/70">
          이모티콘 작업에 자주 필요한 보조 도구들. 모두 브라우저에서만 동작해서
          이미지를 서버에 올리지 않아요.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card border border-base-300 bg-base-100 transition hover:border-primary hover:shadow-lg"
          >
            <div className="card-body">
              <div className="flex items-center justify-between">
                <span className="text-4xl">{t.emoji}</span>
                <span className="badge badge-primary badge-outline badge-sm">
                  {t.badge}
                </span>
              </div>
              <h2 className="card-title text-lg">{t.title}</h2>
              <p className="text-sm text-base-content/70">{t.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title text-lg">왜 도구함이 따로 있어요?</h2>
          <ul className="ml-4 list-disc space-y-1 text-sm text-base-content/70">
            <li>
              AI 생성 / 수동 에디터를 쓰지 않더라도, 이미 가지고 있는 PNG를 바로
              플랫폼 규격에 맞춰 정리할 수 있어요.
            </li>
            <li>
              회원가입 없이도 동작해요. 모든 처리는 브라우저 안에서만 일어나요.
            </li>
            <li>
              기존 작가 커뮤니티의 좋은 보조 도구·자료들을 한 자리에 정리해 추천해요.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
