import { useEffect, useMemo, useState } from "react";

const ENTITY_PATH =
  "/orion/v2/entities/HealthMonitor:smartwatch001?options=keyValues";
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

function Sparkline({ points, color }) {
  if (points.length < 2) {
    return <p className="meta">Waiting for enough samples to draw a trend.</p>;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const width = 600;
  const height = 180;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.value - min) / span) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={path} fill="none" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export default function App() {
  const [entity, setEntity] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(ENTITY_PATH, {
          headers: {
            "fiware-service": "openiot",
            "fiware-servicepath": "/",
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Orion HTTP ${response.status}`);
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
              value: Number(data.heartRate) || 0,
              temperature: Number(data.temperature) || 0,
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
  }, []);

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
    <div className={`app ${alertActive ? "alert" : ""}`}>
      <header className="header">
        <div>
          <h1>Smart Wearable Health Monitor</h1>
          <p className="subtitle">
            FIWARE Orion entity HealthMonitor:smartwatch001
          </p>
        </div>
        <div className="badges">
          <span className={`badge ${error ? "danger" : live ? "ok" : "warn"}`}>
            {error
              ? "FIWARE OFFLINE"
              : live
                ? "LIVE"
                : "LAST KNOWN"}
          </span>
          {entity?.fingerPresent ? (
            <span className="badge ok">FINGER ON</span>
          ) : (
            <span className="badge warn">NO FINGER</span>
          )}
        </div>
      </header>

      {error && (
        <div className="banner lost">
          FIWARE CONNECTION LOST – Showing last available data.
          <div className="meta">{error}</div>
        </div>
      )}

      {!error && entity && !live && (
        <div className="banner lost">
          FIWARE CONNECTION LOST – Showing last available data.
        </div>
      )}

      {entity?.sos && <div className="banner sos">RED ALERT: MANUAL SOS</div>}

      <section className="grid">
        <article className={`card ${entity?.heartRateAlert ? "danger" : ""}`}>
          <div className="label">Heart rate</div>
          <div className="value">
            {entity?.heartRate == null ? "--" : Math.round(Number(entity.heartRate))}
            <span className="unit">BPM</span>
          </div>
        </article>
        <article className={`card ${entity?.temperatureAlert ? "danger" : ""}`}>
          <div className="label">Temperature (DHT11 prototype)</div>
          <div className="value">
            {entity?.temperature == null ? "--" : Number(entity.temperature).toFixed(1)}
            <span className="unit">°C</span>
          </div>
        </article>
        <article className="card">
          <div className="label">Humidity</div>
          <div className="value">
            {entity?.humidity == null ? "--" : Number(entity.humidity).toFixed(0)}
            <span className="unit">%</span>
          </div>
        </article>
        <article className={`card ${alertActive ? "danger" : ""}`}>
          <div className="label">Alert status</div>
          <div className="value">
            {alertActive ? "RED" : "OK"}
          </div>
        </article>
      </section>

      <section className="card chart-card">
        <div className="label">Heart-rate trend (this session)</div>
        <Sparkline points={history} color={alertActive ? "#ff8a96" : "#4fd1c5"} />
      </section>

      <p className="meta">
        Latest FIWARE timestamp: {entity?.TimeInstant || "none"}
      </p>
    </div>
  );
}
