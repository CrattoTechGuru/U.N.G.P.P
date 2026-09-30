const BASE = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY;
const UPCOMING_DAYS = Number(process.env.UPCOMING_DAYS || 7);

function currentSeason() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= 7 ? y : y - 1;
}
function needKey() {
  if (!KEY) throw new Error("API_FOOTBALL_KEY is missing. Add it to Render Environment Variables.");
}
async function request(endpoint, params = {}) {
  needKey();
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, {
    headers: { "x-apisports-key": KEY, "Accept": "application/json" }
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`API-Football HTTP ${r.status}: ${JSON.stringify(body.errors || body)}`);
  if (body.errors && Object.keys(body.errors).length) {
    throw new Error(`API-Football: ${JSON.stringify(body.errors)}`);
  }
  return body;
}
function isoDate(d) { return d.toISOString().slice(0,10); }
function addDays(date, n) { const x = new Date(date); x.setUTCDate(x.getUTCDate()+n); return x; }

function normalizeFixture(x) {
  return {
    id: x.fixture?.id,
    date: x.fixture?.date,
    timestamp: x.fixture?.timestamp,
    status: x.fixture?.status?.short,
    elapsed: x.fixture?.status?.elapsed,
    league: {
      id: x.league?.id, name: x.league?.name, country: x.league?.country,
      logo: x.league?.logo, season: x.league?.season
    },
    home: { id: x.teams?.home?.id, name: x.teams?.home?.name, logo: x.teams?.home?.logo, winner: x.teams?.home?.winner },
    away: { id: x.teams?.away?.id, name: x.teams?.away?.name, logo: x.teams?.away?.logo, winner: x.teams?.away?.winner },
    goals: { home: x.goals?.home, away: x.goals?.away },
    venue: x.fixture?.venue?.name
  };
}

async function liveFixtures() {
  const body = await request("/fixtures", { live: "all" });
  return (body.response || []).map(normalizeFixture);
}

async function upcomingFixtures(days = UPCOMING_DAYS) {
  const from = new Date();
  const to = addDays(from, days);
  const body = await request("/fixtures", {
    from: isoDate(from), to: isoDate(to), timezone: "Africa/Johannesburg"
  });
  return (body.response || []).map(normalizeFixture)
    .filter(x => ["NS","TBD","PST","CANC"].includes(x.status) || x.goals.home === null)
    .sort((a,b) => new Date(a.date)-new Date(b.date));
}

async function competitionFixtures(league, season) {
  const body = await request("/fixtures", { league, season });
  return (body.response || []).map(normalizeFixture);
}

async function fixture(id) {
  const body = await request("/fixtures", { id });
  return body.response?.[0] ? normalizeFixture(body.response[0]) : null;
}

async function rawFixtures(params) {
  const body = await request("/fixtures", params);
  return body.response || [];
}

async function lastTeam(team, n) {
  const body = await request("/fixtures", { team, last: n });
  return body.response || [];
}

async function h2h(home, away, n = 10) {
  const body = await request("/fixtures/headtohead", { h2h: `${home}-${away}`, last: n });
  return body.response || [];
}

async function standings(league, season) {
  const body = await request("/standings", { league, season });
  return body.response || [];
}

async function teamStats(team, league, season) {
  const body = await request("/teams/statistics", { team, league, season });
  return body.response?.[0] || body.response || null;
}

async function providerPrediction(fixtureId) {
  const body = await request("/predictions", { fixture: fixtureId });
  return body.response?.[0] || null;
}

async function findLeagues({ country="", search="", season=currentSeason() } = {}) {
  const params = { season };
  if (country) params.country = country;
  if (search) params.search = search;
  const body = await request("/leagues", params);
  return (body.response || []).map(x => ({
    id: x.league?.id, name: x.league?.name, type: x.league?.type,
    country: x.country?.name, code: x.country?.code,
    season: x.seasons?.find(s => s.year === season) || null,
    logo: x.league?.logo
  }));
}

async function status() {
  needKey();
  const body = await request("/status");
  return body.response || body;
}

module.exports = {
  request, currentSeason, liveFixtures, upcomingFixtures, competitionFixtures,
  fixture, rawFixtures, lastTeam, h2h, standings, teamStats, providerPrediction,
  findLeagues, status, normalizeFixture
};
