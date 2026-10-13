import { describe, expect, it } from "vitest";
import { submitStep, uploadStep } from "./transport";
import { isUuid, newCaseId } from "./case";

describe("uploadStep", () => {
  it("counts success and an already stored photo as done", () => {
    expect(uploadStep(null)).toBe("ok");
    expect(uploadStep({ statusCode: "409", message: "The resource already exists" })).toBe("ok");
    expect(uploadStep({ status: 400, message: "Duplicate" })).toBe("ok");
  });

  it("retries when the sign-in ran out or the network failed", () => {
    expect(uploadStep({ statusCode: "403", message: "jwt expired" })).toBe("retry");
    expect(uploadStep({ status: 401, message: "Unauthorized" })).toBe("retry");
    expect(uploadStep({ message: "Failed to fetch" })).toBe("retry");
    expect(uploadStep({ status: 503, message: "Service unavailable" })).toBe("retry");
    expect(uploadStep({})).toBe("retry");
  });

  it("gives up when the server will never take the photo", () => {
    expect(uploadStep({ statusCode: "403", message: "new row violates row-level security policy" })).toBe("refused");
    expect(uploadStep({ statusCode: "413", message: "The object exceeded the maximum allowed size" })).toBe("refused");
    expect(uploadStep({ statusCode: "415", message: "mime type image/png is not supported" })).toBe("refused");
  });
});

describe("submitStep", () => {
  it("maps the server's answers", () => {
    expect(submitStep({ ok: true })).toBe("ok");
    expect(submitStep({ ok: false, error: "forbidden" })).toBe("refused");
    expect(submitStep({ ok: false, error: "invalid" })).toBe("refused");
    expect(submitStep({ ok: false, error: "missing_photos" })).toBe("retry");
    expect(submitStep({ ok: false, error: "failed" })).toBe("retry");
  });
});

describe("newCaseId", () => {
  it("makes distinct ids of the form the server accepts", () => {
    const a = newCaseId();
    expect(isUuid(a)).toBe(true);
    expect(newCaseId()).not.toBe(a);
  });
});
