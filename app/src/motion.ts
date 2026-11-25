import type { MqttClient } from "mqtt";
import type { MQTTDevice } from "./types.js";

// AI event names previously supported by the bridge.
export const EVENT_ATTRS = [
  "detect_human_event",
  "detect_pets_event",
  "detect_face_event",
  "detect_vehicle_event",
  "package_detect_event",
  "human_detect_event",
  "pet_detect_event",
  "vehicle_detect_event",
  "person_detect_event",
];

const ALL_EVENT_ATTRS = new Set(EVENT_ATTRS);

const RESET_SECONDS = Number(process.env.MOTION_RESET ?? 30);
const cameraHoldSeconds = new Map<string, number>();

/** Per-camera motion reset duration; configured once during discovery. */
export function setMotionHoldSeconds(cameraId: string, holdSeconds: number): void {
  cameraHoldSeconds.set(cameraId, Math.max(5, Math.min(600, Math.round(holdSeconds))));
}

type CameraKey = string;
// Last seen timeStamp/value per attribute
const lastSeen = new Map<string, { ts: number; value: string }>();
// Active motion state and reset timers
const motionOn = new Map<CameraKey, boolean>();
const offTimers = new Map<CameraKey, NodeJS.Timeout>();

export function publishMotionDiscovery(client: MqttClient, mqttDevice: MQTTDevice): void {
  const base = `homeassistant/binary_sensor/${mqttDevice.id}/motion`;
  client.publish(
    `${base}/config`,
    JSON.stringify({
      name: "Motion",
      unique_id: `${mqttDevice.id}_motion`,
      state_topic: `${base}/state`,
      device_class: "motion",
      payload_on: "ON",
      payload_off: "OFF",
      device: {
        identifiers: mqttDevice.identifiers,
        manufacturer: mqttDevice.manufacturer,
        model: mqttDevice.model,
        name: mqttDevice.name,
      },
    }),
    { retain: true },
  );
}

export function processEventAttrs(
  client: MqttClient,
  mqttDevice: MQTTDevice,
  rows: Array<{ attr: string; value: any; timeStamp?: number }>,
): void {
  let detected = false;
  let changedAttr = "";

  for (const row of rows) {
    if (!ALL_EVENT_ATTRS.has(row.attr)) continue;
    const key = `${mqttDevice.id}:${row.attr}`;
    const ts = Number(row.timeStamp ?? 0);
    const value = String(row.value);
    const prev = lastSeen.get(key);

    if (prev && (ts > prev.ts || (ts === prev.ts && value !== prev.value))) {
      detected = true;
      changedAttr = row.attr;
    }
    lastSeen.set(key, { ts, value });
  }

  if (!detected) {
    // A successful event poll confirms clear/active state even in a quiet scene.
    // Haus collects this heartbeat before its optional MQTT publication gate.
    client.publish(
      `homeassistant/binary_sensor/${mqttDevice.id}/motion/state`,
      motionOn.get(mqttDevice.id) ? "ON" : "OFF",
      { retain: true },
    );
    return;
  }

  activateMotion(client, mqttDevice, changedAttr);
}

/** Shared output path for native human and ordinary-motion timeline events. */
export function activateMotion(
  client: MqttClient,
  mqttDevice: MQTTDevice,
  changedAttr: string,
): void {
  const wasOn = motionOn.get(mqttDevice.id) ?? false;
  console.log(`🚶 ${mqttDevice.name} Motion=ON (${changedAttr})`);

  if (!wasOn) {
    motionOn.set(mqttDevice.id, true);
  }
  client.publish(`homeassistant/binary_sensor/${mqttDevice.id}/motion/state`, "ON", {
    retain: true,
  });

  // Restart the reset timer
  const old = offTimers.get(mqttDevice.id);
  if (old) clearTimeout(old);
  offTimers.set(
    mqttDevice.id,
    setTimeout(
      () => {
        motionOn.set(mqttDevice.id, false);
        client.publish(`homeassistant/binary_sensor/${mqttDevice.id}/motion/state`, "OFF", {
          retain: true,
        });
        console.log(`🌙 ${mqttDevice.name} Motion=OFF`);
      },
      (cameraHoldSeconds.get(mqttDevice.id) ?? RESET_SECONDS) * 1000,
    ),
  );
}
