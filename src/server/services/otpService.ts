import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { users, emailVerifications, gifts } from "@/lib/db/schema";
import { eq, and, desc, lt, or } from "drizzle-orm";
import { sanitizePhoneNumber, validateE164PhoneNumber } from "@/lib/validation";

export function generateOTP(): string {
  // CSPRNG compliant
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generates a SHA-256 hash of the OTP with a unique salt.
 */
export function hashOTP(otp: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHmac("sha256", salt).update(otp).digest("hex");
  return { salt, hash };
}

/**
 * Verifies an OTP against a stored hash and salt using constant-time comparison.
 */
export function verifyOTPHash(
  otp: string,
  storedHash: string,
  salt: string,
): boolean {
  const hash = crypto.createHmac("sha256", salt).update(otp).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

export async function sendOTP(phoneNumber: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    // Validate and sanitize phone number
    if (!validateE164PhoneNumber(phoneNumber)) {
      return {
        success: false,
        message: "Invalid phone number format. Please use E.164 format (e.g., +2348123456789)",
        error: "INVALID_PHONE_FORMAT"
      };
    }

    const sanitizedPhone = sanitizePhoneNumber(phoneNumber);

    // Find user by phone number
    const user = await db.query.users.findFirst({
      where: eq(users.phoneNumber, sanitizedPhone),
    });

    if (!user) {
      return {
        success: false,
        message: "User not found with this phone number",
        error: "USER_NOT_FOUND"
      };
    }

    if (user.status === "suspended") {
      return {
        success: false,
        message: "Account suspended",
        error: "ACCOUNT_SUSPENDED"
      };
    }

    // Generate and store OTP
    const otp = generateOTP();
    await storeOTP(user.id, otp);

    // TODO: Integrate with SMS provider (e.g., Twilio, AWS SNS)
    // For now, we'll log the OTP (in production, this should send via SMS)
    console.log(`[SMS_OTP] Phone: ${sanitizedPhone}, OTP: ${otp}`);

    // Mock SMS sending - replace with actual SMS provider integration
    const smsResult = await sendSMSViaProvider(sanitizedPhone, `Your Zendvo verification code is: ${otp}. Valid for 10 minutes.`);

    if (!smsResult.success) {
      console.error("Failed to send OTP SMS:", smsResult.error);
      return {
        success: false,
        message: "Failed to send OTP SMS",
        error: "SMS_SEND_FAILED"
      };
    }

    console.log(`[AUDIT] SMS OTP sent to ${sanitizedPhone} for user ${user.id}`);

    return {
      success: true,
      message: "OTP sent successfully via SMS"
    };

  } catch (error) {
    console.error("[SEND_PHONE_OTP_ERROR]", error);
    return {
      success: false,
      message: "Internal server error",
      error: "INTERNAL_ERROR"
    };
  }
}

// Mock SMS provider function - replace with actual integration
async function sendSMSViaProvider(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    // TODO: Replace with actual SMS provider integration (Twilio, AWS SNS, etc.)
    // Example with Twilio:
    // const twilio = require('twilio');
    // const client = twilio(accountSid, authToken);
    // await client.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phoneNumber
    // });

    // For now, simulate successful SMS sending
    console.log(`[MOCK_SMS] To: ${phoneNumber}, Message: ${message}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown SMS error" };
  }
}

export async function storeOTP(userId: string, otp: string) {
  const { salt, hash } = hashOTP(otp);
  const storedValue = `${salt}:${hash}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Invalidate previous unused OTPs
  await db
    .update(emailVerifications)
    .set({ isUsed: true })
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.isUsed, false),
      ),
    );

  console.log(`[AUDIT] OTP generated for user ${userId}`);

  const [newVerification] = await db
    .insert(emailVerifications)
    .values({
      userId,
      otpHash: storedValue,
      expiresAt,
      attempts: 0,
      isUsed: false,
    })
    .returning();

  return newVerification;
}

