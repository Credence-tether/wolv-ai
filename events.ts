import cookieParser from "cookie-parser";
import type { Server as HttpServer } from "node:http";
import type { Request } from "express";
import { Server as SocketServer } from "socket.io";
import { env } from "./env";
import { query } from "./db";
import { getCurrentStaff, getVisitorId } from "./session";

export type RealtimeEvent = {
  type: "visitor" | "activity" | "message" | "conversation" | "notification";
  payload: Record<string, unknown>;
};

export class EventBus {
  private readonly io: SocketServer;

  constructor(server: HttpServer) {
    this.io = new SocketServer(server, {
      path: "/api/events",
      cors: { origin: env.appOrigin, credentials: true },
    });
    this.io.engine.use(cookieParser(env.cookieSecret));
    this.io.use(async (socket, next) => {
      try {
        const request = socket.request as Request;
        const visitorId = await getVisitorId(request);
        const staff = await getCurrentStaff(request);
        const consent = visitorId ? await query<{ tracking_consent: boolean }>("SELECT tracking_consent FROM visitor_sessions WHERE id = $1", [visitorId]) : null;
        socket.data.visitorId = visitorId;
        socket.data.staff = staff;
        socket.data.trackingConsent = consent?.rows[0]?.tracking_consent === true;
        next();
      } catch (error) {
        next(error as Error);
      }
    });
    this.io.on("connection", socket => {
      const visitorId = socket.data.visitorId as string | null;
      if (visitorId) socket.join(`visitor:${visitorId}`);
      const staff = socket.data.staff as { role?: string } | null;
      if (staff?.role === "agent" || staff?.role === "admin") socket.join("staff:agents");
      if (staff?.role === "admin") socket.join("staff:admins");

      const touchPresence = () => {
        if (!visitorId || socket.data.trackingConsent !== true) return;
        void query("UPDATE visitor_sessions SET is_online = TRUE, last_seen_at = NOW(), offline_at = NULL WHERE id = $1 AND tracking_consent = TRUE", [visitorId]).then(() => {
          this.emitToAdmins({ type: "visitor", payload: { visitorId, status: "online", action: "active" } });
          this.emitToAgents({ type: "visitor", payload: { visitorId, status: "online", action: "active" } });
        }).catch(() => undefined);
      };
      touchPresence();
      socket.conn.on("packet", packet => {
        if (packet.type === "pong") touchPresence();
      });
      socket.on("disconnect", () => {
        if (!visitorId || socket.data.trackingConsent !== true) return;
        void query("UPDATE visitor_sessions SET is_online = FALSE, offline_at = NOW(), last_seen_at = NOW() WHERE id = $1 AND tracking_consent = TRUE", [visitorId]).then(() => {
          this.emitToAdmins({ type: "visitor", payload: { visitorId, status: "offline", action: "departed" } });
          this.emitToAgents({ type: "visitor", payload: { visitorId, status: "offline", action: "departed" } });
        }).catch(() => undefined);
      });
    });
  }

  emitToVisitor(visitorId: string, event: RealtimeEvent) {
    this.io.to(`visitor:${visitorId}`).emit("support:event", event);
  }

  emitToAgents(event: RealtimeEvent) {
    this.io.to("staff:agents").emit("support:event", event);
  }

  emitToAdmins(event: RealtimeEvent) {
    this.io.to("staff:admins").emit("support:event", event);
  }
}
