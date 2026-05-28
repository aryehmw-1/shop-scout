import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { ProductOffer, PublicUser, UserAddress, UserPreferences } from "../types";
import type { LearningProfile } from "../types";

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toPublicUser(row: {
  id: string;
  email: string;
  name: string;
  zipCode: string | null;
  addressJson: string;
  preferencesJson: string;
  savedOffers: { offerJson: string }[];
}): PublicUser {
  const address = parseJson<UserAddress>(row.addressJson, {
    street: "",
    city: "",
    state: "",
    zipCode: row.zipCode ?? "",
  });
  const preferences = parseJson<UserPreferences>(row.preferencesJson, {
    zipCode: row.zipCode ?? address.zipCode,
    locationSet: Boolean(row.zipCode),
    organicPreferred: false,
  });
  const savedOffers = row.savedOffers.map((s) =>
    parseJson<ProductOffer>(s.offerJson, {} as ProductOffer),
  );

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    address,
    preferences,
    savedOffers,
  };
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { savedOffers: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { savedOffers: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  address: UserAddress;
}): Promise<PublicUser> {
  const existing = await findUserByEmail(input.email);
  if (existing) throw new Error("An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const preferences: UserPreferences = {
    zipCode: input.address.zipCode,
    locationSet: true,
    organicPreferred: false,
  };

  const row = await prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
      zipCode: input.address.zipCode,
      addressJson: JSON.stringify(input.address),
      preferencesJson: JSON.stringify(preferences),
    },
    include: { savedOffers: true },
  });

  return toPublicUser(row);
}

export async function verifyUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
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
  const current = await findUserById(id);
  if (!current) return null;

  const address = patch.address ?? parseJson<UserAddress>(current.addressJson, {
    street: "",
    city: "",
    state: "",
    zipCode: current.zipCode ?? "",
  });
  let preferences =
    patch.preferences ?? parseJson<UserPreferences>(current.preferencesJson, {
      zipCode: current.zipCode ?? "",
      locationSet: true,
      organicPreferred: false,
    });

  if (patch.address) {
    preferences = {
      ...preferences,
      zipCode: patch.address.zipCode,
      locationSet: true,
    };
  }

  if (patch.savedOffers) {
    await prisma.savedOffer.deleteMany({ where: { userId: id } });
    if (patch.savedOffers.length > 0) {
      await prisma.savedOffer.createMany({
        data: patch.savedOffers.map((o) => ({
          userId: id,
          offerJson: JSON.stringify(o),
        })),
      });
    }
  }

  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(patch.name ? { name: patch.name.trim() } : {}),
      zipCode: address.zipCode,
      addressJson: JSON.stringify(address),
      preferencesJson: JSON.stringify(preferences),
    },
    include: { savedOffers: { orderBy: { createdAt: "desc" }, take: 200 } },
  });

  return toPublicUser(row);
}

export async function updateLearningProfile(
  userId: string,
  profile: LearningProfile,
): Promise<void> {
  const user = await findUserById(userId);
  if (!user) return;
  const preferences = parseJson<UserPreferences>(user.preferencesJson, {
    zipCode: user.zipCode ?? "",
    locationSet: true,
    organicPreferred: false,
  });
  preferences.learningProfile = profile;
  await prisma.user.update({
    where: { id: userId },
    data: { preferencesJson: JSON.stringify(preferences) },
  });
}
