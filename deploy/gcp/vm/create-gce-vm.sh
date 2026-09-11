#!/usr/bin/env bash
# Create GCE VM + firewall from your workstation (gcloud authenticated).
# Usage:
#   export GCP_PROJECT=bhc-production
#   export GCP_ZONE=us-central1-a
#   bash deploy/gcp/vm/create-gce-vm.sh
#
# Then SSH in, clone repo, copy bhc.env, run provision-vm.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-bhc-production}"
ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-bhc-app-1}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
DISK_SIZE="${DISK_SIZE:-50GB}"
IMAGE_FAMILY="${IMAGE_FAMILY:-ubuntu-2204-lts}"
IMAGE_PROJECT="${IMAGE_PROJECT:-ubuntu-os-cloud}"

gcloud config set project "$PROJECT_ID"
gcloud services enable compute.googleapis.com

if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &>/dev/null; then
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --boot-disk-size="$DISK_SIZE" \
    --boot-disk-type=pd-balanced \
    --image-family="$IMAGE_FAMILY" \
    --image-project="$IMAGE_PROJECT" \
    --tags=http-server,https-server \
    --metadata=startup-script="#!/bin/bash
apt-get update -qq && apt-get install -y -qq git"
  echo "Created VM $VM_NAME"
else
  echo "VM $VM_NAME already exists"
fi

# Firewall rules (idempotent)
for rule in allow-bhc-http allow-bhc-https; do
  if ! gcloud compute firewall-rules describe "$rule" &>/dev/null; then
    case "$rule" in
      allow-bhc-http)
        gcloud compute firewall-rules create allow-bhc-http \
          --allow=tcp:80 --target-tags=http-server --description="BHC HTTP"
        ;;
      allow-bhc-https)
        gcloud compute firewall-rules create allow-bhc-https \
          --allow=tcp:443 --target-tags=https-server --description="BHC HTTPS"
        ;;
    esac
  fi
done

EXT_IP="$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
echo ""
echo "VM external IP: $EXT_IP"
echo "SSH: gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "Next on VM:"
echo "  sudo mkdir -p /opt/bhc && sudo git clone https://github.com/GemsNS/BHC.git /opt/bhc"
echo "  sudo cp /opt/bhc/deploy/gcp/vm/bhc.env.example /etc/bhc/bhc.env"
echo "  # edit /etc/bhc/bhc.env with GEMINI_API_KEY"
echo "  cd /opt/bhc && sudo bash deploy/gcp/vm/provision-vm.sh"
echo ""
echo "Point domain A-record to: $EXT_IP"
echo "Then: sudo bash /opt/bhc/deploy/gcp/vm/post-dns-https.sh YOUR_DOMAIN"
