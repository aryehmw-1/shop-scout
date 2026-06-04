import { readFile } from "fs/promises";
import path from "path";
import type { ProductOffer, PublicUser, UserAddress, UserPreferences } from "../types";
import {
  createUser as dbCreateUser,
  findUserByEmail as dbFindByEmail,
  findUserById as dbFindById,
  toPublicUser,
  updateUser as dbUpdateUser,
  verifyUser as dbVerifyUser,
} from "../db/users-repository";
import { prisma } from "../db/prisma";

/** Legacy JSON shape for one-time migration */
interface LegacyStoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  address: UserAddress;
  preferences: UserPreferences;
  savedOffers: ProductOffer[];
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function migrateLegacyUsersIfNeeded(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  try {
    const raw = await readFile(USERS_FILE, "utf-8");
    const legacy = JSON.parse(raw) as LegacyStoredUser[];
    if (!legacy.length) return;

    for (const u of legacy) {
      await prisma.user.create({
        data: {
          id: u.id,
          email: u.email.toLowerCase(),
          name: u.name,
          passwordHash: u.passwordHash,
          zipCode: u.address.zipCode,
          addressJson: JSON.stringify(u.address),
          preferencesJson: JSON.stringify(u.preferences),
          savedOffers: {
            create: u.savedOffers.map((o) => ({ offerJson: JSON.stringify(o) })),
          },
        },
      });
    }
    console.info(`[auth] Migrated ${legacy.length} users from users.json → SQLite`);
  } catch {
    // No legacy file
  }
}

async function ensureDb(): Promise<void> {
  await migrateLegacyUsersIfNeeded();
}

export { toPublicUser };

export async function findUserByEmail(email: string) {
  await ensureDb();
  return dbFindByEmail(email);
}

export async function findUserById(id: string) {
  await ensureDb();
  const row = await dbFindById(id);
  return row ? toPublicUser(row) : null;
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  address: UserAddress;
}): Promise<PublicUser> {
  await ensureDb();
  return dbCreateUser(input);
}

export async function verifyUser(email: string, password: string) {
  await ensureDb();
  return dbVerifyUser(email, password);
}

export async function updateUser(
  id: string,
  patch: Partial<{
    name: string;
    address: UserAddress;
    preferences: UserPreferences;
    savedOffers: ProductOffer[];
  }>,
): Promise<PublicUser | null> {
  await ensureDb();
  return dbUpdateUser(id, patch);
}
