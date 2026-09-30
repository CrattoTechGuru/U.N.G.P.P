const express = require("express");
const path = require("path");
const api = require("./src/api-football");
const predictor = require("./src/predictor");
const db = require("./src/db");

const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function ok(res, data) { res.json({ ok: true, ...data }); }
function fail(res, status, message, extra = {}) {
  res.status(status).json({ ok: false, error: message, ...extra });
}

app.get("/health", async (_req, res) => {
  const health = await db.health();
  res.json({
    ok: true,
    app: "Ultra Next Gen Pro Predictor",
    provider: "API-Football/API-Sports",
    database: health,
    time: new Date().toISOString()
  });
});

app.get("/api/status", async (_req, res) => {
  try {
    const provider = await api.status();
    const database = await db.health();
    ok(res, { provider, database });
  } catch (e) { fail(res, 502, e.message); }
});

app.get("/api/competitions", async (req, res) => {
  try {
    const country = req.query.country || "";
    const search = req.query.search || "";
    const season = Number(req.query.season || api.currentSeason());
    const leagues = await api.findLeagues({ country, search, season });
    ok(res, { season, leagues });
  } catch (e) { fail(res, 502, e.message); }
});

app.get("/api/matches/live", async (_req, res) => {
  try {
    const matches = await api.liveFixtures();
    ok(res, { matches });
  } catch (e) { fail(res, 502, e.message); }
});

app.get("/api/matches/upcoming", async (req, res) => {
  try {
    const days = Math.min(14, Math.max(1, Number(req.query.days || 7)));
    const matches = await api.upcomingFixtures(days);
    ok(res, { matches });
  } catch (e) { fail(res, 502, e.message); }
});

app.get("/api/matches/competition", async (req, res) => {
  try {
    if (!req.query.league) return fail(res, 400, "league is required");
    const league = Number(req.query.league);
    const season = Number(req.query.season || api.currentSeason());
    const matches = await api.competitionFixtures(league, season);
    ok(res, { league, season, matches });
  } catch (e) { fail(res, 502, e.message); }
});

app.get("/api/match/:id", async (req, res) => {
  try {
    const fixture = await api.fixture(Number(req.params.id));
    if (!fixture) return fail(res, 404, "Fixture not found");
    ok(res, { fixture });
  } catch (e) { fail(res, 502, e.message); }
});

app.get("/api/prediction/:id", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    const result = await predictor.predictFixture(fixtureId);
    await db.savePrediction(result);
    ok(res, { prediction: result });
  } catch (e) { fail(res, 502, e.message); }
});

app.post("/api/slips/analyze", async (req, res) => {
  try {
    const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
    if (!selections.length) return fail(res, 400, "At least one selection is required");
    const analyzed = [];
    for (const s of selections.slice(0, 30)) {
      const prediction = await predictor.predictFixture(Number(s.fixtureId));
      analyzed.push({ ...s, prediction });
    }
    ok(res, { selections: analyzed });
  } catch (e) { fail(res, 502, e.message); }
});

app.post("/api/slips", async (req, res) => {
  try {
    const slip = await db.saveSlip(req.body || {});
    ok(res, { slip });
  } catch (e) { fail(res, 500, e.message); }
});

app.get("/api/slips", async (_req, res) => {
  try { ok(res, { slips: await db.listSlips() }); }
  catch (e) { fail(res, 500, e.message); }
});

app.get("'/{*splat}'", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  try {
    await db.init();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Ultra Next Gen Pro Predictor listening on http://0.0.0.0:${PORT} | database=${db.enabled()} | provider=API-Football`);
    });
  } catch (e) {
    console.error("Startup failed:", e);
    process.exit(1);
  }
})();
