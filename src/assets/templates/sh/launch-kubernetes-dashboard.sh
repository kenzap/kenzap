#!/bin/bash

# check if any process is using port 10443 and kill it
pid=$(lsof -t -i:10443)
if [ -n "$pid" ]; then
  kill "$pid"
fi

# check if dashboard-proxy is running and kill it
# proxy_pid=$(pgrep -f 'microk8s dashboard-proxy')
# if [ -n "$proxy_pid" ]; then
#   kill "$proxy_pid"
# fi

sleep 1

# rm -f /tmp/dashboard-proxy.log

# launch dashboard in background and capture output
nohup microk8s dashboard-proxy & 

# r
microk8s dashboard-proxy >> /tmp/dashboard-proxy.log &

# wait for a moment to ensure the log file is written
# sleep 10

# extract the token from the log file
token=$(microk8s kubectl create token default)

if [ -z "$token" ]; then
  echo "{\"success\":false,\"error\":\"Failed to extract token\"}"
  exit 1
fi

echo "{\"success\":true,\"token\":\"$token\"}"