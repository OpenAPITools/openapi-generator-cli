import { HttpModule, Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { AxiosProxyConfig } from 'axios';
import { Command } from 'commander';
import * as url from 'url';

import { COMMANDER_PROGRAM, LOGGER } from './constants';
import { VersionManagerController } from './controllers/version-manager.controller';
import { ConfigService, GeneratorService, PassTroughService, UIService, VersionManagerService } from './services';

let proxyConfig: AxiosProxyConfig;
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (proxyUrl) {
  const proxy = url.parse(proxyUrl);
  const proxyAuth = proxy.auth && proxy.auth.split(':');

  proxyConfig = {
    host: proxy.hostname,
    port: parseInt(proxy.port, 10),
    auth: proxyAuth && { username: proxyAuth[0], password: proxyAuth[1] },
    protocol: proxy.protocol.replace(':', '')
  };
}

@Module({
  imports: [HttpModule.register({proxy: proxyConfig})],
  controllers: [
    VersionManagerController
  ],
  providers: [
    UIService,
    ConfigService,
    GeneratorService,
    PassTroughService,
    VersionManagerService,
    {
      provide: COMMANDER_PROGRAM,
      useValue: new Command('openapi-generator-cli').helpOption(false).usage('<command> [<args>]')
    },
    { provide: LOGGER, useValue: console }
  ]
})
export class AppModule implements OnApplicationBootstrap {

  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
    private readonly passTroughService: PassTroughService
  ) {
  }

  onApplicationBootstrap = async () => {

    let selectedVersion = this.versionManager.getSelectedVersion();

    if (!selectedVersion) {
      const [{ version }] = await this.versionManager.search(['latest']).toPromise();
      await this.versionManager.setSelectedVersion(version);
      selectedVersion = version;
    }

    await this.versionManager.downloadIfNeeded(selectedVersion);
    await this.passTroughService.init();
    this.program.parse(process.argv);

  };

}
