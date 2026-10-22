import { describe, expect, it } from "vitest";
import { assertSensecapOk } from "./sensecap-client";

describe("assertSensecapOk", () => {
  it("accepts code 0 as a number, as the live API sends it", () => {
    expect(() => assertSensecapOk({ code: 0, msg: "Success" })).not.toThrow();
  });

  it("accepts code 0 as a string", () => {
    expect(() => assertSensecapOk({ code: "0" })).not.toThrow();
  });

  it("throws on any other code", () => {
    expect(() => assertSensecapOk({ code: 11101, msg: "Invalid API key" })).toThrow(
      "SenseCAP error 11101: Invalid API key",
    );
  });
});
