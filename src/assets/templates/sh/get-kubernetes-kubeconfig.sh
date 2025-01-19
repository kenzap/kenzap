#!/bin/bash

# download config file; add insecure-skip-tls-verify: true; comment out certificate-authority-data
microk8s_config=$(microk8s config)
if [ -z "$microk8s_config" ]; then
  echo "{\"success\":false,\"error\":\"Failed to get microk8s config\"}"
  exit 1
fi

# make sure jq is installed
if ! command -v jq &> /dev/null; then
    update_output=$(sudo apt update -y 2>&1)
    sudo apt install jq -y
fi

microk8s_config_json=$(echo "$microk8s_config" | jq -R -s '{kubeconfig: .}')
echo "{\"success\":true,\"data\":$microk8s_config_json}"