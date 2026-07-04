import { mashRequest } from "./client.js";

export type MashOutputType = "JSON" | "RAW_JSON";

export interface DashboardDataRequest {
  dashboardUid: string;
  /** format: YYYY-MM-DD */
  startDate: string;
  /** format: YYYY-MM-DD */
  endDate: string;
  /** JSON: 매장명 등 사람이 읽기 좋은 형태 / RAW_JSON: ID 기반, 가공에 적합. 기본값 JSON */
  outputType?: MashOutputType;
}

export interface MashWidgetData {
  name: string;
  data: {
    records: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DashboardDataResponse {
  dashboard_uid: string;
  dashboard_name: string;
  owner: string;
  board_uid: string;
  board_name: string;
  created_at: string;
  updated_at: string;
  widgets: Record<string, MashWidgetData>;
  // Documented as always present, but live-tested 2026-07-04: absent from the response
  // entirely when there's nothing to report. Treat undefined as "no known issue", not "unknown".
  is_all_data_available?: boolean;
  missing_data?: unknown;
}

export async function getDashboardData({
  dashboardUid,
  startDate,
  endDate,
  outputType = "JSON",
}: DashboardDataRequest): Promise<DashboardDataResponse> {
  // Vendor guidance: keep each call to <=3 months of range; split longer periods into
  // multiple calls.
  return mashRequest<DashboardDataResponse>("GET", `/dashboards/${dashboardUid}/data`, {
    params: { start_date: startDate, end_date: endDate, output_type: outputType },
  });
}
