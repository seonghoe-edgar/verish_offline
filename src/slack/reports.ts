import { slackRequest } from "./client.js";

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
}

export interface SlackMessage {
  ts: string;
  user?: string;
  text: string;
  thread_ts?: string;
}

// 직영 매장은 "-오픈마감보고", 중간관리(위탁운영) 매장은 "-중간관리자"로 채널명이 끝난다.
export const STORE_REPORT_SUFFIXES = ["오픈마감보고", "중간관리자"];

// 봇이 초대된 채널 중 이름이 지정한 접미사로 끝나는 채널만 골라온다.
export async function listStoreReportChannels(
  suffixes: string[] = STORE_REPORT_SUFFIXES
): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  do {
    const res = await slackRequest<{
      channels: SlackChannel[];
      response_metadata?: { next_cursor?: string };
    }>("conversations.list", {
      types: "public_channel,private_channel",
      limit: 200,
      exclude_archived: true,
      cursor,
    });
    channels.push(...res.channels);
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels.filter((c) => suffixes.some((s) => c.name.endsWith(s)));
}

// oldest/latest는 Slack ts 형식(초 단위 유닉스 타임스탬프 문자열, 예: "1735689600").
export async function getChannelMessages(
  channelId: string,
  oldest?: string,
  latest?: string
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  do {
    const res = await slackRequest<{
      messages: SlackMessage[];
      has_more: boolean;
      response_metadata?: { next_cursor?: string };
    }>("conversations.history", {
      channel: channelId,
      oldest,
      latest,
      limit: 200,
      cursor,
    });
    messages.push(...res.messages);
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return messages;
}

export function storeNameFromChannel(
  channelName: string,
  suffixes: string[] = STORE_REPORT_SUFFIXES
): string {
  const matched = suffixes.find((s) => channelName.endsWith(s));
  return matched ? channelName.replace(new RegExp(`-?${matched}$`), "") : channelName;
}

export function dateFromSlackTs(ts: string): string {
  return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
}
