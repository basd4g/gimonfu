import fm from 'front-matter'
import { promises as fs } from 'fs'
import path from 'path'
import FileList from './fileList'
import fixLineFeeds from './fixLineFeeds'

export default class FileRequest {
  private entryDir: string
  constructor(entryDir: string) {
    this.entryDir = entryDir
  }
  customUrl2filePath(customUrl: string): string {
    const customPath = customUrl.replace(/\//g, path.sep)
    return path.join( this.entryDir, customPath + '.md')
  }
  private filePath2customUrl(filePath: string): Promise<string> {
    const regex = new RegExp( `^${this.entryDir}${path.sep}(.+)\\.md$` )
    if(! regex.test(filePath) ) {
      return Promise.reject(`Base directory ${this.entryDir} does not contain markdown file path ${filePath}`)
    }
    const customPath = (filePath.match(regex) as string[])[1]
    const customUrl = customPath.replace(new RegExp(path.sep, 'g'), '/')
    return Promise.resolve(customUrl)
  }
  async read(filePath: string): Promise<Article> {
    const fileString: string = await fs.readFile(filePath, 'utf-8').catch( () => {
      console.error(`Failed to read file ${filePath}`)
      return Promise.reject()
    })
    const { attributes, body } = fm( fileString )
    const {title, date, categories, id} = (attributes as any)

    return {
      title: title || 'No Title',
      date: (date instanceof Date) ? date : new Date(),
      categories: categories || [],
      text: fixLineFeeds(body),
      customUrl: await this.filePath2customUrl(filePath),
      id,
      editedDate: (await fs.stat(filePath)).mtime
    }
  }
  async reads(): Promise<Article[]> {
    const filePaths = await (new FileList(this.entryDir).findFiles())
    return Promise.all( filePaths.map( filePath => this.read(filePath) ))
  }

  async write(article: Article): Promise<any> {
    const fileString = this.article2fileString(article)

    if (article.customUrl === null || article.id === null) {
      console.error('customUrl or id is null')
      process.exit(-1)
    }
    const filePath = this.customUrl2filePath(article.customUrl)
    await fs.mkdir(path.dirname(filePath), {recursive: true})
    return fs.writeFile(filePath, fileString, 'utf-8').then(
     () => {
       // ファイルの更新日時をはてなブログの最終変更日時と一致させる
       return fs.utimes(filePath, new Date(), article.editedDate)
    })
  }

  async delete(article: Article) {
    const filePath = this.customUrl2filePath(article.customUrl)
    await fs.unlink(filePath)
  }

  private article2fileString = (article: Article): string => {
    const categoriesString =
      (article.categories.length === 0) ?
      '' : ['\ncategories:', ...article.categories].join('\n  - ')

    return `---\n`
      +    `title: ${article.title}\n`
      +    `date: ${article.date.toISOString()}${categoriesString}\n`
      +    `id: "${article.id}"\n`
      +    `---\n`
      +    `${article.text}`
    // idは数字のみで構成された文字列だが、""をつけて文字列であることを明示して記録
    // 無いと読み取り時に数字として解釈され、その上で値が2つほど前後する。(原因未調査)
  }
}

