// Legacy SVG catalogs and rendering. New portraits use transparent PNG layers.
import albertEinsteinSvg from '../data/vector-lines/albert_einstein/sketch.svg?raw'
import barackObamaSvg from '../data/vector-lines/barack_obama/sketch.svg?raw'
import cristianoRonaldoSvg from '../data/vector-lines/cristiano_ronaldo/sketch.svg?raw'
import elvisSvg from '../data/vector-lines/elvis/sketch.svg?raw'
import hillaryClintonSvg from '../data/vector-lines/hillary_clinton/abstract.svg?raw'
import johnLennonSvg from '../data/vector-lines/john_lennon/sketch.svg?raw'
import lebronJamesSvg from '../data/vector-lines/lebron_james/abstract.svg?raw'
import lionelMessiSvg from '../data/vector-lines/lionel_messi/sketch.svg?raw'
import marieCurieSvg from '../data/vector-lines/marie_curie/abstract.svg?raw'
import marilynMonroeSvg from '../data/vector-lines/marilyn_monroe/abstract.svg?raw'
import queenElizabethIISvg from '../data/vector-lines/queen_elizabeth_II/abstract.svg?raw'
import ruthBaderGinsburgSvg from '../data/vector-lines/ruth_bader_ginsburg/abstract.svg?raw'
import simoneBilesSvg from '../data/vector-lines/simone_biles/abstract.svg?raw'
import stevenSpielbergSvg from '../data/vector-lines/steven_spielberg/abstract.svg?raw'
import tomHanksSvg from '../data/vector-lines/tom_hanks/abstract.svg?raw'
import abstractAlbertEinsteinSvg from '../data/svg/albert_einstein/abstract.svg?raw'
import abstractBarackObamaSvg from '../data/svg/barack_obama/abstract.svg?raw'
import abstractCristianoRonaldoSvg from '../data/svg/cristiano_ronaldo/abstract.svg?raw'
import abstractElvisSvg from '../data/svg/elvis/abstract.svg?raw'
import abstractHillaryClintonSvg from '../data/svg/hillary_clinton/abstract.svg?raw'
import abstractJohnLennonSvg from '../data/svg/john_lennon/abstract.svg?raw'
import abstractLebronJamesSvg from '../data/svg/lebron_james/abstract.svg?raw'
import abstractLionelMessiSvg from '../data/svg/messi/abstract.svg?raw'
import abstractMarieCurieSvg from '../data/svg/marie_curie/abstract.svg?raw'
import abstractMarilynMonroeSvg from '../data/svg/marilyn_monroe/abstract.svg?raw'
import abstractQueenElizabethIISvg from '../data/svg/queen_elizabeth_II/abstract.svg?raw'
import abstractRuthBaderGinsburgSvg from '../data/svg/ruth_bader_ginsburg/abstract.svg?raw'
import abstractSimoneBilesSvg from '../data/svg/simone_biles/abstract.svg?raw'
import abstractStevenSpielbergSvg from '../data/svg/steven_spielberg/abstract.svg?raw'
import abstractTomHanksSvg from '../data/svg/tom_hanks/abstract.svg?raw'

