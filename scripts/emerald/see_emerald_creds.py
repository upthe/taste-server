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
            'id': u.id,
            'firstName': user_dict.get('firstName'),
            'lastName': user_dict.get('lastName'),
            'handle': user_dict.get('handle'),
            'wantToTaste': [p.id for p in user_dict.get('wantToTaste')],
            'friends': [f.id for f in user_dict.get('friends')]
        }
    return user_ids_to_data

def _get_place_ids_to_data(db):
    print('Getting places...')
    place_ids_to_data = {}
    places = db.collection('places').stream()
    for p in places:
        place_dict = p.to_dict()
        place_ids_to_data[p.id] = {
            'id': p.id,
            'name': place_dict.get('name')
        }
    return place_ids_to_data

def _get_post_ids_to_data(db):
    print('Getting posts...')
    post_ids_to_data = {}
    posts = db.collection('posts').stream()
    for p in posts:
        post_data = p.to_dict()
        post_ids_to_data[p.id] = {
            'user': post_data.get('user').id,
            'place': post_data.get('place').id,
            'starRating': post_data.get('starRating'),
            'timestamp': post_data.get('timestamp')
        }
    return post_ids_to_data

def _get_event_ids_to_data(db):
    print('Getting events...')
    event_ids_to_data = {}
    events = db.collection('events').stream()
    for e in events:
        event_dict = e.to_dict()
        event_ids_to_data[e.id] = event_dict
    return event_ids_to_data

def see_user_creds(user_ids_to_data, place_ids_to_data, post_ids_to_data, event_ids_to_data, event_type_to_creds, handle):
    print(f'Getting user creds for "{handle}"...')
    users = [d for u, d in user_ids_to_data.items() if d['handle'] == f'{handle}']
    if len(users) != 1:
        print(f'ERROR: cannot find user with handle {handle} or found multiple')
        exit(1)
    user = users[0]
    total_creds = 0
    events = [d for e, d in event_ids_to_data.items() if d['user'] == user['id']]
    events = sorted(events, key=lambda e: e['timestamp'])
    for e in events:
        event_type = e['type']
        event_data = e['data']
        creds = event_type_to_creds[event_type]
        if event_type == 'UserPostedTaste':
            total_creds += creds
            post_id = event_data['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            place = place_ids_to_data[place_id]
            print(f'Awarding {creds} creds for tasting "{place["name"]}"...')
        elif event_type == 'UserTastedPlaceFirst':
            total_creds += creds
            post_id = event_data['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            place = place_ids_to_data[place_id]
            print(f'Awarding {creds} creds for first taste on "{place["name"]}"...')
        elif event_type == 'FriendWantsToTastePlaceYouTasted':
            total_creds += creds
            place_id = event_data['place']
            place = place_ids_to_data[place_id]
            friend_id = event_data['user']
            friend = user_ids_to_data[friend_id]
            print(f'Awarding {creds} creds for getting friend "{friend["handle"]}" to want to taste "{place["name"]}"...')
        elif event_type == 'FriendTastedPlaceYouTasted':
            total_creds += creds
            post_id = event_data['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            place = place_ids_to_data[place_id]
            friend_id = post['user']
            friend = user_ids_to_data[friend_id]
            print(f'Awarding {creds} creds for getting friend "{friend["handle"]}" to taste "{place["name"]}"...')
        elif event_type == 'FriendLikedPlaceYouTasted':
            total_creds += creds
            post_id = event_data['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            place = place_ids_to_data[place_id]
            friend_id = post['user']
            friend = user_ids_to_data[friend_id]
            print(f'Awarding {creds} creds for getting friend "{friend["handle"]}" to like "{place["name"]}"...')
    print(f'Total creds: {total_creds}')

def get_user_ids_to_creds_tuples(user_ids_to_data, event_ids_to_data, event_type_to_creds):
    user_ids_to_creds_tuples = []
    for u in user_ids_to_data:
        print(f'Processing user {u}...')
        creds = 0
        events = [e for _, e in event_ids_to_data.items() if e['user'] == u]
        for event in events:
            event_type = event['type']
            creds += event_type_to_creds[event_type]
        user_ids_to_creds_tuples.append((u, creds))
    return user_ids_to_creds_tuples

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    parser.add_argument('--user-handle', type=str, required=False)
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
    place_ids_to_data = _get_place_ids_to_data(db)
    post_ids_to_data = _get_post_ids_to_data(db)
    event_ids_to_data = _get_event_ids_to_data(db)

    event_type_to_creds = {
        'UserPostedTaste': 1,
        'UserTastedPlaceFirst': 2,
        'FriendWantsToTastePlaceYouTasted': 3,
        'FriendTastedPlaceYouTasted': 4,
        'FriendLikedPlaceYouTasted': 5
    }
    if args.user_handle:
        see_user_creds(user_ids_to_data, place_ids_to_data, post_ids_to_data, event_ids_to_data, event_type_to_creds, args.user_handle)
    else:
        user_ids_to_creds_tuples = get_user_ids_to_creds_tuples(user_ids_to_data, event_ids_to_data, event_type_to_creds)
        user_ids_to_creds_tuples = sorted(user_ids_to_creds_tuples, key=lambda t: t[1], reverse=True)
        for i in range(0, len(user_ids_to_creds_tuples)):
            user_id_to_creds_tuple = user_ids_to_creds_tuples[i]
            user = user_ids_to_data[user_id_to_creds_tuple[0]]
            print(f'{i + 1}. {user["handle"]} - {user_id_to_creds_tuple[1]}')
