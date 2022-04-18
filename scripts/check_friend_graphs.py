#!/usr/bin/env python3
import argparse
import csv
import firebase_admin
import json
from firebase_admin import credentials, firestore
from os import environ

def get_friend_graph(db):
    friend_graph = {}
    users = db.collection('users').get()
    for u in users:
        friend_graph[u.id] = [f.id for f in u.get('friends')]
    return friend_graph

def check_friend_graph(friend_graph):
    for user, friends in friend_graph.items():
        print(f'Checking user {user}...')
        assert len(friends) == len(list(set(friends))), f'user {user} has duplicate friends'
        for friend in friends:
            assert user in friend_graph[friend], f'user {user} not in {friend} friends'

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
    friend_graph = get_friend_graph(db)
    check_friend_graph(friend_graph)
