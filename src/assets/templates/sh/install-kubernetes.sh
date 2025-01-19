#!/bin/bash

# Check if Microk8s is already installed
if microk8s version &> /dev/null
then
    microk8s_version=$(microk8s version | grep -oP 'v\d+\.\d+\.\d+')
    echo "{\"success\":true,\"installed\":false,\"version\":\"$microk8s_version\"}"
else
    # Capture the output of the update command
    update_output=$(sudo apt update -y 2>&1)
    
    # ssh to install Microk8s
    if echo "$update_output" && \
       sudo apt install snapd -y && \
       sudo apt install jq -y && \
       sudo snap install microk8s -y --classic --channel=1.31/stable && \
       sudo usermod -a -G microk8s $USER && \
       sudo chown -f -R $USER ~/.kube
    then
        microk8s_version=$(microk8s version | grep -oP 'v\d+\.\d+\.\d+')
        echo "{\"success\":true,\"installed\":true,\"message\":\"Microk8s installation completed\",\"version\":\"$microk8s_version\}"
    else
        echo "{\"success\":false,\"installed\":false,\"message\":\"Microk8s installation failed\",\"update_output\":\"$update_output\"}"
    fi
fi