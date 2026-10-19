#!/usr/bin/env node
// Builds the sample app's studio database on a LOCAL Postgres and writes
// apps/sample/.env.local so `pnpm dev` serves /studio against it.
//
//   pnpm --filter sample studio:db        # create, or rebuild from scratch
//
// Postgres: STUDIO_ADMIN_DATABASE_URL, default the studio-server test
// container (`pnpm --filter @marktiderman/genesis-studio-server test:db`
// starts it on 127.0.0.1:59432). Refuses any host but localhost: this script
// drops and recreates a database.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { studioSetupSql } from "@marktiderman/genesis-studio-server";

const here = dirname(fileURLToPath(import.meta.url));
const adminUrl = new URL(process.env.STUDIO_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:59432/postgres");
if (!["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname)) {
  console.error(`Refusing to touch ${adminUrl.hostname}: this script only builds a local database.`);
  process.exit(1);
}

const DATABASE = "genesis_sample";
const LOGIN_ROLE = "genesis_studio_login";
const [sam, riley] = JSON.parse(readFileSync(join(here, "dev-users.json"), "utf8"));
const USERS = { sam, riley };

const password = randomBytes(18).toString("base64url");
const jwtSecret = randomBytes(32).toString("base64url");

const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
await admin.unsafe(`drop database if exists ${DATABASE} with (force)`);
await admin.unsafe(`create database ${DATABASE}`);
await admin.unsafe(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = '${LOGIN_ROLE}') then
      create role ${LOGIN_ROLE} login noinherit;
    end if;
  end $$;`);
await admin.unsafe(`alter role ${LOGIN_ROLE} password '${password}'`);
await admin.end();

const dbUrl = new URL(adminUrl);
dbUrl.pathname = `/${DATABASE}`;
const db = postgres(dbUrl.toString(), { max: 1, onnotice: () => {} });
await db.unsafe(readFileSync(join(here, "bootstrap.sql"), "utf8"));
await db.unsafe(`grant authenticated to ${LOGIN_ROLE}`);
await db.unsafe(readFileSync(join(here, "schema.sql"), "utf8"));
await db.unsafe(studioSetupSql({ loginRole: LOGIN_ROLE }));
await db.unsafe(
  `insert into public.categories values (1, 'Electronics'), (2, 'Stationery'), (3, 'Apparel'), (4, 'Kitchen'), (5, 'Office'), (6, 'Fitness')`,
);
await db.unsafe(
  `insert into public.products (owner_id, name, status, category_id, price, internal_cost) values
     ($1, 'Wireless Headphones', 'Active', 1, 79.99, 31.00),
     ($1, 'Leather Notebook', 'Active', 2, 24.50, 6.10),
     ($1, 'Running Shoes', 'Draft', 3, 129.00, 52.00),
     ($1, 'Ceramic Mug', 'Active', 4, 18.00, 4.25),
     ($1, 'Desk Lamp', 'Archived', 5, 45.00, 19.00),
     ($2, 'Yoga Mat', 'Active', 6, 35.00, 11.00),
     ($2, 'Coffee Beans', 'Active', 4, 22.00, 9.00)`,
  [USERS.sam.id, USERS.riley.id],
);
await db.unsafe(
  `insert into public.orders (id, owner_id, customer, status) values
     (1001, $1, 'Ada Lovelace', 'Paid'), (1002, $1, 'Grace Hopper', 'Pending'), (1003, $2, 'Alan Turing', 'Shipped')`,
  [USERS.sam.id, USERS.riley.id],
);
await db.unsafe(
  `insert into public.order_lines (order_id, line_no, owner_id, product, quantity, note) values
     (1001, 1, $1, 'Wireless Headphones', 1, null),
     (1001, 2, $1, 'Ceramic Mug', 2, 'gift wrap'),
     (1002, 1, $1, 'Leather Notebook', 3, null),
     (1003, 1, $2, 'Yoga Mat', 1, null)`,
  [USERS.sam.id, USERS.riley.id],
);
await db.end();

const loginUrl = new URL(dbUrl);
loginUrl.username = LOGIN_ROLE;
loginUrl.password = password;
const envPath = join(here, "..", ".env.local");
writeFileSync(
  envPath,
  [
    "# Written by studio/setup-db.mjs for local development. Not committed.",
    `STUDIO_DATABASE_URL=${loginUrl.toString()}`,
    "STUDIO_AUTH=dev",
    `STUDIO_DEV_JWT_SECRET=${jwtSecret}`,
    "",
  ].join("\n"),
);
console.log(`Built ${DATABASE} on ${adminUrl.host} and wrote ${envPath}.`);
console.log("Run `pnpm --filter sample dev` and open http://localhost:3200/studio");
