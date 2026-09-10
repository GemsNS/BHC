#!/usr/bin/env node
'use strict'
// Convert the JSCAD 3MF to a colour-preserving browser-ready GLB, plus an OBJ keyed to the .mtl.
// Node port of convert_model.py (no Python / trimesh required). Usage: node convert_model.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = __dirname
const SOURCE = path.join(ROOT, 'walid_warehouse_two_tone.3mf')
const GLB = path.join(ROOT, 'walid_warehouse_two_tone.glb')
const STATS = path.join(ROOT, 'walid_warehouse_two_tone_stats.json')
const OBJ = path.join(ROOT, 'walid_warehouse_two_tone.obj')
const MTL = 'walid_warehouse_two_tone.mtl'

const COLOUR_NAMES = {
  '142,79,42,255': 'burnt_sienna',
  '102,53,29,255': 'burnt_sienna_joint',
  '37,40,43,255': 'manor_grey',
  '23,25,27,255': 'manor_shadow',
  '31,51,61,199': 'glazing',
  '16,18,20,255': 'black_trim',
  '119,123,125,255': 'doors',
  '139,142,140,255': 'concrete',
  '102,99,93,255': 'terrain',
  '90,88,82,255': 'driveway',
  '255,163,107,255': 'warm_light'
}

// Minimal ZIP reader (stored / deflate entries only).
const readZipEntry = (buf, wanted) => {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i += 1) {
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28)
    const elen = buf.readUInt16LE(p + 30)
    const clen = buf.readUInt16LE(p + 32)
    const name = buf.toString('utf8', p + 46, p + 46 + nlen)
    const local = buf.readUInt32LE(p + 42)
    if (name === wanted) {
      const lnlen = buf.readUInt16LE(local + 26)
      const lelen = buf.readUInt16LE(local + 28)
      const start = local + 30 + lnlen + lelen
      const data = buf.subarray(start, start + csize)
      return method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data)
    }
    p += 46 + nlen + elen + clen
  }
  throw new Error('entry not found in 3MF: ' + wanted)
}

const parseColour = (raw) => {
  if (raw.toUpperCase().startsWith('#1ECCD6')) return [31, 51, 61, 199]
  const m = /^#([0-9A-Fa-f]{8})/.exec(raw)
  if (!m) throw new Error('Unsupported 3MF colour: ' + raw)
  return [0, 2, 4, 6].map((i) => parseInt(m[1].slice(i, i + 2), 16))
}

// Parse the 3MF model XML (regex based; JSCAD output is regular).
const xml = readZipEntry(fs.readFileSync(SOURCE), '3D/3dmodel.model').toString('utf8')
const materials = [...xml.matchAll(/<base [^>]*displaycolor="([^"]+)"/g)].map((m) => parseColour(m[1]))
const groups = new Map()
for (const obj of xml.matchAll(/<object ([^>]*)>([\s\S]*?)<\/object>/g)) {
  const attrs = obj[1]
  const body = obj[2]
  const pindex = /pindex="(\d+)"/.exec(attrs)
  const colour = materials[pindex ? parseInt(pindex[1], 10) : 0]
  const verts = [...body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((v) => [+v[1], +v[2], +v[3]])
  const tris = [...body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((t) => [+t[1], +t[2], +t[3]])
  if (!verts.length || !tris.length) continue
  const key = colour.join(',')
  if (!groups.has(key)) groups.set(key, { colour, vertices: [], faces: [], offset: 0 })
  const g = groups.get(key)
  for (const v of verts) g.vertices.push(v)
  for (const t of tris) g.faces.push(t.map((i) => i + g.offset))
  g.offset += verts.length
}

// Build glTF.
const bufferChunks = []
let byteLength = 0
const bufferViews = []
const accessors = []
const meshes = []
const nodes = []
const gltfMaterials = []
const stats = { geometry_count: 0, triangle_count: 0, vertex_count: 0 }
const boundsMin = [Infinity, Infinity, Infinity]
const boundsMax = [-Infinity, -Infinity, -Infinity]

const pushView = (buf, target) => {
  const pad = (4 - (byteLength % 4)) % 4
  if (pad) { bufferChunks.push(Buffer.alloc(pad)); byteLength += pad }
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, target })
  bufferChunks.push(buf)
  byteLength += buf.length
  return bufferViews.length - 1
}

const sortedKeys = [...groups.keys()].sort((a, b) => {
  const A = a.split(',').map(Number)
  const B = b.split(',').map(Number)
  for (let i = 0; i < 4; i += 1) if (A[i] !== B[i]) return A[i] - B[i]
  return 0
})

