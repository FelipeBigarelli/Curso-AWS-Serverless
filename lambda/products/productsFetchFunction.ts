import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { DynamoDB } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';

import { ProductRepository } from "/opt/nodejs/productsLayer";

AWSXRay.captureAWS(require("aws-sdk")); // tudo que fizer dentro da função lambda, o xray vai capturar e medir o tempo nas operações do sdk (acessar tabela, tópicos..)

const productsDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler( // Nome handler igual o da Stack
  event: APIGatewayProxyEvent, 
  context: Context // Infos de quando e como a função está sendo invocada
): Promise<APIGatewayProxyResult> {
  
  const lambdaRequestId = context.awsRequestId;
  const apiRequestId = event.requestContext.requestId;

  console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`);

  const method = event.httpMethod;

  if (event.resource === '/products') {
    if (method === 'GET') {
      console.log('GET/ products');

      const products = await productRepository.getAllProducts();
      
      return {
        statusCode: 200,
        body: JSON.stringify(products)
      }
    }

  } 
  // BUSCAR PRODUTO PELO ID
  else if (event.resource === '/products/{id}') {
    const productId = event.pathParameters!.id as string;
    console.log(`GET /products/${productId}`);
    
    try {
      const product = await productRepository.getProductById(productId);

      return {
        statusCode: 200,
        body: JSON.stringify(product)
      }
    } catch (error) {
      console.error((<Error>error).message);

      return {
        statusCode: 404,
        body: (<Error>error).message
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: 'Bad request'
    })
  }
}