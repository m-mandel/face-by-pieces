// Share concurrent decodes (including StrictMode's repeated effects), then
// release our references so visiting portraits does not retain decoded images.
const pendingLayers = new Map()

export function loadPortraitLayers(layers) {
  return Promise.all(
    layers.map(({ src }) => {
      if (!pendingLayers.has(src)) {
        const image = new Image()
        image.decoding = 'async'
        image.src = src
        pendingLayers.set(
          src,
          image.decode().finally(() => pendingLayers.delete(src)),
        )
      }
      return pendingLayers.get(src)
    }),
  )
}
