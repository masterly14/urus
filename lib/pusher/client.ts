import PusherClient from "pusher-js";

let instance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (instance) return instance;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "eu";

  if (!key) {
    throw new Error("Falta variable de entorno NEXT_PUBLIC_PUSHER_KEY");
  }

  instance = new PusherClient(key, {
    cluster,
    authEndpoint: "/api/pusher/auth",
  });

  return instance;
}
