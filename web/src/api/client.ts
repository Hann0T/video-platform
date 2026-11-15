/**
 * API client for the backend. Unwraps the { data, error } envelope, attaches
 * the Bearer token, and retries once after a token refresh on 401.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const STORAGE_KEY = "vidstream.tokens";

export type User = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};
export type UserWithPermissions = User & { permissions: string[] };

export type Video = {
  id: string;
  title: string;
  description: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

type Tokens = { accessToken: string; refreshToken: string };

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function loadTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}
function saveTokens(t: Tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}
export function clearTokens() {
  localStorage.removeItem(STORAGE_KEY);
}
export function hasTokens(): boolean {
  return loadTokens() !== null;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retried?: boolean;
};

type Envelope<T> = {
  data: T;
  error: { code?: string; message?: string; details?: unknown } | null;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, retried = false } = opts;
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (auth) {
    const t = loadTokens();
    if (t) headers.Authorization = `Bearer ${t.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(BASE_URL + path, { method, headers, body: payload });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      `Cannot reach the server at ${BASE_URL}. Is the backend running?`,
      0,
    );
  }

  if (res.status === 401 && auth && !retried && loadTokens()) {
    if (await tryRefresh()) return request<T>(path, { ...opts, retried: true });
  }

  let json: Envelope<T> | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || json?.error) {
    const e = json?.error ?? {};
    throw new ApiError(
      e.code ?? "UNKNOWN",
      e.message ?? `Request failed (${res.status})`,
      res.status,
      e.details,
    );
  }
  return json?.data as T;
}

// Share one in-flight refresh so parallel 401s don't rotate the token twice.
let refreshing: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const t = loadTokens();
    if (!t) return false;
    try {
      const next = await request<Tokens>("/auth/refresh", {
        method: "POST",
        auth: false,
        body: { refreshToken: t.refreshToken },
      });
      saveTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      return true;
    } catch {
      clearTokens();
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export const api = {
  register: (email: string, password: string) =>
    request<User>("/auth/register", { method: "POST", auth: false, body: { email, password } }),

  async login(email: string, password: string) {
    const data = await request<{ user: User } & Tokens>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  },

  async logout() {
    const t = loadTokens();
    if (t) {
      try {
        await request("/auth/logout", {
          method: "POST",
          auth: false,
          body: { refreshToken: t.refreshToken },
        });
      } catch {
        /* local logout must always succeed */
      }
    }
    clearTokens();
  },

  me: () => request<UserWithPermissions>("/auth/me"),

  uploadVideo(input: { file: File; title: string; description?: string }) {
    const form = new FormData();
    // Text fields first so multer has parsed them before the file stream.
    form.append("title", input.title);
    if (input.description) form.append("description", input.description);
    form.append("video", input.file);
    return request<Video>("/videos", { method: "POST", body: form });
  },
};
