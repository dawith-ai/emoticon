import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 — VibeMoji",
  description: "VibeMoji 서비스 이용에 관한 약관입니다.",
};

export default function TermsPage() {
  return (
    <article className="prose mx-auto max-w-3xl px-2 py-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">이용약관</h1>
      <p className="text-base-content/60">시행일: 2026-05-07</p>

      <h2 className="mt-6 text-xl font-bold">제1조 (목적)</h2>
      <p>
        본 약관은 주식회사 VibeMoji(이하 “회사”)가 제공하는 AI 캐릭터·스티커 생성 및
        멀티 플랫폼 패키징 서비스(이하 “서비스”)의 이용 조건과 절차를 정함을 목적으로 합니다.
      </p>

      <h2 className="mt-6 text-xl font-bold">제2조 (회원가입 및 계정)</h2>
      <ol className="list-decimal pl-5">
        <li>회원은 만 14세 이상이어야 가입할 수 있습니다.</li>
        <li>회원은 자신의 계정 정보를 안전하게 관리할 책임이 있으며, 타인에게 양도·대여할 수 없습니다.</li>
        <li>회사는 부정 가입·계정 도용 등이 의심되는 경우 사전 통지 없이 이용을 제한할 수 있습니다.</li>
      </ol>

      <h2 className="mt-6 text-xl font-bold">제3조 (크레딧과 결제)</h2>
      <ol className="list-decimal pl-5">
        <li>회원가입 시 무료 크레딧 50개가 자동 지급됩니다.</li>
        <li>유료 크레딧은 충전일로부터 12개월 이내 사용해야 하며, 미사용 분은 자동 소멸됩니다.</li>
        <li>결제 후 7일 이내·미사용 크레딧에 한해 환불이 가능합니다 (전자상거래법 제17조).</li>
        <li>크레딧 부정 사용·시스템 오류로 인한 차감은 회사가 즉시 환원합니다.</li>
      </ol>

      <h2 className="mt-6 text-xl font-bold">제4조 (저작권 및 AI 생성물)</h2>
      <ol className="list-decimal pl-5">
        <li>
          회원이 입력한 프롬프트·업로드 이미지의 저작권은 회원에게 있으며, 회원은 회사가 서비스를
          제공·개선하기 위해 필요한 범위 내에서 이용·저장·전송하는 것에 동의합니다.
        </li>
        <li>
          AI가 생성한 결과물의 권리는 회원에게 귀속되나, 다음 행위는 금지됩니다:
          <ul className="list-disc pl-5">
            <li>타인의 저작권·상표권·퍼블리시티권을 침해하는 캐릭터 생성</li>
            <li>외설·폭력·차별·혐오·아동학대 등 공서양속에 반하는 콘텐츠 생성</li>
            <li>특정 인물·공인을 본인 동의 없이 묘사</li>
          </ul>
        </li>
        <li>
          외부 플랫폼(카카오 이모티콘, OGQ, LINE, Etsy 등) 제출 시, 해당 플랫폼의 약관과 AI 생성물
          정책을 회원이 직접 확인하고 책임을 부담합니다.
        </li>
      </ol>

      <h2 className="mt-6 text-xl function-bold">제5조 (서비스 변경·중단)</h2>
      <p>
        회사는 운영·기술적 사유로 서비스의 일부 또는 전부를 변경·중단할 수 있으며, 사전 공지를
        원칙으로 하되 긴급한 경우 사후 공지할 수 있습니다.
      </p>

      <h2 className="mt-6 text-xl font-bold">제6조 (책임 제한)</h2>
      <ul className="list-disc pl-5">
        <li>회사는 AI 생성물의 정확성·심사 통과 여부에 대해 보장하지 않습니다.</li>
        <li>천재지변, 전기·통신 장애, 외부 API 장애 등 회사 귀책 외 사유로 인한 손해는 면책됩니다.</li>
      </ul>

      <h2 className="mt-6 text-xl font-bold">제7조 (분쟁 해결)</h2>
      <p>
        본 약관과 서비스 이용에 관한 분쟁은 대한민국 법을 준거법으로 하며, 서울중앙지방법원을
        제1심 관할 법원으로 합니다.
      </p>

      <h2 className="mt-6 text-xl font-bold">제8조 (문의)</h2>
      <p>support@vibemoji.app</p>
    </article>
  );
}
