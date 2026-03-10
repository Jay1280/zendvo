import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateOTP, storeOTP } from "@/server/services/otpService";
import { sendVerificationEmail } from "@/server/services/emailService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, name } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 },
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status === "active") {
      return NextResponse.json(
        { message: "Email already verified" },
        { status: 200 },
      );
    }

    const otp = generateOTP();
    await storeOTP(userId, otp);

    const emailResult = await sendVerificationEmail(email, otp, name);

    if (!emailResult.success) {
      console.error("Failed to send email:", emailResult.error);
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent successfully",
      expiresIn: "10 minutes",
    });
  } catch (error) {
    console.error("Error in send-verification:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
