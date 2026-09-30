# South Africa + Africa competition fix

This patch keeps the V1000 UI, predictor, slips, login, menu, footer and existing Football Soccer API integration unchanged.

## Render environment
Set one Football Soccer API key:
- FOOTBALL_SOCCER_API_KEY=YOUR_FOOTBALL_SOCCER_API_KEY

Aliases also accepted by the backend:
- FOOTBALL_SOCCER_API_KEY
- FOOTBALL_FOOTBALL_SOCCER_API_KEY

Optional:
- API_SPORTS_SEASON=2026
- API_SPORTS_LEAGUE_IDS=288,...

If `API_SPORTS_LEAGUE_IDS` is left empty, the backend automatically discovers current South African competitions and major CAF/African competitions, then imports their fixtures.

After changing Render environment variables, redeploy/restart the service and use **Refresh football data** in the app.
