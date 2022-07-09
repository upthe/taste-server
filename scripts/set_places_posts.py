#!/usr/bin/env python3
import argparse
import firebase_admin
import json
from collections import namedtuple
from firebase_admin import credentials, firestore
from os import environ

def get_place_ids_to_data(db):
    print('Getting places...')
    place_ids_to_data = {}
    places = db.collection('places').stream()
    for p in places:
        place_dict = p.to_dict()
        place_ids_to_data[p.id] = {
            'name': place_dict.get('name'),
            'postsCount': place_dict.get('postsCount', 0)
        }
    return place_ids_to_data

def get_post_ids_to_data(db):
    print('Getting posts...')
    post_ids_to_data = {}
    posts = db.collection('posts').stream()
    for p in posts:
        post_dict = p.to_dict()
        post_ids_to_data[p.id] = {
            'place': post_dict.get('place').id,
        }
    return post_ids_to_data

def set_places_posts(place_ids_to_data, post_ids_to_data):
    print('Setting number of posts on places...')
    for place_id, place_data in place_ids_to_data.items():
        posts = [p for p, d in post_ids_to_data.items() if d['place'] == place_id]
        if len(posts) == place_data['postsCount']:
            continue
        print(f'Updating posts count for {place_id}...')    
        db.collection('places').document(place_id).update({
            'postsCount': len(posts)
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

    if not 'FIRESTORE_EMULATOR_HOST' in environ and 'BYPASS_FIREBASE_PRODUCTION_PROMPT' not in environ:
        confirm = input('WARNING: connected to production, type "y" to continue: ')
        if confirm != "y":
            exit(0)

    db = firestore.client()
    place_ids_to_data = get_place_ids_to_data(db)
    post_ids_to_data = get_post_ids_to_data(db)
    set_places_posts(place_ids_to_data, post_ids_to_data)
