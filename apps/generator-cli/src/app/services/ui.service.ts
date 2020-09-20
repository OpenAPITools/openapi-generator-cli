// import ora from 'ora'
import {Injectable} from '@nestjs/common';
import {prompt, Separator} from 'inquirer';

@Injectable()
export class UIService {

  public async table<T>(config: {
    name: string,
    message: string,
    printColNum?: boolean,
    interactive?: boolean,
    rows: Array<{ row: {}, short: string, value: T }>,
  }): Promise<T> {

    const tableRows = config.rows.map(({row}, index: number) => {
      return config.printColNum === false ? row : ({'#': index + 1, ...row});
    })

    const table = require('console.table').getTable(tableRows)

    if (config.interactive === false) {
      console.log(table)
      return
    }

    const [header, separator, ...rows] = table.trim().split('\n')
    return this.list({
      name: config.name,
      message: config.message,
      choices: [
        new Separator(header),
        new Separator(separator),
        ...rows.map((name: string, index: number) => ({
          name,
          short: config.rows[index]?.short,
          value: config.rows[index]?.value,
        })),
        new Separator(separator),
        new Separator(' '.repeat(separator.length)),
      ],
    })
  }

  public async list<T>(config: {
    name: string,
    message: string,
    choices: Array<{ name: {}, short?: string, value: T }>,
  }): Promise<T> {

    const separatorCount = config
      .choices
      .filter((c) => c instanceof Separator)
      .length

    const res = await prompt([{
      type: 'list',
      name: config.name,
      pageSize: process.stdout.rows - separatorCount - 1,
      message: config.message,
      choices: config.choices,
    }])

    return res[config.name] as T

  }

}
