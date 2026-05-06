import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mb-4 text-7xl">🐰</div>
      <h1 className="text-3xl font-bold">길을 잃었어요</h1>
      <p className="mt-2 text-base-content/70">
        찾으시는 페이지가 없거나 이동됐어요. 어디로 가시겠어요?
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          🏠 홈
        </Link>
        <Link href="/generate" className="btn btn-outline">
          ✨ AI 생성
        </Link>
        <Link href="/editor" className="btn btn-outline">
          ✏️ 에디터
        </Link>
        <Link href="/marketplace" className="btn btn-outline">
          💰 수익화 허브
        </Link>
      </div>
    </div>
  );
}
