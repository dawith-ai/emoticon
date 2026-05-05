# 일관성 평가 하네스 (Consistency Evaluation Harness)

> 캐릭터 일관성은 VibeMoji의 가장 중요한 제품 신뢰 지표예요. 이 하네스는 모델이 시드 캐릭터를 32개 변형 전체에서 얼마나 일관되게 유지하는지 자동 평가합니다.

## 왜 필요한가

- 카카오 이모티콘 미승인의 가장 흔한 사유 1순위가 "캐릭터 일관성 부족"
- AI 모델은 같은 prompt에도 매번 미세하게 다른 결과를 내므로 정량 게이트 필수
- 모델 업데이트 / 프롬프트 수정 / LoRA 변경 시 회귀(regression) 즉시 탐지

## 4 layer 구조

```
evals/
├── datasets/         # YAML 캐릭터/감정 정의 (1번 레이어)
│   ├── characters.yaml      # 핑크 토끼, 회색 곰돌이, 주황 고양이, 보라 햄스터, 갈색 강아지 + adversarial 여우
│   └── emotions.yaml        # 32 슬롯 (안녕/고마워/사랑해/...)
├── runners/          # 모델 어댑터 (2번 레이어)
│   ├── mock.ts              # API 키 없이 하네스 검증용 (의도적 25% 실패 주입)
│   ├── nano-banana.ts       # Gemini 2.5 Flash Image 실제 호출
│   └── replicate-sdxl.ts    # P1 스텁 (정밀 모드 fallback)
├── metrics/          # 점수 계산 (3번 레이어)
│   ├── phash.ts             # 시각 구조 유사도 (32x32 그레이스케일 해시 + Hamming)
│   ├── color-histogram.ts   # 색상 분포 거리 (RGB 4-bin Bhattacharyya)
│   ├── llm-judge.ts         # Gemini Vision로 "같은 캐릭터인가" 1-5 점수
│   └── aggregate.ts         # 가중 평균 (0.5 / 0.3 / 0.2)
├── reporter/         # 리포트 생성 (4번 레이어)
│   ├── html.ts              # 그리드 + base64 임베드 단일 파일
│   └── markdown.ts          # CI PR 코멘트용
├── runner.ts         # 전체 파이프라인 오케스트레이션
├── cli.ts            # `npm run eval` 진입점
└── thresholds.ts     # 통과 기준
```

## 실행 방법

```bash
# Mock 빠른 검증 (API 키 불필요, ~10초)
npm run eval

# 결과 HTML 리포트 자동 오픈 (macOS)
open evals/runs/<run-id>/report.html

# Nano Banana 실제 호출 (1 캐릭터 4 슬롯만 = $0.20 정도)
GEMINI_API_KEY=xxx npm run eval -- \
  --generator nano-banana --characters pink-rabbit --slots 1,5,17,25

# 전체 캐릭터 (5개) × 32슬롯 = 160장 = $6.24 + LLM-judge $0.10
GEMINI_API_KEY=xxx npm run eval -- --generator nano-banana

# LLM-judge 25% 샘플링 (비용 절감)
GEMINI_API_KEY=xxx npm run eval -- \
  --generator nano-banana --llm-judge-rate 0.25

# Vitest 단위 테스트
npm run test
```

## 통과 기준 (thresholds.ts)

| 기준 | 값 | 의미 |
|------|----|----|
| `aggregate` | ≥ 0.80 | 변형 1장 합격선 |
| `characterMean` | ≥ 0.83 | 캐릭터 32장 평균 합격선 |
| `failureCountMax` | ≤ 4 | 캐릭터당 0.80 미만 변형 허용 (32장 중 12.5%) |
| `llmJudgeMin` | ≥ 0.75 | LLM-judge 평균 4점/5점 이상 |

전체 합격 = 모든 캐릭터가 위 4개 기준을 모두 통과 + 전체 평균 ≥ 0.80.

## 메트릭 가중치

```
aggregate = 0.5 × llm_judge + 0.3 × phash + 0.2 × color_histogram
```

LLM-judge 미실행 시 (API 키 없거나 sample rate 0):
```
aggregate = 0.6 × phash + 0.4 × color_histogram
```

## 비용 가이드

| 시나리오 | 호출 수 | 예상 비용 |
|---------|--------|----------|
| Mock smoke (CI) | 0 | $0 |
| 1 캐릭터 4 슬롯 검증 | 5 gen + 4 judge | $0.20 + $0.003 |
| 전체 5 캐릭터 32 슬롯 | 165 gen + 160 judge | $6.43 + $0.10 |
| 전체 + LLM-judge 25% 샘플 | 165 gen + 40 judge | $6.43 + $0.025 |
| Adversarial 여우 1개만 | 33 gen + 32 judge | $1.29 + $0.02 |

## 회귀 탐지 워크플로

1. **Baseline 저장**: 메인 브랜치에서 `npm run eval -- --generator nano-banana`로 기준 리포트 생성
2. **변경 후 비교**: 프롬프트/모델/LoRA 변경 시 다시 실행
3. **자동 비교**: `evals/runs/*/report.json`을 두 개 비교하는 diff 도구 (P1 추가 예정)

## 추가하기

### 새 캐릭터
`datasets/characters.yaml`에 항목 추가. `features` 배열은 LLM-judge가 위반 여부를 체크하는 명시적 정체성 항목이에요.

### 새 메트릭
`metrics/`에 함수 추가 → `runner.ts`의 `metrics.push()`에 호출 추가 → `aggregate.ts`의 `DEFAULT_WEIGHTS`에 가중치 추가.

### 새 모델 어댑터
`runners/`에 `Generator` 인터페이스 구현 → `cli.ts`의 `pickGenerator`에 등록.

## 알려진 한계

- **단순 pHash**: SSIM/LPIPS 같은 학습된 메트릭보다 약함. 향후 CLIP embedding 기반으로 교체 검토.
- **LLM-judge 일관성**: Gemini 자체 응답이 매번 미세하게 달라서 같은 평가도 ±0.1 점수 흔들림. seed 고정 또는 다회 평균 처리 필요 (P1).
- **adversarial 캐릭터 1개**: 더 다양한 실패 패턴 (텍스트 포함, 손가락 디테일, 의상 변경) 추가 필요.
