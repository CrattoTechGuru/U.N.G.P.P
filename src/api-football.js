'use strict';

const BASE_URL = 'https://api.footballsoccerapi.com';
const API_KEY = process.env.FOOTBALL_SOCCER_API_KEY;

const UPCOMING_DAYS = Math.min(
  Math.max(Number(process.env.UPCOMING_DAYS || 7), 1),
  30
);

function requireKey() {
  if (!API_KEY) {
    throw new Error(
      'FOOTBALL_SOCCER_API_KEY is missing from the environment variables.'
    );
  }
}

async function request(path, params = {}) {
  requireKey();

  const url = new URL(`${BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': API_KEY,
      'Accept': 'application/json'
    }
  });

  const text = await response.text();

  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {
      error: {
        message: text || `HTTP ${response.status}`
      }
    };
  }

  if (!response.ok) {
    const message =
      body?.error?.message ||
      body?.message ||
      `Football Soccer API returned HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.provider = body;
    throw error;
  }

  return body;
}

function dataOf(result) {
  if (Array.isArray(result?.data)) {
    return result.data;
  }

  if (result?.data && typeof result.data === 'object') {
    return result.data;
  }

  return [];
}

function normalizeMatch(match) {
  if (!match || typeof match !== 'object') {
    return match;
  }

  const homeGoals =
    match.home_goals === null ||
    match.home_goals === undefined
      ? null
      : Number(match.home_goals);

  const awayGoals =
    match.away_goals === null ||
    match.away_goals === undefined
      ? null
      : Number(match.away_goals);

  return {
    ...match,

    id: match.match_id,

    fixture_id: match.match_id,

    home: {
      id: match.home_team_id,
      name: match.home_team_name
    },

    away: {
      id: match.away_team_id,
      name: match.away_team_name
    },

    home_team: {
      id: match.home_team_id,
      name: match.home_team_name
    },

    away_team: {
      id: match.away_team_id,
      name: match.away_team_name
    },

    goals: {
      home: homeGoals,
      away: awayGoals
    },

    score: {
      home: homeGoals,
      away: awayGoals
    },

    status: match.match_status,

    league: {
      id: match.league_id,
      name: match.league_name,
      country: match.country_name
    },

    date:
      match.kickoff_date ||
      (
        match.kickoff_utc
          ? new Date(Number(match.kickoff_utc) * 1000).toISOString()
          : null
      )
  };
}

/*
 * Today's real fixtures.
 *
 * The free plan can access today's fixture card.
 * If the provider returns an in-play status in today's card,
 * those matches are also exposed here.
 */
async function todayFixtures(params = {}) {
  const result = await request('/v1/fixtures/today', {
    country: params.country,
    league_id: params.league_id,
    limit: params.limit || 1000
  });

  return dataOf(result).map(normalizeMatch);
}

/*
 * Upcoming real fixtures.
 */
async function upcomingFixtures(params = {}) {
  const result = await request('/v1/fixtures/upcoming', {
    days: params.days || UPCOMING_DAYS,
    country: params.country,
    league_id: params.league_id,
    limit: params.limit || 1000,
    page: params.page
  });

  return dataOf(result).map(normalizeMatch);
}

/*
 * "Live" compatibility function.
 *
 * The provider's true /v1/live endpoint requires the Live plan.
 * Therefore the free plan cannot promise an in-play feed.
 *
 * We use today's real fixture card and only return matches whose
 * status actually indicates that they are in play.
 */
async function liveFixtures(params = {}) {
  const fixtures = await todayFixtures(params);

  const liveStatuses = new Set([
    'in_play_first_half',
    'half_time',
    'in_play_second_half',
    'in_play',
    'live'
  ]);

  return fixtures.filter((match) =>
    liveStatuses.has(String(match.status || '').toLowerCase())
  );
}

/*
 * Raw match search.
 *
 * This is the main general-purpose endpoint and supports:
 * league_id, country, season, team_id, date_from, date_to,
 * status, result, venue, limit, page and sorting.
 */
async function rawFixtures(params = {}) {
  const result = await request('/v1/matches', {
    ids: params.ids,
    league_id: params.league_id,
    country: params.country,
    season: params.season,
    team_id: params.team_id,
    date_from: params.date_from,
    date_to: params.date_to,
    status: params.status,
    result: params.result,
    has_prices: params.has_prices,
    venue: params.venue,
    limit: params.limit || 100,
    page: params.page,
    cursor: params.cursor,
    sort: params.sort || '-kickoff_utc'
  });

  return dataOf(result).map(normalizeMatch);
}

/*
 * Fixtures/results for a specific competition.
 */
async function competitionFixtures(league, season, params = {}) {
  const query = {
    league_id: league,
    limit: params.limit || 1000,
    page: params.page
  };

  if (season !== undefined && season !== null && season !== '') {
    query.season = Number(season);
  }

  const result = await request('/v1/matches', query);

  return dataOf(result).map(normalizeMatch);
}

