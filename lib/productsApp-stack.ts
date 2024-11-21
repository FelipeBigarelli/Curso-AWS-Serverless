import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { Construct } from 'constructs'; 

export class ProductsAppStack extends cdk.Stack {
  readonly productsFetchHandler: lambdaNodeJS.NodejsFunction;
  readonly productsAdminHandler: lambdaNodeJS.NodejsFunction;
  readonly productsDdb: dynamodb.Table;
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.productsDdb = new dynamodb.Table(this, 'ProductsDdb', {
      tableName: 'products',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1, // Padrão é 5. Mínimo é 1. Define quantas requisições podem receber por segundo
      writeCapacity: 1
    });

    //Products Layer
    const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductsLayerVersionArn');
    const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductsLayerVersionArn', productsLayerArn);

    this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(
      this, // Referencia a Stack aonde ele está
      'ProductsFetchFunction', // Identificação desse recurso dentro da Stack
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: 'ProductsFetchFunction', // Nome da função que aparece no console da AWS
        entry: 'lambda/products/productsFetchFunction.ts',
        handler: 'handler', // Método que vai ser invodado quando a função receber um evento pra executar algo
        memorySize: 512, // Qtd de memória (MB) que quer alocar para a função executar
        timeout: cdk.Duration.seconds(5),
        bundling: { // Como a função no artefato que gera no entry vai ser empacotado
          minify: true, // altera nome de variaveis, tira quebras de linhas, deixando código menor possível
          sourceMap: false // Tira a geração de mapas para fazer debug 
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName
        },
        layers: [productsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      });
    this.productsDdb.grantReadData(this.productsFetchHandler);

    this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'ProductsAdminFunction', 
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        functionName: 'ProductsAdminFunction',
        entry: 'lambda/products/productsAdminFunction.ts',
        handler: 'handler', 
        memorySize: 512, 
        timeout: cdk.Duration.seconds(5),
        bundling: { 
          minify: true, 
          sourceMap: false 
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName
        },
        layers: [productsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
      });
      this.productsDdb.grantWriteData(this.productsAdminHandler);
  }
}