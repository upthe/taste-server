#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
from firebase_admin import auth, credentials, firestore
from os import environ

def get_user_ids_to_data(db):
    print('Getting authenticated users...')
    user_ids_to_data = {}
    for u in auth.list_users().iterate_all():
        auth_user = auth.get_user(u.uid)
        users = db.collection('users').where('phoneNumber', '==', u.phone_number).get()
        if len(users) != 1:
            continue
        epoch_creation_timestamp = auth_user.user_metadata.creation_timestamp / 1000
        user_ids_to_data[users[0].id] = {
            'timestamp': datetime.datetime.fromtimestamp(epoch_creation_timestamp).replace(tzinfo=pytz.UTC)
        }
    return user_ids_to_data

def get_post_ids_to_data(db):
    print('Getting posts...')
    post_ids_to_data = {}
    posts = db.collection('posts').get()
    for p in posts:
        post_ids_to_data[p.id] = {
            'user': p.get('user').id,
            'timestamp': p.get('timestamp').replace(tzinfo=pytz.UTC)
        }
    return post_ids_to_data

def get_reply_ids_to_data(db, post_ids_to_data):
    print('Getting replies...')
    reply_ids_to_data = {}
    for p in post_ids_to_data:
        replies = db.collection('posts').document(p).collection('replies').get()
        for r in replies:
            reply_ids_to_data[r.id] = {
                'timestamp': r.get('timestamp').replace(tzinfo=pytz.UTC)
            }
    return reply_ids_to_data

def get_notification_ids_to_data(db):
    print('Getting notifications...')
    notification_ids_to_data = {}
    notifications = db.collection('notifications').get()
    for n in notifications:
        notification_ids_to_data[n.id] = {
            'timestamp': n.get('timestamp').replace(tzinfo=pytz.UTC)
        }
    return notification_ids_to_data

def calculate_cumulative_growth_metrics(db, user_ids_to_data, post_ids_to_data, reply_ids_to_data, notification_ids_to_data):
    print('Calculating cumulative growth metrics...')
    collections_to_query_data = {
        'users': {
            'map': user_ids_to_data,
            'startDate': datetime.datetime(2022, 1, 17)
        },
        'posts': {
            'map': post_ids_to_data,
            'startDate': datetime.datetime(2022, 1, 17)
        },
        'replies': {
            'map': reply_ids_to_data,
            'startDate': datetime.datetime(2022, 4, 1)
        },
        'notifications': {
            'map': notification_ids_to_data,
            'startDate': datetime.datetime(2022, 4, 1)
        }
    }

    for collection, data in collections_to_query_data.items():
        print(f'  Processing {collection}...')
        collection_map = data['map']
        fields = ['date', f'num_{collection}']
        rows = []
        delta = datetime.timedelta(days=1)
        start_date = data['startDate'].replace(tzinfo=pytz.UTC)
        end_date = datetime.datetime.now().replace(tzinfo=pytz.UTC) - delta
        while start_date <= end_date:
            count = len([k for k, v in collection_map.items() if v['timestamp'] < start_date])
            rows.append([start_date.date(), count])
            start_date += delta
        with open(f'metrics/{collection}.csv', 'w') as f:
            writer = csv.writer(f)
            writer.writerow(fields)
            writer.writerows(rows)

def calculate_retention_metrics(db, user_ids_to_data, post_ids_to_data):
    print('Calculating retention metrics...')
    fields = ['start_week', 'num_unique_users_who_posted', 'num_users', 'num_posts']
    rows = []
    delta = datetime.timedelta(days=7)
    start_date = datetime.datetime(2022, 1, 11).replace(tzinfo=pytz.UTC) # start on Tuesday
    end_date = datetime.datetime.now().replace(tzinfo=pytz.UTC) - delta
    while start_date < end_date:
        users = [u for u, d in user_ids_to_data.items() if d['timestamp'] < start_date + delta]
        posts = [d for p, d in post_ids_to_data.items() if start_date < d['timestamp'] < start_date + delta]
        post_unique_user_ids = list(set([p['user'] for p in posts]))
        rows.append([start_date.date(), len(post_unique_user_ids), len(users), len(posts)])
        start_date += delta
    with open(f'metrics/retention.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

def capture_post_spread_metrics(db, user_ids_to_data, post_ids_to_data):
    print('Calculating post spread metrics...')
    week_to_user_post_spread = {}
    delta = datetime.timedelta(days=7)
    start_date = datetime.datetime(2022, 1, 11).replace(tzinfo=pytz.UTC) # start on Tuesday
    end_date = datetime.datetime.now().replace(tzinfo=pytz.UTC) - delta
    while start_date < end_date:
        users = [u for u, d in user_ids_to_data.items() if d['timestamp'] < start_date + delta]
        posts = [p for p, d in post_ids_to_data.items() if start_date < d['timestamp'] < start_date + delta]
        users_to_posts = {}
        for u in users:
            user_posts = [p for p in posts if post_ids_to_data[p]['user'] == u]
            users_to_posts[u] = user_posts
        week_to_user_post_spread[str(start_date.date())] = {
            u: users_to_posts[u] for u in users
        }
        start_date += delta
    with open(f'metrics/post_spread.csv', 'w') as f:
        writer = csv.writer(f)
        weeks = sorted(week_to_user_post_spread.keys())
        writer.writerow(['users'] + weeks)
        users = sorted(week_to_user_post_spread[weeks[-1]].keys())
        for u in users:
            row = [u]
            for w in weeks:
                row.append(len(week_to_user_post_spread[w].get(u, [])))
            writer.writerow(row)

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
    user_ids_to_data = get_user_ids_to_data(db)
    post_ids_to_data = get_post_ids_to_data(db)
    reply_ids_to_data = get_reply_ids_to_data(db, post_ids_to_data)
    notification_ids_to_data = get_notification_ids_to_data(db)
    calculate_cumulative_growth_metrics(db, user_ids_to_data, post_ids_to_data, reply_ids_to_data, notification_ids_to_data)
    calculate_retention_metrics(db, user_ids_to_data, post_ids_to_data)
    capture_post_spread_metrics(db, user_ids_to_data, post_ids_to_data)
