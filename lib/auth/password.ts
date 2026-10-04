import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return await argon2.verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await argon2.verify(await dummyHash, password);
  return false;
}
