import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";

export const db = drizzle({ schema });

/** Connection type, so helpers can accept a different instance under test. */
export type Db = typeof db;
