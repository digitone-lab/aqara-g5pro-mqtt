import test from "node:test";
import assert from "node:assert/strict";
import { PollGate, isG2HPro, parseCameraProfiles, p2pQualityChannel, resolveCameraPolicy } from "../camera-policy.js";

const bedroom = {
  did: "lumi1.54ef44447f42",
  deviceName: "Bedroom Camera",
  originalName: "Camera Hub G2H Pro",
  model: "lumi.camera.acn004",
};
const living = {
  did: "lumi1.other",
  deviceName: "Living Room Camera",
  originalName: "Camera E1",
  model: "lumi.camera.acn006",
};

test("G2H Pro is protected by default and no video or polling is allowed", () => {
  assert.ok(isG2HPro(bedroom));
  const p = resolveCameraPolicy(bedroom, {}, {});
  assert.equal(p.enabled, false);
  assert.equal(p.p2pAllowed, false);
  assert.equal(p.motionMode, "history");
  assert.ok(p.attributeSeconds >= 60);
});

test("G2H Pro can opt in to motion-only without enabling P2P", () => {
  const profiles = parseCameraProfiles(JSON.stringify({
    "Bedroom Camera": {
      enabled: true,
      p2pAllowed: false,
      attributeSeconds: 90,
      historySeconds: 20,
      motionHoldSeconds: 45,
      motionMode: "history",
      streamQuality: "low",
    },
  }));
  const p = resolveCameraPolicy(bedroom, profiles, {});
  assert.equal(p.enabled, true);
  assert.equal(p.p2pAllowed, false);
  assert.equal(p.attributeSeconds, 90);
  assert.equal(p.historySeconds, 20);
  assert.equal(p.motionHoldSeconds, 45);
  assert.equal(p.streamQuality, "low");
});

test("profiles select exact DID before name and remain independent", () => {
  const p = parseCameraProfiles(JSON.stringify({
    "*": { eventSeconds: 12 },
    "Living Room Camera": { motionMode: "events", streamQuality: "medium" },
    "lumi1.other": { eventSeconds: 5 },
  }));
  const l = resolveCameraPolicy(living, p, {});
  assert.equal(l.eventSeconds, 5);
  assert.equal(l.motionMode, "events");
  assert.equal(l.streamQuality, "medium");
  assert.equal(resolveCameraPolicy(bedroom, p, {}).enabled, false);
});

test("malformed profiles do not cause uncontrolled polling", () => {
  assert.deepEqual(parseCameraProfiles('{"camera":true}'), {});
  assert.deepEqual(parseCameraProfiles("not json"), {});
  const profiles = parseCameraProfiles('{"Bedroom Camera":{"enabled":true,"historySeconds":1}}');
  assert.equal(resolveCameraPolicy(bedroom, profiles, {}).historySeconds, 15);
});

test("quality presets map to real P2P channels", () => {
  assert.equal(p2pQualityChannel("high", "lumi.camera.acn006"), 0);
  assert.equal(p2pQualityChannel("medium", "lumi.camera.acn006"), 1);
  assert.equal(p2pQualityChannel("low", "lumi.camera.acn006"), 2);
  assert.equal(p2pQualityChannel("high", "lumi.camera.agl004"), 3);
  assert.equal(p2pQualityChannel("medium", "lumi.camera.agl004"), 0);
  assert.equal(p2pQualityChannel("low", "lumi.camera.agl004"), 2);
});

test("poll gate prevents overlapping requests and backs off on failures", () => {
  const gate = new PollGate(15_000);
  assert.equal(gate.begin(0), true);
  assert.equal(gate.begin(0), false);
  gate.finish(true, 0);
  assert.equal(gate.begin(14_999), false);
  assert.equal(gate.begin(15_000), true);
  gate.finish(false, 15_000);
  assert.equal(gate.begin(44_999), false);
  assert.equal(gate.begin(45_000), true);
  gate.finish(true, 45_000);
  assert.equal(gate.begin(60_000), true);
});
