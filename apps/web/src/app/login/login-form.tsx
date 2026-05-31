"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Mode = "sign-in" | "sign-up";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setMessage("");
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const supabase = createClient();

    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`
            }
          });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm the account, then sign in.");
      return;
    }

    startTransition(() => {
      router.push(searchParams.get("next") || "/dashboard");
      router.refresh();
    });
  }

  return (
    <form className="auth-form" action={handleSubmit}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required />
      </div>

      {message ? <p className={`status ${message.includes("Check your email") ? "" : "error"}`}>{message}</p> : null}

      <button className="primary" type="submit" disabled={isPending}>
        {isPending ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>

      <button
        className="secondary"
        type="button"
        onClick={() => {
          setMessage("");
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
      >
        {mode === "sign-in" ? "Create a local test account" : "Use an existing account"}
      </button>
    </form>
  );
}
