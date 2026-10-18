/**
 * Minimal read-only XLSX reader.
 *
 * An .xlsx file is a zip of XML parts. The benchmark only needs the cell grid
 * of one sheet, so this reads the shared-string table and the sheet rows and
 * stops there — no formulas, no styles beyond date detection, no writing. It
 * exists so the benchmark can read the published dataset without adding a
 * spreadsheet dependency to FinAhead.
 *
 * Requires `unzip` on PATH (present on macOS and most Linux images).
 */

import { execFileSync } from 'node:child_process'

/** Excel serial-date epoch. Day 1 is 1900-01-01, with the 1900 leap-year bug. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)

function unzipMember(zipPath, member) {
  return execFileSync('unzip', ['-p', zipPath, member], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

/** Shared strings are stored once and referenced by index from the cells. */
function readSharedStrings(zipPath) {
  let xml
  try {
    xml = unzipMember(zipPath, 'xl/sharedStrings.xml')
  } catch {
    return []
  }
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => {
    // A shared string may be split across several <t> runs.
    const runs = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
    return decodeXmlEntities(runs.map((run) => run[1]).join(''))
  })
}

/** Column letters to a zero-based index: A -> 0, Z -> 25, AA -> 26. */
export function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0]
  let index = 0
  for (const character of letters) {
    index = index * 26 + (character.charCodeAt(0) - 64)
  }
  return index - 1
}

/** Excel serial number to an ISO date string, in UTC. */
export function serialToIso(serial) {
  const ms = EXCEL_EPOCH_UTC + Math.round(serial) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Read one sheet as an array of row arrays. Cell values are returned as
 * strings for text and numbers for numerics; the caller decides what a number
 * means, because XLSX does not distinguish a date from a number except through
 * the style table.
 */
export function readSheet(zipPath, sheetPath = 'xl/worksheets/sheet1.xml') {
  const shared = readSharedStrings(zipPath)
  const xml = unzipMember(zipPath, sheetPath)
  const rows = []

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1]
      const inner = cellMatch[2]
      const ref = attributes.match(/r="([A-Z]+\d+)"/)?.[1]
      const type = attributes.match(/t="([^"]+)"/)?.[1]
      const index = ref ? columnIndex(ref) : cells.length

      let value = null
      if (type === 'inlineStr') {
        const runs = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        value = decodeXmlEntities(runs.map((run) => run[1]).join(''))
      } else {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        if (raw !== undefined) {
          if (type === 's') value = shared[Number(raw)] ?? ''
          else if (type === 'str' || type === 'e') value = decodeXmlEntities(raw)
          else value = Number(raw)
        }
      }

      cells[index] = value
    }
    rows.push(cells)
  }

  return rows
}
