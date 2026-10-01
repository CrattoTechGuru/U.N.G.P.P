"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

// ============================================================
// ULTRA NEXT GEN PRO PREDICTOR
// V1000 SERVER
// ============================================================

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");
const STORE_FILE = path.join(DATA_DIR, "store.json");

// ============================================================
// ENVIRONMENT
// ============================================================

const NODE_ENV =
  process.env.NODE_ENV || "production";

const FOOTBALL_SOCCER_API_KEY =
  process.env.FOOTBALL_SOCCER_API_KEY || "";

const FOOTBALL_DATA_API_KEY =
  process.env.FOOTBALL_DATA_API_KEY || "";

const API_FOOTBALL_KEY =
  process.env.API_FOOTBALL_KEY || "";

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";

const UPCOMING_DAYS =
  Number(process.env.UPCOMING_DAYS) || 7;

const SYNC_INTERVAL_MINUTES =
  Number(
    process.env.SYNC_INTERVAL_MINUTES
  ) || 30;

// ============================================================
// DIRECTORIES
// ============================================================

function ensureDirectory(directory) {
  try {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {
        recursive: true
      });
    }
  } catch (error) {
    console.error(
      `Failed to create directory ${directory}:`,
      error.message
    );
  }
}

ensureDirectory(DATA_DIR);

// ============================================================
// LOCAL STORE
// ============================================================

function defaultStore() {
  return {
    users: [],
    sessions: [],
    slips: [],
    predictions: [],
    settings: {},
    createdAt:
      new Date().toISOString()
  };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      const initial =
        defaultStore();

      fs.writeFileSync(
        STORE_FILE,
        JSON.stringify(
          initial,
          null,
          2
        ),
        "utf8"
      );

      return initial;
    }

    const raw =
      fs.readFileSync(
        STORE_FILE,
        "utf8"
      );

    if (!raw.trim()) {
      return defaultStore();
    }

    const parsed =
      JSON.parse(raw);

    return {
      ...defaultStore(),
      ...parsed,

      users:
        Array.isArray(
          parsed.users
        )
          ? parsed.users
          : [],

      sessions:
        Array.isArray(
          parsed.sessions
        )
          ? parsed.sessions
          : [],

      slips:
        Array.isArray(
          parsed.slips
        )
          ? parsed.slips
          : [],

      predictions:
        Array.isArray(
          parsed.predictions
        )
          ? parsed.predictions
          : [],

      settings:
        parsed.settings &&
        typeof parsed.settings ===
          "object"
          ? parsed.settings
          : {}
    };
  } catch (error) {
    console.error(
      "Store read error:",
      error.message
    );

    return defaultStore();
  }
}

function writeStore(data) {
  try {
    ensureDirectory(DATA_DIR);

    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify(
        data,
        null,
        2
      ),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error(
      "Store write error:",
      error.message
    );

    return false;
  }
}

// ============================================================
// COOKIE HELPERS
// ============================================================

function parseCookies(req) {
  const header =
    req.headers.cookie || "";

  const cookies = {};

  if (!header) {
    return cookies;
  }

  header
    .split(";")
    .forEach(pair => {
      const index =
        pair.indexOf("=");

      if (index === -1) {
        return;
      }

      const key =
        pair
          .slice(0, index)
          .trim();

      const value =
        pair
          .slice(index + 1)
          .trim();

      if (key) {
        cookies[key] =
          decodeURIComponent(
            value
          );
      }
    });

  return cookies;
}

function setSessionCookie(
  res,
  sessionId
) {
  const parts = [
    `ungpp_session=${encodeURIComponent(
      sessionId
    )}`,

    "Path=/",

    "HttpOnly",

    "SameSite=Lax"
  ];

  if (
    NODE_ENV ===
    "production"
  ) {
    parts.push("Secure");
  }

  res.setHeader(
    "Set-Cookie",
    parts.join("; ")
  );
}

