import Link from "next/link";
import { PLATFORMS } from "@/lib/platforms";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="hero rounded-3xl bg-vm-grad py-16 text-primary-content">
        <div className="hero-content text-center">
          <div className="max-w-2xl">
            <span className="badge badge-warning mb-4 gap-1">
              💎 가입 시 무료 50 크레딧
            </span>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              한 줄로 32장
              <br />
              이모티콘 만들기
            </h1>
            <p className="mt-4 text-base md:text-lg">
              그림 못 그려도 괜찮아요. 자연어로 캐릭터를 만들고,
              <br />
              카카오·OGQ·라인·Etsy에 한 번에 신청할 수 있어요.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 md:flex-row md:justify-center">
              <Link href="/generate" className="btn btn-warning w-full md:w-auto">
                ✨ AI로 만들기
              </Link>
              <Link href="/editor" className="btn btn-outline btn-warning w-full md:w-auto">
                ✏️ 직접 그리기
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold">3가지 핵심 기능</h2>
          <p className="mt-2 text-base-content/70">
            만들기부터 수익화까지, 막힘 없이 이어져요.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            emoji="🤖"
            title="AI 캐릭터 생성"
            desc="자연어 한 줄로 캐릭터 시드 + 32종 표정을 자동 생성해요. Nano Banana 기반."
            href="/generate"
          />
          <FeatureCard
            emoji="✏️"
            title="수동 에디터 + AI 보정"
            desc="모바일 친화 360x360 캔버스. AI가 부족한 표정을 추천하고 외곽선·투명배경을 자동 처리해요."
            href="/editor"
          />
          <FeatureCard
            emoji="💰"
            title="수익화 허브"
            desc="6개 플랫폼 사양·수수료·심사기간을 한 화면에. 신청 딥링크로 바로 이동."
            href="/marketplace"
          />
        </div>
      </section>

      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold">한 번 만들면 이런 곳에 팔 수 있어요</h2>
          <p className="mt-2 text-base-content/70">
            플랫폼별 사양 자동 변환 + 신청 가이드 제공
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div key={p.id} className="card border border-base-300 bg-base-100">
              <div className="card-body p-5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.emoji}</span>
                  <h3 className="font-bold">{p.name}</h3>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  <span className="badge badge-ghost">{p.mainSize}</span>
                  <span className="badge badge-ghost">{p.count}</span>
                  <span className="badge badge-primary badge-outline">
                    {p.commission}
                  </span>
                </div>
                <p className="mt-1 text-xs text-base-content/60">
                  심사 {p.reviewDays} · 난이도 {p.difficulty}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/marketplace" className="btn btn-primary">
            전체 신청 가이드 보기 →
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-base-100 p-8 shadow-sm">
        <div className="text-center">
          <h2 className="text-2xl font-bold">크레딧으로 부담 없이 시작</h2>
          <p className="mt-2 text-base-content/70">
            32장 세트 1번 = 100 크레딧 = ₩2,500부터
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <PriceCard name="스타터" credits="100" price="₩2,500" sub="1세트" />
          <PriceCard name="베이직" credits="300" price="₩6,900" sub="3세트 + 8% 할인" />
          <PriceCard
            name="프로"
            credits="1,000"
            price="₩19,900"
            sub="10세트 + 정밀 모드"
            highlight
          />
          <PriceCard
            name="스튜디오"
            credits="3,000"
            price="₩49,900"
            sub="30세트 + 갤러리"
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  emoji,
  title,
  desc,
  href,
}: {
  emoji: string;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link href={href} className="card border border-base-300 bg-base-100 transition hover:shadow-lg">
      <div className="card-body">
        <div className="text-4xl">{emoji}</div>
        <h3 className="card-title text-lg">{title}</h3>
        <p className="text-sm text-base-content/70">{desc}</p>
      </div>
    </Link>
  );
}

function PriceCard({
  name,
  credits,
  price,
  sub,
  highlight,
}: {
  name: string;
  credits: string;
  price: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card border ${
        highlight ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"
      }`}
    >
      <div className="card-body items-center text-center">
        {highlight && <span className="badge badge-primary badge-sm">추천</span>}
        <h3 className="text-lg font-bold">{name}</h3>
        <div className="text-3xl font-bold">{price}</div>
        <div className="text-sm text-base-content/70">💎 {credits} 크레딧</div>
        <div className="text-xs text-base-content/60">{sub}</div>
      </div>
    </div>
  );
}
