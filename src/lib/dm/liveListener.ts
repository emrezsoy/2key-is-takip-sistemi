// Web süreci: Postgres "dm_events" kanalını tek bağlantıyla dinler, abonelere (SSE bağlantıları) dağıtır.
import { Client } from "pg";
import { DM_CHANNEL, type DmLiveEvent } from "./events";

type Listener = (ev: DmLiveEvent) => void;

const g = globalThis as unknown as { __dmLive?: { listeners: Set<Listener>; client: Client | null; connecting: Promise<void> | null } };
const state = (g.__dmLive ??= { listeners: new Set(), client: null, connecting: null });

async function ensureConnected() {
  if (state.client) return;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    const url = (process.env.DATABASE_URL ?? "").split("?")[0];
    const client = new Client({ connectionString: url });
    client.on("notification", (msg) => {
      if (msg.channel !== DM_CHANNEL || !msg.payload) return;
      let ev: DmLiveEvent;
      try {
        ev = JSON.parse(msg.payload);
      } catch {
        return;
      }
      for (const l of state.listeners) l(ev);
    });
    const reset = () => {
      state.client = null;
      client.removeAllListeners();
      void client.end().catch(() => {});
    };
    client.on("error", reset);
    client.on("end", () => {
      if (state.client === client) state.client = null;
    });
    await client.connect();
    await client.query(`LISTEN ${DM_CHANNEL}`);
    state.client = client;
  })().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
}

export async function subscribeDmEvents(listener: Listener): Promise<() => void> {
  await ensureConnected();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
