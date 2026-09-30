const api = require("./api-football");

function avg(a) { const x=a.filter(Number.isFinite); return x.length ? x.reduce((p,c)=>p+c,0)/x.length : 0; }
function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }
function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for(let i=1;i<=k;i++) p *= lambda/i;
  return p;
}
function outcomeProbs(hg, ag) {
  let h=0,d=0,a=0;
  for(let i=0;i<=8;i++) for(let j=0;j<=8;j++){
    const p=poisson(i,hg)*poisson(j,ag);
    if(i>j)h+=p; else if(i===j)d+=p; else a+=p;
  }
  const s=h+d+a || 1;
  return { home:h/s, draw:d/s, away:a/s };
}
function recentForm(fixtures, teamId) {
  const completed = fixtures.filter(f => ["FT","AET","PEN"].includes(f.fixture?.status?.short));
  const scored=[], conceded=[], points=[];
  for(const f of completed) {
    const isHome=f.teams.home.id===teamId;
    const gf=isHome?f.goals.home:f.goals.away;
    const ga=isHome?f.goals.away:f.goals.home;
    if(Number.isFinite(gf)&&Number.isFinite(ga)){
      scored.push(gf); conceded.push(ga);
      points.push(gf>ga?3:gf===ga?1:0);
    }
  }
  return { gf:avg(scored), ga:avg(conceded), points:avg(points), n:scored.length };
}
function providerBlend(local, provider) {
  if(!provider?.predictions?.percent) return local;
  const p=provider.predictions.percent;
  const ph=parseFloat(p.home)/100, pd=parseFloat(p.draw)/100, pa=parseFloat(p.away)/100;
  if(![ph,pd,pa].every(Number.isFinite)) return local;
  return {
    home: local.home*0.65+ph*0.35,
    draw: local.draw*0.65+pd*0.35,
    away: local.away*0.65+pa*0.35
  };
}
function pick(probs) {
  const entries=[["HOME",probs.home],["DRAW",probs.draw],["AWAY",probs.away]].sort((a,b)=>b[1]-a[1]);
  const [best, p]=entries[0];
  const second=entries[1][1];
  if(p<0.45) return {market:"DOUBLE_CHANCE", pick:best==="HOME"?"HOME_OR_DRAW":best==="AWAY"?"AWAY_OR_DRAW":"HOME_OR_AWAY", probability:1-second};
  return {market:"1X2", pick:best, probability:p};
}

async function predictFixture(fixtureId) {
  const f=await api.fixture(fixtureId);
  if(!f) throw new Error("Fixture not found");
  const homeId=f.home.id, awayId=f.away.id;
  const [homeLast, awayLast, hh, provider] = await Promise.all([
    api.lastTeam(homeId, 10), api.lastTeam(awayId, 10), api.h2h(homeId, awayId, 10), api.providerPrediction(fixtureId).catch(()=>null)
  ]);
  const hf=recentForm(homeLast, homeId), af=recentForm(awayLast, awayId);
  const h2hHome=recentForm(hh, homeId), h2hAway=recentForm(hh, awayId);

  // Data-driven expected goals: recent scoring/conceding + home advantage + H2H.
  const hAttack = hf.gf || 1.1, aAttack = af.gf || 1.0;
  const hDefense = hf.ga || 1.1, aDefense = af.ga || 1.1;
  const hhH = h2hHome.n ? h2hHome.gf : hAttack;
  const hhA = h2hAway.n ? h2hAway.gf : aAttack;
  let homeXg = 0.48*hAttack + 0.27*aDefense + 0.15*hhH + 0.10*1.10;
  let awayXg = 0.48*aAttack + 0.27*hDefense + 0.15*hhA;
  homeXg = clamp(homeXg,0.25,3.8); awayXg=clamp(awayXg,0.20,3.5);

  let probs=outcomeProbs(homeXg,awayXg);
  probs=providerBlend(probs,provider);
  const total=probs.home+probs.draw+probs.away;
  probs={home:probs.home/total,draw:probs.draw/total,away:probs.away/total};
  const selection=pick(probs);
  const btts=1-(poisson(0,homeXg)+poisson(0,awayXg)-poisson(0,homeXg)*poisson(0,awayXg));
  const over25 = 1 - [0,1,2].reduce((s,k)=>{
    let row=0; for(let i=0;i<=k;i++) row+=poisson(i,homeXg)*poisson(k-i,awayXg); return s+row;
  },0);
  const confidence=Math.round(clamp(selection.probability,0.25,0.95)*100);
  return {
    fixtureId, match:`${f.home.name} vs ${f.away.name}`, kickoff:f.date, league:f.league,
    probabilities:{home:+probs.home.toFixed(4),draw:+probs.draw.toFixed(4),away:+probs.away.toFixed(4)},
    expectedGoals:{home:+homeXg.toFixed(2),away:+awayXg.toFixed(2)},
    markets:{
      main:selection,
      btts:{pick:btts>=0.5?"YES":"NO", probability:+Math.max(btts,1-btts).toFixed(4)},
      over25:{pick:over25>=0.5?"OVER 2.5":"UNDER 2.5", probability:+Math.max(over25,1-over25).toFixed(4)}
    },
    confidence,
    sample:{homeRecent:hf,awayRecent:af,h2hHome,h2hAway},
    providerPrediction: provider ? {
      winner:provider.predictions?.winner?.name || null,
      advice:provider.predictions?.advice || null,
      percent:provider.predictions?.percent || null
    } : null,
    methodology:"Real historical fixture data + Poisson goal model + H2H + provider forecast blend. Confidence is model probability, not a guaranteed win rate."
  };
}

module.exports={predictFixture};
