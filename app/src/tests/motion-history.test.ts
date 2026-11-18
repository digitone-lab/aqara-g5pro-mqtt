import assert from "node:assert/strict";
import test from "node:test";
import { MotionHistoryTracker } from "../motion-history.js";

const base = 1795035782348;
const event = (timeStamp: number, resourceId = "3.21.85", value = "1") =>
  ({ timeStamp, resourceId, value });

test("first history query initializes baseline and never replays old motion", () => {
  const tracker = new MotionHistoryTracker();
  assert.equal(tracker.consume("bedroom", [event(base - 1000)], base), "baseline");
  assert.equal(tracker.consume("bedroom", [event(base - 1000)], base + 1000), "none");
  assert.equal(tracker.consume("bedroom", [event(base + 5000)], base + 6000), "motion");
  assert.equal(tracker.consume("bedroom", [event(base + 5000)], base + 8000), "none");
});

test("both camera cursors are independent, including empty initial history", () => {
  const tracker = new MotionHistoryTracker();
  assert.equal(tracker.consume("bedroom", [], base), "baseline");
  assert.equal(tracker.consume("living", [event(base - 5000)], base), "baseline");
  assert.equal(tracker.consume("bedroom", [event(base + 1000)], base + 2000), "motion");
  assert.equal(tracker.consume("living", [event(base - 5000)], base + 5000), "none");
  assert.equal(tracker.consume("living", [event(base + 1000)], base + 5000), "motion");
});

test("stale, unrelated, and non-motion values are ignored", () => {
  const tracker = new MotionHistoryTracker();
  tracker.consume("bedroom", [], base);
  assert.equal(tracker.consume("bedroom", [event(base + 1000, "14.70.85")], base + 2000), "none");
  assert.equal(tracker.consume("bedroom", [event(base + 1000, "3.21.85", "0")], base + 2000), "none");
  assert.equal(tracker.consume("bedroom", [event(base + 2000)], base + 100_000), "none");
  assert.equal(tracker.consume("bedroom", [event(base + 101_000)], base + 102_000), "motion");
});

test("newest event wins regardless of list order; future-dated entries are rejected", () => {
  const tracker = new MotionHistoryTracker();
  tracker.consume("living", [], base);
  assert.equal(
    tracker.consume("living", [event(base + 19_000), event(base + 20_000), event(base + 1_000_000)], base + 21_000),
    "motion",
  );
  assert.equal(tracker.consume("living", [event(base + 20_000)], base + 22_000), "none");
});
