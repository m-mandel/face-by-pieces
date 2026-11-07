import assert from 'node:assert/strict'
import test from 'node:test'
import { compareNames, editDistance } from './nameSimilarity.js'

test('counts insertions, deletions, substitutions and unrestricted transpositions', () => {
  for (const [guess, target, lev, damerau] of [
    ['', '', 0, 0],
    ['', 'abc', 3, 3],
    ['abc', '', 3, 3],
    ['jokoviz', 'djokovic', 2, 2],
    ['einstien', 'einstein', 2, 1],
    ['ca', 'abc', 3, 2], // Includes an insertion after swapping; OSA would return 3.
    ['kitten', 'sitting', 3, 3],
  ]) {
    assert.equal(editDistance(guess, target), lev)
    assert.equal(editDistance(guess, target, { transpositions: true }), damerau)
    assert.equal(editDistance(target, guess, { transpositions: true }), damerau)
  }
})

test('finds a possible surname match without treating omitted first names as errors', () => {
  const result = compareNames('Jokoviz', ['Novak Djokovic', 'Djokovic'])
  assert.equal(result.classification, 'possible_match')
  assert.equal(result.target, 'Djokovic')
  assert.equal(result.damerau, 2)
  assert.equal(result.cer, 0.25)
  assert.equal(result.normalizedDistance, 0.25)
  assert.equal(compareNames('Jokoviz', ['Novak Djokovic']).classification, 'no_match')
})

test('normalizes exactly like the game and keeps short names exact-only', () => {
  assert.equal(compareNames('  BEYONCÉ! ', ['Beyonce']).classification, 'exact')
  assert.equal(compareNames('J.LO', ['J Lo']).classification, 'exact')
  assert.equal(compareNames('Musk', ['Musk']).classification, 'exact')
  assert.equal(compareNames('Mask', ['Musk']).classification, 'possible_match')
  assert.equal(compareNames('Bolts', ['Bolt']).classification, 'possible_match')
  assert.equal(compareNames('Ail', ['Ali']).classification, 'no_match')
  assert.equal(compareNames('Jok', ['Djokovic']).classification, 'no_match')
  assert.equal(compareNames('!!!', ['Djokovic']).classification, 'no_match')
  assert.equal(compareNames('', ['Djokovic']).classification, 'no_match')
})

test('distinguishes CER from symmetric normalized distance and applies both cutoffs', () => {
  const swapped = compareNames('Einstien', ['Einstein'])
  assert.equal(swapped.cer, 0.25)
  assert.equal(swapped.normalizedDistance, 0.125)
  const inserted = compareNames('Lincolnn', ['Lincoln'])
  assert.equal(inserted.cer, 1 / 7)
  assert.equal(inserted.normalizedDistance, 1 / 8)
  assert.ok(compareNames('abcdefghijklmnop', ['abc']).cer > 1)
  assert.equal(compareNames('Jokoviz', ['Djokovic'], { maxErrorRate: 0.2 }).classification, 'no_match')
  assert.equal(compareNames('Jokoviz', ['Djokovic'], { maxEdits: 1 }).classification, 'no_match')
  assert.equal(compareNames('Joker', ['Djokovic']).classification, 'no_match')
  assert.equal(compareNames('Venus Williams', ['Serena Williams']).classification, 'no_match')
})

test('validates input and preserves the distinction between a guess and its target', () => {
  assert.throws(() => compareNames('guess', []), /at least one/)
  assert.throws(() => compareNames('guess', ['!!!']), /contain a name/)
  assert.throws(() => compareNames('x'.repeat(201), ['Target']), /200 characters/)
  assert.throws(() => compareNames('guess', ['Target'], { maxEdits: -1 }), /thresholds/)
  assert.equal(compareNames('Beyoncé', ['Beyonce', 'Beyoncé']).matches.length, 1)
  // Similar spelling alone cannot distinguish two real people's identities.
  assert.equal(compareNames('Billy Cyrus', ['Miley Cyrus']).classification, 'possible_match')
})
