#!/usr/bin/env python3
import argparse
import csv
import firebase_admin
import json
from firebase_admin import auth, credentials, firestore
from os import environ

def get_user_ids_to_data(db):
    print('Getting authenticated users...')
    user_ids_to_data = {}
    for u in auth.list_users().iterate_all():
        auth_user = auth.get_user(u.uid)
        users = db.collection('users').where('phoneNumber', '==', u.phone_number).get()
        if len(users) != 1:
            continue
        user = users[0]
        user_ids_to_data[user.id] = {
            'email': user.get('email'),
        }
    return user_ids_to_data

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    args = parser.parse_args()

    token_dict = None
    with open(args.cert_path, 'r') as f:
        token_dict = json.load(f)

    credentials = credentials.Certificate(token_dict)
    firebase_admin.initialize_app(credentials)

    db = firestore.client()

    user_ids_to_data = get_user_ids_to_data(db)
    emails = [d['email'] for _, d in user_ids_to_data.items() if len(d['email']) > 0]
    for e in emails:
        print(e)
