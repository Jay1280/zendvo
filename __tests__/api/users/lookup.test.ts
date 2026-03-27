import { GET } from "@/app/api/users/lookup/route";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limiter";
import { NextRequest } from "next/server";

jest.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
    },
  },
}));

jest.mock("@/lib/rate-limiter", () => ({
  isRateLimited: jest.fn(() => false),
}));

function makeRequest(phone?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/users/lookup");
  if (phone !== undefined) {
    url.searchParams.set("phone", phone);
  }
  return new NextRequest(url);
}

describe("GET /api/users/lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isRateLimited as jest.Mock).mockReturnValue(false);
  });

  it("should return 400 when phone parameter is missing", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
  });

  it("should return 400 for invalid phone number format", async () => {
    const response = await GET(makeRequest("abc"));
    expect(response.status).toBe(400);
  });

  it("should return 404 when no user matches the phone number", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(makeRequest("+2348112345678"));
    expect(response.status).toBe(404);
  });

  it("should return 200 with displayName, username, and avatarUrl", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      name: "John Eze",
      username: "johneze",
      avatarUrl: "https://example.com/avatar.jpg",
    });

    const response = await GET(makeRequest("+2348112345678"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      displayName: "John Eze",
      username: "johneze",
      avatarUrl: "https://example.com/avatar.jpg",
    });
  });

  it("should return 429 when rate limited", async () => {
    (isRateLimited as jest.Mock).mockReturnValue(true);

    const response = await GET(makeRequest("+2348112345678"));
    expect(response.status).toBe(429);
  });

  it("should return 500 on database error", async () => {
    (db.query.users.findFirst as jest.Mock).mockRejectedValue(new Error("DB connection failed"));

    const response = await GET(makeRequest("+2348112345678"));
    expect(response.status).toBe(500);
  });
});
