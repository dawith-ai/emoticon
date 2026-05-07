import Link from "next/link";
import type { Metadata } from "next";
import { ResourceSubmissionForm } from "@/components/ResourceSubmissionForm";

export const metadata: Metadata = {
  title: "외부 자료 큐레이션 — VibeMoji",
  description:
    "이모티콘 작가 커뮤니티에서 공유된 표정 가이드, 도장 브러시, 자세 브러시, 합격 캔버스 세팅 PDF를 한 자리에서 모아 봅니다.",
};

type ResourceLink = {
  label: string;
  url: string;
  kind: "drive-folder" | "drive-file" | "external" | "internal";
  size?: string;
};

type Resource = {
  id: string;
  emoji: string;
  title: string;
  source: string;
  description: string;
  takeaway: string;
  links: ResourceLink[];
};

const RESOURCES: Resource[] = [
  {
    id: "expression-guide",
    emoji: "😊",
    title: "AI 활용 이모티콘 가이드 템플릿 9종",
    source: "동동 작가 공유",
    description:
      "‘활용 도장 브러쉬 모음 + AI 활용 동작 3종 + AI 활용 표정 3종 + AI 활용 효과 3종’으로 구성된 1080×1080 투명 PNG 세트. 자세 9종 폴더에 들어있는 사용법 PDF도 같은 파일이에요.",
    takeaway:
      "권장 워크플로: 가이드 PNG를 트레이스로 올려 **레이어 불투명도 30%** 로 깔고, 그 위 새 레이어에 캐릭터를 입히기. 우리 에디터의 ‘📷 사진 트레이스’ 슬라이더가 같은 역할을 합니다.",
    links: [
      {
        label: "표정 가이드 폴더 (PDF + PNG 9개)",
        url: "https://drive.google.com/drive/folders/1hjfjXn471tlx_74tB_PT1y22o8FEkVD3",
        kind: "drive-folder",
      },
      {
        label: "자세 9종 브러시 폴더 (똥손도 5분 치트키)",
        url: "https://drive.google.com/drive/folders/1haHO6BAVaxQoA-6o5vn8YpXMgP6WWbLZ?usp=drive_link",
        kind: "drive-folder",
      },
    ],
  },
  {
    id: "stamp-brushes",
    emoji: "🪨",
    title: "내 캐릭터로 도장 브러시 만들기",
    source: "동동 작가 공유",
    description:
      "Procreate brushset 3종(일체형 / 사족보행형 / 기본형) + 12페이지 제작 PDF. 캐릭터 실루엣을 도장처럼 찍는 워크플로의 출발점.",
    takeaway:
      "4단계 워크플로: ① 1080×1080 캔버스에 가이드 30% 불투명도 → 캐릭터 그리기 → 배경 있는 PNG 저장 ② 기존 도장 브러시를 왼쪽 드래그로 복제 ③ 브러시 스튜디오 → ‘모양’ → ‘가져오기’로 캐릭터 PNG 등록(자동 흑백) ④ 완성된 개인 도장 브러시로 비율·구도 잡기",
    links: [
      {
        label: "도장 브러시 폴더 (brushset + PDF)",
        url: "https://drive.google.com/drive/folders/1Z8OqHO2hwg6XyovtMIAtpqZy-gwLha-M",
        kind: "drive-folder",
        size: "약 2MB",
      },
    ],
  },
  {
    id: "canvas-setup",
    emoji: "🖼️",
    title: "이모티콘 합격 캔버스 세팅법",
    source: "동동 작가 공유",
    description:
      "5개 메신저 플랫폼(카카오 4종 / OGQ / 밴드 / 라인 / 비트윈)의 제안 사이즈·장수를 한 장의 PDF로 정리. 가이드/도장 PDF에서는 작업 캔버스를 일괄 1080×1080 px @ 72dpi로 추천해요.",
    takeaway:
      "권장 작업 흐름: **1080×1080 px @ 72dpi 캔버스에서 그린 뒤, VibeMoji 사이즈 변환기로 카카오 360, OGQ 740×640, LINE 370×320 등 한 번에 자동 변환.** 동동 작가 라이브러리에는 ‘필수 동작 가이드 101종’ 같은 추가 자료도 있다고 PDF에 표시되어 있어요.",
    links: [
      {
        label: "캔버스 세팅 PDF",
        url: "https://drive.google.com/file/d/1Ue3aIazsLkoD99k2dgZJ0w27r4N3PK3q/view?usp=drivesdk",
        kind: "drive-file",
      },
      {
        label: "VibeMoji 사이즈 변환기 (1080→플랫폼 일괄)",
        url: "/tools/resize",
        kind: "internal",
      },
    ],
  },
  {
    id: "outline-tool",
    emoji: "🎨",
    title: "흰색 테두리 생성기 (오리지널)",
    source: "동동 작가 공유",
    description:
      "이 기능은 우리도 자체 구현해 가지고 있어요(/tools/outline). 거리 변환 기반이라 큰 이미지에서도 빠르고, 색·영역·미리보기 배경을 모두 조절할 수 있어요.",
    takeaway: "원본 도구가 익숙하다면 그대로 쓰셔도 되고, 우리 버전은 다중 색 + 영역 지정 + 알파 안티앨리어싱이 추가돼 있어요.",
    links: [
      {
        label: "원본 도구 (동동작가)",
        url: "https://png-outline-five.vercel.app/",
        kind: "external",
      },
      {
        label: "VibeMoji 빌트인 도구",
        url: "/tools/outline",
        kind: "internal",
      },
    ],
  },
  {
    id: "resize-tool",
    emoji: "📐",
    title: "이모티콘 사이즈 변환기 (오리지널)",
    source: "동동 작가 공유",
    description:
      "원본은 카카오·OGQ·라인 3개 플랫폼을 지원해요. VibeMoji 버전은 9개 플랫폼(카카오 360/큰 540/미니 180, OGQ 740, LINE 스티커·이모티콘, 비트윈 512, Etsy 1000, Redbubble, 미리캔버스) + 다중 파일 + ZIP 일괄 다운로드까지 지원.",
    takeaway:
      "한 장만 빠르게 변환할 땐 원본도 좋고, 32장 세트를 한 번에 여러 플랫폼으로 패키징할 땐 우리 버전이 편해요.",
    links: [
      {
        label: "원본 도구 (동동작가)",
        url: "https://dongdong-emoticon-size-converter.vercel.app/",
        kind: "external",
      },
      {
        label: "VibeMoji 빌트인 도구",
        url: "/tools/resize",
        kind: "internal",
      },
    ],
  },
];

