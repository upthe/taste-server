#!/usr/bin/env bash

REPO_ROOT=$(git rev-parse --show-toplevel)
CERT_PATH=${REPO_ROOT}/secret/taste-app-dbf1d-c271472aaf01.json

echo "Running sanitize_users.py..."
${REPO_ROOT}/scripts/sanitize_users.py --cert-path ${CERT_PATH}

echo "Running Emerald scripts..."
${REPO_ROOT}/scripts/emerald/create_emerald_events.py --cert-path ${CERT_PATH}
${REPO_ROOT}/scripts/emerald/calculate_emerald_creds.py --cert-path ${CERT_PATH}
