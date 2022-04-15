#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
from firebase_admin import credentials, firestore
from os import environ

def calculate_cumulative_growth_metrics(db):
    collections_to_timestamp_fields = {
        'posts': 'timestamp',
        'users': 'creationTimestamp',
        'notifications': 'timestamp'
    }

    print('Calculating cumulative growth metrics...')
    for collection, timestamp_field in collections_to_timestamp_fields.items():
        print(f'Processing "{collection}" collection...')
        fields = ['date', collection]
        rows = []
        start_date = datetime.datetime(2022, 1, 1)
        end_date = datetime.datetime.now()
        delta = datetime.timedelta(days=1)
        while start_date <= end_date:
            posts = db.collection(collection).where(timestamp_field, "<=", start_date).get()
            rows.append([start_date.date(), len(posts)])
            start_date += delta
        with open(f'{collection}.csv', 'w') as f:
            writer = csv.writer(f)
            writer.writerow(fields)
            writer.writerows(rows)

def calculate_retention(db):
    print('Calculating retention...')
    fields = ['week', 'retention']
    rows = []
    week_start = datetime.datetime(2022, 1, 2) # start on sunday
    end_date = datetime.datetime.now()
    delta = datetime.timedelta(days=7)
    while week_start <= end_date:
        users = db.collection('users').where('creationTimestamp', '<', week_start + delta).get()
        user_ids = [u.id for u in users]
        posts = db.collection('posts').where('timestamp', '>=', week_start).where('timestamp', '<', week_start + delta).get()
        post_unique_user_ids = list(set([p.get('user').id for p in posts]))
        retention = float(len(post_unique_user_ids)) / len(user_ids) if len(user_ids) != 0 else 0
        rows.append([week_start.date(), retention])
        week_start += delta
    with open(f'retention.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

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
    calculate_cumulative_growth_metrics(db)
    calculate_retention(db)
