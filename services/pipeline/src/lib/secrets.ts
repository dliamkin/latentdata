import { getParameter } from '@aws-lambda-powertools/parameters/ssm';

const CACHE_SECONDS = 300;

// SecureString parameters, read on first use and cached by Powertools; never env vars
export async function readParameter(name: string): Promise<string> {
  const value = await getParameter(name, { decrypt: true, maxAge: CACHE_SECONDS });
  if (value === undefined || value === '') throw new Error(`SSM parameter ${name} is empty`);
  return value;
}

export interface GitHubAppCredentials {
  appId: string;
  installationId: string;
  privateKey: string;
}

export async function readGitHubAppCredentials(ssmPrefix: string): Promise<GitHubAppCredentials> {
  const [appId, installationId, privateKey] = await Promise.all([
    readParameter(`${ssmPrefix}/github/appId`),
    readParameter(`${ssmPrefix}/github/appInstallationId`),
    readParameter(`${ssmPrefix}/github/appPrivateKey`),
  ]);
  return { appId, installationId, privateKey };
}
