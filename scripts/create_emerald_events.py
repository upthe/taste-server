#!/usr/bin/env python3
import argparse
import datetime
import firebase_admin
import hashlib
import json
import pytz
from firebase_admin import credentials, firestore
from os import environ

'''
[5 creds] Tasting a place
[10 creds] Tasting a place that none of your friends have tasted
    for each place
        get list of posts in decending order
        for each person that tasted
            find their friend graphs
            figure out if they're the first of their friends
            ensure same person don't get creds multiple times for the same place
[20 creds] Tasting a place that makes your friend want to taste it
    for each place
        get list of people who want to taste
        for each person that tasted (for 3 to 5 stars)
            find their friend graphs
            find intersection of friend graph and all people who want to taste
[50 creds] Tasting a place that makes your friend go taste it
    only care if post is 3 or higher
    for each place
        get list of people who tasted in decending order
        remove duplicates in list except for earliest posts
        for each person in that list (for 3 to 5 stars)
            get their friend graphs
            if post is 5 star:
                create 5 star event or each friend in list after them
            else:
                create event for each friend in list after them
[100 creds] Tasting a place that makes your friend taste it and they say its excellent
    (see above)
'''


'''
Type                                Data                Uniqueness

UserPostedTaste                     Post ID             (queue)
UserTastedPlaceFirst                Post ID             (queue)
FriendWantsToTastePlaceYouTasted    Place, user         (queue)
FriendTastedPlaceYouTasted          Post ID (friend)    (queue)
FriendLikedPlaceYouTasted           Post ID (friend)    (queue)
'''

def _get_post_ids_to_data(db):
    print('Getting posts...')
    post_ids_to_data = {}
    posts = db.collection('posts').stream()
    for p in posts:
        post_dict = p.to_dict()
        post_ids_to_data[p.id] = {
            'id': p.id,
            'user': post_dict.get('user').id,
            'place': post_dict.get('place').id,
            'starRating': post_dict.get('starRating'),
            'review': post_dict.get('review'),
            'retaste': post_dict.get('retaste', False),
            'timestamp': post_dict.get('timestamp').replace(tzinfo=pytz.UTC)
        }
    return post_ids_to_data

def _get_user_ids_to_data(db):
    print('Getting users...')
    user_ids_to_data = {}
    users = db.collection('users').stream()
    for u in users:
        user_dict = u.to_dict()
        user_ids_to_data[u.id] = {
            'firstName': user_dict.get('firstName'),
            'lastName': user_dict.get('lastName'),
            'handle': user_dict.get('handle'),
            'wantToTaste': [p.id for p in user_dict.get('wantToTaste')],
            'friends': [f.id for f in user_dict.get('friends')]
        }
    return user_ids_to_data

def _get_place_ids_to_data(db):
    print('Getting places...')
    place_ids_to_data = {}
    places = db.collection('places').stream()
    for p in places:
        place_dict = p.to_dict()
        place_ids_to_data[p.id] = {
            'name': place_dict.get('name')
        }
    return place_ids_to_data

def _get_place_ids_to_post_ids(post_ids_to_data):
    print('Getting place IDs to post IDs...')
    place_ids_to_post_ids = {}
    for post_id, post_data in post_ids_to_data.items():
        place_id = post_data['place']
        if place_id in place_ids_to_post_ids:
            place_ids_to_post_ids[place_id].append(post_id)
        else:
            place_ids_to_post_ids[place_id] = [post_id]
    return place_ids_to_post_ids

# def _get_place_ids_to_want_to_taste_user_ids(db, user_ids_to_data):
#     print('Getting place IDs to want to taste user IDs...')
#     place_ids_to_want_to_taste_user_ids = {}
#     for user_id, user_data in user_ids_to_data.items():
#         want_to_taste_place_ids = user_data['wantToTaste']
#         for place_id in want_to_taste_place_ids:
#             if place_id in place_ids_to_want_to_taste_user_ids:
#                 place_ids_to_want_to_taste_user_ids[place_id].append(user_id)
#             else:
#                 place_ids_to_want_to_taste_user_ids[place_id] = [user_id]
#     return place_ids_to_want_to_taste_user_ids

def _get_place_ids_to_want_to_taste_data(db, place_ids_to_data):
    print('Getting place IDs to want to taste data...')
    place_ids_to_want_to_taste_data = {}
    for p in place_ids_to_data.keys():
        place_ref = db.collection('places').document(p)
        want_to_tastes = db.collection('wanttotastes').where('place', '==', place_ref).get()
        want_to_taste_data = []
        for w in want_to_tastes:
            want_to_taste_data.append({
                'id': w.id,
                'user': w.get('user').id,
                'place': w.get('place').id,
                'timestamp': w.get('timestamp')
            })
        place_ids_to_want_to_taste_data[p] = want_to_taste_data
    return place_ids_to_want_to_taste_data

# todo
def _get_current_events(db):
    return {}

def _get_hash_string(*strs):
    to_hash = [s for s in strs]
    return hashlib.md5(''.join(to_hash).encode()).hexdigest()

