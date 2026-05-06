# VibeMoji 발행 마지막 단계

> 코드는 모두 깔려 있고, GH Pages에 라이브 배포돼있어요 — https://myjun090-spec.github.io/emoticon/  
> Firestore 룰도 라이브 배포 완료. 헬스체크: https://myjun090-spec.github.io/emoticon/debug/

이 문서는 **REST API로 자동화 안 되는 항목**만 정리했어요.  
나머지(API 활성화, Identity Toolkit 설정 패치, 도메인 추가, Firestore 배포)는 `node scripts/setup-firebase.mjs`로 자동 처리됩니다.

---

## 자동 vs 수동 매트릭스

| 항목 | 자동 가능? | 비고 |
|------|---------|------|
| `identitytoolkit.googleapis.com` API 활성화 | ✅ 자동 | 스크립트에서 처리 |
| `firebasestorage.googleapis.com` API 활성화 | ✅ 자동 | 스크립트에서 처리 |
| Firestore 룰 + 인덱스 배포 | ✅ 자동 | 이미 `firebase deploy` 완료 |
| GH Pages secrets 등록 | ✅ 자동 | `gh secret set` 완료 |
| **Authentication "Get Started"** | ❌ **수동 1클릭** | 무료 경로의 유일한 수동 단계 |
| Email/Password 활성화 | ✅ 자동 (위 1클릭 후) | 스크립트가 PATCH |
| Authorized domain 추가 | ✅ 자동 (위 1클릭 후) | 스크립트가 PATCH |
| Storage 기본 버킷 | ❌ Blaze 필수 | 결제 수단 등록 시 자동 |
| Cloud Functions 배포 | ❌ Blaze 필수 | 결제 수단 등록 시 가능 |
| `GEMINI_API_KEY` 발급 | ❌ 사용자 행동 | AI Studio 가서 키 받기 |

---

## 단계 1 — Auth "Get Started" (필수 1클릭, 무료)

🔗 https://console.firebase.google.com/project/vibemoji-app/authentication

페이지 열고 **[Get started]** 한 번 클릭. 그게 끝.

이 1클릭이 Identity Platform 무료 경로의 유일한 수동 단계예요. 클릭 즉시 Firebase Auth가 초기화되고, 제 스크립트가 나머지를 처리할 수 있게 돼요.

> 왜 자동화 못 하나: 이 단계는 Identity Platform 초기화인데, 무료 경로는 콘솔 UI로만 가능. REST API의 `:initializeAuth`는 Blaze 필수예요. (제가 시도해봤고 `BILLING_NOT_ENABLED` 에러 받음)

### 클릭 후 자동 처리

```bash
node scripts/setup-firebase.mjs vibemoji-app myjun090-spec.github.io
```

이 한 줄이:
- Email/Password Provider 활성화
- `myjun090-spec.github.io` + `localhost`를 authorized domains에 추가
- 모든 결과 검증

---

## 단계 2 — Blaze 업그레이드 (Storage + Functions 필요할 때)

🔗 https://console.firebase.google.com/project/vibemoji-app/usage/details

**[Modify plan]** → Blaze 선택 → 결제 수단 등록.

PRD 기준 비용 시뮬:
- 0–100 사용자 (베타): $50–100/월
- 100–1,000 사용자 (런칭): $1,500–2,500/월 (대부분 Nano Banana 호출비)

권장: **예산 알림** $50/월 시점에 이메일 알림 설정 (Cloud Billing → Budgets).

### Blaze 등록 후 자동 처리

```bash
# Storage 버킷 자동 생성 + 룰 배포
node scripts/setup-firebase.mjs vibemoji-app myjun090-spec.github.io
firebase deploy --only storage --project vibemoji-app

# Functions 배포 (GEMINI_API_KEY 필요 — 단계 3)
firebase deploy --only functions --project vibemoji-app
```

---

## 단계 3 — GEMINI_API_KEY 발급 + 설정

🔗 https://aistudio.google.com/apikey 에서 키 발급.

```bash
# 별도 터미널 (Claude Code의 ! 프리픽스는 비대화형이라 못 함)
firebase functions:secrets:set GEMINI_API_KEY --project vibemoji-app
# 프롬프트에 키 붙여넣기 → Enter
```

배포되는 4개 함수:
- `onUserCreate` — 회원가입 시 50 크레딧 자동 지급
- `generateSeedCharacter` — 자연어 → 시드 1장 (5💎)
- `generateStickerSet` — 시드 + 32 감정 → 32장 (100💎)
- `processStickerVariants` — Storage 트리거 → 4 플랫폼 사이즈 자동 변환
- `packagePlatform` — 플랫폼별 ZIP + Signed URL

---

## 검증 — `/debug/`

배포 완료 후:

1. https://myjun090-spec.github.io/emoticon/auth/ 회원가입
2. https://myjun090-spec.github.io/emoticon/debug/ 자동 헬스체크 7개 모두 ✓ 확인

| 검사 | 통과 의미 |
|------|----------|
| 환경변수 | NEXT_PUBLIC_FIREBASE_* 빌드 주입 |
| Firebase App | SDK 초기화 |
| Auth | 로그인 세션 인식 |
| Firestore 읽기 | 룰 통과 |
| Firestore 쓰기 | users/{uid}/projects 쓰기 |
| Storage | profile 폴더 업로드 |
| Functions 핑 | callable 통신 (unauth는 통신 자체는 정상) |

---

## 진행 상황

| 단계 | 상태 |
|------|------|
| 코드 (Auth, Firestore, Storage 클라이언트, Functions, UI 10페이지, 디버그, 평가 하네스) | ✅ |
| Firestore 룰 + 인덱스 라이브 배포 | ✅ |
| GH Pages 자동 배포 + Firebase env 주입 | ✅ |
| Identity Toolkit + Firebase Storage API 활성화 | ✅ |
| **Authentication "Get Started" (1클릭)** | ⏳ |
| Email/Password + Authorized domain | ⏳ (위 1클릭 후 자동) |
| Blaze 업그레이드 | ⏳ (Storage/Functions 필요 시) |
| GEMINI_API_KEY 발급 + Functions 배포 | ⏳ |

**남은 시간 추정: 1클릭 30초 + Blaze 5분 + 배포 5분 = 약 10분**
