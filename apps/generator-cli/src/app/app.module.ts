import {HttpModule, Inject, Module, OnApplicationBootstrap} from '@nestjs/common';

import {COMMANDER_PROGRAM, LOGGER} from './constants';
import {Command} from 'commander';
import {VersionManagerController} from './controllers/version-manager.controller';
import {UIService, VersionManagerService} from './services';

@Module({
  imports: [HttpModule],
  controllers: [
    VersionManagerController,
  ],
  providers: [
    UIService,
    VersionManagerService,
    {provide: COMMANDER_PROGRAM, useValue: new Command()},
    {provide: LOGGER, useValue: console}
  ],
})
export class AppModule implements OnApplicationBootstrap {

  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
  ) {
  }

  onApplicationBootstrap = async () => {

    const cfg = {version: '5.0.0-beta2'};

    if (!cfg.version) {
      const [latestVersion] = await this.versionManager.search(['latest']).toPromise()
      cfg.version = latestVersion.version
    }

    if (!this.versionManager.isInstalled(cfg.version)) {
      if (!await this.versionManager.download(cfg.version)) {
        return
      }
    }

    this.program.parse(process.argv)

  };

}
