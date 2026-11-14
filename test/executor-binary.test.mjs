import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { restoreFromSnapshot, snapshotWorkspace } from '../src/executor/workspace.js'

// Настоящий PNG: сигнатура плюс байты, которые нельзя закодировать в UTF-8 без потерь.
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0xff, 0xfe, 0x00, 0x80, 0x81, 0xc3,
])

async function workspace(t) {
  const root = await mkdtemp(path.join(process.cwd(), '.until', 'binary-'))
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  return root
}

test('a snapshot hashes a binary file by its real bytes', async (t) => {
  const root = await workspace(t)
  await writeFile(path.join(root, 'logo.png'), PNG)
  const snapshot = await snapshotWorkspace(root, { captureContent: true })
  const entry = snapshot.files.find((file) => file.path === 'logo.png')
  assert.equal(entry.sha256, createHash('sha256').update(PNG).digest('hex'))
})

test('a restore returns a binary file byte for byte', async (t) => {
  const root = await workspace(t)
  await writeFile(path.join(root, 'logo.png'), PNG)
  await writeFile(path.join(root, 'app.js'), 'export const a = 1\n')
  const snapshot = await snapshotWorkspace(root, { captureContent: true })

  await writeFile(path.join(root, 'logo.png'), Buffer.from('corrupted'))
  await writeFile(path.join(root, 'extra.txt'), 'extra')
  await restoreFromSnapshot(root, snapshot)

  const restored = await readFile(path.join(root, 'logo.png'))
  assert.equal(Buffer.compare(restored, PNG), 0, 'a binary file must be restored byte for byte')
  assert.equal(await readFile(path.join(root, 'extra.txt'), 'utf8').catch(() => null), null)
})

test('a text file is still restored as text', async (t) => {
  const root = await workspace(t)
  await writeFile(path.join(root, 'app.js'), 'export const a = 1\n')
  const snapshot = await snapshotWorkspace(root, { captureContent: true })
  await writeFile(path.join(root, 'app.js'), 'export const a = 2\n')
  await restoreFromSnapshot(root, snapshot)
  assert.equal(await readFile(path.join(root, 'app.js'), 'utf8'), 'export const a = 1\n')
})
