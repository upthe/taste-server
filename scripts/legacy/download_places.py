import csv
import firebase_admin
import json
from typing import Set

from argparse import ArgumentParser
from firebase_admin import credentials, firestore


def download_places():
    db = firestore.client()

    with open('places_03_22_2022.csv', 'w') as fout:
        writer = csv.writer(fout, delimiter=',')

        writer.writerow(['id', 'name', 'address', 'longitude', 'latitude'])

        for place_doc in db.collection('places').stream():
            place_id = place_doc.id
            place_name = place_doc.get('name')
            address = place_doc.get('address')
            longitude = float(place_doc.get('longitude'))
            latitude = float(place_doc.get('latitude'))

            writer.writerow([place_id, place_name, address, longitude, latitude])


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--cert-path', type=str, required=True)
    args = parser.parse_args()

    # Create the database client
    with open(args.cert_path, 'r') as fin:
        token_dict = json.load(fin)

    creds = credentials.Certificate(token_dict)
    firebase_admin.initialize_app(creds)

    # Download all places
    download_places()

