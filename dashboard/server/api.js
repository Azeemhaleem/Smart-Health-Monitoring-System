import express from "express";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET = process.env.AUTH_SECRET || "smart-watch-local-auth-secret";
const ORION_URL = process.env.ORION_URL || "http://127.0.0.1:1026";
const ENTITY_ID = "HealthMonitor:smartwatch001";
const SESSION_DAYS = 7;

function emailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function loadUsers() {
  try {
    const raw = await readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveUsers(users) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || "").split(":");
  if (!salt || !hex) {
    return false;
  }
  const derived = await scryptAsync(password, salt, 64);
  const left = Buffer.from(hex, "hex");
  const right = Buffer.from(derived);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signSession(email) {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function readSession(token) {
  if (!token || !token.includes(".")) {
    return null;
  }
  const [payload, sig] = token.split(".");
  const expected = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.email || data.exp < Date.now()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function cookieValue(req, name) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return "";
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `sw_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${
      SESSION_DAYS * 24 * 60 * 60
    }`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "sw_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  );
}

function publicUser(user) {
  return {
    email: user.email,
    name: user.name || "",
  };
}

async function currentUser(req) {
  const session = readSession(cookieValue(req, "sw_session"));
  if (!session) {
    return null;
  }
  const users = await loadUsers();
  return users.find((user) => user.email === session.email) || null;
}

export function createApi() {
  const app = express();
  app.use(express.json({ limit: "32kb" }));

  app.post("/api/register", async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();

    if (!emailValid(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const users = await loadUsers();
    if (users.some((user) => user.email === email)) {
      res.status(409).json({ error: "That email is already registered." });
      return;
    }

    const user = {
      email,
      name,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await saveUsers(users);
    setSessionCookie(res, signSession(email));
    res.status(201).json({ user: publicUser(user) });
  });

  app.post("/api/login", async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const users = await loadUsers();
    const user = users.find((entry) => entry.email === email);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Email or password is incorrect." });
      return;
    }

    setSessionCookie(res, signSession(email));
    res.json({ user: publicUser(user) });
  });

  app.post("/api/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/me", async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    res.json({ user: publicUser(user) });
  });

  app.get("/api/health", async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to view watch data." });
      return;
    }

    try {
      const response = await fetch(
        `${ORION_URL}/v2/entities/${encodeURIComponent(ENTITY_ID)}?options=keyValues`,
        {
          headers: {
            "fiware-service": "openiot",
            "fiware-servicepath": "/",
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        res.status(response.status).json({
          error: `FIWARE Orion HTTP ${response.status}`,
        });
        return;
      }

      res.json(await response.json());
    } catch (error) {
      res.status(502).json({
        error: error.message || "Cannot reach FIWARE Orion.",
      });
    }
  });

  app.use((_req, _res, next) => next());

  return app;
}
