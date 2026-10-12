# 🚀 Kubernetes Simplified Desktop App  

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/kenzap/kenzap)  
[![License](https://img.shields.io/badge/license-GPLv3-blue)](LICENSE)  
[![Slack](https://img.shields.io/badge/slack-join%20community-orange)](https://kenzap.slack.com/channels/community)

A user-friendly **desktop application** built with **Electron.js** to simplify Kubernetes cluster setup, CI/CD pipelines, and infrastructure management. Get started with cloud-native development, hassle-free.  

---

## 🌟 **Product Overview**  

### 🎥 **Preview**  
![Kubernetes Simplified App in Action](https://github.com/kenzap/kenzap/blob/main/preview.gif)  
*(Above: The app streamlining cluster creation and deployment automation.)*  

---

### ✨ **Features**  
- **All-in-One Tool**: Build, manage, and automate Kubernetes clusters effortlessly.  
- **User-Friendly Interface**: No steep learning curve or DevOps expertise needed.  
- **Local Deployment**: Full offline functionality for privacy and speed.  
- **Free-Tier Docker Registries**: Save costs while managing containers seamlessly.  
- **Built-In CI/CD Pipelines**: Automate workflows with zero configuration.  
- **Analytics Dashboard**: Get insights into deployments and clusters in real time.  
- **Cloud Flexibility**: Choose any provider and control your costs.  

---

## 🛠 **Installation**  

### **Prerequisites**  
- **Node.js** (version 20.x or higher recommended)  
- **Docker** (required)
- **Devspace** (required)
- **Kubectl** (required)

### **Download & Install**  
1. Download the latest release for [macOS](https://kenzap.cloud/static/releases/Kenzap-latest-arm64.dmg), [Windows](#), or [Linux](#).  
2. Run the installer and follow the prompts.  
3. Launch the app and start configuring your Kubernetes cluster!  

### **From Source**  
```bash
git clone https://github.com/kenzap/kenzap.git  
cd kenzap
nvm use 20
npm i  
npm run dev  
```  

---

## 🎯 **Getting Started**  

1. **Launch the App**: Open the app on your machine.  
2. **Cluster Setup**: Follow the step-by-step wizard to build your Kubernetes cluster.  
3. **CI/CD Pipeline**: Configure automated pipelines effortlessly using the built-in tools.  
4. **Deploy & Monitor**: Deploy your application and track metrics in the dashboard.  

For detailed guidance, check our [Documentation](#).  

### SSH Cluster Connections And Monitoring

In Home > Clusters, open a remote cluster's action menu and select **Connect via SSH**.
The connection uses the first configured server and its SSH key. On first use, compare
the displayed server fingerprint with one obtained from the server console or administrator.
Subsequent connections reject a changed key. An SSH status label shows connection progress
separately from the cluster's workload status.

The app forwards the Kubernetes API through a localhost-only tunnel and verifies its TLS
certificate using the kubeconfig CA. If the saved kubeconfig lacks a CA, it reads a fresh
one using `microk8s config` over the verified SSH connection. That requires the SSH user
to have permission to run that command. Existing kubeconfig files are preserved.

Choose **Export SSH kubeconfig** to use this connection with `kubectl` or DevSpace:

```bash
kubectl --kubeconfig=/path/to/kubeconfig-cluster-ssh.yaml get pods -A
devspace deploy --kubeconfig=/path/to/kubeconfig-cluster-ssh.yaml
```

Keep the app running and connected while using the exported file. Reconnection preserves
the local port within a session; after restarting the app, wait for reconnection and export again.
**Disconnect SSH** closes the tunnel and disables startup reconnection for that cluster until
you choose **Connect via SSH** again. Removing the cluster also closes its connection.
The tunnel retains the source kubeconfig's permissions; it does not create a read-only identity.

After choosing **Connect via SSH**, in-app cluster health, nodes, usage, deployments,
pods, events, and diagnostic logs use the verified tunnel. App queries retain their
existing kubeconfig user and namespace, without substituting cluster-admin credentials.
Source kubeconfigs are never overwritten. The interface shows **Monitoring via SSH**.
App usage charts follow the same route. Legacy dated app kubeconfigs are supported when
their API endpoint or CA matches the assigned cluster; ambiguous matches require an
explicit `kubeconfig-<cluster-id>.yaml`. Namespace selection respects the app kubeconfig,
then its saved namespace or workload manifests, and finally its app ID.

Selecting SSH monitoring is remembered across restarts. Disconnecting, failed verification,
or reconnecting pauses monitoring; it never silently falls back to the public API.
Successful SSH connections are restored automatically after restarting the app, using the
saved SSH key path and trusted host fingerprint. Existing SSH preferences are migrated on
first launch; automatic connections never prompt to trust a new host or accept a changed key.
Unavailable servers or failed verification show a connection error; choose **Connect via SSH**
to retry or verify a new server manually. No extra credentials are stored for reconnection.
Clusters that have never selected SSH retain direct API monitoring, and Minikube uses its
explicit local context.

Read-only requests run in the main process with timeouts, bounded output, shared in-flight
requests, and a short cache. Status refreshes every 10 seconds and usage every 5 seconds,
without overlapping polls. Diagnostics fetch the latest 200 log lines (bounded to 256 KiB
per container); this is not yet a streaming log viewer or Kubernetes watch implementation.

Endpoint **Save** also uses the verified connection and app kubeconfig. It applies the active
manifest and explicitly deletes removed Services and Ingresses in the app namespace, with
timeouts and visible deployment errors. An SSH disconnect never falls back to the public API.
The **Enter pod** terminal action also routes DevSpace through the verified SSH tunnel,
using the app credentials, context, and namespace. Keep the desktop app running while the
terminal is in use. Disconnected SSH blocks new terminals rather than using the public API;
reopen the terminal after reconnecting. Temporary terminal kubeconfigs are private and removed
when the terminal exits, the connection changes, or the app quits. Minikube and clusters that
have not selected SSH retain their local/direct routes without changing the global context.
**Publish** now uses the same verified route, app credentials, context, and namespace for
its primary assigned cluster. Builds and registry uploads still run locally; registry access
is separate from the Kubernetes tunnel. Static registry credentials use Docker's password
input rather than command arguments. Publishing from settings waits for Save to complete;
its Secrets and PVCs are then applied through the publishing connection, not the old public API.
**Publish all** runs workspace configurations sequentially and advances only after a successful
exit. The console streams bounded, escaped output with known credentials redacted. Failed
or canceled jobs remain visibly distinct from completed publishing, including across navigation.
SSH loss or cancellation stops the job and its child processes; no public fallback or automatic
deployment retry occurs. Already applied changes are not rolled back. Registry login has a
two-minute limit and each DevSpace deployment a thirty-minute limit. Temporary SSH kubeconfigs
are private and removed when the job finishes. Custom DevSpace hooks that explicitly choose
another connection are not rewritten by the app.
**Live sync** uses the same primary-cluster route, app credentials, context, and namespace.
The main process owns the long-lived DevSpace job and exposes Syncing, Paused, Failed, and
Stopping states across navigation. There is no publishing-style time limit for sync. SSH
loss stops the child and removes its private kubeconfig; a verified reconnect resumes it
with a fresh tunnel, only if the saved app settings and sync configuration are unchanged.
Stop revokes this resume intent, including while paused. Restarting the desktop app requires
starting sync again; sync intent is not persisted. Publish and sync cannot run concurrently
for the same app, including while a sync is paused or still stopping.

Sync preserves the workspace configuration, exclusion/direction rules, explicit initial-sync
strategy, and `.devspace` state rather than deleting it on every start. Reconnecting still
runs DevSpace's initial reconciliation; choose an appropriate `initialSync` strategy for
your files. This embedded action currently requires one explicit sync path and an image or
label selector per configuration. It selects a matching pod without an interactive prompt;
it does not broadcast changes to every replica. Multiple-path configurations must use an
external DevSpace terminal until a path picker is added. Variable-based `initialSync`
strategies are rejected rather than silently replaced. The desktop app must remain running.
Standalone Save's legacy Secret/PVC commands are not migrated in this step.
Use the exported SSH kubeconfig for external DevSpace deployments.
Independent CI runners need their own private API connection or tunnel; a desktop tunnel
is not a CI service.

### Disabling And Restoring Endpoints

`endpoints.yaml` remains the source of truth for active endpoint resources. Disabled routes
are kept separately in `.endpoints-state.json` beside the manifest, including their paths,
ingress class, annotations, TLS settings and Service configuration. Keep this state file
with the workspace if disabled routes need to be restored on another machine.

Turning off the public switch removes its ingress paths but leaves the Service active.
Turning off the private switch removes the Service and its public paths while remembering
the public switch's previous setting. Re-enable and **Save** to restore the previous configuration.
**Remove** intentionally forgets an endpoint rather than archiving it.

Save waits for endpoint deployment before reporting success. If deployment fails, the YAML
and disabled configuration remain saved locally, and pending resource deletions are retried
on the next Save. Active YAML edits take precedence over archived copies; conflicting form
and external YAML edits require reopening the settings instead of silently overwriting them.

Run regression tests with `node --test tests/*.test.js` and the action-menu UI checks
with `node_modules/.bin/electron tests/cluster-action-menu.ui.cjs`.

---

## 🤝 **Join the Community**  

Stay updated, share feedback, and connect with other developers:  
- 💬 [Join Slack Community](https://kenzap.slack.com/channels/community)  
- 🐦 [Follow us on Twitter](https://twitter.com/kenzap)
- 🔺 [Comment on Reddit](https://www.reddit.com/r/kubernetes/comments/1jckjsm/building_a_ui_for_kubernetes_helpful_or_useless/)
- 👨🏼‍💻 [Connect on LinkedIn](https://linkedin.com/in/pavel-lukasenko)

---

## 🔧 **Contributing**  

We welcome contributions! Please follow these steps:  
1. Fork the repository.  
2. Create a new feature branch.  
3. Submit a pull request with detailed changes.  

---

## 📜 **License**  

This project is licensed under the [GPLv3 License](LICENSE).  

---

## 🚀 **Roadmap**  

- [ ] Test support for multi-cloud environments.  
- [ ] Docker app templates.  
- [ ] Expand analytics dashboard capabilities.
- [ ] Traffic monitoring and cluster security

---

## ⭐ **Support Us**  

If you find this project helpful, please consider giving us a ⭐ on [GitHub](https://github.com/kenzap/kenzap).  

<!--
**kenzap/kenzap** is a ✨ _special_ ✨ repository because its `README.md` (this file) appears on your GitHub profile.

Here are some ideas to get you started:

- 🔭 I’m currently working on ...
- 🌱 I’m currently learning ...
- 👯 I’m looking to collaborate on ...
- 🤔 I’m looking for help with ...
- 💬 Ask me about ...
- 📫 How to reach me: ...
- 😄 Pronouns: ...
- ⚡ Fun fact: ...
-->
