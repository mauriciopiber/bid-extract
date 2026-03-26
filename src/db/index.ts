import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error("DATABASE_URL is required");
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

/** Close the DB connection — call this before process.exit in CLI commands */
export async function closeDb() {
	await client.end();
}

export { schema };
export type DB = typeof db;
