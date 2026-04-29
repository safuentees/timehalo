import { ApiReference } from "@scalar/nextjs-api-reference";

// Scalar-rendered interactive API reference at /api/v1/docs.
// Pulls the spec from /api/openapi.json (already shipped in 7df9072 +
// the openapi.json route at src/app/api/openapi.json/route.ts).
//
// Closes the deferral from 7df9072 verbatim:
//   "Scalar / Stoplight UI rendering of the spec — JSON contract is
//   what matters; rendering is mechanical."
//
// The "default" theme renders cleanly on light + dark with neutral
// chrome that sits next to the brutalist surface without clashing.
// Theme reference: https://guides.scalar.com/scalar/scalar-api-references/themes
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