/*
 * One specific fixture.
 */
async function fixture(id) {
  const result = await request(
    `/v1/matches/${encodeURIComponent(id)}`
  );

  return result?.data
    ? normalizeMatch(result.data)
    : result;
}

/*
 * Recent matches for a team.
 *
 * On the free plan this can only access the provider's
 * currently available free-data window.
 */
async function lastTeam(team, n = 10) {
  const result = await request('/v1/matches', {
    team_id: team,
    status: 'finished',
    limit: Math.min(Number(n) || 10, 100),
    sort: '-kickoff_utc'
  });

  return dataOf(result).map(normalizeMatch);
}

/*
 * Head-to-head compatibility.
 *
 * The provider exposes full H2H under the Archive plan.
 * On the free plan we search the currently accessible match
 * window for matches involving both clubs.
 */
async function h2h(home, away, n = 10) {
  const first = await request('/v1/matches', {
    team_id: home,
    status: 'finished',
    limit: 100,
    sort: '-kickoff_utc'
  });

  const matches = dataOf(first)
    .map(normalizeMatch)
    .filter((match) => {
      const homeId = String(match.home?.id ?? '');
      const awayId = String(match.away?.id ?? '');

      const h = String(home);
      const a = String(away);

      return (
        (homeId === h && awayId === a) ||
        (homeId === a && awayId === h)
      );
    });

  return matches.slice(0, Number(n) || 10);
}

/*
 * Standings compatibility.
 *
 * Official standings require the Archive plan.
 * Return an explicit empty result instead of calling a paid
 * endpoint and breaking the application.
 */
async function standings(league, season) {
  return {
    data: [],
    meta: {
      provider: 'footballsoccerapi',
      available: false,
      reason:
        'Official standings require the Archive plan on this provider.'
    },
    league,
    season
  };
}

/*
 * Team statistics compatibility.
 *
 * Official aggregate team statistics require the Archive plan.
 */
async function teamStats(team, league, season) {
  return {
    data: null,
    meta: {
      provider: 'footballsoccerapi',
      available: false,
      reason:
        'Official team aggregate statistics require the Archive plan.'
    },
    team,
    league,
    season
  };
}

/*
 * Prediction compatibility.
 *
 * This provider does not supply a free prediction endpoint.
 * Your application's own prediction engine should calculate
 * the prediction instead of using fake provider predictions.
 */
async function providerPrediction(fixtureId) {
  return {
    data: null,
    meta: {
      provider: 'footballsoccerapi',
      available: false,
      reason:
        'Prediction is generated by the application's prediction engine.'
    },
    fixture_id: fixtureId
  };
}

/*
 * Find competitions.
 *
 * The provider supports filtering by country, but not a
 * free-text "search" parameter. We therefore retrieve the
 * competition list and filter locally when search is supplied.
 */
async function findLeagues({
  country,
  search,
  season
} = {}) {
  const result = await request('/v1/leagues', {
    country,
    limit: 1000
  });

  let leagues = dataOf(result);

  if (search) {
    const term = String(search).toLowerCase();

    leagues = leagues.filter((league) =>
      [
        league.league_name,
        league.name,
        league.country_name,
        league.country
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(term)
        )
    );
  }

  if (season !== undefined && season !== null && season !== '') {
    leagues = leagues.filter((league) => {
      const first = Number(
        league.season_first ??
        league.first_season ??
        season
      );

      const last = Number(
        league.season_last ??
        league.last_season ??
        season
      );

      return (
        Number(season) >= first &&
        Number(season) <= last
      );
    });
  }

  return leagues;
}

/*
 * Countries.
 */
async function countries() {
  const result = await request('/v1/countries', {
    limit: 1000
  });

  return dataOf(result);
}

/*
 * Teams.
 */
async function teams(params = {}) {
  const result = await request('/v1/teams', {
    country: params.country,
    league_id: params.league_id,
    limit: params.limit || 1000,
    page: params.page,
    cursor: params.cursor
  });

  return dataOf(result);
}

/*
 * One team profile.
 */
async function team(teamId) {
  const result = await request(
    `/v1/teams/${encodeURIComponent(teamId)}`
  );

  return result?.data || result;
}

/*
 * Recent settled results.
 */
async function latestResults(params = {}) {
  const result = await request('/v1/results/latest', {
    country: params.country,
    league_id: params.league_id,
    limit: params.limit || 100
  });

  return dataOf(result).map(normalizeMatch);
}

/*
 * Provider/service status.
 */
async function status() {
  const result = await request('/v1/status');

  return result?.data || result;
}

/*
 * Account/API usage.
 */
async function usage() {
  const result = await request('/v1/usage');

  return result?.data || result;
}

module.exports = {
  request,

  todayFixtures,
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
  countries,
  teams,
  team,

  latestResults,

  status,
  usage,

  normalizeMatch
};
