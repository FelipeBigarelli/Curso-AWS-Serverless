import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { DynamoDB } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';

import { Product, ProductRepository } from "/opt/nodejs/productsLayer";

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

  if (event.resource === '/products') {
    console.log('POST /products');

    const product = JSON.parse(event.body!) as Product; // produto recebido da requisição
    const productCreated = await productRepository.create(product); // criado produto a partir do recebido da req

    return {
      statusCode: 201,
      body: JSON.stringify(productCreated)
    }
  } else if (event.resource === '/products/{id}') {
    const productId = event.pathParameters!.id as string;

    if (event.httpMethod === 'PUT') {
      console.log(`PUT /products/${productId}`);
      const product = JSON.parse(event.body!) as Product;

      try {
        const productUpdated = await productRepository.updateProduct(productId, product);
        
        return {
          statusCode: 200,
          body: JSON.stringify(productUpdated)
        }
      } catch (ConditionalCheckFailedException) {
        return {
          statusCode: 404,
          body: 'Product not found'
        }
      }

    } else if (event.httpMethod === 'DELETE') {
      console.log(`DELETE /products/${productId}`);
      try {
        const product = await productRepository.deleteProduct(productId);
        
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
  }

  return {
    statusCode: 400,
    body: 'Bad request'
  }
}