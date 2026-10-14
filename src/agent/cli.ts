import * as path from 'node:path';
import { realpath } from 'node:fs/promises';
import { AppLensConfig, DEFAULT_CONFIG } from '../core/AppLensConfig';
import { startAgentServer } from './server';

/** Parsed CLI flags for the agent. */
interface CliArgs {
  project: string;
  port: number;
  host: string;
  token?: string;
}

const DEFAULT_PORT = 4747;
const DEFAULT_HOST = '127.0.0.1';

/**
 * Parse `--project`, `--port`, `--host`, and `--token` from argv. Unknown flags
 * are ignored. `--host 0.0.0.0` is allowed but the caller prints a LAN warning.
 */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    project: process.cwd(),
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--project':
        if (value) {
          args.project = value;
          i++;
        }
        break;
      case '--port':
        if (value) {
          const parsed = Number(value);
          if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
            args.port = parsed;
          }
          i++;
        }
        break;
      case '--host':
        if (value) {
          args.host = value;
          i++;
        }
        break;
      case '--token':
        if (value) {
          args.token = value;
          i++;
        }
        break;
      default:
        break;
    }
  }

  return args;
}

/**
 * Resolve the AppLens config for the agent run. The agent runs in a plain Node
 * process (never importing RN code), so it starts from DEFAULT_CONFIG and lets
 * environment variables override the AI backend — mirroring how a developer
 * points the library at OpenAI or a local LM Studio server.
 */
function resolveConfig(): AppLensConfig {
  const config: AppLensConfig = { ...DEFAULT_CONFIG };
  if (process.env.APPLENS_AI_PROVIDER) {
    config.aiProvider = process.env.APPLENS_AI_PROVIDER as AppLensConfig['aiProvider'];
  }
  if (process.env.APPLENS_AI_API_KEY) {
    config.aiApiKey = process.env.APPLENS_AI_API_KEY;
  }
  if (process.env.APPLENS_AI_MODEL) {
    config.aiModel = process.env.APPLENS_AI_MODEL;
  }
  if (process.env.APPLENS_AI_BASE_URL) {
    config.aiBaseURL = process.env.APPLENS_AI_BASE_URL;
  }
  return config;
}

/**
 * Entry point: validate the workspace, start the server, and print the
 * workspace, listen URL, and pairing token. Keeps running until killed.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  let projectRoot: string;
  try {
    projectRoot = await realpath(path.resolve(args.project));
  } catch (err) {
    console.error(
      `AppLens Agent: project root not found: ${args.project}\n${String(err)}`,
    );
    process.exit(1);
    return;
  }

  if (args.host === '0.0.0.0') {
    console.warn(
      '⚠️  AppLens Agent is binding 0.0.0.0 — it is reachable by any device on your network.\n' +
        '    Only use this for a physical device over a trusted LAN; the pairing token is required.',
    );
  }

  const server = await startAgentServer({
    projectRoot,
    port: args.port,
    host: args.host,
    token: args.token,
    config: resolveConfig(),
  });

  console.log('AppLens Agent is running.');
  console.log(`  Workspace: ${projectRoot}`);
  console.log(`  Listening: ${server.url}`);
  console.log(`  Pair with: POST ${server.url}/pair`);
  console.log(`  Token:     ${server.token}`);
  console.log('Waiting for a device to connect… (Ctrl+C to stop)');

  const shutdown = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run when invoked directly (via the bin wrapper or `node dist/agent/cli.js`).
if (require.main === module) {
  main().catch((err) => {
    console.error('AppLens Agent failed to start:', err);
    process.exit(1);
  });
}
