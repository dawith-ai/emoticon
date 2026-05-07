/**
 * 32 슬롯 감정/액션 정의 — 클라이언트에서 직접 AI 호출 시 영문 prompt로 사용.
 * evals/datasets/emotions.yaml과 동일 내용 (정적 export 호환을 위해 TS 모듈로 별도 보관).
 */

export type EmotionDef = {
  slot: number;
  label: string;
  /** 영문 action description — 모델 prompt에 직접 들어감 */
  action: string;
};

export const EMOTIONS_32: EmotionDef[] = [
  { slot: 1, label: "안녕", action: "waving hello with one paw raised, smiling warmly" },
  { slot: 2, label: "반가워", action: "jumping with both arms up in joy" },
  { slot: 3, label: "고마워", action: "hands clasped together in a thank-you gesture, slight bow" },
  { slot: 4, label: "사랑해", action: "holding a red heart with both paws, blushing cheeks" },
  { slot: 5, label: "최고", action: "thumbs up with confident expression" },
  { slot: 6, label: "잘자", action: "eyes closed, sleeping with a small Z above head" },
  { slot: 7, label: "잘가", action: "waving goodbye with a slightly sad smile" },
  { slot: 8, label: "하이", action: "peace sign with one paw, cheerful expression" },
  { slot: 9, label: "ㅋㅋㅋ", action: "laughing hard, holding belly, eyes squeezed shut" },
  { slot: 10, label: "ㅎㅎ", action: "gentle smile with one paw covering mouth" },
  { slot: 11, label: "ㅠㅠ", action: "crying with big tears streaming down" },
  { slot: 12, label: "어머", action: "surprised, both paws on cheeks, mouth open in O shape" },
  { slot: 13, label: "헐", action: "shocked expression, jaw dropped, eyes wide" },
  { slot: 14, label: "대박", action: "amazed, sparkles around the head, mouth wide open" },
  { slot: 15, label: "오케이", action: "making OK sign with paw fingers" },
  { slot: 16, label: "굿", action: "thumbs up with a wink" },
  { slot: 17, label: "화남", action: "angry with steam coming out of ears, frowning eyebrows" },
  { slot: 18, label: "삐짐", action: "pouting with arms crossed, looking sideways" },
  { slot: 19, label: "슬픔", action: "head down, single tear, drooping ears" },
  { slot: 20, label: "지침", action: "tired, slumped over, sweat drop on forehead" },
  { slot: 21, label: "졸려", action: "yawning with paw covering mouth, half-closed eyes" },
  { slot: 22, label: "배고파", action: "holding empty bowl, drooling slightly" },
  { slot: 23, label: "심심", action: "lying on belly, chin resting on paws, blank stare" },
  { slot: 24, label: "뭐해", action: "tilting head with a curious questioning look, '?' symbol" },
  { slot: 25, label: "축하해", action: "throwing confetti with both paws, party hat on head" },
  { slot: 26, label: "응원해", action: "holding a small flag or pom-pom, encouraging smile" },
  { slot: 27, label: "힘내", action: "clenched paw raised, determined expression" },
  { slot: 28, label: "괜찮아", action: "gentle reassuring smile, paw extended" },
  { slot: 29, label: "미안", action: "head bowed, paw scratching back of head sheepishly" },
  { slot: 30, label: "부탁", action: "hands clasped pleadingly, big puppy eyes" },
  { slot: 31, label: "콜", action: "holding paw to ear like a phone, smiling" },
  { slot: 32, label: "빠이", action: "blowing a kiss with one paw, winking" },
];

export function buildSeedPrompt(description: string): string {
  return [
    `Create a single cute emoticon character based on this description: ${description}.`,
    `Style: thick black outline, flat sticker illustration, transparent or plain white background, square 1:1 frame.`,
    `The character should have a clear, simple identity that can be drawn consistently in 32 different expressions.`,
    `Cute, expressive, suitable for KakaoTalk/LINE messenger emoticons.`,
    `No text, no watermark.`,
  ].join(" ");
}

export function buildVariantPrompt(
  description: string,
  emotion: EmotionDef,
  hasReference: boolean,
): string {
  if (hasReference) {
    return [
      `Keep EXACTLY the same character as the reference image — same colors, proportions, distinctive features.`,
      `New action/expression: ${emotion.action}.`,
      `Style: thick black outline, flat sticker illustration, transparent background, square 1:1 frame.`,
      `Do not change body proportions, color palette, or distinctive markings. No text.`,
    ].join(" ");
  }
  // reference 미지원 (Pollinations): description을 매번 반복해서 일관성 최대 확보
  return [
    `A cute emoticon character: ${description}.`,
    `Action/expression: ${emotion.action}.`,
    `Style: thick black outline, flat sticker illustration, transparent or plain white background, square 1:1 frame.`,
    `Cute, expressive, kawaii. No text, no watermark.`,
  ].join(" ");
}
