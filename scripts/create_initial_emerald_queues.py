#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
from firebase_admin import credentials, firestore
from os import environ

def create_queue_posts(db):
    print('Creating queue for posts...')
    posts = db.collection('posts').stream()
    for p in posts:
        post_dict = p.to_dict()
        data = {
            'postId': p.id
        }
        db.collection('queueposts').add(data)

def create_queue_want_to_tastes(db):
    print('Creating queue for want to tastes...')
    users = db.collection('users').stream()
    for u in users:
        user_dict = u.to_dict()
        for place in user_dict.get('wantToTaste', []):
            data = {
                'user': u.reference,
                'place': place,
                'timestamp': datetime.datetime.now()
            }
            db.collection('queuewanttotastes').add(data)

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

    create_queue_posts(db)
    create_queue_want_to_tastes(db)
