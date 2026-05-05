export type Platform = {
  id: string;
  name: string;
  emoji: string;
  mainSize: string;
  count: string;
  format: string;
  commission: string;
  reviewDays: string;
  difficulty: "쉬움" | "보통" | "어려움";
  expectedRevenue: string;
  submitUrl: string;
  steps: string[];
  notes: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: "kakao-static",
    name: "카카오 이모티콘 (멈춤)",
    emoji: "💛",
    mainSize: "360x360",
    count: "32개",
    format: "PNG 투명, ≤150KB",
    commission: "작가 35%",
    reviewDays: "2-3주",
    difficulty: "어려움",
    expectedRevenue: "월 ₩30만~3,000만원 (승인 시)",
    submitUrl: "https://emoticonstudio.kakao.com/pages/start",
    steps: [
      "VibeMoji에서 32장 카카오용 ZIP 다운로드",
      "카카오 이모티콘 스튜디오 가입 / 로그인",
      "[제안하기] → [멈춰있는 이모티콘] 선택",
      "ZIP 파일 일괄 업로드 (개편된 신규 기능)",
      "제목·설명·시리즈 입력 후 제출",
      "심사 결과 메일 대기 (2-3주)",
    ],
    notes: "미승인이어도 재제안 가능. 통과율 5% 미만이라 인내심 필수.",
  },
  {
    id: "kakao-animated",
    name: "카카오 이모티콘 (움직임)",
    emoji: "✨",
    mainSize: "360x360",
    count: "24개 (PNG 21 + GIF 3)",
    format: "PNG/GIF, ≤650KB",
    commission: "작가 35%",
    reviewDays: "2-3주",
    difficulty: "어려움",
    expectedRevenue: "월 ₩50만~5,000만원 (승인 시)",
    submitUrl: "https://emoticonstudio.kakao.com/pages/start",
    steps: [
      "VibeMoji에서 움직이는 이모티콘 생성 (P1 기능)",
      "PNG 21장 + GIF 3장 ZIP 다운로드",
      "카카오 이모티콘 스튜디오 → [움직이는 이모티콘]",
      "ZIP 업로드 후 시리즈 정보 입력",
      "심사 대기",
    ],
    notes: "정지 이모티콘보다 단가 높음. 첫 도전은 멈춤부터 권장.",
  },
  {
    id: "ogq",
    name: "OGQ 마켓 (네이버)",
    emoji: "🟢",
    mainSize: "740x640",
    count: "24개",
    format: "PNG 투명",
    commission: "70% 작가",
    reviewDays: "1-2주",
    difficulty: "보통",
    expectedRevenue: "월 ₩5만~100만원",
    submitUrl: "https://creators.ogq.me/",
    steps: [
      "VibeMoji에서 OGQ용 ZIP 다운로드 (740x640)",
      "OGQ 크리에이터 스튜디오 가입",
      "[스티커 등록] 클릭",
      "메인 240x240, 탭 96x74 자동 포함된 ZIP 업로드",
      "심사 대기",
    ],
    notes: "카카오보다 통과율 높음. 첫 작가 도전 추천 플랫폼.",
  },
  {
    id: "line",
    name: "LINE 크리에이터스",
    emoji: "💚",
    mainSize: "370x320 (max)",
    count: "8/16/24/32/40 중 선택",
    format: "PNG, ≤1MB/file",
    commission: "35% 작가 (¥120-610)",
    reviewDays: "1-7일",
    difficulty: "보통",
    expectedRevenue: "월 ¥1,000~50,000",
    submitUrl: "https://creator.line.me/ko/",
    steps: [
      "LINE 계정 생성 + 크리에이터스 등록",
      "VibeMoji에서 LINE용 ZIP 다운로드",
      "[New Submission] → 메인/탭 이미지 + 스티커 업로드",
      "가격 설정 (¥120-610)",
      "심사 후 출시",
    ],
    notes: "글로벌 시장 진출 가능. 일본/대만 사용자 활발.",
  },
  {
    id: "miricanvas",
    name: "미리캔버스 기여자",
    emoji: "🎨",
    mainSize: "자유 (벡터/비트맵)",
    count: "자유",
    format: "PNG/SVG",
    commission: "비독점 (별도 협의)",
    reviewDays: "검토 후",
    difficulty: "쉬움",
    expectedRevenue: "사용량 비례 (장기)",
    submitUrl: "https://www.miricanvas.com/page/contributor/",
    steps: [
      "디자인허브 가입 (포트폴리오 불필요)",
      "VibeMoji에서 PNG 다운로드",
      "디자인허브에 콘텐츠 + 메타데이터 업로드",
      "비독점 제공 (저작권은 본인 보유)",
    ],
    notes: "장기 패시브 인컴. 다량 등록 시 수익화 효과 큼.",
  },
  {
    id: "etsy",
    name: "Etsy 디지털 스티커",
    emoji: "🛍️",
    mainSize: "1000x1000+ (300dpi)",
    count: "자유",
    format: "PNG 투명",
    commission: "$0.20/listing + 6.5%",
    reviewDays: "즉시",
    difficulty: "쉬움",
    expectedRevenue: "$3~25/팩",
    submitUrl: "https://www.etsy.com/sell",
    steps: [
      "Etsy 셀러 계정 생성",
      "VibeMoji에서 Etsy용 PNG 팩 다운로드 (1000x1000)",
      "[리스팅 추가] → 디지털 다운로드 선택",
      "썸네일/설명/태그 입력 후 즉시 판매 시작",
    ],
    notes: "심사 없음 = 즉시 판매. 영문 키워드 SEO 중요.",
  },
];

export const EMOTION_SLOTS_32 = [
  "안녕", "반가워", "고마워", "사랑해", "최고", "잘자", "잘가", "하이",
  "ㅋㅋㅋ", "ㅎㅎ", "ㅠㅠ", "어머", "헐", "대박", "오케이", "굿",
  "화남", "삐짐", "슬픔", "지침", "졸려", "배고파", "심심", "뭐해",
  "축하해", "응원해", "힘내", "괜찮아", "미안", "부탁", "콜", "빠이",
];
