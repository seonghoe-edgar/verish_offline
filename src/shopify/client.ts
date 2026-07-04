import axios from "axios";
import "dotenv/config";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function shopDomain(): string {
  return `${requiredEnv("SHOPIFY_SHOP")}.myshopify.com`;
}

function apiVersion(): string {
  return process.env.SHOPIFY_API_VERSION ?? "2026-04";
}

const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 86399s per Shopify, rounded down
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000;

interface TokenState {
  access: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;

// client credentials grant — only works when the app and the store are in the
// same Shopify organization (own-store custom app installed via Dev Dashboard).
async function fetchAccessToken(): Promise<TokenState> {
  const clientId = requiredEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SHOPIFY_CLIENT_SECRET");
  const res = await axios.post(
    `https://${shopDomain()}/admin/oauth/access_token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return {
    access: res.data.access_token,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  };
}

async function getAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt - REFRESH_SAFETY_MARGIN_MS) {
    return tokenState.access;
  }
  tokenState = await fetchAccessToken();
  return tokenState.access;
}

export class ShopifyApiError extends Error {
  constructor(public status: number | undefined, message: string, public body?: unknown) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

export async function shopifyGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  isRetryAfterAuthFailure = false
): Promise<T> {
  const token = await getAccessToken();
  try {
    const res = await axios.post(
      `https://${shopDomain()}/admin/api/${apiVersion()}/graphql.json`,
      { query, variables },
      { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" } }
    );
    if (res.data.errors) {
      throw new ShopifyApiError(res.status, JSON.stringify(res.data.errors), res.data.errors);
    }
    return res.data.data as T;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401 && !isRetryAfterAuthFailure) {
        tokenState = null;
        return shopifyGraphql<T>(query, variables, true);
      }
      throw new ShopifyApiError(
        err.response?.status,
        JSON.stringify(err.response?.data ?? err.message),
        err.response?.data
      );
    }
    throw err;
  }
}

interface ShopifyQlResponse {
  shopifyqlQuery: {
    tableData: {
      columns: { name: string; dataType: string; displayName: string }[];
      rows: Record<string, string>[];
    } | null;
    parseErrors: string[];
  };
}

export async function runShopifyQl(query: string): Promise<{
  columns: { name: string; dataType: string; displayName: string }[];
  rows: Record<string, string>[];
}> {
  const data = await shopifyGraphql<ShopifyQlResponse>(
    `query ShopifyQl($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData { columns { name dataType displayName } rows }
        parseErrors
      }
    }`,
    { query }
  );
  const { shopifyqlQuery } = data;
  if (shopifyqlQuery.parseErrors?.length) {
    throw new ShopifyApiError(undefined, shopifyqlQuery.parseErrors.join("; "));
  }
  return shopifyqlQuery.tableData ?? { columns: [], rows: [] };
}
