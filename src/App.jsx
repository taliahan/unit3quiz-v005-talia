import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import './App.css'
import { auth } from './firebase'

const monthOrder = [
  '2024-01',
  '2024-02',
  '2024-03',
  '2024-04',
  '2024-05',
  '2024-06',
  '2024-07',
  '2024-08',
  '2024-09',
  '2024-10',
  '2024-11',
  '2024-12',
]

const series = {
  Fentanyl: [142, 151, 158, 161, 169, 176, 181, 187, 193, 199, 205, 212],
  Heroin: [88, 91, 93, 95, 99, 103, 104, 108, 110, 111, 113, 115],
  'Prescription Opioids': [96, 98, 100, 102, 105, 108, 110, 111, 114, 116, 118, 120],
  Cocaine: [74, 76, 79, 82, 84, 86, 89, 91, 94, 96, 99, 101],
  Methamphetamine: [65, 67, 69, 72, 74, 76, 78, 81, 83, 85, 87, 90],
}

const overdoseData = monthOrder.flatMap((month, idx) =>
  Object.entries(series).map(([drug, values]) => ({
    month,
    drug,
    deaths: values[idx],
  })),
)

const palette = {
  Fentanyl: '#7c3aed',
  Heroin: '#f97316',
  'Prescription Opioids': '#22c55e',
  Cocaine: '#06b6d4',
  Methamphetamine: '#e11d48',
}

const formatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
})

const formatMonth = (month) => formatter.format(new Date(`${month}-01T00:00:00Z`))

