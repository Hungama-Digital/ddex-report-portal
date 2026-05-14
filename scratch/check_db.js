import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'node:path';

const DB_PATH = path.resolve(process.cwd(), 'server', 'data', 'portal.sqlite');

async function checkDb() {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });
    const reports = await db.all('SELECT * FROM reports');
    console.log('REPORTS_COUNT:', reports.length);
    console.log('REPORTS:', JSON.stringify(reports, null, 2));
    
    const jobs = await db.all('SELECT * FROM report_jobs');
    console.log('JOBS_COUNT:', jobs.length);
    await db.close();
  } catch (err) {
    console.error('DB_ERROR:', err.message);
  }
}

checkDb();
