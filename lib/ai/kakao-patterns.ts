/**
 * 카카오 베스트셀러 추상 패턴 라이브러리.
 *
 * 합격 코치(critic)가 평가 정확도를 높이도록 Gemini prompt에 주입할
 * 추상 패턴 카탈로그입니다.
 *
 * 저작권 가이드라인: 패턴/기능만 차용하고 비주얼·문구·자산은 우리 것을 유지.
 * 따라서 이 모듈은 특정 카카오 IP 캐릭터·이름·이미지 데이터를 일절 포함하지
 * 않으며, 메신저 스티커 디자인 일반 원칙과 카카오 작가 가이드라인 공개
 * 정보를 추상적으로 정리한 텍스트만 담습니다.
 */

export type PatternCategory =
  | "composition"
  | "linework"
  | "palette"
  | "expression"
  | "motion"
  | "background"
  | "sticker_anatomy"
  | "set_diversity";

export type AbstractPattern = {
  /** 영문 슬러그 (URL/키 안전) */
  id: string;
  category: PatternCategory;
  /** 한국어 설명 (UI 표시용) */
  description_ko: string;
  /** 영문 설명 (Gemini prompt 주입용) */
  description_en: string;
  /** 왜 카카오에서 통하는지 (한국어) */
  why_approved: string;
  /** 추상적 예 — 캐릭터 이름 없이 시각 묘사만 */
  examples_abstract: ReadonlyArray<string>;
  /** 같이 하면 안 되는 것 */
  anti_patterns: ReadonlyArray<string>;
};

export const CATEGORY_LABEL_KO: Record<PatternCategory, string> = {
  composition: "구도",
  linework: "선",
  palette: "색",
  expression: "표정 명확도",
  motion: "동작",
  background: "배경 처리",
  sticker_anatomy: "스티커 해부학",
  set_diversity: "세트 다양성",
};

export const CATEGORY_ORDER: ReadonlyArray<PatternCategory> = [
  "composition",
  "linework",
  "palette",
  "expression",
  "motion",
  "background",
  "sticker_anatomy",
  "set_diversity",
];

