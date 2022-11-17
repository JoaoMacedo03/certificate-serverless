import { APIGatewayProxyHandler } from "aws-lambda"
import { S3 } from 'aws-sdk'
import { compile } from 'handlebars';
import dayjs from 'dayjs'
import { join } from 'path'
import { readFileSync } from 'fs'
import chromium from 'chrome-aws-lambda'

import { document } from "../utils/dynamoDbClient";

interface ICreateCertificate {
  id: string;
  name: string;
  grade: string;
}

interface ITemplate {
  id: string;
  name: string;
  grade: string;
  medal: string;
  date: string;
}

const handleTemplate = async (data: ITemplate) => {
  const filePath = join(process.cwd(), 'src', 'template', 'certificate.hbs')
  const html = readFileSync(filePath, 'utf-8')

  return compile(html)(data)
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id, grade, name } = JSON.parse(event.body) as ICreateCertificate

  const response = await document.query({
    TableName: 'users_certificate',
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: {
      ':id': id
    }
  }).promise()

  const userAlreadyExist = response.Items[0]

  if(!userAlreadyExist) {
    await document.put({
      TableName: 'users_certificate',
      Item: {
        id, name, grade, created_at: new Date().getTime()
      }
    }).promise()
  }
  
  const medalPath = join(process.cwd(), 'src', 'template', 'selo.png')
  const medal = readFileSync(medalPath, 'base64')

  const data: ITemplate = {
    name,
    id,
    grade,
    date: dayjs().format('DD/MM/YYYY'),
    medal
  }

  const content = await handleTemplate(data)

  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath
  })

  const page = await browser.newPage()

  await page.setContent(content)

  const pdf = await page.pdf({
    format: 'a4',
    landscape: true,
    printBackground: true,
    path: process.env.IS_OFFLINE ? './certificate.pdf': null
  })

  await browser.close()

  const s3 = new S3()

  await s3.putObject({
    Bucket: 'certificate-ignite-joao-macedo',
    Key: `${id}.pdf`,
    Body: pdf,
    ContentType: 'application/pdf'
  }).promise()

  return {
    statusCode: 201,
    message: 'Criado com sucesso',
    body: JSON.stringify(response.Items[0]),
  }
}