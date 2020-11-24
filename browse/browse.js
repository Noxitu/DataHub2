
const ROOT_ID = -1
const directories = { '/id': ROOT_ID }
const id2dir = { ROOT_ID: directories }
const hash2paths = {}

let CONFIG = null

var next_directory_id = 0

function split_filepath(filepath) {
   const i = filepath.lastIndexOf('/')

   if (i == -1) {
      console.log(filepath)
      throw 'No'
   }

   return [filepath.substr(0, i), filepath.substr(i + 1)]
}

function combine_hash(hash1, hash2) {
   if (hash1 === '' || hash2 === '')
      return ''

   const ret = []

   for (var i = 0; i < 32; ++i) {
      ret.push((parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)).toString(16))
   }

   return ret.join('')
}

function index_hash(hash, path) {
   if (!(hash in hash2paths))
      hash2paths[hash] = []

   hash2paths[hash].push(path)
}

function hash2str(hash)
{
   if (hash === '') return '[unknown]'

   return hash.substr(0, 6)
}

function size2str(size) {
   if (size == 0)
      return 'empty'

   if (size < 1024)
      return `${size}`

   size = Math.floor(size / 1024)

   if (size < 1024)
      return `${size}K`

   size = Math.floor(size / 1024)

   if (size < 1024)
      return `${size}M`

   size = Math.floor(size / 1024)

   return `${size}G`
}

function get_directory(dirpath) {
   const parts = dirpath.split('/')

   var ret = directories

   for (var i = 0; i < parts.length; ++i) {
      const part = parts[i]

      if (part in ret)
         ret = ret[part]
      else {
         const id = next_directory_id++
         const dir = { '/id': id }

         ret[part] = dir
         id2dir[id] = dir

         ret = dir
      }
   }

   return ret
}

function is_ignored(filepath) {
   const parts = filepath.split('/')

   if (parts[parts.length-1] == 'Thumbs.db') return true
   if (parts[parts.length-1] == 'Picasa.ini') return true

   if (parts.length < 2) return false

   if (parts[1].substr(0, 7) == '.Trash-') return true
   if (parts[1] == '$RECYCLE.BIN') return true
   if (parts[1] == 'System Volume Information') return true

   return false
}

function handle(data) {
   for (var i = 1; i < data.length; ++i) {
      if (data[i].length != 4)
         continue

      let [filepath, hash, mtime, size] = data[i]

      if (is_ignored(filepath))
         continue

      if (hash.substr(0, 1) == '?')
         hash = hash.substr(1)

      const [dirpath, filename] = split_filepath(filepath)
      const dir = get_directory(dirpath)
      dir[filename] = [hash, mtime * 1, size * 1]

      index_hash(hash, filepath)
   }
}

function traverse_tree(dir, path = '') {
   let current_size = 0
   let current_hash = '0'.repeat(32)
   let current_child_count = 0
   let current_file_count = 0

   Object.keys(dir).forEach(object => {
      if (object.substr(0, 1) == '/')
         return

      const is_directory = ('/id' in dir[object])

      if (is_directory) {
         traverse_tree(dir[object], `${path}${path != '' ? '/' : ''}${object}`)
         var size = dir[object]['/size']
         var hash = dir[object]['/hash']
         var count = dir[object]['/count']
      }
      else {
         var [hash, _, size] = dir[object]
         var count = 1
      }

      current_size += size
      current_hash = combine_hash(current_hash, hash)
      current_file_count += count
      current_child_count += 1
   })

   dir['/size'] = current_size
   dir['/hash'] = current_hash
   dir['/count'] = current_file_count

   if (path != '' && current_child_count > 1)
      index_hash(current_hash, path)
}

function generate(dir) {
   const current_id = dir['/id']
   const parent_element = document.querySelector(`[data-dirid="${current_id}"]`)
   const indent = (parent_element.dataset.tab | 0) + 1

   function generate_object(object) {
      if (object.substr(0, 1) == '/')
         return

      const sub_element = document.createElement('div')
      sub_element.className = 'subtree'

      const is_directory = ('/id' in dir[object])

      sub_element.dataset.dirid = dir[object]['/id']
      sub_element.dataset.tab = indent

      const html = []
      html.push(`<div `)

      if (is_directory)
         html.push(`class="object directory" onclick="toggle(this)"`)
      else
         html.push(`class="object file"`)

      html.push(`style="padding-left: ${20 + 20 * indent}px;"><span class="object-name">${object}`)

      if (is_directory) {
         html.push(`/`)

         var hash = dir[object]['/hash']
         var size = dir[object]['/size']
         var count = dir[object]['/count']
      }
      else {
         var [hash, _, size] = dir[object]
         var count = 1
      }

      html.push(`</span>`)
      html.push(`<span>`)

      const other = hash2paths[hash]

      if (size > 0 && other.length > 1 && hash !== '') {
         other.forEach(filepath => {
            const fileroot = filepath.split('/')[0]
            if (CONFIG.show_copy[fileroot] === false)
                return

            const [dirpath, _] = split_filepath(filepath)
            const parent_id = get_directory(dirpath)['/id']

            if (parent_id != current_id)
               html.push(`<span class="object-tag object-link">-> ${filepath}</span>`)
         })
      }

      html.push(`</span>`)
      html.push(`<span><span class="object-tag object-hash">${hash2str(hash)}</span></span>`)
      html.push(`<span><span class="object-tag object-size">${size2str(size)}</span></span>`)
      html.push(`<span>`)
      if (count > 1)
         html.push(`<span class="object-tag object-count">${size2str(count)}</span>`)
      html.push(`</span>`)
      html.push(`</div>`)

      sub_element.innerHTML = html.join('')
      parent_element.append(sub_element)
   }
   
   Object.keys(dir).forEach(object => 
   {

      if (object.substr(0, 1) == '/')
         return
         
      const is_directory = ('/id' in dir[object])
      if (is_directory) generate_object(object)
   })

   Object.keys(dir).forEach(object => 
   {
      if (object.substr(0, 1) == '/')
         return

      const is_directory = ('/id' in dir[object])
      if (!is_directory) generate_object(object)
   })
}

function toggle(object) {
   const subtree = object.parentElement

   if (subtree.dataset.gen !== 'ok') {
      const id = subtree.dataset.dirid
      generate(id2dir[id])
      subtree.dataset.gen = 'ok'
   }

   subtree.classList.toggle('open')
}

async function init() {
   function load(csv_path) {
      return fetch(csv_path)
         .then(res => res.text())
         .then(data => csv(data))
   }

   const loaders = []
   CONFIG = await fetch('config.json').then(res => res.json())
   console.log(CONFIG)

   CONFIG['roots'].forEach(root => {
      loaders.push(load(root))
   })

   for (var i = 0; i < loaders.length; ++i)
      await loaders[i].then(res => handle(res))

   console.log('Load finished')

   traverse_tree(directories)

   console.log('Traverse finished')

   generate(directories)
}

init()
