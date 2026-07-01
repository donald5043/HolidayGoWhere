import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data')

const FRONTEND_DATA_FILES = [
  'ai-insights.json',
  'places-central.json',
  'places-east.json',
  'places-featured.json',
  'places-islands.json',
  'places-north.json',
  'places-south.json',
  'restaurants-featured.json',
  'restaurants-osm.json',
]

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function readMaybe(file) {
  try {
    return await fs.readFile(file)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function compareFile(filename) {
  const source = path.join(GENERATED_DIR, filename)
  const target = path.join(PUBLIC_DATA_DIR, filename)
  const sourceBuffer = await readMaybe(source)
  const targetBuffer = await readMaybe(target)

  if (!sourceBuffer) return { filename, status: 'missing-source' }
  if (!targetBuffer) return { filename, status: 'missing-public' }
  if (sha256(sourceBuffer) !== sha256(targetBuffer)) return { filename, status: 'stale-public' }
  return { filename, status: 'ok' }
}

async function checkPublicData() {
  const results = await Promise.all(FRONTEND_DATA_FILES.map(compareFile))
  const failures = results.filter((result) => result.status !== 'ok')

  if (failures.length) {
    console.error('public/data is not in sync with src/generated:')
    for (const failure of failures) {
      console.error(`- ${failure.filename}: ${failure.status}`)
    }
    console.error('Run: npm run data:publish')
    process.exitCode = 1
    return
  }

  console.log(`public/data check passed (${FRONTEND_DATA_FILES.length} files).`)
}

async function syncPublicData() {
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true })

  let copied = 0
  let bytes = 0
  for (const filename of FRONTEND_DATA_FILES) {
    const source = path.join(GENERATED_DIR, filename)
    const target = path.join(PUBLIC_DATA_DIR, filename)
    const sourceBuffer = await fs.readFile(source)
    const targetBuffer = await readMaybe(target)

    if (!targetBuffer || sha256(sourceBuffer) !== sha256(targetBuffer)) {
      await fs.writeFile(target, sourceBuffer)
      copied += 1
      bytes += sourceBuffer.byteLength
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(2)
  console.log(copied ? `Synced ${copied} public data files (${mb} MB).` : 'public/data already up to date.')
}

if (process.argv.includes('--check')) {
  await checkPublicData()
} else {
  await syncPublicData()
}
