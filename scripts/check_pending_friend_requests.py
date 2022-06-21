#!/usr/bin/env python3
import argparse
import csv
import firebase_admin
import json
from firebase_admin import credentials, firestore
from os import environ

def get_user_ids_to_data(db):
    print('Getting users...')
    user_ids_to_data = {}
    users = db.collection('users').stream()
    for u in users:
        user_dict = u.to_dict()
        user_ids_to_data[u.id] = {
            'firstName': user_dict.get('firstName'),
            'lastName': user_dict.get('lastName'),
            'handle': user_dict.get('handle'),
            'sentFriendRequests': [f.id for f in user_dict.get('sentFriendRequests', [])],
            'hasSignedIn': user_dict.get('hasSignedIn', True),
        }
    return user_ids_to_data

def process_user_ids_to_data(user_ids_to_data):
    for u, d in user_ids_to_data.items():
        if len(d['sentFriendRequests']) == 0:
            continue
        pending_friends = [user_ids_to_data[f]["handle"] for f in d["sentFriendRequests"] if user_ids_to_data[f]["hasSignedIn"]]
        print(f'{user_ids_to_data[u]["handle"]} has pending friend requests: {pending_friends}')

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
    process_user_ids_to_data(user_ids_to_data)