const PATTERNS: ReadonlyArray<AbstractPattern> = [
  // ─────────────────────────── composition (6) ───────────────────────────
  {
    id: "single-subject-center",
    category: "composition",
    description_ko: "단일 캐릭터를 정사각 프레임의 시각적 중앙에 배치합니다.",
    description_en:
      "Place a single subject at the optical center of the square frame; avoid splitting attention with multiple actors.",
    why_approved:
      "메신저 채팅 흐름에서 작은 사이즈로 표시될 때 시선이 한 곳에 모여야 의미가 즉시 읽힙니다.",
    examples_abstract: [
      "정사각 캔버스 중앙에 머리·몸통이 모두 들어간 단일 캐릭터 풀샷",
      "동작이 큰 슬롯도 캐릭터 무게중심을 캔버스 중심에서 ±15% 이내 유지",
    ],
    anti_patterns: [
      "캐릭터 두 명 이상이 동등한 비중으로 화면을 양분",
      "캐릭터가 한쪽 모서리에 치우쳐 다른 쪽이 빈 공간",
    ],
  },
  {
    id: "safe-area-padding",
    category: "composition",
    description_ko: "프레임 가장자리에 8-12% 안전 여백을 둡니다.",
    description_en:
      "Reserve 8–12% safe-area padding from each edge so neither outline nor extremities touch the canvas border.",
    why_approved:
      "플랫폼별 리사이즈/크롭 시 잘림이 방지되고, 채팅 UI의 말풍선 안에서도 답답하지 않게 보입니다.",
    examples_abstract: [
      "1080×1080 기준 약 100px 안쪽으로 캐릭터 외곽선이 들어옴",
      "팔이 위로 뻗는 슬롯도 손끝이 상단에 닿지 않고 약간의 여백 확보",
    ],
    anti_patterns: [
      "외곽선이 캔버스 모서리에 그대로 닿거나 잘림",
      "여백이 과도해 캐릭터가 너무 작게 보임 (전체 면적 35% 미만)",
    ],
  },
  {
    id: "head-body-readable-ratio",
    category: "composition",
    description_ko: "머리·몸통 비율을 작은 사이즈에서도 식별 가능한 SD 비율로 유지합니다.",
    description_en:
      "Use a super-deformed (chibi/SD) head-to-body ratio so the head reads clearly at messenger thumbnail size.",
    why_approved:
      "카카오톡 채팅 표시는 작아서 머리가 큰 SD 비율이 표정 가독성을 확보합니다.",
    examples_abstract: [
      "머리가 전체 높이의 45-55%를 차지하는 2~3등신 비율",
      "손·발은 단순화된 큰 형태로 동작이 즉시 인지됨",
    ],
    anti_patterns: [
      "8등신 사실적 비율로 머리가 작아 표정이 안 보임",
      "비율이 슬롯마다 달라져 동일 캐릭터로 인식 안 됨",
    ],
  },
  {
    id: "action-silhouette-readability",
    category: "composition",
    description_ko: "동작 슬롯은 실루엣만으로도 의도가 읽혀야 합니다.",
    description_en:
      "Action slots must be readable from silhouette alone — limbs and props clearly extend from the body mass.",
    why_approved:
      "썸네일에서는 색이 뭉개져도 형태가 남으면 메시지가 전달됩니다.",
    examples_abstract: [
      "춤추는 동작에서 양팔이 몸 실루엣과 분리되어 명확히 뻗음",
      "달리기 슬롯에서 한 다리가 앞·뒤로 확실히 나뉘어 보임",
    ],
    anti_patterns: [
      "팔이 몸과 같은 색·실루엣에 묻혀 동작이 안 보임",
      "정면 정자세인데 라벨은 ‘점프’ — 실루엣이 라벨과 어긋남",
    ],
  },
  {
    id: "negative-space-balance",
    category: "composition",
    description_ko: "네거티브 스페이스로 시선의 호흡을 만듭니다.",
    description_en:
      "Balance subject mass with negative space so the canvas does not feel crowded; aim for roughly 40–60% subject coverage.",
    why_approved:
      "꽉 찬 구도는 작은 표시 크기에서 시각적 노이즈로 변하고 답답함을 유발합니다.",
    examples_abstract: [
      "캐릭터가 캔버스의 약 절반을 차지하고 주변에 깔끔한 투명 영역",
      "소품을 들었을 때도 캐릭터+소품 합산 면적이 60% 이내",
    ],
    anti_patterns: [
      "배경 효과·말풍선·소품으로 캔버스의 80% 이상이 가득 참",
      "텍스트와 캐릭터가 동시에 화면을 채워 시선 분산",
    ],
  },
  {
    id: "vertical-axis-stability",
    category: "composition",
    description_ko: "기본 자세에서 수직 축이 안정적으로 잡혀야 합니다.",
    description_en:
      "Stable vertical axis through head-torso-feet for default poses; tilt only when the action explicitly demands it.",
    why_approved:
      "32장 안에서 캐릭터의 ‘기본형’이 흔들리면 일관성이 무너져 합격 확률이 떨어집니다.",
    examples_abstract: [
      "인사·끄덕임 같은 정적 슬롯은 머리-허리-발 수직 정렬",
      "기울임은 점프·넘어짐 같은 동작 슬롯에서만 의도적으로 사용",
    ],
    anti_patterns: [
      "정적 슬롯에서도 캐릭터가 무작위로 기울어져 떠 있는 느낌",
      "원근 왜곡으로 머리가 몸보다 작게 그려짐",
    ],
  },

  // ─────────────────────────── linework (5) ───────────────────────────
  {
    id: "thick-consistent-outline",
    category: "linework",
    description_ko: "굵고 일관된 외곽선 두께를 유지합니다.",
    description_en:
      "Maintain a thick, uniform outer outline (≈6–10px at 1024px canvas) across all 32 slots.",
    why_approved:
      "메신저에서 작게 표시되어도 형태가 또렷하게 보이고, 32장 전체가 하나의 작품으로 묶입니다.",
    examples_abstract: [
      "1024px 기준 외곽선 두께 8px가 모든 슬롯에서 동일",
      "줄어든 360px 표시에서도 외곽이 흐리지 않고 또렷함",
    ],
    anti_patterns: [
      "슬롯마다 외곽선이 2px ↔ 12px로 들쭉날쭉",
      "AI 자동 생성 결과물에서 흔한 흐릿한 다층 라인",
    ],
  },
  {
    id: "single-outline-color",
    category: "linework",
    description_ko: "외곽선 색은 한 가지(검정 권장)로 통일합니다.",
    description_en:
      "Use a single outline color across all slots (black is the safest default).",
    why_approved:
      "외곽선 색이 슬롯마다 바뀌면 32장 묶음이 다른 작품처럼 보여 일관성 점수가 떨어집니다.",
    examples_abstract: [
      "검정 단색 외곽선 #1A1A1A 일괄 적용",
      "배경 상관없이 외곽선이 동일한 톤을 유지",
    ],
    anti_patterns: [
      "기쁜 슬롯은 갈색 외곽선, 슬픈 슬롯은 파란 외곽선",
      "외곽선이 부분적으로 사라지는 색 분리 라인",
    ],
  },
  {
    id: "internal-line-thinner",
    category: "linework",
    description_ko: "내부 디테일 선은 외곽선보다 살짝 가늘게 둡니다.",
    description_en:
      "Internal detail lines (eyes, mouth, fur tufts) are slightly thinner than the outer outline (≈60–75% of outline width).",
    why_approved:
      "시각 위계가 생겨 외곽 → 내부 순으로 시선이 자연스럽게 이동합니다.",
    examples_abstract: [
      "외곽 8px / 입선 5px / 눈썹 4px의 일관 스케일",
      "그림자 라인은 외곽선의 50-60% 두께",
    ],
    anti_patterns: [
      "내부 라인이 외곽선보다 두꺼워 외곽이 묻힘",
      "내부 디테일이 너무 얇아 작은 사이즈에서 사라짐",
    ],
  },
  {
    id: "no-broken-or-anti-aliased-edges",
    category: "linework",
    description_ko: "외곽선이 끊기거나 흐릿한 안티앨리어싱 잔여물이 없어야 합니다.",
    description_en:
      "Outlines must form closed, crisp paths without gaps or fuzzy anti-alias halos.",
    why_approved:
      "카카오 검수에서 자주 지적되는 항목으로, 마감 완성도를 즉시 보여줍니다.",
    examples_abstract: [
      "줌인해도 외곽이 깔끔한 알파 경계",
      "닫힌 패스 — 내부 채색이 새지 않음",
    ],
    anti_patterns: [
      "픽셀 단위로 외곽선이 흐릿하게 끊김",
      "리사이즈 후 외곽 주변에 회색 후광 (alpha bleeding)",
    ],
  },
  {
    id: "stroke-feel-consistent-across-set",
    category: "linework",
    description_ko: "32장 전체에 걸친 ‘붓 느낌’이 같아야 합니다.",
    description_en:
      "Maintain a single stroke character (e.g., crisp vector vs. textured brush) across the entire set; do not mix.",
    why_approved:
      "한 슬롯만 다른 붓 느낌이면 ‘다른 작가의 그림’처럼 보여 세트 일관성 점수가 폭락합니다.",
    examples_abstract: [
      "전 슬롯이 균일한 깔끔한 벡터 라인",
      "전 슬롯이 동일한 손그림 텍스처 라인",
    ],
    anti_patterns: [
      "벡터 라인 슬롯과 손그림 텍스처 라인 슬롯이 섞임",
      "일부 슬롯만 라인에 워터컬러 효과가 들어감",
    ],
  },

  // ─────────────────────────── palette (6) ───────────────────────────
  {
    id: "limited-color-count",
    category: "palette",
    description_ko: "전체 팔레트를 256색 이내, 가급적 32색 안쪽으로 제한합니다.",
    description_en:
      "Keep the full palette within 256 colors (ideally under 32) to feel intentional and printable.",
    why_approved:
      "절제된 팔레트는 ‘디자인된 작품’으로 보이고, AI 생성물 특유의 노이즈 색을 제거합니다.",
    examples_abstract: [
      "주요 캐릭터 색 6개 + 보조 4개 + 강조 2개 = 12색대",
      "그림자·하이라이트도 새 색 추가 없이 명도 단계로 처리",
    ],
    anti_patterns: [
      "비슷해 보이지만 실제로는 수백 가지 톤이 섞임",
      "AI 생성 노이즈로 인한 픽셀 단위 미세 색 변이",
    ],
  },
  {
    id: "no-gradient-fills",
    category: "palette",
    description_ko: "큰 면적 그라데이션을 피하고 플랫 컬러로 채웁니다.",
    description_en:
      "Avoid large gradient fills; use flat colors with at most 1–2 hard-edge shading steps.",
    why_approved:
      "메신저 스티커는 작은 사이즈에서 그라데이션이 뭉개져 ‘싸 보이는’ 느낌을 줍니다.",
    examples_abstract: [
      "몸체 색 + 그림자 색 1단계 = 깔끔한 셀 셰이딩",
      "강조 부분만 단색 하이라이트 도형 추가",
    ],
    anti_patterns: [
      "전체 몸이 위→아래 그라데이션",
      "배경에 큰 라디얼 그라데이션",
    ],
  },
  {
    id: "saturation-mid-to-high",
    category: "palette",
    description_ko: "채도는 중간-높음 영역을 사용합니다.",
    description_en:
      "Use mid-to-high saturation; avoid pastel washes or fully desaturated grays for the main subject.",
    why_approved:
      "채팅 UI(흰/회색 배경)에서 캐릭터가 묻히지 않고 또렷하게 떠 보입니다.",
    examples_abstract: [
      "메인 컬러 채도 60-85% 범위",
      "악센트 컬러는 100%까지 끌어올려 시선 유도",
    ],
    anti_patterns: [
      "전체가 채도 30% 이하의 회색 톤",
      "AI 생성 결과물의 ‘진흙 색’ 같은 무채색 끼임",
    ],
  },
  {
    id: "hero-color-2-to-3",
    category: "palette",
    description_ko: "캐릭터를 정의하는 메인 컬러는 2-3개로 한정합니다.",
    description_en:
      "Define the character with 2–3 hero colors that repeat across all 32 slots.",
    why_approved:
      "썸네일에서 색만으로도 같은 캐릭터인지 즉시 알 수 있어야 일관성 점수가 올라갑니다.",
    examples_abstract: [
      "몸 컬러(파스텔 옐로) + 악센트(체리 레드) + 외곽선(검정) 고정",
      "32장 모두 같은 3색 조합으로 시그니처 형성",
    ],
    anti_patterns: [
      "슬롯마다 캐릭터 메인 컬러가 바뀜",
      "메인 컬러가 5개 이상이라 정체성이 흐려짐",
    ],
  },
  {
    id: "value-contrast-against-chat-bg",
    category: "palette",
    description_ko: "흰색·다크 채팅 배경 모두에서 보이는 명도 대비를 확보합니다.",
    description_en:
      "Ensure value contrast works on both light and dark chat backgrounds — never rely on white-only or near-transparent fills.",
    why_approved:
      "다크 모드 사용자가 늘어 흰색 배경에만 맞춘 캐릭터는 안 보이는 사례가 많습니다.",
    examples_abstract: [
      "흰 배경에서는 외곽 검정선이, 다크 배경에서는 내부 채색이 식별을 담당",
      "‘흰 캐릭터’는 외곽 굵은 검정선으로 다크 배경 가독성 확보",
    ],
    anti_patterns: [
      "흰 캐릭터에 외곽선이 얇아 다크 배경에서 사라짐",
      "검정 캐릭터에 외곽선이 또 검정이라 흰 배경에서 디테일 소실",
    ],
  },
  {
    id: "accent-on-emotion-cue",
    category: "palette",
    description_ko: "감정 단서(눈물·하트·번쩍임)에 강조 색을 한정 사용합니다.",
    description_en:
      "Reserve high-saturation accent color for emotion cues (tears, hearts, sparkles) rather than overall body fills.",
    why_approved:
      "강조 색이 감정 신호에 집중되면 라벨(슬픔/사랑/놀람)이 즉시 읽힙니다.",
    examples_abstract: [
      "사랑해 슬롯의 빨간 하트, 슬픔 슬롯의 진한 파란 눈물",
      "축하 슬롯의 노란 별 모양 번쩍임",
    ],
    anti_patterns: [
      "캐릭터 몸 전체가 강조 색이라 감정 단서가 묻힘",
      "강조 색을 모든 슬롯에 비슷하게 깔아 의미 차이가 안 남",
    ],
  },

  // ─────────────────────────── expression (5) ───────────────────────────
  {
    id: "one-second-emotion-read",
    category: "expression",
    description_ko: "1초 안에 감정이 인지되어야 합니다.",
    description_en:
      "Emotion must be readable within one second of glance — primary cue should occupy a large facial area.",
    why_approved:
      "채팅 흐름에서 사용자는 스티커를 길게 응시하지 않습니다. 즉시 읽혀야 채택됩니다.",
    examples_abstract: [
      "기쁨 슬롯에서 입이 얼굴의 절반 가까이 차지하는 큰 미소",
      "놀람 슬롯에서 동공이 작아지고 입은 둥글게 큼지막",
    ],
    anti_patterns: [
      "여러 감정이 섞여 ‘애매한 표정’으로 보이는 슬롯",
      "표정 변화가 작아 다른 슬롯과 구분이 안 됨",
    ],
  },
  {
    id: "one-emotion-per-slot",
    category: "expression",
    description_ko: "한 슬롯에는 한 감정만 담습니다.",
    description_en:
      "Each slot expresses exactly one emotion — never combine ‘sad + angry + tired’ in a single frame.",
    why_approved:
      "라벨(인사/사랑해/슬픔 등 32감정)이 명확히 매핑되어 사용자가 적절히 골라 씁니다.",
    examples_abstract: [
      "‘힘내’ 슬롯 = 결의 + 미세 미소만",
      "‘짜증’ 슬롯 = 찌푸림 + 한쪽 눈 찡긋만",
    ],
    anti_patterns: [
      "한 슬롯에 웃으며 우는 복합 감정",
      "라벨과 표정이 어긋남 (‘기쁨’ 라벨인데 표정은 무표정)",
    ],
  },
  {
    id: "exaggeration-over-realism",
    category: "expression",
    description_ko: "과장을 디테일보다 우선합니다.",
    description_en:
      "Prefer exaggerated, cartoonish features over realistic micro-expressions for messenger context.",
    why_approved:
      "작은 표시 크기에서는 미세 표정이 사라지므로 과장된 형태가 메시지를 살립니다.",
    examples_abstract: [
      "눈물 한 방울이 캐릭터 얼굴의 1/4 크기로 떨어짐",
      "화남 슬롯에서 ‘#’ 모양 핏줄이 머리에 크게 그려짐",
    ],
    anti_patterns: [
      "사실적 주름·홍조로만 감정 표현",
      "표정이 너무 절제되어 32장이 비슷해 보임",
    ],
  },
  {
    id: "iconic-emotion-cues",
    category: "expression",
    description_ko: "감정마다 아이콘화된 시각 단서를 결합합니다.",
    description_en:
      "Pair facial emotion with an iconic motif — heart, tear, sweat drop, sparkle, anger mark — to reinforce the label.",
    why_approved:
      "표정 + 모티프 조합이 메신저 문화의 ‘스티커 문법’이며 즉시 인지됩니다.",
    examples_abstract: [
      "사랑해 = 미소 + 볼 옆 떠다니는 하트",
      "당황 = 눈동자 흔들림 + 머리 위 땀방울",
    ],
    anti_patterns: [
      "모든 슬롯에 동일한 모티프(하트만 반복) 남용",
      "라벨과 모티프 조합이 어색 (‘기쁨’ + 눈물)",
    ],
  },
  {
    id: "label-driven-design",
    category: "expression",
    description_ko: "32감정 라벨이 디자인을 주도합니다.",
    description_en:
      "Design each slot from the label inward: pick the strongest emotion cue first, then build the pose around it.",
    why_approved:
      "사용자가 라벨로 검색·선택하므로 라벨↔표정 일치도가 매출에 직결됩니다.",
    examples_abstract: [
      "‘안녕’ 라벨 = 손 흔드는 큰 동작 + 미소",
      "‘OK’ 라벨 = 엄지척 + 윙크",
    ],
    anti_patterns: [
      "포즈 먼저 그리고 라벨을 끼워 맞춤",
      "32장이 ‘다른 의상의 같은 표정’이 되어 라벨 차이가 없음",
    ],
  },

  // ─────────────────────────── motion (4) ───────────────────────────
  {
    id: "static-with-motion-marks",
    category: "motion",
    description_ko: "정적 슬롯도 동작선·이펙트 라인으로 미세 활기를 더합니다.",
    description_en:
      "Add small motion marks (speed lines, vibration ticks, micro-bounce dots) even on static slots to keep visual energy.",
    why_approved:
      "정지 컷이라도 약간의 활기가 있어야 32장 묶음이 ‘살아 있는’ 느낌을 줍니다.",
    examples_abstract: [
      "끄덕임 슬롯에 머리 위 작은 동작 호 두 개",
      "한숨 슬롯에 입 옆 작은 바람 라인",
    ],
    anti_patterns: [
      "32장 모두 완전 정지 — 카탈로그처럼 무미건조",
      "동작선이 너무 많아 노이즈로 변함",
    ],
  },
  {
    id: "varied-action-vocabulary",
    category: "motion",
    description_ko: "32장에 동작 어휘가 다양해야 합니다.",
    description_en:
      "Across 32 slots, vary action vocabulary: standing, jumping, lying, running, hugging, holding props.",
    why_approved:
      "비슷한 자세 반복은 사용자에게 ‘쓸 게 없다’는 인상을 주고 합격률이 떨어집니다.",
    examples_abstract: [
      "정자세 8 / 동적 액션 12 / 누움·앉음 6 / 소품 활용 6",
      "각 동작이 라벨 의미와 직결되도록 설계",
    ],
    anti_patterns: [
      "32장 중 25장이 정자세 + 표정만 다름",
      "춤 슬롯이 7개 — 의미 중복",
    ],
  },
  {
    id: "stable-proportion-during-motion",
    category: "motion",
    description_ko: "동작 슬롯에서도 캐릭터 비율이 흔들리지 않습니다.",
    description_en:
      "Even during dynamic poses, head/body proportions stay locked to the character bible.",
    why_approved:
      "비율이 슬롯마다 변하면 ‘다른 캐릭터’로 인식되어 일관성 점수가 폭락합니다.",
    examples_abstract: [
      "점프 슬롯도 머리 크기 = 정자세 슬롯의 머리 크기",
      "팔 길이가 동작에 따라 임의로 늘어나지 않음",
    ],
    anti_patterns: [
      "달리는 슬롯에서 다리가 갑자기 두 배로 길어짐",
      "기쁜 슬롯의 머리가 슬픈 슬롯보다 30% 큼",
    ],
  },
  {
    id: "directional-balance",
    category: "motion",
    description_ko: "왼쪽·오른쪽 향한 슬롯의 분포가 균형 잡혀 있습니다.",
    description_en:
      "Balance left-facing and right-facing actions across the set so users can pair stickers in conversation.",
    why_approved:
      "대화에서 두 사람이 마주 보는 컨텍스트가 자주 발생해 좌·우 분포가 매출에 영향을 줍니다.",
    examples_abstract: [
      "32장 중 좌향 12 / 정면 8 / 우향 12 비율",
      "사랑·반가움 같은 ‘상대를 향함’ 슬롯에 좌·우 변형 함께 제공",
    ],
    anti_patterns: [
      "32장 모두 정면만 바라봄",
      "좌향만 24장 / 우향 0장 — 짝맞춤 불가능",
    ],
  },

  // ─────────────────────────── background (4) ───────────────────────────
  {
    id: "transparent-background-default",
    category: "background",
    description_ko: "배경은 100% 투명을 기본으로 합니다.",
    description_en:
      "Default to fully transparent background (PNG with alpha) so stickers blend with any chat theme.",
    why_approved:
      "카카오 제출 규격이며, 흰 배경 PNG는 다크 모드에서 사각 흰 박스로 보여 즉시 거절됩니다.",
    examples_abstract: [
      "캐릭터 외곽 바깥 픽셀 alpha=0",
      "그림자가 필요하면 캐릭터 일부로 그리고 별도 배경 면 X",
    ],
    anti_patterns: [
      "흰 배경 채워진 PNG 그대로 제출",
      "체크무늬 미리보기 배경이 그대로 export됨",
    ],
  },
  {
    id: "clean-alpha-edges",
    category: "background",
    description_ko: "외곽 알파 가장자리에 잔여물이 없어야 합니다.",
    description_en:
      "Alpha edges must be clean — no JPEG halos, dithered gray fringe, or stray semi-transparent pixels.",
    why_approved:
      "다크 배경에서 회색 후광이 그대로 드러나 ‘완성도 부족’ 인상을 줍니다.",
    examples_abstract: [
      "다크 모드에서도 외곽 주변에 회색 띠 없음",
      "PNG-32 무손실 export로 알파 채널 보존",
    ],
    anti_patterns: [
      "JPEG로 한번 저장 후 다시 PNG 변환 → 회색 후광",
      "AI 자동 배경 제거 후 잔여 픽셀 점검 안 됨",
    ],
  },
  {
    id: "no-busy-bg-elements",
    category: "background",
    description_ko: "배경 요소(패턴·풍경)는 넣지 않거나 극소화합니다.",
    description_en:
      "Avoid background scenery; if used, keep it minimal and well below the subject in visual weight.",
    why_approved:
      "배경이 시선을 분산시키면 캐릭터의 감정 신호가 약해지고 채팅 가독성이 떨어집니다.",
    examples_abstract: [
      "축하 슬롯의 콘페티는 작은 점 몇 개로 절제",
      "‘잘자’ 슬롯의 별·달은 캐릭터 주변 1-2개만",
    ],
    anti_patterns: [
      "디테일한 풍경 배경 + 큰 글자 + 캐릭터 = 시각 과부하",
      "32장 모두 다른 배경이라 일관성이 깨짐",
    ],
  },
  {
    id: "decoration-stays-attached",
    category: "background",
    description_ko: "장식 요소는 캐릭터와 시각적으로 묶여야 합니다.",
    description_en:
      "Any decoration (sparkle, heart, motion line) must visually attach to the subject — never float far in negative space.",
    why_approved:
      "떨어진 장식은 잘림·축소 시 사라져 의도가 변하고 구도가 무너집니다.",
    examples_abstract: [
      "하트가 캐릭터 머리 위 가까이 위치",
      "별·번쩍임이 캐릭터 외곽에서 8% 이내",
    ],
    anti_patterns: [
      "캔버스 모서리에 작은 장식이 동떨어져 떠 있음",
      "장식이 캐릭터보다 더 시선을 끌어 의미 혼선",
    ],
  },

  // ─────────────────────────── sticker_anatomy (4) ───────────────────────────
  {
    id: "thumbnail-readable-at-360",
    category: "sticker_anatomy",
    description_ko: "360×360 표시 크기에서도 즉시 읽혀야 합니다.",
    description_en:
      "Verify readability at the actual 360×360 display size — the canvas where the user sees it.",
    why_approved:
      "1024px 작업 캔버스에서는 잘 보이던 디테일이 360px에서는 사라져 합격 후 후회로 이어집니다.",
    examples_abstract: [
      "작업 마지막에 360×360 미리보기로 한 번 더 검수",
      "표정 핵심 요소가 360px에서도 식별",
    ],
    anti_patterns: [
      "1024px에서만 좋아 보이고 360px에서는 ‘작은 동그라미’가 됨",
      "얇은 디테일이 다운스케일에서 사라짐",
    ],
  },
  {
    id: "messenger-context-visual-hierarchy",
    category: "sticker_anatomy",
    description_ko: "메신저 채팅 흐름에 맞는 시각 위계를 갖춥니다.",
    description_en:
      "Visual hierarchy: silhouette → emotion cue → secondary motif → background props (decreasing weight).",
    why_approved:
      "스티커는 ‘말풍선 옆에서 거드는 추임새’라 캐릭터-감정-나머지 순으로 비중이 분명해야 합니다.",
    examples_abstract: [
      "캐릭터 = 80% 비중 / 모티프 = 15% / 작은 장식 = 5%",
      "텍스트는 사용 시에도 작게 부속처럼",
    ],
    anti_patterns: [
      "큰 글자가 캐릭터를 덮어 시각 위계 역전",
      "장식이 캐릭터보다 더 시선을 끔",
    ],
  },
  {
    id: "centered-bounding-box",
    category: "sticker_anatomy",
    description_ko: "캐릭터 바운딩 박스가 캔버스 중심에 정렬됩니다.",
    description_en:
      "Bounding box of the visible subject is centered within ±5% of the canvas center.",
    why_approved:
      "여러 스티커 묶음 표시·정렬 시 줄이 맞아야 카탈로그가 깔끔해 보입니다.",
    examples_abstract: [
      "32장 모두 캐릭터 바운딩 박스 중심이 일관",
      "동작 슬롯도 무게중심을 중앙으로 보정",
    ],
    anti_patterns: [
      "슬롯마다 캐릭터가 위·아래로 들쭉날쭉",
      "라이브러리 그리드에서 한 칸만 비어 보임",
    ],
  },
  {
    id: "text-as-graphic-element",
    category: "sticker_anatomy",
    description_ko: "텍스트는 그래픽 요소로 취급하고 절제합니다.",
    description_en:
      "If using text, treat it as a graphic element with thick outline and the same color discipline as the character.",
    why_approved:
      "메신저 폰트와 충돌 없이 ‘이미지 안의 외침’으로 작동해야 합니다.",
    examples_abstract: [
      "‘OK’를 굵은 손글씨 + 캐릭터 컬러 외곽선으로 처리",
      "텍스트 슬롯은 32장 중 8-12장 이내로 절제",
    ],
    anti_patterns: [
      "32장 전부에 다른 폰트로 글자 삽입",
      "얇은 시스템 폰트 그대로 — 그래픽 통일감 깨짐",
    ],
  },

  // ─────────────────────────── set_diversity (4) ───────────────────────────
  {
    id: "same-character-varied-emotion",
    category: "set_diversity",
    description_ko: "32장은 같은 캐릭터의 다른 표정·동작이어야 합니다.",
    description_en:
      "All 32 slots are the same character with varied emotions and actions — never substitute different characters.",
    why_approved:
      "카카오 합격 묶음의 가장 중요한 정체성 규칙이며, 일관성 점수의 기반입니다.",
    examples_abstract: [
      "캐릭터 비례·컬러·시그니처 디테일은 32장 동일",
      "표정·자세·소품으로만 변주",
    ],
    anti_patterns: [
      "20장은 캐릭터 A, 12장은 캐릭터 B",
      "성별·종족이 슬롯마다 바뀜",
    ],
  },
  {
    id: "no-duplicate-impressions",
    category: "set_diversity",
    description_ko: "32장 안에 ‘인상이 같은’ 슬롯이 없어야 합니다.",
    description_en:
      "No two slots should leave the same overall impression at thumbnail size.",
    why_approved:
      "사용자가 32장을 훑었을 때 ‘쓸 게 다양하다’는 느낌이 매출 직결입니다.",
    examples_abstract: [
      "비슷한 라벨이라도 시점·동작·모티프를 다르게",
      "‘웃음’은 활짝/킥킥/쑥스러움 등 변주",
    ],
    anti_patterns: [
      "‘웃음’ 슬롯 4개가 거의 동일",
      "표정만 미세하게 다른 사실상 중복 슬롯 다수",
    ],
  },
  {
    id: "sub-palette-variation",
    category: "set_diversity",
    description_ko: "팔레트는 고정하되 1-2개 슬롯에서 미세 변주를 줍니다.",
    description_en:
      "Hold the master palette, but allow 1–2 slots to introduce a sub-accent (e.g., night/sleep slot in cooler tone) for variety.",
    why_approved:
      "32장 전부 같은 톤이면 단조롭고, 너무 다채로우면 일관성이 깨집니다. 균형이 핵심.",
    examples_abstract: [
      "‘잘자’ 슬롯에 살짝 푸른 빛 도는 보조 컬러",
      "‘축하’ 슬롯에 골드 악센트 한정 사용",
    ],
    anti_patterns: [
      "32장 모두 완전 동일 팔레트로 단조로움",
      "5개 이상의 슬롯이 다른 팔레트라 ‘다른 작품’처럼 보임",
    ],
  },
  {
    id: "label-coverage-balance",
    category: "set_diversity",
    description_ko: "감정 라벨 카테고리(긍정·부정·중립·인사)가 균형 있게 채워집니다.",
    description_en:
      "Coverage across emotion categories — greetings, positive, negative, neutral, action — is balanced for everyday use.",
    why_approved:
      "한쪽으로 치우친 묶음(긍정만 30개)은 일상 채팅에서 활용도가 낮아 매출이 떨어집니다.",
    examples_abstract: [
      "인사 6 / 긍정 10 / 부정 6 / 중립·반응 6 / 특수 4 비율",
      "필수 라벨(안녕·고마워·미안·OK·잘자) 누락 없음",
    ],
    anti_patterns: [
      "32장이 모두 ‘하트·사랑해’ 변형",
      "필수 일상 라벨이 빠져 사용 빈도가 낮음",
    ],
  },
];

