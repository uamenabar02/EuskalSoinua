import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { verifyAdminPasscode, updateAdminPasscode, getAdminConfig } from "@/lib/access-db";

describe("Access Database & Security Hashing", () => {
  it("should securely hash and verify passcode with bcrypt", () => {
    const rawPasscode = "SecretPass123!";
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(rawPasscode, salt);

    expect(hash).not.toBe(rawPasscode);
    expect(bcrypt.compareSync(rawPasscode, hash)).toBe(true);
    expect(bcrypt.compareSync("WrongPassword", hash)).toBe(false);
  });

  it("should successfully update and verify admin passcode", async () => {
    const newPass = "NewSecureCode99#";
    await updateAdminPasscode(newPass);

    const isValid = await verifyAdminPasscode(newPass);
    expect(isValid).toBe(true);

    const isInvalid = await verifyAdminPasscode("IncorrectCode");
    expect(isInvalid).toBe(false);
  });

  it("should reject passcodes shorter than 6 characters", async () => {
    const result = await updateAdminPasscode("123");
    expect(result).toBe(false);
  });
});
