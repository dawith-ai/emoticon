"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export function AuthStatus() {
  const { configured, loading, user, profile, credits, logOut } = useAuth();

  if (!configured) {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-warning badge-outline">Firebase env 필요</span>
        <Link href="/auth" className="btn btn-primary btn-sm">
          설정
        </Link>
      </div>
    );
  }

  if (loading) return <span className="loading loading-spinner loading-sm" />;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-primary badge-outline gap-1">
          <span>💎</span>
          <span>50</span>
        </span>
        <Link href="/auth" className="btn btn-primary btn-sm">
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="badge badge-primary badge-outline gap-1">
        <span>💎</span>
        <span>{credits}</span>
      </span>
      <span className="hidden max-w-32 truncate text-xs text-base-content/70 md:inline">
        {profile?.displayName || user.email}
      </span>
      <button onClick={logOut} className="btn btn-ghost btn-sm">
        로그아웃
      </button>
    </div>
  );
}
