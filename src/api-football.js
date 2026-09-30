const BASE = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY;

// API-Football Free plan: use an accessible historical season for
// season-based endpoints. Override with API_FOOTBALL_SEASON if needed.
const FREE_PLAN_SEASON = Number(
  process.env.API_FOOTBALL_SEASON || 2024
);

const UPCOMING_DAYS = Math.max(
  1,
  Math.min(Number(process.env.UPCOMING_DAYS || 7), 10)
);

const TIMEZONE =
  process.env.API_FOOTBALL_TIMEZONE ||
  "Africa/Johannesburg";

function currentSeason() {
  return FREE_PLAN_SEASON;
}

function needKey() {
  if (!KEY) {
    throw new Error(
      "API_FOOTBALL_KEY is missing. Add it to Render Environment Variables."
    );
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const x = new Date(date);
  x.setUTCDate(x.getUTCDate() + Number(days));
  return x;
}

function validDate(value) {
  if (!value) return false;

  const d = new Date(value);

  return !Number.isNaN(d.getTime());
}

function today() {
  return new Date();
}

function normalizeFixture(x) {
  return {
    id: x.fixture?.id,

    date: x.fixture?.date,

    timestamp: x.fixture?.timestamp,

    status: x.fixture?.status?.short,

    elapsed: x.fixture?.status?.elapsed,

    league: {
      id: x.league?.id,
      name: x.league?.name,
      country: x.league?.country,
      logo: x.league?.logo,
      season: x.league?.season
    },

    home: {
      id: x.teams?.home?.id,
      name: x.teams?.home?.name,
      logo: x.teams?.home?.logo,
      winner: x.teams?.home?.winner
    },

    away: {
      id: x.teams?.away?.id,
      name: x.teams?.away?.name,
      logo: x.teams?.away?.logo,
      winner: x.teams?.away?.winner
    },

    goals: {
      home: x.goals?.home,
      away: x.goals?.away
    },

    venue: x.fixture?.venue?.name
  };
}

/*
 * Central API-Football request.
 *
 * Important:
 *
 * /fixtures with no selector gets a safe current date range.
 *
 * Season-based requests are protected from accidentally requesting
 * the unsupported current season on the Free plan.
 */
async function request(endpoint, params = {}) {
  needKey();

  const finalParams = {
    ...params
  };

  /*
   * FIXTURE REQUEST PROTECTION
   */
  if (endpoint === "/fixtures") {
    const hasLive =
      finalParams.live !== undefined &&
      finalParams.live !== null &&
      finalParams.live !== "";

    const hasId =
      finalParams.id !== undefined &&
      finalParams.id !== null &&
      finalParams.id !== "";

    const hasTeam =
      finalParams.team !== undefined &&
      finalParams.team !== null &&
      finalParams.team !== "";

    const hasLeague =
      finalParams.league !== undefined &&
      finalParams.league !== null &&
      finalParams.league !== "";

    const hasDateRange =
      validDate(finalParams.from) &&
      validDate(finalParams.to);

    /*
     * General fixtures request:
     * automatically create a valid current date window.
     */
    if (
      !hasLive &&
      !hasId &&
      !hasTeam &&
      !hasLeague &&
      !hasDateRange
    ) {
      const from = today();
      const to = addDays(from, UPCOMING_DAYS);

      finalParams.from = isoDate(from);
      finalParams.to = isoDate(to);
      finalParams.timezone = TIMEZONE;
    }

    /*
     * If a date range exists, make sure timezone exists.
     */
    if (
      finalParams.from &&
      finalParams.to &&
      !finalParams.timezone
    ) {
      finalParams.timezone = TIMEZONE;
    }

    /*
     * If somebody sends an unsupported season to fixtures,
     * remove it when the request is date-based.
     *
     * Date-based current fixtures do not need season.
     */
    if (finalParams.from && finalParams.to) {
      delete finalParams.season;
    }
  }

  /*
   * SEASON PROTECTION
   *
   * For season-based endpoints, default to the Free-plan
   * accessible season.
   */
  const seasonEndpoints = [
    "/standings",
    "/teams/statistics",
    "/leagues"
  ];

  if (seasonEndpoints.includes(endpoint)) {
    if (
      finalParams.season === undefined ||
      finalParams.season === null ||
      finalParams.season === ""
    ) {
      finalParams.season = FREE_PLAN_SEASON;
    }

    const requestedSeason = Number(finalParams.season);

    /*
     * API-Football Free-plan error specifically reports that
     * seasons outside 2022-2024 are unavailable.
     *
     * Automatically clamp unsupported seasons.
     */
    if (
      Number.isFinite(requestedSeason) &&
      requestedSeason > 2024
    ) {
      finalParams.season = FREE_PLAN_SEASON;
    }
  }

  const url = new URL(BASE + endpoint);

  for (const [key, value] of Object.entries(finalParams)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",

    headers: {
      "x-apisports-key": KEY,
      "Accept": "application/json"
    }
  });

  const body = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `API-Football HTTP ${response.status}: ${JSON.stringify(
        body.errors || body
      )}`
    );
  }

  if (
    body.errors &&
    Object.keys(body.errors).length > 0
  ) {
    throw new Error(
      `API-Football: ${JSON.stringify(body.errors)}`
    );
  }

  return body;
}

