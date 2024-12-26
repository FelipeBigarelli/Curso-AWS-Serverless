import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { CognitoIdentityServiceProvider, DynamoDB, Lambda } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';

import { ProductEvent, ProductEventType } from "/opt/nodejs/productEventsLayer";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { AuthInfoService } from "/opt/nodejs/authUserInfo";

AWSXRay.captureAWS(require("aws-sdk")); // tudo que fizer dentro da função lambda, o xray vai capturar e medir o tempo nas operações do sdk (acessar tabela, tópicos..)

const productsDdb = process.env.PRODUCTS_DDB!;
const productEventsFuncionName = process.env.PRODUCTS_EVENTS_FUNCTION_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const lambdaClient = new Lambda();
const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider();

const productRepository = new ProductRepository(ddbClient, productsDdb);

const authInfoService = new AuthInfoService(cognitoIdentityServiceProvider);

export async function handler( // Nome handler igual o da Stack
  event: APIGatewayProxyEvent, 
  context: Context // Infos de quando e como a função está sendo invocada
): Promise<APIGatewayProxyResult> {
  
  const lambdaRequestId = context.awsRequestId;
  const apiRequestId = event.requestContext.requestId;

  console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`);

  const userEmail = await authInfoService.getUserInfo(event.requestContext.authorizer);

  if (event.resource === '/products') {
    console.log('POST /products');

    const product = JSON.parse(event.body!) as Product; // produto recebido da requisição
    const productCreated = await productRepository.create(product); // criado produto a partir do recebido da req

    const response = await sendProductEvent(
      productCreated,
      ProductEventType.CREATED,
      userEmail,
      lambdaRequestId
    );
    console.log(response);
    

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
        
        const response = await sendProductEvent(
          productUpdated,
          ProductEventType.UPDATED,
          userEmail,
          lambdaRequestId
        );
        console.log(response);
        
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
        
        const response = await sendProductEvent(
          product,
          ProductEventType.DELETED,
          userEmail,
          lambdaRequestId
        );
        console.log(response);

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

function sendProductEvent(
  product: Product,
  eventType: ProductEventType,
  email: string,
  lambdaRequestId: string
) {
  const event: ProductEvent = {
    email: email,
    eventType: eventType,
    productCode: product.code,
    productId: product.id,
    productPrice: product.price,
    requestId: lambdaRequestId
  }

  return lambdaClient.invoke({
    FunctionName: productEventsFuncionName,
    Payload: JSON.stringify(event), // informação que quer passar
    InvocationType: 'Event' // Event: invocar funções de forma assíncrona
  }).promise();
}