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
        user = users[0]
        user_ids_to_data[user.id] = {
            'handle': user.get('handle'),
            'phoneNumber': user.get('phoneNumber'),
            'wantToTaste': user.get('wantToTaste'),
            'friends': user.get('friends'),
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
            'place': p.get('place').id,
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

def get_session_ids_to_data(db):
    print('Getting sessions...')
    session_ids_to_data = {}
    sessions = db.collection('sessions').get()
    for s in sessions:
        session_ids_to_data[s.id] = {
            'userPhoneNumber': s.get('userPhoneNumber'),
            'timestamp': s.get('timestamp').replace(tzinfo=pytz.UTC)
        }
    return session_ids_to_data

def calculate_raw_count_metrics(user_ids_to_data, post_ids_to_data, reply_ids_to_data, notification_ids_to_data):
    print('Calculating raw count metrics...')
    collections_to_maps = {
        'users': user_ids_to_data,
        'posts': post_ids_to_data,
        'replies': reply_ids_to_data,
        'notifications': notification_ids_to_data
    }

    fields = ['date', 'users', 'posts', 'replies', 'notifications']
    rows = []
    delta = datetime.timedelta(days=1)
    start_date = datetime.datetime(2022, 1, 17).replace(tzinfo=pytz.UTC)
    end_date = datetime.datetime.now().replace(tzinfo=pytz.UTC) - delta
    while start_date < end_date:
        row = [start_date.date()]
        for f in  ['users', 'posts', 'replies', 'notifications']:
            collection_map = collections_to_maps[f]
            count = len([k for k, v in collection_map.items() if v['timestamp'] < start_date])
            row.append(count)
        rows.append(row)
        start_date += delta
    with open('metrics/raw_counts.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

def calculate_top_line_metrics(user_ids_to_data, post_ids_to_data, session_ids_to_data):
    print('Calculating top-line metrics...')
    fields = ['start_week', 'users', 'posts', 'users_who_tasted', 'users_who_visited']
    rows = []
    delta = datetime.timedelta(days=7)
    start_date = datetime.datetime(2022, 1, 11).replace(tzinfo=pytz.UTC) # start on Tuesday
    end_date = datetime.datetime.now().replace(tzinfo=pytz.UTC) - delta
    while start_date < end_date:
        users = [u for u, d in user_ids_to_data.items() if d['timestamp'] < start_date + delta]
        posts = [d for p, d in post_ids_to_data.items() if start_date < d['timestamp'] < start_date + delta]
        sessions = [d for s, d in session_ids_to_data.items() if start_date < d['timestamp'] < start_date + delta]
        post_unique_user_ids = list(set([p['user'] for p in posts]))
        session_unique_user_ids = list(set([s['userPhoneNumber'] for s in sessions]))
        rows.append([start_date.date(), len(users), len(posts), len(post_unique_user_ids), len(session_unique_user_ids)])
        start_date += delta
    with open(f'metrics/top_line.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

def calculate_core_spread_metrics(user_ids_to_data, post_ids_to_data, session_ids_to_data):
    print('Calculating core spread metrics...')
    week_to_user_taste_spread = {}
    week_to_user_visit_spread = {}
    week_to_place_spread = {}
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
        week_to_user_taste_spread[str(start_date.date())] = {
            u: users_to_posts[u] for u in users
        }

        sessions = [s for s, d in session_ids_to_data.items() if start_date < d['timestamp'] < start_date + delta]
        users_to_sessions = {}
        for u in users:
            user_sessions = [s for s in sessions if session_ids_to_data[s]['userPhoneNumber'] == user_ids_to_data[u]['phoneNumber']]
            users_to_sessions[u] = user_sessions
        week_to_user_visit_spread[str(start_date.date())] = {
            u: users_to_sessions[u] for u in users
        }

        start_date += delta

    for t in [('taste_spread.csv', week_to_user_taste_spread), ('visit_spread.csv', week_to_user_visit_spread)]:
        file_name = t[0]
        spread = t[1]
        with open(f'metrics/{file_name}', 'w') as f:
            writer = csv.writer(f)
            weeks = sorted(spread.keys())
            writer.writerow(['users'] + weeks)
            users = sorted(spread[weeks[-1]].keys())
            for u in users:
                row = [user_ids_to_data[u]['handle']]
                for w in weeks:
                    if u not in spread[w]:
                        row.append('')
                    else:
                        row.append(len(spread[w][u]))
                writer.writerow(row)

# warning: results are dependent on time the function is run
def calculate_friend_graphs(user_ids_to_data):
    print('Calculating friend graphs...')
    user_to_friends = {}
    for u, d in user_ids_to_data.items():
        friends = [user_ids_to_data[f.id]['handle'] for f in d['friends'] if f.id in user_ids_to_data]
        user_to_friends[u] = ' '.join(friends)
    with open('metrics/friend_graphs.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(['users', 'friends'])
        for u in sorted(user_ids_to_data.keys()):
            row = [user_ids_to_data[u]['handle']]
            row.append(user_to_friends[u])
            writer.writerow(row)

# warning: results are dependent on time the function is run
def calculate_want_to_taste_counts(user_ids_to_data):
    print('Calculating want to taste counts...')
    user_to_want_to_taste = {}
    for u, d in user_ids_to_data.items():
        friends = [user_ids_to_data[f.id]['handle'] for f in d['friends'] if f.id in user_ids_to_data]
        want_to_tastes = d['wantToTaste']
        user_to_want_to_taste[u] = len(want_to_tastes)
    with open('metrics/want_to_taste_counts.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(['users', 'want_to_taste_count'])
        for u in sorted(user_ids_to_data.keys()):
            row = [user_ids_to_data[u]['handle']]
            row.append(user_to_want_to_taste[u])
            writer.writerow(row)

def calculate_place_count(post_ids_to_data):
    print('Calculating place count...')
    delta = datetime.timedelta(days=7)
    start_date = datetime.datetime(2022, 1, 11).replace(tzinfo=pytz.UTC) # start on Tuesday
    end_date = datetime.datetime.now().replace(tzinfo=pytz.UTC) - delta
    week_to_place_counts = {}
    places_set = set()
    while start_date < end_date:
        posts = [p for p, d in post_ids_to_data.items() if start_date < d['timestamp'] < start_date + delta]
        week_places_set = set([post_ids_to_data[p]['place'] for p in posts])
        places_set = places_set.union(week_places_set)
        week_to_place_counts[str(start_date.date())] = len(places_set)
        start_date += delta
    with open('metrics/place_counts.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(['week', 'place_count'])
        for w in sorted(week_to_place_counts.keys()):
            writer.writerow([w, week_to_place_counts[w]])

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
    session_ids_to_data = get_session_ids_to_data(db)
    calculate_raw_count_metrics(user_ids_to_data, post_ids_to_data, reply_ids_to_data, notification_ids_to_data)
    calculate_top_line_metrics(user_ids_to_data, post_ids_to_data, session_ids_to_data)
    calculate_core_spread_metrics(user_ids_to_data, post_ids_to_data, session_ids_to_data)
    calculate_friend_graphs(user_ids_to_data)
    calculate_want_to_taste_counts(user_ids_to_data)
    calculate_place_count(post_ids_to_data)
