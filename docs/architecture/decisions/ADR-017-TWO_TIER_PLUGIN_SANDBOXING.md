# ADR-017: Two-Tier Plugin Architecture and Sandboxed Capability Isolation

## Status

Proposed (Accepted for Implementation)

## Context

CampusOS was architected to be extensible through community plugins. However, the current bootloader implementation (`backend/src/plugin-loader.js`) operates on an implicit "flat-trust" model:

- The unrestricted global `registry`, Express `app`, and `eventBus` singletons are passed directly to every plugin's `init()` function.

In an open-source, multi-contributor campus ecosystem, this presents severe security vulnerabilities:

1. **Unrestricted Raw Database Access:** Any third-party plugin can execute `registry.getService('db:mongo')`, `registry.getService('db:sql')`, or `registry.getService('core:models')`, granting direct read/write access to sensitive student records, password hashes, and core collections.
2. **Mutating Service Abuse:** A rogue or poorly written community plugin can invoke destructive methods on first-party services (e.g., `clubService.deleteClub()`, `authService.generateToken()`).
3. **No Capability Manifest:** Plugins do not declare what data or capabilities they require in their `plugin.json` manifest.
4. **Event Hijacking:** Without event namespace isolation, community plugins can intercept sensitive system events (such as user authentication or password resets) or emit fraudulent administrative events across the shared `eventBus`.

## Decision

We will implement a **Two-Tier Plugin Architecture with Capability-Based Sandboxing**:

1. **Manifest Tier Declaration (`plugin.json`):**
   - Plugins must declare their tier (`"tier": "core" | "community"`).
   - Core first-party plugins maintained within the official repository default to `"tier": "core"`.
   - Third-party or marketplace plugins default to `"tier": "community"`.
   - Community plugins must declare requested capabilities and consumed resolvers in their manifest:
     ```json
     {
       "name": "attendance-tracker",
       "version": "1.0.0",
       "tier": "community",
       "permissions": ["club:view", "event:view"],
       "consumes": {
         "resolvers": ["club:summary", "event:basicInfo"],
         "events": ["event:created", "event:updated"]
       }
     }
     ```

2. **Provenance Verification & Anti-Spoofing (Preventing Privilege Escalation):**
   - **"Manifest proposes, Host enforces":** Trust cannot rely solely on a user-editable JSON string. A 3rd-party developer cannot simply write `"tier": "core"` in `plugin.json` to obtain root access.
   - **Immutable Core Whitelist:** CampusOS Core maintains an immutable set of verified first-party plugins (`auth`, `club`, `event`, `budget`, `calendar`, `task`, `vendor`, `resource`, `scheduling`, `forms`, `institute`, `plugin-manager`, `activity`, `recruitment`).
   - **Enforcement Rule:** If an unverified plugin declares `"tier": "core"`, the bootloader detects the spoofing attempt, logs a critical security alert, and either:
     - Refuses to load the plugin (`InvalidTierClaimError`), or
     - Forcibly demotes the runtime context to `"tier": "community"`.
   - **Physical Directory Segregation:** Community plugins installed at runtime are placed into a segregated directory (e.g., `plugins/community/`), ensuring physical filesystem boundaries dictate default trust tiers.

3. **Scoped Registry Proxy (`backend/src/core/sandbox-registry.js`):**
   - When loading a `community` plugin, `plugin-loader.js` injects a restricted security proxy (`createScopedRegistry(manifest, globalRegistry)`) instead of the raw singleton.
   - **Forbidden Services:** Attempts to call `registry.getService()` for protected keys (`db:mongo`, `db:sql`, `db:manager`, `core:models`, `auth:jwt`) throw an immediate `AccessDeniedError`.
   - **Resolver Promotion:** Community plugins are steered to access cross-plugin data purely through read-only, sanitized resolvers via `registry.getResolver(name)`.
   - **Permission Verification:** Calling `getResolver()` requires that the resolver is declared under the plugin's `consumes.resolvers` manifest.

4. **Scoped Event Bus (`backend/src/core/sandbox-event-bus.js`):**
   - The injected `eventBus` for community plugins enforces namespace prefixes (e.g., `plugin:attendance:*`) for publications and only allows subscriptions to explicitly declared event channels.

## Alternatives Considered

1. **Worker Threads / VM2 Process Isolation:**
   - _Consideration:_ Running each plugin in a separate Node.js `worker_threads` or V8 isolate.
   - _Rejection Rationale:_ Extreme memory overhead, complex IPC serialization for Express request/response objects, and high latency for internal operations.
2. **Status Quo (Flat-Trust Monolith):**
   - _Consideration:_ Relying solely on manual code review of community plugins.
   - _Rejection Rationale:_ Unacceptable security risk for university deployments handling confidential student records.

## Consequences

### Positive

- Strict security boundaries: community plugins cannot leak or corrupt database state or bypass permission checks.
- Zero-friction first-party development: official core plugins retain full unrestricted access.
- Clear contract between plugin authors and platform administrators regarding data consumption.

### Negative

- Community plugin developers cannot use direct database access and must request resolver additions if a required data view does not yet exist.

## Related ADRs

- [ADR-006: Plugin Manager Config & Restart Pattern](./ADR-006-PLUGIN_MANAGER_RESTART.md)
- [ADR-013: Factory Pattern Services & Dependency Inversion](./ADR-013-FACTORY_PATTERN_SERVICES.md)
- [ADR-016: Polyglot Database Architecture & Adapters](./ADR-016-POLYGLOT_DATABASE_ADAPTER.md)
