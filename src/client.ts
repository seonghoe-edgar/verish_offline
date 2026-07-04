import axios, { AxiosInstance, Method } from "axios";
import "dotenv/config";
import { throttle } from "./rateLimiter.js";

const BASE_URLS = {
  test: "https://t-playmd.xmd.co.kr",
  production: "https://external-api.xmd.co.kr",
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function createHttpClient(): AxiosInstance {
  const env = (process.env.PLAYMD_ENV ?? "test") as keyof typeof BASE_URLS;
  return axios.create({
    baseURL: BASE_URLS[env],
    headers: {
      "PLAYMD-API-KEY": requiredEnv("PLAYMD_API_KEY"),
      "PLAYMD-TENANT": requiredEnv("PLAYMD_TENANT"),
      "Content-Type": "application/json",
    },
  });
}

const http = createHttpClient();

export class PlayMdApiError extends Error {
  constructor(public status: number | undefined, message: string, public body?: unknown) {
    super(message);
    this.name = "PlayMdApiError";
  }
}

export async function playMdRequest<T = unknown>(
  method: Method,
  path: string,
  options: { params?: Record<string, unknown>; data?: unknown } = {}
): Promise<T> {
  return throttle(async () => {
    try {
      const res = await http.request<T>({ method, url: path, ...options });
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        throw new PlayMdApiError(
          err.response?.status,
          err.response?.data?.message ?? err.message,
          err.response?.data
        );
      }
      throw err;
    }
  });
}
