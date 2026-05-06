# VibeMoji 발행 마지막 5% 체크리스트

> 코드는 모두 깔려 있고, GH Pages에 라이브 배포돼있어요.  
> **이제 Firebase 콘솔에서 4가지 클릭 + 1가지 결제 수단 등록**만 하면 실호출까지 동작해요.

라이브: https://myjun090-spec.github.io/emoticon/  
디버그: https://myjun090-spec.github.io/emoticon/debug/ (로그인 후 자동 헬스체크)

---

## ① Authentication → Email/Password 활성화

[Firebase Auth Sign-in method](https://console.firebase.google.com/project/vibemoji-app/authentication/providers)
1. **Get started** 버튼 클릭
2. **Email/Password** 행 → 활성화 토글 ON → 저장

---

## ② Authentication → Authorized domains 추가

[Firebase Auth Settings](https://console.firebase.google.com/project/vibemoji-app/authentication/settings)
1. Authorized domains 탭
2. **Add domain** → `myjun090-spec.github.io` 추가
3. (선택) 커스텀 도메인 사용 시 같은 곳에 추가

> 미설정 시 GH Pages 도메인에서 로그인 시 `auth/unauthorized-domain` 에러 발생

---

## ③ Storage → Get started

[Firebase Storage](https://console.firebase.google.com/project/vibemoji-app/storage)
1. **Get started** 클릭
2. 기본 보안 룰 안내 → 다음
3. 위치 → `asia-northeast3` (서울) 선택 → 완료
4. 끝나면 터미널에서 우리 룰 배포:
   ```bash
   firebase deploy --only storage --project vibemoji-app
   ```

---

## ④ Blaze 플랜 업그레이드 (Functions 배포 필수)

[Project Usage Details](https://console.firebase.google.com/project/vibemoji-app/usage/details)
1. **Modify plan** → Blaze 선택
2. 결제 수단 등록 (Cloud Billing 계정 연결)
3. 예상 비용: 1,000 사용자/월 ≈ $1,300 (대부분 Nano Banana 호출비, PRD 비용 시뮬 참고)
4. (권장) **예산 알림** 설정: $50/월 시점에 이메일 알림

> Blaze가 아니면 `cloudfunctions.googleapis.com` API 활성화 자체가 막혀요.

---

## ⑤ GEMINI_API_KEY 등록 + Functions 배포

[Google AI Studio](https://aistudio.google.com/apikey)에서 키 발급 후:

```bash
# 별도 터미널에서 (interactive):
firebase functions:secrets:set GEMINI_API_KEY --project vibemoji-app
# → 키 입력 → Enter

# 그리고 Functions 배포
cd /Users/dawith/emoticon
firebase deploy --only functions --project vibemoji-app
```

배포되는 4개 함수:
- `onUserCreate` (Auth 트리거): 회원가입 시 50 크레딧 자동 지급
- `generateSeedCharacter` (Callable): 자연어 → 시드 1장 (5💎)
- `generateStickerSet` (Callable): 시드 + 32 감정 → 32장 (100💎)
- `processStickerVariants` (Storage 트리거): raw PNG 업로드 시 4 플랫폼 사이즈 자동 변환
- `packagePlatform` (Callable): 플랫폼별 ZIP 생성 + Signed URL

---

## ⑥ 검증 — /debug/ 자동 헬스체크

배포 완료 후 https://myjun090-spec.github.io/emoticon/auth/ 에서 회원가입.  
그 다음 https://myjun090-spec.github.io/emoticon/debug/ 방문 — 7개 검사 모두 ✓ 떨어지면 발행 준비 끝.

| 검사 | 통과 의미 |
|------|----------|
| 환경변수 | NEXT_PUBLIC_FIREBASE_* 빌드 주입 OK |
| Firebase App | SDK 초기화 OK |
| Auth | 로그인 세션 인식 OK |
| Firestore 읽기 | users/{uid} 또는 platforms 읽기 OK (룰 통과) |
| Firestore 쓰기 | users/{uid}/projects 임시 생성 후 삭제 OK |
| Storage | profile 폴더에 ping 업로드 + 다운로드 URL OK |
| Functions 핑 | callable 통신 OK (unauth 코드도 통신 자체는 정상) |

---

## ⑦ (선택) 결제 통합 — Toss Payments

베타 1차 100명은 무료 크레딧만으로 운영 가능. 본격 유료 전환은 P1.

- [Toss Payments 가입](https://www.tosspayments.com/) → 사업자/개인 셀러 등록
- `lib/toss/` 통합 (별도 작업)
- Cloud Function `chargeCredits` 추가 (서버 검증 후 크레딧 적립)

---

## 진행 상황 요약

| 단계 | 상태 |
|------|------|
| 코드 작성 (Auth, Firestore, Storage 클라이언트, Functions, UI 9페이지, 디버그) | ✅ |
| Firestore 룰 + 인덱스 라이브 배포 | ✅ |
| GH Pages 자동 배포 + Firebase env 주입 | ✅ |
| Email/Password Provider 활성화 | ⏳ 콘솔 1클릭 |
| Authorized domain 추가 | ⏳ 콘솔 1클릭 |
| Storage 초기화 + 룰 배포 | ⏳ 콘솔 1클릭 + CLI 1줄 |
| Blaze 업그레이드 | ⏳ 결제수단 등록 |
| GEMINI_API_KEY 등록 + Functions 배포 | ⏳ CLI 2줄 |
| /debug 7/7 통과 | ⏳ 위 단계 후 자동 |

**남은 시간 추정: 15-20분 (Blaze 등록 포함)**
