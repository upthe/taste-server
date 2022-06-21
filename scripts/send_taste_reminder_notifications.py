#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
import random
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
            'firstName': user.get('firstName'),
            'handle': user.get('handle'),
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
            'timestamp': p.get('timestamp').replace(tzinfo=pytz.UTC)
        }
    return post_ids_to_data

def get_last_week_users(user_ids_to_data, post_ids_to_data):
    print('Getting users who posted and did not post in the last week...')
    all_users = set(user_ids_to_data.keys())
    now = datetime.datetime.now().replace(tzinfo=pytz.UTC)
    delta = datetime.timedelta(days=7)

    posts_in_last_week = [d for p, d in post_ids_to_data.items() if d['timestamp'] > now - delta]
    users_who_posted = set([p['user'] for p in posts_in_last_week])

    all_users_who_did_not_post = all_users.difference(users_who_posted)
    users_who_did_not_post = set([u for u in all_users_who_did_not_post if user_ids_to_data[u]['timestamp'] < now - 2 * delta])

    return users_who_posted, users_who_did_not_post

def create_friend_graph_by_ids(user_ids_to_data):
    print('Creating friend graph...')
    friend_graph = {}
    for u, d in user_ids_to_data.items():
        friend_graph[u] = [i.id for i in d['friends']]
    return friend_graph

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
    user_ids_to_data = get_user_ids_to_data(db)
    post_ids_to_data = get_post_ids_to_data(db)
    friend_graph = create_friend_graph_by_ids(user_ids_to_data)
    users_who_posted, users_who_did_not_post = get_last_week_users(user_ids_to_data, post_ids_to_data)

    rand_title = random.choice([
        'Help your friends discover new places',
        'Recommend new places to your friends',
        'Share new places with your friends',
    ])

    for u in users_who_did_not_post:
        print(f'Processing user {user_ids_to_data[u]["handle"]}...')
        user = user_ids_to_data[u]
        friends_who_posted = list(users_who_posted.intersection(set([f.id for f in user['friends']])))

        payload = {
            'ownerId': u,
            'type': 'AddTasteReminder',
            'title': rand_title,
            'body': '',
            'notificationIcon': 'ADD_TASTE',
            'notificationLink': 'ADD_TASTE',
            'seen': False,
            'timestamp': firestore.SERVER_TIMESTAMP
        }

        if len(friends_who_posted) == 0:
            payload['body'] = 'Let them know where you went last week - add a taste'
        elif len(friends_who_posted) == 1:
            friend_name = user_ids_to_data[friends_who_posted[0]]['firstName']
            payload['body'] = f'{friend_name} added a taste in the last week - add yours'
        elif len(friends_who_posted) == 2:
            friend1_name = user_ids_to_data[friends_who_posted[0]]['firstName']
            friend2_name = user_ids_to_data[friends_who_posted[1]]['firstName']
            payload['body'] = f'{friend1_name} and {friend2_name} added tastes in the last week - add yours'
        else:
            rand_friends = random.sample(friends_who_posted, 3)
            friend1_name = user_ids_to_data[rand_friends[0]]['firstName']
            friend2_name = user_ids_to_data[rand_friends[1]]['firstName']
            friend3_name = user_ids_to_data[rand_friends[2]]['firstName']
            payload['body'] = f'{friend1_name}, {friend2_name}, and {friend3_name} added tastes in the last week - add yours'

        print(f'Creating notification {payload}...')
        db.collection('notifications').add(payload)
