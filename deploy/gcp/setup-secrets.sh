#!/usr/bin/env bash
# Create or update GCP Secret Manager entries for BHC Cloud Run.
# Usage (never commit real values):
#   export GEMINI_API_KEY='your-key'
#   export QUICKBOOKS_CLIENT_ID='...'   # optional
#   ./deploy/gcp/setup-secrets.sh YOUR_GCP_PROJECT_ID
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 PROJECT_ID}"
REGION="${REGION:-us-central1}"

upsert_secret() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "skip $name (empty)"
    return
  fi
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=-
    echo "updated $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy=automatic --data-file=-
    echo "created $name"
  fi
}

gcloud config set project "$PROJECT_ID"
gcloud services enable secretmanager.googleapis.com run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

upsert_secret GEMINI_API_KEY "${GEMINI_API_KEY:-}"
upsert_secret QUICKBOOKS_CLIENT_ID "${QUICKBOOKS_CLIENT_ID:-}"
upsert_secret QUICKBOOKS_CLIENT_SECRET "${QUICKBOOKS_CLIENT_SECRET:-}"
upsert_secret QUICKBOOKS_REALM_ID "${QUICKBOOKS_REALM_ID:-}"
upsert_secret QUICKBOOKS_REFRESH_TOKEN "${QUICKBOOKS_REFRESH_TOKEN:-}"

echo ""
echo "Grant Cloud Run access (replace SA if custom):"
echo "  SA=\$(gcloud iam service-accounts list --filter='displayName:Compute Engine default' --format='value(email)')"
echo "  for s in GEMINI_API_KEY QUICKBOOKS_CLIENT_ID QUICKBOOKS_CLIENT_SECRET QUICKBOOKS_REALM_ID QUICKBOOKS_REFRESH_TOKEN; do"
echo "    gcloud secrets add-iam-policy-binding \$s --member=serviceAccount:\$SA --role=roles/secretmanager.secretAccessor"
echo "  done"
echo ""
echo "Deploy with secrets:"
echo "  gcloud run deploy bhc --region $REGION \\"
echo "    --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,GEMINI_MODEL=gemini-3.6-flash \\"
echo "    --set-env-vars GEMINI_MODEL=gemini-3.6-flash,QUICKBOOKS_ENV=production"
