import { useEffect, useMemo, useState } from "react";

const POLL_MS = 2000;
const LIVE_WINDOW_MS = 12000;
const HISTORY_LIMIT = 60;

function parseInstant(value) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function Sparkline({ points, color, metric }) {
  const values = points
    .map((point) => point[metric])
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return <p className="meta">Waiting for enough samples to draw a trend.</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const width = 600;
  const height = 180;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={path} fill="none" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export default function Dashboard({ user, onLogout }) {
  const [entity, setEntity] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState("heartRate");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/health", {
          credentials: "same-origin",
        });

        if (response.status === 401) {
          onLogout();
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setEntity(data);
        setError("");
        setFetchedAt(Date.now());
        setHistory((previous) => {
          const next = [
            ...previous,
            {
              t: Date.now(),
              heartRate: data.heartRate == null ? NaN : Number(data.heartRate),
              temperature: data.temperature == null ? NaN : Number(data.temperature),
              ambientTemperature: data.ambientTemperature == null ? NaN : Number(data.ambientTemperature),
            },
          ];
          return next.slice(-HISTORY_LIMIT);
        });
      } catch (caught) {
        if (!cancelled) {
          setError(caught.message || "FIWARE request failed");
        }
      }
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [onLogout, refreshTick]);

  const live = useMemo(() => {
    const instant = parseInstant(entity?.TimeInstant);
    if (!instant) {
      return false;
    }
    return Date.now() - instant < LIVE_WINDOW_MS;
  }, [entity, fetchedAt]);

  const alertActive = Boolean(
    entity?.sos || entity?.heartRateAlert || entity?.temperatureAlert
  );

  return (
    <main className={`dashboard-page ${alertActive ? "alert" : ""}`}>
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        <a className="brand" href="/" aria-label="Pulsewatch home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Pulse<span className="brand-light">watch</span></span>
        </a>
        <div className="dashboard-nav-right">
          <span className={`badge ${error ? "danger" : live ? "ok" : "warn"}`}>
            <i /> {error ? "FIWARE OFFLINE" : live ? "LIVE DATA" : "WAITING FOR DATA"}
          </span>
          {entity?.bodyTemperatureDemo && <span className="badge warn"><i /> BODY TEMP DEMO</span>}
          <span className="dashboard-user">{user.name || user.email}</span>
          <button type="button" className="dashboard-logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        <header className="dashboard-heading">
          <div>
            <p className="eyebrow"><span className="status-dot" /> YOUR HEALTH OVERVIEW</p>
            <h1>Good to see you{user.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
            <p className="subtitle">A clear view of the latest readings from your wearable.</p>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={() => setRefreshTick((tick) => tick + 1)}
            aria-label="Refresh health data"
          >
            <span aria-hidden="true">↻</span> Refresh
          </button>
        </header>

      {error && (
        <div className="dashboard-banner lost">
          <strong>Connection interrupted</strong> Showing the last available data.
          <div className="meta">{error}</div>
        </div>
      )}

      {!error && entity && !live && (
        <div className="dashboard-banner lost">
          <strong>Waiting for a fresh reading</strong> Showing the last available data.
        </div>
      )}

      {entity?.sos && <div className="dashboard-banner sos"><strong>Manual SOS is active</strong> Check on the wearer.</div>}

      <section className="dashboard-grid" aria-label="Health measurements">
        <button type="button" aria-pressed={selectedMetric === "heartRate"} className={`dashboard-card ${selectedMetric === "heartRate" ? "selected" : ""} ${entity?.heartRateAlert ? "danger" : ""}`} onClick={() => setSelectedMetric("heartRate")}>
          <span className="metric-icon heart" aria-hidden="true">♡</span>
          <span className="label">Heart rate</span>
          <span className="value">
            {entity?.heartRate == null ? "--" : Math.round(Number(entity.heartRate))}
            <span className="unit">BPM</span>
          </span>
          <span className="metric-hint">Select to view trend <span aria-hidden="true">↗</span></span>
        </button>
        <button type="button" aria-pressed={selectedMetric === "temperature"} className={`dashboard-card ${selectedMetric === "temperature" ? "selected" : ""} ${entity?.temperatureAlert ? "danger" : ""}`} onClick={() => setSelectedMetric("temperature")}>
          <span className="metric-icon temp" aria-hidden="true">◌</span>
          <span className="label">Body temperature</span>
          <span className="value">
            {entity?.temperature == null
              ? "36.5"
              : Number(entity.temperature).toFixed(1)}
            <span className="unit">°C</span>
          </span>
          <span className="metric-hint">
            {entity?.bodyTemperatureDemo
              ? "SIMULATED DEMO · not a sensor reading"
              : entity?.temperature == null ? "Initial value · waiting for MLX90614" : "MLX90614 reading"}
            {entity?.temperature != null && <span aria-hidden="true">↗</span>}
          </span>
        </button>
        <button type="button" aria-pressed={selectedMetric === "ambientTemperature"} className={`dashboard-card ${selectedMetric === "ambientTemperature" ? "selected" : ""}`} onClick={() => setSelectedMetric("ambientTemperature")}>
          <span className="metric-icon ambient" aria-hidden="true">☼</span>
          <span className="label">Ambient temperature</span>
          <span className="value">
            {entity?.ambientTemperature == null
              ? "--"
              : Number(entity.ambientTemperature).toFixed(1)}
            <span className="unit">°C</span>
          </span>
          <span className="metric-hint">Select to view trend <span aria-hidden="true">↗</span></span>
        </button>
        <article className={`dashboard-card status-card ${alertActive ? "danger" : ""}`}>
          <span className="metric-icon status" aria-hidden="true">✳</span>
          <span className="label">Alert status</span>
          <span className="value">{alertActive ? "Check" : "All clear"}</span>
          <span className="metric-hint">{entity?.fingerPresent ? "Finger detected" : "No finger detected"}</span>
        </article>
      </section>

      <section className="dashboard-chart-card">
        <div className="chart-heading">
          <div>
            <p className="eyebrow">RECENT READINGS</p>
            <h2>{selectedMetric === "heartRate" ? "Heart-rate trend" : selectedMetric === "temperature" ? "Body temperature trend" : "Ambient temperature trend"}</h2>
          </div>
          <span className="chart-period">THIS SESSION</span>
        </div>
        <Sparkline points={history} metric={selectedMetric} color={alertActive ? "#c45b56" : "#48a9e8"} />
      </section>

      <footer className="dashboard-footer">
        <span>Latest update <strong>{entity?.TimeInstant ? new Date(entity.TimeInstant).toLocaleString() : "Waiting for first reading"}</strong></span>
        <span>Source: FIWARE · HealthMonitor:smartwatch001</span>
      </footer>
      </div>
    </main>
  );
}
