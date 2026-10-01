"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");

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

const NODE_ENV = process.env.NODE_ENV || "production";

const FOOTBALL_DATA_API_KEY =
  process.env.FOOTBALL_DATA_API_KEY || "";

const API_FOOTBALL_KEY =
  process.env.API_FOOTBALL_KEY || "";

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";

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

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      const initial = {
        users: [],
        slips: [],
        predictions: [],
        settings: {},
        createdAt: new Date().toISOString()
      };

      fs.writeFileSync(
        STORE_FILE,
        JSON.stringify(initial, null, 2),
        "utf8"
      );

      return initial;
    }

    const raw = fs.readFileSync(
      STORE_FILE,
      "utf8"
    );

    if (!raw.trim()) {
      return {
        users: [],
        slips: [],
        predictions: [],
        settings: {}
      };
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      "Store read error:",
      error.message
    );

    return {
      users: [],
      slips: [],
      predictions: [],
      settings: {}
    };
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify(data, null, 2),
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
// MIDDLEWARE
// ============================================================

app.disable("x-powered-by");

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
// BASIC REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
  const started = Date.now();

  res.on("finish", () => {
    const elapsed = Date.now() - started;

    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${elapsed}ms`
    );
  });

  next();
});

// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "online",
    app: "Ultra Next Gen Pro Predictor",
    version: "V1000",
    environment: NODE_ENV,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// API STATUS
// ============================================================

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    app: "Ultra Next Gen Pro Predictor",
    version: "V1000",

    providers: {
      footballData: Boolean(
        FOOTBALL_DATA_API_KEY
      ),

      apiFootball: Boolean(
        API_FOOTBALL_KEY
      )
    },

    database: Boolean(
      DATABASE_URL
    ),

    localStore: fs.existsSync(
      STORE_FILE
    ),

    frontend: fs.existsSync(
      INDEX_FILE
    ),

    timestamp: new Date().toISOString()
  });
});

// ============================================================
// CONFIGURATION STATUS
// ============================================================

app.get("/api/config/status", (req, res) => {
  res.json({
    ok: true,

    footballData: {
      configured: Boolean(
        FOOTBALL_DATA_API_KEY
      ),
      provider: "football-data.org"
    },

    apiFootball: {
      configured: Boolean(
        API_FOOTBALL_KEY
      ),
      provider: "API-Football"
    },

    database: {
      configured: Boolean(
        DATABASE_URL
      )
    }
  });
});

// ============================================================
// AUTH
// ============================================================

app.get("/api/auth/me", (req, res) => {
  res.json({
    authenticated: false,
    user: null
  });
});

app.post("/api/auth/login", (req, res) => {
  const {
    email,
    username
  } = req.body || {};

  if (!email && !username) {
    return res.status(400).json({
      ok: false,
      error: "Email or username is required"
    });
  }

  res.json({
    ok: true,
    authenticated: true,
    user: {
      id: `user-${Date.now()}`,
      email: email || null,
      username: username || null
    }
  });
});

app.post("/api/auth/signup", (req, res) => {
  const {
    email,
    username
  } = req.body || {};

  if (!email && !username) {
    return res.status(400).json({
      ok: false,
      error: "Email or username is required"
    });
  }

  const store = readStore();

  const user = {
    id: `user-${Date.now()}`,
    email: email || null,
    username: username || null,
    createdAt: new Date().toISOString()
  };

  store.users.push(user);

  writeStore(store);

  res.status(201).json({
    ok: true,
    authenticated: true,
    user
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.json({
    ok: true,
    authenticated: false,
    loggedOut: true
  });
});

// ============================================================
// GENERIC MATCH DATA ENDPOINTS
// ============================================================

app.get("/api/matches", async (req, res) => {
  res.json({
    ok: true,
    matches: [],
    source: "providers",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/fixtures", async (req, res) => {
  res.json({
    ok: true,
    fixtures: [],
    timestamp: new Date().toISOString()
  });
});

app.get("/api/live", async (req, res) => {
  res.json({
    ok: true,
    matches: [],
    live: true,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/upcoming", async (req, res) => {
  res.json({
    ok: true,
    matches: [],
    upcoming: true,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// COMPETITIONS
// ============================================================

app.get("/api/competitions", (req, res) => {
  res.json({
    ok: true,

    competitions: [
      {
        id: "SA-PSL",
        name: "Betway Premiership",
        country: "South Africa",
        region: "South Africa"
      },

      {
        id: "SA-NFD",
        name: "Motsepe Foundation Championship",
        country: "South Africa",
        region: "South Africa"
      },

      {
        id: "SA-NEDBANK",
        name: "Nedbank Cup",
        country: "South Africa",
        region: "South Africa"
      },

      {
        id: "SA-CARLING",
        name: "Carling Knockout Cup",
        country: "South Africa",
        region: "South Africa"
      },

      {
        id: "CAF-CL",
        name: "CAF Champions League",
        country: "Africa",
        region: "Africa"
      },

      {
        id: "CAF-CC",
        name: "CAF Confederation Cup",
        country: "Africa",
        region: "Africa"
      },

      {
        id: "CAF-AFL",
        name: "African Football League",
        country: "Africa",
        region: "Africa"
      }
    ],

    timestamp: new Date().toISOString()
  });
});

// ============================================================
// PREDICTIONS
// ============================================================

app.post("/api/predict", (req, res) => {
  const {
    homeTeam,
    awayTeam
  } = req.body || {};

  if (!homeTeam || !awayTeam) {
    return res.status(400).json({
      ok: false,
      error: "homeTeam and awayTeam are required"
    });
  }

  res.json({
    ok: true,

    prediction: {
      homeTeam,
      awayTeam,

      outcome: "PENDING",

      confidence: 0,

      markets: {
        matchWinner: null,
        doubleChance: null,
        overUnder: null,
        bothTeamsToScore: null
      },

      message:
        "Prediction engine awaiting fixture data."
    },

    timestamp: new Date().toISOString()
  });
});

// ============================================================
// MANUAL SLIPS
// ============================================================

app.get("/api/slips", (req, res) => {
  const store = readStore();

  res.json({
    ok: true,
    slips: store.slips || []
  });
});

app.post("/api/slips", (req, res) => {
  const {
    name,
    selections,
    stake
  } = req.body || {};

  const store = readStore();

  const slip = {
    id: `slip-${Date.now()}`,
    name: name || "Manual Slip",
    selections: Array.isArray(
      selections
    )
      ? selections
      : [],
    stake: Number(stake) || 0,
    createdAt: new Date().toISOString()
  };

  store.slips.push(slip);

  writeStore(store);

  res.status(201).json({
    ok: true,
    slip
  });
});

app.get("/api/slips/:id", (req, res) => {
  const store = readStore();

  const slip = (
    store.slips || []
  ).find(
    item => item.id === req.params.id
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
});

app.delete("/api/slips/:id", (req, res) => {
  const store = readStore();

  const before =
    store.slips.length;

  store.slips =
    store.slips.filter(
      item =>
        item.id !== req.params.id
    );

  writeStore(store);

  res.json({
    ok: true,
    deleted:
      before !==
      store.slips.length
  });
});

// ============================================================
// ANALYTICS
// ============================================================

app.get("/api/analytics", (req, res) => {
  const store = readStore();

  res.json({
    ok: true,

    statistics: {
      totalPredictions:
        (store.predictions || []).length,

      totalSlips:
        (store.slips || []).length,

      accuracy: 0
    }
  });
});

// ============================================================
// DIAGNOSTICS
// ============================================================

app.get("/api/diagnostics", (req, res) => {
  res.json({
    ok: true,

    paths: {
      root: ROOT_DIR,
      public: PUBLIC_DIR,
      index: INDEX_FILE,
      data: DATA_DIR,
      store: STORE_FILE
    },

    files: {
      publicDirectory:
        fs.existsSync(PUBLIC_DIR),

      index:
        fs.existsSync(INDEX_FILE),

      dataDirectory:
        fs.existsSync(DATA_DIR),

      store:
        fs.existsSync(STORE_FILE)
    },

    providers: {
      footballData:
        Boolean(
          FOOTBALL_DATA_API_KEY
        ),

      apiFootball:
        Boolean(
          API_FOOTBALL_KEY
        )
    }
  });
});

// ============================================================
// FRONTEND
//
// THIS IS THE CRITICAL FIX.
//
// V1000:
//     /public/index.html
//
// NOT:
//     /src/public/index.html
// ============================================================

if (
  fs.existsSync(PUBLIC_DIR)
) {
  app.use(
    express.static(
      PUBLIC_DIR,
      {
        index: "index.html",
        extensions: ["html"],

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
// SPA FALLBACK
// ============================================================

app.get('/*splat', (req, res) => {
  if (
    req.path.startsWith(
      "/api/"
    )
  ) {
    return next();
  }

  if (
    !fs.existsSync(
      INDEX_FILE
    )
  ) {
    console.error(
      "Frontend missing:",
      INDEX_FILE
    );

    return res.status(500).send(
      `
      <h1>Ultra Next Gen Pro Predictor</h1>
      <p>Frontend file missing.</p>
      <p>Expected:</p>
      <code>public/index.html</code>
      `
    );
  }

  res.sendFile(
    INDEX_FILE
  );
});

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
        req.originalUrl
    });
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {
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
      "=================================================="
    );
  }
);
