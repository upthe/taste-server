#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
from firebase_admin import credentials, firestore
from os import environ

def _get_user_ids_to_data(db):
    print('Getting users...')
    user_ids_to_data = {}
    users = db.collection('users').stream()
    for u in users:
        user_dict = u.to_dict()
        user_ids_to_data[u.id] = {
            'firstName': user_dict.get('firstName'),
            'lastName': user_dict.get('lastName'),
            'handle': user_dict.get('handle'),
            'emerald': user_dict.get('emerald', False),
            'emeraldCreds': user_dict.get('emeraldCreds', 0),
            'friends': [f.id for f in user_dict.get('friends')]
        }
    return user_ids_to_data

def _get_event_ids_to_data(db):
    print('Getting events...')
    event_ids_to_data = {}
    events = db.collection('events').stream()
    for e in events:
        event_dict = e.to_dict()
        event_ids_to_data[e.id] = event_dict
    return event_ids_to_data

def set_user_creds(db, user_ids_to_data, event_ids_to_data):
    event_type_to_creds = {
        'UserPostedTaste': 1,
        'UserTastedPlaceFirst': 2,
        'FriendWantsToTastePlaceYouTasted': 3,
        'FriendTastedPlaceYouTasted': 4,
        'FriendLikedPlaceYouTasted': 5
    }
    user_ids_to_creds = {}

    for u in user_ids_to_data:
        print(f'Processing user {u}...')
        creds = 0
        events = [e for _, e in event_ids_to_data.items() if e['user'] == u]
        for event in events:
            event_type = event['type']
            creds += event_type_to_creds[event_type]
        user_ids_to_creds[u] = creds
        db.collection('users').document(u).update({
            'emeraldCreds': creds
        })
    return user_ids_to_creds

def calculate_emerald_user_ids(user_ids_to_creds):
    tuples = [(u, c) for u, c in user_ids_to_creds.items()]
    tuples = sorted(tuples, key=lambda t: t[1], reverse=True)

    emerald_user_ids = []
    num_emerald_ranks = int(len(user_ids_to_creds) * 0.1)
    i = 0
    while i < num_emerald_ranks:
        user_id, creds = tuples[i]
        emerald_user_ids.append(user_id)
        j = i + 1
        while j < len(user_ids_to_creds):
            next_user_id, next_creds = tuples[j]
            if next_creds == creds:
                emerald_user_ids.append(next_user_id)
                j += 1
            else:
                break
        i = j
    return emerald_user_ids

def process_emerald_statuses(db, user_ids_to_data, current_emerald_user_ids, updated_emerald_user_ids):
    remove_emerald_user_ids = list(set(current_emerald_user_ids) - set(updated_emerald_user_ids))
    award_emerald_user_ids = list(set(updated_emerald_user_ids) - set(current_emerald_user_ids))
    for u in remove_emerald_user_ids:
        print(f'Removing Emerald status from {user_ids_to_data[u]["handle"]}...')
        # db.collection('users').document(u).update({
        #     'emerald': False
        # })
    for u in award_emerald_user_ids:
        print(f'Awarding Emerald status to {user_ids_to_data[u]["handle"]}...')
        # db.collection('users').document(u).update({
        #     'emerald': True
        # })

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

    user_ids_to_data = _get_user_ids_to_data(db)
    event_ids_to_data = _get_event_ids_to_data(db)
    user_ids_to_creds = set_user_creds(db, user_ids_to_data, event_ids_to_data)
    current_emerald_user_ids = [u for u, d in user_ids_to_data.items() if d['emerald']]
    updated_emerald_user_ids = calculate_emerald_user_ids(user_ids_to_creds)
    process_emerald_statuses(db, user_ids_to_data, current_emerald_user_ids, updated_emerald_user_ids)
