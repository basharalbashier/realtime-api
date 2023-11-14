import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { availableParallelism } from "node:os";
import cluster from "node:cluster";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 3000 + i,
    });
  }

  setupPrimary();
} else {
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT,
      sender TEXT,
      recipient TEXT,
      send_time TEXT,
      seen_time TEXT
);`);

  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
    adapter: createAdapter(),
  });

  app.get("/chat", (req, res) => {
    res.sendFile(new URL("./index.html", import.meta.url).pathname);
  });

  io.on("connection", async (socket) => {
    socket.on("chat message", async (data, callback) => {
      data = JSON.parse(data);

      const clientOffset = `${socket.id}- ${Date().toLocaleString()}`;

      let result;
      try {
        // console.log(`Message ${msg}  Client Offest ${clientOffset}`);
        result = await db.run(
          "INSERT INTO messages (content, client_offset, send_time,sender,recipient) VALUES (?, ?, ?,?,?)",
          data["content"],
          clientOffset,
          data["send_time"],
          data["sender"],
          data["recipient"]
        );

        var data = await db.get(
          `SELECT * FROM messages WHERE id =  ${result.lastID}`
        );
        io.emit("chat message", data);
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */) {
          console.log(e);
          callback();
        } else {
          console.log(e);

          // nothing to do, just let the client retry
        }
        return;
      }
      callback();
    });

    if (!socket.recovered) {
      try {
        await db.each(
          "SELECT * FROM messages WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("chat message", row);
          }
        );
      } catch (e) {
        // something went wrong
      }
    }
  });

  // const port = process.env.PORT;

  const port = 5243;
  server.listen(port, () => {
    // console.log(result);

    console.log(`server running at http://localhost:${port}`);
  });
}
