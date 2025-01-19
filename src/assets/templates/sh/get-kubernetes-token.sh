#!/bin/bash

# download config file; add insecure-skip-tls-verify: true; comment out certificate-authority-data
microk8s_add_node=$(microk8s add-node --format json)
if [ -z "$microk8s_add_node" ]; then
  echo "{\"success\":false,\"error\":\"Failed to get microk8s config\"}"
  exit 1
fi

# make sure jq is installed
if ! command -v jq &> /dev/null; then
    update_output=$(sudo apt update -y 2>&1)
    sudo apt install jq -y
fi

microk8s_add_node_js=$(echo "$microk8s_add_node" | jq -R -s '{urls: .}')
echo "{\"success\":true,\"data\":$microk8s_add_node_js}"