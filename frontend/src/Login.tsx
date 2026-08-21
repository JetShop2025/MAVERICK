import {
  useState
} from 'react'

import type {
  FormEvent
} from 'react'

import './Login.css'
import maverickLogo from './assets/maverick-logo.svg'

type LoginProps = {
  onLogin: () => void
}

const API_BASE =
  import.meta.env.DEV
    ? 'http://localhost:3000'
    : 'https://maverick-1z64.onrender.com'

function Login({
  onLogin
}: LoginProps) {
  const [
    email,
    setEmail
  ] = useState('')

  const [
    password,
    setPassword
  ] = useState('')

  const [
    showPassword,
    setShowPassword
  ] = useState(false)

  const [
    loading,
    setLoading
  ] = useState(false)

  const [
    error,
    setError
  ] = useState('')

  const handleSubmit =
    async (
      event: FormEvent
    ) => {
      event.preventDefault()

      const cleanEmail =
        email.trim()

      if (
        !cleanEmail ||
        !password
      ) {
        setError(
          'Enter your email and password.'
        )
        return
      }

      setLoading(true)
      setError('')

      try {
        const response =
          await fetch(
            `${API_BASE}/api/auth/login`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body: JSON.stringify({
                email: cleanEmail,
                password
              })
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          !data.ok ||
          !data.token
        ) {
          setError(
            data.message ||
            'Unable to sign in.'
          )
          return
        }

        localStorage.setItem(
          'maverick_token',
          data.token
        )

        localStorage.setItem(
          'maverick_user',
          JSON.stringify(
            data.user ?? null
          )
        )

        onLogin()
      } catch {
        setError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setLoading(false)
      }
    }

  return (
    <main className="mav-login-page">
      <div className="mav-login-aurora mav-login-aurora-one" />
      <div className="mav-login-aurora mav-login-aurora-two" />

      <section className="mav-login-shell">
        <aside className="mav-login-hero">
          <header className="mav-login-brand">
            <img
              src={maverickLogo}
              alt="Maverick"
            />

            <div>
              <strong>
                MAVERICK
              </strong>

              <span>
                Fleet Intelligence
              </span>
            </div>
          </header>

          <div className="mav-login-hero-copy">
            <span className="mav-login-eyebrow">
              FLEET COMMAND PLATFORM
            </span>

            <h1>
              Smarter Fleet.
              <br />
              <em>
                Safer Deliveries.
              </em>
            </h1>

            <p>
              Real-time trailer tracking,
              temperature monitoring and
              dispatch visibility from one
              connected platform.
            </p>
          </div>

          <div className="mav-login-map-visual">
            <div className="mav-map-grid" />

            <svg
              className="mav-route-svg"
              viewBox="0 0 760 540"
              aria-hidden="true"
            >
              <path
                className="mav-route-shadow"
                d="M130 415 C210 365, 220 285, 330 300 S485 355, 530 255 S560 120, 660 100"
              />

              <path
                className="mav-route-line"
                d="M130 415 C210 365, 220 285, 330 300 S485 355, 530 255 S560 120, 660 100"
              />
            </svg>

            <span className="mav-route-point mav-route-point-one" />
            <span className="mav-route-point mav-route-point-two" />
            <span className="mav-route-point mav-route-point-three" />

            <div className="mav-route-truck">
              <span>
                ▰
              </span>
            </div>

          </div>

          <div className="mav-login-features">
            <article>
              <span className="mav-feature-icon">
                ◉
              </span>

              <div>
                <strong>
                  Real-Time Tracking
                </strong>

                <p>
                  Live asset visibility and
                  last-known location.
                </p>
              </div>
            </article>

            <article>
              <span className="mav-feature-icon">
                °F
              </span>

              <div>
                <strong>
                  Temperature Monitoring
                </strong>

                <p>
                  Continuous reefer
                  temperature intelligence.
                </p>
              </div>
            </article>

            <article>
              <span className="mav-feature-icon">
                ✓
              </span>

              <div>
                <strong>
                  Dispatch Connected
                </strong>

                <p>
                  Loads, assets and telemetry
                  in one operations center.
                </p>
              </div>
            </article>
          </div>

          <div className="mav-login-overview">
            <div className="mav-overview-heading">
              <strong>
                Fleet Overview
              </strong>

              <span>
                <i />
                SYSTEM READY
              </span>
            </div>

            <div className="mav-overview-grid">
              <div>
                <strong>
                  GPS
                </strong>

                <span>
                  Live Location
                </span>
              </div>

              <div>
                <strong>
                  LTE
                </strong>

                <span>
                  Connected
                </span>
              </div>

              <div>
                <strong>
                  TEMP
                </strong>

                <span>
                  Monitoring
                </span>
              </div>

              <div>
                <strong>
                  24/7
                </strong>

                <span>
                  Fleet Visibility
                </span>
              </div>
            </div>
          </div>

          <footer className="mav-login-hero-footer">
            <span>
              ◇
            </span>

            Enterprise visibility.
            <strong>
              Intelligent control.
            </strong>
          </footer>
        </aside>

        <section className="mav-login-form-side">
          <div className="mav-login-card">
            <div className="mav-login-card-logo">
              <img
                src={maverickLogo}
                alt="Maverick"
              />
            </div>

            <span className="mav-login-card-kicker">
              MAVERICK COMMAND
            </span>

            <h2>
              Welcome back
            </h2>

            <p className="mav-login-card-subtitle">
              Sign in to access your fleet
              command center.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mav-login-form"
            >
              <label>
                <span>
                  Email address
                </span>

                <div className="mav-login-input-wrap">
                  <span
                    className="mav-login-input-icon"
                    aria-hidden="true"
                  >
                    @
                  </span>

                  <input
                    type="email"
                    value={email}
                    onChange={
                      (event) =>
                        setEmail(
                          event.target.value
                        )
                    }
                    autoComplete="email"
                    placeholder="you@company.com"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </label>

              <label>
                <span>
                  Password
                </span>

                <div className="mav-login-input-wrap">
                  <span
                    className="mav-login-input-icon"
                    aria-hidden="true"
                  >
                    ◇
                  </span>

                  <input
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={
                      (event) =>
                        setPassword(
                          event.target.value
                        )
                    }
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    disabled={loading}
                  />

                  <button
                    className="mav-password-toggle"
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current
                      )
                    }
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                    disabled={loading}
                  >
                    {
                      showPassword
                        ? 'Hide'
                        : 'Show'
                    }
                  </button>
                </div>
              </label>

              {
                error && (
                  <div
                    className="mav-login-error"
                    role="alert"
                  >
                    <span>
                      !
                    </span>

                    {error}
                  </div>
                )
              }

              <button
                className="mav-login-submit"
                type="submit"
                disabled={loading}
              >
                <span>
                  {
                    loading
                      ? 'Signing in...'
                      : 'Sign In'
                  }
                </span>

                {
                  !loading && (
                    <strong>
                      →
                    </strong>
                  )
                }
              </button>
            </form>

            <div className="mav-login-divider">
              <span />
              <strong>
                SECURE ACCESS
              </strong>
              <span />
            </div>

            <div className="mav-login-security">
              <span className="mav-security-icon">
                ✓
              </span>

              <div>
                <strong>
                  Protected fleet access
                </strong>

                <p>
                  Authentication and company
                  data remain isolated to your
                  Maverick account.
                </p>
              </div>
            </div>

            <div className="mav-login-system">
              <span>
                <i />
                Maverick API
              </span>

              <strong>
                Ready
              </strong>
            </div>
          </div>

          <footer className="mav-login-copyright">
            © {new Date().getFullYear()} Maverick Tracking Systems
          </footer>
        </section>
      </section>
    </main>
  )
}

export default Login
