import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { createServer } from 'vite'
import { getAnswerOutcome, getCorrectAliases, getSubjectAliases, isCorrectAnswer, normalizeAnswer } from './answerMatching.js'
import subjectAliases from './config/subject-aliases.json' with { type: 'json' }
import correctAliases from './config/subject-correct-aliases.json' with { type: 'json' }

const directory = new URL('../data/line-art/', import.meta.url)
const lineArtIds = readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name.replaceAll('_', '-').toLowerCase())
const legacySource = readFileSync(new URL('./legacyPortraits.js', import.meta.url), 'utf8')
const legacyIds = [...legacySource.matchAll(/id: '([^']+)'/g)].map(match => match[1])
const catalogIds = [...new Set([...lineArtIds, ...legacyIds])]

const aliasesFor = id => getSubjectAliases({ id, name: id.replaceAll('-', ' ') })

const makePortrait = (id, name, aliases) => {
  const portrait = { id, name, aliases }
  return { ...portrait, correctAliases: getCorrectAliases(portrait), aliases: getSubjectAliases(portrait) }
}

test('first names and their typos are inaccurate, including older accepted aliases', () => {
  for (const [id, name, first] of [
    ['hillary-clinton', 'Hillary Clinton', 'Hillary'],
    ['elon-musk', 'Elon Musk', 'Elon'],
    ['kobe-bryant', 'Kobe Bryant', 'Kobe'],
    ['oprah-winfrey', 'Oprah Winfrey', 'Oprah'],
    ['tom-hanks', 'Tom Hanks', 'Tom'],
    ['pope-francis', 'Pope Francis', 'Francis'],
    ['queen-elizabeth-ii', 'Queen Elizabeth II', 'Elizabeth'],
    ['mother-teresa', 'Mother Teresa', 'Teresa'],
  ]) {
    const portrait = makePortrait(id, name, [name, first])
    assert.equal(getAnswerOutcome(first, portrait), 'inaccurate', name)
    assert.equal(isCorrectAnswer(first, portrait.correctAliases), false, name)
    assert.equal(getAnswerOutcome(name, portrait), 'correct', name)
    assert.equal(getAnswerOutcome(first, { ...portrait, correctAliases: [name, first] }), 'inaccurate', 'old caller-supplied aliases cannot bypass the rule')
  }
  const hillary = makePortrait('hillary-clinton', 'Hillary Clinton', ['Hillary', 'Clinton'])
  for (const guess of ['HILLARY!', 'Hilary', 'Hillari', 'Hillary Cliton']) {
    assert.equal(getAnswerOutcome(guess, hillary), 'inaccurate', guess)
  }
  assert.equal(getAnswerOutcome('Clinton', hillary), 'correct')
  assert.equal(getAnswerOutcome('Clinton Hillary', hillary), 'correct')
  assert.equal(getAnswerOutcome('Hillary Obama', hillary), 'incorrect')
  const charlie = makePortrait('charlie-chaplin', 'Charlie Chaplin', [])
  assert.equal(getAnswerOutcome('Charles', charlie), 'inaccurate', 'a given name from a trusted full-name variant is also incomplete')
})

test('complete nicknames, titles and one-word names remain correct', () => {
  for (const [id, name, aliases] of [
    ['pope-francis', 'Pope Francis', ['The Pope', 'Pope']],
    ['dwayne-johnson', 'Dwayne Johnson', ['The Rock', 'Rock']],
    ['arnold-schwarzenegger', 'Arnold Schwarzenegger', ['Arnie']],
    ['shaquille-o-neal', "Shaquille O'Neal", ['Shaq', "O'Neal"]],
    ['queen-elizabeth-ii', 'Queen Elizabeth II', ['Queen Elizabeth', 'Elizabeth II', 'The Queen']],
    ['adele', 'Adele', ['Adele']],
    ['madonna', 'Madonna', ['Madonna']],
    ['beyonce', 'Beyoncé', ['Beyonce']],
  ]) {
    const portrait = makePortrait(id, name, aliases)
    for (const guess of aliases) assert.equal(getAnswerOutcome(guess, portrait), 'correct', `${name}: ${guess}`)
  }
})

test('the actual catalog consistently separates first names from correct aliases', async (t) => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } })
  t.after(() => server.close())
  const { PORTRAITS } = await server.ssrLoadModule('/src/portraits.js')
  for (const portrait of PORTRAITS) {
    assert.equal(getAnswerOutcome(portrait.name, portrait, PORTRAITS), 'correct', portrait.id)
    if (portrait.name.trim().includes(' ')) {
      const first = portrait.name.replace(/^(?:Pope|Queen|Mother) /, '').split(/[\s,]+/)[0]
      assert.equal(getAnswerOutcome(first, portrait, PORTRAITS), 'inaccurate', `${portrait.id}: ${first}`)
      assert.equal(isCorrectAnswer(first, portrait.correctAliases), false, `${portrait.id}: first name must not be in the correct list`)
    }
    for (const alias of correctAliases[portrait.id] || []) {
      assert.equal(getAnswerOutcome(alias, portrait, PORTRAITS), 'correct', `${portrait.id}: configured correct alias ${alias}`)
    }
  }
})

