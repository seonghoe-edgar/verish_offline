import { slackRequest, listStoreReportChannels, getChannelMessages, SlackApiError } from "./slack/index.js";

async function main() {
  try {
    const auth = await slackRequest<{ team: string; user: string }>("auth.test");
    console.log("연결 성공. 워크스페이스:", auth.team, "/ 봇 계정:", auth.user);

    const channels = await listStoreReportChannels();
    console.log(`\n오픈마감보고 채널 ${channels.length}개 발견 (봇이 초대된 채널만 보임):`);
    for (const c of channels) {
      console.log(`- ${c.name} (${c.id})`);
    }

    if (channels.length > 0) {
      const sample = channels[0];
      const messages = await getChannelMessages(sample.id);
      console.log(`\n[${sample.name}] 메시지 ${messages.length}건 중 최신 1건 미리보기:`);
      if (messages[0]) console.log(messages[0].text.slice(0, 300));
    }
  } catch (err) {
    if (err instanceof SlackApiError) {
      console.error("연결 실패:", err.slackError);
      if (err.body) console.error(JSON.stringify(err.body, null, 2));
    } else {
      console.error("예상치 못한 오류:", err);
    }
    process.exitCode = 1;
  }
}

main();
