const { Pool } = require("pg");
let pool=null;

function enabled(){ return Boolean(process.env.DATABASE_URL); }
async function init(){
  if(!enabled()) return;
  pool=new Pool({
    connectionString:process.env.DATABASE_URL,
    ssl:String(process.env.DATABASE_SSL).toLowerCase()==="false"?false:{rejectUnauthorized:false}
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id BIGSERIAL PRIMARY KEY,
      fixture_id BIGINT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS slips (
      id BIGSERIAL PRIMARY KEY,
      name TEXT,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
async function health(){
  if(!pool) return {enabled:false};
  try { await pool.query("SELECT 1"); return {enabled:true,connected:true}; }
  catch(e){ return {enabled:true,connected:false,error:e.message}; }
}
async function savePrediction(p){
  if(!pool) return null;
  const r=await pool.query("INSERT INTO predictions(fixture_id,payload) VALUES($1,$2) RETURNING id,created_at",[p.fixtureId,p]);
  return r.rows[0];
}
async function saveSlip(payload){
  if(!pool) return {id:null,...payload,stored:false,reason:"DATABASE_URL not configured"};
  const r=await pool.query("INSERT INTO slips(name,payload) VALUES($1,$2) RETURNING id,created_at",[payload.name||"Untitled slip",payload]);
  return {...r.rows[0],stored:true};
}
async function listSlips(){
  if(!pool) return [];
  const r=await pool.query("SELECT id,name,payload,created_at FROM slips ORDER BY created_at DESC LIMIT 50");
  return r.rows;
}
module.exports={init,health,enabled,savePrediction,saveSlip,listSlips};
