import os
import time
from typing import Tuple, Dict, List

from tqdm import tqdm

import data
from data import  File, Hashes
import compute_file_hash

LOCATIONS = {
    'test': '/home/grzesiu/Videos',
    'ggrz_drive1': '/media/grzesiu/USB-HDD',
    'ggrz_drive2': '/media/grzesiu/TOSHIBA EXT',
    'ggrz_drive3': '/media/grzesiu/ggrz_drive3',
    'recent': '/home/grzesiu/Desktop/temp/recent',
}

STAT_INDEX = None

class Config:
    SCAN_PATH = '{recent}'
    DATABASE_PATH = 'recent.csv'

    COLLECT_FILES = True
    GUESS_HASH_FROM_STAT = False
    IGNORE_FILE_NOT_FOUND = False

def expand_path(path):
    for name, location in LOCATIONS.items():
        if path.startswith(f'{{{name}}}'):
            return location + path[len(name)+2:]

    return path

def time_me(func):
    def call(*args, **kwargs):
        start = time.time()
        ret = func(*args, **kwargs)
        stop = time.time()
        print(f'"{func.__name__}" took {stop-start:.02f}s')
        return ret
    return call


@time_me
def create_stat_index(path):
    return data.load_hashes(path).index_by_stat()


@time_me
def collect_files(input_path: str) -> Hashes:
    full_input_path = expand_path(input_path)

    hashes = Hashes.create()

    with tqdm(unit='directories', unit_scale=False) as progress:
        progress.set_description('Collecting files')

        for full_current_path, _, files in os.walk(full_input_path):
            current_path = full_current_path.replace(full_input_path, input_path)

            for filename in files:
                try:
                    file_stat = os.stat(os.path.join(full_current_path, filename))
                
                    hashes.path2hash[f'{current_path}/{filename}'] = File(
                        modification_time=file_stat.st_mtime, 
                        size=file_stat.st_size)

                except OSError:
                    print('\n[Warning] os.stat failed on file:', f'{current_path}/{filename}')

            progress.update()

    return hashes


@time_me
def fill_known_hashes(current: Hashes, previous: Hashes) -> List[str]:
    outdated = []    

    for file_path, current_file in current.path2hash.items():
        previous_file = previous.path2hash.get(file_path)

        def is_outdated():
            return previous_file is None or any([
                    previous_file.file_hash is None,
                    previous_file.modification_time != current_file.modification_time,
                    previous_file.size != current_file.size
            ])

        if not is_outdated():
            if Config.GUESS_HASH_FROM_STAT or previous_file.file_hash[0] != '?':
                current_file.file_hash = previous_file.file_hash
                continue

        if Config.GUESS_HASH_FROM_STAT:
            guess = STAT_INDEX.get((current_file.modification_time, current_file.size))

            if guess is not None:
                current_file.file_hash = '?' + guess[-32:]
                continue

        outdated.append(file_path)
    
    return outdated

@time_me
def compute_hashes(files, hashes: Hashes):
    def get_file_size(file_path):
        return hashes.path2hash.get(file_path, File(0.0, 1)).size

    ret = {}

    total_size = sum(get_file_size(file_path) for file_path in files)

    with tqdm(total=total_size, unit='b', unit_scale=True) as progress:
        progress.set_description('Computing hashes')

        for file_path in files:
            try:
                if len(file_path) > 100:
                    nice_name = file_path.split('/')[-1]
                else:
                    nice_name = file_path

                nice_name = f'{nice_name:100s} $'
                progress.set_postfix(file=nice_name)

                full_file_path = expand_path(file_path)
                file_hash = compute_file_hash.md5(full_file_path)
                
                yield file_path, file_hash

            except FileNotFoundError:
                if not Config.IGNORE_FILE_NOT_FOUND:
                    raise

            file_size = get_file_size(file_path)
            progress.update(file_size)

        progress.set_postfix()

    return ret


def compute_hashes_dry(files, hashes: Hashes):
    for file_path in files:
        print('[Dry run] Computing md5 of file:', file_path)


print('Loading database...')
previous_hashes = data.load_hashes(Config.DATABASE_PATH)

if Config.GUESS_HASH_FROM_STAT:
    STAT_INDEX = create_stat_index('csv_backups/ggrz_drive3.csv-2020-05-12_renames')

if Config.COLLECT_FILES:
    print('Collecting files...')
    current_hashes = collect_files(Config.SCAN_PATH)
else:
    current_hashes = previous_hashes

print('Collecting outdated hashes...')
outdated_files = fill_known_hashes(current_hashes, previous_hashes)

print(f'{len(outdated_files)} hashes are outdated.')

print('Computing hashes...')
try:
    for file_path, new_hash in compute_hashes(outdated_files, current_hashes):
        current_hashes.path2hash[file_path].file_hash = new_hash

except KeyboardInterrupt:
    print()
    print('Aborted by user')

except:
    print('Storing database.tmp...')
    data.store_hashes(Config.DATABASE_PATH+'-tmp.csv', current_hashes)
    raise

print('Storing database...')
data.store_hashes(Config.DATABASE_PATH, current_hashes)
