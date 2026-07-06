import axios from "axios";
import { createSign } from "crypto";
import { readFileSync } from "fs";
import "dotenv/config";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let serviceAccount: ServiceAccountKey | null = null;
function loadServiceAccount(): ServiceAccountKey {
  if (serviceAccount) return serviceAccount;
  const path = requiredEnv("GA4_SERVICE_ACCOUNT_KEY_PATH");
  serviceAccount = JSON.parse(readFileSync(path, "utf8"));
  return serviceAccount!;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// service-account JWT-bearer grant (RFC 7523) — signed locally with the private key,
// no browser/user interaction needed. Access token is valid ~1 hour.
async function fetchAccessToken(): Promise<{ access: string; expiresAt: number }> {
  const key = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: key.token_uri,
      exp: now + 3600,
      iat: now,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = base64url(createSign("RSA-SHA256").update(signingInput).sign(key.private_key));
  const jwt = `${signingInput}.${signature}`;

  const res = await axios.post(
    key.token_uri,
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return { access: res.data.access_token, expiresAt: Date.now() + res.data.expires_in * 1000 };
}

let tokenState: { access: string; expiresAt: number } | null = null;
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000;

async function getAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt - REFRESH_SAFETY_MARGIN_MS) {
    return tokenState.access;
  }
  tokenState = await fetchAccessToken();
  return tokenState.access;
}

export class Ga4ApiError extends Error {
  constructor(public status: number | undefined, message: string, public body?: unknown) {
    super(message);
    this.name = "Ga4ApiError";
  }
}

export interface RunReportRequest {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: unknown;
  limit?: number;
  orderBys?: unknown[];
}

export interface RunReportResponse {
  dimensionHeaders: { name: string }[];
  metricHeaders: { name: string; type: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  rowCount?: number;
}

export async function runReport(request: RunReportRequest): Promise<RunReportResponse> {
  const propertyId = requiredEnv("GA4_PROPERTY_ID");
  const token = await getAccessToken();
  try {
    const res = await axios.post(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      request,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Ga4ApiError(err.response?.status, JSON.stringify(err.response?.data ?? err.message), err.response?.data);
    }
    throw err;
  }
}
