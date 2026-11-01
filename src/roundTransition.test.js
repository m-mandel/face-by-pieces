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
        t.mock.method(globalThis, 'fetch', async () => ({ ok: true }))
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
        try {
          await act(async () => {
            renderer = create(React.createElement(React.Profiler, {
              id: 'game', onRender: () => {
                if (renderer) commits.push(JSON.stringify(renderer.toJSON()))
              },
            }, React.createElement(App)))
          })
          for (let round = 0; round < 3; round++) {
            await act(async () => {
              renderer.root.findByType('input').props.onChange({ target: { value: 'wrong answer' } })
            })
            await act(async () => {
              renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
            })
            assert.match(JSON.stringify(renderer.toJSON()), /result-screen/)
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