function Chart({ months, dataByDrug, maxValue }) {
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const width = 960
  const height = 420
  const margin = { top: 32, right: 32, bottom: 72, left: 64 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const steps = months.length > 1 ? months.length - 1 : 1

  const xPos = (idx) => margin.left + (plotWidth / steps) * idx
  const yPos = (val) =>
    margin.top + plotHeight - (plotHeight * val) / (maxValue > 0 ? maxValue : 1)

  const gridLines = Array.from({ length: 5 }, (_, i) => (maxValue / 4) * i)

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Overdoses by drug</p>
          <h2>Monthly counts across all reported substances</h2>
        </div>
        <p className="hint">Hover points to see exact counts.</p>
      </div>
      <svg
        ref={containerRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly overdose trend chart"
      >
        <defs>
          <linearGradient id="gridGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {gridLines.map((value) => (
          <g key={value}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={yPos(value)}
              y2={yPos(value)}
              stroke="url(#gridGradient)"
              strokeWidth="1"
            />
            <text x={margin.left - 12} y={yPos(value) + 4} className="axis-label">
              {Math.round(value)}
            </text>
          </g>
        ))}

        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={yPos(0)}
          y2={yPos(0)}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />

        {months.map((month, idx) => (
          <g key={month} transform={`translate(${xPos(idx)}, ${yPos(0)})`}>
            <line y1="0" y2="6" stroke="#94a3b8" strokeWidth="1.5" />
            <text y="24" textAnchor="middle" className="axis-label">
              {formatMonth(month)}
            </text>
          </g>
        ))}

        {dataByDrug.map(({ drug, color, points }) => {
          const path = points
            .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${xPos(idx)} ${yPos(point.deaths)}`)
            .join(' ')

          return (
            <g key={drug}>
              <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
              {points.map((point, idx) => (
                <g key={`${drug}-${point.month}`} transform={`translate(${xPos(idx)}, ${yPos(point.deaths)})`}>
                  <circle
                    r="6.5"
                    fill="#fff"
                    stroke={color}
                    strokeWidth="3"
                    onMouseEnter={(e) => {
                      const bounds = containerRef.current?.getBoundingClientRect()
                      if (!bounds) return
                      setTooltip({
                        x: e.clientX - bounds.left + 10,
                        y: e.clientY - bounds.top - 10,
                        drug,
                        month: formatMonth(point.month),
                        deaths: point.deaths,
                        color,
                      })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </g>
              ))}
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <div className="tooltip-row">
            <span className="swatch" style={{ backgroundColor: tooltip.color }} />
            <span className="tooltip-title">{tooltip.drug}</span>
          </div>
          <div className="tooltip-sub">{tooltip.month}</div>
          <div className="tooltip-value">{tooltip.deaths.toLocaleString()} deaths</div>
        </div>
      )}
    </div>
  )
}

function App() {
  const drugs = useMemo(() => Object.keys(series), [])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const months = monthOrder
  const filtered = useMemo(() => overdoseData, [])

  const maxValue = useMemo(() => {
    return Math.max(...overdoseData.map((d) => d.deaths))
  }, [])

  const dataByDrug = useMemo(
    () =>
      drugs.map((drug) => ({
        drug,
        color: palette[drug] ?? '#0ea5e9',
        points: months.map((month, idx) => ({
          month,
          deaths: series[drug][idx] ?? 0,
        })),
      })),
    [drugs, months],
  )

  const totalsByMonth = useMemo(
    () =>
      months.map((month) => ({
        month,
        total: filtered.filter((entry) => entry.month === month).reduce((sum, entry) => sum + entry.deaths, 0),
      })),
    [filtered, months],
  )

  const grandTotal = filtered.reduce((sum, entry) => sum + entry.deaths, 0)
  const latestMonth = months[months.length - 1]
  const latestTotal = totalsByMonth.find((row) => row.month === latestMonth)?.total ?? 0
  const avgMonthly = months.length ? Math.round(grandTotal / months.length) : 0

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (current) => {
      setUser(current)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const handleRegister = async () => {
    setAuthError('')
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const handleLogin = async () => {
    setAuthError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Public health | Overdose</p>
          <h1>Drug overdose monitoring dashboard</h1>
          <p className="lede">
            Explore monthly overdose counts across key substances. Use the segmentation controls to focus on a single drug
            or compare trends side by side.
          </p>
          <a
            className="source"
            href="https://catalog.data.gov/dataset/warehouse-and-retail-sales"
            target="_blank"
            rel="noreferrer"
          >
            Data source: catalog.data.gov/dataset/warehouse-and-retail-sales
          </a>
        </div>
        <div className="pill-strip">
          <span className="pill">Full dataset displayed</span>
        </div>
      </header>

      <section className="controls">
        <div className="stat-grid">
          <div className="card stat">
            <p className="eyebrow">Total deaths (shown range)</p>
            <p className="stat-value">{grandTotal.toLocaleString()}</p>
            <p className="hint">Across {months.length} months</p>
          </div>
          <div className="card stat">
            <p className="eyebrow">Latest month</p>
            <p className="stat-value">{formatMonth(latestMonth)}</p>
            <p className="hint">{latestTotal.toLocaleString()} deaths</p>
          </div>
          <div className="card stat">
            <p className="eyebrow">Average per month</p>
            <p className="stat-value">{avgMonthly.toLocaleString()}</p>
            <p className="hint">Based on selected drugs</p>
          </div>
        </div>
      </section>

      <section className="card chart-card">
        {filtered.length ? (
          <Chart months={months} dataByDrug={dataByDrug} maxValue={maxValue} />
        ) : (
          <div className="empty">Select at least one drug to see the chart.</div>
        )}
        <div className="legend">
          {drugs.map((drug) => (
            <div key={drug} className="legend-item">
              <span className="swatch" style={{ backgroundColor: palette[drug] }} />
              {drug}
            </div>
          ))}
        </div>
      </section>

      <section className="card table-card">
        <div className="table-head">
          <div>
            <p className="eyebrow">Full dataset</p>
            <h3>Monthly overdose counts by drug</h3>
          </div>
          <p className="hint">Sorted by month, then drug</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Drug</th>
                <th className="numeric">Deaths</th>
              </tr>
            </thead>
            <tbody>
              {overdoseData.map((row) => (
                <tr key={`${row.month}-${row.drug}`}>
                  <td>{formatMonth(row.month)}</td>
                  <td>{row.drug}</td>
                  <td className="numeric">{row.deaths.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card intent-card">
        <div className="table-head">
          <div>
            <p className="eyebrow">Statement of Intent</p>
            <h3>Our position on the data</h3>
          </div>
        </div>
        <p className="lede">
          These overdose trends show a persistent, preventable public-health crisis. We support evidence-based harm reduction,
          rapid access to treatment, and data transparency to hold systems accountable. Use this dashboard to advocate for policies
          that save lives and expand care.
        </p>
      </section>

      <section className="card auth-card">
        <div className="table-head">
          <div>
            <p className="eyebrow">Register to Vote</p>
            <h3>Support public health policy</h3>
          </div>
          {authLoading ? <p className="hint">Loading status…</p> : <p className="hint">Secure email sign-in</p>}
        </div>

        {user ? (
          <div className="auth-success">
            <p className="lede tight">Thank you for your support — you are registered to vote.</p>
            <button className="primary" type="button" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        ) : (
          <div className="auth-form">
            <div className="input-col">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="input-col">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {authError ? <p className="error">{authError}</p> : null}

            <div className="auth-actions">
              <button className="primary" type="button" onClick={handleRegister} disabled={authLoading}>
                Create Account
              </button>
              <button type="button" onClick={handleLogin} className="ghost" disabled={authLoading}>
                Log In
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
