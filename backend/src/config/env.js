// src/config/env.js
import dotenv from "dotenv";
import path from "path";

const NODE_ENV = process.env.NODE_ENV || "development";

const fileName = NODE_ENV === "production"
  ? ".env.production"
  : NODE_ENV === "test"
    ? ".env.test"
    : ".env.development";

const filePath = path.resolve(process.cwd(), fileName);

// load
const result = dotenv.config({ path: filePath });

if (result.error) {
  console.warn(`⚠️  dotenv couldn't load ${fileName} — check file exists at: ${filePath}`);
} else {
  console.log(`✅ Loaded environment file: ${fileName} (NODE_ENV=${NODE_ENV})`);
}
