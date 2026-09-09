// Measure the union of all eligible layers once per portrait. Using the same
// bounds for every clue preserves alignment as layers are shuffled or revealed.
const boundsCache = new WeakMap()

async function measureBounds(artwork) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  let left = Infinity
  let top = Infinity
  let right = -1
  let bottom = -1
  let initialized = false

  for (const layer of artwork.layers) {
    const image = new Image()
    image.src = layer.src
    await image.decode()

    if (!initialized) {
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      initialized = true
    }
    // A shared canvas is required for the layers to line up. If a future data
    // set mixes sizes, retain the uncropped renderer instead of clipping it.
    if (
      image.naturalWidth !== canvas.width ||
      image.naturalHeight !== canvas.height
    )
      return null

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

    for (let y = 0; y < canvas.height; y += 1) {
      let first = -1
      let last = -1
      for (
        let x = 0, offset = y * canvas.width * 4;
        x < canvas.width;
        x += 1, offset += 4
      ) {
        if (
          data[offset + 3] > 0 &&
          (data[offset] < 255 ||
            data[offset + 1] < 255 ||
            data[offset + 2] < 255)
        ) {
          if (first === -1) first = x
          last = x
        }
      }
      if (first !== -1) {
        left = Math.min(left, first)
        right = Math.max(right, last)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    // Yield between layers so input and refresh controls remain responsive.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (right < left) return null

  // Keep a source pixel of breathing room for edge antialiasing.
  left = Math.max(0, left - 1)
  top = Math.max(0, top - 1)
  right = Math.min(canvas.width, right + 2)
  bottom = Math.min(canvas.height, bottom + 2)
  return {
    width: canvas.width,
    height: canvas.height,
    viewBox: [left, top, right - left, bottom - top],
  }
}

export function getPortraitBounds(artwork) {
  if (!boundsCache.has(artwork)) {
    // A failed download or canvas read must leave the full canvas visible.
    boundsCache.set(
      artwork,
      measureBounds(artwork).catch(() => null),
    )
  }
  return boundsCache.get(artwork)
}
