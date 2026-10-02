import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import {
  verifyAdminPasscode,
  updateAdminPasscode,
  getAdminConfig,
  signDeviceId,
  verifySignedDeviceId,
} from "@/lib/access-db";

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

  it("should cryptographically sign and verify device IDs", () => {
    const devId = "dev_iphone_15_pro_max";
    const signedToken = signDeviceId(devId);
    expect(signedToken).toContain(`${devId}.`);

    const verification = verifySignedDeviceId(signedToken);
    expect(verification.valid).toBe(true);
    expect(verification.deviceId).toBe(devId);

    // Tampered token should fail
    const tampered = `${signedToken}bad`;
    expect(verifySignedDeviceId(tampered).valid).toBe(false);

    // Forged device ID with same signature should fail
    const forged = `dev_attacker.${signedToken.split(".")[1]}`;
    expect(verifySignedDeviceId(forged).valid).toBe(false);
  });
});
