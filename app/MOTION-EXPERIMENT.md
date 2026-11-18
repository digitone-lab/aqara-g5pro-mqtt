# Experimental camera motion-event bridge

This fork fixes the per-camera Home Assistant MQTT motion discovery IDs and
probes candidate Aqara ordinary-motion attributes for both the E1 and G2H Pro.

**Important:** The ordinary-motion attribute names are unverified. This build
does not guarantee the cameras will send those events. Native human-detection
events, RTSP streams and existing camera controls remain unchanged.

## Test procedure

1. In Aqara Home, enable Motion Detection on both cameras.
2. Stop the upstream add-on before starting this fork (same stream ports).
3. In the fork's add-on options, ensure MQTT is enabled. If Haus is
   suppressing native MQTT, set `disable_mqtt_with_haus: false` while testing.
4. Inspect logs for `[MotionProbe:Bedroom Camera]` and
   `[MotionProbe:Living Room Camera]`. If they show "none" or a rejected
   candidate query, the ordinary-motion API is not yet identified.
5. Walk in front of each camera and watch the MQTT motion binary sensors.
   On first startup, allow one baseline poll before the first event.
6. Do not use motion sensors for lighting automations until each camera has
   actually produced an ON transition.

## Rollback

Stop and uninstall this experimental add-on, then restart the upstream
add-on. Do not run both concurrently. Keep a backup of your original options;
new installations do not inherit the old add-on's options.
