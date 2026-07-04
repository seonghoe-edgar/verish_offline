import { playMdRequest } from "../client.js";

export type CommonCodeChangeState = "I" | "U" | "D";

export interface CommonCodeChangeItem {
  CSUBKIND: string;
  CSUBCD: string;
  CSUBSUBCD: string;
  CSUBSUBNM: string;
  CSUBSUBRCD: string;
  CSUBUSEYN: "Y" | "N";
  CSUBORD: number;
  state: CommonCodeChangeState;
}

export interface CommonCodeUpsertRequest {
  change: CommonCodeChangeItem[];
}

export interface CommonCode {
  codeType: string;
  code: string;
  name: string;
}

export async function createCommonCode(data: CommonCodeUpsertRequest): Promise<void> {
  await playMdRequest<void>("POST", "/api/open/common_code", { data });
}

export async function getCommonCode(): Promise<CommonCode[]> {
  return playMdRequest<CommonCode[]>("GET", "/api/open/common_code", { data: {} });
}