sortedKeys.forEach((key, index) => {
  const g = groups.get(key)
  const n = g.vertices.length
  const pos = new Float32Array(n * 3)
  const col = new Uint8Array(n * 4)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  g.vertices.forEach(([x, y, z], i) => {
    // Rotate -90 degrees about X: Z-up (JSCAD) to Y-up (glTF).
    const p = [x, z, -y]
    for (let k = 0; k < 3; k += 1) {
      pos[i * 3 + k] = p[k]
      if (p[k] < min[k]) min[k] = p[k]
      if (p[k] > max[k]) max[k] = p[k]
      if (p[k] < boundsMin[k]) boundsMin[k] = p[k]
      if (p[k] > boundsMax[k]) boundsMax[k] = p[k]
    }
    col.set(g.colour, i * 4)
  })
  const idx = new Uint32Array(g.faces.length * 3)
  g.faces.forEach((f, i) => idx.set(f, i * 3))

  const idxView = pushView(Buffer.from(idx.buffer), 34963)
  const posView = pushView(Buffer.from(pos.buffer), 34962)
  const colView = pushView(Buffer.from(col.buffer), 34962)
  const idxAcc = accessors.push({ bufferView: idxView, componentType: 5125, count: idx.length, type: 'SCALAR', min: [0], max: [n - 1] }) - 1
  const posAcc = accessors.push({ bufferView: posView, componentType: 5126, count: n, type: 'VEC3', min, max }) - 1
  const colAcc = accessors.push({ bufferView: colView, componentType: 5121, normalized: true, count: n, type: 'VEC4' }) - 1

  const name = COLOUR_NAMES[key] || ('material_' + index + '_' + g.colour[0] + '_' + g.colour[1] + '_' + g.colour[2])
  const material = {
    name,
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: name === 'glazing' ? 0.25 : 0.85 },
    doubleSided: true
  }
  if (name === 'glazing') material.alphaMode = 'BLEND'
  if (name === 'warm_light') material.emissiveFactor = [1.0, 0.64, 0.22]
  const matIndex = gltfMaterials.push(material) - 1
  const meshIndex = meshes.push({ name, primitives: [{ attributes: { POSITION: posAcc, COLOR_0: colAcc }, indices: idxAcc, mode: 4, material: matIndex }] }) - 1
  nodes.push({ name, mesh: meshIndex })
  stats.geometry_count += 1
  stats.triangle_count += g.faces.length
  stats.vertex_count += n
})

const json = {
  asset: { version: '2.0', generator: 'convert_model.js (BH Contracting)' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials: gltfMaterials,
  accessors,
  bufferViews,
  buffers: [{ byteLength }]
}
let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)])
let bin = Buffer.concat(bufferChunks)
if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))])
const header = Buffer.alloc(12)
header.write('glTF', 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8)
const jsonHdr = Buffer.alloc(8)
jsonHdr.writeUInt32LE(jsonBuf.length, 0)
jsonHdr.write('JSON', 4)
const binHdr = Buffer.alloc(8)
binHdr.writeUInt32LE(bin.length, 0)
binHdr.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(GLB, Buffer.concat([header, jsonHdr, jsonBuf, binHdr, bin]))

// Wavefront OBJ with material names matching the shipped .mtl (Z-up, metres, as modelled).
const objLines = ['# BH Contracting Ltd. | Walid Warehouse Two-Tone Model', 'mtllib ' + MTL, '']
let objOffset = 0
sortedKeys.forEach((key) => {
  const g = groups.get(key)
  const name = COLOUR_NAMES[key] || 'other'
  objLines.push('o ' + name, 'usemtl ' + name)
  for (const [x, y, z] of g.vertices) objLines.push('v ' + x + ' ' + y + ' ' + z)
  for (const [a, b, c] of g.faces) objLines.push('f ' + (a + 1 + objOffset) + ' ' + (b + 1 + objOffset) + ' ' + (c + 1 + objOffset))
  objOffset += g.vertices.length
  objLines.push('')
})
fs.writeFileSync(OBJ, objLines.join('\n'))

const r4 = (v) => Math.round(v * 10000) / 10000
const out = {
  source: path.basename(SOURCE),
  glb: path.basename(GLB),
  geometry_count: stats.geometry_count,
  triangle_count: stats.triangle_count,
  vertex_count: stats.vertex_count,
  bounds_min_m: boundsMin.map(r4),
  bounds_max_m: boundsMax.map(r4),
  extents_m: boundsMax.map((v, i) => r4(v - boundsMin[i])),
  embedded_materials: sortedKeys.map((k) => ({ name: COLOUR_NAMES[k] || 'other', rgba: groups.get(k).colour }))
}
fs.writeFileSync(STATS, JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out, null, 2))
