import { describe, expect, it } from "vitest";
import { publicPhotoUrl } from "@/lib/feed";

describe("publicPhotoUrl", () => {
  it("convierte el data URL en /foto/[id] con versión por hash", () => {
    const url = publicPhotoUrl("data:image/jpeg;base64,AAAA", "pro-1");
    expect(url).toMatch(/^\/foto\/pro-1\?v=[0-9a-f]{8}$/);
  });

  it("mantiene la misma URL si la foto no cambia y cambia si cambia", () => {
    const a = publicPhotoUrl("data:image/jpeg;base64,AAAA", "pro-1");
    const b = publicPhotoUrl("data:image/jpeg;base64,AAAA", "pro-1");
    const c = publicPhotoUrl("data:image/jpeg;base64,BBBB", "pro-1");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("deja pasar URLs externas y devuelve null sin foto", () => {
    expect(publicPhotoUrl("https://cdn.example/p.jpg", "pro-1")).toBe(
      "https://cdn.example/p.jpg",
    );
    expect(publicPhotoUrl(null, "pro-1")).toBeNull();
  });

  it("escapa ids con caracteres raros", () => {
    expect(publicPhotoUrl("data:image/png;base64,AA", "a/b c")).toContain(
      "/foto/a%2Fb%20c?",
    );
  });
});
