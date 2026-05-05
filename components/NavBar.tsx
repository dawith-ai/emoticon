import Link from "next/link";

export function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <span className="text-2xl">🎨</span>
          <span className="text-vm-grad">VibeMoji</span>
        </Link>
        <nav className="hidden gap-2 md:flex">
          <Link href="/generate" className="btn btn-ghost btn-sm">
            AI 생성
          </Link>
          <Link href="/editor" className="btn btn-ghost btn-sm">
            수동 에디터
          </Link>
          <Link href="/marketplace" className="btn btn-ghost btn-sm">
            수익화 허브
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary badge-outline gap-1">
            <span>💎</span>
            <span>50</span>
          </span>
          <button className="btn btn-primary btn-sm">로그인</button>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 md:hidden">
        <Link href="/generate" className="btn btn-ghost btn-xs flex-1">
          AI 생성
        </Link>
        <Link href="/editor" className="btn btn-ghost btn-xs flex-1">
          에디터
        </Link>
        <Link href="/marketplace" className="btn btn-ghost btn-xs flex-1">
          수익화 허브
        </Link>
      </div>
    </header>
  );
}
