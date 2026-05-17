import Link from "next/link";

export const metadata = {
  title: "프롬프트 스타일 라이브러리 — 사회복지 도메인",
  description:
    "VibeMoji 이모티콘 생성 시 바로 쓰는 스타일 프롬프트 12종. 어르신·가족·복지사·봉사·감사 등 사회복지 현장 친화 카테고리.",
};

interface StyleCard {
  id: string;
  category: string;
  title: string;
  prompt: string;
  vibe: string;
  emoji: string;
}

const STYLES: StyleCard[] = [
  {
    id: "elderly-cute",
    category: "어르신",
    title: "할머니·할아버지 귀여운 일러스트",
    prompt:
      "Warm round chibi illustration of a Korean elderly grandmother with kind wrinkles and a hanbok-inspired top, sticker style on white background, gentle smile, dignified yet playful, vibrant color block, simple lines",
    vibe: "복지관 안내, 어르신 카드",
    emoji: "👵",
  },
  {
    id: "social-worker",
    category: "직장인",
    title: "사회복지사 일상 캐릭터",
    prompt:
      "Cute Korean social worker character in casual office attire holding a clipboard, sticker style, slightly tired but kind expression, modern flat illustration, white background, 4 emotion variations (smiling/thinking/cheering/sighing)",
    vibe: "팀 단톡방, 후원자 소통",
    emoji: "💼",
  },
  {
    id: "thank-you-flower",
    category: "감사",
    title: "감사·후원 표현",
    prompt:
      "Korean traditional 'thank you' sticker with bowing chibi character holding 사과 or 꽃다발, warm soft palette (peach, sage, gold), calligraphy '감사합니다', sticker outline, transparent background ready",
    vibe: "후원자 답장, 봉사자 격려",
    emoji: "🙏",
  },
  {
    id: "family-warm",
    category: "가족",
    title: "다세대 가족",
    prompt:
      "Multi-generational Korean family chibi sticker (grandparent, parent, child), warm hugging pose, sticker style on white, soft pastel palette, simple shapes, joyful expression, 1:1 ratio",
    vibe: "가족지원 사업, SNS 카드뉴스",
    emoji: "👨‍👩‍👧‍👦",
  },
  {
    id: "volunteer",
    category: "봉사",
    title: "자원봉사자 캐릭터",
    prompt:
      "Korean volunteer chibi character wearing a vest with '봉사' badge, holding tools (paint brush, food tray, broom), 4 different poses for 4 stickers, friendly cartoon, sticker style outline",
    vibe: "자원봉사 모집, 모범 봉사자 시상",
    emoji: "🤝",
  },
  {
    id: "child-protection",
    category: "아동",
    title: "아동보호 안전 표현",
    prompt:
      "Cute Korean child chibi sticker with protective adult shadow behind, soft glow of safety, warm sage and butter palette, gentle outline, no facial details for privacy, 'It's OK' calm vibe",
    vibe: "아동보호 캠페인, 신고 안내",
    emoji: "🛡️",
  },
  {
    id: "encouragement",
    category: "응원",
    title: "직원 응원·격려",
    prompt:
      "Korean office worker chibi sticker with raised fist, '화이팅' '오늘도 수고했어요' callouts, cute determined face, sticker style outline, 4 variations (morning/afternoon/end-of-day/celebration), warm coral palette",
    vibe: "팀 단톡방, 월말 격려",
    emoji: "💪",
  },
  {
    id: "calm-care",
    category: "감정",
    title: "차분한 돌봄 표현",
    prompt:
      "Korean caregiver chibi sticker showing empathy gesture (hand on chest, gentle bow), 'I hear you' calm expression, muted blue and sage palette, soft pastel outline, sticker style, 4 emotions",
    vibe: "위기 상담 후속, 사례관리 안내",
    emoji: "💚",
  },
  {
    id: "meal-care",
    category: "식사",
    title: "경로식당·식사배달",
    prompt:
      "Korean elderly enjoying 한식 meal chibi sticker, warm rice bowl steam, '맛있어요' '잘 먹었습니다' callouts, sticker outline, warm orange palette, 4 expressions (excited/eating/satisfied/thank-you)",
    vibe: "식사 배달 알림, 출석 인증",
    emoji: "🍚",
  },
  {
    id: "duty-shift",
    category: "근무",
    title: "근무 교대·당직",
    prompt:
      "Korean welfare center worker chibi sticker showing shift change scenes, '교대 부탁드려요' '오늘 당직입니다' callouts, friendly cartoon, blue palette, 4 scene variations",
    vibe: "근무 단톡, 당직 알림",
    emoji: "🌙",
  },
  {
    id: "celebration",
    category: "기념",
    title: "복지관 행사·기념",
    prompt:
      "Korean welfare center celebration chibi sticker, group of diverse characters with confetti, '함께해요' '축하해요' callouts, festive sage and gold palette, sticker style, 4 variations",
    vibe: "창립 기념, 자원봉사 시상",
    emoji: "🎉",
  },
  {
    id: "winter-warm",
    category: "계절",
    title: "겨울 따뜻함",
    prompt:
      "Korean elderly + caregiver winter chibi sticker, sharing blanket or warm tea, snow background, '추워요 따뜻하게' '체온 점검' warmth theme, warm orange and cream palette, 4 variations",
    vibe: "겨울 안부 캠페인, 한파 대비",
    emoji: "🧣",
  },
];

