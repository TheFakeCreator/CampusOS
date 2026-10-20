import { z } from 'zod';
import {
  PluginManifestSchema,
  PluginDependenciesSchema
} from './plugin-contract.js';

export { PluginManifestSchema, PluginDependenciesSchema };

export class PluginContractError extends Error {
  pluginName?: string;
  details?: unknown;
  constructor(message: string, pluginName?: string, details?: unknown);
}

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

export function validatePluginManifest(
  rawManifest: unknown,
  folderName?: string
): PluginManifest;
