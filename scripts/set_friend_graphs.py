#!/usr/bin/env python3
import argparse
import csv
import firebase_admin
import json
from firebase_admin import credentials, firestore
from os import environ

def parse_friend_graph(friends_path):
    friend_graph = {}
    with open(friends_path, 'r') as f:
        reader = csv.reader(f, delimiter=',')
        for line in reader:
            handle = line[0]
            friends = line[1].split()
            friend_graph[handle] = set(friends)
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

def update_friends(db, complete_friend_graph):
    for user, friends in complete_friend_graph.items():
        print(f'Processing user {user}...')
        query = db.collection('users').where('handle', '==', user).limit(1).get()[0]
        user_ref = db.collection('users').document(query.id)
        for friend in friends:
            print(f'Setting friend {friend} to {user}...')
            friend_query = db.collection('users').where('handle', '==', friend).limit(1).get()[0]
            friend_ref = db.collection('users').document(friend_query.id)
            user_ref.set({
                'friends': firestore.ArrayUnion([friend_ref])
            }, merge=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    parser.add_argument('--friends-path', type=str, required=True)
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
    friend_graph = parse_friend_graph(args.friends_path)
    complete_friend_graph = complete_friend_graph(friend_graph)
    update_friends(db, complete_friend_graph)
