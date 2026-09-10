#!/usr/bin/env node
// Static preview server (Node alternative to serve_viewer.py). Usage: node serve_viewer.js  (PORT env optional)
const http = require('http')
const fs = require('fs')
const path = require('path')
const ROOT = __dirname
const PORT = parseInt(process.env.PORT || '4188', 10)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.obj': 'text/plain',
  '.mtl': 'text/plain'
}
http.createServer((req, res) => {
  const rel = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\]|\.\.[/\\])+/, '')
  const file = path.join(ROOT, rel || 'viewer.html')
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => console.log('http://localhost:' + PORT + '/viewer.html'))
