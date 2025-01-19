#!/bin/bash

# Check if Microk8s is already installed
if microk8s version &> /dev/null
then
    microk8s_version=$(microk8s version | grep -oP 'v\d+\.\d+\.\d+')
    echo "{\"success\":true,\"installed\":false,\"version\":\"$microk8s_version\"}"
else

    # ssh again
    sudo microk8s status --wait-ready
    sudo microk8s enable ingress && \
    sudo microk8s enable cert-manager && \
    sudo microk8s enable ingress dns && \
    sudo microk8s enable host-access:ip=kenzap_ip_address && \
    sudo microk8s kubectl apply -f - <<EOF
    ---
    apiVersion: cert-manager.io/v1
    kind: ClusterIssuer
    metadata:
    name: letsencrypt
    spec:
    acme:
        # You must replace this email address with your own.
        # Let's Encrypt will use this to contact you about expiring
        # certificates, and issues related to your account.
        email: no-reply@kenzap.com
        server: https://acme-v02.api.letsencrypt.org/directory
        privateKeySecretRef:
        # Secret resource that will be used to store the account's private key.
        name: letsencrypt-account-key
        # Add a single challenge solver, HTTP01 using nginx
        solvers:
        - http01:
            ingress:
            class: public
EOF

    sudo sudo microk8s enable metallb

    # grant firewall rule to 10443
    # sudo iptables -F
    sudo mkdir kube_certs
    sudo openssl req -nodes -newkey rsa:2048 -keyout kube_certs/key.pem -out kube_certs/cert.pem -subj "/CN=kubernetes-dashboard"
    sudo microk8s.kubectl --namespace kube-system delete secret/kubernetes-dashboard-certs
    sudo microk8s.kubectl --namespace kube-system create secret generic kubernetes-dashboard-certs --from-file=./kube_certs

    # Verify certs are loaded then clean up local artifacts
    sudo microk8s.kubectl --namespace kube-system describe secret/kubernetes-dashboard-certs
    sudo rm -rf kube_certs

    microk8s_version=$(microk8s version | grep -oP 'v\d+\.\d+\.\d+')
    echo "{\"success\":true,\"installed\":true,\"message\":\"Microk8s addon installation completed\",\"version\":\"$microk8s_version\}"
fi