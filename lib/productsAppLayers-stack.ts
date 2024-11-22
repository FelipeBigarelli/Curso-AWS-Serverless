import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm'; // guardar parâmetros na aws

export class ProductsAppLayersStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsLayers = new lambda.LayerVersion(this, 'ProductsLayer', {
      code: lambda.Code.fromAsset('lambda/products/layers/productsLayer'), // caminho que vai estar o código
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      layerVersionName: 'ProductsLayer',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    new ssm.StringParameter(this, 'ProductsLayerVersionArn', { // guardar a info do parametro p outras funções utilizarem esse layer
      parameterName: 'ProductsLayerVersionArn',
      stringValue: productsLayers.layerVersionArn
    }) 

    const productEventsLayer = new lambda.LayerVersion(this, 'ProductEventsLayer', {
      code: lambda.Code.fromAsset('lambda/products/layers/productEventsLayer'), // caminho que vai estar o código
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      layerVersionName: 'ProductEventsLayer',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    new ssm.StringParameter(this, 'ProductEventsLayerVersionArn', { // guardar a info do parametro p outras funções utilizarem esse layer
      parameterName: 'ProductEventsLayerVersionArn',
      stringValue: productEventsLayer.layerVersionArn
    }) 
  }
}