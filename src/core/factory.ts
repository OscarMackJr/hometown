import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ISemanticIntegration, SemanticRecord, SemanticRecordSchema } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DarkFactoryEngine {
  private integrations: Map<string, ISemanticIntegration> = new Map();

  public async bootAssemblyLines(): Promise<void> {
    const integrationsPath = path.join(__dirname, '../integrations');
    if (!fs.existsSync(integrationsPath)) {
      console.log(`[Factory Engine] Integrations workspace directory missing. Bootstrapping dynamic node lookup.`);
      return;
    }

    const directories = fs.readdirSync(integrationsPath);
    for (const dir of directories) {
      const fullPath = path.join(integrationsPath, dir, 'index.js');
      if (fs.existsSync(fullPath)) {
        const Module = await import(`file://${fullPath}`);
        const plugin: ISemanticIntegration = new Module.default();
        this.integrations.set(plugin.integrationId, plugin);
        console.log(`[Factory Engine] Activated Autonomous Integration Node: ${plugin.integrationId}`);
      }
    }
  }

  public async queryContext(integrationId: string, entityId: string): Promise<SemanticRecord> {
    const line = this.integrations.get(integrationId);
    if (!line) throw new Error(`Operational integration node '${integrationId}' not loaded inside engine execution boundary.`);

    const rawOutput = await line.fetchContext(entityId);
    return SemanticRecordSchema.parse(rawOutput); // Hard schema execution gate
  }
}