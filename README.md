# SimEngine-3D

SimEngine-3D is a hands-on system architecture and delivery simulator. Learners refactor a deliberately fragile flash-sale checkout, inspect live topology findings, and stress-test the design against latency, error-rate, and availability objectives. The CI/CD workspace models blocking quality gates, canary deployments, and automated rollbacks for a simulated memory-leak release.

## Stack

- React, TypeScript, and Vite for the client
- `@xyflow/react` for the draggable architecture canvas
- Zustand for canvas, telemetry, and pipeline state
- Express for graph validation, deterministic load simulation, and pipeline outcomes
- Lucide icons and custom SVG telemetry charts

The four-lens architecture advisor is a deterministic, offline prototype so scenarios work without credentials or network access. A production LLM assessor can replace this service boundary when an approved provider and key-management strategy are available.

## Requirements

- Node.js 20.15+ or 22+
- npm

## Run locally

1. Install dependencies with `npm install`.
2. Start the client and API together with `npm run dev`.
3. Open the local Vite URL printed in the terminal (normally `http://localhost:5173`).

The client proxies `/api` requests to the Express service on port 4000. To run the API alone, use `npm run start`. To create a production client bundle, use `npm run build`; serve the static `dist` directory separately alongside the API.

## Simulator workflow

On first visit, a four-step beginner guide explains the incident, points to the exact components and controls, and tracks progress as the topology improves. Dismiss it any time; use **Guide** in the top bar to reopen it. The help dialog defines nodes, connections, protocols, and the telemetry thresholds.

1. On **Architecture**, select a node to edit its name, capacity, and latency. Drag a component from the palette or click it to add it; connect nodes by dragging between their ports. Select a connection to change between HTTP, gRPC, and AMQP.
2. Review **Topology audit** to see shared-database, cache, sync-cascade, and single-point-of-failure findings update as the graph changes.
3. Choose **Run stress test** to evaluate the 30-second traffic ramp. The engine streams throughput, error rate, P95 latency, CPU, node health, and a pass/conditional/fail report.
4. Select **CI/CD pipeline** to configure lint, test, build, security, and rollout stages. Toggle stage enforcement, choose Canary or Blue/Green, configure the error threshold, and trigger a buggy Git push to observe a test block, automated rollback, or production impact.

## API

- `GET /api/health` — simulation service health
- `POST /api/validate` — return topology anti-patterns and sync-chain depth
- `POST /api/simulate` — return deterministic telemetry and an evaluation outcome for a graph
- `POST /api/pipeline` — evaluate the configured pipeline against the simulated buggy push

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
