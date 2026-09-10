import { LEGACY_PORTRAITS, getLegacyElementCount } from './legacyPortraits'
import lineArtBounds from './generated/line-art-bounds.json'

// Import URLs instead of embedding PNG contents in the JavaScript bundle.
const pngFiles = import.meta.glob('../data/line-art/*/transparent/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const reports = import.meta.glob('../data/line-art/*/report.json', {
  eager: true,
  import: 'default',
})

const nameOverrides = {
  beyonce: { name: 'Beyoncé', aliases: ['Beyonce'] },
  'celine-dion': { name: 'Céline Dion', aliases: ['Celine Dion', 'Dion'] },
  'dalai-lama': {
    name: 'Dalai Lama',
    aliases: ['The Dalai Lama', 'Tenzin Gyatso'],
  },
  'diana-princess-of-wales': {
    name: 'Diana, Princess of Wales',
    aliases: ['Princess Diana', 'Diana', 'Lady Diana', 'Diana Spencer'],
  },
}

const portraitsById = new Map(
  LEGACY_PORTRAITS.map((portrait) => [
    portrait.id,
    { ...portrait, styles: { ...portrait.styles } },
  ]),
)

// Alphabetical file order keeps layer indices and stacking stable for replay.
for (const file of Object.keys(pngFiles).sort()) {
  const [, folder, filename] = file.match(
    /\/line-art\/([^/]+)\/transparent\/([^/]+)\.png$/,
  )
  const report = reports[`../data/line-art/${folder}/report.json`]
  // Filter before assigning indices so excluded layers never enter any view or mode.
  if (report?.class_pixels?.[filename] < 200) continue

  const id = folder.replaceAll('_', '-').toLowerCase()
  if (!portraitsById.has(id)) {
    const name =
      nameOverrides[id]?.name ||
      id
        .split('-')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
    portraitsById.set(id, {
      id,
      name,
      aliases: [
        name,
        ...(nameOverrides[id]?.aliases || [name.split(' ').at(-1)]),
      ],
      styles: {},
    })
  }

  const portrait = portraitsById.get(id)
  const artwork = (portrait.styles['line-art'] ||= { layers: [] })
  artwork.layers.push({
    id: filename,
    src: pngFiles[file],
  })
}

for (const [folder, metadata] of Object.entries(lineArtBounds)) {
  const artwork = portraitsById.get(folder.replaceAll('_', '-').toLowerCase())
    ?.styles['line-art']
  // If files were added during development, use the browser fallback until
  // the next generation pass rather than clipping an unmeasured layer.
  if (
    artwork &&
    metadata.layers.length === artwork.layers.length &&
    metadata.layers.every((id, index) => id === artwork.layers[index].id)
  ) {
    artwork.bounds = metadata.bounds
  }
}

export const PORTRAITS = [...portraitsById.values()]

export function getClueIndices(artwork, styleId) {
  if (styleId === 'line-art') {
    return artwork.layers.map((_layer, index) => index)
  }
  return Array.from(
    { length: getLegacyElementCount(artwork, styleId) },
    (_, index) => index,
  )
}
