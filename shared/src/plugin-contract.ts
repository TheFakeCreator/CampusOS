import { z } from 'zod';
import semver from 'semver';

/**
 * Custom error thrown when a plugin violates the CampusOS plugin contract or manifest specification.
 */
export class PluginContractError extends Error {
  constructor(message, pluginName, details) {
    super(message);
    this.name = 'PluginContractError';
    this.pluginName = pluginName;
    this.details = details;
  }
}

/**
 * Zod schema for plugin dependencies.
 * Accepts either:
 * 1. A Record<string, string> where values are valid SemVer ranges (e.g. { "club": "^1.0.0" })
 * 2. An array of plugin names (e.g. ["club"]) normalized into { "club": "*" }
 */
export const PluginDependenciesSchema = z
  .union([
    z.record(
      z
        .string()
        .regex(
          /^[a-z0-9-]+$/,
          'Dependency name must be kebab-case (alphanumeric and dashes)'
        ),
      z.string().refine((range) => semver.validRange(range) !== null, {
        message: 'Dependency version must be a valid SemVer range'
      })
    ),
    z.array(z.string().regex(/^[a-z0-9-]+$/)).transform((arr) => {
      const rec = {};
      for (const item of arr) {
        rec[item] = '*';
      }
      return rec;
    })
  ])
  .optional()
  .default({});

/**
 * Strict Zod schema for plugin.json manifests.
 */
export const PluginManifestSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Plugin name cannot be empty')
      .regex(
        /^[a-z0-9-]+$/,
        'Plugin name must be kebab-case (lowercase alphanumeric and dashes, e.g. "audit-ledger")'
      ),
    version: z
      .string()
      .min(1, 'Plugin version cannot be empty')
      .refine((v) => semver.valid(v) !== null, {
        message: 'Plugin version must be a valid SemVer string (e.g. "1.0.0")'
      }),
    description: z.string().min(1, 'Plugin description cannot be empty'),
    dependencies: PluginDependenciesSchema,
    defaultEnabled: z.boolean().optional().default(true),
    database: z
      .object({
        type: z.enum(['mongodb', 'sql'])
      })
      .optional(),
    themeColor: z.string().optional(),
    frontend: z.boolean().optional().default(true),
    backend: z.boolean().optional().default(true)
  })
  .passthrough();

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export type PluginInitFunction = (
  app: any,
  registry: any,
  eventBus?: any
) => Promise<void> | void;

export interface CampusOSPlugin {
  manifest: PluginManifest;
  init: PluginInitFunction;
}

/**
 * Validates a plugin manifest and asserts that the folder name matches the manifest name.
 * @param {unknown} rawManifest - The parsed JSON content of plugin.json
 * @param {string} [folderName] - The directory name in /plugins/
 * @returns {PluginManifest} Validated plugin manifest
 * @throws {PluginContractError} If manifest validation fails or name does not match folder
 */
export function validatePluginManifest(
  rawManifest: unknown,
  folderName?: string
): PluginManifest {
  const result = PluginManifestSchema.safeParse(rawManifest);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((e) => `[${e.path.join('.') || 'root'}]: ${e.message}`)
      .join('; ');
    const pluginName =
      rawManifest && typeof rawManifest === 'object' && 'name' in rawManifest
        ? String(rawManifest.name)
        : folderName || 'unknown';

    throw new PluginContractError(
      `Plugin manifest validation failed for '${pluginName}': ${errorDetails}`,
      pluginName,
      result.error.errors
    );
  }

  const manifest = result.data;

  if (folderName && manifest.name !== folderName) {
    throw new PluginContractError(
      `Plugin folder name '${folderName}' does not match manifest name '${manifest.name}'`,
      manifest.name,
      { folderName, manifestName: manifest.name }
    );
  }

  return manifest;
}

export default {
  PluginContractError,
  PluginManifestSchema,
  PluginDependenciesSchema,
  validatePluginManifest
};
