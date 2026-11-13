export interface EnvironmentVariables {
  NODE_ENV?: string;
  PORT?: string;
  MONGODB_URI?: string;
  MONGO_URI?: string;
  MONGODB_DB_NAME?: string;
  MONGODB_DNS_SERVERS?: string;
  INSTITUTE_NAME?: string;
  APP_NAME?: string;
  MAIL_TRANSPORT?: string;
  MAIL_HOST?: string;
  MAIL_PORT?: string;
  MAIL_SECURE?: string;
  MAIL_USER?: string;
  MAIL_PASS?: string;
  MAIL_FROM?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  MAIL_DIRECTORY?: string;
  CORS_ORIGINS?: string;
  OBSERVE_APP_KEY?: string;
  OBSERVE_APP_SECRET?: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const environment: EnvironmentVariables = { ...config };

  if (!environment.PORT) {
    environment.PORT = '4000';
  }

  const portNum = Number(environment.PORT);
  if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
    throw new Error('PORT must be a valid TCP port number');
  }

  const mongoUri = environment.MONGODB_URI || environment.MONGO_URI;
  if (!mongoUri) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI (or MONGO_URI) is required in production');
    }
    environment.MONGODB_URI = 'mongodb://localhost:27017/eduflow';
  } else if (!environment.MONGODB_URI) {
    environment.MONGODB_URI = mongoUri;
  }

  if (!environment.INSTITUTE_NAME) {
    environment.INSTITUTE_NAME = 'Bright Future Institute';
  }

  if (!environment.APP_NAME) {
    environment.APP_NAME = 'EduFlow';
  }

  if (!environment.MAIL_PORT) {
    environment.MAIL_PORT = '587';
  }

  const mailPort = Number(environment.MAIL_PORT);
  if (!Number.isInteger(mailPort) || mailPort <= 0 || mailPort > 65535) {
    throw new Error('MAIL_PORT must be a valid TCP port number');
  }

  if (!environment.MAIL_FROM) {
    environment.MAIL_FROM = `${environment.INSTITUTE_NAME} <no-reply@eduflow.lk>`;
  }

  if (environment.MAIL_TRANSPORT === 'smtp' && !environment.MAIL_HOST) {
    throw new Error('MAIL_HOST is required when MAIL_TRANSPORT is "smtp"');
  }

  return environment;
}
