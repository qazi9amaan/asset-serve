import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBlocks, sectionFeedback } from '../src/components/blocks.ts'

test('section feedback names the heading and its anchor, then the comment', () => {
  const heading = parseBlocks('## Rollout `plan` & risks').headings[0]
  assert.deepEqual(heading, { depth: 2, text: 'Rollout plan & risks', slug: 'rollout-plan--risks' })
  assert.equal(
    sectionFeedback(heading, '  Split step 2.\n'),
    'Re: Rollout plan & risks (#rollout-plan--risks)\n\nSplit step 2.',
  )
})
