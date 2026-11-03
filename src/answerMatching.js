import { normalizeAnswer } from './normalizeAnswer.js'
import { compareNames } from './nameSimilarity.js'
export { normalizeAnswer } from './normalizeAnswer.js'

import subjectAliases from './config/subject-aliases.json' with { type: 'json' }


export function getSubjectAliases({ id, name, aliases = [] }) {
  const seen = new Set()
  return [name, ...aliases, ...(subjectAliases[id] || [])].filter((alias) => {
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

export function isCorrectAnswer(guess, aliases) {
  const normalized = normalizeAnswer(guess)
  return normalized !== '' && aliases.some(alias => normalizeAnswer(alias) === normalized)
}

// Capture these BEFORE getSubjectAliases adds generated typo variants. Fuzzy
// matching a typo alias would compound the amount of error we allow.
export function getSimilarityTargets({ name, aliases = [] }) {
  const withoutSuffix = name.replace(/\s+(?:jr\.?|junior|sr\.?|ii|iii|iv)$/i, '')
  const candidates = [name, ...aliases]
  if (withoutSuffix !== name) candidates.push(withoutSuffix, withoutSuffix.split(' ').at(-1))
  const seen = new Set()
  return candidates.filter((candidate) => {
    const normalized = normalizeAnswer(candidate)
    if (!normalized || /^(jr|sr|ii|iii|iv)$/.test(normalized) || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function getAnswerOutcome(guess, portrait, catalog = []) {
  if (!guess || guess.length > 200) return 'incorrect'
  if (isCorrectAnswer(guess, portrait.aliases)) return 'correct'

  const targets = portrait.similarityTargets ?? [portrait.name]
  const match = compareNames(guess, targets)
  if (match.classification === 'no_match') return 'incorrect'
  if (match.classification === 'exact') return 'correct'

  // A suggestion must be unambiguous within our catalog. In particular, do
  // not give partial credit for another person's correctly spelled name.
  for (const other of catalog) {
    if (other.id === portrait.id) continue
    const alternative = compareNames(guess, other.similarityTargets ?? [other.name])
    if (alternative.classification !== 'no_match' &&
        alternative.normalizedDistance <= match.normalizedDistance) return 'incorrect'
  }
  return 'partial'
}
