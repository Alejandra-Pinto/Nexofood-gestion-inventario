const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  await client.connect();
  console.log('Connected to DB. Executing 008_modificaciones_y_anulaciones.sql...');
  const sql = fs.readFileSync(path.join(__dirname, '..', '008_modificaciones_y_anulaciones.sql'), 'utf8');
  await client.query(sql);
  console.log('Migration 008 applied successfully!');
  await client.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
