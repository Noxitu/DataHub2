from __future__ import annotations

import csv
from typing import NamedTuple, Dict, List, Optional, Set
from dataclasses import dataclass

@dataclass
class File:
    modification_time: float
    size: int
    file_hash: Optional[str] = None

class Hashes(NamedTuple):
    path2hash: Dict[str, File]

    @staticmethod
    def create() -> Hashes:
        return Hashes({})

    def index_by_stat(self):
        index = {}

        for obj in self.path2hash.values():
            key = (obj.modification_time, obj.size)

            if key in index:
                index[key] = None
            else:
                index[key] = obj.file_hash

        return index

def store_hashes(path: str, hashes: Hashes):
    with open(path, 'w') as fd:
        writer = csv.writer(fd)
        writer.writerow(['file_path', 'hash', 'modification_time', 'size'])

        for file_path in sorted(hashes.path2hash):
            file_obj = hashes.path2hash[file_path]
            writer.writerow([file_path, file_obj.file_hash, file_obj.modification_time, file_obj.size])


def load_hashes(path: str):
    hashes = Hashes.create()

    try:
        with open(path) as fd:
            reader = csv.reader(fd)
            next(reader)

            for file_path, file_hash, modification_time, size in reader:
                hashes.path2hash[file_path] = File(float(modification_time), int(size), file_hash or None)

    except FileNotFoundError:
        pass

    return hashes
