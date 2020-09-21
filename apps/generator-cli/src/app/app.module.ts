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

    let selectedVersion = this.versionManager.getSelectedVersion()

    if (!selectedVersion) {
      const [{version}] = await this.versionManager.search(['latest']).toPromise()
      await this.versionManager.setSelectedVersion(version)
      selectedVersion = version
    }

    await this.versionManager.downloadIfNeeded(selectedVersion)
    this.program.parse(process.argv)

  };

}
