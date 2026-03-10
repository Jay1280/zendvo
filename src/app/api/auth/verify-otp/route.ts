import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyOTP } from "@/server/services/otpService";
import { sendSecurityAlertEmail } from "@/server/services/emailService";
import { validateEmail, sanitizeInput } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json(
        { success: false, error: "CSRF protection: Invalid origin" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: "Email and OTP are required" },
        { status: 400 },
      );
    }

    const sanitizedEmail = sanitizeInput(email);

    if (!validateEmail(sanitizedEmail)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, sanitizedEmail),
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    const result = await verifyOTP(user.id, otp);

    if (!result.success) {
      if (result.shouldSendAlert) {
        await sendSecurityAlertEmail(sanitizedEmail, user.name || undefined);
      }
      const status = result.locked ? 429 : 400;
      return NextResponse.json(
        { success: false, error: result.message },
        { status },
      );
    }

    return NextResponse.json(
      { success: true, message: "Email verified successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("[VERIFY_OTP_ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
