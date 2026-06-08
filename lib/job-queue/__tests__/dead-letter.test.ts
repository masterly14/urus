import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockGroupBy = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobQueue: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import { purgeAllDeadLetterJobs } from "../dead-letter";

describe("purgeAllDeadLetterJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany
      .mockResolvedValueOnce([{ id: "j1" }, { id: "j2" }])
      .mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 2 });
  });

  it("purga en lotes hasta vaciar la DLQ", async () => {
    const total = await purgeAllDeadLetterJobs({
      type: "MARKET_IMPORT_LISTING_IMAGES",
      batchSize: 500,
    });

    expect(total).toBe(2);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["j1", "j2"] } },
    });
  });
});