/*
 * LIVE
 *
 * Uses live=all and does not request a season.
 */
async function liveFixtures() {
  const body = await request("/fixtures", {
    live: "all"
  });

  return (body.response || [])
    .map(normalizeFixture);
}

/*
 * UPCOMING
 *
 * Uses current dates rather than season=2026.
 */
async function upcomingFixtures(
  days = UPCOMING_DAYS
) {
  const safeDays = Math.max(
    1,
    Math.min(Number(days) || UPCOMING_DAYS, 10)
  );

  const from = today();
  const to = addDays(from, safeDays);

  const body = await request("/fixtures", {
    from: isoDate(from),
    to: isoDate(to),
    timezone: TIMEZONE
  });

  return (body.response || [])
    .map(normalizeFixture)
    .filter(x => {
      const status = x.status;

      return (
        ["NS", "TBD", "PST"].includes(status) ||
        x.goals?.home === null
      );
    })
    .sort(
      (a, b) =>
        new Date(a.date || 0) -
        new Date(b.date || 0)
    );
}

/*
 * COMPETITION FIXTURES
 *
 * Uses the requested league and a Free-plan-compatible season.
 */
async function competitionFixtures(
  league,
  season = FREE_PLAN_SEASON
) {
  const safeSeason =
    Number(season) > 2024
      ? FREE_PLAN_SEASON
      : Number(season);

  const body = await request("/fixtures", {
    league,
    season: safeSeason
  });

  return (body.response || [])
    .map(normalizeFixture);
}

/*
 * SINGLE FIXTURE
 */
async function fixture(id) {
  const body = await request("/fixtures", {
    id
  });

  return body.response?.[0]
    ? normalizeFixture(body.response[0])
    : null;
}

/*
 * RAW FIXTURES
 *
 * Existing callers can continue using this function.
 */
async function rawFixtures(params = {}) {
  const body = await request(
    "/fixtures",
    params
  );

  return body.response || [];
}

/*
 * TEAM HISTORY
 *
 * last=n does not require a season.
 */
async function lastTeam(
  team,
  n = 10
) {
  const body = await request("/fixtures", {
    team,
    last: n
  });

  return body.response || [];
}

/*
 * HEAD-TO-HEAD
 */
async function h2h(
  home,
  away,
  n = 10
) {
  const body = await request(
    "/fixtures/headtohead",
    {
      h2h: `${home}-${away}`,
      last: n
    }
  );

  return body.response || [];
}

/*
 * STANDINGS
 */
async function standings(
  league,
  season = FREE_PLAN_SEASON
) {
  const safeSeason =
    Number(season) > 2024
      ? FREE_PLAN_SEASON
      : Number(season);

  const body = await request(
    "/standings",
    {
      league,
      season: safeSeason
    }
  );

  return body.response || [];
}

/*
 * TEAM STATISTICS
 */
async function teamStats(
  team,
  league,
  season = FREE_PLAN_SEASON
) {
  const safeSeason =
    Number(season) > 2024
      ? FREE_PLAN_SEASON
      : Number(season);

  const body = await request(
    "/teams/statistics",
    {
      team,
      league,
      season: safeSeason
    }
  );

  return (
    body.response?.[0] ||
    body.response ||
    null
  );
}

/*
 * API-FOOTBALL PREDICTION
 *
 * Prediction endpoint is fixture-ID based.
 */
async function providerPrediction(
  fixtureId
) {
  const body = await request(
    "/predictions",
    {
      fixture: fixtureId
    }
  );

  return body.response?.[0] || null;
}

/*
 * LEAGUE DISCOVERY
 */
async function findLeagues({
  country = "",
  search = "",
  season = FREE_PLAN_SEASON
} = {}) {
  const safeSeason =
    Number(season) > 2024
      ? FREE_PLAN_SEASON
      : Number(season);

  const params = {
    season: safeSeason
  };

  if (country) {
    params.country = country;
  }

  if (search) {
    params.search = search;
  }

  const body = await request(
    "/leagues",
    params
  );

  return (body.response || [])
    .map(x => ({
      id: x.league?.id,
      name: x.league?.name,
      type: x.league?.type,
      country: x.country?.name,
      code: x.country?.code,

      season:
        x.seasons?.find(
          s => s.year === safeSeason
        ) || null,

      logo: x.league?.logo
    }));
}

/*
 * API STATUS
 */
async function status() {
  needKey();

  const body = await request(
    "/status"
  );

  return body.response || body;
}

module.exports = {
  request,
  currentSeason,
  liveFixtures,
  upcomingFixtures,
  competitionFixtures,
  fixture,
  rawFixtures,
  lastTeam,
  h2h,
  standings,
  teamStats,
  providerPrediction,
  findLeagues,
  status,
  normalizeFixture
};
