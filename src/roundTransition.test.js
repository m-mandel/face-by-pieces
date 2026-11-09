import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

const names = ['First Person', 'Second Person', 'Third Person', 'Fourth Person', 'Fifth Person', 'Sixth Person']
// Keep the real game, gallery, artwork, effects, and telemetry; use six faces
// to exercise no-repeat selection and verify old saved categories are ignored.
const catalog = `
export const PORTRAITS = ${JSON.stringify(names)}.map((name, index) => ({
  id: String(index), name, aliases: [name], correctAliases: [name], photoSrc: '/photo-' + index + '.png',
  styles: { 'line-art': { layers: [
    { id: 'one', src: '/portrait-' + index + '-one.png' },
    { id: 'two', src: '/portrait-' + index + '-two.png' },
  ] } },
}));
export const getAvailablePortraitIndices = (_, category) => category === 'politics' ? [0] : [0, 1, 2, 3, 4, 5];
export const getClueIndices = () => [0, 1];
`
const textOf = (node) => typeof node === 'string' ? node : node.children.map(textOf).join('')

test('five-face sessions reveal only completed results and reset cleanly', async (t) => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [{
      name: 'round-test-fixtures',
      enforce: 'pre',
      load(id) {
        if (id.endsWith('/src/portraits.js')) return catalog
        if (id.endsWith('/src/portraitBounds.js'))
          return 'export const getPortraitBounds = async () => null'
      },
    }],
  })
  t.after(() => server.close())
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const scenarios = [
    { category: 'all', cached: true },
    { category: 'all', cached: false },
    { category: 'politics', cached: true },
    { category: 'politics', cached: false },
    { category: 'all', cached: true, inaccurate: true },
    { category: 'all', cached: false, inaccurate: true },
    { category: 'all', cached: true, photoGuess: 'correct' },
    { category: 'all', cached: false, photoGuess: 'inaccurate' },
    { category: 'all', cached: true, photoGuess: 'incorrect' },
    { category: 'all', cached: true, skipLast: true },
  ]

  for (const dismissal of ['button', 'escape']) {
    await t.test(`first visit shows instructions then starts playing directly (${dismissal})`, async (t) => {
      const deviceId = 'new-player'
      const seenKey = `face-by-pieces-instructions:${deviceId}`
      const values = new Map([['face-by-pieces-device-id', deviceId]])
      const requests = []
      const modalCalls = []
      t.mock.method(globalThis, 'fetch', async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) })
        return { ok: true }
      })
      const globals = {
        window: { innerHeight: 800, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} },
        document: { body: { classList: { toggle() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} },
        localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {},
        Image: class { decode() { return Promise.resolve() } },
      }
      const originals = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
      Object.assign(globalThis, globals)
      let renderer
      const mount = () => act(async () => {
        renderer = create(React.createElement(App), {
          createNodeMock: () => ({
            showModal() { modalCalls.push('open') },
            close() { modalCalls.push('close') },
            focus() {},
          }),
        })
      })
      try {
        await mount()
        assert.equal(textOf(renderer.root.findByType('h1')), 'How to play')
        assert.match(textOf(renderer.root.findByType('dialog')), /Guess each face in as few steps as possible/)
        assert.equal(renderer.root.findAllByType('input').length, 0, 'the game is not mounted behind the instructions')
        assert.equal(requests.length, 0, 'instructions do not start game telemetry')
        assert.deepEqual(modalCalls, ['open'])
        if (dismissal === 'button') {
          await act(async () => {
            renderer.root.findAllByType('button').find((button) => textOf(button).trim() === 'Start playing').props.onClick()
          })
        } else {
          let prevented = false
          await act(async () => {
            renderer.root.findByType('dialog').props.onCancel({ preventDefault() { prevented = true } })
          })
          assert.ok(prevented, 'Escape starts playing instead of leaving a dismissed dialog')
        }
        assert.equal(values.get(seenKey), '1')
        assert.equal(textOf(renderer.root.findByType('h1')), 'Guess Who?')
        assert.equal(renderer.root.findAllByType('dialog').length, 0)
        assert.equal(renderer.root.findAllByType('input').length, 1)
        assert.equal(values.has(`face-by-pieces-category:${deviceId}`), false, 'starting does not save a category')
        assert.deepEqual(modalCalls, ['open', 'close'])
        const sessions = requests.filter(({ url }) => url === '/api/sessions')
        assert.equal(sessions.length, 1)

        await act(async () => renderer.unmount())
        await mount()
        assert.equal(textOf(renderer.root.findByType('h1')), 'Guess Who?', 'reloading does not repeat instructions')
        assert.equal(renderer.root.findAllByType('dialog').length, 0)
        assert.deepEqual(modalCalls, ['open', 'close'])

        await act(async () => renderer.unmount())
        values.delete(seenKey)
        values.set(`face-by-pieces-category:${deviceId}`, 'politics')
        t.mock.method(Math, 'random', () => 0.99)
        await mount()
        assert.equal(textOf(renderer.root.findByType('h1')), 'Guess Who?', 'an existing category bypasses instructions even without the new seen flag')
        assert.equal(renderer.root.findAllByType('dialog').length, 0)
        assert.equal(requests.filter(({ url }) => url === '/api/sessions').at(-1).body.portraitId, '5', 'a legacy category does not filter the first face')
      } finally {
        await act(async () => renderer?.unmount())
        for (const [key, descriptor] of Object.entries(originals)) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor)
          else delete globalThis[key]
        }
      }
    })
  }

  for (const { category, cached, inaccurate, skipLast, photoGuess } of scenarios) {
    await t.test(`stored category ${category}, images ${cached ? 'cached' : 'pending'}${inaccurate ? ', inaccurate guess' : ''}${photoGuess ? `, ${photoGuess} photo guess` : ''}${skipLast ? ', photo recognition on the fifth face' : ''}`, async (t) => {
      const pending = []
      const values = new Map([
        ['face-by-pieces-device-id', 'test-device'],
        ['face-by-pieces-category:test-device', category],
      ])
      const requests = []
      t.mock.method(globalThis, 'fetch', async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) })
        return { ok: true }
      })
      const globals = {
        window: { innerHeight: 800, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} },
        document: { body: { classList: { toggle() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} },
        localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {},
        Image: class {
          decode() { return cached ? Promise.resolve() : new Promise((resolve) => pending.push(resolve)) }
        },
      }
      const originals = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
      Object.assign(globalThis, globals)
      let renderer
      const commits = []
      const scrollCalls = []
      const findButton = (label) => renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === label)
      const findButtonByText = (label) => renderer.root.findAllByType('button').find((button) => !button.props.disabled && textOf(button).trim() === label)
      const clueButton = () => renderer.root.findByProps({ className: 'next-clue-button' })
      const assertIdleControls = (canSkip = false) => {
        assert.equal(findButton('Submit guess'), undefined, 'submit is hidden until editing starts')
        assert.equal(Boolean(findButton("I don't know :(")), canSkip,
          'skip is available only after every clue has loaded and editing has ended')
      }
      const assertFreshRound = (number) => {
        assert.equal(textOf(renderer.root.findByProps({ className: 'guess-face-counter' })), `Face ${number} of 5`)
        assert.equal(renderer.root.findByType('input').props.value, '')
        assert.equal(renderer.root.findAllByType('button').some((button) => /categor/i.test(textOf(button))), false, 'category controls are absent')
        assertIdleControls()
        const artwork = renderer.root.findAll((node) => node.props.roundId != null && node.props.artwork)[0]
        assert.equal(artwork.props.visibleIndices.length, 1)
        assert.notEqual(clueButton().props['aria-label'], 'All portrait elements revealed')
      }
      const assertNoReveal = () => {
        assert.ok(commits.length > 0)
        for (const snapshot of commits) {
          assert.doesNotMatch(snapshot, /result-screen|replay-screen|wrong answer/)
          for (const name of names) assert.ok(!snapshot.includes(name), `early reveal: ${name}`)
          assert.match(snapshot, /Guess Who\?/)
        }
      }
      const completions = () => requests.filter(({ url }) => url.endsWith('/complete'))
      const resolveImages = () => act(async () => { pending.splice(0).forEach((resolve) => resolve()) })
      const visited = []
      const actions = [inaccurate ? 'inaccurate' : 'incorrect', 'correct', 'reveal-empty', 'reveal-typed', skipLast ? 'reveal-empty' : 'correct']
      try {
        await act(async () => {
          renderer = create(React.createElement(React.Profiler, {
            id: 'game', onRender: () => {
              if (renderer) commits.push(JSON.stringify(renderer.toJSON()))
            },
          }, React.createElement(App)), {
            createNodeMock: () => ({ clientWidth: 320, scrollTo(options) { scrollCalls.push(options) }, focus() {}, scrollIntoView() {}, querySelector() { return null }, contains() { return false } }),
          })
        })
        for (const [index, action] of actions.entries()) {
          assertFreshRound(index + 1)
          const round = renderer.root.findAll((node) => node.props.roundNumber != null && node.props.sessionId && node.props.portraitIndex != null)[0].props
          const name = names[round.portraitIndex]
          visited.push({ name, sessionId: round.sessionId })
          const revealsAnswer = action.startsWith('reveal-')
          const answer = action === 'correct' ? name : action === 'inaccurate' ? `${name}x` : action === 'reveal-empty' ? '' : 'wrong answer'
          const photoAnswer = index === 2 && photoGuess ? photoGuess === 'correct' ? name : photoGuess === 'inaccurate' ? `${name}x` : 'wrong answer' : ''
          const usesAllClues = index === 1 || revealsAnswer
          if (usesAllClues) {
            await resolveImages()
            const nextClue = findButton('Reveal the next portrait clue')
            assert.equal(nextClue.props.disabled, false)
            await act(async () => { nextClue.props.onClick() })
            if (!cached) {
              const artwork = renderer.root.findAll((node) => node.props.roundId != null && node.props.artwork)[0]
              assert.equal(artwork.props.visibleIndices.length, 2, 'the final clue is requested')
              assertIdleControls(false)
              assert.equal(clueButton().props['aria-label'], 'Loading drawing', 'the final clue must finish decoding before skipping is available')
              assert.equal(clueButton().props.disabled, true)
            }
            await resolveImages()
            assertIdleControls(true)
            assert.equal(clueButton().props.disabled, true, 'no more clues can be requested once skipping is available')
            assert.equal(clueButton().props['aria-label'], 'All portrait elements revealed')
          }
          if (action !== 'reveal-empty') {
            await act(async () => { renderer.root.findByType('input').parent.props.onFocus() })
            assert.ok(findButton('Submit guess'), 'focusing the input exposes submit')
            assert.equal(textOf(findButton('Submit guess')), 'Submit')
            assert.equal(findButton("I don't know :("), undefined)
            await act(async () => {
              renderer.root.findByType('input').props.onChange({ target: { value: answer } })
            })
            const submitTarget = {}
            await act(async () => {
              renderer.root.findByType('input').parent.props.onBlur({
                currentTarget: { contains: (target) => target === submitTarget },
                relatedTarget: submitTarget,
              })
            })
            assert.ok(findButton('Submit guess'), 'moving focus to submit keeps editing open')
            assert.equal(findButton("I don't know :("), undefined)
            let preventedPointerBlur = false
            findButton('Submit guess').props.onPointerDown({ preventDefault() { preventedPointerBlur = true } })
            assert.ok(preventedPointerBlur)
            await act(async () => {
              renderer.root.findByType('input').parent.props.onBlur({
                currentTarget: { contains: () => false }, relatedTarget: null,
              })
            })
            assertIdleControls(usesAllClues)
            assert.equal(renderer.root.findByType('input').props.value, answer)
            if (!revealsAnswer) {
              await act(async () => { renderer.root.findByType('input').parent.props.onFocus() })
              assert.equal(findButton("I don't know :("), undefined, 'editing hides skip even at the last clue')
            }
          }
          // Capture the submitted round's handler to simulate a rapid duplicate
          // event, even after its replacement has mounted.
          const finishHandler = revealsAnswer
            ? findButton("I don't know :(").props.onClick
            : renderer.root.findByType('form').props.onSubmit
          const finishOnce = () => finishHandler({ preventDefault() {} })
          commits.length = 0
          await act(async () => { finishOnce(); finishOnce() })
          await act(async () => { finishOnce() })
          if (revealsAnswer) {
            assert.equal(completions().length, index, 'skip waits for photo recognition before completing the face')
            assert.equal(textOf(renderer.root.findByType('h1')), 'Recognize this person?')
            assert.equal(renderer.root.findAllByType('input').length, 0)
            const photo = renderer.root.findByType('img')
            assert.equal(photo.props.src, `/photo-${round.portraitIndex}.png`)
            assert.equal(photo.props.alt, 'Photo of the person from this round')
            for (const name of names) assert.ok(!JSON.stringify(renderer.toJSON()).includes(name), 'photo screen does not reveal the name')
            assert.equal(findButtonByText('Yes, I recognize them'), undefined, 'wait for the photo to load before accepting recognition')
            await act(async () => { photo.props.onLoad() })
            const respond = findButtonByText(index === 2 ? 'Yes, I recognize them' : 'No, I don’t').props.onClick
            commits.length = 0
            await act(async () => { respond(); respond() })
            if (index === 2) {
              assert.equal(completions().length, index, 'Yes opens a second guess')
              assert.equal(textOf(renderer.root.findByType('h1')), 'Who is it?')
              if (photoGuess) {
                await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: photoAnswer } }))
                const submitPhoto = renderer.root.findByType('form').props.onSubmit
                commits.length = 0
                await act(async () => { submitPhoto({ preventDefault() {} }); submitPhoto({ preventDefault() {} }) })
              } else {
                const stillUnknown = findButtonByText('I still don’t know').props.onClick
                commits.length = 0
                await act(async () => { stillUnknown(); stillUnknown() })
              }
            }
            await act(async () => { respond(); finishOnce() })
          }
          await resolveImages()
          assert.equal(completions().length, index + 1, 'a round completes only once')
          assert.deepEqual(completions().at(-1), {
            url: `/api/sessions/${round.sessionId}/complete`,
            body: {
              outcome: ['correct', 'inaccurate'].includes(action) ? action : 'incorrect',
              submittedAnswer: revealsAnswer ? photoAnswer : answer,
              visibleElements: usesAllClues ? 2 : 1,
              ...(revealsAnswer && { photoRecognized: index === 2, photoOutcome: index === 2 && photoGuess ? photoGuess : 'incorrect' }),
            },
          })
          if (index < 4) {
            assertNoReveal()
            assertFreshRound(index + 2)
          }
        }
        assert.equal(new Set(visited.map(({ sessionId }) => sessionId)).size, 5)
        assert.equal(new Set(visited.map(({ name }) => name)).size, 5, 'all faces are available without repeats, regardless of the old saved category')
        const gallery = renderer.root.findAll((node) => node.props.rounds && node.props.onPlayAgain)[0]
        const savedRounds = gallery.props.rounds
        assert.equal(savedRounds.length, 5)
        assert.deepEqual(savedRounds.map(({ result }) => result), [inaccurate ? 'inaccurate' : 'incorrect', 'correct', 'incorrect', 'incorrect', skipLast ? 'incorrect' : 'correct'])
        assert.deepEqual(savedRounds.map(({ portrait }) => portrait.name), visited.map(({ name }) => name))
        assert.deepEqual(savedRounds.map(({ photoRecognized }) => photoRecognized), [null, null, true, false, skipLast ? false : null])
        assert.deepEqual(savedRounds.map(({ photoOutcome }) => photoOutcome), [null, null, photoGuess || 'incorrect', 'incorrect', skipLast ? 'incorrect' : null])
        const photoResult = renderer.root.findAllByType('article')[2]
        assert.equal(textOf(photoResult.findByType('h2')), 'Incorrect', 'the sketch is incorrect even when the photo guess is correct')
        assert.ok(textOf(photoResult.findByProps({ className: 'result-message' })).startsWith(`Photo answer: ${!photoGuess ? 'did not know' : photoGuess === 'correct' ? 'Correct' : 'Incorrect'}.`))
        const unknownPhotoResult = renderer.root.findAllByType('article')[3]
        assert.ok(textOf(unknownPhotoResult.findByProps({ className: 'result-message' })).startsWith('Photo answer: did not know.'))
        assert.equal(savedRounds[1].elementHistory.length, 2)
        assert.equal(savedRounds[1].refreshCount, 1)
        assert.match(JSON.stringify(renderer.toJSON()), /result-screen/)
        const scoreLabel = `${skipLast ? 1 : 2} out of 5 correct${inaccurate ? '; 1 inaccurate' : ''}`
        assert.equal(renderer.root.findAll((node) => node.props.role === 'img' && node.props['aria-label'] === scoreLabel).length, 1)
        const stars = renderer.root.findAll((node) => typeof node.type === 'string' && typeof node.props.className === 'string' && node.props.className.split(' ').includes('session-star'))
        assert.equal(stars.length, 5)
        assert.deepEqual(stars.map((node) => node.props.className.split(' ').includes('filled')), [false, true, false, false, !skipLast],
          'each star records the corresponding face outcome')
        assert.deepEqual(stars.map((node) => node.props.className.split(' ').includes('inaccurate')), [Boolean(inaccurate), false, false, false, false])
        if (inaccurate) {
          const firstResult = renderer.root.findAllByType('article')[0]
          assert.equal(textOf(firstResult.findByType('h2')), 'Inaccurate')
          assert.equal(textOf(firstResult.findByProps({ className: 'result-message' })),
            `Did you mean ${visited[0].name}?You guessed ${visited[0].name}x`)
        }
        assert.deepEqual(renderer.root.findAllByType('h3').map(textOf), visited.map(({ name }) => name))
        const activeRetrace = findButtonByText('Retrace your steps')
        assert.equal(activeRetrace.parent.props.className, 'result-details')
        assert.ok(renderer.root.findAllByType('article')[0].findAllByType('button').includes(activeRetrace),
          'retrace belongs to the active face card')
        assert.equal(renderer.root.findByType('footer').findAllByType('button').some((button) => textOf(button).trim() === 'Retrace your steps'), false,
          'the persistent footer contains no per-face replay action')

        const assertPosition = (number) => {
          assert.equal(textOf(renderer.root.findByProps({ className: 'result-position' })), `Face ${number} of 5`)
          assert.equal(String(findButton(`Show face ${number}`).props['aria-current']), 'true')
        }
        const carousel = () => renderer.root.findByProps({ className: 'results-carousel' })
        assertPosition(1)
        await act(async () => { findButton('Next face').props.onClick() })
        assertPosition(2)
        assert.deepEqual(scrollCalls.at(-1), { left: 320, behavior: 'smooth' })
        await act(async () => {
          carousel().props.onScroll({ currentTarget: { scrollLeft: 100, clientWidth: 320 } })
        })
        assertPosition(2)
        await act(async () => {
          carousel().props.onScroll({ currentTarget: { scrollLeft: 320, clientWidth: 320 } })
        })
        assertPosition(2)
        window.matchMedia = (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' })
        await act(async () => { findButton('Previous face').props.onClick() })
        assertPosition(1)
        assert.deepEqual(scrollCalls.at(-1), { left: 0, behavior: 'instant' })
        window.matchMedia = () => ({ matches: false })
        await act(async () => { findButton('Show face 2').props.onClick() })
        assertPosition(2)
        await act(async () => { findButtonByText('Retrace your steps').props.onClick() })
        const replayArtwork = () => renderer.root.findAll((node) => node.props.className === 'portrait-artwork replay-portrait' && node.props.artwork)[0]
        assert.equal(replayArtwork().props.artwork, savedRounds[1].artwork)
        assert.deepEqual(replayArtwork().props.visibleIndices, savedRounds[1].elementHistory[0])
        await act(async () => { findButton('Next step').props.onClick() })
        assert.deepEqual(replayArtwork().props.visibleIndices, savedRounds[1].elementHistory[1])
        await act(async () => { findButton('Back to the reveal').props.onClick() })
        assertPosition(2)
        await act(async () => { findButton('Show face 5').props.onClick() })
        assertPosition(5)
        await act(async () => {
          carousel().props.onPointerDown()
          carousel().props.onScroll({ currentTarget: { scrollLeft: 960, clientWidth: 320 } })
        })
        assertPosition(4)
        await act(async () => { findButtonByText('Retrace your steps').props.onClick() })
        assert.equal(replayArtwork().props.artwork, savedRounds[3].artwork)
        assert.deepEqual(replayArtwork().props.visibleIndices, savedRounds[3].elementHistory[0])
        await act(async () => { findButton('Back to the reveal').props.onClick() })
        assertPosition(4)

        commits.length = 0
        await act(async () => { findButtonByText('Play again').props.onClick() })
        await resolveImages()
        assertNoReveal()
        assertFreshRound(1)
        assert.equal(completions().length, 5)
      } finally {
        await act(async () => renderer?.unmount())
        for (const [key, descriptor] of Object.entries(originals)) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor)
          else delete globalThis[key]
        }
      }
    })
  }
})