# Create 'UserPostedTaste' events
def create_events_for_user_posted_taste(events, post_ids_to_data):
    for post_id, post_data in post_ids_to_data.items():
        key = _get_hash_string(post_id)
        if key in events:
            continue
        timestamp = datetime.datetime.now()
        events[key] = {
            'type': 'UserPostedTaste',
            'user': post_data['user'],
            'data': {
                'post': post_id
            },
            'timestamp': timestamp
        }
    return events

# Create 'UserTastedPlaceFirst' events
def create_events_for_user_tasted_place_first(events, place_ids_to_post_ids, post_ids_to_data, user_ids_to_data):
    for place_id, post_ids in place_ids_to_post_ids.items():
        # todo: filter based on post retastes, not field
        posts = [post_ids_to_data[p] for p in post_ids if not post_ids_to_data[p]['retaste']]
        posts = sorted(posts, key=lambda p: p['timestamp'], reverse=True)

        users = [p['user'] for p in posts]
        for u in users:
            user_friends = user_ids_to_data[u]['friends']
            posts_filtered = [p for p in posts if p['user'] in user_friends or p['user'] == u]
            first_post = posts_filtered[-1]
            # prevent creating event for same person in multiple friend graphs
            if first_post['user'] == u:
                key = _get_hash_string(first_post['id'])
                if key in events:
                    continue
                timestamp = datetime.datetime.now()
                events[key] = {
                    'type': 'UserTastedPlaceFirst',
                    'user': u,
                    'data': {
                        'post': first_post['id']
                    },
                    'timestamp': timestamp
                }
    return events

# Create 'FriendWantsToTastePlaceYouTasted' events
def create_events_for_friend_wants_to_taste_place_you_tasted(events, place_ids_to_post_ids, place_ids_to_want_to_taste_data, post_ids_to_data, user_ids_to_data):
    place_ids = set(place_ids_to_post_ids.keys()) | set(place_ids_to_want_to_taste_data.keys())
    for p in place_ids:
        want_to_taste_data = place_ids_to_want_to_taste_data.get(p, [])
        post_ids = place_ids_to_post_ids.get(p, [])
        # todo: filter based on post retastes, not field
        posts = [post_ids_to_data[p] for p in post_ids if not post_ids_to_data[p]['retaste']]

        for d in want_to_taste_data:
            user_id = d['user']
            timestamp = d['timestamp']
            user_friends = user_ids_to_data[user_id]['friends']
            posts_filtered = [p for p in posts if p['user'] in user_friends and p['starRating'] >= 3 and p['timestamp'] < timestamp]
            # print(posts_filtered)
            # print()
            print('processing user', user_id, d['id'])
            for pf in posts_filtered:
                print(pf)
                key = _get_hash_string(d['id'])
                if key in events:
                    continue
                timestamp = datetime.datetime.now()
                events[key] = {
                    'type': 'FriendWantsToTastePlaceYouTasted',
                    'user': pf['user'],
                    'data': {
                        'place': p,
                        'user': user_id
                    },
                    'timestamp': timestamp
                }
            print()
    return events

def create_events_for_friend_tasted_liked_place_you_tasted(place_ids_to_post_ids, post_ids_to_data, user_ids_to_data):
    events = {}
    for place_ids, post_ids in place_ids_to_post_ids.items():
        posts = [post_ids_to_data[p] for p in post_ids if not post_ids_to_data[p]['retaste'] and post_ids_to_data[p]['starRating'] >= 3]
        posts = sorted(posts, key=lambda p: p['timestamp'], reverse=True)


    return events

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

    user_ids_to_data = _get_user_ids_to_data(db)
    post_ids_to_data = _get_post_ids_to_data(db)
    place_ids_to_data = _get_place_ids_to_data(db)

    queue_post_ids = _get_queue_post_ids_to_data(db)
    queue_want_to_taste_ids = _get_queue_want_to_taste_ids(db)

    place_ids_to_post_ids = _get_place_ids_to_post_ids(post_ids_to_data)
    place_ids_to_want_to_taste_data = _get_place_ids_to_want_to_taste_data(db, place_ids_to_data)

    events = _get_current_events(db)

    # events = {**events, **create_events_for_user_posted_taste(events, post_ids_to_data)}

    # events = {**events, **create_events_for_user_tasted_place_first(events, place_ids_to_post_ids, post_ids_to_data, user_ids_to_data)}
    # for e, d in events.items():
    #     handle = user_ids_to_data[d['user']]['handle']
    #     post_id = d['data']
    #     place_id = post_ids_to_data[post_id]['place']
    #     place_name = place_ids_to_data[place_id]['name']
    #     # name = place_ids_to_data[post_ids_to_data[d['data']]]['name']
    #     print(handle, place_name)

    events = {**events, **create_events_for_friend_wants_to_taste_place_you_tasted(events, place_ids_to_post_ids, place_ids_to_want_to_taste_data, post_ids_to_data, user_ids_to_data)}
    # prints = []
    # for e, d in events.items():
    #     user_id = d['user']
    #     place_id = d['data']['place']
    #     friend_id = d['data']['user']
    #     prints.append(f"{place_ids_to_data[place_id]['name']} - {user_ids_to_data[friend_id]['handle']} wants to taste, crediting {user_ids_to_data[user_id]['handle']}")
    # prints = sorted(prints)
    # for p in prints:
    #     print(p)

        
    # for e, d in events.items():
    #     print(d)
    # print(len(events))
