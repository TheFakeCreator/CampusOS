# ADR-014: Runtime ESM Bundle Injection for Zero-Rebuild Frontend Plugins

## Status

Proposed (Evolution of ADR-007)

## Context

In [ADR-007](./ADR-007-FRONTEND_PLUGIN_ARCHITECTURE.md), CampusOS established a "Build-Time Plugin Integration" pattern where plugin frontend components are transpiled and bundled directly into the Next.js shell (`transpilePackages`).

While this was effective during initial development, production scaling reveals critical limitations:

1. **Mandatory Next.js Rebuild on Plugin Installation:** Adding, updating, or disabling a third-party plugin requires triggering `next build` (which takes minutes, consumes significant CPU/memory, and causes server downtime or complex blue/green deployments).
2. **Monolithic Bundle Footprint:** The Next.js host build must know about every plugin at compile time, leading to bloated vendor chunks and slower initial page loads.
3. **Developer Friction:** Third-party plugin authors cannot independently compile, test, or distribute standalone frontend bundles as versioned artifacts.

Modern web standards (native ES Modules, dynamic `import()`, import maps, and browser module caching) enable modern desktop-grade web applications (such as Figma, Grafana, and Obsidian) to mount plugins at runtime without recompiling the host application.

## Decision

We will evolve the frontend architecture to support **Standalone ESM Bundling + Dynamic Runtime Injection**:

1. **Standalone Plugin Builds (`vite` / `tsup`):**
   - Each plugin's `frontend/` directory is independently built into a standalone ESM module: `plugins/<name>/frontend/dist/bundle.esm.js`.
   - Host-provided dependencies (`react`, `react-dom`, `@campus-os/shared`, `lucide-react`) are externalized in the plugin's bundler configuration to avoid duplicate React instances.
2. **Backend Plugin Asset Serving:**
   - The Express backend serves plugin assets at `GET /api/v1/plugins/:name/frontend/bundle.js` with proper caching headers (`ETag`, `Cache-Control`).
3. **Dynamic Host Component (`DynamicPluginHost.tsx` / `PluginRenderer.tsx`):**
   - The Next.js host downloads and dynamically mounts the plugin in the client browser using native ESM import:
     ```tsx
     const module = await import(
       /* webpackIgnore: true */ `/api/v1/plugins/${pluginName}/frontend/bundle.js`
     );
     const PluginComponent = module.default;
     return <PluginComponent {...props} />;
     ```
   - Includes React Suspense, skeleton loading states, and Error Boundaries to isolate plugin failures from crashing the host shell.
4. **Shared Runtime Context:**
   - The host exposes shared libraries (`React`, `@campusos/design-system`, theme providers) via `window.__CAMPUSOS__` or an import map so plugins dynamically link against the running host instance.

## Rationale

1. **True Zero-Rebuild Extensibility:** Campus administrators can install, enable, or disable plugins dynamically through the Admin UI without stopping or recompiling the Next.js web application.
2. **Isolation & Resilience:** If a community plugin contains a runtime React bug, the Error Boundary catches it locally without taking down the institute's main portal.
3. **Independent Plugin Authoring:** Contributors can build and package their plugin using standard frontend tooling without requiring access to the full CampusOS monorepo.

## Consequences

### Positive

- Zero downtime and zero rebuild cycles when managing plugins.
- Decoupled monorepo build times; core Next.js builds remain lean and fast.
- Scalable foundation for a public plugin marketplace and dynamic cloud distributions.

### Negative

- Plugin build pipelines must strictly externalize `react` and `react-dom` to prevent multiple React instances.
- Requires careful CSS scoping (Tailwind class prefixes or CSS modules) to prevent plugin styles from polluting host components.

## Related ADRs

- [ADR-007: Frontend Plugin Architecture](./ADR-007-FRONTEND_PLUGIN_ARCHITECTURE.md) (Superseded/Evolved)
- [ADR-009: Frontend Decoupling Standardization](./ADR-009-FRONTEND_DECOUPLING_STANDARDIZATION.md)
