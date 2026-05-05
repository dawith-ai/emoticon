# VibeMoji 🎨

> 자연어 한 줄로 카카오 이모티콘부터 라인 스티커까지, 만들고 팔기까지를 한 번에.

**한 줄로 32장 이모티콘 만들기.** 그림 못 그려도 괜찮아요. AI가 일관된 캐릭터 32종을 자동 생성하고, 카카오·OGQ·라인·Etsy 사양에 맞춰 자동 변환해서, 신청 가이드까지 한 번에 안내해요.

## 현재 상태

🟡 **목업 단계** — UI 골격만 구현됨. 실제 AI 생성/Firebase 연동은 다음 단계.

## 핵심 기능 3가지

1. **🤖 AI 캐릭터 생성** (`/generate`) — 자연어 → 시드 1장 → 32종 자동 생성 (Nano Banana 기반)
2. **✏️ 수동 에디터** (`/editor`) — 모바일 친화 360x360 캔버스 + AI 보정/추천
3. **💰 수익화 허브** (`/marketplace`) — 6개 플랫폼 사양·수수료·심사기간·신청링크 통합

## 기술 스택

- **프론트**: Next.js 15 (App Router) + React 19 + TypeScript
- **UI**: TailwindCSS + DaisyUI (vibemoji 커스텀 테마)
- **백엔드 (계획)**: Firebase (Auth, Firestore, Storage, Functions)
- **AI**: Gemini 2.5 Flash Image (Nano Banana) 메인, Replicate SDXL+LoRA 정밀 모드
- **결제**: Toss Payments (크레딧 모델)

## 실행 방법

```bash
npm install
npm run dev
# → http://localhost:3000
```

## 프로젝트 구조

```
emoticon/
├── app/
│   ├── page.tsx              # 랜딩
│   ├── generate/page.tsx     # AI 생성 플로우
│   ├── editor/page.tsx       # 수동 캔버스 에디터
│   ├── marketplace/page.tsx  # 수익화 허브
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── NavBar.tsx
├── lib/
│   └── platforms.ts          # 플랫폼 사양 마스터 데이터
├── 작업일지.md
└── README.md
```

## 다음 단계

- [ ] Firebase 프로젝트 셋업 (Auth + Firestore + Storage + Functions)
- [ ] Gemini Nano Banana 연동 (`generateSeedCharacter`, `generateStickerSet`)
- [ ] sharp 기반 멀티 플랫폼 자동 리사이즈 Cloud Function
- [ ] Toss Payments + 크레딧 시스템
- [ ] 베타 테스터 모집

## 관련 문서

- 상세 PRD: [/Users/dawith/docs/prd/vibe-moji.md](../docs/prd/vibe-moji.md)
- 작업 진행 내역: [작업일지.md](./작업일지.md)
