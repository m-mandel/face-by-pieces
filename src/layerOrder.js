import layerOrder from './config/layer-order.json' with { type: 'json' }

// Return the original catalog index so rendering, saved steps, and replay keep
// their existing layer alignment and numbering.
export function getNextLayerIndex(layers, visibleIndices = [], random = Math.random) {
  const visible = new Set(visibleIndices)
  const remaining = new Map(
    layers.flatMap((layer, index) => visible.has(index) ? [] : [[layer.id, index]]),
  )

  for (const group of layerOrder.groups) {
    const candidates = group.layers
      .map((id) => remaining.get(id))
      .filter((index) => index !== undefined)
    if (candidates.length === 0) continue

    return group.order === 'random'
      ? candidates[Math.floor(random() * candidates.length)]
      : candidates[0]
  }

  // New layer names not yet in the configuration still get revealed, last.
  return remaining.values().next().value ?? null
}
