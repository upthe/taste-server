#!/usr/bin/env python3
import argparse
import firebase_admin
import json
from collections import namedtuple
from firebase_admin import credentials, firestore
from os import environ

Place = namedtuple('Place', ['id', 'name', 'address'])

def get_places():
    places = []
    for place_doc in db.collection('places').stream():
        name = place_doc.get('name')
        address = place_doc.get('address')
        places.append(Place(id=place_doc.id, name=name, address=address))
    return places

def create_places_dictionary(places):
    places_dictionary = {}
    for place in places:
        address = place.address
        if address in places_dictionary:
            places_dictionary[address].append(place)
        else:
            places_dictionary[address] = [place]
    return places_dictionary

def replace_places(target_id, remove_ids):
    target_place = db.collection('places').document(target_id)
    for remove_id in remove_ids:
        remove_place = db.collection('places').document(remove_id)

        # Update 'tasted' fields of users
        users = db.collection('users').where('tasted', 'array_contains', remove_place).stream()
        for u in users:
            print(f'Updating user (tasted) {u.id}...')
            user = db.collection('users').document(u.id)
            user.update({
                'tasted': firestore.ArrayRemove([remove_place])
            })
            user.update({
                'tasted': firestore.ArrayUnion([target_place])
            })

        # Update 'wantToTaste' fields of users
        users = db.collection('users').where('wantToTaste', 'array_contains', remove_place).stream()
        for u in users:
            print(f'Updating user (wantToTaste) {u.id}...')
            user = db.collection('users').document(u.id)
            user.update({
                'wantToTaste': firestore.ArrayRemove([remove_place])
            })
            user.update({
                'wantToTaste': firestore.ArrayUnion([target_place])
            })

        # Update 'notificationLink' fields of notifications
        notifications = db.collection('notifications').where('notificationLink', '==', remove_id).stream()
        for n in notifications:
            print(f'Updating notification {n.id}...')
            notification = db.collection('notifications').document(n.id)
            notification.update({
                'notificationLink': target_id
            })

        # Update 'place' fields of posts
        posts = db.collection('posts').where('place', '==', remove_place).stream()
        for p in posts:
            print(f'Updating post {p.id}...')
            post = db.collection('posts').document(p.id)
            post.update({
                'place': target_place
            })

        # Delete places
        remove_place.delete()

def process_duplicate_places(duplicate_places):
    print(f'There are {len(duplicate_places)} places that need to be processed...')
    for places in duplicate_places:
        print('Processing batch of duplicate places:')
        for i in range(len(places)):
            place = places[i]
            print(f'{i}: {place.name}, {place.address}')
        index = int(input('Select a place index to use: '))
        if index >= len(places):
            print('WARNING: invalid index, continuing')
            continue
        replace_places(places[index].id, [p.id for p in places if p.id != places[index].id])

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

    places = get_places()
    places_dictionary = create_places_dictionary(places)
    duplicate_places = []
    for address, places in places_dictionary.items():
        if len(places) > 1:
            duplicate_places.append(places)
    process_duplicate_places(duplicate_places)
