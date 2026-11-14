import test from 'node:test'
import assert from 'node:assert/strict'
import { locateSnippet } from '../scripts/agent/ollama-builder.mjs'

const source = [
  'export function activationSteps() {',
  '  return ["account", "profile"];',
  '}',
  '',
  'export function other() {',
  '  return 1;',
  '}',
].join('\n')

test('an exact snippet is found exactly', () => {
  const found = locateSnippet(source, '  return 1;')
  assert.equal(found.mode, 'exact')
  assert.ok(source.slice(found.index, found.index + '  return 1;'.length).includes('return 1;'))
})

test('a snippet with different whitespace is still found', () => {
  const found = locateSnippet(source, 'export function other() {\n    return 1;\n  }')
  assert.ok(found)
  assert.equal(found.mode, 'normalized')
})

test('a single line with different indentation is found', () => {
  const found = locateSnippet(source, '     return 1;')
  assert.ok(found)
  assert.ok(['normalized', 'line'].includes(found.mode), `unexpected mode ${found.mode}`)
})

test('a snippet that is not in the file is not found', () => {
  assert.equal(locateSnippet(source, 'const missing = 1;'), null)
})
