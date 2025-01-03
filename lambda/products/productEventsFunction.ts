import { Callback, Context } from "aws-lambda";
import * as AWSXRay from 'aws-xray-sdk';

import { ProductEvent } from "/opt/nodejs/productEventsLayer";
import { DynamoDB } from "aws-sdk";

AWSXRay.captureAWS(require('aws-sdk'));

const eventsDdb = process.env.EVENTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

export async function handler(event: ProductEvent, context: Context, callback: Callback): Promise<void> {
  // TODO - to be removed
  console.log(event);

  console.log(`Lambda requestId: ${context.awsRequestId}`);
  
  await createEvent(event);

  callback(null, JSON.stringify({
    productEventCreated: true,
    message: 'OK'
  }));
}

function createEvent(event: ProductEvent) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000) + 5 * 60 // 5 min à frente do nosso tempo q aconteceu
  
  return ddbClient.put({
    TableName: eventsDdb,
    Item: {
      pk: `#product_${event.productCode}`,
      sk: `${event.eventType}#${timestamp}`, // Ex: PRODUCT_CREATED#123456
      email: event.email,
      createdAt: timestamp,
      requestId: event.requestId,
      eventType: event.eventType,
      info: {
        productId: event.productId,
        price: event.productPrice
      },
      ttl: ttl
    }
  }).promise();
}