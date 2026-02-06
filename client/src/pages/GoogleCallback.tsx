import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

function GoogleCallback() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { handleGoogleCallback } = useAuth()

  useEffect(() => {
    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setError('Google sign-in was cancelled')
      return
    }

    if (code) {
      handleGoogleCallback(code)
        .then(() => {
          navigate('/', { replace: true })
        })
        .catch((err) => {
          console.error('Google callback error:', err)
          setError('Failed to complete Google sign-in')
        })
    } else {
      setError('No authorization code received')
    }
  }, [searchParams, handleGoogleCallback, navigate])

  if (error) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">Sign In Failed</h1>
          <div className="alert alert-error" style={{ marginTop: '1rem' }}>
            {error}
          </div>
          <button
            className="btn btn-primary auth-btn"
            style={{ marginTop: '1rem' }}
            onClick={() => navigate('/login')}
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Signing in...</h1>
        <p className="auth-subtitle">Please wait while we complete your sign-in.</p>
      </div>
    </div>
  )
}

export default GoogleCallback
