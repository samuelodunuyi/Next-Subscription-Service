import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password authentication", () => {
  it("hashes a password and verifies the original password", async () => {
    const password = "Password123!";

    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);

    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const passwordHash = await hashPassword("Password123!");

    await expect(verifyPassword(passwordHash, "WrongPassword123!")).resolves.toBe(false);
  });
});
