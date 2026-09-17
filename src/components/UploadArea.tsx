import { useState, type DragEvent } from 'react'
import { IconCheck, IconFile, IconUpload } from './icons'

export type UploadStatus = 'idle' | 'success' | 'error'

interface UploadAreaProps {
  status: UploadStatus
  fileName: string | null
  transactionCount: number
  onFile: (file: File) => void
}

/**
 * A styled drop zone wrapping a real `<input type="file">`.
 *
 * The input is visually hidden but not removed, and the zone is its `<label>`,
 * so click, keyboard activation and screen-reader announcement are all the
 * browser's own behaviour rather than something re-implemented. Drag and drop
 * is layered on top and is purely additive.
 */
export function UploadArea({
  status,
  fileName,
  transactionCount,
  onFile,
}: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <label
      className="dropzone"
      data-dragging={isDragging}
      data-status={status}
      htmlFor="csv-file"
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        id="csv-file"
        className="dropzone__input"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
        }}
      />

      <span className="dropzone__icon" aria-hidden="true">
        {status === 'success' ? <IconCheck size={22} /> : <IconUpload size={22} />}
      </span>

      {status === 'success' && fileName ? (
        <span className="dropzone__body">
          <span className="dropzone__title">
            {transactionCount} transactions ready
          </span>
          <span className="dropzone__hint">
            <IconFile size={14} /> {fileName} · choose another file to replace it
          </span>
        </span>
      ) : (
        <span className="dropzone__body">
          <span className="dropzone__title">Choose a CSV file</span>
          <span className="dropzone__hint">or drag and drop it here</span>
        </span>
      )}
    </label>
  )
}
