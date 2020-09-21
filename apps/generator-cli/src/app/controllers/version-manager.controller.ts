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

    const {version} = await this.table(true, versions)
    const downloaded = await this.service.isDownloaded(version)
    const isSelected = await this.service.isSelectedVersion(version)
    const choice = (name: string, cb = () => null, color = v => v) => ({name: color(name), value: cb})

    const choices = [choice('exit')]

    if (!downloaded) {
      choices.unshift(choice('download', () => this.service.download(version), chalk.yellow))
    } else if (!isSelected) {
      choices.unshift(choice('remove', () => this.service.remove(version), chalk.red))
    }

    if (!isSelected) {
      choices.unshift(choice('use', () => this.service.setSelectedVersion(version), chalk.green))
    }

    await (await this.ui.list({
      name: 'next',
      message: 'Whats next?',
      choices,
    }))();
  };

  private table = (interactive: boolean, versions: Version[]) => this.ui.table({
    interactive,
    printColNum: false,
    message: 'The following releases are available:',
    name: 'version',
    rows: versions.map(version => {
      const stable = version.versionTags.includes('stable')
      const selected = this.service.isSelectedVersion(version.version)
      const versionTags = version.versionTags.map(t => t === 'latest' ? chalk.green(t) : t)

      return ({
        value: version,
        short: version.version,
        row: {
          '☐': selected ? '☒' : '☐',
          releasedAt: version.releaseDate.toISOString().split('T')[0],
          version: stable ? chalk.yellow(version.version) : chalk.gray(version.version),
          installed: version.installed ? chalk.green('yes') : chalk.red('no'),
          versionTags: versionTags.join(' '),
        },
      });
    }),
  });

}
