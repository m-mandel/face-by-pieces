import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { getSubjectAliases, isCorrectAnswer, normalizeAnswer } from './answerMatching.js'
import subjectAliases from './config/subject-aliases.json' with { type: 'json' }

const directory = new URL('../data/line-art/', import.meta.url)
const lineArtIds = readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name.replaceAll('_', '-').toLowerCase())
const legacySource = readFileSync(new URL('./legacyPortraits.js', import.meta.url), 'utf8')
const legacyIds = [...legacySource.matchAll(/id: '([^']+)'/g)].map(match => match[1])
const catalogIds = [...new Set([...lineArtIds, ...legacyIds])]

const aliasesFor = id => getSubjectAliases({ id, name: id.replaceAll('-', ' ') })

test('every subject has a curated list with distinct, nonempty spelling variants', () => {
  assert.deepEqual(Object.keys(subjectAliases).sort(), catalogIds.toSorted())
  for (const [id, aliases] of Object.entries(subjectAliases)) {
    assert.ok(aliases.length >= 3, id)
    const normalized = aliases.map(alias => {
      assert.equal(typeof alias, 'string', id)
      assert.ok(alias.trim().length > 0, id)
      return normalizeAnswer(alias)
    })
    assert.equal(new Set(normalized).size, normalized.length, `${id}: duplicate variant`)
    assert.ok(normalized.some(alias => alias !== normalizeAnswer(id)), id)
  }
})

test('accepts curated typos for both full names and standalone surnames', () => {
  for (const [id, guesses] of [
    ['serena-williams', ['wiliams', 'Serena Wiliams', 'Serina Williams']],
    ['albert-einstein', ['Einstien', 'Albert Einstien']],
    ['arnold-schwarzenegger', ['Schwarzeneger', 'Arnold Schwarzeneger']],
    ['justin-bieber', ['Beiber', 'Justin Beiber']],
    ['michael-jordan', ['Micheal Jordan', 'Jordon']],
    ['michael-jackson', ['Micheal Jackson', 'Jakson']],
    ['scarlett-johansson', ['Scarlet Johansson', 'Johanson']],
    ['volodymyr-zelenskyy', ['Volodymyr Zelensky', 'Zelenskiy']],
    ['robert-downey-jr', ['Robert Downy Jr', 'Downey', 'RDJ']],
    ['martin-luther-king-jr', ['Martin Luter King Jr', 'Martin Luther King', 'MLK']],
    ['steven-spielberg', ['Speilberg', 'Stephen Spielberg']],
  ]) {
    for (const guess of guesses) {
      assert.ok(isCorrectAnswer(guess, aliasesFor(id)), `${id}: ${guess}`)
    }
  }
})

test('preserves established aliases and normalizes accents, case, spacing and punctuation', () => {
  const portrait = {
    id: 'beyonce', name: 'Beyoncé', aliases: ['Beyonce', 'Beyoncé Knowles'],
  }
  const original = structuredClone(portrait)
  const aliases = getSubjectAliases(portrait)
  assert.ok(isCorrectAnswer('  BEYONCÉ! ', aliases))
  assert.ok(isCorrectAnswer('Beyonce Knowles', aliases))
  assert.ok(isCorrectAnswer('Beyonse', aliases))
  assert.equal(aliases.filter(alias => normalizeAnswer(alias) === 'beyonce').length, 1)
  assert.ok(isCorrectAnswer('J.LO', aliasesFor('jennifer-lopez')))
  assert.deepEqual(portrait, original)
  const futurePortrait = { id: 'future-person', name: 'Future Person', aliases: ['Future'] }
  assert.deepEqual(getSubjectAliases(futurePortrait), ['Future Person', 'Future'])
})

test('rejects empty guesses, unrelated names, suffixes and partial matches', () => {
  for (const guess of ['', '   ', '!!!', 'Venus Williams', 'Naomi Osaka', 'William', 'Serena W']) {
    assert.equal(isCorrectAnswer(guess, aliasesFor('serena-williams')), false, guess)
  }
  for (const id of ['robert-downey-jr', 'martin-luther-king-jr']) {
    const aliases = getSubjectAliases({ id, name: id.replaceAll('-', ' '), aliases: ['Jr'] })
    assert.equal(isCorrectAnswer('Jr.', aliases), false)
  }
  // Shared surnames remain valid, but another subject's full name must not match.
  for (const id of catalogIds) {
    for (const other of catalogIds.filter(other => other !== id)) {
      assert.equal(isCorrectAnswer(other.replaceAll('-', ' '), aliasesFor(id)), false, `${other} matched ${id}`)
    }
  }
})
