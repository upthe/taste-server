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
            'cuisines': place_dict.get('cuisines'),
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
            'cuisines': post_dict.get('cuisines', None)
        }
    return post_ids_to_data

def set_posts_cuisines(place_ids_to_data, post_ids_to_data):
    print('Setting cuisines on posts...')
    for place_id, place_data in place_ids_to_data.items():
        print(f'Processing posts for place {place_data["name"]} ({place_id})...')
        cuisines = place_data['cuisines']
        post_ids = [pid for pid, pd in post_ids_to_data.items() if pd['place'] == place_id]
        for post_id in post_ids:
            if post_ids_to_data[post_id]['cuisines'] == cuisines:
                continue
            print(f'Updating post {post_id}...')
            db.collection('posts').document(post_id).update({
                'cuisines': cuisines
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
    place_ids_to_data = get_place_ids_to_data(db)
    post_ids_to_data = get_post_ids_to_data(db)
    set_posts_cuisines(place_ids_to_data, post_ids_to_data)
