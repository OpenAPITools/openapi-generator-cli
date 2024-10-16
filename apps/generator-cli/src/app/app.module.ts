import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { HttpModule, HttpModuleOptions } from '@nestjs/axios';
import { Command } from 'commander';

import { COMMANDER_PROGRAM, LOGGER } from './constants';
import { VersionManagerController } from './controllers/version-manager.controller';
import {
  ConfigService,
  GeneratorService,
  NpmrcService,
  PassThroughService,
  UIService,
  VersionManagerService,
} from './services';
import { Agent } from 'https';

export const httpModuleConfigFactory = async (configService: ConfigService, npmrcService: NpmrcService): Promise<HttpModuleOptions> => {
  const strictSsl = configService.useNpmrc() ? npmrcService.getStrictSsl() : true;
  const rejectUnauthorized = configService.get('generator-cli.http.rejectUnauthorized', true);
  const httpsAgent = !strictSsl || !rejectUnauthorized ? new Agent({
    rejectUnauthorized: false,
  }) : undefined;
  return {
    httpsAgent: httpsAgent,
  };
};

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [AppModule],
      useFactory: httpModuleConfigFactory,
      inject: [ConfigService, NpmrcService],
    }),
  ],
  controllers: [VersionManagerController],
  exports: [ConfigService, NpmrcService],
  providers: [
    UIService,
    ConfigService,
    GeneratorService,
    NpmrcService,
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
    let selectedVersion = this.versionManager.getSelectedVersion();

    if (!selectedVersion) {
      const [{ version }] = await this.versionManager
        .search(['latest'])
        .toPromise();
      await this.versionManager.setSelectedVersion(version);
      selectedVersion = version;
    }

    await this.versionManager.downloadIfNeeded(selectedVersion);
    await this.passThroughService.init();
    this.program.parse(process.argv);
  };
}
