import { useEffect } from "react";
import { io } from "socket.io-client";

export function useRealtime(onEvent: (event: { type: string; payload: Record<string, unknown> }) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const socket = io({ path: "/api/events", withCredentials: true, transports: ["websocket"] });
    socket.on("support:event", onEvent);
    return () => { socket.close(); };
  }, [onEvent, enabled]);
}
