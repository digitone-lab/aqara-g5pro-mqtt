import type { Device } from "./types.js";
import { jsonQualityChannel } from "./aqara.js";

export type MotionMode = "off" | "events" | "history" | "both";
export type StreamQuality = "auto" | "high" | "medium" | "low";

export interface CameraPolicy {
  enabled: boolean;
  p2pAllowed: boolean;
  attributeSeconds: number;
  eventSeconds: number;
  historySeconds: number;
  motionMode: MotionMode;
  motionHoldSeconds: number;
  streamQuality: StreamQuality;
  maxReconnectAttempts: number;
}

type Profile = Partial<CameraPolicy>;
type ProfileMap = Record<string, Profile>;

export function isG2HPro(device: Pick<Device, "model" | "originalName">): boolean {
  return /acn004|agl001|g2h[ -]?pro|ch-c01/i.test(
    `${device.model || ""} ${device.originalName || ""}`,
  );
}

function seconds(value: unknown, fallback: number, min: number, max = 3600): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

export function parseCameraProfiles(raw: string | undefined): ProfileMap {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("profiles must be a JSON object");
    }
    const result: ProfileMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`camera profile "${key}" must be an object`);
      }
      result[key.trim().toLowerCase()] = value as Profile;
    }
    return result;
  } catch (error) {
    console.warn("[CameraPolicy] Invalid CAMERA_PROFILES; using safe defaults:", error);
    return {};
  }
}

export function resolveCameraPolicy(
  device: Pick<Device, "did" | "model" | "deviceName" | "originalName">,
  profiles: ProfileMap,
  environment: Record<string, string | undefined> = process.env,
): CameraPolicy {
  const protection = environment.G2H_PRO_PROTECTION !== "false" && isG2HPro(device);
  const attributeSeconds = seconds(environment.POLL_INTERVAL, 30, 5);
  const eventSeconds = seconds(environment.MOTION_EVENT_INTERVAL, 15, 3);
  const historySeconds = seconds(environment.MOTION_HISTORY_INTERVAL, 15, 5);
  const holdSeconds = seconds(environment.MOTION_HOLD_SECONDS, 30, 5, 600);
  const defaultQuality = environment.STREAM_QUALITY;
  const policy: CameraPolicy = {
    // The G2H Pro remains out of polling/streaming until explicitly opted in.
    enabled: !protection,
    p2pAllowed: !protection,
    attributeSeconds: protection ? Math.max(60, attributeSeconds) : attributeSeconds,
    eventSeconds: protection ? Math.max(15, eventSeconds) : eventSeconds,
    historySeconds: protection ? Math.max(15, historySeconds) : historySeconds,
    motionMode: protection ? "history" : "both",
    motionHoldSeconds: holdSeconds,
    streamQuality: defaultQuality === "high" || defaultQuality === "medium" ||
      defaultQuality === "low" ? defaultQuality : "auto",
    maxReconnectAttempts: protection ? 3 : 5,
  };
  const candidates = [
    "*",
    `model:${device.model.toLowerCase()}`,
    device.deviceName.toLowerCase(),
    device.did.toLowerCase(),
  ];
  for (const candidate of candidates) {
    const profile = profiles[candidate];
    if (!profile) continue;
    if (typeof profile.enabled === "boolean") policy.enabled = profile.enabled;
    if (typeof profile.p2pAllowed === "boolean") policy.p2pAllowed = profile.p2pAllowed;
    policy.attributeSeconds = seconds(profile.attributeSeconds, policy.attributeSeconds, 5);
    policy.eventSeconds = seconds(profile.eventSeconds, policy.eventSeconds, 3);
    policy.historySeconds = seconds(profile.historySeconds, policy.historySeconds, 5);
    policy.motionHoldSeconds = seconds(profile.motionHoldSeconds, policy.motionHoldSeconds, 5, 600);
    policy.maxReconnectAttempts = seconds(
      profile.maxReconnectAttempts, policy.maxReconnectAttempts, 1, 10,
    );
    if (["off", "events", "history", "both"].includes(String(profile.motionMode))) {
      policy.motionMode = profile.motionMode as MotionMode;
    }
    if (["auto", "high", "medium", "low"].includes(String(profile.streamQuality))) {
      policy.streamQuality = profile.streamQuality as StreamQuality;
    }
  }
  if (!policy.enabled) policy.p2pAllowed = false;
  return policy;
}

/** Select documented Aqara 0x100E quality channels; no video transcoding. */
export function p2pQualityChannel(quality: StreamQuality, model: string): number {
  if (quality === "auto") return jsonQualityChannel(null, model);
  const height = quality === "high" ? 1600 : quality === "medium" ? 1080 : 360;
  return jsonQualityChannel({ title: quality, height, channel: 0 }, model);
}

/** Prevent overlapping cloud API calls and back off when Aqara is unavailable. */
export class PollGate {
  private nextAt = 0;
  private inFlight = false;
  private errors = 0;
  constructor(private readonly intervalMs: number, private readonly maxBackoffMs = 600_000) {}

  begin(now = Date.now()): boolean {
    if (this.inFlight || now < this.nextAt) return false;
    this.inFlight = true;
    return true;
  }

  finish(success: boolean, now = Date.now()): void {
    if (!this.inFlight) return;
    this.inFlight = false;
    this.errors = success ? 0 : Math.min(this.errors + 1, 8);
    const wait = success
      ? this.intervalMs
      : Math.min(this.maxBackoffMs, this.intervalMs * 2 ** this.errors);
    this.nextAt = now + wait;
  }
}
