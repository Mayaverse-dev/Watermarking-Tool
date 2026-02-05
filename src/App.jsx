import { useState, useRef } from 'react'

function App() {
  const [file, setFile] = useState(null)
  const [watermarks, setWatermarks] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const fileInputRef = useRef(null)
  
  // Watermark options
  const [fontSize, setFontSize] = useState(30)
  const [angle, setAngle] = useState(55)
  const [opacity, setOpacity] = useState(0.5)
  const [posX, setPosX] = useState(50)
  const [posY, setPosY] = useState(50)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile)
        setError('')
      } else {
        setError('Please upload a PDF file')
      }
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile)
        setError('')
      } else {
        setError('Please upload a PDF file')
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!file) {
      setError('Please upload a PDF file')
      return
    }
    
    if (!watermarks.trim()) {
      setError('Please enter at least one watermark text')
      return
    }

    setIsProcessing(true)
    setError('')

    const formData = new FormData()
    formData.append('pdf', file)
    formData.append('watermarks', watermarks)
    formData.append('fontSize', fontSize)
    formData.append('angle', angle)
    formData.append('opacity', opacity)
    formData.append('posX', posX)
    formData.append('posY', posY)

    try {
      const response = await fetch('/api/watermark', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to process PDF')
      }

      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'watermarked.pdf'
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err) {
      setError(err.message || 'An error occurred while processing your request')
    } finally {
      setIsProcessing(false)
    }
  }

  const removeFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const watermarkCount = watermarks.split(',').filter(w => w.trim()).length

  return (
    <div className="app">
      {/* Settings Toggle Button */}
      <button 
        className={`settings-toggle ${panelOpen ? 'open' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label="Toggle settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>

      {/* Side Panel */}
      <aside className={`sidepanel ${panelOpen ? 'open' : ''}`}>
        <div className="sidepanel-header">
          <h2>Settings</h2>
          <button className="close-panel" onClick={() => setPanelOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="sidepanel-content">
          {/* Font Size */}
          <div className="control-group">
            <label>
              Font Size
              <span className="control-value">{fontSize}px</span>
            </label>
            <input
              type="range"
              min="12"
              max="100"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="slider"
            />
          </div>

          {/* Angle */}
          <div className="control-group">
            <label>
              Angle
              <span className="control-value">{angle}°</span>
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              className="slider"
            />
          </div>

          {/* Opacity */}
          <div className="control-group">
            <label>
              Opacity
              <span className="control-value">{Math.round(opacity * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="slider"
            />
          </div>

          {/* X Position */}
          <div className="control-group">
            <label>
              X Position
              <span className="control-value">{posX}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={posX}
              onChange={(e) => setPosX(Number(e.target.value))}
              className="slider"
            />
            <div className="slider-hints">
              <span>Left</span>
              <span>Right</span>
            </div>
          </div>

          {/* Y Position */}
          <div className="control-group">
            <label>
              Y Position
              <span className="control-value">{posY}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={posY}
              onChange={(e) => setPosY(Number(e.target.value))}
              className="slider"
            />
            <div className="slider-hints">
              <span>Bottom</span>
              <span>Top</span>
            </div>
          </div>

          {/* Preview */}
          <div className="preview-section">
            <label>Preview</label>
            <div className="preview-page">
              <span 
                className="preview-watermark"
                style={{
                  fontSize: `${Math.max(6, fontSize / 5)}px`,
                  opacity: opacity,
                  left: `${posX}%`,
                  bottom: `${posY}%`,
                  transform: `translate(-50%, 50%) rotate(${-angle}deg)`,
                }}
              >
                SAMPLE
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {panelOpen && <div className="overlay" onClick={() => setPanelOpen(false)} />}

      {/* Main Content */}
      <main className="main">
        <div className="container">
          <header className="header">
            <h1>Watermark</h1>
            <p>Add custom watermarks to your PDFs</p>
          </header>

          <form onSubmit={handleSubmit} className="form">
            {/* Dropzone */}
            <div 
              className={`dropzone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="file-input"
              />
              
              {file ? (
                <div className="file-preview">
                  <div className="file-details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div>
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                  <button type="button" className="remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="dropzone-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p>Drop your PDF here or <span>browse</span></p>
                </div>
              )}
            </div>

            {/* Watermark Input */}
            <div className="input-group">
              <label>
                Watermark texts
                {watermarkCount > 0 && <span className="count">{watermarkCount}</span>}
              </label>
              <textarea
                value={watermarks}
                onChange={(e) => setWatermarks(e.target.value)}
                placeholder="For Alice, For Bob, For Charlie..."
                rows={3}
              />
              {watermarkCount > 1 && (
                <p className="hint">{watermarkCount} PDFs will be zipped together</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button 
              type="submit" 
              className="submit-btn"
              disabled={isProcessing || !file || !watermarks.trim()}
            >
              {isProcessing ? (
                <>
                  <span className="spinner" />
                  Processing...
                </>
              ) : (
                'Generate'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

export default App
