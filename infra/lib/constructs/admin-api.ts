import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { CfnStage, CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { resourceName, stageSettings, type Stage } from '../config.ts';
import type { AdminIdentity } from './admin-identity.ts';

export interface AdminApiProps {
  stage: Stage;
  handler: IFunction;
  identity: AdminIdentity;
  // the site origins allowed to call the API from a browser
  siteOrigins: string[];
}

// one HTTP API in front of the api Lambda. Everything under /admin carries the JWT authorizer,
// so an unauthenticated request is rejected by API Gateway and never reaches my code.
export class AdminApi extends Construct {
  readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: AdminApiProps) {
    super(scope, id);
    const settings = stageSettings(props.stage);

    this.api = new HttpApi(this, 'Api', {
      apiName: resourceName(props.stage, 'admin-api'),
      corsPreflight: {
        allowOrigins: props.siteOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        // the token rides in Authorization; no cookies, so allowCredentials stays off
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.hours(1),
      },
    });

    const integration = new HttpLambdaIntegration('ApiIntegration', props.handler);

    // the smoke test in infra-deploy.yml hits this, so it stays open
    this.api.addRoutes({ path: '/health', methods: [HttpMethod.GET], integration });

    const authorizer = new HttpJwtAuthorizer('AdminAuthorizer', props.identity.issuerUrl, {
      authorizerName: resourceName(props.stage, 'admin-jwt'),
      // the ID token's aud is this client. The handler also checks token_use, so an access
      // token — which carries client_id instead of aud — cannot be swapped in.
      jwtAudience: [props.identity.client.userPoolClientId],
    });

    // one list, so a route cannot be added under /admin without the authorizer on it
    const adminRoutes: [HttpMethod, string][] = [
      [HttpMethod.GET, '/admin/candidates'],
      [HttpMethod.POST, '/admin/candidates/{id}/approve'],
      [HttpMethod.POST, '/admin/candidates/{id}/dismiss'],
    ];
    for (const [method, path] of adminRoutes) {
      this.api.addRoutes({ path, methods: [method], integration, authorizer });
    }

    // access logs are the audit trail for admin reads and decisions, and the only record of an
    // authorizer refusal. The $default stage is created for me, so this reaches in and sets it.
    const accessLogs = new LogGroup(this, 'AccessLogs', {
      logGroupName: `/aws/apigateway/${resourceName(props.stage, 'admin-api')}`,
      retention: settings.logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const defaultStage = this.api.defaultStage?.node.defaultChild as CfnStage;
    defaultStage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        method: '$context.httpMethod',
        route: '$context.routeKey',
        status: '$context.status',
        subject: '$context.authorizer.claims.sub',
        authorizerError: '$context.authorizer.error',
      }),
    };
    // a public endpoint with one legitimate caller has no business serving a flood
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 20,
      throttlingRateLimit: 10,
    };
  }

  get url(): string {
    return this.api.apiEndpoint;
  }
}
