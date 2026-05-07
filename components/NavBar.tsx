"use client";

import Link from "next/link";
import { AuthStatus } from "@/components/AuthStatus";

export function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <span className="text-2xl">🎨</span>
          <span className="text-vm-grad">VibeMoji</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/generate" className="btn btn-ghost btn-sm">
            AI 생성
          </Link>
          <Link href="/editor" className="btn btn-ghost btn-sm">
            수동 에디터
          </Link>
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
              도구함 ▾
            </div>
            <ul
              tabIndex={0}
              className="menu dropdown-content z-40 mt-1 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow"
            >
              <li>
                <Link href="/tools/outline">🎨 흰색 테두리 생성기</Link>
              </li>
              <li>
                <Link href="/tools/resize">📐 사이즈 자동 변환기</Link>
              </li>
              <li>
                <Link href="/resources">📚 외부 자료 큐레이션</Link>
              </li>
              <li className="menu-title text-[10px]">전체 보기</li>
              <li>
                <Link href="/tools">🛠️ 도구함 인덱스</Link>
              </li>
            </ul>
          </div>
          <Link href="/marketplace" className="btn btn-ghost btn-sm">
            수익화 허브
          </Link>
          <Link
            href="/settings"
            className="btn btn-ghost btn-sm"
            title="내 Gemini 키 등록 (BYOK)"
          >
            ⚙️
          </Link>
        </nav>
        <AuthStatus />
      </div>
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 md:hidden">
        <Link href="/generate" className="btn btn-ghost btn-xs flex-1">
          AI 생성
        </Link>
        <Link href="/editor" className="btn btn-ghost btn-xs flex-1">
          에디터
        </Link>
        <Link href="/tools" className="btn btn-ghost btn-xs flex-1">
          도구함
        </Link>
        <Link href="/marketplace" className="btn btn-ghost btn-xs flex-1">
          수익화
        </Link>
      </div>
    </header>
  );
}