function clearSessionCookie(res) {
  const parts = [
    "ungpp_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (
    NODE_ENV ===
    "production"
  ) {
    parts.push("Secure");
  }

  res.setHeader(
    "Set-Cookie",
    parts.join("; ")
  );
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

const SESSION_DURATION =
  1000 * 60 * 60 * 24 * 30;

function createSession(userId) {
  const store =
    readStore();

  if (
    !Array.isArray(
      store.sessions
    )
  ) {
    store.sessions = [];
  }

  const sessionId =
    crypto.randomBytes(32)
      .toString("hex");

  const session = {
    id: sessionId,

    userId,

    createdAt:
      new Date().toISOString(),

    expiresAt:
      new Date(
        Date.now() +
          SESSION_DURATION
      ).toISOString()
  };

  store.sessions.push(
    session
  );

  // Remove expired sessions.
  const now =
    Date.now();

  store.sessions =
    store.sessions.filter(
      item =>
        new Date(
          item.expiresAt
        ).getTime() > now
    );

  if (!writeStore(store)) {
    return null;
  }

  return session;
}

function getCurrentSession(req) {
  const cookies =
    parseCookies(req);

  const sessionId =
    cookies.ungpp_session;

  if (!sessionId) {
    return null;
  }

  const store =
    readStore();

  const session =
    (
      store.sessions || []
    ).find(
      item =>
        item.id ===
        sessionId
    );

  if (!session) {
    return null;
  }

  if (
    new Date(
      session.expiresAt
    ).getTime() <=
    Date.now()
  ) {
    return null;
  }

  return session;
}

function getCurrentUser(req) {
  const session =
    getCurrentSession(req);

  if (!session) {
    return null;
  }

  const store =
    readStore();

  return (
    store.users || []
  ).find(
    user =>
      user.id ===
      session.userId
  ) || null;
}

// ============================================================
// SAFE USER
// ============================================================

function safeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id:
      user.id,

    fullName:
      user.fullName ||
      user.name ||
      user.username ||
      "",

    name:
      user.fullName ||
      user.name ||
      user.username ||
      "",

    username:
      user.username ||
      null,

    email:
      user.email ||
      "",

    createdAt:
      user.createdAt ||
      null
  };
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable(
  "x-powered-by"
);

