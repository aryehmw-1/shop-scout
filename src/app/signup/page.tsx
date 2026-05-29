"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { loadAddress } from "@/lib/storage";
import { normalizeZip } from "@/lib/location/zip-only";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadAddress();
    if (saved?.zipCode) setZipCode(saved.zipCode);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup({ email, password, name, zipCode: normalizeZip(zipCode) });
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-1 justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-lg">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <h1 className="text-center text-2xl font-bold text-stone-900">
            Create your account
          </h1>
          <p className="mt-2 text-center text-sm text-stone-500">
            Save your ZIP and favorite deals across devices
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-stone-700">
                Password (6+ characters)
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>

            <label className="block border-t border-stone-100 pt-4">
              <span className="text-sm font-medium text-stone-700">ZIP code</span>
              <p className="text-xs text-stone-500">
                For shipping estimates only — no street address required
              </p>
              <input
                type="text"
                required
                inputMode="numeric"
                maxLength={5}
                value={zipCode}
                onChange={(e) => setZipCode(normalizeZip(e.target.value))}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 text-center text-lg font-semibold tracking-widest focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || zipCode.length !== 5}
              className="w-full rounded-2xl bg-sage-600 py-3.5 font-semibold text-white hover:bg-sage-700 disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-sage-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
