import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({
  url: "/api/openapi.json",
  theme: "default",
  metaData: {
    title: "Officehours API · Reference",
    description:
      "Workspace-scoped REST endpoints. Authenticate with a Bearer " +
      "API key minted via workspaces.apiKeys.create.",
  },
});
