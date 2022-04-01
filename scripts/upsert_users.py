#!/usr/bin/env python3
import argparse
import csv
import firebase_admin
import json
from firebase_admin import credentials, firestore
from os import environ

class User:
    def __init__(self, first_name, last_name, email, phone_number, location, handle):
        self.first_name = first_name
        self.last_name = last_name
        self.email = email
        self.phone_number = phone_number
        self.location = location
        self.handle = handle

def get_current_users(db):
    users = []
    for user_doc in db.collection('users').stream():
        first_name = user_doc.get('firstName')
        last_name = user_doc.get('lastName')
        email = user_doc.get('email')
        phone_number = user_doc.get('phoneNumber')
        location = user_doc.get('location')
        handle = user_doc.get('handle')
        users.append(User(first_name, last_name, email, phone_number, location, handle))
    return users

def parse_users_file(users_path):
    users = []
    with open(users_path, 'r') as f:
        reader = csv.reader(f, delimiter=',')
        for line in reader:
            users.append(User(
                first_name=line[0].strip(),
                last_name=line[1].strip(),
                email=line[2].strip(),
                phone_number=line[3].strip(),
                location=line[4].strip(),
                handle=line[5].strip()
            ))
    return users

def add_users(users):
    for user in users:
        print(f'Adding user with handle {user.handle}...')
        data = {
            'firstName': user.first_name,
            'lastName': user.last_name,
            'email': user.email,
            'phoneNumber': f'+1{user.phone_number}',
            'location': user.location,
            'handle': user.handle,
            'favorites': [],
            'tasted': [],
            'wantToTaste': [],
            'friends': [],
            'creationTimestamp': firestore.SERVER_TIMESTAMP
        }
        db.collection('users').add(data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    parser.add_argument('--users-path', type=str, required=True)
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
    current_users = get_current_users(db)
    upsert_users = parse_users_file(args.users_path)
    
    current_emails = set([u.email for u in current_users])
    current_handles = set([u.handle for u in current_users])
    current_phone_numbers = set([u.phone_number for u in current_users])

    do_upsert = True
    for user in upsert_users:
        if user.email in current_emails:
            do_upsert = False
            print(f'ERROR: email {user.email} already exists')
        if user.handle in current_handles:
            do_upsert = False
            print(f'ERROR: handle {user.handle} already exists')
        if user.phone_number in current_phone_numbers:
            do_upsert = False
            print(f'ERROR: phone number {user.phone_number} already exists')

    if do_upsert:
        add_users(upsert_users)
    