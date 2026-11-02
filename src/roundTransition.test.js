import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

// Keep the real round/result UI and effects, with a small deterministic catalog.
const catalog = `
export const PORTRAITS = ['First Person', 'Second Person'].map((name, index) => ({
  id: String(index), name, aliases: [name],
  styles: { 'line-art': { layers: [{ id: 'one', src: '/one.png' }, { id: 'two', src: '/two.png' }] } },
}));
export const getAvailablePortraitIndices = (_, category) => category === 'politics' ? [0] : [0, 1];
export const getClueIndices = () => [0, 1];
`

test('new rounds never commit a result or inherited clues', async (t) => {
  const server = await createServer({
    server: { middlewareMode: true },
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

  for (const category of ['all', 'politics']) {
    for (const cached of [true, false]) {
      await t.test(`${category}, images ${cached ? 'cached' : 'pending'}`, async () => {
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
          document: { body: { classList: { toggle() {}, remove() {} } } },
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
        const findButton = (label) => renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === label)
        const assertIdleControls = () => {
          assert.equal(findButton('Submit guess'), undefined, 'submit is hidden until editing starts')
          assert.ok(findButton("I don't know :("), 'reveal is available outside editing')
        }
        try {
          await act(async () => {
            renderer = create(React.createElement(React.Profiler, {
              id: 'game', onRender: () => {
                if (renderer) commits.push(JSON.stringify(renderer.toJSON()))
              },
            }, React.createElement(App)))
          })
          for (const action of ['incorrect', 'correct', 'reveal-empty', 'reveal-typed']) {
            const round = renderer.root.findAll((node) => node.props.portraitIndex != null && node.props.sessionId)[0]
            const name = ['First Person', 'Second Person'][round.props.portraitIndex]
            const revealsAnswer = action.startsWith('reveal-')
            const answer = action === 'correct' ? name : action === 'reveal-empty' ? '' : 'wrong answer'
            assertIdleControls()
            if (action !== 'reveal-empty') {
              await act(async () => {
                renderer.root.findByType('input').parent.props.onFocus()
              })
              assert.ok(findButton('Submit guess'), 'focusing the input exposes submit')
              assert.equal(findButton("I don't know :("), undefined, 'reveal is hidden during editing')
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
              assert.ok(preventedPointerBlur, 'pressing submit preserves focus until submission')
              if (revealsAnswer) {
                await act(async () => {
                  renderer.root.findByType('input').parent.props.onBlur({
                    currentTarget: { contains: () => false },
                    relatedTarget: null,
                  })
                })
                assertIdleControls()
                assert.equal(renderer.root.findByType('input').props.value, answer, 'leaving editing preserves the typed answer')
              }
            }
            if (revealsAnswer) {
              const revealButton = findButton("I don't know :(")
              assert.ok(revealButton, 'the reveal action is available without a guess')
              assert.equal(revealButton.props.type, 'button')
              await act(async () => { revealButton.props.onClick() })
            } else {
              await act(async () => {
                renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
              })
            }
            const result = JSON.stringify(renderer.toJSON())
            assert.match(result, /result-screen/)
            assert.deepEqual(renderer.root.findByType('h2').children, [name])
            assert.ok(renderer.root.findAll((node) => node.props.fitToInk && node.props.visibleIndices === null && node.props.label === `Portrait of ${name}`).length > 0,
              'the result requests the complete portrait')
            if (revealsAnswer) {
              assert.deepEqual(renderer.root.findByType('h1').children, ['Now you know'])
              assert.doesNotMatch(result, /You guessed|wrong answer|Type a name before you guess/)
            } else {
              assert.deepEqual(renderer.root.findByType('h1').children, [action === 'correct' ? 'Correct' : 'Incorrect'])
            }
            const completion = requests.filter(({ url }) => url.endsWith('/complete')).at(-1)
            assert.equal(completion.url, `/api/sessions/${round.props.sessionId}/complete`)
            assert.deepEqual(completion.body, {
              outcome: action === 'correct' ? 'correct' : 'incorrect',
              submittedAnswer: revealsAnswer ? '' : answer,
              visibleElements: 1,
            })
            commits.length = 0
            await act(async () => {
              renderer.root.findAllByType('button').find((button) => button.props.className === 'primary-button').props.onClick()
            })
            // Resolve old image requests after the next round has mounted.
            await act(async () => { pending.splice(0).forEach((resolve) => resolve()) })
            assert.ok(commits.length > 0)
            for (const snapshot of commits) {
              assert.doesNotMatch(snapshot, /result-screen|First Person|Second Person|wrong answer/)
              assert.match(snapshot, /Guess Who\?/)
            }
            assert.equal(renderer.root.findByType('input').props.value, '')
            assertIdleControls()
            const artwork = renderer.root.findAll((node) => node.props.roundId != null && node.props.artwork)[0]
            assert.equal(artwork.props.visibleIndices.length, 1)
          }
        } finally {
          await act(async () => renderer?.unmount())
          for (const [key, descriptor] of Object.entries(originals)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor)
            else delete globalThis[key]
          }
        }
      })
    }
  }
})