// ──────────────────────────── public API ────────────────────────────

export function getAllPatterns(): ReadonlyArray<AbstractPattern> {
  return PATTERNS;
}

export function getPatternsByCategory(
  category: PatternCategory,
): ReadonlyArray<AbstractPattern> {
  return PATTERNS.filter((p) => p.category === category);
}

export type BuildCriticContextOptions = {
  /** 포함할 카테고리 — 미지정 시 전체 */
  categories?: ReadonlyArray<PatternCategory>;
  /** 카테고리당 최대 패턴 수 — 토큰 예산 컨트롤 */
  maxPerCategory?: number;
};

const CATEGORY_HEADER_EN: Record<PatternCategory, string> = {
  composition: "Composition",
  linework: "Linework",
  palette: "Palette",
  expression: "Expression",
  motion: "Motion",
  background: "Background",
  sticker_anatomy: "Sticker Anatomy",
  set_diversity: "Set Diversity",
};

/**
 * Gemini critic prompt에 주입할 영문 컨텍스트 텍스트를 빌드합니다.
 * 토큰 예산을 위해 한 줄당 한 패턴, 카테고리별 헤더로 구성.
 */
export function buildCriticContext(
  opts: BuildCriticContextOptions = {},
): string {
  const cats: ReadonlyArray<PatternCategory> =
    opts.categories && opts.categories.length > 0
      ? opts.categories
      : CATEGORY_ORDER;
  const max = opts.maxPerCategory ?? Number.POSITIVE_INFINITY;

  const lines: string[] = ["## Approved Kakao Emoticon Patterns"];
  for (const cat of cats) {
    const items = getPatternsByCategory(cat).slice(0, max);
    if (items.length === 0) continue;
    const joined = items.map((p) => p.description_en).join("; ");
    lines.push(`${CATEGORY_HEADER_EN[cat]}: ${joined}`);
  }
  return lines.join("\n");
}

