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

async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  const contentType = response.headers.get("content-type") || "unknown content type";
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`API request failed: ${response.status} ${response.statusText || "empty response"}`);
  }

  try {
    return JSON.parse(text) as ApiResult<T>;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      `API request failed: ${response.status} ${response.statusText || "invalid JSON response"} ` +
        `(${contentType}). Response body starts with: ${preview}`
    );
  }
}

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

  const data = await parseApiResponse<T>(response);
  if (!response.ok || data.success === false) {
    throw new Error(data.error?.message || `API request failed: ${response.status}`);
  }
  return data;
}
