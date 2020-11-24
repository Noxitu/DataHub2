import hashlib

HASH = hashlib.md5
BLOCK_SIZE = 256*128

def md5(file_path: str) -> str:
    md5 = HASH()

    with open(file_path,'rb') as fd: 
        for chunk in iter(lambda: fd.read(BLOCK_SIZE), b''): 
            md5.update(chunk)
    
    return md5.hexdigest()