/** 키워드 매칭용 - 라벨 키워드 → 관련 카테고리 */
const LABEL_KEYWORDS: ReadonlyArray<{
  keywords: ReadonlyArray<string>;
  patternIds: ReadonlyArray<string>;
}> = [
  {
    keywords: ["안녕", "안뇽", "hi", "hello", "반가워", "인사"],
    patternIds: [
      "label-coverage-balance",
      "one-second-emotion-read",
      "iconic-emotion-cues",
      "directional-balance",
    ],
  },
  {
    keywords: ["사랑", "좋아", "하트", "love", "♥"],
    patternIds: [
      "iconic-emotion-cues",
      "accent-on-emotion-cue",
      "decoration-stays-attached",
    ],
  },
  {
    keywords: ["슬", "울", "눈물", "sad", "cry", "흑"],
    patternIds: [
      "exaggeration-over-realism",
      "iconic-emotion-cues",
      "accent-on-emotion-cue",
    ],
  },
  {
    keywords: ["화", "짜증", "분노", "angry"],
    patternIds: [
      "exaggeration-over-realism",
      "iconic-emotion-cues",
      "one-emotion-per-slot",
    ],
  },
  {
    keywords: ["춤", "신나", "기쁨", "기뻐", "happy", "joy"],
    patternIds: [
      "varied-action-vocabulary",
      "action-silhouette-readability",
      "static-with-motion-marks",
    ],
  },
  {
    keywords: ["잘자", "굿나잇", "수면", "sleep", "자"],
    patternIds: [
      "sub-palette-variation",
      "no-busy-bg-elements",
      "static-with-motion-marks",
    ],
  },
  {
    keywords: ["놀람", "헉", "surprise", "충격"],
    patternIds: [
      "exaggeration-over-realism",
      "one-second-emotion-read",
      "iconic-emotion-cues",
    ],
  },
  {
    keywords: ["ok", "오케이", "엄지", "굿", "good"],
    patternIds: [
      "label-driven-design",
      "action-silhouette-readability",
      "centered-bounding-box",
    ],
  },
  {
    keywords: ["미안", "죄송", "sorry"],
    patternIds: [
      "iconic-emotion-cues",
      "exaggeration-over-realism",
      "one-emotion-per-slot",
    ],
  },
  {
    keywords: ["고마", "감사", "thanks"],
    patternIds: [
      "label-coverage-balance",
      "iconic-emotion-cues",
      "directional-balance",
    ],
  },
];

