import csv
import firebase_admin
import json
from typing import Set

from argparse import ArgumentParser
from firebase_admin import credentials, firestore


VALID_CUISINES: Set[str] = set()
with open('valid_cuisines.txt', 'r') as fin:
    for line in fin:
        VALID_CUISINES.add(line.strip())


def process_file(path: str):
    db = firestore.client()

    with open(path, 'r') as fin:
        reader = csv.reader(fin, delimiter=',')

        for idx, tokens in enumerate(reader):
            if idx > 0:
                place_id = tokens[0]
                cuisines = [t.strip() for t in tokens[1:] if len(t.strip()) > 0]

                for cuisine in cuisines:
                    assert cuisine in VALID_CUISINES, 'Found cuisine {} on line {}'.format(cuisine, idx)

                place_data = {
                    'cuisines': cuisines
                }
                db.collection('places').document(place_id).set(place_data, merge=True)

                if (idx % 100) == 0:
                    print('Completed {} places.'.format(idx))


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    parser.add_argument('--cuisines-path', type=str, required=True)
    args = parser.parse_args()

    # Create the database client
    with open(args.cert_path, 'r') as fin:
        token_dict = json.load(fin)

    creds = credentials.Certificate(token_dict)
    firebase_admin.initialize_app(creds)

    # Process the cuisines
    process_file(path=args.cuisines_path)
