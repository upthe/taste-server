#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
from firebase_admin import credentials, firestore
from os import environ

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    args = parser.parse_args()

    token_dict = None
    with open(args.cert_path, 'r') as f:
        token_dict = json.load(f)

    credentials = credentials.Certificate(token_dict)
    firebase_admin.initialize_app(credentials)

    if not 'FIRESTORE_EMULATOR_HOST' in environ:
        confirm = input('WARNING: connected to production, type "y" to continue: ')
        if confirm != "y":
            exit(0)

    db = firestore.client()

    for e in db.collection('events').stream():
        timestamp_str = e.get('timestamp')
        timestamp = datetime.datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
        print(f'Updating {e.id}...')
        db.collection('events').document(e.id).update({
            'timestamp': timestamp
        })
