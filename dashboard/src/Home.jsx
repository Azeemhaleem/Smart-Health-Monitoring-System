const features = [
  {
    number: "01",
    title: "Watch your readings",
    description:
      "See heart rate and temperature readings collected by your wearable in one clear dashboard.",
  },
  {
    number: "02",
    title: "Follow changes over time",
    description:
      "Live updates and simple trend charts help you follow incoming sensor data as it arrives.",
  },
  {
    number: "03",
    title: "See alerts at a glance",
    description:
      "SOS and configured sensor alerts are highlighted so important events are easy to spot.",
  },
];

export default function Home({ onSignIn, onRegister }) {
  return (
    <main className="home-page">
      <nav className="home-nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Pulse home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Pulse<span className="brand-light">watch</span></span>
        </a>
        <div className="home-nav-actions">
          <button className="nav-login" type="button" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button button-small" type="button" onClick={onRegister}>
            Create account <span aria-hidden="true">↗</span>
          </button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" /> YOUR HEALTH, IN VIEW</p>
          <h1>Small signals.<br /><span>Clear picture.</span></h1>
          <p className="hero-description">
            A calm, simple view of the readings from your smart wearable. Follow
            heart rate, temperature, and alerts as your device sends them.
          </p>
          <div className="hero-actions">
            <button className="button" type="button" onClick={onRegister}>
              Get started <span aria-hidden="true">→</span>
            </button>
            <button className="text-action" type="button" onClick={onSignIn}>
              I already have an account
            </button>
          </div>
          <p className="hero-note">Your readings appear after your watch connects and sends data.</p>
        </div>

        <div className="hero-visual" aria-label="Preview of the health dashboard">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="preview-card">
            <div className="preview-topline">
              <span className="preview-label">LIVE OVERVIEW</span>
              <span className="preview-indicator"><i /> READY</span>
            </div>
            <div className="preview-heart">
              <span className="heart-icon" aria-hidden="true">♥</span>
              <div><strong>—</strong><small>BPM</small></div>
              <span className="preview-caption">Heart rate</span>
            </div>
            <div className="preview-chart" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="preview-bottom">
              <div><small>BODY TEMP.</small><strong>— <em>°C</em></strong></div>
              <div><small>AMBIENT</small><strong>— <em>°C</em></strong></div>
              <div className="preview-alert"><small>ALERTS</small><strong><i /> Ready</strong></div>
            </div>
          </div>
          <div className="visual-tag"><span aria-hidden="true">✳</span> Your readings, at a glance</div>
        </div>
      </section>

      <section className="feature-section" aria-labelledby="features-title">
        <div className="section-heading">
          <p className="eyebrow">MADE TO BE CLEAR</p>
          <h2 id="features-title">Everything in its right place.</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <a className="brand brand-footer" href="#top">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Pulse<span className="brand-light">watch</span></span>
        </a>
        <p>Connected wearable insights, made easy to follow.</p>
        <span className="footer-status"><i /> SYSTEM READY</span>
      </footer>
    </main>
  );
}
