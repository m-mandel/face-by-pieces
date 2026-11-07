import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

test('photo recognition handles missing photos, errors, loading and duplicate answers', async (t) => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, cacheDir: 'node_modules/.vite-photo-tests' })
  t.after(() => server.close())
  const { default: PhotoRecognition } = await server.ssrLoadModule('/src/PhotoRecognition.jsx')
  for (const scenario of ['missing', 'failed', 'retry', 'slow', 'yes', 'no', 'forgot-name']) {
    await t.test(scenario, async () => {
      const answers = []
      const guesses = []
      let renderer
      const button = (label) => renderer.root.findAllByType('button').find(node => node.children.join('') === label)
      try {
        await act(async () => {
          renderer = create(React.createElement(PhotoRecognition, {
            photoSrc: scenario === 'missing' ? undefined : '/source.png', roundNumber: 5,
            onAnswer: (answer, guess) => { answers.push(answer); guesses.push(guess) },
          }), { createNodeMock: () => ({ focus() {} }) })
        })
        if (scenario === 'missing') {
          assert.equal(renderer.root.findAllByType('img').length, 0)
          assert.equal(renderer.root.findByType('h1').children.join(''), 'Photo unavailable')
          await act(async () => button('See results').props.onClick())
        } else if (scenario === 'failed' || scenario === 'retry') {
          await act(async () => renderer.root.findByType('img').props.onError())
          assert.ok(button('See results'))
          if (scenario === 'failed') {
            await act(async () => button('See results').props.onClick())
          } else {
            await act(async () => button('Try loading again').props.onClick())
            await act(async () => renderer.root.findByType('img').props.onLoad())
            await act(async () => button('Yes, I recognize them').props.onClick())
          }
        } else if (scenario === 'slow') {
          assert.equal(button('Yes, I recognize them').props.disabled, true)
          await act(async () => button('Yes, I recognize them').props.onClick())
          assert.deepEqual(answers, [], 'a photo that has not loaded cannot be recognized')
          await act(async () => button('Continue without photo').props.onClick())
        } else {
          await act(async () => renderer.root.findByType('img').props.onLoad())
          const respond = button(scenario === 'no' ? 'No, I don’t' : 'Yes, I recognize them').props.onClick
          await act(async () => { respond(); respond() })
        }
        if (['yes', 'retry', 'forgot-name'].includes(scenario)) {
          assert.deepEqual(answers, [], 'recognizing the photo opens another guess without completing the round')
          assert.equal(renderer.root.findByType('h1').children.join(''), 'Who is it?')
          assert.equal(renderer.root.findByType('img').props.src, '/source.png', 'keep the photo while guessing')
          if (scenario === 'forgot-name') {
            await act(async () => button('I still don’t know').props.onClick())
          } else {
            await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
            assert.deepEqual(answers, [], 'empty guesses do not end the round')
            await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: '  Jokoviz  ' } }))
            const submit = renderer.root.findByType('form').props.onSubmit
            await act(async () => { submit({ preventDefault() {} }); submit({ preventDefault() {} }) })
          }
        }
        assert.deepEqual(answers, [['yes', 'retry', 'forgot-name'].includes(scenario) ? true : scenario === 'no' ? false : null])
        assert.deepEqual(guesses, [['yes', 'retry'].includes(scenario) ? 'Jokoviz' : null])
      } finally {
        await act(async () => renderer?.unmount())
      }
    })
  }
})
