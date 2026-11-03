import { normalizeAnswer } from './normalizeAnswer.js'

// Unit-cost insertion, deletion, substitution; optionally unrestricted
// Damerau transpositions. Inputs here are already normalized by the caller.
export function editDistance(a, b, { transpositions = false } = {}) {
  const sentinel = a.length + b.length
  const matrix = Array.from({ length: a.length + 2 }, () => Array(b.length + 2).fill(0))
  matrix[0][0] = sentinel
  for (let i = 0; i <= a.length; i++) {
    matrix[i + 1][0] = sentinel
    matrix[i + 1][1] = i
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j + 1] = sentinel
    matrix[1][j + 1] = j
  }
  const lastRow = new Map()
  for (let i = 1; i <= a.length; i++) {
    let lastMatchColumn = 0
    for (let j = 1; j <= b.length; j++) {
      const previousRow = lastRow.get(b[j - 1]) ?? 0
      const previousColumn = lastMatchColumn
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      if (cost === 0) lastMatchColumn = j
      matrix[i + 1][j + 1] = Math.min(
        matrix[i][j] + cost,
        matrix[i + 1][j] + 1,
        matrix[i][j + 1] + 1,
        transpositions
          ? matrix[previousRow][previousColumn] + (i - previousRow - 1) + 1 + (j - previousColumn - 1)
          : Infinity,
      )
    }
    lastRow.set(a[i - 1], i)
  }
  return matrix[a.length + 1][b.length + 1]
}

export function compareNames(guess, targets, {
  maxErrorRate = 0.25,
  maxEdits = 2,
  minLength = 5,
} = {}) {
  if (typeof guess !== 'string' || !Array.isArray(targets) || targets.length === 0 ||
      targets.some((target) => typeof target !== 'string')) {
    throw new Error('Provide a guess and at least one target name.')
  }
  if ([guess, ...targets].some((value) => value.length > 200)) {
    throw new Error('Names must be 200 characters or fewer.')
  }
  if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1 ||
      !Number.isInteger(maxEdits) || maxEdits < 0 ||
      !Number.isInteger(minLength) || minLength < 1) {
    throw new Error('Invalid similarity thresholds.')
  }
  const normalizedGuess = normalizeAnswer(guess)
  const uniqueTargets = new Map()
  for (const target of targets) {
    const normalizedTarget = normalizeAnswer(target)
    if (normalizedTarget && !uniqueTargets.has(normalizedTarget)) uniqueTargets.set(normalizedTarget, target)
  }
  if (uniqueTargets.size === 0) throw new Error('At least one target must contain a name.')

  const matches = [...uniqueTargets].map(([normalizedTarget, target]) => {
    const levenshtein = editDistance(normalizedGuess, normalizedTarget)
    const damerau = editDistance(normalizedGuess, normalizedTarget, { transpositions: true })
    // Standard CER uses Levenshtein edits / reference length, and can exceed 1.
    const cer = levenshtein / normalizedTarget.length
    // This separate, symmetric distance is bounded in [0, 1]; it is NOT CER.
    const normalizedDistance = damerau / Math.max(normalizedGuess.length, normalizedTarget.length)
    const eligible = Math.min(normalizedGuess.length, normalizedTarget.length) >= minLength
    const classification = damerau === 0 ? 'exact'
      : eligible && damerau <= maxEdits && normalizedDistance <= maxErrorRate
        ? 'possible_match' : 'no_match'
    return { target, classification, levenshtein, cer, damerau, normalizedDistance }
  })
  const rank = { exact: 0, possible_match: 1, no_match: 2 }
  matches.sort((a, b) => rank[a.classification] - rank[b.classification] ||
    a.normalizedDistance - b.normalizedDistance || a.damerau - b.damerau)
  return { guess, ...matches[0], thresholds: { maxErrorRate, maxEdits, minLength }, matches }
}

