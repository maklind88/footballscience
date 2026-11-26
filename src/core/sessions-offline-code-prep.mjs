const serviceWorkerPath = "/footballscience-sw.js";
const statusMessage = "sessions-offline-code-status";
const prepareMessage = "sessions-offline-code-prepare";

function send(worker, type, timeout) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (settle, value) => {
      clearTimeout(timer);
      channel.port1.close();
      settle(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("Sessions offline preparation timed out.")), timeout);
    channel.port1.onmessage = ({ data }) => finish(resolve, data);
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (error) {
      channel.port2.close();
      finish(reject, error);
    }
  });
}

async function getOfflineCodeWorker() {
  const serviceWorkers = globalThis.navigator?.serviceWorker;
  if (!serviceWorkers) throw new Error("Sessions offline preparation requires a service worker.");
  const registration = await serviceWorkers.register(serviceWorkerPath, { updateViaCache: "none" });
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const worker = registration.active;
    if (worker?.state === "activated") {
      // Prior push-only workers do not answer this message.
      const status = await send(worker, statusMessage, 500).catch(() => null);
      if (status?.protocol === 1) return worker;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error("This browser has not activated the Sessions offline code worker.");
}

export async function prepareSessionsOfflineCode() {
  const worker = await getOfflineCodeWorker();
  const result = await send(worker, prepareMessage, 90000);
  if (result?.ok !== true || !/^[a-f0-9]{64}$/.test(result.packageId || "") ||
      !Number.isSafeInteger(result.assetCount) || !Number.isSafeInteger(result.bytes)) {
    throw new Error(result?.reason || "Sessions offline code could not be prepared.");
  }
  const { packageId, assetCount, bytes } = result;
  return { packageId, assetCount, bytes };
}