const PATTERN_BY_ID: ReadonlyMap<string, AbstractPattern> = new Map(
  PATTERNS.map((p) => [p.id, p]),
);

/**
 * 32 감정 라벨 같은 짧은 문자열에 가장 관련 있는 패턴을 추천.
 * 키워드 매칭이 없으면 카테고리 헤드라인 기본 세트로 폴백.
 */
export function findRelevantPatterns(
  slotLabel: string,
): ReadonlyArray<AbstractPattern> {
  const normalized = slotLabel.trim().toLowerCase();
  if (normalized.length === 0) return defaultRelevantSet();

  const matched = new Set<string>();
  for (const entry of LABEL_KEYWORDS) {
    const hit = entry.keywords.some((k) =>
      normalized.includes(k.toLowerCase()),
    );
    if (hit) {
      for (const id of entry.patternIds) matched.add(id);
    }
  }
  if (matched.size === 0) return defaultRelevantSet();

  const out: AbstractPattern[] = [];
  for (const id of matched) {
    const p = PATTERN_BY_ID.get(id);
    if (p) out.push(p);
  }
  return out;
}

function defaultRelevantSet(): ReadonlyArray<AbstractPattern> {
  // 라벨 매칭 실패 시 핵심 ‘공통 합격 패턴’ 묶음으로 폴백
  const fallbackIds: ReadonlyArray<string> = [
    "single-subject-center",
    "thick-consistent-outline",
    "limited-color-count",
    "one-second-emotion-read",
    "transparent-background-default",
    "same-character-varied-emotion",
  ];
  const out: AbstractPattern[] = [];
  for (const id of fallbackIds) {
    const p = PATTERN_BY_ID.get(id);
    if (p) out.push(p);
  }
  return out;
}
