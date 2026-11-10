import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { isHeadLayer } from './headLayers.js'
import layerOrder from './config/layer-order.json' with { type: 'json' }

test('only configured head and face layers enter the game catalog', () => {
  const ids = layerOrder.groups.flatMap(group => group.layers)
  for (const id of ['body', 'necklace', 'accessories', 'unassigned', 'unknown']) {
    assert.equal(isHeadLayer(id), false)
    assert.ok(!ids.includes(id))
  }
  for (const id of ['face-outline', 'hair', 'headwear', 'earrings', 'face-piercings']) {
    assert.ok(isHeadLayer(id))
  }
})

test('generated heads cover the original catalog with aligned layer and photo canvases', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const folders = readdirSync(join(root, 'data/line-art'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name)
  assert.ok(folders.length > 0)
  function pngSize(path) {
    const data = readFileSync(path)
    assert.equal(data.subarray(1, 4).toString(), 'PNG', path)
    return [data.readUInt32BE(16), data.readUInt32BE(20)]
  }
  for (const folder of folders) {
    const directory = join(root, 'data-head/line-art', folder)
    const metadata = JSON.parse(readFileSync(join(directory, 'generation.json')))
    const report = JSON.parse(readFileSync(join(directory, 'report.json')))
    const size = metadata.canvas_size
    assert.deepEqual(report.framing, { width: size[0], height: size[1], viewBox: [0, 0, ...size] }, folder)
    assert.ok(metadata.layers.length > 0, folder)
    const files = readdirSync(join(directory, 'transparent')).filter(file => file.endsWith('.png')).sort()
    assert.deepEqual(files, metadata.layers.map(id => `${id}.png`).sort(), folder)
    for (const id of metadata.layers) {
      assert.ok(isHeadLayer(id), `${folder}/${id}`)
      assert.ok(report.class_pixels[id] >= 200, `${folder}/${id}`)
      assert.deepEqual(pngSize(join(directory, 'transparent', `${id}.png`)), size, `${folder}/${id}`)
    }
    for (const [field, filename] of [['source', 'source.png'], ['cutout_input', 'source-no-bg.png']]) {
      const path = join(root, 'data-head/sources', folder, filename)
      assert.equal(existsSync(path), Boolean(metadata[field]), path)
      if (metadata[field]) assert.deepEqual(pngSize(path), size, path)
    }
  }
})
