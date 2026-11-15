import { describe, expect, it } from "vitest";
import { esEndpointPushPermitido } from "./push-endpoint";

describe("esEndpointPushPermitido", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/x",
    "https://web.push.apple.com/x",
    "https://wns2-par02p.notify.windows.com/x",
  ])("acepta %s", (url) => {
    expect(esEndpointPushPermitido(url)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/x",
    "https://evil.com/x",
    "https://fcm.googleapis.com.evil.com/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com@evil.com/x",
    "no es una url",
    `https://fcm.googleapis.com/${"a".repeat(2000)}`,
  ])("rechaza %s", (url) => {
    expect(esEndpointPushPermitido(url)).toBe(false);
  });
});