export const LEGACY_PORTRAITS = [
  {
    id: 'albert-einstein',
    name: 'Albert Einstein',
    aliases: ['Albert Einstein', 'Einstein'],
    styles: {
      'vector-lines': albertEinsteinSvg,
      abstract: abstractAlbertEinsteinSvg,
    },
  },
  {
    id: 'barack-obama',
    name: 'Barack Obama',
    aliases: ['Barack Obama', 'Obama', 'President Obama'],
    styles: {
      'vector-lines': barackObamaSvg,
      abstract: abstractBarackObamaSvg,
    },
  },
  {
    id: 'cristiano-ronaldo',
    name: 'Cristiano Ronaldo',
    aliases: ['Cristiano Ronaldo', 'Christiano Ronaldo', 'Ronaldo', 'CR7'],
    styles: {
      'vector-lines': cristianoRonaldoSvg,
      abstract: abstractCristianoRonaldoSvg,
    },
  },
  {
    id: 'elvis-presley',
    name: 'Elvis Presley',
    aliases: ['Elvis Presley', 'Elvis'],
    styles: {
      'vector-lines': elvisSvg,
      abstract: abstractElvisSvg,
    },
  },
  {
    id: 'hillary-clinton',
    name: 'Hillary Clinton',
    aliases: ['Hillary Clinton', 'Hillary Rodham Clinton', 'Hillary', 'Clinton'],
    styles: {
      'vector-lines': hillaryClintonSvg,
      abstract: abstractHillaryClintonSvg,
    },
  },
  {
    id: 'john-lennon',
    name: 'John Lennon',
    aliases: ['John Lennon', 'Lennon'],
    styles: {
      'vector-lines': johnLennonSvg,
      abstract: abstractJohnLennonSvg,
    },
  },
  {
    id: 'lebron-james',
    name: 'LeBron James',
    aliases: ['LeBron James', 'Lebron James', 'LeBron', 'Lebron', 'King James'],
    styles: {
      'vector-lines': lebronJamesSvg,
      abstract: abstractLebronJamesSvg,
    },
  },
  {
    id: 'lionel-messi',
    name: 'Lionel Messi',
    aliases: ['Lionel Messi', 'Leo Messi', 'Messi'],
    styles: {
      'vector-lines': lionelMessiSvg,
      abstract: abstractLionelMessiSvg,
    },
  },
  {
    id: 'marie-curie',
    name: 'Marie Curie',
    aliases: ['Marie Curie', 'Marie', 'Curie', 'Madame Curie'],
    styles: {
      'vector-lines': marieCurieSvg,
      abstract: abstractMarieCurieSvg,
    },
  },
  {
    id: 'marilyn-monroe',
    name: 'Marilyn Monroe',
    aliases: ['Marilyn Monroe', 'Marilyn', 'Monroe'],
    styles: {
      'vector-lines': marilynMonroeSvg,
      abstract: abstractMarilynMonroeSvg,
    },
  },
  {
    id: 'queen-elizabeth-ii',
    name: 'Queen Elizabeth II',
    aliases: ['Queen Elizabeth II', 'Elizabeth II', 'Queen Elizabeth', 'The Queen', 'Elizabeth', 'Queen of England'],
    styles: {
      'vector-lines': queenElizabethIISvg,
      abstract: abstractQueenElizabethIISvg,
    },
  },
  {
    id: 'ruth-bader-ginsburg',
    name: 'Ruth Bader Ginsburg',
    aliases: ['Ruth Bader Ginsburg', 'Ruth Ginsburg', 'RBG', 'Justice Ginsburg', 'Ginsburg'],
    styles: {
      'vector-lines': ruthBaderGinsburgSvg,
      abstract: abstractRuthBaderGinsburgSvg,
    },
  },
  {
    id: 'simone-biles',
    name: 'Simone Biles',
    aliases: ['Simone Biles', 'Simone', 'Biles'],
    styles: {
      'vector-lines': simoneBilesSvg,
      abstract: abstractSimoneBilesSvg,
    },
  },
  {
    id: 'steven-spielberg',
    name: 'Steven Spielberg',
    aliases: ['Steven Spielberg', 'Spielberg'],
    styles: {
      'vector-lines': stevenSpielbergSvg,
      abstract: abstractStevenSpielbergSvg,
    },
  },
  {
    id: 'tom-hanks',
    name: 'Tom Hanks',
    aliases: ['Tom Hanks', 'Tom', 'Hanks'],
    styles: {
      'vector-lines': tomHanksSvg,
      abstract: abstractTomHanksSvg,
    },
  },
]

const NON_REVEALABLE_TAGS = new Set(['defs', 'title', 'desc', 'metadata', 'style'])
const MAX_INDIVIDUAL_DETAIL_ELEMENTS = 24

function getRevealableElements(root) {
  const rootElements = Array.from(root.children).filter(
    (child) => !NON_REVEALABLE_TAGS.has(child.tagName.toLowerCase()),
  )
  const subject = rootElements.find((element) => element.id === 'subject')

  // Some Illustrator exports keep the useful clue groups nested under one
  // subject wrapper. Reveal those groups while retaining any background clue.
  if (rootElements.length <= 2 && subject?.children.length > 1) {
    return rootElements.flatMap((element) => (
      element === subject ? Array.from(subject.children) : [element]
    ))
  }

  return rootElements
}

function getAbstractDetailElements(root) {
  const detailGroups = [
    ['face-details', 'face_details', 'head_face'],
    ['clothing-details', 'clothing_details'],
  ]

  // Group order provides stable replay indices. Flat Illustrator exports with
  // many raw paths stay together so a clue remains visually meaningful.
  return detailGroups.flatMap((groupIds) => {
    const group = groupIds
      .map((groupId) => root.querySelector(`#${groupId}`))
      .find(Boolean)
    if (!group) return []

    const elements = Array.from(group.children)
    return elements.length > MAX_INDIVIDUAL_DETAIL_ELEMENTS ? [group] : elements
  })
}

export function getLegacyElementCount(svgText, styleId) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  return styleId === 'abstract'
    ? getAbstractDetailElements(doc.documentElement).length
    : getRevealableElements(doc.documentElement).length
}

export function renderLegacySvg(svgText, visibleIndices = null, styleId = 'vector-lines') {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement

  root.removeAttribute('width')
  root.removeAttribute('height')
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('focusable', 'false')

  if (visibleIndices) {
    const visible = new Set(visibleIndices)
    const revealableElements = styleId === 'abstract'
      ? getAbstractDetailElements(root)
      : getRevealableElements(root)
    revealableElements.forEach((element, index) => {
      if (!visible.has(index)) element.setAttribute('visibility', 'hidden')
    })
  }

  return new XMLSerializer().serializeToString(root)
}

