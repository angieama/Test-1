import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = 'dist';
function filesAt(dir) { return readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? filesAt(join(dir,entry.name)) : [join(dir,entry.name)]); }
const files = filesAt(root).filter(file => !file.endsWith('/sw.js')).sort();
const paths = files.map(file => relative(root,file) === 'index.html' ? '/' : '/' + relative(root,file).split('\\').join('/'));
const hash = createHash('sha256');
for (const file of files) {hash.update(file);hash.update(readFileSync(file));}
hash.update(readFileSync('scripts/service-worker.template.js'));
const version = hash.digest('hex').slice(0,16);
const template = readFileSync('scripts/service-worker.template.js','utf8');
writeFileSync(join(root,'sw.js'), template.replace('__CACHE_VERSION__',version).replace('__PRECACHE__',JSON.stringify(paths)));
console.log(`Service worker generated: ${paths.length} app files, cache ${version}`);
