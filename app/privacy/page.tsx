import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 — VibeMoji",
  description: "VibeMoji가 수집·이용하는 개인정보 항목과 보호 정책입니다.",
};

export default function PrivacyPage() {
  return (
    <article className="prose mx-auto max-w-3xl px-2 py-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="text-base-content/60">최종 개정일: 2026-05-07</p>

      <p>
        주식회사 VibeMoji(이하 “회사”)는 「개인정보 보호법」 등 관련 법령을 준수하며,
        이용자의 개인정보를 안전하게 처리하기 위해 본 개인정보처리방침을 운영합니다.
      </p>

      <h2 className="mt-6 text-xl font-bold">1. 수집하는 개인정보 항목</h2>
      <ul className="list-disc pl-5">
        <li><b>회원가입</b>: 이메일, 비밀번호(해시), 닉네임, 프로필 이미지(선택)</li>
        <li><b>서비스 이용</b>: 생성한 캐릭터 프롬프트, 업로드 이미지, 크레딧 거래 내역</li>
        <li><b>자동 수집</b>: IP 주소, 브라우저 종류, 접속 일시, 쿠키 (분석 동의 시)</li>
        <li><b>결제 정보</b>: 결제 대행사(Toss Payments)가 처리하며 회사는 카드 번호 등을 저장하지 않습니다.</li>
      </ul>

      <h2 className="mt-6 text-xl font-bold">2. 수집·이용 목적</h2>
      <ul className="list-disc pl-5">
        <li>회원 식별 및 본인 확인, 부정이용 방지</li>
        <li>AI 캐릭터·스티커 생성 및 결과물 저장·다운로드</li>
        <li>크레딧 차감/환불 등 유료 서비스 제공</li>
        <li>고객 문의 응대, 공지사항 발송</li>
        <li>서비스 개선을 위한 통계 분석 (식별 정보 제거 후 활용)</li>
      </ul>

      <h2 className="mt-6 text-xl font-bold">3. 보유 및 이용 기간</h2>
      <ul className="list-disc pl-5">
        <li>회원 탈퇴 시 즉시 파기 (단, 「전자상거래법」에 따라 거래 기록은 5년 보관)</li>
        <li>크레딧 거래 내역: 5년 (전자상거래법 제6조)</li>
        <li>로그인 기록: 3개월 (통신비밀보호법 제15조의2)</li>
      </ul>

      <h2 className="mt-6 text-xl font-bold">4. 위탁 처리 및 제3자 제공</h2>
      <table className="table-zebra mt-2 w-full text-xs">
        <thead>
          <tr><th>수탁업체</th><th>위탁 업무</th><th>국가</th></tr>
        </thead>
        <tbody>
          <tr><td>Google LLC (Firebase)</td><td>인증/DB/스토리지/Functions</td><td>미국</td></tr>
          <tr><td>Google LLC (Gemini API)</td><td>AI 이미지 생성 (프롬프트 전송)</td><td>미국</td></tr>
          <tr><td>Toss Payments</td><td>결제 처리</td><td>대한민국</td></tr>
          <tr><td>PostHog</td><td>익명 사용 통계 (분석 동의 시)</td><td>미국</td></tr>
          <tr><td>Sentry</td><td>오류 추적 (식별 정보 제외)</td><td>미국</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-base-content/60">
        AI 모델 제공자(Gemini)에 전송된 프롬프트는 Google의 정책에 따라 처리되며, 회사는 사용자가
        동의한 범위 외 학습 데이터로 사용되지 않도록 옵트아웃 옵션을 활성화합니다.
      </p>

      <h2 className="mt-6 text-xl font-bold">5. 이용자의 권리</h2>
      <ul className="list-disc pl-5">
        <li>언제든지 본인 정보 열람·수정·삭제·처리 정지를 요구할 수 있습니다.</li>
        <li>회원 탈퇴는 [설정] 메뉴 또는 dpo@vibemoji.app 으로 요청해 주세요.</li>
      </ul>

      <h2 className="mt-6 text-xl font-bold">6. 안전 조치</h2>
      <ul className="list-disc pl-5">
        <li>비밀번호 해시(Firebase Auth) 저장</li>
        <li>모든 통신 HTTPS 암호화</li>
        <li>Firestore/Storage 보안 룰로 본인 데이터만 접근 허용</li>
        <li>최소 권한 원칙에 따른 직원 접근 통제</li>
      </ul>

      <h2 className="mt-6 text-xl font-bold">7. 개인정보 보호책임자</h2>
      <p>
        성명: 김다윗 · 이메일: dpo@vibemoji.app · 본 정책은 변경 시 사이트 공지를 통해 7일 전 안내합니다.
      </p>
    </article>
  );
}
