import layerOrder from './config/layer-order.json' with { type: 'json' }

const excluded = new Set(['body', 'necklace', 'accessories', 'unassigned'])
const allowed = new Set(layerOrder.groups.flatMap(group => group.layers))

export function isHeadLayer(id) {
  return allowed.has(id) && !excluded.has(id)
}
