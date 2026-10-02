// Share concurrent decodes (including StrictMode's repeated effects), then
// release our references so visiting portraits does not retain decoded images.
const pendingLayers = new Map()

function loadPortraitLayer(src, priority = 'auto') {
  let pending = pendingLayers.get(src)
  if (!pending) {
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = priority
    image.src = src
    pending = {
      image,
      promise: image.decode().finally(() => pendingLayers.delete(src)),
    }
    pendingLayers.set(src, pending)
  } else if (priority !== 'low') {
    // A clue can reuse and promote a download already started in the background.
    pending.image.fetchPriority = priority
  }
  return pending.promise
}

export function loadPortraitLayers(layers) {
  return Promise.all(layers.map(({ src }) => loadPortraitLayer(src)))
}

export function preloadPortraitLayers(layers) {
  let cancelled = false
  let nextIndex = 0
  let timer
  const warmLayers = async () => {
    while (!cancelled && nextIndex < layers.length) {
      const { src } = layers[nextIndex++]
      // A background failure must not affect the drawing or prevent a retry.
      await loadPortraitLayer(src, 'low').catch(() => {})
    }
  }

  // Let the first clue paint before starting at most two background decodes.
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(() => {
      void warmLayers()
      void warmLayers()
    }, 0)
  })

  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  }
}
