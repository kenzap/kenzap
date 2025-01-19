#!/bin/bash
# This is a comment

cd /tmp
O1="kubectl create namespace xxxaaa --kubeconfig=/var/www/etc/apps/kenzap-kubeconfig.yaml"

openssl genrsa -out xxxbbb.key 2048
openssl req -new -key xxxbbb.key -out xxxbbb.csr -subj "/CN=xxxbbb"
cat  xxxbbb.csr | base64 | tr -d "\n"

kubectl create -f alex-maslov-csr.yaml

# O1L=`echo $O1 | awk '{print length}'`