import {HttpService, Injectable} from '@nestjs/common';
import {map, switchMap} from 'rxjs/operators';
import {replace} from 'lodash';
import {Observable} from 'rxjs';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as Stream from 'stream';
import * as chalk from 'chalk';
import * as compare from 'compare-versions'

export interface Version {
  version: string
  versionTags: string[]
  releaseDate: Date
  installed: boolean
  downloadLink: string
}

const mvn = {
  repo: 'https://search.maven.org',
  group: 'org.openapitools',
  artifact: 'openapi-generator-cli',
}

@Injectable()
export class VersionManagerService {

  private readonly storage = path.resolve(__dirname, './versions')

  constructor(
    private httpService: HttpService,
  ) {
  }

  getAll(): Observable<Version[]> {
    const queryUrl = `${mvn.repo}/solrsearch/select?q=g:${mvn.group}+AND+a:${mvn.artifact}&core=gav&start=0&rows=200`;

    return this.httpService.get(queryUrl).pipe(
      map(({data}) => data.response.docs),
      map(docs => docs.map((doc) => ({
        version: doc.v,
        versionTags: [
          ...(doc.v.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)?.concat('stable') || []),
          ...(doc.v.match(/(^[0-9]+\.[0-9]+\.[0-9]+)\-(([a-z]+)[0-9]?)$/) || [])
        ],
        releaseDate: new Date(doc.timestamp),
        installed: this.isInstalled(doc.v),
        downloadLink: this.createDownloadLink(doc.v),
      }))),
      map(versions => {
        const latestVersion = this.filterVersionsByTags(versions, ['stable'])
          .sort((l, r) => compare(l.version, r.version)).pop()
        latestVersion.versionTags.push('latest') // works, because it's a reference
        return versions;
      })
    )
  }

  search(tags: string[]) {
    return this.getAll().pipe(map(versions => this.filterVersionsByTags(versions, tags)))
  }

  isInstalled(versionName: string) {
    return fs.existsSync(path.resolve(this.storage, `${versionName}.jar`))
  }

  async install(versionName: string) {
    console.log(chalk.yellow(`Install ${versionName} ...`))
    const downloadLink = this.createDownloadLink(versionName)
    const filePath = path.resolve(this.storage, `${versionName}.jar`)

    try {
      await this.httpService.get<Stream>(downloadLink, {responseType: 'stream'}).pipe(switchMap(res => {
        if (res.status >= 200 && res.status < 300) {

          return new Promise(resolve => {
            const file = fs.createWriteStream(filePath);
            res.data.pipe(file)
            res.data.on('end', resolve);
          })

        }
      })).toPromise()

      console.log(chalk.green(`Installed ${versionName}`))
      return true
    } catch (e) {
      console.log(chalk.red(`Installation failed, because of: "${e.message}"`))
      return false
    }
  }

  async set(version: Version) {
    return version
  }

  private filterVersionsByTags(versions: Version[], tags: string[]) {
    if (tags.length < 1) {
      return versions
    }

    return versions.filter(v => tags.every(tag => {
      return v.versionTags.some(vTag => vTag.indexOf(tag) === 0)
    }))
  }

  private createDownloadLink(versionName: string) {
    const group = replace(mvn.group, '.', '/');
    const artifact = replace(mvn.artifact, '.', '/');
    return `https://repo1.maven.org/maven2/${group}/${artifact}/${versionName}/${artifact}-${versionName}.jar`
  }

}
