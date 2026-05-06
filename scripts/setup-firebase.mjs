#!/usr/bin/env node
/**
 * Firebase 콘솔 자동 셋업 — REST API로 다음 3가지 처리:
 *   1. Email/Password Auth Provider 활성화
 *   2. Authorized domain (myjun090-spec.github.io) 추가
 *   3. 기본 Storage 버킷 활성화
 *
 * Firebase CLI가 보관한 OAuth 토큰을 그대로 사용 (별도 인증 불필요).
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = process.argv[2] || "vibemoji-app";
const EXTRA_DOMAIN = process.argv[3] || "myjun090-spec.github.io";

function loadAccessToken() {
  const cfgPath = join(homedir(), ".config/configstore/firebase-tools.json");
  const raw = readFileSync(cfgPath, "utf8");
  const cfg = JSON.parse(raw);
  const t = cfg.tokens;
  if (!t?.access_token) throw new Error("firebase-tools에 access_token이 없어요");
  if (t.expires_at && Date.now() > t.expires_at - 60_000) {
    throw new Error("access_token 만료. 'firebase login --reauth' 필요");
  }
  return t.access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function enableApi(token, projectNumber, serviceName) {
  console.log(`   - ${serviceName} 활성화 시도...`);
  try {
    await api(
      token,
      "POST",
      `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${serviceName}:enable`,
      {}
    );
    console.log(`     ✓ ${serviceName}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already") || msg.includes("ENABLED")) {
      console.log(`     ✓ 이미 활성화됨`);
    } else {
      console.log(`     ⚠ ${msg}`);
    }
  }
}

async function getProjectNumber(token, projectId) {
  const proj = await api(
    token,
    "GET",
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}`
  );
  return proj.projectNumber;
}

async function setupAuth(token) {
  console.log("\n[1] Identity Toolkit config 조회/초기화...");
  const tryGet = async () =>
    api(
      token,
      "GET",
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`
    );
  let cfg;
  try {
    cfg = await tryGet();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("CONFIGURATION_NOT_FOUND")) {
      console.log("   - 미초기화 → :initializeAuth 호출 시도");
      try {
        await api(
          token,
          "POST",
          `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth`,
          {}
        );
        await new Promise((r) => setTimeout(r, 4000));
        cfg = await tryGet();
      } catch (initErr) {
        const m2 = initErr instanceof Error ? initErr.message : String(initErr);
        if (m2.includes("BILLING_NOT_ENABLED")) {
          console.log("   ⚠ Auth API 초기화는 Blaze 또는 콘솔 1클릭 필요");
          console.log("   → 콘솔: https://console.firebase.google.com/project/" + PROJECT_ID + "/authentication");
          console.log("     [Get started] 클릭 → 그 다음 이 스크립트 재실행");
          return false;
        }
        throw initErr;
      }
    } else {
      throw err;
    }
  }

  console.log(`   - 현재 authorizedDomains: ${(cfg.authorizedDomains ?? []).join(", ")}`);
  console.log(`   - email enabled: ${cfg.signIn?.email?.enabled ?? false}`);

  const newDomains = Array.from(
    new Set([...(cfg.authorizedDomains ?? []), EXTRA_DOMAIN, "localhost"])
  );
  console.log("\n[2] Email/Password 활성화 + 도메인 패치...");
  await api(
    token,
    "PATCH",
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email,signIn.anonymous,authorizedDomains`,
    {
      signIn: {
        email: { enabled: true, passwordRequired: true },
        anonymous: { enabled: false },
      },
      authorizedDomains: newDomains,
    }
  );
  console.log(`   ✓ email enabled, authorizedDomains: ${newDomains.join(", ")}`);
  return true;
}

async function setupStorage(token) {
  console.log("\n[3] Storage 기본 버킷 활성화 시도...");
  try {
    await api(
      token,
      "POST",
      `https://firebasestorage.googleapis.com/v1beta/projects/${PROJECT_ID}/defaultBucket`,
      {}
    );
    console.log("   ✓ defaultBucket 활성화 완료");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists") || msg.includes("ALREADY_EXISTS")) {
      console.log("   ✓ 이미 활성화됨");
      return true;
    }
    if (msg.includes("BILLING_NOT_ENABLED") || msg.includes("billing")) {
      console.log("   ⚠ Storage도 무료 티어로 가능하지만 콘솔 1클릭 필요할 수 있음");
      console.log("   → 콘솔: https://console.firebase.google.com/project/" + PROJECT_ID + "/storage");
      return false;
    }
    console.log(`   ⚠ ${msg}`);
    return false;
  }
}

async function main() {
  const token = loadAccessToken();
  console.log(`✓ 토큰 로드 (project=${PROJECT_ID})`);

  console.log("\n[0] 필수 API 활성화...");
  const projectNumber = await getProjectNumber(token, PROJECT_ID);
  console.log(`   - projectNumber: ${projectNumber}`);
  await enableApi(token, projectNumber, "identitytoolkit.googleapis.com");
  await enableApi(token, projectNumber, "firebasestorage.googleapis.com");
  await new Promise((r) => setTimeout(r, 3000));

  const authOk = await setupAuth(token);
  const storageOk = await setupStorage(token);

  console.log("\n──────────────────────────────");
  console.log(authOk ? "✅ Auth 자동화 완료" : "🟡 Auth 미완료 (콘솔 1클릭 필요)");
  console.log(storageOk ? "✅ Storage 자동화 완료" : "🟡 Storage 미완료");
  console.log("──────────────────────────────");
  if (authOk && storageOk) {
    console.log("다음: firebase deploy --only storage --project " + PROJECT_ID);
  }
}


main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