app.use(
  express.json({
    limit: "5mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb"
  })
);

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use(
  (req, res, next) => {
    const started =
      Date.now();

    res.on(
      "finish",
      () => {
        const elapsed =
          Date.now() -
          started;

        console.log(
          `${req.method} ${req.originalUrl} ${res.statusCode} ${elapsed}ms`
        );
      }
    );

    next();
  }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      ok: true,

      status:
        "online",

      app:
        "Ultra Next Gen Pro Predictor",

      version:
        "V1000",

      environment:
        NODE_ENV,

      port:
        PORT,

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// API ROOT
// ============================================================

app.get(
  "/api",
  (req, res) => {
    res.json({
      ok: true,

      app:
        "Ultra Next Gen Pro Predictor",

      version:
        "V1000",

      message:
        "API online"
    });
  }
);

// ============================================================
// API STATUS
// ============================================================

app.get(
  "/api/status",
  (req, res) => {
    res.json({
      ok: true,

      app:
        "Ultra Next Gen Pro Predictor",

      version:
        "V1000",

      providers: {
        footballSoccer:
          Boolean(
            FOOTBALL_SOCCER_API_KEY
          ),

        footballData:
          Boolean(
            FOOTBALL_DATA_API_KEY
          ),

        apiFootball:
          Boolean(
            API_FOOTBALL_KEY
          )
      },

      database:
        Boolean(
          DATABASE_URL
        ),

      localStore:
        fs.existsSync(
          STORE_FILE
        ),

      frontend:
        fs.existsSync(
          INDEX_FILE
        ),

      upcomingDays:
        UPCOMING_DAYS,

      syncIntervalMinutes:
        SYNC_INTERVAL_MINUTES,

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// CONFIG STATUS
// ============================================================

app.get(
  "/api/config/status",
  (req, res) => {
    res.json({
      ok: true,

      footballSoccer: {
        configured:
          Boolean(
            FOOTBALL_SOCCER_API_KEY
          ),

        provider:
          "Football Soccer API"
      },

      footballData: {
        configured:
          Boolean(
            FOOTBALL_DATA_API_KEY
          ),

        provider:
          "football-data.org"
      },

      apiFootball: {
        configured:
          Boolean(
            API_FOOTBALL_KEY
          ),

        provider:
          "API-Football"
      },

      database: {
        configured:
          Boolean(
            DATABASE_URL
          )
      }
    });
  }
);

// ============================================================
// AUTH - CURRENT USER
// ============================================================

app.get(
  "/api/auth/me",
  (req, res) => {
    const user =
      getCurrentUser(req);

    if (!user) {
      return res.json({
        ok: true,

        authenticated:
          false,

        user:
          null
      });
    }

    return res.json({
      ok: true,

      authenticated:
        true,

      user:
        safeUser(user)
    });
  }
);

// ============================================================
// AUTH - SIGNUP
// ============================================================

function createUser(
  req,
  res
) {
  const body =
    req.body || {};

  const fullName =
    String(
      body.fullName ||
      body.full_name ||
      body.name ||
      body.username ||
      ""
    ).trim();

  const email =
    String(
      body.email ||
      ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      body.password ||
      ""
    );

  const username =
    String(
      body.username ||
      ""
    ).trim();

  if (!fullName) {
    return res.status(400).json({
      ok: false,

      error:
        "Full name is required"
    });
  }

  if (!email) {
    return res.status(400).json({
      ok: false,

      error:
        "Email is required"
    });
  }

  if (!password) {
    return res.status(400).json({
      ok: false,

      error:
        "Password is required"
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      ok: false,

      error:
        "Password must be at least 6 characters"
    });
  }

  const store =
    readStore();

  const existing =
    (
      store.users || []
    ).find(
      user =>
        String(
          user.email || ""
        ).toLowerCase() ===
        email
    );

  if (existing) {
    return res.status(409).json({
      ok: false,

      error:
        "An account with this email already exists"
    });
  }

  const user = {
    id:
      `user-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")}`,

    fullName,

    name:
      fullName,

    username:
      username ||
      fullName
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          ""
        )
        .slice(0, 30),

    email,

    password,

    createdAt:
      new Date().toISOString()
  };

  store.users.push(
    user
  );

  if (
    !writeStore(store)
  ) {
    return res.status(500).json({
      ok: false,

      error:
        "Could not save account"
    });
  }

  const session =
    createSession(
      user.id
    );

  if (!session) {
    return res.status(500).json({
      ok: false,

      error:
        "Account created but session could not be created"
    });
  }

  setSessionCookie(
    res,
    session.id
  );

  return res.status(201).json({
    ok: true,

    authenticated:
      true,

    message:
      "Account created successfully",

    user:
      safeUser(user)
  });
}

// ============================================================
// AUTH - LOGIN
// ============================================================

function loginUser(req, res) {
  const body = req.body || {};

  // Accept all common field names used by the V1000 frontend.
  const identifier = String(
    body.email ||
    body.username ||
    body.identifier ||
    body.login ||
    ""
  ).trim().toLowerCase();

  const password = String(
    body.password ||
    body.passcode ||
    body.pass ||
    ""
  );

  if (!identifier) {
    return res.status(400).json({
      ok: false,
      authenticated: false,
      error: "Email or username is required"
    });
  }

  if (!password) {
    return res.status(400).json({
      ok: false,
      authenticated: false,
      error: "Password is required"
    });
  }

  const store = readStore();

  const users = Array.isArray(store.users)
    ? store.users
    : [];

  const user = users.find(item => {
    const userEmail = String(
      item.email || ""
    ).trim().toLowerCase();

    const userUsername = String(
      item.username || ""
    ).trim().toLowerCase();

    const userName = String(
      item.name || item.fullName || ""
    ).trim().toLowerCase();

    const storedPassword = String(
      item.password || ""
    );

    const identifierMatches =
      identifier === userEmail ||
      identifier === userUsername ||
      identifier === userName;

    return (
      identifierMatches &&
      storedPassword === password
    );
  });

  if (!user) {
    console.log(
      `Login rejected for identifier: ${identifier}`
    );

    return res.status(401).json({
      ok: false,
      authenticated: false,
      error: "Invalid email/username or password"
    });
  }

  const session = createSession(user.id);

  if (!session) {
    return res.status(500).json({
      ok: false,
      authenticated: false,
      error:
        "Login successful but session could not be created"
    });
  }

  setSessionCookie(res, session.id);

  console.log(
    `Login successful for user: ${user.email || user.username}`
  );

  return res.json({
    ok: true,
    authenticated: true,
    message: "Login successful",
    user: safeUser(user)
  });
}

// ============================================================
// AUTH ROUTES
// ============================================================

app.post(
  "/api/auth/signup",
  createUser
);

app.post(
  "/api/auth/register",
  createUser
);

app.post(
  "/api/signup",
  createUser
);

app.post(
  "/api/register",
  createUser
);

app.post(
  "/api/auth/login",
  loginUser
);

app.post(
  "/api/login",
  loginUser
);

// ============================================================
// LOGOUT
// ============================================================

function logoutUser(
  req,
  res
) {
  const cookies =
    parseCookies(req);

  const sessionId =
    cookies.ungpp_session;

  if (sessionId) {
    const store =
      readStore();

    store.sessions =
      (
        store.sessions ||
        []
      ).filter(
        session =>
          session.id !==
          sessionId
      );

    writeStore(store);
  }

  clearSessionCookie(
    res
  );

  return res.json({
    ok: true,

    authenticated:
      false,

    loggedOut:
      true
  });
}

app.post(
  "/api/auth/logout",
  logoutUser
);

app.post(
  "/api/logout",
  logoutUser
);

// ============================================================
// MATCHES
// ============================================================

app.get(
  "/api/matches",
  async (req, res) => {
    res.json({
      ok: true,

      matches: [],

      source:
        "providers",

      timestamp:
        new Date().toISOString()
    });
  }
);

app.get(
  "/api/fixtures",
  async (req, res) => {
    res.json({
      ok: true,

      fixtures: [],

      timestamp:
        new Date().toISOString()
    });
  }
);

app.get(
  "/api/live",
  async (req, res) => {
    res.json({
      ok: true,

      matches: [],

      live:
        true,

      timestamp:
        new Date().toISOString()
    });
  }
);

app.get(
  "/api/upcoming",
  async (req, res) => {
    res.json({
      ok: true,

      matches: [],

      upcoming:
        true,

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// COMPETITIONS
// ============================================================

app.get(
  "/api/competitions",
  (req, res) => {
    res.json({
      ok: true,

      competitions: [
        {
          id:
            "SA-PSL",

          name:
            "Betway Premiership",

          country:
            "South Africa",

          region:
            "South Africa"
        },

        {
          id:
            "SA-NFD",

          name:
            "Motsepe Foundation Championship",

          country:
            "South Africa",

          region:
            "South Africa"
        },

        {
          id:
            "SA-NEDBANK",

          name:
            "Nedbank Cup",

          country:
            "South Africa",

          region:
            "South Africa"
        },

        {
          id:
            "SA-CARLING",

          name:
            "Carling Knockout Cup",

          country:
            "South Africa",

          region:
            "South Africa"
        },

        {
          id:
            "CAF-CL",

          name:
            "CAF Champions League",

          country:
            "Africa",

          region:
            "Africa"
        },

        {
          id:
            "CAF-CC",

          name:
            "CAF Confederation Cup",

          country:
            "Africa",

          region:
            "Africa"
        },

        {
          id:
            "CAF-AFL",

          name:
            "African Football League",

          country:
            "Africa",

          region:
            "Africa"
        }
      ],

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// PREDICTIONS
// ============================================================

app.post(
  "/api/predict",
  (req, res) => {
    const {
      homeTeam,
      awayTeam
    } = req.body || {};

    if (
      !homeTeam ||
      !awayTeam
    ) {
      return res.status(400).json({
        ok: false,

        error:
          "homeTeam and awayTeam are required"
      });
    }

    const prediction = {
      id:
        `prediction-${Date.now()}`,

      homeTeam,

      awayTeam,

      outcome:
        "PENDING",

      confidence:
        0,

      accuracy:
        0,

      markets: {
        matchWinner:
          null,

        doubleChance:
          null,

        overUnder:
          null,

        bothTeamsToScore:
          null
      },

      message:
        "Prediction engine awaiting fixture data.",

      createdAt:
        new Date().toISOString()
    };

    const store =
      readStore();

    store.predictions.push(
      prediction
    );

    writeStore(store);

    res.json({
      ok: true,

      prediction,

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// MANUAL SLIPS
// ============================================================

app.get(
  "/api/slips",
  (req, res) => {
    const store =
      readStore();

    res.json({
      ok: true,

      slips:
        store.slips || []
    });
  }
);

app.post(
  "/api/slips",
  (req, res) => {
    const {
      name,
      selections,
      stake,
      odds
    } = req.body || {};

    const store =
      readStore();

    const cleanSelections =
      Array.isArray(
        selections
      )
        ? selections
        : [];

    const numericStake =
      Number(stake) || 0;

    const numericOdds =
      Number(odds) || 0;

    const slip = {
      id:
        `slip-${Date.now()}-${crypto
          .randomBytes(4)
          .toString("hex")}`,

      name:
        name ||
        "Manual Slip",

      selections:
        cleanSelections,

      stake:
        numericStake,

      odds:
        numericOdds,

      potentialReturn:
        numericStake > 0 &&
        numericOdds > 0
          ? numericStake *
            numericOdds
          : 0,

      createdAt:
        new Date().toISOString()
    };

    store.slips.push(
      slip
    );

    if (
      !writeStore(store)
    ) {
      return res.status(500).json({
        ok: false,

        error:
          "Could not save slip"
      });
    }

    res.status(201).json({
      ok: true,

      slip
    });
  }
);

app.get(
  "/api/slips/:id",
  (req, res) => {
    const store =
      readStore();

    const slip =
      (
        store.slips || []
      ).find(
        item =>
          item.id ===
          req.params.id
      );

    if (!slip) {
      return res.status(404).json({
        ok: false,

        error:
          "Slip not found"
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
  (req, res) => {
    const store =
      readStore();

    const before =
      store.slips.length;

    store.slips =
      store.slips.filter(
        item =>
          item.id !==
          req.params.id
      );

    if (
      !writeStore(store)
    ) {
      return res.status(500).json({
        ok: false,

        error:
          "Could not update slips"
      });
    }

    res.json({
      ok: true,

      deleted:
        before !==
        store.slips.length
    });
  }
);

// ============================================================
// ANALYTICS
// ============================================================

app.get(
  "/api/analytics",
  (req, res) => {
    const store =
      readStore();

    res.json({
      ok: true,

      statistics: {
        totalPredictions:
          (
            store.predictions ||
            []
          ).length,

        totalSlips:
          (
            store.slips ||
            []
          ).length,

        totalUsers:
          (
            store.users ||
            []
          ).length,

        accuracy:
          0
      }
    });
  }
);

// ============================================================
// DIAGNOSTICS
// ============================================================

app.get(
  "/api/diagnostics",
  (req, res) => {
    res.json({
      ok: true,

      paths: {
        root:
          ROOT_DIR,

        public:
          PUBLIC_DIR,

        index:
          INDEX_FILE,

        data:
          DATA_DIR,

        store:
          STORE_FILE
      },

      files: {
        publicDirectory:
          fs.existsSync(
            PUBLIC_DIR
          ),

        index:
          fs.existsSync(
            INDEX_FILE
          ),

        dataDirectory:
          fs.existsSync(
            DATA_DIR
          ),

        store:
          fs.existsSync(
            STORE_FILE
          )
      },

      providers: {
        footballSoccer:
          Boolean(
            FOOTBALL_SOCCER_API_KEY
          ),

        footballData:
          Boolean(
            FOOTBALL_DATA_API_KEY
          ),

        apiFootball:
          Boolean(
            API_FOOTBALL_KEY
          )
      },

      database:
        Boolean(
          DATABASE_URL
        ),

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// FRONTEND
// ============================================================

if (
  fs.existsSync(
    PUBLIC_DIR
  )
) {
  app.use(
    express.static(
      PUBLIC_DIR,
      {
        index:
          "index.html",

        extensions:
          ["html"],

        maxAge:
          NODE_ENV ===
          "production"
            ? "1h"
            : 0
      }
    )
  );
} else {
  console.error(
    "WARNING: public directory does not exist:",
    PUBLIC_DIR
  );
}

// ============================================================
// API 404
// ============================================================

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      ok: false,

      error:
        "API endpoint not found",

      path:
        req.originalUrl,

      method:
        req.method
    });
  }
);

// ============================================================
// SPA FALLBACK
// ============================================================

app.get(
  "/*splat",
  (req, res) => {
    if (
      !fs.existsSync(
        INDEX_FILE
      )
    ) {
      console.error(
        "Frontend missing:",
        INDEX_FILE
      );

      return res
        .status(500)
        .send(`
          <h1>Ultra Next Gen Pro Predictor</h1>
          <p>Frontend file missing.</p>
          <p>Expected:</p>
          <code>public/index.html</code>
        `);
    }

    return res.sendFile(
      INDEX_FILE
    );
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      ok: false,

      error:
        "Internal server error"
    });
  }
);

// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      "=================================================="
    );

    console.log(
      "Ultra Next Gen Pro Predictor"
    );

    console.log(
      "V1000 SERVER ONLINE"
    );

    console.log(
      `Listening on http://${HOST}:${PORT}`
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
      `Frontend exists: ${fs.existsSync(
        INDEX_FILE
      )}`
    );

    console.log(
      `Football Soccer API configured: ${Boolean(
        FOOTBALL_SOCCER_API_KEY
      )}`
    );

    console.log(
      `Football-Data configured: ${Boolean(
        FOOTBALL_DATA_API_KEY
      )}`
    );

    console.log(
      `API-Football configured: ${Boolean(
        API_FOOTBALL_KEY
      )}`
    );

    console.log(
      `Database configured: ${Boolean(
        DATABASE_URL
      )}`
    );

    console.log(
      `Upcoming days: ${UPCOMING_DAYS}`
    );

    console.log(
      `Sync interval: ${SYNC_INTERVAL_MINUTES} minutes`
    );

    console.log(
      "=================================================="
    );
  }
);