const KIND_BADGE: Record<ResourceLink["kind"], { label: string; cls: string }> = {
  "drive-folder": { label: "Drive 폴더", cls: "badge-info" },
  "drive-file": { label: "Drive 파일", cls: "badge-info" },
  external: { label: "외부 링크", cls: "badge-ghost" },
  internal: { label: "VibeMoji", cls: "badge-primary" },
};

export default function ResourcesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">📚 외부 자료 큐레이션</h1>
        <p className="mt-2 text-base-content/70">
          작가 커뮤니티에서 공유된 좋은 보조 자료·도구를 모았어요. 원작자의
          링크를 그대로 안내합니다.
        </p>
        <div className="alert alert-warning mt-3 text-xs">
          ⏰ 일부 자료는 작가 분들의 한정 공유(72시간) 기간이 있을 수 있어요. 만료
          시 링크가 만료될 수 있으니 바로 다운로드해두는 걸 권장합니다.
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {RESOURCES.map((r) => (
          <article
            key={r.id}
            className="card border border-base-300 bg-base-100"
          >
            <div className="card-body p-5">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{r.emoji}</span>
                <div>
                  <h2 className="text-lg font-bold leading-tight">{r.title}</h2>
                  <p className="text-xs text-base-content/60">
                    출처: {r.source}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-sm text-base-content/80">
                {r.description}
              </p>
              <p className="rounded-md bg-base-200 p-2 text-xs">
                💡 <strong>VibeMoji와 함께 쓰는 법:</strong> {r.takeaway}
              </p>
              <div className="mt-2 space-y-1">
                {r.links.map((l) => {
                  const isInternal = l.url.startsWith("/");
                  const badge = KIND_BADGE[l.kind];
                  const className =
                    "btn btn-sm w-full justify-between " +
                    (isInternal ? "btn-primary" : "btn-outline");
                  const inner = (
                    <>
                      <span className="flex items-center gap-2">
                        <span
                          className={`badge badge-xs ${badge.cls} text-[9px]`}
                        >
                          {badge.label}
                        </span>
                        <span>{l.label}</span>
                      </span>
                      <span className="text-xs opacity-60">
                        {l.size ?? (isInternal ? "→" : "↗")}
                      </span>
                    </>
                  );
                  return isInternal ? (
                    <Link key={l.url} href={l.url} className={className}>
                      {inner}
                    </Link>
                  ) : (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {inner}
                    </a>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="card border border-dashed border-base-300 bg-base-100">
        <div className="card-body p-5">
          <ResourceSubmissionForm />
        </div>
      </div>
    </div>
  );
}
