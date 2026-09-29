import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import env from "./env";

// Separate lightweight pg Pool dedicated to the session store (connect-pg-simple
// manages its own table `session` and does not need the Prisma client).
export const sessionPool = new Pool({
  connectionString: env.DATABASE_URL,
});

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    pool: sessionPool,
    tableName: "session",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15, // prune expired sessions every 15 min
  }),
  name: "tuition.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
});

export default sessionMiddleware;
