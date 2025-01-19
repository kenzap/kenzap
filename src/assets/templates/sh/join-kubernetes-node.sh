#!/bin/bash

# download config file; add insecure-skip-tls-verify: true; comment out certificate-authority-data
microk8s=$(microk8s microk8s join {{url}})
if [ -z "$microk8s" ]; then
  echo "{\"success\":false,\"error\":\"Failed to join microk8s cluster\"}"
  exit 1
fi

# make sure jq is installed
if ! command -v jq &> /dev/null; then
    update_output=$(sudo apt update -y 2>&1)
    sudo apt install jq -y
fi

# get node information
microk8s=$(microk8s kubectl get no)
microk8s_js=$(echo "$microk8s" | jq -R -s '{nodes: .}')
echo "{\"success\":true,\"data\":$microk8s_js}"