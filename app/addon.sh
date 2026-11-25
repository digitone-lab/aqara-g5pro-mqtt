#!/usr/bin/with-contenv bashio
CONFIG_PATH=/data/options.json
ENV_FILE="/usr/src/app/.env"

if bashio::services.available mqtt ; then
  export SYSTEM_MQTT_HOST="$(bashio::services mqtt 'host')"
  export SYSTEM_MQTT_PORT="$(bashio::services mqtt 'port')"
  export SYSTEM_MQTT_USER="$(bashio::services mqtt 'username')"
  export SYSTEM_MQTT_PASS="$(bashio::services mqtt 'password')"
fi

# Read user configuration
USERNAME=$(jq -r '.username' $CONFIG_PATH)
PASSWORD=$(jq -r '.password' $CONFIG_PATH)
AREA=$(jq -r '.area' $CONFIG_PATH)
USER_MQTT_URL=$(jq -r '.mqtt_url // empty' $CONFIG_PATH)
USER_MQTT_USER=$(jq -r '.mqtt_user // empty' $CONFIG_PATH)
USER_MQTT_PASS=$(jq -r '.mqtt_pass // empty' $CONFIG_PATH)
POLL_INTERVAL=$(jq -r '.poll_interval // 30' "$CONFIG_PATH")
LOG_LEVEL=$(jq -r '.log_level' $CONFIG_PATH)
CAMERA_IPS=$(jq -r '.camera_ips // empty' $CONFIG_PATH)
export DISABLE_MQTT_WITH_HAUS="$(jq -r 'if .disable_mqtt_with_haus == false then "false" else "true" end' "$CONFIG_PATH")"

# Fallback to Supervisor MQTT service if not specified in options
if [ -n "$USER_MQTT_URL" ]; then
  MQTT_URL="$USER_MQTT_URL"
else
  MQTT_URL="mqtt://${SYSTEM_MQTT_HOST:-core-mosquitto}:${SYSTEM_MQTT_PORT:-1883}"
fi

if [ -n "$USER_MQTT_USER" ]; then
  MQTT_USER="$USER_MQTT_USER"
else
  MQTT_USER="$SYSTEM_MQTT_USER"
fi

if [ -n "$USER_MQTT_PASS" ]; then
  MQTT_PASS="$USER_MQTT_PASS"
else
  MQTT_PASS="$SYSTEM_MQTT_PASS"
fi

function needs_regen() {
  [ ! -f "$ENV_FILE" ] && return 0

  grep -q "^TOKEN=" "$ENV_FILE" || return 0

  CURRENT_HASH=$(echo "$USERNAME|$PASSWORD|$AREA|$MQTT_USER|$MQTT_PASS|$MQTT_URL|$POLL_INTERVAL|$LOG_LEVEL|$CAMERA_IPS" | sha256sum | cut -d' ' -f1)
  SAVED_HASH=$(grep '^CONFIG_HASH=' "$ENV_FILE" | cut -d'=' -f2- || echo "")

  [ "$CURRENT_HASH" != "$SAVED_HASH" ]
}

if needs_regen; then
  echo "🔑 Generating new .env (config changed or missing)"
  node dist/scripts/setup.js --auto \
    --username "$USERNAME" \
    --password "$PASSWORD" \
    --area "$AREA" \
    --mqtt-url "$MQTT_URL" \
    --mqtt-user "$MQTT_USER" \
    --mqtt-pass "$MQTT_PASS" \
    --poll-interval "$POLL_INTERVAL" \
    --log-level "$LOG_LEVEL" \
    ${CAMERA_IPS:+--camera-ips "$CAMERA_IPS"}

  HASH=$(echo "$USERNAME|$PASSWORD|$AREA|$MQTT_USER|$MQTT_PASS|$MQTT_URL|$POLL_INTERVAL|$LOG_LEVEL|$CAMERA_IPS" | sha256sum | cut -d' ' -f1)
  echo "CONFIG_HASH=$HASH" >> "$ENV_FILE"
else
  echo "✅ Existing .env is valid and matches config, skipping setup"
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Runtime camera options are deliberately applied without re-running Aqara login.
# Quoted JSON stays in one environment variable; never eval or source user JSON.
export CAMERA_PROFILES="$(jq -rc '.camera_profiles // "{}" | if type == "object" then tojson else . end' "$CONFIG_PATH")"
export MOTION_EVENT_INTERVAL="$(jq -r '.motion_event_interval // 15' "$CONFIG_PATH")"
export MOTION_HISTORY_INTERVAL="$(jq -r '.motion_history_interval // 15' "$CONFIG_PATH")"
export MOTION_HOLD_SECONDS="$(jq -r '.motion_hold_seconds // 30' "$CONFIG_PATH")"
export STREAM_QUALITY="$(jq -r '.stream_quality // "auto"' "$CONFIG_PATH")"
export G2H_PRO_PROTECTION="$(jq -r 'if .g2h_pro_protection == false then "false" else "true" end' "$CONFIG_PATH")"

echo "🚀 Starting Aqara G5 Pro integration..."
exec node dist/index.js
