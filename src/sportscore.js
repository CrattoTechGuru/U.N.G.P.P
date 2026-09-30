'use strict';

const BASE = 'https://sportscore.com/api';

const TZ = process.env.API_FOOTBALL_TIMEZONE || 'Africa/Johannesburg';

async function request(path, params = {}) {
  const url = new URL(`${BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Ultra-Next-Gen-Pro-Predictor/1.0'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `SportScore HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('SportScore returned invalid JSON');
  }

  return data;
}

/*
 * SportScore returns a match-oriented structure.
 * These normalizers keep the rest of the predictor independent
 * from the provider.
 */

function normalizeMatch(match) {
  if (!match) return null;

  const home =
    match.home ||
    match.home_team ||
    match.homeTeam ||
    {};

  const away =
    match.away ||
    match.away_team ||
    match.awayTeam ||
    {};

  const homeName =
    typeof home === 'string'
      ? home
      : home.name || home.title || 'Home';

  const awayName =
    typeof away === 'string'
      ? away
      : away.name || away.title || 'Away';

  return {
    id: String(
      match.id ||
      match.fixture_id ||
      match.match_id ||
      match.slug ||
      ''
    ),

    slug: match.slug || null,

    home: {
      id: home.id || null,
      name: homeName,
      logo: home.logo || home.image || match.home_logo || null
    },

    away: {
      id: away.id || null,
      name: awayName,
      logo: away.logo || away.image || match.away_logo || null
    },

    homeScore:
      match.home_score ??
      match.homeScore ??
      match.score?.home ??
      null,

    awayScore:
      match.away_score ??
      match.awayScore ??
      match.score?.away ??
      null,

    status:
      match.status ||
      match.state ||
      match.match_status ||
      'unknown',

    statusText:
      match.status_text ||
      match.statusText ||
      '',

    date:
      match.time ||
      match.date ||
      match.start_time ||
      match.startTime ||
      null,

    competition:
      match.competition ||
      match.league ||
      match.tournament ||
      null,

    raw: match
  };
}

function extractMatches(data) {
  if (!data) return [];

  const list =
    data.matches ||
    data.fixtures ||
    data.events ||
    data.results ||
    [];

  if (!Array.isArray(list)) return [];

  return list
    .map(normalizeMatch)
    .filter(Boolean);
}

/**
 * Live matches
 */
async function liveFixtures() {
  const data = await request('/widget/matches/', {
    sport: 'football',
    limit: 50
  });

  const matches = extractMatches(data);

  return matches.filter((m) => {
    const status = String(m.status || '').toLowerCase();

    return (
      status.includes('live') ||
      status.includes('progress') ||
      status.includes('playing') ||
      status === '1h' ||
      status === '2h' ||
      status === 'ht'
    );
  });
}

/**
 * Upcoming matches.
 *
 * SportScore's public fixtures endpoint works by calendar day.
 * We therefore request each day separately.
 */
async function upcomingFixtures(days = Number(process.env.UPCOMING_DAYS || 7)) {
  const safeDays = Math.max(1, Math.min(Number(days) || 7, 14));

  const output = [];

  const start = new Date();

  for (let i = 0; i < safeDays; i++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');

    const data = await request('/v1/fixtures/', {
      sport: 'football',
      date: `${yyyy}-${mm}-${dd}`,
      status: 'upcoming',
      limit: 200
    });

    output.push(...extractMatches(data));
  }

  return output;
}

/**
 * Today's/all fixtures for a date.
 */
async function fixturesByDate(date, options = {}) {
  const data = await request('/v1/fixtures/', {
    sport: 'football',
    date,
    status: options.status,
    competition: options.competition,
    team: options.team,
    limit: options.limit || 200
  });

  return extractMatches(data);
}

/**
 * Team recent + upcoming schedule.
 */
async function teamFixtures(team, limit = 30) {
  if (!team) throw new Error('team is required');

  const data = await request('/widget/team/', {
    sport: 'football',
    slug: team,
    limit: Math.min(Number(limit) || 30, 50)
  });

  return extractMatches(data);
}

/**
 * Head-to-head
 */
async function h2h(home, away, limit = 20) {
  if (!home || !away) {
    throw new Error('home and away teams are required');
  }

  const data = await request('/v1/h2h/', {
    sport: 'football',
    team1: home,
    team2: away,
    limit: Math.min(Number(limit) || 20, 50)
  });

  return extractMatches(data);
}

/**
 * Single match.
 */
async function fixture(slug) {
  if (!slug) throw new Error('match slug is required');

  const data = await request('/widget/match/', {
    sport: 'football',
    slug
  });

  return data;
}

/**
 * Standings.
 */
async function standings(competition) {
  if (!competition) {
    throw new Error('competition slug is required');
  }

  return request('/widget/standings/', {
    sport: 'football',
    slug: competition
  });
}

/**
 * Competition/team/player search.
 */
async function search(query, limit = 20) {
  if (!query || String(query).trim().length < 2) {
    return {
      teams: [],
      competitions: [],
      players: []
    };
  }

  const data = await request('/v1/search/', {
    sport: 'football',
    q: String(query).trim(),
    limit: Math.min(Number(limit) || 20, 20)
  });

  return data;
}

/**
 * Raw SportScore request for provider-specific features.
 */
async function raw(path, params = {}) {
  return request(path, params);
}

/**
 * Provider health check.
 */
async function status() {
  try {
    const data = await request('/widget/matches/', {
      sport: 'football',
      limit: 1
    });

    return {
      ok: true,
      provider: 'sportscore',
      matches: Array.isArray(data.matches)
        ? data.matches.length
        : 0,
      timezone: TZ
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'sportscore',
      error: error.message
    };
  }
}

module.exports = {
  liveFixtures,
  upcomingFixtures,
  fixturesByDate,
  teamFixtures,
  h2h,
  fixture,
  standings,
  search,
  raw,
  status,
  normalizeMatch
};
