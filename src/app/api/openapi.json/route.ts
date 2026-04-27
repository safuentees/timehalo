import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// @asteasolutions/zod-to-openapi which targets the same OpenAPI 3.x

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const WorkspaceSchema = z
  .object({
    slug: z.string().openapi({ example: "acme" }),
    name: z.string().openapi({ example: "Acme Inc" }),
  })
  .openapi("Workspace");

const WhoAmIResponseSchema = z
  .object({
    workspace: WorkspaceSchema,
    scopes: z
      .array(z.string())
      .openapi({ example: ["workspace.read", "bookings.read"] }),
    keyId: z.string().openapi({ example: "ckxxx..." }),
  })
  .openapi("WhoAmIResponse");

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "unauthorized" }),
    message: z.string().optional(),
  })
  .openapi("Error");

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "Officehours API key (oh_…)",
  description:
    "Workspace-scoped API key minted via workspaces.apiKeys.create. " +
    "Returned exactly once at creation; the SHA-256 hash is what we " +
    "compare against on every request.",
});

registry.registerPath({
  method: "get",
  path: "/api/v1/whoami",
  summary: "Return the workspace + scopes the calling token grants.",
  description:
    "Smoke-test endpoint. Requires the workspace.read scope, which " +
    "every issued token carries.",
  tags: ["Auth"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Token is valid; workspace + scope set returned.",
      content: {
        "application/json": { schema: WhoAmIResponseSchema },
      },
    },
    401: {
      description: "Missing, invalid, or revoked token.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Token lacks the required scope.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const generator = new OpenApiGeneratorV31(registry.definitions);

const document = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Officehours API",
    version: "v1",
    description:
      "Workspace-scoped REST endpoints. Authenticate with a Bearer " +
      "API key minted via workspaces.apiKeys.create.",
  },
  servers: [
    { url: "{appUrl}", variables: { appUrl: { default: "/" } } },
  ],
});

export const dynamic = "force-static";

export async function GET() {
  return Response.json(document, {
    headers: {
      "cache-control":
        "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
