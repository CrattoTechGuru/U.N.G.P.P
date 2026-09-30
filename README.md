# Ultra Next Gen Pro Predictor — Production Build

This is a real Node.js/Express football application. It does not contain simulated match data.

## 1. Required API key

Create an API-Football/API-Sports account and obtain the API key.

API documentation:
https://www.api-football.com/documentation-v3

Set:

`API_FOOTBALL_KEY=YOUR_KEY`

Do NOT put the key in `public/app.js` or any HTML file.

## 2. Local run

Requirements:
- Node.js 20+
- API-Football/API-Sports key
- PostgreSQL is optional for the basic live app and recommended for persistence

Commands:

```bash
npm install
npm run check
npm start
```

Open:

`http://localhost:10000`

## 3. Render deployment

Create a new Web Service from this project.

Build command:

`npm install`

Start command:

`npm start`

Environment variables:

- `API_FOOTBALL_KEY` = your API-Football/API-Sports key
- `DATABASE_URL` = your PostgreSQL connection string (recommended)
- `DATABASE_SSL` = `true`
- `ADMIN_KEY` = a long random secret
- `NODE_ENV` = `production`
- `PORT` = `10000`
- `LIVE_POLL_SECONDS` = `60`
- `UPCOMING_DAYS` = `7`

## 4. What is real

The app uses API-Football for:
- live fixtures
- upcoming fixtures
- historical fixtures
- competitions
- H2H
- provider predictions

The local prediction engine calculates probabilities from real historical fixture results using a Poisson goal model, recent form and H2H, and blends the provider prediction when it is available.

It deliberately does NOT display a fake "98% guaranteed" label.

## 5. South Africa / Africa

The competition page searches the API provider dynamically. This avoids relying on a hard-coded list that can break when coverage changes.

Use the competition search for:
- South Africa
- Premiership
- Motsepe
- Nedbank
- Carling
- CAF Champions League
- CAF Confederation Cup
- African Football League

If a particular competition is returned by API-Football, the app can use its real league ID for fixture retrieval.

## 6. Database

If `DATABASE_URL` is configured, the server automatically creates:
- `predictions`
- `slips`

No database migration command is required.

## 7. Important prediction limitation

A probability is not a guarantee and is not automatically a measured historical accuracy rate. To claim a model accuracy percentage, run a proper historical backtest and compare predictions against outcomes. This build keeps those concepts separate.
