import {Inject, Module, OnApplicationBootstrap} from '@nestjs/common';
import {HttpModule} from '@nestjs/axios';
import {Command} from 'commander';

import {COMMANDER_PROGRAM, LOGGER} from './constants';
import {VersionManagerController} from './controllers/version-manager.controller';
import {ConfigService, GeneratorService, PassThroughService, UIService, VersionManagerService} from './services';
import { ProxyAgent } from 'proxy-agent';

// The correct proxy `Agent` implementation to use will be determined
// via the `http_proxy` / `https_proxy` / `no_proxy` / etc. env vars
const agent = new ProxyAgent();

@Module({
  imports: [
    HttpModule.register({
      proxy: false,
      httpAgent: agent,
      httpsAgent: agent
    })
  ],
  controllers: [
    VersionManagerController
  ],
  providers: [
    UIService,
    ConfigService,
    GeneratorService,
    PassThroughService,
    VersionManagerService,
    {
      provide: COMMANDER_PROGRAM,
      useValue: new Command('openapi-generator-cli').helpOption(false).usage('<command> [<args>]')
    },
    {provide: LOGGER, useValue: console}
  ]
})
export class AppModule implements OnApplicationBootstrap {

  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
    private readonly passThroughService: PassThroughService
  ) {
  }

  onApplicationBootstrap = async () => {

    let selectedVersion = this.versionManager.getSelectedVersion();

    if (!selectedVersion) {
      const [{version}] = await this.versionManager.search(['latest']).toPromise();
      await this.versionManager.setSelectedVersion(version);
      selectedVersion = version;
    }

    await this.versionManager.downloadIfNeeded(selectedVersion);
    await this.passThroughService.init();
    this.program.parse(process.argv);

  };

}
