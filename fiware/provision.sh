#!/usr/bin/env bash
set -euo pipefail

IOTA_URL="${IOTA_URL:-http://localhost:4041}"
SERVICE="${FIWARE_SERVICE:-openiot}"
SERVICE_PATH="${FIWARE_SERVICEPATH:-/}"

headers=(
  -H "Content-Type: application/json"
  -H "fiware-service: ${SERVICE}"
  -H "fiware-servicepath: ${SERVICE_PATH}"
)

echo "Provisioning FIWARE IoT service (apikey=smartwatch)..."
curl -sS -o /dev/null -w "service HTTP %{http_code}\n" -X POST "${IOTA_URL}/iot/services" \
  "${headers[@]}" \
  -d '{
    "services": [{
      "apikey": "smartwatch",
      "cbroker": "http://orion:1026",
      "entity_type": "HealthMonitor",
      "resource": "/iot/json"
    }]
  }' || true

echo "Registering device smartwatch001..."
curl -sS -o /dev/null -w "device HTTP %{http_code}\n" -X POST "${IOTA_URL}/iot/devices" \
  "${headers[@]}" \
  -d '{
    "devices": [{
      "device_id": "smartwatch001",
      "entity_name": "HealthMonitor:smartwatch001",
      "entity_type": "HealthMonitor",
      "protocol": "PDI-IoTA-JSON",
      "transport": "MQTT",
      "attributes": [
        {"object_id": "heartRate", "name": "heartRate", "type": "Number"},
        {"object_id": "temperature", "name": "temperature", "type": "Number"},
        {"object_id": "humidity", "name": "humidity", "type": "Number"},
        {"object_id": "sos", "name": "sos", "type": "Boolean"},
        {"object_id": "heartRateAlert", "name": "heartRateAlert", "type": "Boolean"},
        {"object_id": "temperatureAlert", "name": "temperatureAlert", "type": "Boolean"},
        {"object_id": "fingerPresent", "name": "fingerPresent", "type": "Boolean"}
      ]
    }]
  }' || true

echo "Updating device attributes..."
curl -sS -o /dev/null -w "update HTTP %{http_code}\n" -X PUT "${IOTA_URL}/iot/devices/smartwatch001" \
  "${headers[@]}" \
  -d '{
    "attributes": [
      {"object_id": "heartRate", "name": "heartRate", "type": "Number"},
      {"object_id": "temperature", "name": "temperature", "type": "Number"},
      {"object_id": "humidity", "name": "humidity", "type": "Number"},
      {"object_id": "sos", "name": "sos", "type": "Boolean"},
      {"object_id": "heartRateAlert", "name": "heartRateAlert", "type": "Boolean"},
      {"object_id": "temperatureAlert", "name": "temperatureAlert", "type": "Boolean"},
      {"object_id": "fingerPresent", "name": "fingerPresent", "type": "Boolean"}
    ]
  }'

echo "Done."
echo "MQTT topic: /smartwatch/smartwatch001/attrs"
echo "Entity: HealthMonitor:smartwatch001"
