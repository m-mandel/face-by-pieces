import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

test('photo recognition handles missing photos, errors, loading and duplicate answers', async (t) => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, cacheDir: 'node_modules/.vite-photo-tests' })
  t.after(() => server.close())
  const { default: PhotoRecognition } = await server.ssrLoadModule('/src/PhotoRecognition.jsx')
  for (const scenario of ['missing', 'failed', 'retry', 'slow', 'guess', 'skip', 'type-and-skip']) {
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
          }
        } else if (scenario === 'slow') {
          assert.equal(renderer.root.findByType('input').props.disabled, true)
          assert.equal(button("I don't know :(").props.disabled, true)
          await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'Jokoviz' } }))
          await act(async () => {
            renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
            button("I don't know :(").props.onClick()
          })
          assert.deepEqual(answers, [], 'a photo that has not loaded cannot be answered or marked unknown')
          await act(async () => button('Continue without photo').props.onClick())
          await act(async () => renderer.root.findByType('img').props.onLoad())
          await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
          assert.deepEqual(answers, [null], 'a late load cannot submit an already skipped round')
        } else {
          assert.equal(renderer.root.findByType('input').props.autoFocus, undefined, 'let the player see the photo before opening the keyboard')
          await act(async () => renderer.root.findByType('img').props.onLoad())
        }
        if (['guess', 'retry', 'skip', 'type-and-skip'].includes(scenario)) {
          assert.deepEqual(answers, [], 'the photo opens directly with a name input and skip button')
          assert.equal(renderer.root.findByType('h1').children.join(''), 'Who is it?')
          assert.equal(renderer.root.findByType('img').props.src, '/source.png', 'keep the photo while guessing')
          assert.equal(renderer.root.findByType('input').props.disabled, false)
          assert.ok(button("I don't know :("))
          assert.equal(button('Submit'), undefined)
          assert.equal(button('Yes, I recognize them'), undefined)
          if (scenario !== 'skip') {
            await act(async () => renderer.root.findByType('input').parent.props.onFocus())
            assert.ok(button('Submit'))
            assert.equal(button("I don't know :("), undefined)
            await act(async () => renderer.root.findByType('input').parent.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} }))
            assert.ok(button('Submit'), 'moving focus to Submit keeps editing open')
            let prevented = false
            button('Submit').props.onPointerDown({ preventDefault() { prevented = true } })
            assert.equal(prevented, true, 'clicking Submit keeps the input focused')
          }
          if (scenario === 'skip' || scenario === 'type-and-skip') {
            if (scenario === 'type-and-skip') {
              await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'unfinished name' } }))
              await act(async () => renderer.root.findByType('input').parent.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }))
              assert.equal(button('Submit'), undefined)
            }
            const skip = button("I don't know :(").props.onClick
            await act(async () => { skip(); skip() })
          } else {
            await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
            assert.deepEqual(answers, [], 'empty guesses do not end the round')
            await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'x'.repeat(201) } }))
            await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
            assert.deepEqual(answers, [], 'overlong guesses do not end the round')
            await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: '  Jokoviz  ' } }))
            const submit = renderer.root.findByType('form').props.onSubmit
            await act(async () => { submit({ preventDefault() {} }); submit({ preventDefault() {} }) })
          }
        }
        assert.deepEqual(answers, [['guess', 'retry'].includes(scenario) ? true : ['skip', 'type-and-skip'].includes(scenario) ? false : null])
        assert.deepEqual(guesses, [['guess', 'retry'].includes(scenario) ? 'Jokoviz' : null])
      } finally {
        await act(async () => renderer?.unmount())
      }
    })
  }
})
