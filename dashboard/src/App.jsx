import { useCallback, useState } from "react";
import Auth from "./Auth.jsx";
import Dashboard from "./Dashboard.jsx";
import Home from "./Home.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);

  const logout = useCallback(async () => {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setUser(null);
  }, []);

  if (user === undefined) {
    return (
      <div className="auth-wrap">
        <p className="meta">Loading...</p>
      </div>
    );
  }

  if (!user) {
    if (!authMode) {
      return (
        <Home
          onSignIn={() => setAuthMode("login")}
          onRegister={() => setAuthMode("register")}
        />
      );
    }

    return (
      <Auth
        initialMode={authMode}
        onSignedIn={setUser}
        onBack={() => setAuthMode(null)}
      />
    );
  }

  return <Dashboard user={user} onLogout={logout} />;
}