test('classifies known typos and close spellings as inaccurate', () => {
  const portrait = makePortrait('novak-djokovic', 'Novak Djokovic', ['Djokovic'])
  assert.equal(getAnswerOutcome('Jokoviz', portrait), 'inaccurate')
  assert.equal(getAnswerOutcome('  JOKOVIZ! ', portrait), 'inaccurate')
  for (const alias of portrait.aliases) {
    const expected = isCorrectAnswer(alias, portrait.correctAliases) ? 'correct' : 'inaccurate'
    assert.equal(getAnswerOutcome(alias, portrait), expected, alias)
  }
  for (const guess of ['', '!!!', 'Jok', 'Joker', 'Roger Federer', 'x'.repeat(201)]) {
    assert.equal(getAnswerOutcome(guess, portrait), 'incorrect', guess)
  }
  const einstein = makePortrait('albert-einstein', 'Albert Einstein', ['Einstein'])
  assert.equal(getAnswerOutcome('Einstien', einstein), 'inaccurate', 'a known typo is not correctly spelled')
})

test('only compares to trusted names and rejects ambiguous names within the catalog', () => {
  const portrait = makePortrait('new-example', 'Example', ['Example'])
  portrait.aliases.push('Exampzz')
  assert.equal(getAnswerOutcome('Examzzz', portrait), 'incorrect', 'do not fuzzy match a typo alias')
  const miley = makePortrait('miley-cyrus', 'Miley Cyrus', ['Cyrus'])
  const billy = makePortrait('billy-cyrus', 'Billy Cyrus', ['Cyrus'])
  assert.equal(getAnswerOutcome('Billy Cyrus', miley, [miley, billy]), 'incorrect')
  assert.equal(getAnswerOutcome('Cyruz', miley, [miley, billy]), 'incorrect', 'shared surname typo is ambiguous')
  assert.equal(getAnswerOutcome('Cyrus', miley, [miley, billy]), 'correct', 'an accepted surname is still correct')
  const downey = makePortrait('robert-downey-jr', 'Robert Downey Jr', ['Jr'])
  assert.ok(downey.correctAliases.includes('Downey'))
  assert.ok(downey.correctAliases.includes('Robert Downey Junior'))
  assert.equal(getAnswerOutcome('Jr', downey), 'incorrect')
})

test('correctly spelled nicknames and surnames are correct, their misspellings are inaccurate', () => {
  for (const [id, name, good, inaccurate] of [
    ['dwayne-johnson', 'Dwayne Johnson', ['The Rock', 'Johnson'], ['The Rok', 'Dwayne Jonson']],
    ['usain-bolt', 'Usain Bolt', ['Bolt'], ['Bolts', 'Boltt']],
    ['albert-einstein', 'Albert Einstein', ['Einstein'], ['Einstien']],
    ['martin-luther-king-jr', 'Martin Luther King Jr', ['MLK', 'MLK Junior', 'Martin Luther King Junior'], ['Martin Luter King Junior']],
    ['cristiano-ronaldo', 'Cristiano Ronaldo', ['Cristiano Ronaldo', 'Ronaldo'], ['Christiano Ronaldo']],
    ['jennifer-lopez', 'Jennifer Lopez', ['J.Lo', 'Lopez'], ['Jenifer Lopez']],
  ]) {
    const portrait = makePortrait(id, name, [])
    for (const guess of good) assert.equal(getAnswerOutcome(guess, portrait), 'correct', guess)
    for (const guess of inaccurate) assert.equal(getAnswerOutcome(guess, portrait), 'inaccurate', guess)
  }
})

test('accepts reordered name words without promoting misspellings to correct', () => {
  for (const [id, name, guesses] of [
    ['brad-pitt', 'Brad Pitt', ['pitt brad', ' PITT,  Brad! ', 'Pitt-Brad']],
    ['celine-dion', 'Céline Dion', ['Dion Céline']],
    ['martin-luther-king-jr', 'Martin Luther King Jr', ['King Martin Luther Jr.', 'Junior King Luther Martin']],
    ['dwayne-johnson', 'Dwayne Johnson', ['Johnson Dwayne', 'Rock The']],
  ]) {
    const portrait = makePortrait(id, name, [])
    for (const guess of guesses) assert.equal(getAnswerOutcome(guess, portrait), 'correct', guess)
  }
  const brad = makePortrait('brad-pitt', 'Brad Pitt', [])
  assert.equal(getAnswerOutcome('Pit Brad', brad), 'inaccurate')
  for (const guess of ['Pitt Brad Brad', 'Pitt Tom', 'Pitt', '']) {
    assert.equal(isCorrectAnswer(guess, ['Brad Pitt']), false, guess)
  }
})

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
