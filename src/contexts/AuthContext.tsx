"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ProductOffer, PublicUser, UserAddress } from "@/lib/types";
import { zipOnlyAddress } from "@/lib/location/zip-only";
import { savePreferences } from "@/lib/storage";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    password: string;
    name: string;
    zipCode: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateAddress: (address: UserAddress) => Promise<void>;
  syncSavedOffers: (offers: ProductOffer[]) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUserToLocal = useCallback((u: PublicUser | null) => {
    if (!u) return;
    savePreferences({
      zipCode: u.address.zipCode,
      locationSet: true,
      organicPreferred: u.preferences.organicPreferred,
    });
    localStorage.setItem("homivion-zip", u.address.zipCode);
    localStorage.setItem("homivion-saved-offers", JSON.stringify(u.savedOffers));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      setUser(data.user ?? null);
      applyUserToLocal(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyUserToLocal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    setUser(data.user);
    applyUserToLocal(data.user);
  };

  const signup = async (signupData: {
    email: string;
    password: string;
    name: string;
    zipCode: string;
  }) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: signupData.email,
        password: signupData.password,
        name: signupData.name,
        address: zipOnlyAddress(signupData.zipCode),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Signup failed");
    setUser(data.user);
    applyUserToLocal(data.user);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  const updateAddress = async (address: UserAddress) => {
    const zipOnly = zipOnlyAddress(address.zipCode, address.label);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ address: zipOnly }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save address");
    setUser(data.user);
    applyUserToLocal(data.user);
  };

  const syncSavedOffers = async (offers: ProductOffer[]) => {
    if (!user) {
      localStorage.setItem("homivion-saved-offers", JSON.stringify(offers));
      return;
    }
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ savedOffers: offers }),
    });
    const data = await res.json();
    if (res.ok) setUser(data.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refresh,
        login,
        signup,
        logout,
        updateAddress,
        syncSavedOffers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
