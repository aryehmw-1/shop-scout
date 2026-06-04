"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-lg">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <h1 className="text-center text-2xl font-bold text-stone-900">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-sm text-stone-500">
            Sign in to save your ZIP and deals
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
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
              <span className="text-sm font-medium text-stone-700">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
              />
            </label>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sage-600 py-3.5 font-semibold text-white hover:bg-sage-700 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-600">
            No account?{" "}
            <Link href="/signup" className="font-semibold text-sage-700 hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    
  );
}
