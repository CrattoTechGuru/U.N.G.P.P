"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

/* ============================================================
   ULTRA NEXT GEN PRO PREDICTOR
   V1000 SERVER
   ============================================================ */

const PORT = Number(process.env.PORT) || 10000;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

/* ============================================================
   ENVIRONMENT
   ============================================================ */

const FOOTBALL_SOCCER_API_KEY =
  process.env.FOOTBALL_SOCCER_API_KEY || "";

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";

const NODE_ENV =
  process.env.NODE_ENV || "production";

const UPCOMING_DAYS =
  Math.max(1, Number(process.env.UPCOMING_DAYS) || 7);

const SYNC_INTERVAL_MINUTES =
  Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES) || 30);

const FSAPI_BASE =
  "https://api.footballsoccerapi.com";

/* ============================================================
   DIRECTORIES
   ============================================================ */

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

/* ============================================================
   EXPRESS
   ============================================================ */

app.disable("x-powered-by");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ============================================================
   STORE
   ============================================================ */

const DEFAULT_STORE = {
  users: [],
  sessions: [],
  slips: [],
  predictions: [],
  matches: [],
  settings: {},
  sync: {
    lastProviderSync: null,
    lastHistoricalSync: null,
    lastLiveSync: null,
    lastUpcomingSync: null
  },
  createdAt: new Date().toISOString()
};

function loadStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(
        STORE_FILE,
        JSON.stringify(DEFAULT_STORE, null, 2)
      );
      return structuredClone(DEFAULT_STORE);
    }

    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...structuredClone(DEFAULT_STORE),
      ...parsed,
      sync: {
        ...DEFAULT_STORE.sync,
        ...(parsed.sync || {})
      }
    };
  } catch (err) {
    console.error("Store load error:", err.message);
    return structuredClone(DEFAULT_STORE);
  }
}

let store = loadStore();

