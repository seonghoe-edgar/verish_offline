import axios from "axios";
import "dotenv/config";

const BASE_URL = "https://api.mash-board.io";
const ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
const REFRESH_SAFETY_MARGIN_MS = 30 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

interface TokenState {
  access: string;
  refresh: string;
  accessExpiresAt: number;
}

let tokenState: TokenState | null = null;

async function login(): Promise<TokenState> {
  const email = requiredEnv("MASH_EMAIL");
  const password = requiredEnv("MASH_PASSWORD");
  const res = await axios.post(`${BASE_URL}/api/token/`, { email, password });
  return {
    access: res.data.access,
    refresh: res.data.refresh,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenState> {
  const res = await axios.post(`${BASE_URL}/api/token/refresh/`, { refresh: refreshToken });
  return {
    access: res.data.access,
    refresh: res.data.refresh ?? refreshToken,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  };
}

async function getAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.accessExpiresAt - REFRESH_SAFETY_MARGIN_MS) {
    return tokenState.access;
  }
  if (tokenState) {
    try {
      tokenState = await refreshAccessToken(tokenState.refresh);
      return tokenState.access;
    } catch {
      tokenState = null;
    }
  }
  tokenState = await login();
  return tokenState.access;
}

export class MashApiError extends Error {
  constructor(public status: number | undefined, message: string, public body?: unknown) {
    super(message);
    this.name = "MashApiError";
  }
}

export async function mashRequest<T = unknown>(
  method: string,
  path: string,
  options: { params?: Record<string, unknown> } = {},
  isRetryAfterAuthFailure = false
): Promise<T> {
  const token = await getAccessToken();
  try {
    const res = await axios.request<T>({
      method,
      url: `${BASE_URL}${path}`,
      headers: { Authorization: `Bearer ${token}` },
      params: options.params,
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401 && !isRetryAfterAuthFailure) {
        tokenState = null;
        return mashRequest<T>(method, path, options, true);
      }
      throw new MashApiError(
        err.response?.status,
        err.response?.data?.detail ?? err.message,
        err.response?.data
      );
    }
    throw err;
  }
}
