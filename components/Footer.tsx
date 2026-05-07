import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto mt-12 max-w-6xl border-t border-base-300 px-4 py-8 text-sm text-base-content/70">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-bold text-base-content">
            <span className="text-xl">🎨</span>
            <span className="text-vm-grad">VibeMoji</span>
          </div>
          <p className="mt-2 text-xs">
            한 줄로 32장 이모티콘. 카카오 · OGQ · LINE · 비트윈 · Etsy 25개 플랫폼 자동 변환.
          </p>
          <p className="mt-1 text-xs">
            도구함 ·{" "}
            <Link href="/tools/outline" className="link link-hover">
              테두리 생성기
            </Link>{" "}
            ·{" "}
            <Link href="/tools/resize" className="link link-hover">
              사이즈 변환기
            </Link>{" "}
            ·{" "}
            <Link href="/resources" className="link link-hover">
              작가 자료 큐레이션
            </Link>
          </p>
          <p className="mt-1 text-xs">
            © 2026 VibeMoji · 모든 캐릭터의 저작권은 창작자에게 귀속돼요
          </p>
        </div>
        <div>
          <div className="font-bold text-base-content">제품</div>
          <ul className="mt-2 space-y-1 text-xs">
            <li><Link href="/generate" className="link link-hover">AI 생성</Link></li>
            <li><Link href="/editor" className="link link-hover">수동 에디터</Link></li>
            <li><Link href="/marketplace" className="link link-hover">수익화 허브</Link></li>
            <li><Link href="/auth" className="link link-hover">로그인 / 회원가입</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-bold text-base-content">법적 고지</div>
          <ul className="mt-2 space-y-1 text-xs">
            <li><Link href="/privacy" className="link link-hover">개인정보처리방침</Link></li>
            <li><Link href="/terms" className="link link-hover">이용약관</Link></li>
            <li>
              <a
                href="https://github.com/myjun090-spec/emoticon"
                target="_blank"
                rel="noreferrer"
                className="link link-hover"
              >
                오픈소스 (GitHub)
              </a>
            </li>
            <li>support@vibemoji.app</li>
          </ul>
        </div>
      </div>
      <div className="mt-6 text-xs opacity-70">
        MVP 빌드 · Firebase Auth/Firestore · Nano Banana 연동 준비 완료 · GH Pages 자동 배포
      </div>
    </footer>
  );
}
