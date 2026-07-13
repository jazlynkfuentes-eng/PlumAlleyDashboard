"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlumAlleyLogo } from "@/components/plum-alley-logo";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid credentials");
      return;
    }
    router.push(params.get("callbackUrl") || "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 w-full max-w-sm space-y-4">
      <label className="block text-sm">
        <span className="text-[var(--grey)]">Email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue="owner@plumaalley.com"
          className="mt-1 w-full border border-[var(--border-strong)] bg-[var(--white)] px-3 py-3 outline-none focus:border-[var(--black)]"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--grey)]">Password</span>
        <input
          name="password"
          type="password"
          required
          className="mt-1 w-full border border-[var(--border-strong)] bg-[var(--white)] px-3 py-3 outline-none focus:border-[var(--black)]"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[var(--black)] py-3 text-[var(--white)] disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--white)] px-6">
      <PlumAlleyLogo size="lg" />
      <p className="mt-3 text-[var(--grey)]">Private portfolio intelligence</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
