import firebase_admin
import json
import csv
from typing import Dict, List

from argparse import ArgumentParser
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.document import DocumentReference


def load_users() -> Dict[str, DocumentReference]:
    db = firestore.client()

    result: Dict[str, DocumentReference] = dict()

    for user_doc in db.collection('users').stream():
        handle = str(user_doc.get('handle'))
        assert handle not in result, 'Duplicate handle {}'.format(handle)

        result[handle] = user_doc.reference

    return result


def parse_friend_graph(graph_path: str) -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = dict()

    with open(graph_path, 'r') as fin:
        reader = csv.reader(fin, delimiter=',')
        for line in reader:
            user_handle = line[0]
            result[user_handle] = line[1:]

    return result


def parse_user_locations(locations_path: str) -> Dict[str, str]:
    result: Dict[str, str] = dict()

    with open(locations_path, 'r') as fin:
        reader = csv.reader(fin, delimiter=',')
        for line in reader:
            result[line[0]] = line[1]

    return result


def write_users(users: Dict[str, DocumentReference], friend_graph: Dict[str, List[str]], user_locations: Dict[str, str]):
    db = firestore.client()

    for user_handle, friend_handles in friend_graph.items():
        user_ref = users[user_handle]
        user_id = user_ref.id

        location = user_locations[user_handle]

        user_data = {
            'friends': [users[friend] for friend in friend_handles],
            'location': location
        }
        db.collection('users').document(user_id).set(user_data, merge=True)

        print('Uploaded {} friends for {}'.format(len(user_data['friends']), user_handle))


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    parser.add_argument('--graph-path', type=str, required=True)
    parser.add_argument('--locations-path', type=str, required=True)
    args = parser.parse_args()

    # Create the database client
    with open(args.cert_path, 'r') as fin:
        token_dict = json.load(fin)

    creds = credentials.Certificate(token_dict)
    firebase_admin.initialize_app(creds)

    # Parse the friend graph
    friend_graph = parse_friend_graph(args.graph_path)

    # Parse the user locations
    user_locations = parse_user_locations(args.locations_path)

    # Upload the users with the friend graph
    users = load_users()

    # Write the updated user information to the database
    write_users(users=users, friend_graph=friend_graph, user_locations=user_locations)
