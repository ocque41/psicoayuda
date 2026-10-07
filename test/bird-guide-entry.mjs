import assert from "node:assert/strict";

// Entrada táctil de Chrome, sólo en la sesión y origen efímeros de la fixture.
export async function tapFixture(cli, fixtureUrl, point) {
  const { cdpUrl } = await cli("get", "cdp-url");
  const endpoint = new URL(cdpUrl);
  assert.equal(endpoint.protocol, "ws:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  const socket = new WebSocket(cdpUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`CDP sin respuesta: ${method}`));
      }, 5000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
    });
  }
  let sessionId;
  try {
    const { targetInfos } = await send("Target.getTargets");
    const targets = targetInfos.filter(
      (target) =>
        target.type === "page" &&
        new URL(target.url).origin === new URL(fixtureUrl).origin,
    );
    assert.equal(
      targets.length,
      1,
      "Sólo la página de nuestra fixture acepta el toque",
    );
    ({ sessionId } = await send("Target.attachToTarget", {
      targetId: targets[0].targetId,
      flatten: true,
    }));
    await send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: true, maxTouchPoints: 1 },
      sessionId,
    );
    await send(
      "Input.dispatchTouchEvent",
      { type: "touchStart", touchPoints: [{ x: point.x, y: point.y, id: 0 }] },
      sessionId,
    );
    await send(
      "Input.dispatchTouchEvent",
      { type: "touchEnd", touchPoints: [] },
      sessionId,
    );
  } finally {
    if (sessionId) {
      await send(
        "Emulation.setTouchEmulationEnabled",
        { enabled: false },
        sessionId,
      ).catch(() => {});
      await send("Target.detachFromTarget", { sessionId }).catch(() => {});
    }
    socket.close();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Sesión táctil cerrada"));
    }
  }
}
