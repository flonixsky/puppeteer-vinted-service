#!/bin/bash
# Auto-reconnect puppeteer-vinted-service to n8n network
# Add to crontab: */5 * * * * /home/buris/puppeteer-vinted-service/scripts/auto-reconnect-network.sh

CONTAINER_NAME="puppeteer-vinted-service"
NETWORK_NAME="pkkwkkkc04s04s84k8oo0k0o"

# Check if container exists and is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "$(date): Container ${CONTAINER_NAME} not running"
  exit 0
fi

# Check if already connected
if docker inspect ${CONTAINER_NAME} --format '{{range $net,$v := .NetworkSettings.Networks}}{{$net}} {{end}}' | grep -q ${NETWORK_NAME}; then
  # Already connected
  exit 0
fi

# Not connected - reconnect
echo "$(date): Reconnecting ${CONTAINER_NAME} to ${NETWORK_NAME}"
docker network connect ${NETWORK_NAME} ${CONTAINER_NAME}

if [ $? -eq 0 ]; then
  echo "$(date): Successfully reconnected"
else
  echo "$(date): Failed to reconnect"
  exit 1
fi
