import { useState } from 'react'
import maverickLogo from './assets/maverick-logo.jpeg'
import './Login.css'

type LoginProps = {
  onLogin: () => void
}

function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (
  event: React.FormEvent<HTMLFormElement>
) => {
  event.preventDefault()

  if (!email || !password) {
    return
  }

  try {
    const response = await fetch(
      'https://maverick-1z64.onrender.com/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      }
    )

    const data = await response.json()

    if (!response.ok || !data.ok) {
      alert(
        data.message ||
        'Invalid email or password'
      )

      return
    }

    localStorage.setItem(
      'maverick_token',
      data.token
    )

    localStorage.setItem(
      'maverick_user',
      JSON.stringify(data.user)
    )

    onLogin()

  } catch {
    alert(
      'Unable to connect to Maverick'
    )
  }
}

  return (
    <div className="login-page">
      <div className="login-card">
        <img
          src={maverickLogo}
          alt="Maverick Logo"
          className="login-logo"
        />

        <h1>Maverick</h1>

        <p className="login-subtitle">
          Fleet Tracking & Temperature Monitoring
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="you@company.com"
            required
          />

          <label>
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Enter your password"
            required
          />

          <button type="submit">
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login