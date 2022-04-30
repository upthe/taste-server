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
            'wantToTaste': [p.id for p in user_dict.get('wantToTaste')],
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

    for u in user_ids_to_data:
        print(f'Processing user {u}...')
        creds = 0
        events = [e for _, e in event_ids_to_data.items() if e['user'] == u]
        for event in events:
            event_type = event['type']
            creds += event_type_to_creds[event_type]
        db.collection('users').document(u).update({
            'emeraldCreds': creds
        })

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
    set_user_creds(db, user_ids_to_data, event_ids_to_data)