const CATEGORIES = [
  "전체",
  "어르신",
  "직장인",
  "감사",
  "가족",
  "봉사",
  "아동",
  "응원",
  "감정",
  "식사",
  "근무",
  "기념",
  "계절",
];

export default function PromptStylesPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm text-base-content/60 hover:text-base-content">
          ← VibeMoji 홈
        </Link>
      </div>

      {/* Hero */}
      <header className="mb-10">
        <div className="badge badge-warning mb-4 gap-1">
          🆕 사회복지 도메인 큐레이션
        </div>
        <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
          프롬프트 스타일 라이브러리
        </h1>
        <p className="text-lg leading-relaxed text-base-content/70">
          이모티콘 32장 만들 때 바로 쓰는 <strong>스타일 프롬프트 12종</strong>.
          어르신·복지사·후원·봉사·아동·감정·식사·근무 등 현장 친화 카테고리. 클립보드 복사 →
          VibeMoji 입력창에 붙여넣기 → 32장 자동 생성.
        </p>
      </header>

      {/* Info card */}
      <div className="alert alert-info mb-8">
        <div className="text-sm">
          <p className="mb-1 font-semibold">💡 사용 흐름</p>
          <p>
            1) 카드의 프롬프트 복사 → 2) <code>/generate</code> 또는 홈에서 시작 → 3) AI 32장 생성
            → 4) <code>/coach</code> 출시 전 자동 감사 → 5) 카카오·OGQ·라인·Etsy 신청.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {STYLES.map((s) => (
          <div key={s.id} className="card bg-base-100 shadow-sm transition-shadow hover:shadow-md">
            <div className="card-body">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="badge badge-ghost mb-1.5 text-xs">{s.category}</div>
                  <h3 className="card-title text-base">
                    <span className="mr-1.5 text-xl">{s.emoji}</span>
                    {s.title}
                  </h3>
                </div>
              </div>
              <pre className="overflow-x-auto rounded bg-base-200 p-3 text-xs leading-relaxed">
                <code className="break-words whitespace-pre-wrap">{s.prompt}</code>
              </pre>
              <div className="text-xs text-base-content/60">
                💡 활용: {s.vibe}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-10 rounded-2xl bg-base-200 p-6 text-center">
        <h3 className="mb-2 text-lg font-bold">바로 만들어보기</h3>
        <p className="mb-4 text-sm text-base-content/70">
          마음에 드는 프롬프트 복사 후 시작하세요.
        </p>
        <Link href="/generate" className="btn btn-primary">
          이모티콘 생성 시작 →
        </Link>
      </div>

      <footer className="mt-10 text-center text-xs text-base-content/50">
        출처: youmind.com GPT-Image 프롬프트 큐레이션 + VibeMoji 사회복지 도메인 변형
      </footer>
    </div>
  );
}
