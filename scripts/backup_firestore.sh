#!/usr/bin/env bash
set -eo pipefail
set +x

BUCKET_ARN="gs://taste-app-database-backup"
folder_name=$(date +%FT%T)

gcloud firestore export $BUCKET_ARN/$folder_name
echo "Exported to $folder_name"
