#!/usr/bin/env bash
set -eo pipefail
set +x

REPO_ROOT=$(git rev-parse --show-toplevel)

folder_name=$1
if [[ -z "$folder_name" ]]; then
    echo "error: enter folder name in taste-app-database-backup bucket"
    exit 1
fi

bucket_path="gs://taste-app-database-backup/$folder_name"
gsutil -m cp -r "$bucket_path" "$REPO_ROOT/restore"
