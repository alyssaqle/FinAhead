#!/usr/bin/env node
/**
 * Downloads the MoneyData dataset into benchmark/moneydata/.data/.
 *
 * The dataset is CC BY 4.0, which permits redistribution with attribution, but
 * it is deliberately NOT committed: it is 507 KB of someone's real (anonymised)
 * bank account, and a benchmark should fetch it rather than vendor it. The
 * checksum below is verified on every download.
 */

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(HERE, '.data')
const FILE = resolve(DIR, 'laramee26openBankTransactionData.xlsx')
const URL_ =
  'https://data.mendeley.com/public-files/datasets/dnxtg6n4rv/files/36b3d359-2491-4282-850f-3f03e00fbfe3/file_downloaded'
const SHA256 = '716eaf9ad4a3cf60dc9c9c8a20ed9a917c545a1b5f139f40ed91d2104faa3ff7'

await mkdir(DIR, { recursive: true })
console.log('Downloading MoneyData (CC BY 4.0, doi:10.17632/dnxtg6n4rv.1) ...')

const response = await fetch(URL_, { redirect: 'follow' })
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status}`)
  console.error('Fetch it manually from https://data.mendeley.com/datasets/dnxtg6n4rv/1')
  console.error(`and place the .xlsx at ${FILE}`)
  process.exit(1)
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(FILE))

const digest = createHash('sha256').update(await readFile(FILE)).digest('hex')
if (digest !== SHA256) {
  await rm(FILE, { force: true })
  console.error(`Checksum mismatch.\n  expected ${SHA256}\n  got      ${digest}`)
  process.exit(1)
}

console.log(`OK  ${FILE}\n    sha256 ${digest}`)
