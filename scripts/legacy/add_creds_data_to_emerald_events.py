#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
from firebase_admin import credentials, firestore
from os import environ

def _get_post_ids_to_data(db):
    print('Getting posts...')
    post_ids_to_data = {}
    posts = db.collection('posts').stream()
    for p in posts:
        post_dict = p.to_dict()
        post_ids_to_data[p.id] = {
            'id': p.id,
            'user': post_dict.get('user').id,
            'place': post_dict.get('place').id,
            'starRating': post_dict.get('starRating'),
            'review': post_dict.get('review'),
            'retaste': post_dict.get('retaste', False),
            'timestamp': post_dict.get('timestamp').replace(tzinfo=pytz.UTC)
        }
    return post_ids_to_data

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
    post_ids_to_data = _get_post_ids_to_data(db)
    user_ids_to_data = _get_user_ids_to_data(db)
    place_ids_to_data = _get_place_ids_to_data(db)

    for e in db.collection('events').stream():
        event = e.to_dict()
        event_type = event['type']

        if event_type == 'UserPostedTaste':
            post_id = event['data']['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            place = place_ids_to_data[place_id]
            place_name = place['name']
            print(event_type, place_name)
            db.collection('events').document(e.id).update({
                'credsData': {
                    'placeName': place_name
                }
            })
        elif event_type == 'UserTastedPlaceFirst':
            post_id = event['data']['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            place = place_ids_to_data[place_id]
            place_name = place['name']
            print(event_type, place_name)
            db.collection('events').document(e.id).update({
                'credsData': {
                    'placeName': place_name
                }
            })
        elif event_type == 'FriendWantsToTastePlaceYouTasted':
            place_id = event['data']['place']
            place = place_ids_to_data[place_id]
            place_name = place['name']
            user_id = event['data']['user']
            user = user_ids_to_data[user_id]
            user_first_name = user['firstName']
            print(event_type, user_first_name, place_name)
            db.collection('events').document(e.id).update({
                'credsData': {
                    'friendFirstName': user_first_name,
                    'placeName': place_name
                }
            })
        elif event_type == 'FriendTastedPlaceYouTasted' or event_type == 'FriendLikedPlaceYouTasted':
            post_id = event['data']['post']
            post = post_ids_to_data[post_id]
            place_id = post['place']
            user_id = post['user']
            user = user_ids_to_data[user_id]
            place = place_ids_to_data[place_id]
            user_first_name = user['firstName']
            place_name = place['name']
            print(event_type, user_first_name, place_name)
            db.collection('events').document(e.id).update({
                'credsData': {
                    'friendFirstName': user_first_name,
                    'placeName': place_name
                }
            })
