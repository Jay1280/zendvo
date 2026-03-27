import { NextRequest } from "next/server";
import { POST } from "@/app/api/gifts/public/[giftId]/confirm/route";
import { db } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  db: {
    query: {
      gifts: {
        findFirst: jest.fn(),
      },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

jest.mock("@/server/services/transactionService", () => ({
  processGiftTransaction: jest.fn(() => Promise.resolve("txn_mock-uuid-1234")),
}));

jest.mock("@/server/services/notificationService", () => ({
  notifyGiftConfirmed: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/server/services/emailService", () => ({
  sendGiftCompletionToSender: jest.fn(() => Promise.resolve({ success: true })),
  sendGiftNotificationToRecipient: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock("@/lib/tokens", () => ({
  generateShareLinkToken: jest.fn(() => "mock-share-token-1234"),
}));

const mockGift = {
  id: "gift-123",
  senderId: "sender-123",
  recipientId: "recipient-456",
  amount: 100,
  currency: "USD",
  status: "pending_review",
  transactionId: null,
  message: "Happy Birthday!",
  template: "birthday",
  senderName: "John Sender",
  senderEmail: "sender@example.com",
  shareLink: null,
  shareLinkToken: null,
  completedAt: null,
  unlockDatetime: null,
  sender: { id: "sender-123", name: "John Sender", email: "sender@example.com" },
  recipient: { id: "recipient-456", name: "Jane Recipient", email: "recipient@example.com" },
};

function makeRequest(giftId: string) {
  return new NextRequest(`http://localhost/api/gifts/public/${giftId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/gifts/public/:giftId/confirm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 with status completed and shareLink on success", async () => {
    (db.query.gifts.findFirst as jest.Mock).mockResolvedValue(mockGift);

    const request = makeRequest("gift-123");
    const response = await POST(request, {
      params: Promise.resolve({ giftId: "gift-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe("completed");
    expect(data.shareLink).toBe("/gift/mock-share-token-1234");
    expect(data.transactionId).toBe("txn_mock-uuid-1234");
  });

  it("should return 404 if gift does not exist", async () => {
    (db.query.gifts.findFirst as jest.Mock).mockResolvedValue(null);

    const request = makeRequest("nonexistent-gift");
    const response = await POST(request, {
      params: Promise.resolve({ giftId: "nonexistent-gift" }),
    });

    expect(response.status).toBe(404);
  });

  it("should return 409 if gift has already been confirmed", async () => {
    (db.query.gifts.findFirst as jest.Mock).mockResolvedValue({ ...mockGift, status: "completed" });

    const request = makeRequest("gift-123");
    const response = await POST(request, {
      params: Promise.resolve({ giftId: "gift-123" }),
    });

    expect(response.status).toBe(409);
  });

  it("should return 400 if gift status is not pending_review", async () => {
    (db.query.gifts.findFirst as jest.Mock).mockResolvedValue({ ...mockGift, status: "pending_otp" });

    const request = makeRequest("gift-123");
    const response = await POST(request, {
      params: Promise.resolve({ giftId: "gift-123" }),
    });

    expect(response.status).toBe(400);
  });

  it("should return 422 if insufficient balance", async () => {
    (db.query.gifts.findFirst as jest.Mock).mockResolvedValue(mockGift);

    const { processGiftTransaction } = jest.requireMock("@/server/services/transactionService");
    processGiftTransaction.mockRejectedValue(new Error("Insufficient balance"));

    const request = makeRequest("gift-123");
    const response = await POST(request, {
      params: Promise.resolve({ giftId: "gift-123" }),
    });

    expect(response.status).toBe(422);
  });

  it("should return 500 on internal server error", async () => {
    (db.query.gifts.findFirst as jest.Mock).mockRejectedValue(new Error("Database connection failed"));

    const request = makeRequest("gift-123");
    const response = await POST(request, {
      params: Promise.resolve({ giftId: "gift-123" }),
    });

    expect(response.status).toBe(500);
  });
});
