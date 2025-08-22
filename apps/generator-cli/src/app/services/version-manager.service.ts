import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { AxiosError } from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import * as Stream from 'stream';
import chalk from 'chalk';
import compare from 'compare-versions';
import { LOGGER } from '../constants';
import { ConfigService } from './config.service';
import * as configSchema from '../../config.schema.json';
import { spawn, spawnSync } from 'child_process';

export interface Version {
  version: string;
  versionTags: string[];
  releaseDate: Date;
  installed: boolean;
  downloadLink: string;
}

const mvn = {
  repo: 'https://search.maven.org',
  groupId: 'org.openapitools',
  artifactId: 'openapi-generator-cli',
};

@Injectable()
export class VersionManagerService {
  private customStorageDir = this.configService.get<string>(
    'generator-cli.storageDir'
  );

  public readonly storage = this.customStorageDir
    ? path.resolve(
        this.configService.cwd,
        this.customStorageDir.replace('~', os.homedir())
      )
    : path.resolve(__dirname, './versions');

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    private httpService: HttpService,
    private configService: ConfigService
  ) {
    // pre-process intsalled in versions
    this.versions.forEach( (item) => {
      item.installed = this.isDownloaded(item.version)
    });
  }

  getObservableVersions(): Observable<Version[]> {
    return of(this.versions);
  }

  getAll(): Observable<Version[]> {
    // bypass querying serach.maven.org and use default versions instead
    if (process.env.OPENAPI_GENERATOR_CLI_SEARCH_URL === 'DEFAULT' ) {
      return this.getObservableVersions();
    }

    const queryUrl = this.replacePlaceholders(
      this.configService.get<string>('generator-cli.repository.queryUrl') ||
        configSchema.properties['generator-cli'].properties.repository.queryUrl
          .default
    );

    return this.httpService.get(queryUrl).pipe(
      map(({ data }) => data.response.docs),
      map((docs) =>
        docs.map((doc) => ({
          version: doc.v,
          versionTags: [
            ...(doc.v.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)?.concat('stable') ||
              []),
            ...(doc.v.match(/(^[0-9]+\.[0-9]+\.[0-9]+)-(([a-z]+)[0-9]?)$/) ||
              []),
          ],
          releaseDate: new Date(doc.timestamp),
          installed: this.isDownloaded(doc.v),
          downloadLink: this.createDownloadLink(doc.v),
        }))
      ),
      map((versions) => {
        const latestVersion = this.filterVersionsByTags(versions, ['stable'])
          .sort((l, r) => compare(l.version, r.version))
          .pop();
        latestVersion.versionTags.push('latest'); // works, because it's a reference
        return versions;
      }),
      catchError((e) => {
        this.logger.log(
          chalk.red(`Unable to query repository, because of: "${e.message}". Return default versions instead.`)
        );
        this.printResponseError(e);
        return this.getObservableVersions();
      })
    );
  }

  search(tags: string[]) {
    return this.getAll().pipe(
      map((versions) => this.filterVersionsByTags(versions, tags))
    );
  }

  isSelectedVersion(versionName: string) {
    return versionName === this.getSelectedVersion();
  }

  getSelectedVersion() {
    return this.configService.get<string>('generator-cli.version');
  }

  getDockerImageName(versionName?: string) {
    return `${this.configService.dockerImageName}:v${
      versionName || this.getSelectedVersion()
    }`;
  }

  async setSelectedVersion(versionName: string) {
    const downloaded = await this.downloadIfNeeded(versionName);
    if (downloaded) {
      this.configService.set('generator-cli.version', versionName);
      this.logger.log(
        chalk.green(`Did set selected version to ${versionName}`)
      );
    }
  }

  async remove(versionName: string) {
    if (this.configService.useDocker) {
      await new Promise<void>((resolve) => {
        spawn('docker', ['rmi', this.getDockerImageName(versionName)], {
          stdio: 'inherit',
          shell: true,
        }).on('exit', () => resolve());
      });
    } else {
      fs.removeSync(this.filePath(versionName));
    }

    this.logger.log(chalk.green(`Removed ${versionName}`));
  }

  async download(versionName: string) {
    this.logger.log(chalk.yellow(`Download ${versionName} ...`));

    if (this.configService.useDocker) {
      await new Promise<void>((resolve) => {
        spawn('docker', ['pull', this.getDockerImageName(versionName)], {
          stdio: 'inherit',
          shell: true,
        }).on('exit', () => resolve());
      });

      this.logger.log(chalk.green(`Downloaded ${versionName}`));
      return;
    }

    const downloadLink = this.createDownloadLink(versionName);
    const filePath = this.filePath(versionName);

    try {
      await this.httpService
        .get<Stream>(downloadLink, { responseType: 'stream' })
        .pipe(
          switchMap(
            (res) =>
              new Promise((resolve) => {
                fs.ensureDirSync(this.storage);
                const temporaryDirectory = fs.mkdtempSync(
                  path.join(os.tmpdir(), 'generator-cli-')
                );
                const temporaryFilePath = path.join(
                  temporaryDirectory,
                  versionName
                );
                const file = fs.createWriteStream(temporaryFilePath);
                res.data.pipe(file);
                file.on('finish', (content) => {
                  fs.moveSync(temporaryFilePath, filePath, { overwrite: true });
                  resolve(content);
                });
              })
          )
        )
        .toPromise();

      if (this.customStorageDir) {
        this.logger.log(
          chalk.green(
            `Downloaded ${versionName} to custom storage location ${this.storage}`
          )
        );
      } else {
        this.logger.log(chalk.green(`Downloaded ${versionName}`));
      }

      return true;
    } catch (e) {
      this.logger.log(chalk.red(`Download failed, because of: "${e.message}"`));
      this.printResponseError(e);

      return false;
    }
  }

  async downloadIfNeeded(versionName: string) {
    return this.isDownloaded(versionName) || this.download(versionName);
  }

  isDownloaded(versionName: string) {
    if (this.configService.useDocker) {
      const { status } = spawnSync('docker', [
        'image',
        'inspect',
        this.getDockerImageName(versionName),
      ]);
      return status === 0;
    }

    return fs.existsSync(path.resolve(this.storage, `${versionName}.jar`));
  }

  private filterVersionsByTags(versions: Version[], tags: string[]) {
    if (tags.length < 1) {
      return versions;
    }

    return versions.filter((v) =>
      tags.every((tag) => {
        return v.versionTags.some((vTag) => vTag.indexOf(tag) === 0);
      })
    );
  }

  private createDownloadLink(versionName: string) {
    return this.replacePlaceholders(
      this.configService.get<string>('generator-cli.repository.downloadUrl') ||
        configSchema.properties['generator-cli'].properties.repository
          .downloadUrl.default,
      { versionName }
    );
  }

  private replacePlaceholders(str: string, additionalPlaceholders = {}) {
    const placeholders = {
      ...additionalPlaceholders,
      groupId: mvn.groupId.replace(/\./g, '/'),
      artifactId: mvn.artifactId.replace(/\./g, '/'),
      'group.id': mvn.groupId,
      'artifact.id': mvn.artifactId,
    };

    for (const [k, v] of Object.entries(placeholders)) {
      str = str.split(`$\{${k}}`).join(v);
    }

    return str;
  }

  private printResponseError(error: AxiosError) {
    try {
      if (error.isAxiosError) {
        this.logger.log(chalk.red('\nResponse:'));
        Object.entries(error.response.headers).forEach((a) =>
          this.logger.log(...a)
        );
        this.logger.log();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error.response.data as any).on('data', (data) =>
          this.logger.log(data.toString('utf8'))
        );
      }
    } catch(e) {
      // simply show the original error if the above code block fails
      this.logger.log('Errors: ', error);
    }
  }

  public filePath(versionName = this.getSelectedVersion()) {
    return path.resolve(this.storage, `${versionName}.jar`);
  }

  versions : Version[] = [
    {
      version: '7.15.0',
      versionTags: [ '7.15.0', 'stable', 'latest' ],
      releaseDate: new Date("2025-08-22T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.15.0/openapi-generator-cli-7.15.0.jar'
    },
    {
      version: '7.14.0',
      versionTags: [ '7.14.0', 'stable' ],
      releaseDate: new Date("2025-06-25T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.14.0/openapi-generator-cli-7.14.0.jar'
    },
    {
      version: '7.13.0',
      versionTags: [ '7.13.0', 'stable' ],
      releaseDate: new Date("2025-04-25T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.13.0/openapi-generator-cli-7.13.0.jar'
    },
    {
      version: '7.12.0',
      versionTags: [ '7.12.0', 'stable' ],
      releaseDate: new Date("2025-02-28T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.12.0/openapi-generator-cli-7.12.0.jar'
    },
    {
      version: '7.11.0',
      versionTags: [ '7.11.0', 'stable' ],
      releaseDate: new Date("2025-01-20T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.11.0/openapi-generator-cli-7.11.0.jar'
    },
    {
      version: '7.10.0',
      versionTags: [ '7.10.0', 'stable' ],
      releaseDate: new Date("2024-11-08T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.10.0/openapi-generator-cli-7.10.0.jar'
    },
    {
      version: '7.9.0',
      versionTags: [ '7.9.0', 'stable' ],
      releaseDate: new Date("2024-10-07T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.9.0/openapi-generator-cli-7.9.0.jar'
    },
    {
      version: '7.8.0',
      versionTags: [ '7.8.0', 'stable' ],
      releaseDate: new Date("2024-08-19T06:24:58.285Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.8.0/openapi-generator-cli-7.8.0.jar'
    },
    {
      version: '7.7.0',
      versionTags: [ '7.7.0', 'stable' ],
      releaseDate: new Date("2024-07-02T08:03:44.452Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.7.0/openapi-generator-cli-7.7.0.jar'
    },
    {
      version: '7.6.0',
      versionTags: [ '7.6.0', 'stable' ],
      releaseDate: new Date("2024-05-20T09:07:21.579Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.6.0/openapi-generator-cli-7.6.0.jar'
    },
    {
      version: '7.5.0',
      versionTags: [ '7.5.0', 'stable' ],
      releaseDate: new Date("2024-04-17T08:42:14.968Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.5.0/openapi-generator-cli-7.5.0.jar'
    },
    {
      version: '7.4.0',
      versionTags: [ '7.4.0', 'stable' ],
      releaseDate: new Date("2024-03-11T02:28:09.325Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.4.0/openapi-generator-cli-7.4.0.jar'
    },
    {
      version: '7.3.0',
      versionTags: [ '7.3.0', 'stable' ],
      releaseDate: new Date("2024-02-08T07:39:15.042Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.3.0/openapi-generator-cli-7.3.0.jar'
    },
    {
      version: '7.2.0',
      versionTags: [ '7.2.0', 'stable' ],
      releaseDate: new Date("2023-12-22T07:12:33.120Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.2.0/openapi-generator-cli-7.2.0.jar'
    },
    {
      version: '7.1.0',
      versionTags: [ '7.1.0', 'stable' ],
      releaseDate: new Date("2023-11-13T09:44:25.982Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.1.0/openapi-generator-cli-7.1.0.jar'
    },
    {
      version: '7.0.1',
      versionTags: [ '7.0.1', 'stable' ],
      releaseDate: new Date("2023-09-18T09:09:18.699Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.0.1/openapi-generator-cli-7.0.1.jar'
    },
    {
      version: '7.0.0',
      versionTags: [ '7.0.0', 'stable' ],
      releaseDate: new Date("2023-08-25T07:21:58.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.0.0/openapi-generator-cli-7.0.0.jar'
    },
    {
      version: '7.0.0-beta',
      versionTags: [ '7.0.0-beta', '7.0.0', 'beta', 'beta' ],
      releaseDate: new Date("2023-07-06T08:20:49.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.0.0-beta/openapi-generator-cli-7.0.0-beta.jar'
    },
    {
      version: '6.6.0',
      versionTags: [ '6.6.0', 'stable' ],
      releaseDate: new Date("2023-05-11T02:17:01.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.6.0/openapi-generator-cli-6.6.0.jar'
    },
    {
      version: '6.5.0',
      versionTags: [ '6.5.0', 'stable' ],
      releaseDate: new Date("2023-04-01T07:18:53.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.5.0/openapi-generator-cli-6.5.0.jar'
    },
    {
      version: '6.4.0',
      versionTags: [ '6.4.0', 'stable' ],
      releaseDate: new Date("2023-02-19T11:09:30.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.4.0/openapi-generator-cli-6.4.0.jar'
    },
    {
      version: '6.3.0',
      versionTags: [ '6.3.0', 'stable' ],
      releaseDate: new Date("2023-02-01T13:08:43.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.3.0/openapi-generator-cli-6.3.0.jar'
    },
    {
      version: '6.2.1',
      versionTags: [ '6.2.1', 'stable' ],
      releaseDate: new Date("2022-11-01T09:44:24.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.2.1/openapi-generator-cli-6.2.1.jar'
    },
    {
      version: '6.2.0',
      versionTags: [ '6.2.0', 'stable' ],
      releaseDate: new Date("2022-09-24T14:10:07.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.2.0/openapi-generator-cli-6.2.0.jar'
    },
    {
      version: '6.1.0',
      versionTags: [ '6.1.0', 'stable' ],
      releaseDate: new Date("2022-09-11T09:46:14.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.1.0/openapi-generator-cli-6.1.0.jar'
    },
    {
      version: '6.0.1',
      versionTags: [ '6.0.1', 'stable' ],
      releaseDate: new Date("2022-07-03T16:24:08.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.0.1/openapi-generator-cli-6.0.1.jar'
    },
    {
      version: '6.0.0',
      versionTags: [ '6.0.0', 'stable' ],
      releaseDate: new Date("2022-05-26T02:56:46.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.0.0/openapi-generator-cli-6.0.0.jar'
    },
    {
      version: '6.0.0-beta',
      versionTags: [ '6.0.0-beta', '6.0.0', 'beta', 'beta' ],
      releaseDate: new Date("2022-04-04T03:01:01.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/6.0.0-beta/openapi-generator-cli-6.0.0-beta.jar'
    },
    {
      version: '5.4.0',
      versionTags: [ '5.4.0', 'stable' ],
      releaseDate: new Date("2022-01-31T05:34:05.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.4.0/openapi-generator-cli-5.4.0.jar'
    },
    {
      version: '5.3.1',
      versionTags: [ '5.3.1', 'stable' ],
      releaseDate: new Date("2021-12-21T10:49:56.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.3.1/openapi-generator-cli-5.3.1.jar'
    },
    {
      version: '5.3.0',
      versionTags: [ '5.3.0', 'stable' ],
      releaseDate: new Date("2021-10-24T14:53:19.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.3.0/openapi-generator-cli-5.3.0.jar'
    },
    {
      version: '5.2.1',
      versionTags: [ '5.2.1', 'stable' ],
      releaseDate: new Date("2021-08-16T12:55:33.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.2.1/openapi-generator-cli-5.2.1.jar'
    },
    {
      version: '5.2.0',
      versionTags: [ '5.2.0', 'stable' ],
      releaseDate: new Date("2021-07-09T09:44:53.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.2.0/openapi-generator-cli-5.2.0.jar'
    },
    {
      version: '5.1.1',
      versionTags: [ '5.1.1', 'stable' ],
      releaseDate: new Date("2021-05-07T02:35:53.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.1.1/openapi-generator-cli-5.1.1.jar'
    },
    {
      version: '5.1.0',
      versionTags: [ '5.1.0', 'stable' ],
      releaseDate: new Date("2021-03-20T09:21:09.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.1.0/openapi-generator-cli-5.1.0.jar'
    },
    {
      version: '5.0.1',
      versionTags: [ '5.0.1', 'stable' ],
      releaseDate: new Date("2021-02-06T09:16:59.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.1/openapi-generator-cli-5.0.1.jar'
    },
    {
      version: '5.0.0',
      versionTags: [ '5.0.0', 'stable' ],
      releaseDate: new Date("2020-12-21T05:42:21.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.0/openapi-generator-cli-5.0.0.jar'
    },
    {
      version: '5.0.0-beta3',
      versionTags: [ '5.0.0-beta3', '5.0.0', 'beta3', 'beta' ],
      releaseDate: new Date("2020-11-20T08:54:14.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.0-beta3/openapi-generator-cli-5.0.0-beta3.jar'
    },
    {
      version: '5.0.0-beta2',
      versionTags: [ '5.0.0-beta2', '5.0.0', 'beta2', 'beta' ],
      releaseDate: new Date("2020-09-04T05:38:38.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.0-beta2/openapi-generator-cli-5.0.0-beta2.jar'
    },
    {
      version: '5.0.0-beta',
      versionTags: [ '5.0.0-beta', '5.0.0', 'beta', 'beta' ],
      releaseDate: new Date("2020-06-29T15:49:53.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/5.0.0-beta/openapi-generator-cli-5.0.0-beta.jar'
    },
    {
      version: '4.3.1',
      versionTags: [ '4.3.1', 'stable' ],
      releaseDate: new Date("2020-05-06T09:43:40.000Z"),
      installed: true,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.3.1/openapi-generator-cli-4.3.1.jar'
    },
    {
      version: '4.3.0',
      versionTags: [ '4.3.0', 'stable' ],
      releaseDate: new Date("2020-03-27T04:03:55.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.3.0/openapi-generator-cli-4.3.0.jar'
    },
    {
      version: '4.2.3',
      versionTags: [ '4.2.3', 'stable' ],
      releaseDate: new Date("2020-01-31T08:56:15.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.2.3/openapi-generator-cli-4.2.3.jar'
    },
    {
      version: '4.2.2',
      versionTags: [ '4.2.2', 'stable' ],
      releaseDate: new Date("2019-12-02T05:46:08.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.2.2/openapi-generator-cli-4.2.2.jar'
    },
    {
      version: '4.2.1',
      versionTags: [ '4.2.1', 'stable' ],
      releaseDate: new Date("2019-11-15T08:50:59.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.2.1/openapi-generator-cli-4.2.1.jar'
    },
    {
      version: '4.2.0',
      versionTags: [ '4.2.0', 'stable' ],
      releaseDate: new Date("2019-10-31T04:09:29.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.2.0/openapi-generator-cli-4.2.0.jar'
    },
    {
      version: '4.1.3',
      versionTags: [ '4.1.3', 'stable' ],
      releaseDate: new Date("2019-10-04T06:18:41.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.1.3/openapi-generator-cli-4.1.3.jar'
    },
    {
      version: '4.1.2',
      versionTags: [ '4.1.2', 'stable' ],
      releaseDate: new Date("2019-09-11T11:10:43.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.1.2/openapi-generator-cli-4.1.2.jar'
    },
    {
      version: '4.1.1',
      versionTags: [ '4.1.1', 'stable' ],
      releaseDate: new Date("2019-08-26T08:32:17.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.1.1/openapi-generator-cli-4.1.1.jar'
    },
    {
      version: '4.1.0',
      versionTags: [ '4.1.0', 'stable' ],
      releaseDate: new Date("2019-08-09T15:01:49.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.1.0/openapi-generator-cli-4.1.0.jar'
    },
    {
      version: '4.0.3',
      versionTags: [ '4.0.3', 'stable' ],
      releaseDate: new Date("2019-07-09T13:19:51.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.3/openapi-generator-cli-4.0.3.jar'
    },
    {
      version: '4.0.2',
      versionTags: [ '4.0.2', 'stable' ],
      releaseDate: new Date("2019-06-20T05:07:08.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.2/openapi-generator-cli-4.0.2.jar'
    },
    {
      version: '4.0.1',
      versionTags: [ '4.0.1', 'stable' ],
      releaseDate: new Date("2019-05-31T16:12:03.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.1/openapi-generator-cli-4.0.1.jar'
    },
    {
      version: '4.0.0',
      versionTags: [ '4.0.0', 'stable' ],
      releaseDate: new Date("2019-05-13T13:27:43.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.0/openapi-generator-cli-4.0.0.jar'
    },
    {
      version: '4.0.0-beta3',
      versionTags: [ '4.0.0-beta3', '4.0.0', 'beta3', 'beta' ],
      releaseDate: new Date("2019-04-04T13:22:16.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.0-beta3/openapi-generator-cli-4.0.0-beta3.jar'
    },
    {
      version: '4.0.0-beta2',
      versionTags: [ '4.0.0-beta2', '4.0.0', 'beta2', 'beta' ],
      releaseDate: new Date("2019-01-31T23:40:38.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.0-beta2/openapi-generator-cli-4.0.0-beta2.jar'
    },
    {
      version: '4.0.0-beta',
      versionTags: [ '4.0.0-beta', '4.0.0', 'beta', 'beta' ],
      releaseDate: new Date("2018-12-31T09:43:08.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/4.0.0-beta/openapi-generator-cli-4.0.0-beta.jar'
    },
    {
      version: '3.3.4',
      versionTags: [ '3.3.4', 'stable' ],
      releaseDate: new Date("2018-11-30T17:36:10.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.3.4/openapi-generator-cli-3.3.4.jar'
    },
    {
      version: '3.3.3',
      versionTags: [ '3.3.3', 'stable' ],
      releaseDate: new Date("2018-11-15T03:52:20.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.3.3/openapi-generator-cli-3.3.3.jar'
    },
    {
      version: '3.3.2',
      versionTags: [ '3.3.2', 'stable' ],
      releaseDate: new Date("2018-10-31T13:22:25.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.3.2/openapi-generator-cli-3.3.2.jar'
    },
    {
      version: '3.3.1',
      versionTags: [ '3.3.1', 'stable' ],
      releaseDate: new Date("2018-10-15T15:55:02.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.3.1/openapi-generator-cli-3.3.1.jar'
    },
    {
      version: '3.3.0',
      versionTags: [ '3.3.0', 'stable' ],
      releaseDate: new Date("2018-10-01T16:35:32.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.3.0/openapi-generator-cli-3.3.0.jar'
    },
    {
      version: '3.2.3',
      versionTags: [ '3.2.3', 'stable' ],
      releaseDate: new Date("2018-08-30T11:39:38.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.2.3/openapi-generator-cli-3.2.3.jar'
    },
    {
      version: '3.2.2',
      versionTags: [ '3.2.2', 'stable' ],
      releaseDate: new Date("2018-08-22T09:17:07.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.2.2/openapi-generator-cli-3.2.2.jar'
    },
    {
      version: '3.2.1',
      versionTags: [ '3.2.1', 'stable' ],
      releaseDate: new Date("2018-08-14T10:20:10.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.2.1/openapi-generator-cli-3.2.1.jar'
    },
    {
      version: '3.2.0',
      versionTags: [ '3.2.0', 'stable' ],
      releaseDate: new Date("2018-08-06T14:35:21.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.2.0/openapi-generator-cli-3.2.0.jar'
    },
    {
      version: '3.1.2',
      versionTags: [ '3.1.2', 'stable' ],
      releaseDate: new Date("2018-07-25T16:40:54.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.1.2/openapi-generator-cli-3.1.2.jar'
    },
    {
      version: '3.1.1',
      versionTags: [ '3.1.1', 'stable' ],
      releaseDate: new Date("2018-07-18T08:02:30.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.1.1/openapi-generator-cli-3.1.1.jar'
    },
    {
      version: '3.1.0',
      versionTags: [ '3.1.0', 'stable' ],
      releaseDate: new Date("2018-07-06T16:06:08.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.1.0/openapi-generator-cli-3.1.0.jar'
    },
    {
      version: '3.0.3',
      versionTags: [ '3.0.3', 'stable' ],
      releaseDate: new Date("2018-06-27T14:14:10.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.0.3/openapi-generator-cli-3.0.3.jar'
    },
    {
      version: '3.0.2',
      versionTags: [ '3.0.2', 'stable' ],
      releaseDate: new Date("2018-06-18T06:09:22.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.0.2/openapi-generator-cli-3.0.2.jar'
    },
    {
      version: '3.0.1',
      versionTags: [ '3.0.1', 'stable' ],
      releaseDate: new Date("2018-06-11T16:20:09.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.0.1/openapi-generator-cli-3.0.1.jar'
    },
    {
      version: '3.0.0',
      versionTags: [ '3.0.0', 'stable' ],
      releaseDate: new Date("2018-06-01T10:33:24.000Z"),
      installed: false,
      downloadLink: 'https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/3.0.0/openapi-generator-cli-3.0.0.jar'
    }
  ];
}
