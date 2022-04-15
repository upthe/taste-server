#!/usr/bin/env python3
import argparse
import csv
import firebase_admin
import json
from firebase_admin import credentials, firestore
from os import environ

def set_post_replies(db):
    posts = db.collection('posts').stream()
    for p in posts:
        current_reply_owner_refs = p.to_dict().get('replyOwnerRefs', [])
        replies = db.collection('posts').document(p.id).collection('replies').get()
        new_reply_owner_refs = [r.get('owner') for r in replies]
        if len(new_reply_owner_refs) == 0 or current_reply_owner_refs == new_reply_owner_refs:
            print(f'Skipping reply owners on post "{p.id}"...')
            continue
        print(f'Setting reply owners on post "{p.id}"...')
        db.collection('posts').document(p.id).update({
            'replyOwnerRefs': new_reply_owner_refs
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
    set_post_replies(db)
