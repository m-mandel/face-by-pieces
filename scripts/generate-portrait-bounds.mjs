import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dataDirectory = join(root, 'data/line-art')
const outputDirectory = join(root, 'src/generated')
const manifest = {}
let layerCount = 0

for (const folder of (await readdir(dataDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()) {
  const directory = join(dataDirectory, folder)
  const report = await readFile(join(directory, 'report.json'), 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') return {}
      throw error
    })
  const files = await readdir(join(directory, 'transparent')).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const layers = files
    .filter(
      (file) =>
        file.endsWith('.png') &&
        !(report.class_pixels?.[file.slice(0, -4)] < 200),
    )
    .sort()
  if (!layers.length) continue

  let width, height
  let left = Infinity,
    top = Infinity,
    right = -1,
    bottom = -1
  let matchingDimensions = true
  for (const file of layers) {
    const png = PNG.sync.read(
      await readFile(join(directory, 'transparent', file)),
    )
    width ??= png.width
    height ??= png.height
    if (width !== png.width || height !== png.height) {
      matchingDimensions = false
      break
    }
    for (let offset = 0; offset < png.data.length; offset += 4) {
      const data = png.data
      if (
        data[offset + 3] === 0 ||
        (data[offset] === 255 &&
          data[offset + 1] === 255 &&
          data[offset + 2] === 255)
      )
        continue
      const pixel = offset / 4
      const x = pixel % width
      const y = Math.floor(pixel / width)
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }

  let bounds = null
  if (matchingDimensions && right >= left) {
    // Match the browser fallback: ignore transparent/white pixels and retain
    // one source pixel around the union of every eligible layer.
    left = Math.max(0, left - 1)
    top = Math.max(0, top - 1)
    right = Math.min(width, right + 2)
    bottom = Math.min(height, bottom + 2)
    bounds = { width, height, viewBox: [left, top, right - left, bottom - top] }
  }
  manifest[folder] = { layers: layers.map((file) => file.slice(0, -4)), bounds }
  layerCount += layers.length
}

await mkdir(outputDirectory, { recursive: true })
const outputPath = join(outputDirectory, 'line-art-bounds.json')
const content = JSON.stringify(manifest) + '\n'
const previous = await readFile(outputPath, 'utf8').catch(() => null)
if (previous !== content) await writeFile(outputPath, content)
console.log(
  `Prepared framing for ${Object.keys(manifest).length} portraits (${layerCount} eligible layers).`,
)
