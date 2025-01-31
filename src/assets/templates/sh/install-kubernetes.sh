#!/bin/bash

# Check if Microk8s is already installed
# if microk8s version &> /dev/null
if command -v microk8s &> /dev/null
then
    microk8s_version=$(microk8s version | grep -oP 'v\d+\.\d+\.\d+')
    linux_version=$(lsb_release -r | grep -oP '\d+\.\d+')
    linux_architecture=$(uname -m)
    echo "{\"success\":true,\"installed\":false,\"version\":\"$microk8s_version\",\"linux_version\":\"$linux_version\",\"linux_architecture\":\"$linux_architecture\"}"
else
    # Capture the output of the update command
    # update_output=$(sudo apt update -y 2>&1)
    
    # ssh to install Microk8s
    install_output=$(sudo apt update -y && \
    sudo apt install snapd -y && \
    sudo apt install jq -y && \
    sudo snap install microk8s --classic && \
    sudo usermod -a -G microk8s $USER && \
    sudo chown -f -R $USER ~/.kube 2>&1)

    microk8s_version=$(microk8s version | grep -oP 'v\d+\.\d+\.\d+')
    linux_version=$(lsb_release -r | grep -oP '\d+\.\d+')
    linux_architecture=$(uname -m)
    escaped_install_output=$(echo "$install_output" | jq -sRr @json)
 
    if [ -n "$microk8s_version" ]; then
        echo "{\"success\":true,\"installed\":true,\"message\":\"Microk8s installation completed\",\"version\":\"$microk8s_version\",\"linux_version\":\"$linux_version\",\"linux_architecture\":\"$linux_architecture\",\"install_output\":$escaped_install_output}"
    else
        echo "{\"success\":false,\"installed\":false,\"message\":\"Microk8s installation failed\",\"update_output\":\"$update_output\",\"install_output\":$escaped_install_output}"
    fi
fi