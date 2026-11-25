import { expect, test } from 'claude-code/testing'

import { withGuidance } from '../hooks/model'

const INTRO = [{ id: 'intro', text: 'intro', scope: 'shared' }] as const

test('an opted-in repository gets the findings guidance last', () => {
  const sections = withGuidance(INTRO, true)

  expect(sections.map(section => section.id)).toEqual(['intro', 'awl:findings'])
  expect(sections.at(-1)?.scope).toBe('session')
})

test('a repository without awl.json gets no guidance', () => {
  expect(withGuidance(INTRO, false)).toEqual(INTRO)
})
