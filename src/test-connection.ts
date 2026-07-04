import { playMdRequest, PlayMdApiError } from "./client.js";

async function main() {
  try {
    const data = await playMdRequest("GET", "/api/open/supplier");
    console.log("연결 성공. 응답:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err instanceof PlayMdApiError) {
      console.error(`연결 실패 (status: ${err.status ?? "unknown"}): ${err.message}`);
      if (err.body) console.error(JSON.stringify(err.body, null, 2));
    } else {
      console.error("예상치 못한 오류:", err);
    }
    process.exitCode = 1;
  }
}

main();