export async function verifyOTP(userId: string, otp: string) {
  const verification = await db.query.emailVerifications.findFirst({
    where: and(
      eq(emailVerifications.userId, userId),
      eq(emailVerifications.isUsed, false),
    ),
    orderBy: [desc(emailVerifications.createdAt)],
  });

  if (!verification) {
    return {
      success: false,
      message: "No verification code found. Please request a new one.",
    };
  }

  if (new Date() > verification.expiresAt) {
    return {
      success: false,
      message: "Verification code has expired. Please request a new one.",
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (user && user.lockUntil && new Date() < user.lockUntil) {
    return {
      success: false,
      message: "Account is temporarily locked. Please try again later.",
      locked: true,
    };
  }

  if (verification.attempts >= 5) {
    return {
      success: false,
      message: "Maximum attempts exceeded. Account is locked.",
      locked: true,
    };
  }

  let isValid = false;
  const storedHash = verification.otpHash;

  if (storedHash.includes(":")) {
    const [salt, hash] = storedHash.split(":");
    isValid = verifyOTPHash(otp, hash, salt);
  } else {
    isValid = await bcrypt.compare(otp, storedHash);
  }

  if (!isValid) {
    const newAttempts = verification.attempts + 1;

    await db
      .update(emailVerifications)
      .set({ attempts: newAttempts })
      .where(eq(emailVerifications.id, verification.id));

    if (newAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      await db.update(users).set({ lockUntil }).where(eq(users.id, userId));

      return {
        success: false,
        message: "Maximum attempts exceeded. Account locked for 30 minutes.",
        locked: true,
        shouldSendAlert: true,
      };
    }

    const remainingAttempts = 5 - newAttempts;
    return {
      success: false,
      message: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
      remainingAttempts,
    };
  }

  // Success path
  await db
    .delete(emailVerifications)
    .where(eq(emailVerifications.id, verification.id));

  await db
    .update(users)
    .set({
      status: "active",
      lockUntil: null,
      loginAttempts: 0,
    })
    .where(eq(users.id, userId));

  return { success: true, message: "Email verified successfully!" };
}

export async function cleanupExpiredOTPs() {
  const result = await db
    .delete(emailVerifications)
    .where(
      or(
        lt(emailVerifications.expiresAt, new Date()),
        lt(
          emailVerifications.createdAt,
          new Date(Date.now() - 24 * 60 * 60 * 1000),
        ),
      ),
    )
    .returning();
  return result.length;
}

export async function storeGiftOTP(giftId: string, otp: string) {
  const saltRounds = 10;
  const otpHash = await bcrypt.hash(otp, saltRounds);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  return await db
    .update(gifts)
    .set({
      otpHash,
      otpExpiresAt: expiresAt,
      otpAttempts: 0,
    })
    .where(eq(gifts.id, giftId))
    .returning();
}

const MAX_GIFT_OTP_ATTEMPTS = 5;

export async function verifyGiftOTP(
  gift: {
    id: string;
    otpHash: string | null;
    otpExpiresAt: Date | null;
    otpAttempts: number;
  },
  otp: string,
) {
  if (!gift.otpHash || !gift.otpExpiresAt) {
    return {
      success: false,
      message: "No verification code found for this gift.",
    };
  }

  if (gift.otpAttempts >= MAX_GIFT_OTP_ATTEMPTS) {
    return {
      success: false,
      message: "Maximum attempts exceeded. This gift has been locked.",
      locked: true,
    };
  }

  if (new Date() > gift.otpExpiresAt) {
    return {
      success: false,
      message: "Verification code has expired. Please request a new one.",
    };
  }

  const isValid = await bcrypt.compare(otp, gift.otpHash);

  if (!isValid) {
    await db
      .update(gifts)
      .set({ otpAttempts: gift.otpAttempts + 1 })
      .where(eq(gifts.id, gift.id));

    const remainingAttempts = MAX_GIFT_OTP_ATTEMPTS - (gift.otpAttempts + 1);
    return {
      success: false,
      message: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`,
      remainingAttempts,
      locked: remainingAttempts <= 0,
    };
  }

  await db
    .update(gifts)
    .set({
      status: "otp_verified",
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    })
    .where(eq(gifts.id, gift.id));

  return { success: true, message: "Gift OTP verified successfully!" };
}
