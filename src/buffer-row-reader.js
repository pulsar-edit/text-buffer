const Point = require('./point')
const Range = require('./range')

const DEFAULT_CHUNK_SIZE = 4096

// Reads the characters of one buffer row a chunk at a time, so that working on
// part of a long buffer row doesn't require fetching all of it.
class BufferRowReader {
  constructor (buffer, bufferRow, lineLength, chunkSize = DEFAULT_CHUNK_SIZE) {
    this.buffer = buffer
    this.bufferRow = bufferRow
    this.lineLength = lineLength
    this.chunkSize = chunkSize
    this.chunkStart = 0
    this.chunk = ''
  }

  // Returns undefined for columns outside the buffer row.
  characterAt (column) {
    if (column < 0 || column >= this.lineLength) return undefined
    const index = column - this.chunkStart
    if (index >= 0 && index < this.chunk.length) return this.chunk[index]

    // Mostly we read forward, but the search for the first affected screen
    // row reads backward, so keep some text before the requested column.
    this.chunkStart = Math.max(0, column - (this.chunkSize >> 2))
    const chunkEnd = Math.min(this.lineLength, this.chunkStart + this.chunkSize)
    this.chunk = this.buffer.getTextInRange(Range(
      Point(this.bufferRow, this.chunkStart),
      Point(this.bufferRow, chunkEnd)
    ))
    return this.chunk[column - this.chunkStart]
  }
}

module.exports = BufferRowReader
