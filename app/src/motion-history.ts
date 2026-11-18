/** Aqara motion-history resource confirmed for the E1 and G2H Pro. */
export const MOTION_HISTORY_RESOURCE = "3.21.85";
const MAX_EVENT_AGE_MS = 90_000;
const MAX_CLOCK_SKEW_MS = 30_000;

export interface MotionHistoryRow {
  resourceId?: string;
  attr?: string;
  value?: unknown;
  timeStamp?: number | string;
  timestamp?: number | string;
  time?: number | string;
}

/** Track camera history independently so neither stale nor duplicated events activate motion. */
export class MotionHistoryTracker {
  private readonly latestByCamera = new Map<string, number>();

  consume(
    cameraId: string,
    rows: MotionHistoryRow[],
    now = Date.now(),
  ): "baseline" | "motion" | "none" {
    let latest = 0;
    for (const row of rows) {
      if (String(row.resourceId ?? row.attr) !== MOTION_HISTORY_RESOURCE) continue;
      if (String(row.value) !== "1") continue;
      const raw = Number(row.timeStamp ?? row.timestamp ?? row.time);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const timestamp = raw < 10_000_000_000 ? raw * 1000 : raw;
      if (timestamp > now + MAX_CLOCK_SKEW_MS) continue;
      latest = Math.max(latest, timestamp);
    }

    const previous = this.latestByCamera.get(cameraId);
    if (previous === undefined) {
      this.latestByCamera.set(cameraId, Math.max(now, latest));
      return "baseline";
    }
    if (latest <= previous) return "none";
    this.latestByCamera.set(cameraId, latest);
    return now - latest <= MAX_EVENT_AGE_MS ? "motion" : "none";
  }
}
