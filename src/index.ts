import { createServer } from "node:http";

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from TypeScript!");
});

server.listen(2000, () => {
  console.log("Server is running on http://localhost:2000");
});
