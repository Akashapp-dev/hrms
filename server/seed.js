import bcrypt from 'bcryptjs';
import { readDB, writeDB } from './src/db.js';

// Minimal argv parser: --key value
function parseArgs(argv){
  const args = {}; let k=null;
  for(const a of argv.slice(2)){
    if(a.startsWith('--')){ k=a.replace(/^--/,''); args[k]=true; k=k; }
    else if(k){ args[k]=a; k=null; }
  }
  return args;
}

const args = parseArgs(process.argv);
const username = args.username || process.env.USERNAME || process.env.SEED_USERNAME;
const password = args.password || process.env.PASSWORD || process.env.SEED_PASSWORD;
const role = (args.role || process.env.ROLE || process.env.SEED_ROLE || 'admin').toLowerCase();
const name = args.name || process.env.NAME || process.env.SEED_NAME || username;

if(!username || !password){
  console.error('Usage: node seed.js --username <u> --password <p> [--role admin|editor|viewer] [--name "Full Name"]');
  process.exit(1);
}

const db = readDB();
db.users = db.users || [];
if(db.users.some(u=>u.username===username)){
  console.log(`User ${username} already exists.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
const now = Date.now();
const newUser = { id: `seed-${username}`, username, name, role, dept: '', passwordHash, createdAt: now, updatedAt: now };
db.users.push(newUser);
writeDB(db);
console.log(`Created user ${username} with role ${role}.`);

