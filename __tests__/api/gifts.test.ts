import { NextRequest } from "next/server";
import { POST } from "@/app/api/gifts/route";
import { db } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(),
  },
}));

jest.mock("@/server/services/otpService", () => ({
  generateOTP: jest.fn(() => "123456"),
  storeGiftOTP: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/server/services/emailService", () => ({
  sendGiftConfirmationOTP: jest.fn(() => ({ success: true })),
}));

function mockInsertReturning(result: unknown) {
  (db.insert as jest.Mock).mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([result]),
    }),
  });
}

describe("POST /api/gifts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create a gift successfully with valid data", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "recipient-123",
      email: "recipient@example.com",
      name: "Recipient User",
    });
    mockInsertReturning({ id: "gift-123" });

    const request = new NextRequest("http://localhost/api/gifts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "sender-123",
        "x-user-email": "sender@example.com",
      },
      body: JSON.stringify({
        recipient: "recipient-123",
        amount: 100,
        currency: "USD",
        message: "Happy Birthday!",
        template: "birthday",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.giftId).toBe("gift-123");
    expect(data.status).toBe("pending_otp");
  });

  it("should return 404 if recipient does not exist", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/gifts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "sender-123",
        "x-user-email": "sender@example.com",
      },
      body: JSON.stringify({ recipient: "nonexistent-123", amount: 100, currency: "USD" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("should return 422 for invalid amount", async () => {
    const request = new NextRequest("http://localhost/api/gifts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "sender-123",
        "x-user-email": "sender@example.com",
      },
      body: JSON.stringify({ recipient: "recipient-123", amount: -100, currency: "USD" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("should return 422 if trying to send gift to self", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "sender-123" });

    const request = new NextRequest("http://localhost/api/gifts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "sender-123",
        "x-user-email": "sender@example.com",
      },
      body: JSON.stringify({ recipient: "sender-123", amount: 100, currency: "USD" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("should return 401 if not authenticated", async () => {
    const request = new NextRequest("http://localhost/api/gifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: "recipient-123", amount: 100, currency: "USD" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("should return 400 for missing required fields", async () => {
    const request = new NextRequest("http://localhost/api/gifts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "sender-123",
        "x-user-email": "sender@example.com",
      },
      body: JSON.stringify({ amount: 100, currency: "USD" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Recipient and amount are required");
  });
});
