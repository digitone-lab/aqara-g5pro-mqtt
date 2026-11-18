# Aqara E1 and G2H Pro native motion events

The ordinary motion event source is verified on both cameras: Aqara resource
`3.21.85` returned by `/app/v1.0/lumi/res/history/log`.

This fork polls that event history every 3 seconds, independently of the
existing video/attribute polling. A separate cursor per camera prevents repeated
events; the initial history query establishes a baseline without replaying
older detections. Events older than 90 seconds are ignored. Successful new
motion resets the existing 30-second motion-clear timer.

No Pi-side video inference or camera stream configuration changes are needed.

## Home Assistant upgrade

Build and publish the new aarch64 image on GitHub Actions first.
Update the experimental add-on to v1.6.41, retaining options and P2P state.
Stop the original add-on before starting the experimental one because they
share streaming ports. Do not use both simultaneously.

## Verify

Observe `[MotionHistory:Bedroom Camera] baseline ready` and
`[MotionHistory:Living Room Camera] baseline ready` after start.
Walk in each room. The respective `Motion=ON (3.21.85)` log should appear
and the motion sensor should clear approximately 30 seconds after the last event.
Aqara's history API is cloud-backed: detection latency is governed by
the camera's upload and the cloud query time as well as the 3s poll interval.
