import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { getNextLayerIndex } from './layerOrder.js'
import layerOrder from './config/layer-order.json' with { type: 'json' }

const core = ['eyes', 'eyebrows', 'nose', 'mouth', 'hair', 'ears']
const tail = [
  'facial-hair', 'eyewear', 'face-details', 'body', 'headwear', 'earrings',
  'necklace', 'face-piercings', 'accessories', 'unassigned',
]

function reveal(layers, random = () => 0) {
  const indices = []
  for (let step = 0; step < layers.length; step += 1) {
    const next = getNextLayerIndex(layers, indices, random)
    assert.notEqual(next, null)
    assert.ok(!indices.includes(next), 'a layer must only be selected once')
    indices.push(next)
  }
  assert.equal(getNextLayerIndex(layers, indices, random), null)
  return indices.map((index) => layers[index].id)
}

test('configuration uses supported orders and lists every layer only once', () => {
  const ids = layerOrder.groups.flatMap((group) => {
    assert.ok(['ordered', 'random'].includes(group.order))
    assert.ok(group.layers.length > 0)
    return group.layers
  })
  assert.equal(new Set(ids).size, ids.length)
})

test('reveals outline, exhausts randomized core features, then uses the fixed tail', () => {
  // Catalog/stacking order deliberately differs from reveal order.
  const layers = ['face-outline', ...core, ...tail].reverse().map(id => ({ id }))
  const original = structuredClone(layers)
  const forward = reveal(layers, () => 0)
  const backward = reveal(layers, () => 0.999)
  assert.deepEqual(forward, ['face-outline', ...core, ...tail])
  assert.deepEqual(backward, ['face-outline', ...core.toReversed(), ...tail])
  assert.deepEqual(layers, original, 'revealing must not reorder the catalog')
})

test('skips missing layers and empty groups, including a missing outline', () => {
  const layers = ['body', 'eyewear', 'nose', 'accessories', 'face-details', 'headwear']
    .map(id => ({ id }))
  assert.deepEqual(reveal(layers), [
    'nose', 'eyewear', 'face-details', 'body', 'headwear', 'accessories',
  ])
})

test('unconfigured layers appear last and an empty portrait is complete', () => {
  const layers = ['future-layer', 'body', 'face-outline'].map(id => ({ id }))
  assert.deepEqual(reveal(layers), ['face-outline', 'body', 'future-layer'])
  assert.equal(getNextLayerIndex([]), null)
})

test('every current portrait reveals all eligible layers in group order', () => {
  const directory = new URL('../data/line-art/', import.meta.url)
  let portraits = 0
  for (const folder of readdirSync(directory, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue
    const root = new URL(`${folder.name}/`, directory)
    const transparent = new URL('transparent/', root)
    if (!existsSync(transparent)) continue
    const reportPath = new URL('report.json', root)
    const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {}
    const layers = readdirSync(transparent)
      .filter(file => file.endsWith('.png') && !(report.class_pixels?.[file.slice(0, -4)] < 200))
      .sort()
      .map(file => ({ id: file.slice(0, -4) }))
    if (!layers.length) continue
    portraits += 1
    const result = reveal(layers, () => 0.37)
    const groups = result.map(id => {
      const group = layerOrder.groups.findIndex(group => group.layers.includes(id))
      assert.notEqual(group, -1, `${join(folder.name, id)} needs a configured group`)
      return group
    })
    assert.deepEqual(groups, groups.toSorted((a, b) => a - b), folder.name)
    if (layers.some(layer => layer.id === 'face-outline')) {
      assert.equal(result[0], 'face-outline', folder.name)
    }
  }
  assert.ok(portraits > 0)
})
