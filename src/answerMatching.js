import { normalizeAnswer } from './normalizeAnswer.js'
import { compareNames } from './nameSimilarity.js'
export { normalizeAnswer } from './normalizeAnswer.js'

import subjectAliases from './config/subject-aliases.json' with { type: 'json' }
import correctAliases from './config/subject-correct-aliases.json' with { type: 'json' }

const suffixPattern = /\s+(?:jr\.?|junior|jnr\.?|sr\.?|ii|iii|iv)$/i
const aliasTitles = new Set(['the', 'president', 'queen', 'king', 'princess', 'prince', 'lady', 'lord', 'mother', 'pope', 'justice', 'madame', 'sir', 'dr'])

// A first name identifies an incomplete attempt, never a fully correct answer.
// Derive variants only from trusted names, not the expanded spelling-error list.
export function getFirstNameAliases({ id, name, correctAliases: trusted = [] }) {
  const canonicalWords = name.trim().split(/\s+/)
  if (canonicalWords.length < 2) return [] // Adele, Madonna, Beyoncé, etc.
  const givenName = name.replace(/^(?:pope|queen|mother)\s+/i, '').split(/[\s,]+/)[0]
  const configured = correctAliases[id] || []
  const nicknames = new Set(configured.filter(alias => !/\s/.test(alias.trim())).map(normalizeAnswer))
  const firstNames = new Map([[normalizeAnswer(givenName), givenName]])
  for (const alias of [name, ...configured, ...trusted]) {
    const words = alias.replace(suffixPattern, '').trim().split(/\s+/)
    const first = normalizeAnswer(words[0])
    if (words.length < 2 || first.length < 2 || aliasTitles.has(first) || nicknames.has(first)) continue
    firstNames.set(first, words[0])
  }
  return [...firstNames.values()]
}

export function getSubjectAliases(portrait) {
  const { id, name, aliases = [] } = portrait
  const seen = new Set()
  return [name, ...aliases, ...getFirstNameAliases(portrait), ...(subjectAliases[id] || [])].filter((alias) => {
    const normalized = normalizeAnswer(alias)
    // A suffix alone does not identify a person (the old surname fallback
    // produced "Jr" for Robert Downey Jr and Martin Luther King Jr).
    if (!normalized || /^(jr|sr|ii|iii|iv)$/.test(normalized) || seen.has(normalized)) {
      return false
    }
    seen.add(normalized)
    return true
  })
}

function normalizedNameWords(value) {
  // Compare whole words in any order, keeping repeated words distinct.
  return value.split(/[\s.,;:\-–—/]+/).map(normalizeAnswer).filter(Boolean).sort().join(' ')
}

export function isCorrectAnswer(guess, aliases) {
  const normalized = normalizeAnswer(guess)
  if (normalized === '') return false
  const words = normalizedNameWords(guess)
  return aliases.some(alias => normalizeAnswer(alias) === normalized || normalizedNameWords(alias) === words)
}

// Call before expanding the typo list: only real names and correctly spelled
// nicknames belong here. These are also the targets for similarity matching.
export function getCorrectAliases({ id, name, aliases = [] }) {
  const withoutSuffix = name.replace(suffixPattern, '')
  const surname = id === 'diana-princess-of-wales' ? 'Spencer' : withoutSuffix.split(' ').at(-1)
  const candidates = [name, ...aliases, ...(correctAliases[id] || []), withoutSuffix, surname]
  if (/\s+jr\.?$/i.test(name)) candidates.push(name.replace(/jr\.?$/i, 'Junior'), name.replace(/jr\.?$/i, 'Jnr'))
  const incomplete = new Set(getFirstNameAliases({ id, name, correctAliases: candidates }).map(normalizeAnswer))
  const seen = new Set()
  return candidates.filter((candidate) => {
    const normalized = normalizeAnswer(candidate)
    if (!normalized || /^(jr|junior|sr|senior|ii|iii|iv)$/.test(normalized) || incomplete.has(normalized) || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function getAnswerOutcome(guess, portrait, catalog = []) {
  if (!guess || guess.length > 200) return 'incorrect'
  const firstNames = getFirstNameAliases(portrait)
  // Apply this even to callers with an old precomputed correct-alias list.
  if (isCorrectAnswer(guess, firstNames)) return 'inaccurate'
  const targets = (portrait.correctAliases ?? getCorrectAliases({ id: portrait.id, name: portrait.name }))
    .filter(alias => !isCorrectAnswer(alias, firstNames))
  if (isCorrectAnswer(guess, targets)) return 'correct'
  // A known misspelling identifies the intended person, but is not accurate.
  if (isCorrectAnswer(guess, portrait.aliases || [])) return 'inaccurate'

  const match = compareNames(guess, [...targets, ...firstNames])
  if (match.classification === 'no_match') return 'incorrect'

  // A suggestion must be unambiguous within our catalog. In particular, do
  // not accept another person's correctly spelled name as a close answer.
  for (const other of catalog) {
    if (other.id === portrait.id) continue
    const alternative = compareNames(guess, [
      ...(other.correctAliases ?? getCorrectAliases({ id: other.id, name: other.name })),
      ...getFirstNameAliases(other),
    ])
    if (alternative.classification !== 'no_match' &&
        alternative.normalizedDistance <= match.normalizedDistance) return 'incorrect'
  }
  return 'inaccurate'
}
