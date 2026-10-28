import subjectAliases from './config/subject-aliases.json' with { type: 'json' }

export function normalizeAnswer(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

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