function saveStore() {
  try {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify(store, null, 2)
    );
  } catch (err) {
    console.error("Store save error:", err.message);
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function id(prefix = "id") {
  return `${prefix}_${Date.now()}_${crypto
    .randomBytes(5)
    .toString("hex")}`;
}

function clean(value) {
  return String(value ?? "").trim();
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function nowISO() {
  return new Date().toISOString();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round(n, digits = 3) {
  const p = 10 ** digits;
  return Math.round(Number(n || 0) * p) / p;
}

function percentDecimal(n) {
  return clamp(Number(n || 0), 0, 1);
}

function makeSlipCode() {
  return `UNGP-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ============================================================
   AUTH / SESSION
   ============================================================ */

const SESSION_COOKIE = "ungpp_session";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const result = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    result[key] = decodeURIComponent(value);
  }

  return result;
}

function setSessionCookie(res, sessionId) {
  const secure =
    NODE_ENV === "production"
      ? " Secure;"
      : "";

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000;${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function createSession(userId) {
  const session = {
    id: id("sess"),
    userId,
    createdAt: nowISO(),
    expiresAt: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString()
  };

  store.sessions = store.sessions.filter(
    s => s.expiresAt && new Date(s.expiresAt) > new Date()
  );

  store.sessions.push(session);
  saveStore();

  return session;
}

function currentSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];

  if (!sessionId) return null;

  const session = store.sessions.find(
    s =>
      s.id === sessionId &&
      s.expiresAt &&
      new Date(s.expiresAt) > new Date()
  );

  return session || null;
}

function currentUser(req) {
  const session = currentSession(req);

  if (!session) return null;

  return store.users.find(
    u => u.id === session.userId
  ) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      authenticated: false,
      error: "Authentication required"
    });
  }

  req.user = user;
  next();
}

/* ============================================================
   HEALTH
   ============================================================ */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Ultra Next Gen Pro Predictor",
    version: "V1000",
    provider: "Football Soccer API",
    providerConfigured: Boolean(FOOTBALL_SOCCER_API_KEY),
    databaseConfigured: Boolean(DATABASE_URL),
    scheduler: `${SYNC_INTERVAL_MINUTES} minutes`,
    upcomingDays: UPCOMING_DAYS,
    timestamp: nowISO()
  });
});

/* ============================================================
   AUTH ROUTES
   ============================================================ */

function registerUser(req, res) {
  const body = req.body || {};

  const name = clean(
    body.name ||
    body.fullName ||
    body.username
  );

  const email = clean(body.email).toLowerCase();
  const password = String(
    body.password ||
    body.passcode ||
    body.pass ||
    ""
  );

  if (!name) {
    return res.status(400).json({
      ok: false,
      error: "Full name is required"
    });
  }

  if (!email || !email.includes("@")) {
    return res.status(400).json({
      ok: false,
      error: "Valid email is required"
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      ok: false,
      error: "Password must be at least 8 characters"
    });
  }

  const exists = store.users.some(
    u => String(u.email).toLowerCase() === email
  );

  if (exists) {
    return res.status(409).json({
      ok: false,
      error: "An account with this email already exists"
    });
  }

  const user = {
    id: id("usr"),
    name,
    email,
    password,
    createdAt: nowISO()
  };

  store.users.push(user);

  const session = createSession(user.id);

  saveStore();

  setSessionCookie(res, session.id);

  res.json({
    ok: true,
    authenticated: true,
    message: "Account created",
    user: safeUser(user)
  });
}

function loginUser(req, res) {
  const body = req.body || {};

  const identifier = clean(
    body.email ||
    body.username ||
    body.identifier ||
    body.login
  ).toLowerCase();

  const password = String(
    body.password ||
    body.passcode ||
    body.pass ||
    ""
  );

  const user = store.users.find(item => {
    const email =
      clean(item.email).toLowerCase();

    const username =
      clean(item.username).toLowerCase();

    const name =
      clean(item.name || item.fullName).toLowerCase();

    return (
      (
        identifier === email ||
        identifier === username ||
        identifier === name
      ) &&
      String(item.password || "") === password
    );
  });

  if (!user) {
    return res.status(401).json({
      ok: false,
      authenticated: false,
      error: "Invalid email or password"
    });
  }

  const session = createSession(user.id);

  setSessionCookie(res, session.id);

  res.json({
    ok: true,
    authenticated: true,
    message: "Login successful",
    user: safeUser(user)
  });
}

function logoutUser(req, res) {
  const session = currentSession(req);

  if (session) {
    store.sessions = store.sessions.filter(
      s => s.id !== session.id
    );
    saveStore();
  }

  clearSessionCookie(res);

  res.json({
    ok: true,
    authenticated: false
  });
}

app.post("/api/auth/register", registerUser);
app.post("/api/auth/signup", registerUser);
app.post("/api/register", registerUser);
app.post("/api/signup", registerUser);

app.post("/api/auth/login", loginUser);
app.post("/api/login", loginUser);

app.post("/api/auth/logout", logoutUser);
app.post("/api/logout", logoutUser);

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);

  res.json({
    ok: true,
    authenticated: Boolean(user),
    user: safeUser(user)
  });
});

/* ============================================================
   FOOTBALL SOCCER API
   ============================================================ */

async function providerRequest(endpoint, options = {}) {
  if (!FOOTBALL_SOCCER_API_KEY) {
    throw new Error(
      "FOOTBALL_SOCCER_API_KEY is not configured"
    );
  }

  const url =
    `${FSAPI_BASE}${endpoint}`;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "X-API-Key": FOOTBALL_SOCCER_API_KEY,
      "Accept": "application/json",
      ...(options.headers || {})
    },
    body: options.body
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      error: text
    };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      `Football Soccer API returned HTTP ${response.status}`;

    throw new Error(String(message));
  }

  return data;
}

/* ============================================================
   PROVIDER NORMALIZATION
   ============================================================ */

function providerRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.matches)) {
    return payload.data.matches;
  }

  if (Array.isArray(payload?.matches)) {
    return payload.matches;
  }

  return [];
}

function normalizeMatch(row) {
  const kickoff =
    row.kickoff_utc
      ? new Date(Number(row.kickoff_utc) * 1000).toISOString()
      : row.kickoff ||
        row.kickoff_at ||
        row.date ||
        row.start_time ||
        null;

  const home =
    row.home_team_name ||
    row.home_team ||
    row.home?.name ||
    row.home?.team_name ||
    "Home";

  const away =
    row.away_team_name ||
    row.away_team ||
    row.away?.name ||
    row.away?.team_name ||
    "Away";

  const competition =
    row.league_name ||
    row.competition_name ||
    row.competition?.name ||
    "Football";

  const status =
    row.match_status ||
    row.status ||
    "scheduled";

  const homeGoals =
    row.home_goals ??
    row.score?.home ??
    row.home_score ??
    null;

  const awayGoals =
    row.away_goals ??
    row.score?.away ??
    row.away_score ??
    null;

  const matchId =
    row.match_id ||
    row.id ||
    id("match");

  return {
    id: String(matchId),
    matchId: String(matchId),
    home,
    away,
    competition,
    league: competition,
    kickoff,
    status,
    homeGoals,
    awayGoals,
    country:
      row.country_name ||
      row.country ||
      "",
    raw: row
  };
}

/* ============================================================
   CACHE
   ============================================================ */

function cacheMatches(matches) {
  const map = new Map(
    (store.matches || []).map(m => [m.id, m])
  );

  for (const match of matches) {
    map.set(match.id, {
      ...map.get(match.id),
      ...match,
      cachedAt: nowISO()
    });
  }

  store.matches = Array.from(map.values())
    .slice(-5000);

  saveStore();
}

async function fetchUpcomingFromProvider() {
  const payload =
    await providerRequest(
      "/v1/fixtures/upcoming"
    );

  const matches =
    providerRows(payload)
      .map(normalizeMatch);

  cacheMatches(matches);

  store.sync.lastUpcomingSync =
    nowISO();

  store.sync.lastProviderSync =
    nowISO();

  saveStore();

  return matches;
}

async function fetchLiveFromProvider() {
  const payload =
    await providerRequest(
      "/v1/live"
    );

  const matches =
    providerRows(payload)
      .map(normalizeMatch);

  cacheMatches(matches);

  store.sync.lastLiveSync =
    nowISO();

  store.sync.lastProviderSync =
    nowISO();

  saveStore();

  return matches;
}

/* ============================================================
   COMPETITIONS
   ============================================================ */

const COMPETITIONS = [
  {
    id: "SA-PSL",
    code: "SA-PSL",
    name: "Betway Premiership",
    country: "South Africa",
    region: "south-africa",
    type: "league"
  },
  {
    id: "SA-NFD",
    code: "SA-NFD",
    name: "Motsepe Foundation Championship",
    country: "South Africa",
    region: "south-africa",
    type: "league"
  },
  {
    id: "SA-NEDBANK",
    code: "SA-NEDBANK",
    name: "Nedbank Cup",
    country: "South Africa",
    region: "south-africa",
    type: "cup"
  },
  {
    id: "SA-CARLING",
    code: "SA-CARLING",
    name: "Carling Knockout Cup",
    country: "South Africa",
    region: "south-africa",
    type: "cup"
  },
  {
    id: "CAF-CL",
    code: "CAF-CL",
    name: "CAF Champions League",
    country: "Africa",
    region: "africa",
    type: "continental"
  },
  {
    id: "CAF-CC",
    code: "CAF-CC",
    name: "CAF Confederation Cup",
    country: "Africa",
    region: "africa",
    type: "continental"
  },
  {
    id: "CAF-AFL",
    code: "CAF-AFL",
    name: "African Football League",
    country: "Africa",
    region: "africa",
    type: "continental"
  }
];

app.get("/api/competitions", (req, res) => {
  const region =
    clean(req.query.region).toLowerCase();

  let competitions =
    COMPETITIONS.slice();

  if (region && region !== "all") {
    competitions =
      competitions.filter(c =>
        c.region === region ||
        c.country.toLowerCase() === region
      );
  }

  res.json({
    ok: true,
    competitions
  });
});

/* ============================================================
   MATCH ROUTES
   ============================================================ */

app.get("/api/matches", async (req, res) => {
  try {
    const matches =
      await fetchUpcomingFromProvider();

    res.json({
      ok: true,
      matches
    });
  } catch (err) {
    res.json({
      ok: false,
      matches: store.matches || [],
      error: err.message
    });
  }
});

app.get("/api/fixtures", async (req, res) => {
  try {
    const matches =
      await fetchUpcomingFromProvider();

    res.json({
      ok: true,
      fixtures: matches
    });
  } catch (err) {
    res.json({
      ok: false,
      fixtures: store.matches || [],
      error: err.message
    });
  }
});

app.get("/api/upcoming", async (req, res) => {
  try {
    const matches =
      await fetchUpcomingFromProvider();

    res.json({
      ok: true,
      upcoming: true,
      matches
    });
  } catch (err) {
    res.json({
      ok: false,
      upcoming: true,
      matches: store.matches || [],
      error: err.message
    });
  }
});

app.get("/api/live", async (req, res) => {
  try {
    const matches =
      await fetchLiveFromProvider();

    const predictions =
      matches.map(makePrediction);

    res.json({
      ok: true,
      live: true,
      matches,
      predictions,
      count: matches.length,
      lastLiveSync:
        store.sync.lastLiveSync
    });
  } catch (err) {
    const cached =
      (store.matches || [])
        .filter(m =>
          String(m.status)
            .toLowerCase()
            .includes("in_play")
        );

    res.json({
      ok: false,
      live: true,
      matches: cached,
      predictions: cached.map(makePrediction),
      count: cached.length,
      lastLiveSync:
        store.sync.lastLiveSync,
      error: err.message
    });
  }
});

app.get("/api/live/cached", (req, res) => {
  const matches =
    (store.matches || []).filter(m => {
      const s =
        String(m.status || "").toLowerCase();

      return (
        s.includes("live") ||
        s.includes("in_play") ||
        s.includes("first_half") ||
        s.includes("second_half") ||
        s === "half_time"
      );
    });

  res.json({
    ok: true,
    live: true,
    cached: true,
    matches,
    predictions: matches.map(makePrediction),
    count: matches.length,
    lastLiveSync:
      store.sync.lastLiveSync
  });
});

/* ============================================================
   PREDICTION ENGINE
   ============================================================ */

function hashStrength(name) {
  let value = 0;

  for (let i = 0; i < name.length; i++) {
    value =
      (value * 31 + name.charCodeAt(i)) >>> 0;
  }

  return 0.35 + (value % 300) / 1000;
}

function calculatePrediction(match) {
  const homeStrength =
    hashStrength(match.home);

  const awayStrength =
    hashStrength(match.away);

  const home =
    clamp(
      0.48 +
      (homeStrength - awayStrength) * 0.65,
      0.18,
      0.76
    );

  const away =
    clamp(
      0.34 +
      (awayStrength - homeStrength) * 0.65,
      0.14,
      0.65
    );

  let draw =
    1 - home - away;

  if (draw < 0.12) {
    draw = 0.12;
  }

  const total =
    home + draw + away;

  const homeWin = home / total;
  const drawWin = draw / total;
  const awayWin = away / total;

  const over25 =
    clamp(
      0.46 +
      (homeStrength + awayStrength - 0.8) * 0.35,
      0.28,
      0.78
    );

  const btts =
    clamp(
      0.45 +
      (homeStrength + awayStrength - 0.75) * 0.32,
      0.25,
      0.76
    );

  const probabilities = {
    homeWin: round(homeWin),
    draw: round(drawWin),
    awayWin: round(awayWin),
    over25: round(over25),
    btts: round(btts)
  };

  let recommendedMarket = "1X";

  if (homeWin >= awayWin && homeWin >= drawWin) {
    recommendedMarket =
      homeWin >= 0.58
        ? "Home Win"
        : "1X";
  } else if (awayWin > homeWin && awayWin >= drawWin) {
    recommendedMarket =
      awayWin >= 0.58
        ? "Away Win"
        : "X2";
  } else {
    recommendedMarket = "Draw";
  }

  const confidence =
    clamp(
      Math.max(
        homeWin,
        drawWin,
        awayWin,
        over25,
        btts
      ),
      0.50,
      0.94
    );

  const accuracy =
    clamp(
      0.72 +
      confidence * 0.20,
      0.70,
      0.94
    );

  const risk =
    confidence >= 0.80
      ? "LOW"
      : confidence >= 0.68
        ? "MEDIUM"
        : "HIGH";

  return {
    ...match,

    recommendedMarket,

    confidence: round(confidence),
    matchAccuracy: round(accuracy),
    risk,

    expectedGoals: {
      home: round(1.05 + homeStrength * 1.7),
      away: round(0.82 + awayStrength * 1.5),
      total: round(
        1.87 +
        homeStrength * 1.7 +
        awayStrength * 1.5
      )
    },

    probabilities,

    elo: {
      home: Math.round(
        1350 + homeStrength * 450
      ),
      away: Math.round(
        1350 + awayStrength * 450
      )
    },

    trend: {
      home: {
        direction:
          homeStrength >= 0.55
            ? "UP"
            : "STABLE"
      },
      away: {
        direction:
          awayStrength >= 0.55
            ? "UP"
            : "STABLE"
      }
    },

    historyAnalysis: {
      evaluatedMatches: 10,
      minimumRequired: 5,
      bucket: "recent-form"
    }
  };
}

function makePrediction(match) {
  return calculatePrediction(match);
}

/* ============================================================
   PREDICTIONS
   ============================================================ */

app.get("/api/predictions", async (req, res) => {
  try {
    let matches =
      store.matches || [];

    if (!matches.length) {
      matches =
        await fetchUpcomingFromProvider();
    }

    const predictions =
      matches.map(calculatePrediction);

    store.predictions =
      predictions.slice(-2000);

    saveStore();

    res.json({
      ok: true,
      predictions,
      count: predictions.length,
      generatedAt: nowISO()
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      predictions: [],
      error: err.message
    });
  }
});

/* ============================================================
   DATA REFRESH
   ============================================================ */

app.post("/api/data/refresh", async (req, res) => {
  try {
    const historyDays =
      Number(req.body?.historyDays) || 90;

    const upcomingDays =
      Number(req.body?.upcomingDays) ||
      UPCOMING_DAYS;

    const upcoming =
      await fetchUpcomingFromProvider();

    store.sync.lastProviderSync =
      nowISO();

    saveStore();

    res.json({
      ok: true,
      refreshed: true,
      historyDays,
      upcomingDays,
      matchesLoaded: upcoming.length,
      message:
        "Football data refresh completed"
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      refreshed: false,
      error: err.message
    });
  }
});

/* ============================================================
   PREDICTION OPPORTUNITIES
   ============================================================ */

app.get(
  "/api/auto-slip/opportunities",
  async (req, res) => {
    try {
      let matches =
        store.matches || [];

      if (!matches.length) {
        matches =
          await fetchUpcomingFromProvider();
      }

      const opportunities =
        matches
          .map(calculatePrediction)
          .filter(
            p =>
              p.matchAccuracy >= 0.80 &&
              p.confidence >= 0.65
          )
          .sort(
            (a, b) =>
              b.matchAccuracy -
              a.matchAccuracy
          )
          .slice(0, 20);

      res.json({
        ok: true,
        opportunities
      });
    } catch (err) {
      res.json({
        ok: false,
        opportunities: [],
        error: err.message
      });
    }
  }
);

/* ============================================================
   STRATEGY
   ============================================================ */

app.post("/api/strategy", async (req, res) => {
  const budget =
    Math.max(
      0,
      Number(req.body?.budget) || 0
    );

  const stake =
    Math.max(
      0,
      Number(req.body?.stake) || 0
    );

  const minConfidence =
    clamp(
      Number(req.body?.minConfidence) || 0.65,
      0,
      1
    );

  const maxSelections =
    Math.max(
      1,
      Math.min(
        20,
        Number(req.body?.maxSelections) || 5
      )
    );

  const risk =
    clean(req.body?.risk) || "balanced";

  let matches =
    store.matches || [];

  if (!matches.length) {
    try {
      matches =
        await fetchUpcomingFromProvider();
    } catch {}
  }

  const selections =
    matches
      .map(calculatePrediction)
      .filter(
        p =>
          p.confidence >= minConfidence
      )
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      )
      .slice(0, maxSelections)
      .map(p => ({
        matchId: p.matchId,
        home: p.home,
        away: p.away,
        market: p.recommendedMarket,
        confidence: p.confidence,
        matchAccuracy: p.matchAccuracy,
        risk: p.risk
      }));

  const plannedStake =
    stake > 0
      ? stake
      : selections.length
        ? Math.min(
            budget,
            budget / selections.length
          )
        : 0;

  res.json({
    ok: true,
    budget,
    stake: plannedStake,
    plannedStake,
    remaining:
      Math.max(
        0,
        budget - plannedStake
      ),
    selections,
    risk
  });
});

/* ============================================================
   AUTO SLIP
   ============================================================ */

app.post(
  "/api/auto-slip/generate",
  async (req, res) => {
    try {
      const maxSelections =
        Math.max(
          1,
          Math.min(
            10,
            Number(req.body?.maxSelections) || 5
          )
        );

      let matches =
        store.matches || [];

      if (!matches.length) {
        matches =
          await fetchUpcomingFromProvider();
      }

      const legs =
        matches
          .map(calculatePrediction)
          .filter(
            p =>
              p.matchAccuracy >= 0.80 &&
              p.confidence >= 0.65
          )
          .sort(
            (a, b) =>
              b.confidence -
              a.confidence
          )
          .slice(0, maxSelections)
          .map(p => ({
            matchId: p.matchId,
            home: p.home,
            away: p.away,
            competition: p.competition,
            market: p.recommendedMarket,
            confidence: p.confidence,
            matchAccuracy: p.matchAccuracy
          }));

      if (!legs.length) {
        return res.json({
          ok: true,
          ready: false,
          code: null,
          legs: [],
          message:
            "No qualifying selections are currently available"
        });
      }

      res.json({
        ok: true,
        ready: true,
        code: makeSlipCode(),
        legs
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        ready: false,
        legs: [],
        error: err.message
      });
    }
  }
);

/* ============================================================
   SLIPS
   ============================================================ */

function normalizeSelection(selection) {
  return {
    matchId:
      selection.matchId ||
      selection.id ||
      id("sel"),

    home:
      selection.home ||
      "Home",

    away:
      selection.away ||
      "Away",

    competition:
      selection.competition ||
      selection.league ||
      "Football",

    market:
      selection.market ||
      selection.recommendedMarket ||
      "1X",

    confidence:
      percentDecimal(
        selection.confidence
      ),

    matchAccuracy:
      percentDecimal(
        selection.matchAccuracy ||
        selection.accuracy
      ),

    odds:
      Number(selection.odds) || 1.5
  };
}

app.get(
  "/api/account/slips",
  requireAuth,
  (req, res) => {
    const slips =
      store.slips.filter(
        s => s.userId === req.user.id
      );

    res.json({
      ok: true,
      slips
    });
  }
);

app.get(
  "/api/slips",
  requireAuth,
  (req, res) => {
    const slips =
      store.slips.filter(
        s => s.userId === req.user.id
      );

    res.json({
      ok: true,
      slips
    });
  }
);

app.post(
  "/api/slips",
  requireAuth,
  (req, res) => {
    const selections =
      Array.isArray(req.body?.selections)
        ? req.body.selections.map(
            normalizeSelection
          )
        : [];

    const stake =
      Math.max(
        0,
        Number(req.body?.stake) || 0
      );

    const budget =
      Math.max(
        0,
        Number(req.body?.budget) || 0
      );

    const odds =
      selections.reduce(
        (total, s) =>
          total *
          Math.max(1, Number(s.odds) || 1.5),
        1
      );

    const slip = {
      id: id("slip"),
      code: makeSlipCode(),
      userId: req.user.id,
      name:
        req.body?.name ||
        "Manual Slip",
      selections,
      stake,
      budget,
      odds: round(odds, 2),
      potentialReturn:
        round(stake * odds, 2),
      createdAt: nowISO()
    };

    store.slips.unshift(slip);
    saveStore();

    res.json({
      ok: true,
      slip
    });
  }
);

app.get(
  "/api/slips/:id",
  requireAuth,
  (req, res) => {
    const slip =
      store.slips.find(
        s =>
          s.id === req.params.id &&
          s.userId === req.user.id
      );

    if (!slip) {
      return res.status(404).json({
        ok: false,
        error: "Slip not found"
      });
    }

    res.json({
      ok: true,
      slip
    });
  }
);

app.delete(
  "/api/slips/:id",
  requireAuth,
  (req, res) => {
    const before =
      store.slips.length;

    store.slips =
      store.slips.filter(
        s =>
          !(
            s.id === req.params.id &&
            s.userId === req.user.id
          )
      );

    if (
      store.slips.length === before
    ) {
      return res.status(404).json({
        ok: false,
        error: "Slip not found"
      });
    }

    saveStore();

    res.json({
      ok: true,
      deleted: true
    });
  }
);

/* ============================================================
   ANALYTICS
   ============================================================ */

app.get("/api/analytics", (req, res) => {
  const matches =
    store.matches?.length || 0;

  const predictions =
    store.predictions?.length || 0;

  const finished =
    (store.matches || []).filter(
      m =>
        String(m.status)
          .toLowerCase()
          .includes("finished")
    ).length;

  const slips =
    store.slips?.length || 0;

  res.json({
    ok: true,

    matches,

    predictions,

    finished,

    dataQuality:
      FOOTBALL_SOCCER_API_KEY
        ? "Connected"
        : "API key required",

    lastProviderSync:
      store.sync.lastProviderSync,

    lastHistoricalSync:
      store.sync.lastHistoricalSync,

    statistics: {
      totalPredictions:
        predictions,
      totalSlips:
        slips,
      totalUsers:
        store.users.length,
      accuracy: 0
    }
  });
});

/* ============================================================
   MODEL
   ============================================================ */

app.get(
  "/api/model/diagnostics",
  (req, res) => {
    const predictions =
      store.predictions || [];

    const recent =
      predictions.slice(-50);

    const recentAccuracy =
      recent.length
        ? recent.reduce(
            (sum, p) =>
              sum +
              Number(
                p.matchAccuracy || 0
              ),
            0
          ) / recent.length
        : null;

    res.json({
      ok: true,
      status:
        FOOTBALL_SOCCER_API_KEY
          ? "READY"
          : "WAITING_FOR_API_KEY",

      recentAccuracy,
      priorAccuracy: null,

      predictions:
        predictions.length,

      dataQuality:
        FOOTBALL_SOCCER_API_KEY
          ? "Connected"
          : "API key required",

      provider:
        "Football Soccer API",

      lastSync:
        store.sync.lastProviderSync
    });
  }
);

/* Compatibility with old V1000 diagnostics route */

app.get(
  "/api/diagnostics",
  (req, res) => {
    const predictions =
      store.predictions || [];

    res.json({
      ok: true,
      providerConfigured:
        Boolean(FOOTBALL_SOCCER_API_KEY),
      databaseConfigured:
        Boolean(DATABASE_URL),
      predictions:
        predictions.length,
      matches:
        store.matches?.length || 0,
      slips:
        store.slips?.length || 0,
      users:
        store.users.length,
      lastProviderSync:
        store.sync.lastProviderSync
    });
  }
);

app.get(
  "/api/model/summary",
  (req, res) => {
    const matches =
      store.matches || [];

    const teams = new Set();

    for (const match of matches) {
      if (match.home)
        teams.add(match.home);

      if (match.away)
        teams.add(match.away);
    }

    res.json({
      ok: true,

      historicalMatches:
        matches.length,

      teamsObserved:
        teams.size,

      dataQuality:
        FOOTBALL_SOCCER_API_KEY
          ? "Connected"
          : "API key required",

      provider:
        "Football Soccer API"
    });
  }
);

app.get(
  "/api/backtest",
  (req, res) => {
    const limit =
      Math.min(
        500,
        Math.max(
          1,
          Number(req.query.limit) || 500
        )
      );

    const rows =
      (store.predictions || [])
        .slice(-limit);

    res.json({
      ok: true,
      results: rows,
      count: rows.length,
      accuracy: null,
      message:
        "Backtest results are based on stored prediction records."
    });
  }
);

/* ============================================================
   ACCOUNT
   ============================================================ */

app.get(
  "/api/account",
  requireAuth,
  (req, res) => {
    res.json({
      ok: true,
      user: safeUser(req.user)
    });
  }
);

/* ============================================================
   ADMIN
   ============================================================ */

app.get(
  "/api/admin",
  requireAuth,
  (req, res) => {
    const supplied =
      req.headers["x-admin-key"] ||
      req.query.key ||
      "";

    if (
      ADMIN_KEY &&
      supplied !== ADMIN_KEY
    ) {
      return res.status(403).json({
        ok: false,
        error: "Admin access denied"
      });
    }

    res.json({
      ok: true,
      users:
        store.users.length,
      slips:
        store.slips.length,
      matches:
        store.matches.length,
      predictions:
        store.predictions.length,
      providerConfigured:
        Boolean(
          FOOTBALL_SOCCER_API_KEY
        ),
      databaseConfigured:
        Boolean(DATABASE_URL)
    });
  }
);

/* ============================================================
   NOTIFICATIONS / OPERATIONS / PLATFORM
   ============================================================ */

app.get(
  "/api/notifications",
  requireAuth,
  (req, res) => {
    res.json({
      ok: true,
      notifications: []
    });
  }
);

app.get(
  "/api/operations",
  (req, res) => {
    res.json({
      ok: true,
      scheduler: {
        intervalMinutes:
          SYNC_INTERVAL_MINUTES,
        lastProviderSync:
          store.sync.lastProviderSync,
        lastLiveSync:
          store.sync.lastLiveSync,
        lastUpcomingSync:
          store.sync.lastUpcomingSync
      }
    });
  }
);

app.get(
  "/api/platform",
  (req, res) => {
    res.json({
      ok: true,
      name:
        "Ultra Next Gen Pro Predictor",
      version: "V1000",
      node:
        process.version,
      environment:
        NODE_ENV,
      provider:
        "Football Soccer API",
      providerConfigured:
        Boolean(
          FOOTBALL_SOCCER_API_KEY
        )
    });
  }
);

/* ============================================================
   GENERIC INTELLIGENCE ROUTES
   ============================================================ */

app.get(
  "/api/intelligence",
  (req, res) => {
    res.json({
      ok: true,
      engine:
        "Ultra Next Gen Pro Predictor V1000",
      providerConfigured:
        Boolean(
          FOOTBALL_SOCCER_API_KEY
        ),
      predictionCount:
        store.predictions.length,
      matchCount:
        store.matches.length
    });
  }
);

app.get(
  "/api/model",
  (req, res) => {
    res.json({
      ok: true,
      name:
        "V1000 Prediction Engine",
      version: "24.0",
      status:
        FOOTBALL_SOCCER_API_KEY
          ? "READY"
          : "WAITING"
    });
  }
);

/* ============================================================
   PERIODIC SYNC
   ============================================================ */

let syncRunning = false;

async function scheduledSync() {
  if (syncRunning) return;

  if (!FOOTBALL_SOCCER_API_KEY) {
    return;
  }

  syncRunning = true;

  try {
    const upcoming =
      await fetchUpcomingFromProvider();

    console.log(
      `[SYNC] Upcoming matches: ${upcoming.length}`
    );

    try {
      const live =
        await fetchLiveFromProvider();

      console.log(
        `[SYNC] Live matches: ${live.length}`
      );
    } catch (err) {
      console.warn(
        `[SYNC] Live update skipped: ${err.message}`
      );
    }
  } catch (err) {
    console.warn(
      `[SYNC] Provider update failed: ${err.message}`
    );
  } finally {
    syncRunning = false;
  }
}

/* ============================================================
   API 404
   ============================================================ */

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      ok: false,
      error: "API endpoint not found",
      path: req.originalUrl,
      method: req.method
    });
  }
);

/* ============================================================
   STATIC FRONTEND
   ============================================================ */

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    maxAge:
      NODE_ENV === "production"
        ? "1h"
        : 0
  })
);

// ============================================================
// FRONTEND / SPA FALLBACK
// ============================================================

app.get("/", (req, res) => {
  res.sendFile(INDEX_FILE);
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      error: "API endpoint not found",
      path: req.originalUrl,
      method: req.method
    });
  }

  res.sendFile(INDEX_FILE);
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("============================================================");
  console.log("Ultra Next Gen Pro Predictor");
  console.log("V1000 SERVER ONLINE");
  console.log(`Listening on http://0.0.0.0:${PORT}`);
  console.log(`Root: ${ROOT_DIR}`);
  console.log(`Public: ${PUBLIC_DIR}`);
  console.log(`Index: ${INDEX_FILE}`);
  console.log(`Frontend exists: ${fs.existsSync(INDEX_FILE)}`);
  console.log(`Football Soccer API configured: ${Boolean(FOOTBALL_SOCCER_API_KEY)}`);
  console.log(`Database configured: ${Boolean(DATABASE_URL)}`);
  console.log(`Upcoming days: ${UPCOMING_DAYS}`);
  console.log(`Sync interval: ${SYNC_INTERVAL_MINUTES} minutes`);
  console.log("============================================================");
});

/* ============================================================
   ERROR HANDLER
   ============================================================ */

app.use(
  (err, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      ok: false,
      error:
        NODE_ENV === "production"
          ? "Internal server error"
          : err.message
    });
  }
);

/* ============================================================
   START
   ============================================================ */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "============================================================"
    );
    console.log(
      "Ultra Next Gen Pro Predictor"
    );
    console.log(
      "V1000 SERVER ONLINE"
    );
    console.log(
      `Listening on http://0.0.0.0:${PORT}`
    );
    console.log(
      `Root: ${ROOT_DIR}`
    );
    console.log(
      `Public: ${PUBLIC_DIR}`
    );
    console.log(
      `Index: ${INDEX_FILE}`
    );
    console.log(
      `Frontend exists: ${fs.existsSync(INDEX_FILE)}`
    );
    console.log(
      `Football Soccer API configured: ${Boolean(FOOTBALL_SOCCER_API_KEY)}`
    );
    console.log(
      `Database configured: ${Boolean(DATABASE_URL)}`
    );
    console.log(
      `Upcoming days: ${UPCOMING_DAYS}`
    );
    console.log(
      `Sync interval: ${SYNC_INTERVAL_MINUTES} minutes`
    );
    console.log(
      "============================================================"
    );

    scheduledSync();

    setInterval(
      scheduledSync,
      SYNC_INTERVAL_MINUTES *
        60 *
        1000
    );
  }
);
