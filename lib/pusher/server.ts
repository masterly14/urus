import Pusher from "pusher";

let instance: Pusher | null = null;

export function getPusherServer(): Pusher {
  if (instance) return instance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER ?? "eu";

  if (!appId || !key || !secret) {
    throw new Error(
      "Faltan variables de entorno Pusher: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET",
    );
  }

  instance = new Pusher({ appId, key, secret, cluster, useTLS: true });
  return instance;
}
