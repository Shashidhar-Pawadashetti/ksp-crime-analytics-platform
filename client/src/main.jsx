import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import { ChatProvider } from './contexts/ChatContext'
import { UIProvider } from './contexts/UIContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ChatProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </ChatProvider>
    </AuthProvider>
  </StrictMode>
)
