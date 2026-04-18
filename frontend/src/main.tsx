// KaTeX CSS must be imported globally so math in MessageContent renders correctly.
// This is a Phase 1 requirement — LaTeX display in message bubbles is live from day one.
import 'katex/dist/katex.min.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Providers } from './app/providers'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers />
  </React.StrictMode>
)
