import { useState } from "react";

export default function Auth({ onSignedIn, initialMode = "login", onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response = await fetch(
        mode === "register" ? "/api/register" : "/api/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      onSignedIn(data.user);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        {onBack && (
          <button className="auth-back" type="button" onClick={onBack}>
            <span aria-hidden="true">←</span> Back to home
          </button>
        )}
        <p className="auth-kicker">Smart Wearable</p>
        <h1>{mode === "register" ? "Create account" : "Sign in"}</h1>
        <p className="subtitle">
          Register with email to view live FIWARE health data.
        </p>

        {mode === "register" && (
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "register" ? "At least 8 characters" : "Password"}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "register"
              ? "Register"
              : "Login"}
        </button>

        <p className="auth-switch">
          {mode === "register" ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError("");
            }}
          >
            {mode === "register" ? "Sign in" : "Register with email"}
          </button>
        </p>
      </form>
    </div>
  );
}
