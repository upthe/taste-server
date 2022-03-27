import csv
from argparse import ArgumentParser
from collections import namedtuple
from typing import Dict


Place = namedtuple('Place', ['id', 'name', 'address'])


def find_duplicates(places_path: str):

    place_dict: Dict[str, Place] = dict()

    with open(places_path, 'r') as fin:
        reader = csv.reader(fin, delimiter=',')

        for idx, line in enumerate(reader):
            if idx == 0:
                continue

            place_id = line[0]
            place_name = line[1]
            place_address = line[2]
            place = Place(id=place_id, name=place_name, address=place_address)

            if place_address in place_dict:
                print('Possible Duplicate.')
                print('Place 1: {}'.format(place))
                print('Place 2: {}'.format(place_dict[place_address]))
                x = input()

            place_dict[place_address] = place



if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--places-csv', type=str, required=True)
    args = parser.parse_args()

    find_duplicates(places_path=args.places_csv)
