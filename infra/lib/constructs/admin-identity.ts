import { Duration, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  FeaturePlan,
  ManagedLoginVersion,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

import { resourceName, stageSettings, type Stage } from '../config.ts';

// group membership is the authorisation, not the sign-in: the api handler rejects a token
// without it, so a second admin later is a membership change rather than a code change
export const ADMIN_GROUP = 'admins';

export interface AdminIdentityProps {
  stage: Stage;
  // every origin the hosted UI is allowed to hand a code back to
  siteOrigins: string[];
}

// the Cognito side of admin access: one pool, one browser client, the hosted sign-in pages
export class AdminIdentity extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly domain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: AdminIdentityProps) {
    super(scope, id);
    const settings = stageSettings(props.stage);

    this.userPool = new UserPool(this, 'Pool', {
      userPoolName: resourceName(props.stage, 'admins'),
      // my account is created by hand (docs/runbooks/admin-access.md). Self-service sign-up on
      // an admin pool would hand the Review tab to anyone who found the domain.
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      signInCaseSensitive: false,
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: {
        minLength: 16,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      // TOTP only: SMS is the weaker factor and the only one billed per message. CloudFormation
      // takes ON without an SmsConfiguration, where the create-user-pool API call would not.
      mfa: Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      // pinned: new pools otherwise land on the billable Essentials tier. Passkeys and threat
      // protection sit above Lite and charge per monthly active user, and there is one of me.
      featurePlan: FeaturePlan.LITE,
      removalPolicy: settings.removalPolicy,
    });

    this.userPool.addGroup('AdminGroup', {
      groupName: ADMIN_GROUP,
      description: 'May read and decide candidates through the admin API',
      precedence: 0,
    });

    this.domain = new UserPoolDomain(this, 'Domain', {
      userPool: this.userPool,
      cognitoDomain: { domainPrefix: `latentdata-admin-${props.stage}` },
      // v1 on purpose. Managed login v2 exists for the branding designer and passkeys, passkeys
      // need a paid tier, and v2 serves a broken page until a branding style is created out of
      // band — a failure nothing in this repo would catch.
      managedLoginVersion: ManagedLoginVersion.CLASSIC_HOSTED_UI,
    });

    this.client = new UserPoolClient(this, 'Client', {
      userPool: this.userPool,
      userPoolClientName: resourceName(props.stage, 'admin-ui'),
      // a browser cannot keep a secret, and a secret set here breaks the token exchange outright
      generateSecret: false,
      // refresh only. With authFlows absent CDK leaves ExplicitAuthFlows unset and
      // CloudFormation falls back to allowing SRP and custom auth; one false flag is enough to
      // make CDK emit the list, which then holds nothing but ALLOW_REFRESH_TOKEN_AUTH.
      authFlows: { userSrp: false },
      oAuth: {
        // spelt out because CDK's default also turns on the implicit grant, which returns tokens
        // in the URL fragment. Authorization code with PKCE is the only flow this client offers.
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        // CDK's default scope set includes aws.cognito.signin.user.admin, which would let a
        // leaked token edit its own user in Cognito. The API wants identity and nothing else.
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL],
        callbackUrls: props.siteOrigins.map((origin) => `${origin}/admin/callback`),
        logoutUrls: props.siteOrigins.map((origin) => `${origin}/`),
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      idTokenValidity: Duration.minutes(30),
      accessTokenValidity: Duration.minutes(30),
      // a working day, so a stolen refresh token dies overnight and MFA runs daily. Rotation
      // stays off: setting a grace period makes CDK drop ALLOW_REFRESH_TOKEN_AUTH entirely.
      refreshTokenValidity: Duration.hours(8),
    });
  }

  // what the API Gateway authorizer fetches the signing keys from
  get issuerUrl(): string {
    return `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`;
  }

  get hostedUiUrl(): string {
    return `https://${this.domain.domainName}.auth.${Stack.of(this).region}.amazoncognito.com`;
  }
}
