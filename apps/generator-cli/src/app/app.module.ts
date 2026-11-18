import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { HttpModule, HttpModuleOptions } from '@nestjs/axios';
import { Command } from 'commander';
import { ProxyAgent } from 'proxy-agent';

import { COMMANDER_PROGRAM, LOGGER } from './constants';
import { VersionManagerController } from './controllers/version-manager.controller';
import {
  ConfigService,
  extractGlobalConfigArgs,
} from './services/config.service';
import {
  GeneratorService,
  PassThroughService,
  UIService,
  VersionManagerService,
} from './services';

const hasHttpProxyEnvs = process.env.HTTP_PROXY || process.env.http_proxy;
const hasHttpsProxyEnvs = process.env.HTTPS_PROXY || process.env.https_proxy;
const httpModuleConfig: HttpModuleOptions = {};
const proxyAgent = new ProxyAgent();

if (hasHttpProxyEnvs) {
  httpModuleConfig.proxy = false;
  httpModuleConfig.httpAgent = proxyAgent;
}

if (hasHttpsProxyEnvs) {
  httpModuleConfig.proxy = false;
  httpModuleConfig.httpsAgent = proxyAgent;
}

@Module({
  imports: [
    HttpModule.register({
      ...httpModuleConfig,
    }),
  ],
  controllers: [VersionManagerController],
  providers: [
    UIService,
    ConfigService,
    GeneratorService,
    PassThroughService,
    VersionManagerService,
    {
      provide: COMMANDER_PROGRAM,
      useValue: new Command('openapi-generator-cli')
        .helpOption(false)
        .usage('<command> [<args>]')
        .option(
          '--openapitools <openapitools.json>',
          'Use the specified openapi-generator-cli configuration file',
        )
        // The global `-c, --config <path>` option is intentionally NOT
        // registered with commander: commander would consume it from the whole
        // argv — including after the command name — which would swallow the
        // Java generator's own `generate -c, --config <config file>` option.
        // Instead, it is only honored BEFORE the command name by ConfigService
        // (see extractGlobalConfigArgs) and stripped from the argv handed to
        // commander below. It is listed here so it still shows up in the help.
        .addHelpText(
          'after',
          '\nGlobal config option (must be placed before the command name):\n\n' +
            '  -c, --config <path>\n' +
            '      Use the specified openapi-generator-cli configuration file (alternative to --openapitools, also available via the ' +
            ConfigService.envConfigVariable +
            ' environment variable)\n',
        ),
    },
    { provide: LOGGER, useValue: console },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
    private readonly passThroughService: PassThroughService,
  ) {}

  onApplicationBootstrap = async () => {
    const isVersionManagerResolveCommand =
      this.isVersionManagerResolveCommand();
    const hasCustomGenerator = process.argv.some(
      (arg) =>
        arg === '--custom-generator' || arg.startsWith('--custom-generator='),
    );

    if (!hasCustomGenerator && !isVersionManagerResolveCommand) {
      let selectedVersion = this.versionManager.getSelectedVersion();

      if (!selectedVersion) {
        const [{ version }] = await this.versionManager
          .search(['latest'])
          .toPromise();
        await this.versionManager.setSelectedVersion(version);
        selectedVersion = version;
      }

      await this.versionManager.downloadIfNeeded(selectedVersion);
    }

    if (!isVersionManagerResolveCommand) {
      await this.passThroughService.init();
    }
    // Remove the global -c/--config options from the argv handed to commander:
    // they are not registered (see above), and an unrecognized option before
    // the command name would make commander treat the command itself as an
    // unknown argument and skip its dispatch.
    this.program.parse(
      extractGlobalConfigArgs(process.argv).argvWithoutGlobalConfigArgs,
    );
  };

  private isVersionManagerResolveCommand() {
    const args = process.argv.slice(2);
    let commandIndex = 0;

    while (commandIndex < args.length) {
      const arg = args[commandIndex];

      if (
        arg === '--openapitools' ||
        arg === '--config' ||
        arg === '-c'
      ) {
        commandIndex += 2;
        continue;
      }

      if (
        arg.startsWith('--openapitools=') ||
        arg.startsWith('--config=') ||
        (arg.startsWith('-c') && arg.length > 2)
      ) {
        commandIndex += 1;
        continue;
      }

      break;
    }

    return (
      args[commandIndex] === 'version-manager' &&
      args[commandIndex + 1] === 'resolve'
    );
  }
}
