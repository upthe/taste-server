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
        friend_graph[u.id] = set([f.id for f in u.get('friends')])
    return friend_graph

def complete_friend_graph(friend_graph):
    complete_friend_graph = {}
    for user, friends in friend_graph.items():
        current_friends = complete_friend_graph.get(user, set())
        complete_friend_graph[user] = friends | current_friends
        for friend in friends:
            if friend not in complete_friend_graph:
                complete_friend_graph[friend] = set()
            complete_friend_graph[friend].add(user)
    return complete_friend_graph

def update_friends(db, friend_graph, complete_friend_graph):
    for user, friends in complete_friend_graph.items():
        print(f'Processing user {user}...')
        user_ref = db.collection('users').document(user)
        for friend in friends:
            if friend not in friend_graph[user]:
                print(f'Setting friend {friend} to {user}...')
                friend_ref = db.collection('users').document(friend)
                user_ref.set({
                    'friends': firestore.ArrayUnion([friend_ref])
                }, merge=True)

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
    complete_friend_graph = complete_friend_graph(friend_graph)
    update_friends(db, friend_graph, complete_friend_graph)
