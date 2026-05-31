"use client";

import { createClient } from "@/lib/supabase/browser";
import { getPublicEnv } from "@/lib/env";

export type ApiResult<T> = T & {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const supabase = createClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You are not signed in.");
  }

  const { apiUrl } = getPublicEnv();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {})
    }
  });

  const data = (await response.json()) as ApiResult<T>;
  if (!response.ok || data.success === false) {
    throw new Error(data.error?.message || `API request failed: ${response.status}`);
  }
  return data;
}
