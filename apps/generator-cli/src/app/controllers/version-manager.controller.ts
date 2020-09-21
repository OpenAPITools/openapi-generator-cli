import {Controller, Inject} from '@nestjs/common';
import {COMMANDER_PROGRAM} from '../constants';
import {Command} from 'commander';
import * as chalk from 'chalk';

import {UIService, Version, VersionManagerService} from '../services';

@Controller()
export class VersionManagerController {

  private readonly mainCommand = this.program
    .command('version-manager')
    .alias('vm')

  private readonly listCommand = this.mainCommand
    .command('list [versionTags...]')
    .description('lists all published versions')
    .alias('li')
    .option('-j, --json', 'print as json', false)
    .action(tags => this.list(tags))

  private readonly useCommand = this.mainCommand
    .command('use [versionTags...]')
    .description('installs a version. If there are several hits, a selection is displayed')
    .action(tags => this.use(tags))

  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly ui: UIService,
    private readonly service: VersionManagerService,
  ) {
  }

  private list = async (versionTags: string[]) => {
    const versions = await this.service.search(versionTags).toPromise()

    if (this.listCommand.opts().json) {
      console.log(JSON.stringify(versions, null, 2))
      return
    }

    if (versions.length === 1) {
      await this.service.download(versions[0].version)
    } else if (versions.length > 1) {
      const version = await this.table(true, versions)
      const installed = await this.service.isDownloaded(version.version)
      const inUse = await this.service.isSelectedVersion(version.version)

      const choices = [{
        name: 'exit',
        value: () => null,
      }]

      if (!installed) {
        choices.unshift({
          name: chalk.yellow('download'),
          value: () => this.service.download(version.version),
        })
      } else if (!inUse) {
        choices.unshift({
          name: chalk.red('delete'),
          value: () => this.service.delete(version.version),
        })
      }

      if (!inUse) {
        choices.unshift({
          name: chalk.green('use'),
          value: () => null,//this.service.use(version.version),
        })
      }

      await (await this.ui.list({
        name: 'next',
        message: 'Whats next?',
        choices,
      }))();
    } else {
      throw new Error('No installation candidate found')
    }
  };

  private use = async (versionTags: string[]) => {
    const versions = await this.service.search(versionTags).toPromise()

    const success = (v: Version) => console.log(`Set version "${v.version}"`)

    if (versions.length === 1) {
      // success(await this.service.set(versions[0]))
    } else if (versions.length > 1) {
      const version = await this.table(true, versions)
      // success(await this.service.set(version))
    } else {
      throw new Error('No installation candidate found')
    }
  };

  private table = (interactive: boolean, versions: Version[]) => this.ui.table({
    interactive,
    printColNum: false,
    message: 'The following releases are available:',
    name: 'version',
    rows: versions.map(version => {
      const stable = version.versionTags.includes('stable')
      const selected = version.version === '4.3.0'
      const versionTags = version.versionTags.map(t => t === 'latest' ? chalk.green(t) : t)

      return ({
        value: version,
        short: version.version,
        row: {
          '☐': selected ? '☒' : '☐',
          version: stable ? chalk.yellow(version.version) : chalk.gray(version.version),
          installed: version.installed ? chalk.green('yes') : chalk.red('no'),
          versionTags: versionTags.join(' '),
          releaseDate: version.releaseDate.toISOString().replace('T', ' '),
        },
      });
    }),
  });

}
