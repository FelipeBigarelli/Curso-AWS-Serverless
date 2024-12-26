import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';

import { Construct } from 'constructs'; 

interface ProductsAppStackProps extends cdk.StackProps {
  eventsDdb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
  readonly productsFetchHandler: lambdaNodeJS.NodejsFunction;
  readonly productsAdminHandler: lambdaNodeJS.NodejsFunction;
  readonly productsDdb: dynamodb.Table;
  
  constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
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
    /**
     * -> Aqui, o código está obtendo o ARN (Amazon Resource Name) de uma Layer do AWS Lambda a partir do AWS Systems Manager (SSM) Parameter Store.
     
      ssm.StringParameter.valueForStringParameter: Essa função recupera o valor de um parâmetro armazenado no SSM Parameter Store.
      this: Contexto da stack atual (geralmente passada automaticamente no CDK).
      'ProductsLayerVersionArn': Nome do parâmetro no SSM que armazena o ARN da Layer do Lambda.
     */
    const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductsLayerVersionArn');
    const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductsLayerVersionArn', productsLayerArn);
    
    //Product Events Layer
    const productEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductEventsLayerVersionArn');
    const productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductEventsLayerVersionArn', productEventsLayerArn);

    // Auth user info layer
    const authUserInfoLayerArn = ssm.StringParameter.valueForStringParameter(this, 'AuthUserInfoLayerVersionArn');
    const authUserInfoLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'AuthUserInfoLayerVersionArn', authUserInfoLayerArn)

    const dlq = new sqs.Queue(this, 'ProductEventsDlq', {
      queueName: 'product-events-dlq',
      enforceSSL: false,
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      retentionPeriod: cdk.Duration.days(10)
    })
    const productEventsHandler = new lambdaNodeJS.NodejsFunction(
      this, 
      'ProductsEventsFunction', 
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        functionName: 'ProductsEventsFunction', 
        entry: 'lambda/products/productEventsFunction.ts',
        handler: 'handler', 
        memorySize: 512, 
        timeout: cdk.Duration.seconds(2),
        bundling: { 
          minify: true, 
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
         ]
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName
        },
        layers: [productEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        deadLetterQueueEnabled: true,
        deadLetterQueue: dlq,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_333_0
      });
    // props.eventsDdb.grantWriteData(productEventsHandler);

    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#product_*']
        }
      }
    });
    productEventsHandler.addToRolePolicy(eventsDdbPolicy);
    
    this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(
      this, // Referencia a Stack aonde ele está
      'ProductsFetchFunction', // Identificação desse recurso dentro da Stack
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        functionName: 'ProductsFetchFunction', // Nome da função que aparece no console da AWS
        entry: 'lambda/products/productsFetchFunction.ts',
        handler: 'handler', // Método que vai ser invodado quando a função receber um evento pra executar algo
        memorySize: 512, // Qtd de memória (MB) que quer alocar para a função executar
        timeout: cdk.Duration.seconds(5),
        bundling: { // Como a função no artefato que gera no entry vai ser empacotado
          minify: true, // altera nome de variaveis, tira quebras de linhas, deixando código menor possível
          sourceMap: false, // Tira a geração de mapas para fazer debug 
          nodeModules: [
            'aws-xray-sdk-core'
         ]
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName
        },
        layers: [productsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_333_0
      });
    this.productsDdb.grantReadData(this.productsFetchHandler);

    this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'ProductsAdminFunction', 
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        functionName: 'ProductsAdminFunction',
        entry: 'lambda/products/productsAdminFunction.ts',
        handler: 'handler', 
        memorySize: 512, 
        timeout: cdk.Duration.seconds(5),
        bundling: { 
          minify: true, 
          sourceMap: false,
          nodeModules: [
            'aws-xray-sdk-core'
         ]
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName,
          PRODUCTS_EVENTS_FUNCTION_NAME: productEventsHandler.functionName
        },
        layers: [productsLayer, productEventsLayer, authUserInfoLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_333_0
      });
      this.productsDdb.grantWriteData(this.productsAdminHandler);
      productEventsHandler.grantInvoke(this.productsAdminHandler); // garante a funcao productsAdminHandler poder invocar a productEventsHandler
  }
}