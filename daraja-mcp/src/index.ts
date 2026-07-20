import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { createMcpServer } from "./mcp/server.js";
import { callbackRouter } from "./callbacks/routes.js";
import "./store/db.js"; // ensure schema is created on boot

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check for Render.
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Daraja callbacks land here.
app.use("/callbacks", callbackRouter);

// If MCP_BEARER_TOKEN is set, require it on every MCP call — these tools can
// move real money, so this endpoint should not be left open once deployed.
function requireBearerToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.mcpBearerToken) return next(); // no token configured -> skip (dev only)
  const header = req.header("authorization") ?? "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Some MCP clients (e.g. claude.ai's custom connector dialog) only offer a URL field and
  // OAuth Client ID/Secret — no way to set a raw Authorization header. As a fallback, also
  // accept the token as a ?token= query param so it can be pasted straight into the URL.
  const fromQuery = typeof req.query.token === "string" ? req.query.token : "";
  const provided = fromHeader || fromQuery;
  if (provided !== config.mcpBearerToken) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }
  next();
}

// MCP endpoint — stateless Streamable HTTP: a fresh server+transport per
// request, so there's no session state to manage across requests.
app.post("/mcp", requireBearerToken, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server only supports stateless POST." },
    id: null,
  });
});

app.listen(config.port, () => {
  console.log(`daraja-mcp listening on :${config.port} (env=${config.env})`);
  console.log(`  MCP endpoint:       POST ${config.callbackBaseUrl}/mcp`);
  console.log(`  Callback base URL:  ${config.callbackBaseUrl}/callbacks/*`);
});
