#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
from firebase_admin import auth, credentials, firestore
from os import environ

def get_user_ids_to_creation_timestamps(db):
    print('Getting authenticated users...')
    user_ids_to_creation_timestamps = {}
    for u in auth.list_users().iterate_all():
        auth_user = auth.get_user(u.uid)
        users = db.collection('users').where('phoneNumber', '==', u.phone_number).get()
        if len(users) != 1:
            continue
        epoch_creation_timestamp = auth_user.user_metadata.creation_timestamp / 1000
        user_ids_to_creation_timestamps[users[0].id] = datetime.datetime.fromtimestamp(epoch_creation_timestamp)
    return user_ids_to_creation_timestamps

def calculate_cumulative_growth_metrics(db, user_ids_to_creation_timestamps):
    collections_to_query_data = {
        'posts': {
            'timestampKey': 'timestamp',
            'startDate': datetime.datetime(2022, 1, 1)
        },
        'notifications': {
            'timestampKey': 'timestamp',
            'startDate': datetime.datetime(2022, 4, 1)
        }
    }

    print('Calculating cumulative growth metrics...')
    for collection, query_data in collections_to_query_data.items():
        print(f'Processing "{collection}" collection...')
        fields = ['date', collection]
        rows = []
        start_date = query_data['startDate']
        end_date = datetime.datetime.now()
        delta = datetime.timedelta(days=1)
        while start_date <= end_date:
            posts = db.collection(collection).where(query_data['timestampKey'], "<=", start_date).get()
            rows.append([start_date.date(), len(posts)])
            start_date += delta
        with open(f'metrics/{collection}.csv', 'w') as f:
            writer = csv.writer(f)
            writer.writerow(fields)
            writer.writerows(rows)

    print('Processing "replies" collection...')
    fields = ['date', 'replies']
    rows = []
    start_date = datetime.datetime(2022, 4, 1) # shipped early April
    end_date = datetime.datetime.now()
    delta = datetime.timedelta(days=1)
    while start_date <= end_date:
        posts = db.collection('posts').where('timestamp', "<=", start_date).get()
        replies_count = 0
        for p in posts:
            replies = db.collection('posts').document(p.id).collection('replies').where('timestamp', "<=", start_date).get()
            replies_count += len(replies)
        rows.append([start_date.date(), replies_count])
        start_date += delta
    with open('metrics/replies.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

    print('Processing authenticated users...')
    user_creation_timestamps = sorted(user_ids_to_creation_timestamps.values())
    fields = ['date', 'users']
    rows = []
    start_date = datetime.datetime(2022, 1, 15) # shipped mid January
    end_date = datetime.datetime.now()
    delta = datetime.timedelta(days=1)
    index = 0
    while start_date <= end_date:
        while user_creation_timestamps[index] < start_date:
            index += 1
            if index == len(user_creation_timestamps):
                break
        rows.append([start_date.date(), index])
        start_date += delta
    with open('metrics/users.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

def calculate_retention(db, user_ids_to_creation_timestamps):
    print('Calculating retention...')
    fields = ['week', 'retention']
    rows = []
    week_start = datetime.datetime(2022, 1, 3) # start on Monday
    end_date = datetime.datetime.now()
    delta = datetime.timedelta(days=7)
    while week_start <= end_date:
        user_ids = [u for u, ct in user_ids_to_creation_timestamps.items() if ct < week_start + delta]
        posts = db.collection('posts').where('timestamp', '>=', week_start).where('timestamp', '<', week_start + delta).get()
        post_unique_user_ids = list(set([p.get('user').id for p in posts]))
        retention = float(len(post_unique_user_ids)) / len(user_ids) if len(user_ids) != 0 else 0
        rows.append([week_start.date(), retention])
        week_start += delta
    with open(f'metrics/retention.csv', 'w') as f:
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
        print('ERROR: you should run this against a local emulator that was restored with the database')
        exit(1)

    db = firestore.client()
    user_ids_to_creation_timestamps = get_user_ids_to_creation_timestamps(db)
    calculate_cumulative_growth_metrics(db, user_ids_to_creation_timestamps)
    calculate_retention(db, user_ids_to_creation_timestamps)
