import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORMS, CATEGORY_META, ALL_CATEGORIES } from "@/lib/platforms";
import { WaitlistForm } from "@/components/WaitlistForm";

export const metadata: Metadata = {
  title: "카카오 이모티콘 합격까지 데려가는 AI 코치",
  description:
    "32장 만드는 건 시작이에요. 출시 전 자동 감사로 약점을 찾고 거절 사유를 분석해 수정안까지 만들어요. 카카오·OGQ·라인·Etsy 25개 플랫폼 자동 변환.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="hero rounded-3xl bg-vm-grad py-16 text-primary-content">
        <div className="hero-content text-center">
          <div className="max-w-2xl">
            <span className="badge badge-warning mb-4 gap-1">
              📊 카카오 이모티콘 합격률 약 5% — 거절 95%
            </span>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              카카오 이모티콘
              <br />
              <span className="text-yellow-300">합격까지</span> 데려가는 AI 코치
            </h1>
            <p className="mt-4 text-base md:text-lg">
              32장 만드는 건 시작이에요. 우리가 출시 전 자동 감사로 약점을 찾고,
              <br />
              거절 사유를 분석해 자동으로 수정안까지 만들어줍니다.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 md:flex-row md:justify-center">
              <Link href="/coach" className="btn btn-warning w-full md:w-auto">
                🧐 합격 사전 감사 시작
              </Link>
              <Link href="/generate" className="btn btn-outline btn-warning w-full md:w-auto">
                ✨ 32장 AI 생성
              </Link>
            </div>
            <p className="mt-4 text-xs text-primary-content/80">
              감사는 Gemini 무료 키, 학습/애니메이션은 Replicate BYOK — 운영자 비용 0
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold">합격까지 가는 4단계</h2>
          <p className="mt-2 text-base-content/70">
            "AI로 만든 32장"이 끝이 아니라, "심사 통과한 32장"이 목표예요.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <FeatureCard
            emoji="🧐"
            title="① 합격 사전 감사"
            desc="6개 차원(선·색·배경·표정·일관성·저작권)으로 32장 자동 평가. 약점 슬롯·합격 확률·수정안까지."
            href="/coach"
            highlight
          />
          <FeatureCard
            emoji="✨"
            title="② LoRA 캐릭터 학습"
            desc="시드 1장 → Flux LoRA로 32장 100% 동일 캐릭터. 카카오 1번 컷오프 사유(캐릭터 일관성) 해소."
            href="/lora"
          />
          <FeatureCard
            emoji="🎨"
            title="③ 32장 일괄 생성"
            desc="Pollinations / Gemini / LoRA 모드 + 자동 일관성 평가 + 슬롯별 재시도 한 번에."
            href="/generate"
          />
          <FeatureCard
            emoji="🎞"
            title="④ 32장 일괄 애니메이션"
            desc="Wan/Kling I2V로 32 MP4 → 카카오 규격 GIF (360x360, 24fps, 1초) ZIP 자동."
            href="/animate-batch"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-warning bg-warning/10 p-6">
        <div className="grid gap-4 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-2xl font-bold">🚨 거절됐다면? 회복 코치</h2>
            <p className="mt-2 text-base-content/80">
              카카오에서 거절 메일 받으셨나요? 거절 사유를 붙여넣고 32장을 업로드하면,
              차원별로 무엇이 문제였는지 분석하고 슬롯별 수정 프롬프트를 자동으로 만들어줍니다.
            </p>
            <p className="mt-2 text-sm text-base-content/70">
              "다시 만들기"가 아니라 "고쳐서 다시 내기" — 비용·시간 1/10.
            </p>
          </div>
          <div className="text-center">
            <Link href="/coach" className="btn btn-warning btn-lg">
              거절 회복 시작 →
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-base-300 bg-base-100 p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">🛠️ 회원가입 없이 바로 쓰는 도구함</h2>
            <p className="mt-1 text-sm text-base-content/70">
              이미 만든 PNG가 있다면 바로 활용할 수 있는 보조 도구. 모두 브라우저에서만 동작해요.
            </p>
          </div>
          <Link href="/tools" className="btn btn-ghost btn-sm">
            전체 도구 보기 →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ToolCard
            href="/tools/outline"
            emoji="🎨"
            title="흰색 테두리 생성기"
            desc="투명 PNG에 흰 테두리 자동 추가. 두께·색·영역 조절 가능, 거리 변환 기반이라 큰 이미지도 즉시."
          />
          <ToolCard
            href="/tools/resize"
            emoji="📐"
            title="사이즈 자동 변환기"
            desc="카카오 360 / 큰 540 / 미니 180, OGQ 740×640, LINE 스티커·이모티콘, Etsy, 비트윈 512 등 9개 플랫폼 규격으로 한 번에 ZIP 변환."
          />
          <ToolCard
            href="/resources"
            emoji="📚"
            title="작가 자료 큐레이션"
            desc="표정 가이드 9종, 도장 브러시, 자세 9종 브러시, 합격 캔버스 PDF — 한 자리에서."
          />
        </div>
      </section>

      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold">
            한 번 만들면 {PLATFORMS.length}개 플랫폼에 팔 수 있어요
          </h2>
          <p className="mt-2 text-base-content/70">
            플랫폼별 사양 자동 변환 + 신청 가이드 + 카테고리별 추천
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {ALL_CATEGORIES.map((cat) => {
            const list = PLATFORMS.filter((p) => p.category === cat);
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat} className="card border border-base-300 bg-base-100">
                <div className="card-body p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{meta.emoji}</span>
                    <div>
                      <h3 className="font-bold">{meta.label}</h3>
                      <p className="text-xs text-base-content/60">{list.length}개 플랫폼</p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-base-content/70">
                    {meta.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {list.slice(0, 6).map((p) => (
                      <span key={p.id} className="badge badge-ghost badge-sm">
                        {p.emoji} {p.name.replace(/\s*\([^)]*\)/g, "")}
                      </span>
                    ))}
                    {list.length > 6 && (
                      <span className="badge badge-ghost badge-sm">
                        +{list.length - 6}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <Link href="/marketplace" className="btn btn-primary">
            전체 {PLATFORMS.length}개 플랫폼 신청 가이드 보기 →
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

      <section className="grid gap-6 md:grid-cols-2">
        <WaitlistForm />
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-5">
            <h3 className="card-title text-lg">📰 베타 로드맵</h3>
            <ul className="steps steps-vertical">
              <li className="step step-primary">PRD 확정 + UI 목업</li>
              <li className="step step-primary">일관성 평가 하네스</li>
              <li className="step step-primary">Firebase Auth + Firestore 연동</li>
              <li className="step step-primary">정적 GH Pages 자동 배포</li>
              <li className="step">Nano Banana 실호출 + 멀티 플랫폼 ZIP</li>
              <li className="step">Toss Payments + 크레딧 충전</li>
              <li className="step">베타 오픈 (1차 100명)</li>
            </ul>
          </div>
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
  highlight,
}: {
  emoji: string;
  title: string;
  desc: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card border bg-base-100 transition hover:shadow-lg ${
        highlight ? "border-warning ring-2 ring-warning/40" : "border-base-300"
      }`}
    >
      <div className="card-body">
        <div className="text-4xl">{emoji}</div>
        <h3 className="card-title text-lg">{title}</h3>
        <p className="text-sm text-base-content/70">{desc}</p>
      </div>
    </Link>
  );
}

function ToolCard({
  href,
  emoji,
  title,
  desc,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card border border-base-300 bg-base-200 transition hover:border-primary hover:bg-base-100"
    >
      <div className="card-body p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          <h3 className="font-bold">{title}</h3>
        </div>
        <p className="text-xs text-base-content/70">{desc}</p>
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
