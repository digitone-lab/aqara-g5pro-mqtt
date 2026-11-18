import assert from "node:assert/strict";
import test from "node:test";
import type { MqttClient } from "mqtt";
import type { MQTTDevice } from "../types.js";
import { processEventAttrs, publishMotionDiscovery } from "../motion.js";

function fakeClient() {
  const published: { topic: string; payload: string }[] = [];
  const client = {
    publish(topic: string, payload: string) {
      published.push({ topic, payload });
      return this;
    },
  } as unknown as MqttClient;
  return { client, published };
}

test("motion discovery has a distinct unique ID for each camera", () => {
  const { client, published } = fakeClient();
  for (const id of ["bedroom", "living_room"]) {
    publishMotionDiscovery(client, {
      id, identifiers: [id], name: id, model: "Aqara", manufacturer: "Aqara",
    });
  }
  const ids = published.map((p) => JSON.parse(p.payload).unique_id);
  assert.deepEqual(ids, ["bedroom_motion", "living_room_motion"]);
});

test("an ordinary-motion event activates the sensor and clears after its reset delay", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, published } = fakeClient();
  const camera: MQTTDevice = {
    id: "bedroom", identifiers: ["bedroom"], name: "Bedroom",
    model: "G2H Pro", manufacturer: "Aqara",
  };
  const sample = (timeStamp: number) => [
    { attr: "detect_motion_event", timeStamp, value: "1" },
  ];
  processEventAttrs(client, camera, sample(100));
  assert.equal(published.at(-1)?.payload, "OFF");
  processEventAttrs(client, camera, sample(101));
  assert.equal(published.at(-1)?.payload, "ON");
  processEventAttrs(client, camera, sample(101));
  assert.equal(published.at(-1)?.payload, "ON");
  t.mock.timers.tick(30_000);
  assert.equal(published.at(-1)?.payload, "OFF");
});
