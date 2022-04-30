#!/usr/bin/env python3
import argparse
import csv
import datetime
import firebase_admin
import json
import pytz
from firebase_admin import credentials, firestore
from os import environ

'''
Type                                Data

UserPostedTaste                     Post ID
UserTastedPlaceFirst                Post ID
FriendWantsToTastePlaceYouTasted    Place ID, user ID (friend)
FriendTastedPlaceYouTasted          Post ID (friend)
FriendLikedPlaceYouTasted           Post ID (friend)
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
            'id': p.id,
            'name': place_dict.get('name')
        }
    return place_ids_to_data

def _get_queue_post_ids_to_data(db, post_ids_to_data):
    print('Getting posts queue...')
    queue_post_ids_to_data = {}
    queue_posts = db.collection('queueposts').stream()
    for p in queue_posts:
        queue_post_data = p.to_dict()
        queue_post_ids_to_data[p.id] = {
            'postId': queue_post_data.get('postId')
        }
    return queue_post_ids_to_data

def _get_queue_want_to_taste_ids_to_data(db):
    print('Getting want to taste queue...')
    queue_want_to_taste_ids_to_data = {}
    want_to_tastes = db.collection('queuewanttotastes').stream()
    for w in want_to_tastes:
        want_to_taste_dict = w.to_dict()
        queue_want_to_taste_ids_to_data[w.id] = {
            'id': w.id,
            'user': w.get('user').id,
            'place': w.get('place').id,
            'timestamp': w.get('timestamp')
        }
    return queue_want_to_taste_ids_to_data

def _get_place_ids_to_post_data(post_ids_to_data):
    print('Getting place IDs to post IDs...')
    place_ids_to_post_data = {}
    for post_id, post_data in post_ids_to_data.items():
        place_id = post_data['place']
        if place_id in place_ids_to_post_data:
            place_ids_to_post_data[place_id].append(post_data)
        else:
            place_ids_to_post_data[place_id] = [post_data]
    return place_ids_to_post_data

def _get_place_ids_to_queue_post_data(post_ids_to_data, queue_post_ids_to_data):
    print('Getting place IDs to queue post data...')
    place_ids_to_queue_post_data = {}
    for queue_post_id, queue_post_data in queue_post_ids_to_data.items():
        post_id = queue_post_data['postId']
        post_data = post_ids_to_data[post_id]
        place_id = post_data['place']
        if place_id in place_ids_to_queue_post_data:
            place_ids_to_queue_post_data[place_id].append(post_data)
        else:
            place_ids_to_queue_post_data[place_id] = [post_data]
    return place_ids_to_queue_post_data

def _get_place_ids_to_want_to_taste_data(place_ids_to_data, queue_want_to_taste_ids_to_data):
    print('Getting place IDs to queue want to taste data...')
    place_ids_to_want_to_taste_data = {}
    for p in place_ids_to_data.keys():
        place_ref = db.collection('places').document(p)
        want_to_tastes = [w for w in queue_want_to_taste_ids_to_data.values() if w['place'] == place_ref.id]
        want_to_taste_data = []
        for w in want_to_tastes:
            want_to_taste_data.append({
                'id': w.get('id'),
                'user': w.get('user'),
                'place': w.get('place'),
                'timestamp': w.get('timestamp')
            })
        place_ids_to_want_to_taste_data[p] = want_to_taste_data
    return place_ids_to_want_to_taste_data

# create 'UserPostedTaste' events whenever a user posts a taste
def create_events_for_user_posted_taste(post_ids_to_data, queue_post_ids_to_data):
    print('Creating events for users posting tastes...')
    events = []
    for queue_post_id, queue_post_data in queue_post_ids_to_data.items():
        post_id = queue_post_data.get('postId')
        events.append({
            'type': 'UserPostedTaste',
            'user': post_ids_to_data[post_id]['user'],
            'data': {
                'post': post_id
            },
            'timestamp': datetime.datetime.now()
        })
    return events

# create 'UserTastedPlaceFirst' events whenever a user posts a taste that is
# the first taste of that place within their friend graph
def create_events_for_user_tasted_place_first(place_ids_to_post_data, place_ids_to_queue_post_data, user_ids_to_data):
    print('Creating events for users tasting place first...')
    events = []
    for place_id, place_post_data in place_ids_to_post_data.items():
        # get sorted list of posts filtering out retastes
        sorted_place_post_data = sorted(place_post_data, key=lambda p: p['timestamp'])
        sanitized_place_post_data = []
        for p in sorted_place_post_data:
            if p['user'] in [p['user'] for p in sanitized_place_post_data]:
                continue
            sanitized_place_post_data.append(p)

        queue_post_data = place_ids_to_queue_post_data.get(place_id, [])
        for queue_post in queue_post_data:
            if queue_post not in sanitized_place_post_data:
                continue
            user = queue_post['user']
            user_friend_ids = user_ids_to_data[user]['friends']
            place_posts_filtered = [p for p in sanitized_place_post_data if p['user'] in user_friend_ids or p['user'] == user]
            place_first_post_for_friends = place_posts_filtered[0]
            # prevent creating event for same person in multiple friend graphs
            if place_first_post_for_friends['user'] != user:
                continue
            events.append({
                'type': 'UserTastedPlaceFirst',
                'user': user,
                'data': {
                    'post': place_first_post_for_friends['id']
                },
                'timestamp': datetime.datetime.now()
            })
    return events

# create 'FriendWantsToTastePlaceYouTasted' events whenever a user's friend
# wants to taste a place that the user tasted if both the user's friend's
# post and the user's post is at least 3 stars
def create_events_for_friend_wants_to_taste_place_you_tasted(place_ids_to_post_data, place_ids_to_want_to_taste_data, post_ids_to_data, user_ids_to_data):
    print('Creating events for friends wanting to taste places...')
    events = []
    place_ids = set(place_ids_to_post_data.keys()) | set(place_ids_to_want_to_taste_data.keys())
    for place_id in place_ids:
        place_post_data = place_ids_to_post_data.get(place_id, [])
        place_want_to_taste_data = place_ids_to_want_to_taste_data.get(place_id, [])

        # get sorted list of posts filtering out star ratings less than 3 and retastes
        sorted_place_post_data = sorted(place_post_data, key=lambda p: p['timestamp'])
        filtered_place_post_data = [p for p in sorted_place_post_data if p['starRating'] >= 3]
        sanitized_place_post_data = []
        for p in filtered_place_post_data:
            if p['user'] in [p['user'] for p in sanitized_place_post_data]:
                continue
            sanitized_place_post_data.append(p)

        for place_want_to_taste in place_want_to_taste_data:
            user_id = place_want_to_taste['user']
            user_friend_ids = user_ids_to_data[user_id]['friends']
            place_posts_filtered = [p for p in sanitized_place_post_data if p['user'] in user_friend_ids and p['starRating'] >= 3]
            for place_post in place_posts_filtered:
                events.append({
                    'type': 'FriendWantsToTastePlaceYouTasted',
                    'user': place_post['user'],
                    'data': {
                        'place': place_id,
                        'user': user_id
                    },
                    'timestamp': datetime.datetime.now()
                })
    return events

# create 'FriendTastedPlaceYouTasted' events whenever a user's friend tastes
# a place that the user tasted if the user's taste is at least 3 stars and the
# friend's taste is either 3 or 4 stars; create 'FriendLikedPlaceYouTasted'
# whenever a user's friend tastes a place that the user tasted if the user's
# taste is at least 3 stars and the friend's taste is 5 stars
def create_events_for_friend_tasted_liked_place_you_tasted(place_ids_to_post_data, place_ids_to_queue_post_data, user_ids_to_data):
    print('Creating events for friends tasting/liking places...')
    events = []
    for place_id, place_post_data in place_ids_to_post_data.items():
        # get sorted list of posts filtering out star ratings less than 3 and retastes
        sorted_place_post_data = sorted(place_post_data, key=lambda p: p['timestamp'])
        filtered_place_post_data = [p for p in sorted_place_post_data if p['starRating'] >= 3]
        sanitized_place_post_data = []
        for p in filtered_place_post_data:
            if p['user'] in [p['user'] for p in sanitized_place_post_data]:
                continue
            sanitized_place_post_data.append(p)

        queue_post_data = place_ids_to_queue_post_data.get(place_id, [])
        for queue_post in queue_post_data:
            if queue_post not in sanitized_place_post_data:
                continue
            post_id = queue_post['id']
            user_id = queue_post['user']
            star_rating = queue_post['starRating']
            friends = user_ids_to_data[user_id]['friends']
            index = sanitized_place_post_data.index(queue_post)
            for i in range(index):
                comp = sanitized_place_post_data[i]
                comp_user_id = comp['user']
                if comp_user_id not in friends:
                    continue
                payload = {
                    'user': comp_user_id,
                    'data': {
                        'post': post_id
                    },
                    'timestamp': datetime.datetime.now()
                }
                if star_rating == 5:
                    events.append({**{'type': 'FriendLikedPlaceYouTasted'}, **payload})
                else:
                    events.append({**{'type': 'FriendTastedPlaceYouTasted'}, **payload})
    return events

def output_events(events):
    fields = ['user', 'type', 'timestamp', 'post', 'place', 'user']
    rows = []
    for e in events:
        event_type = e['type']
        data = e['data']
        row = [e['user'], event_type, e['timestamp']]
        if event_type == 'UserPostedTaste':
            row.extend([data['post'], None, None])
        elif event_type == 'UserTastedPlaceFirst':
            row.extend([data['post'], None, None])
        elif event_type == 'FriendWantsToTastePlaceYouTasted':
            row.extend([None, data['place'], data['user']])
        elif event_type == 'FriendTastedPlaceYouTasted':
            row.extend([data['post'], None, None])
        elif event_type == 'FriendLikedPlaceYouTasted':
            row.extend([data['post'], None, None])
        rows.append(row)
    with open(f'tmp/events.csv', 'w') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows(rows)

def publish_events(db, events):
    print('Publishing events...')
    for event in events:
        db.collection('events').add(event)

def clear_queues(db, queue_post_ids_to_data, queue_want_to_taste_ids_to_data):
    print('Clearing queues...')
    for p in queue_post_ids_to_data:
        db.collection('queueposts').document(p).delete()
    for w in queue_want_to_taste_ids_to_data:
        db.collection('queuewanttotastes').document(w).delete()

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

    # cache raw data
    user_ids_to_data = _get_user_ids_to_data(db)
    post_ids_to_data = _get_post_ids_to_data(db)
    place_ids_to_data = _get_place_ids_to_data(db)

    # get documents to process
    queue_post_ids_to_data = _get_queue_post_ids_to_data(db, post_ids_to_data)
    queue_want_to_taste_ids_to_data = _get_queue_want_to_taste_ids_to_data(db)

    # create maps based on places
    place_ids_to_post_data = _get_place_ids_to_post_data(post_ids_to_data)
    place_ids_to_queue_post_data = _get_place_ids_to_queue_post_data(post_ids_to_data, queue_post_ids_to_data)
    place_ids_to_want_to_taste_data = _get_place_ids_to_want_to_taste_data(place_ids_to_data, queue_want_to_taste_ids_to_data)

    # create events
    events = []
    events.extend(create_events_for_user_posted_taste(post_ids_to_data, queue_post_ids_to_data))
    events.extend(create_events_for_user_tasted_place_first(place_ids_to_post_data, place_ids_to_queue_post_data, user_ids_to_data))
    events.extend(create_events_for_friend_wants_to_taste_place_you_tasted(place_ids_to_post_data, place_ids_to_want_to_taste_data, post_ids_to_data, user_ids_to_data))
    events.extend(create_events_for_friend_tasted_liked_place_you_tasted(place_ids_to_post_data, place_ids_to_queue_post_data, user_ids_to_data))

    output_events(events)
    publish_events(db, events)
    clear_queues(db, queue_post_ids_to_data, queue_want_to_taste_ids_to_data)
