import axios from "axios";
import "dotenv/config";

const BASE_URL = "https://slack.com/api";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export class SlackApiError extends Error {
  constructor(public slackError: string, public body?: unknown) {
    super(`Slack API error: ${slackError}`);
    this.name = "SlackApiError";
  }
}

// Slack Web API returns HTTP 200 even on failure; success is signaled by body.ok.
export async function slackRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const token = requiredEnv("SLACK_BOT_TOKEN");
  const res = await axios.get(`${BASE_URL}/${method}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  if (!res.data.ok) {
    throw new SlackApiError(res.data.error ?? "unknown_error", res.data);
  }
  return res.data;
}
