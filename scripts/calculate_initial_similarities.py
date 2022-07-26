#!/usr/bin/env python3
import argparse
import firebase_admin
import json
from collections import namedtuple
from firebase_admin import credentials, firestore
from os import environ

def get_user_ids_to_data(db):
    print('Getting users...')
    user_ids_to_data = {}
    users = db.collection('users').stream()
    for u in users:
        user_dict = u.to_dict()
        user_ids_to_data[u.id] = {
            'handle': user_dict.get('handle'),
            'friends': [f.id for f in user_dict.get('friends')],
            'tasted': [p.id for p in user_dict.get('tasted')],
            'hasSignedIn': user_dict.get('hasSignedIn', True),
        }
    return user_ids_to_data

def calculate_friend_sets(user_ids_to_data):
    print('Calculating friend sets...')
    friend_sets = set()
    for u, d in user_ids_to_data.items():
        if not user_ids_to_data[u]['hasSignedIn']:
            continue
        for f in d['friends']:
            if not user_ids_to_data[f]['hasSignedIn']:
                continue
            friend_sets.add(frozenset([u, f]))
    return friend_sets

def get_post_ids_to_data(db):
    print('Getting posts...')
    post_ids_to_data = {}
    posts = db.collection('posts').stream()
    for p in posts:
        post_dict = p.to_dict()
        post_ids_to_data[p.id] = {
            'user': post_dict.get('user').id,
            'place': post_dict.get('place').id,
            'starRating': post_dict.get('starRating'),
        }
    return post_ids_to_data

def upsert_similarity(db, friend_set, user_ids_to_data):
    friend_list = list(friend_set)
    u1 = friend_list[0]
    u2 = friend_list[1]
    u1_handle = user_ids_to_data[u1]['handle']
    u2_handle = user_ids_to_data[u2]['handle']
    common_places = list(set(user_ids_to_data[u1]['tasted']).intersection(set(user_ids_to_data[u2]['tasted'])))

    if len(common_places) < 5:
        return

    max_diff = 4 * len(common_places)
    diff = 0
    for place_id in common_places:
        u1_posts = [p for p, d in post_ids_to_data.items() if d['place'] == place_id and d['user'] == u1]
        u2_posts = [p for p, d in post_ids_to_data.items() if d['place'] == place_id and d['user'] == u2]
        if len(u1_posts) == 0 or len(u2_posts) == 0:
            continue

        u1_star_ratings = [post_ids_to_data[p]['starRating'] for p in u1_posts]
        u2_star_ratings = [post_ids_to_data[p]['starRating'] for p in u2_posts]
        u1_avg_star_rating = sum(u1_star_ratings) / len(u1_star_ratings)
        u2_avg_star_rating = sum(u2_star_ratings) / len(u2_star_ratings)
        diff += abs(u1_avg_star_rating - u2_avg_star_rating)
    similarity = (max_diff - diff) / max_diff

    print(f'Upserting similarity of {round(similarity, 2)} for {u1_handle}/{u2_handle}...')
    # TODO: upsert similarity

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
    user_ids_to_data = get_user_ids_to_data(db)
    post_ids_to_data = get_post_ids_to_data(db)
    friend_sets = calculate_friend_sets(user_ids_to_data)
    for fs in friend_sets:
        upsert_similarity(db, fs, user_ids_to_data)
